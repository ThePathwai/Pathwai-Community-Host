from typing import Optional

from fastapi import APIRouter, Request

from database import db
from ._common import approved_q, clean, lower_set, member_type, viewer

router = APIRouter(tags=["matches"])


def _needs(u):
    return lower_set(u.get("support_needs"), u.get("needs_seeking"), u.get("growing_in"), u.get("goals"))


def _offers(u):
    return lower_set(u.get("expertise"), u.get("strengths"), u.get("services_offered"),
                     u.get("topics_can_advise_on"), u.get("open_to"), u.get("skill_set"))


def _overlap(a: set, b: set):
    hits = []
    for x in a:
        for y in b:
            if x == y or (len(x) > 3 and (x in y or y in x)):
                hits.append(y)
    return sorted(set(hits))


def _cap(items):
    return [x if x[:1].isupper() or x[:1].isdigit() else x[:1].upper() + x[1:] for x in items]


def _shared_interests(me, u):
    mine = lower_set(me.get("interests_hobbies"), me.get("interests"))
    seen, out = set(), []
    for x in list(u.get("interests_hobbies") or []) + list(u.get("interests") or []):
        if isinstance(x, str) and x.strip().lower() in mine and x.strip().lower() not in seen:
            seen.add(x.strip().lower()); out.append(x.strip())
    return out


def _originals(u):
    """lower-case -> the way the member actually wrote it ("HIIT programming", not "hiit programming")."""
    out = {}
    for k in ("support_needs", "needs_seeking", "growing_in", "goals", "expertise", "strengths", "services_offered", "topics_can_advise_on", "open_to", "skill_set"):
        for x in u.get(k) or []:
            if isinstance(x, str) and x.strip():
                out.setdefault(x.strip().lower(), x.strip())
    return out


def explain(me, u):
    """Why `u` is (or isn't) a good person for `me` to meet: structured reasons plus a one-line headline."""
    needs, offers = _needs(me), _offers(me)
    orig = _originals(u)
    give = [orig.get(x, x) for x in _overlap(needs, _offers(u))]       # they can help me
    get = [orig.get(x, x) for x in _overlap(offers, _needs(u))]        # I can help them
    shared = _shared_interests(me, u)
    same_sport = bool(me.get("industry") and me.get("industry") == u.get("industry"))
    score = 3 * len(give) + 2 * len(get) + (1 if same_sport else 0) + min(len(shared), 2)
    reasons = []
    if give:
        reasons.append({"kind": "helps_you", "label": "Can help you with", "items": _cap(give[:4])})
    if get:
        reasons.append({"kind": "you_help", "label": "You can help them with", "items": _cap(get[:4])})
    if shared:
        reasons.append({"kind": "shared", "label": "You both like", "items": shared[:4]})
    if same_sport:
        reasons.append({"kind": "shared", "label": "In common", "items": [u.get("industry")]})
    parts = []
    if give:
        parts.append("Can help you with " + " and ".join(_cap(give[:2])))
    if get:
        parts.append("You can help with " + " and ".join(_cap(get[:2])))
    if shared and len(parts) < 2:
        parts.append("You both like " + " and ".join(shared[:2]))
    if same_sport and len(parts) < 2:
        parts.append(f"Same {u.get('industry')}")
    return {"give": give, "get": get, "shared": shared, "same_sport": same_sport, "score": score, "reasons": reasons, "headline": " · ".join(parts)}


async def compute_people(me, limit=8):
    scored = []
    async for u in db.users.find({"id": {"$ne": me["id"]}, "hidden_from_directory": {"$ne": True}}):
        u = clean(u)
        x = explain(me, u)
        score = x["score"] + (2 if x["score"] and me.get("role") == "mentor" and u.get("role") == "founder" else 0)
        if x["score"]:
            give, get = x["give"], x["get"]
            mt = member_type(u)
            why = []
            if give:
                why.append("You're looking for help with " + ", ".join(give[:2]) + f" — {u.get('name', 'they').split()[0]} offers that")
            if get:
                why.append("You could help them with " + ", ".join(get[:2]))
            if x["same_sport"]:
                why.append(f"Same sport ({u.get('industry')})")
            if x["shared"]:
                why.append("You both like " + ", ".join(x["shared"][:2]))
            kind = "Recommended connection" if mt == "mentor" else ("Alumni connection" if mt == "alumni" else ("Partner / support" if mt == "partner" else "Recommended connection"))
            scored.append({"why": ". ".join(why), "headline": x["headline"], "reasons": x["reasons"], "match_type": kind, "next_action": "Say hi" if mt != "mentor" else "Book a coaching chat",
                           "user": {**{k: u.get(k) for k in ("id", "name", "avatar_url", "role", "title", "company", "industry", "location")}, "member_type": mt},
                           "score": score, "matched_on": give + get, "can_help_you": give, "you_can_help": get, "shared_interests": x["shared"]})
    scored.sort(key=lambda x: -x["score"])
    return scored[:limit]


@router.get("/matches/why/{uid}")
async def why_this_person(uid: str, request: Request, role: Optional[str] = "founder"):
    """The reasons behind a suggestion, for the person's own profile page ("Why we suggested Ben")."""
    me = await viewer(request, role)
    if not me or uid == me["id"]:
        return {"user_id": uid, "reasons": [], "headline": "", "is_match": False}
    u = await db.users.find_one({"id": uid, "hidden_from_directory": {"$ne": True}})
    if not u:
        return {"user_id": uid, "reasons": [], "headline": "", "is_match": False}
    x = explain(me, clean(u))
    return {"user_id": uid, "is_match": x["score"] > 0, "reasons": x["reasons"], "headline": x["headline"],
            "can_help_you": x["give"], "you_can_help": x["get"], "shared_interests": x["shared"]}


@router.get("/matches")
async def matches(request: Request, role: Optional[str] = "founder"):
    me = await viewer(request, role)
    if not me:
        return {"people": [], "events": [], "resources": []}
    needs = _needs(me) | _offers(me)
    events = []
    async for e in db.events.find(approved_q()):
        e = clean(e)
        on = _overlap(needs, lower_set(e.get("tags"), e.get("category")))
        role_hit = me.get("role") in (e.get("recommended_for_roles") or [])
        score = len(on) * 2 + (3 if role_hit else 0)
        if score:
            events.append({**e, "score": score, "matched_on": on + (["role"] if role_hit else [])})
    events.sort(key=lambda x: (-x["score"], x.get("starts_at") or ""))
    resources = []
    async for r in db.resources.find(approved_q()):
        r = clean(r)
        on = _overlap(needs, lower_set(r.get("tags"), r.get("category"), r.get("title", "").split()))
        score = len(on) * 2 + (1 if r.get("is_featured") else 0)
        if on:
            resources.append({**r, "score": score, "matched_on": on})
    resources.sort(key=lambda x: -x["score"])
    for e in events:
        e["why"] = "Matches what you're into: " + ", ".join(e["matched_on"][:3]) if e["matched_on"] else ""
        e["match_type"] = "Recommended event"; e["next_action"] = "RSVP"
    for r in resources:
        r["why"] = "Relevant to: " + ", ".join(r["matched_on"][:3]); r["match_type"] = "Member-to-perk"; r["next_action"] = "View perk"
    people = await compute_people(me, limit=12)
    if me.get("role") == "mentor":
        people = [p for p in people if p["user"].get("role") == "founder"]
    acts = {(a["kind"], a["target_id"]): a["action"] async for a in db.match_actions.find({"user_id": me["id"]})}
    people = [p for p in people if acts.get(("person", p["user"]["id"])) != "dismiss"]
    events = [e for e in events if acts.get(("event", e["id"])) != "dismiss"]
    resources = [r for r in resources if acts.get(("resource", r["id"])) != "dismiss"]
    for p in people:
        p["state"] = acts.get(("person", p["user"]["id"]))
    for e in events:
        e["state"] = acts.get(("event", e["id"]))
    for r in resources:
        r["state"] = acts.get(("resource", r["id"]))
    return {"people": people[:10], "events": events[:8], "resources": resources[:8],
            "profile_hint": "Complete your profile to improve recommendations." if not (_needs(me) or _offers(me)) else None}
