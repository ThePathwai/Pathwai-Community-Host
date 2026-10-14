"""Community audits: real numbers from the active community's own database.

Each audit returns the same plain structure so the admin screen and the PDF render from one source:

    {"kind", "title", "subtitle", "tiles": [{"label","value","note","accent"}],
     "charts": [{"type": "hbar"|"columns"|"donut"|"pairs"|"table", "title", ...}],
     "insights": ["plain-language takeaway", ...]}

Nothing here calls an AI service: the metrics and the takeaways are computed. `ai_summary()` is an optional
extra paragraph that is only attempted when an AI key is configured, and never breaks an audit if it fails.
"""
from __future__ import annotations

import asyncio
import os
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

AUDITS: List[Dict[str, str]] = [
    {"kind": "community_pulse", "title": "Community pulse", "description": "Who joined this month and how the membership is made up.", "user_label": "Run community pulse audit", "icon": "Activity"},
    {"kind": "cohort_progress", "title": "Community progress", "description": "How complete profiles are, and the goals and hurdles members have shared.", "user_label": "Run community progress audit", "icon": "Target"},
    {"kind": "founder_needs", "title": "Where members need help", "description": "What members are asking for, and whether enough people can help.", "user_label": "Run member-needs audit", "icon": "HelpCircle"},
    {"kind": "hiring_signals", "title": "Hiring signals", "description": "Members who are hiring or looking for talent, by function.", "user_label": "Run hiring signals audit", "icon": "Briefcase"},
    {"kind": "upcoming_moments", "title": "Upcoming community moments", "description": "Events on the calendar, how full they are, and where seats are open.", "user_label": "Run upcoming moments audit", "icon": "Calendar"},
    {"kind": "directory_snapshot", "title": "Directory snapshot", "description": "Who is active, who can help, and where members are based.", "user_label": "Run directory snapshot audit", "icon": "Users"},
]
KINDS = [a["kind"] for a in AUDITS]
_BY_KIND = {a["kind"]: a for a in AUDITS}

HIRING_WORDS = [
    ("Marketing", ("marketing",)), ("Sales", ("sales",)), ("Engineering", ("engineer", "developer", "cto")),
    ("Design", ("designer", "design lead")), ("Leadership", ("head of", "vp ", "director", "cto", "coo", "cfo")),
    ("General hiring", ("hire", "hiring", "first hire", "recruit")),
]
PROFILE_FIELDS = ("title", "company", "bio", "location", "skill_set", "goals", "support_needs", "open_to", "avatar_url")


# ---------- small helpers ----------
def _dt(v: Any) -> Optional[datetime]:
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    if not v:
        return None
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _list(v: Any) -> List[str]:
    if not v:
        return []
    if isinstance(v, str):
        return [p.strip() for p in re.split(r"[,;\n]", v) if p.strip()]
    if isinstance(v, (list, tuple, set)):
        out = []
        for x in v:
            if isinstance(x, dict):
                x = x.get("title") or x.get("label") or x.get("name") or ""
            x = str(x).strip()
            if x:
                out.append(x)
        return out
    return []


def _int(v: Any) -> int:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def _pct(n: float, d: float) -> int:
    return int(round(100 * n / d)) if d else 0


def _plural(n: int, one: str, many: Optional[str] = None) -> str:
    return f"{n} {one if n == 1 else (many or one + 's')}"


def _completeness(u: Dict[str, Any]) -> int:
    have = 0
    for f in PROFILE_FIELDS:
        v = u.get(f)
        if (isinstance(v, (list, tuple)) and len(v)) or (isinstance(v, str) and v.strip() and v != "None"):
            have += 1
    return _pct(have, len(PROFILE_FIELDS))


def _top(counter: Counter, n: int) -> List[Dict[str, Any]]:
    return [{"label": k, "value": v} for k, v in counter.most_common(n)]


def _tile(label: str, value: Any, note: str = "", accent: bool = False) -> Dict[str, Any]:
    return {"label": label, "value": str(value), "note": note, "accent": accent}


def _short(s: str, n: int = 34) -> str:
    s = (s or "").strip()
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


# ---------- data load ----------
async def load(db: Any, config: Dict[str, Any]) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    users = await db.users.find({}).to_list(5000)
    events = await db.events.find({}).to_list(2000)
    support = await db.support_requests.find({}).to_list(2000)
    try:
        pending_apps = await db.applications.count_documents({"status": "pending"})
    except Exception:  # noqa: BLE001
        pending_apps = 0
    return {"now": now, "users": users, "events": events, "support": support, "pending_apps": pending_apps, "config": config or {}}


def _type_label(config: Dict[str, Any], role: str) -> str:
    if role == "admin":
        return "Admin"
    mt = (config.get("member_types") or {})
    return mt.get(role) or {"founder": "Member", "member": "Member", "mentor": "Host"}.get(role) or role.title()


def _joined(u: Dict[str, Any]) -> Optional[datetime]:
    return _dt(u.get("joined_at")) or _dt(u.get("created_at"))


# ---------- the six audits ----------
def community_pulse(d: Dict[str, Any]) -> Dict[str, Any]:
    now, users, cfg = d["now"], d["users"], d["config"]
    total = len(users)
    j30 = sum(1 for u in users if (j := _joined(u)) and j >= now - timedelta(days=30))
    j7 = sum(1 for u in users if (j := _joined(u)) and j >= now - timedelta(days=7))
    comp = int(round(sum(_completeness(u) for u in users) / total)) if total else 0
    by_type = Counter(_type_label(cfg, u.get("role") or "member") for u in users)
    # joins per week for the last 8 weeks, oldest -> newest
    weeks = []
    for i in range(7, -1, -1):
        start, end = now - timedelta(days=7 * (i + 1)), now - timedelta(days=7 * i)
        n = sum(1 for u in users if (j := _joined(u)) and start <= j < end)
        weeks.append({"label": end.strftime("%b %-d") if os.name != "nt" else end.strftime("%b %d"), "value": n})
    insights = []
    if total:
        insights.append(f"{_plural(total, 'person', 'people')} belong to this community; {j30} joined in the last 30 days ({_pct(j30, total)}% of the total).")
    best = max(weeks, key=lambda w: w["value"]) if weeks else None
    if best and best["value"] > 0:
        insights.append(f"The busiest recent week for joins was the week ending {best['label']}, with {best['value']} new {'member' if best['value'] == 1 else 'members'}.")
    elif total:
        insights.append("No new members in the last 8 weeks. Share your invite link or open a join campaign to restart growth.")
    if d["pending_apps"]:
        insights.append(f"{_plural(d['pending_apps'], 'application')} {'is' if d['pending_apps'] == 1 else 'are'} waiting for a decision.")
    return {
        "tiles": [_tile("Members", total), _tile("Joined in 30 days", j30, f"{_pct(j30, total)}% of members", True), _tile("Joined in 7 days", j7),
                  _tile("Applications waiting", d["pending_apps"]), _tile("Avg profile complete", f"{comp}%")],
        "charts": [{"type": "columns", "title": "New members per week (last 8 weeks)", "items": weeks},
                   {"type": "donut", "title": "Members by type", "items": _top(by_type, 5)}],
        "insights": insights,
    }


def cohort_progress(d: Dict[str, Any]) -> Dict[str, Any]:
    users = d["users"]
    total = len(users)
    with_goals = [u for u in users if _list(u.get("goals")) or _list(u.get("program_goals"))]
    hurdles = [u for u in users if str(u.get("biggest_hurdle") or "").strip() not in ("", "None")]
    wins = [u for u in users if _list(u.get("achievements"))]
    buckets = Counter()
    for u in users:
        c = _completeness(u)
        buckets["76 to 100%" if c > 75 else "51 to 75%" if c > 50 else "26 to 50%" if c > 25 else "0 to 25%"] += 1
    order = ["76 to 100%", "51 to 75%", "26 to 50%", "0 to 25%"]
    goal_counter = Counter(g.lower() for u in users for g in _list(u.get("goals")))
    casing = {g.lower(): g for u in users for g in _list(u.get("goals"))}
    goals_top = [{"label": _short(casing[k], 44), "value": v} for k, v in goal_counter.most_common(6)]
    charts: List[Dict[str, Any]] = [{"type": "hbar", "title": "Profiles by how complete they are", "items": [{"label": k, "value": buckets.get(k, 0)} for k in order], "unit": "members"}]
    if goals_top:
        charts.append({"type": "hbar", "title": "Most common goals members shared", "items": goals_top, "unit": "members"})
    if hurdles:
        charts.append({"type": "table", "title": "Members naming a hurdle", "columns": ["Member", "Hurdle"],
                       "rows": [[u.get("name", ""), _short(str(u.get("biggest_hurdle")), 70)] for u in hurdles[:8]]})
    low = buckets.get("0 to 25%", 0) + buckets.get("26 to 50%", 0)
    insights = []
    if total:
        insights.append(f"{_pct(len(with_goals), total)}% of members have shared goals ({len(with_goals)} of {total}).")
        if low:
            insights.append(f"{low} {'profile is' if low == 1 else 'profiles are'} under half complete. Matching and introductions work best when profiles are filled in, so a reminder is worth sending.")
    if hurdles:
        insights.append(f"{_plural(len(hurdles), 'member')} named a hurdle they are stuck on, a ready-made list for follow-up.")
    return {
        "tiles": [_tile("Members", total), _tile("Shared goals", len(with_goals), f"{_pct(len(with_goals), total)}% of members", True),
                  _tile("Naming a hurdle", len(hurdles)), _tile("Recent wins logged", len(wins))],
        "charts": charts, "insights": insights,
    }


def _supply_for(need: str, users: List[Dict[str, Any]]) -> int:
    n = need.lower()
    c = 0
    for u in users:
        offers = [s.lower() for s in _list(u.get("expertise")) + _list(u.get("skill_set")) + _list(u.get("offers"))]
        if any(n == o or n in o or o in n for o in offers):
            c += 1
    return c


def founder_needs(d: Dict[str, Any]) -> Dict[str, Any]:
    users, support = d["users"], d["support"]
    needs = Counter()
    casing: Dict[str, str] = {}
    askers = 0
    for u in users:
        ns = _list(u.get("support_needs"))
        if ns:
            askers += 1
        for n in ns:
            needs[n.lower()] += 1
            casing.setdefault(n.lower(), n)
    top = needs.most_common(6)
    open_reqs = [s for s in support if s.get("status") == "open"]
    cutoff = d["now"] - timedelta(days=30)
    resolved = sum(1 for s in support if s.get("status") != "open" and (_dt(s.get("resolved_at")) or _dt(s.get("updated_at")) or datetime.min.replace(tzinfo=timezone.utc)) >= cutoff)
    hosts = [u for u in users if u.get("role") in ("mentor", "alumni")]
    pairs = []
    for k, v in top[:6]:
        pairs.append({"label": _short(casing[k], 30), "asks": v, "helpers": _supply_for(k, users)})
    cats = Counter((s.get("category") or "Other") for s in open_reqs)
    charts: List[Dict[str, Any]] = []
    if top:
        charts.append({"type": "hbar", "title": "What members are asking for", "items": [{"label": _short(casing[k], 34), "value": v} for k, v in top], "unit": "members"})
        charts.append({"type": "pairs", "title": "Asks versus members who can help", "items": pairs, "a": "Asking", "b": "Can help"})
    if cats:
        charts.append({"type": "hbar", "title": "Open help-board requests by category", "items": _top(cats, 6), "unit": "requests"})
    insights = []
    if top:
        insights.append(f"The most common ask is {casing[top[0][0]]}, from {_plural(top[0][1], 'member')}.")
        gaps = sorted(pairs, key=lambda p: p["helpers"] - p["asks"])
        g = gaps[0]
        if g["helpers"] < g["asks"]:
            insights.append(f"Biggest gap: {g['label']} has {g['asks']} {'ask' if g['asks'] == 1 else 'asks'} but only {_plural(g['helpers'], 'member')} who can help. Recruiting a host here would pay off fastest.")
        else:
            insights.append("Every top ask has at least as many helpers as askers. Supply is keeping up with demand.")
    if open_reqs:
        insights.append(f"{_plural(len(open_reqs), 'request')} on the help board {'is' if len(open_reqs) == 1 else 'are'} still open.")
    return {
        "tiles": [_tile("Members asking for help", askers), _tile("Open requests", len(open_reqs), "help board", True),
                  _tile("Resolved in 30 days", resolved), _tile("Members who can help", len(hosts))],
        "charts": charts, "insights": insights,
    }


def hiring_signals(d: Dict[str, Any]) -> Dict[str, Any]:
    users = d["users"]
    by_fn = Counter()
    rows = []
    hiring_people = 0
    signals = 0
    for u in users:
        # Goals and any open-roles/hiring field count. A support need only counts when it is about hiring itself
        # ("Marketing" as an ask is a need for help, not a role the member is hiring for).
        needs = [n for n in _list(u.get("support_needs")) if any(w in n.lower() for w in ("hire", "hiring", "recruit", "talent"))]
        text = " ; ".join(_list(u.get("goals")) + _list(u.get("program_goals")) + _list(u.get("open_roles")) + _list(u.get("hiring")) + needs).lower()
        hit = [label for label, words in HIRING_WORDS if any(w in text for w in words)]
        if hit:
            hiring_people += 1
            signals += len(hit)
            for h in hit:
                by_fn[h] += 1
            rows.append([u.get("name", ""), _short(str(u.get("company") or u.get("title") or ""), 26), ", ".join(hit)])
    charts: List[Dict[str, Any]] = []
    if by_fn:
        charts.append({"type": "hbar", "title": "Hiring signals by function", "items": _top(by_fn, 6), "unit": "members"})
    if rows:
        charts.append({"type": "table", "title": "Members to introduce to talent", "columns": ["Member", "Organisation", "Looking for"], "rows": rows[:10]})
    insights = []
    if hiring_people:
        top = by_fn.most_common(1)[0]
        insights.append(f"{_plural(hiring_people, 'member')} show signs of hiring. {top[0]} comes up most, with {top[1]}.")
        insights.append("Introduce these members to talent in your network, or feature them in a newsletter jobs section.")
    else:
        insights.append("No hiring signals found yet. Add a 'Hiring' tag or an open-roles field to profiles to track this.")
    return {"tiles": [_tile("Members hiring", hiring_people, accent=True), _tile("Signals found", signals)], "charts": charts, "insights": insights}


def _event_counts(e: Dict[str, Any]) -> int:
    ids = e.get("attendee_ids")
    if isinstance(ids, (list, tuple)):
        return len(ids)
    r = e.get("rsvps")
    if isinstance(r, dict):
        return sum(1 for v in r.values() if v in ("yes", "going", True))
    return 0


def upcoming_moments(d: Dict[str, Any]) -> Dict[str, Any]:
    now, events = d["now"], d["events"]
    up = []
    for e in events:
        if e.get("is_past") is True or e.get("status") not in (None, "approved"):
            continue
        s = _dt(e.get("starts_at"))
        if s and s >= now:
            up.append((s, e))
    up.sort(key=lambda t: t[0])
    n = len(up)
    seats = rsvps = cap_total = 0
    fills = []
    cats = Counter()
    for s, e in up:
        cap, taken = _int(e.get("capacity")), _event_counts(e)
        rsvps += taken
        if cap:
            cap_total += cap
            seats += max(cap - taken, 0)
        cats[e.get("category") or "Other"] += 1
        fills.append({"label": _short(e.get("title", ""), 36), "value": _pct(taken, cap) if cap else 0, "note": f"{taken}/{cap}" if cap else f"{taken} going", "date": s.strftime("%b %-d") if os.name != "nt" else s.strftime("%b %d"), "has_cap": bool(cap), "event": e})
    capped = [f for f in fills if f["has_cap"]]
    avg_fill = int(round(sum(f["value"] for f in capped) / len(capped))) if capped else 0
    nxt = fills[:6]
    charts: List[Dict[str, Any]] = []
    if nxt:
        charts.append({"type": "hbar", "title": "How full the next events are", "items": [{"label": f["label"], "value": f["value"], "note": f["note"]} for f in nxt], "unit": "% full", "max": 100})
        if len(cats) > 1:
            charts.append({"type": "donut", "title": "Upcoming events by category", "items": _top(cats, 5)})
        charts.append({"type": "table", "title": "On the calendar", "columns": ["Date", "Event", "Host", "Going"],
                       "rows": [[f["date"], f["label"], _short(str(f["event"].get("host") or ""), 20), f["note"]] for f in nxt]})
    insights = []
    if n:
        insights.append(f"{_plural(n, 'event')} on the calendar, with {rsvps} {'person' if rsvps == 1 else 'people'} going so far.")
        if capped:
            low = min(capped, key=lambda f: f["value"])
            high = max(capped, key=lambda f: f["value"])
            insights.append(f"Fullest: {high['label']} ({high['value']}%). Emptiest: {low['label']} ({low['value']}%). Promote the emptiest one this week.")
    else:
        insights.append("No upcoming events. A regular cadence (even one a month) keeps members coming back.")
    return {"tiles": [_tile("Upcoming events", n), _tile("Average fill", f"{avg_fill}%", "of events with a seat limit", True), _tile("People going", rsvps), _tile("Open seats", seats)],
            "charts": charts, "insights": insights}


def directory_snapshot(d: Dict[str, Any]) -> Dict[str, Any]:
    now, users = d["now"], d["users"]
    total = len(users)
    hosts = [u for u in users if u.get("role") in ("mentor", "alumni")]
    active = sum(1 for u in users if (x := _dt(u.get("updated_at"))) and x >= now - timedelta(days=30))
    hidden = sum(1 for u in users if u.get("hidden_from_directory"))
    skills = Counter()
    casing: Dict[str, str] = {}
    for u in users:
        for s in _list(u.get("expertise")) or _list(u.get("skill_set")):
            skills[s.lower()] += 1
            casing.setdefault(s.lower(), s)
    places = Counter()
    for u in users:
        loc = str(u.get("location") or "").strip()
        if loc and loc != "None":
            places[loc.split(",")[-1].strip()] += 1
    charts: List[Dict[str, Any]] = []
    if skills:
        charts.append({"type": "hbar", "title": "Skills members offer", "items": [{"label": _short(casing[k], 34), "value": v} for k, v in skills.most_common(8)], "unit": "members"})
    if places:
        charts.append({"type": "hbar", "title": "Where members are based", "items": _top(places, 6), "unit": "members"})
    if hosts:
        charts.append({"type": "table", "title": "Hosts and mentors", "columns": ["Name", "Role", "Offers"],
                       "rows": [[h.get("name", ""), _short(str(h.get("title") or ""), 28), _short(", ".join((_list(h.get("expertise")) or _list(h.get("skill_set")))[:2]), 44)] for h in hosts[:8]]})
    insights = []
    if total:
        insights.append(f"{active} of {total} members ({_pct(active, total)}%) updated their profile or were active in the last 30 days.")
    if skills:
        k, v = skills.most_common(1)[0]
        insights.append(f"The most offered skill is {casing[k]}, with {_plural(v, 'member')}.")
    if hidden:
        insights.append(f"{_plural(hidden, 'member')} chose to stay out of the directory, so they will not appear in matches.")
    return {"tiles": [_tile("Hosts and mentors", len(hosts)), _tile("Active in 30 days", active, f"{_pct(active, total)}% of members", True), _tile("Members", total), _tile("Hidden from directory", hidden)],
            "charts": charts, "insights": insights}


_FNS = {"community_pulse": community_pulse, "cohort_progress": cohort_progress, "founder_needs": founder_needs,
        "hiring_signals": hiring_signals, "upcoming_moments": upcoming_moments, "directory_snapshot": directory_snapshot}


def _section(kind: str, d: Dict[str, Any]) -> Dict[str, Any]:
    meta = _BY_KIND[kind]
    out = _FNS[kind](d)
    # the PDF/JSON payload must be plain data: drop anything non-serialisable we used while building
    for ch in out.get("charts", []):
        for it in ch.get("items", []) or []:
            it.pop("event", None)
    return {"kind": kind, "title": meta["title"], "subtitle": meta["description"], "icon": meta["icon"], "user_label": meta["user_label"], **out}


async def run(db: Any, config: Dict[str, Any], kind: str) -> Dict[str, Any]:
    if kind not in _FNS:
        raise ValueError(f"Unknown audit kind: {kind}")
    d = await load(db, config)
    return _section(kind, d)


async def run_all(db: Any, config: Dict[str, Any]) -> Dict[str, Any]:
    d = await load(db, config)
    sections = [_section(k, d) for k in KINDS]
    users = d["users"]
    j30 = next((t["value"] for t in sections[0]["tiles"] if t["label"] == "Joined in 30 days"), "0")
    return {
        "community": (config or {}).get("community_name") or "Community",
        "generated_at": d["now"].isoformat(),
        "headline": [
            {"label": "Members", "value": str(len(users))},
            {"label": "Joined in 30 days", "value": str(j30)},
            {"label": "Upcoming events", "value": sections[4]["tiles"][0]["value"]},
            {"label": "Open requests", "value": sections[2]["tiles"][1]["value"]},
        ],
        "sections": sections,
    }


async def ai_summary(sections: List[Dict[str, Any]], community: str) -> Optional[str]:
    """Optional short narrative on top of the computed numbers. Needs an AI key; returns None otherwise or on any failure."""
    key = os.environ.get("OPENAI_API_KEY") or (os.environ.get("EMERGENT_LLM_KEY") if os.environ.get("LLM_BASE_URL") else None)
    if not key:
        return None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
        facts = "\n".join(f"{s['title']}: " + " | ".join(s["insights"]) for s in sections)
        chat = LlmChat(key, "audit-summary", "You write a crisp 3-4 sentence executive read of community metrics for the people who run the community. Plain language, no hype, no bullet points. Only use the facts given.")
        reply = await asyncio.wait_for(chat.send_message(UserMessage(text=f"Community: {community}\n{facts}")), timeout=25)
        reply = (reply or "").strip()
        return reply or None
    except Exception:  # noqa: BLE001 -- the metrics are the product; the narrative is a bonus
        return None
