"""Impact numbers and the three report types (sponsor, funder, board), plus the "going quiet" list.

Everything is computed from the community's own records, no AI needed. Reports use the same section shape as
the audits (`{"kind","title","subtitle","tiles","charts","insights"}`) so the screen, the PDF and the shared
read-only page all render from one source. Only totals and public titles (events, perks) appear in a report,
never names, so a live link is safe to hand to a sponsor.
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from audit_report import _completeness, _dt, _pct, _plural, _short, _tile

ACTIVE_DAYS = 30
GRACE_DAYS = 14          # a new member isn't "quiet" in their first two weeks
NUDGE_COOLDOWN_DAYS = 7

REPORT_TYPES: Dict[str, Dict[str, str]] = {
    "sponsor": {"title": "Partnership proposal", "audience": "For brands and sponsors", "headline": "Why partner with us, and what we do for you", "blurb": "Who you would reach, how they show up, what we do to promote your brand, and what we ask in return."},
    "funder": {"title": "Funder or investor report", "audience": "For funders and investors", "headline": "Who this community serves, and the traction behind it", "blurb": "People served, connections made, participation and the help given: the traction a funder or investor asks about."},
    "board": {"title": "Board report", "audience": "For the board or leadership team", "headline": "How the community is doing", "blurb": "Health of the membership: who is active, who is drifting, and what is coming up."},
}
# What a community offers a brand and what it asks in return, as editable cards. This is the starting text; an admin rewrites it.
DEFAULT_OFFER: Dict[str, List[Dict[str, str]]] = {
    "give": [
        {"title": "Promotion to our community", "text": "Your brand featured to our members across our social media, event announcements and member updates."},
        {"title": "A perk members can use", "text": "Your offer listed in our member perks, with the number of members who open it counted for you."},
        {"title": "A presence at our events", "text": "Your name and product in front of guests at our events, with a thank-you from the host."},
        {"title": "Results after", "text": "A short report after the partnership: reach, attendance and perk opens, counted from our own records."},
    ],
    "ask": [
        {"title": "Product samples", "text": "Samples for our members and guests to try, so they experience your brand first-hand."},
        {"title": "In-person activations", "text": "A table, tasting, demo or pop-up at our events, so guests can meet your brand face to face."},
    ],
}


def clean_offer(raw: Any) -> Dict[str, List[Dict[str, str]]]:
    """An offer from an admin: at most 6 cards a side, each with a title (kept short) and a sentence or two."""
    out: Dict[str, List[Dict[str, str]]] = {}
    for side in ("give", "ask"):
        cards = []
        for c in ((raw or {}).get(side) or [])[:6] if isinstance(raw, dict) else []:
            if not isinstance(c, dict):
                continue
            t, x = str(c.get("title") or "").strip()[:60], str(c.get("text") or "").strip()[:240]
            if t:
                cards.append({"title": t, "text": x})
        out[side] = cards
    return out


PERIODS = {30: "Last 30 days", 90: "Last 90 days", 365: "Last 12 months"}


def _members(users: List[dict]) -> List[dict]:
    return [u for u in users if (u.get("membership_status") or "approved") == "approved" and u.get("role") != "admin"]


def _joined(u: dict) -> Optional[datetime]:
    return _dt(u.get("joined_at")) or _dt(u.get("created_at"))


async def load(db: Any, now: Optional[datetime] = None) -> Dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    users = await db.users.find({}).to_list(5000)
    events = await db.events.find({}).to_list(2000)
    resources = await db.resources.find({}).to_list(2000)
    engagement = await db.resource_engagement.find({}).to_list(50000)
    connects = await db.connect_requests.find({}).to_list(20000)
    rsvp_log = await db.rsvp_log.find({}).to_list(50000)
    seen = await db.member_activity.find({}).to_list(5000)
    try:
        messages = await db.messages.find({}, {"sender_id": 1, "created_at": 1}).to_list(50000)
    except Exception:  # noqa: BLE001
        messages = []
    try:
        support = await db.support_requests.find({}).to_list(5000)
    except Exception:  # noqa: BLE001
        support = []
    try:
        nudges = await db.nudges.find({}).to_list(5000)
    except Exception:  # noqa: BLE001
        nudges = []
    try:
        pending_apps = await db.applications.count_documents({"status": "pending"})
    except Exception:  # noqa: BLE001
        pending_apps = 0

    # Every dated thing a person did, as (user_id, when). Last-seen only exists from the day tracking began;
    # RSVPs, perk opens, introductions and messages go back as far as the records do.
    acts: List[Tuple[str, datetime]] = []
    for s in seen:
        if (d := _dt(s.get("last_seen_at"))):
            acts.append((s["user_id"], d))
    for r in engagement:
        if (d := _dt(r.get("at"))):
            acts.append((r.get("user_id"), d))
    for c in connects:
        if (d := _dt(c.get("created_at"))):
            acts.append((c.get("sender_id"), d))
        if c.get("status") in ("accepted", "declined") and (d := _dt(c.get("updated_at"))):
            acts.append((c.get("recipient_id"), d))
    for m in messages:
        if (d := _dt(m.get("created_at"))):
            acts.append((m.get("sender_id"), d))
    logged = set()
    for r in rsvp_log:
        if r.get("status") and (d := _dt(r.get("at"))):
            acts.append((r.get("user_id"), d))
            logged.add((r.get("event_id"), r.get("user_id")))
    for e in events:  # RSVPs and check-ins from before the log existed count on the day of the event
        start = _dt(e.get("starts_at"))
        if not start or start > now:
            continue
        for uid, st in (e.get("rsvps") or {}).items():
            if st in ("yes", "maybe") and (e.get("id"), uid) not in logged:
                acts.append((uid, start))
        for uid in e.get("attended_ids") or []:
            acts.append((uid, start))
    acts = [(u, d) for u, d in acts if u]
    return {"now": now, "users": users, "events": events, "resources": resources, "engagement": engagement, "connects": connects,
            "rsvp_log": rsvp_log, "acts": acts, "support": support, "nudges": nudges, "pending_apps": pending_apps}


def _last_active(acts: List[Tuple[str, datetime]]) -> Dict[str, datetime]:
    out: Dict[str, datetime] = {}
    for uid, d in acts:
        if uid not in out or d > out[uid]:
            out[uid] = d
    return out


def compute(d: Dict[str, Any], days: int = 90) -> Dict[str, Any]:
    now = d["now"]
    since = now - timedelta(days=days)
    members = _members(d["users"])
    mids = {u["id"] for u in members}
    last = _last_active([(u, t) for u, t in d["acts"] if u in mids])
    active_cut = now - timedelta(days=ACTIVE_DAYS)
    active = sum(1 for uid in mids if last.get(uid) and last[uid] >= active_cut)
    new_in_period = sum(1 for u in members if (j := _joined(u)) and j >= since)
    quiet = quiet_list(d, ACTIVE_DAYS)

    connects = d["connects"]
    intros_sent = sum(1 for c in connects if (t := _dt(c.get("created_at"))) and since <= t <= now)
    intros_made = sum(1 for c in connects if c.get("status") == "accepted" and (t := _dt(c.get("updated_at") or c.get("created_at"))) and since <= t <= now)
    people_connected = len({x for c in connects if c.get("status") == "accepted" and (t := _dt(c.get("updated_at") or c.get("created_at"))) and since <= t <= now for x in (c.get("sender_id"), c.get("recipient_id"))} & mids)

    past = [e for e in d["events"] if (s := _dt(e.get("starts_at"))) and since <= s <= now]
    upcoming = [e for e in d["events"] if (s := _dt(e.get("starts_at"))) and s > now]
    rsvp_yes = sum(len([1 for st in (e.get("rsvps") or {}).values() if st == "yes"]) or len(e.get("attendee_ids") or []) for e in past)
    with_checkin = [e for e in past if e.get("attended_ids")]
    attended = sum(len(e.get("attended_ids") or []) for e in with_checkin)
    rsvp_for_checkin = sum(len(e.get("attendee_ids") or []) for e in with_checkin)
    turnout_pct = _pct(attended, rsvp_for_checkin) if with_checkin and rsvp_for_checkin else None
    ev_rows = []
    for e in sorted(past, key=lambda x: _dt(x.get("starts_at")), reverse=True)[:8]:
        yes = len(e.get("attendee_ids") or [])
        ev_rows.append([_short(e.get("title") or "Event", 38), _dt(e.get("starts_at")).strftime("%b %-d"), str(yes),
                        str(len(e.get("attended_ids") or [])) if e.get("attended_ids") else "n/a"])
    event_goers = len({uid for e in past for uid in (e.get("attendee_ids") or []) if uid in mids})

    opens = [r for r in d["engagement"] if (t := _dt(r.get("at"))) and since <= t <= now]
    rname = {r["id"]: r for r in d["resources"]}
    by_perk = Counter(r.get("resource_id") for r in opens if r.get("resource_id") in rname)
    perk_users = len({r.get("user_id") for r in opens} & mids)
    top_perks = [{"label": _short(rname[k].get("title") or "Perk", 30), "value": v} for k, v in by_perk.most_common(6)]

    # active members per week, newest last
    weekly = []
    for w in range(7, -1, -1):
        a, b = now - timedelta(days=7 * (w + 1)), now - timedelta(days=7 * w)
        weekly.append({"label": b.strftime("%b %-d"), "value": len({u for u, t in d["acts"] if u in mids and a <= t < b})})
    joins = []
    for m in range(5, -1, -1):
        first = (now.replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(days=31 * m)).replace(day=1)
        nxt = (first + timedelta(days=32)).replace(day=1)
        joins.append({"label": first.strftime("%b"), "value": sum(1 for u in members if (j := _joined(u)) and first <= j < nxt)})

    sup = d["support"]
    sup_resolved = sum(1 for s in sup if s.get("status") in ("resolved", "closed") and (t := _dt(s.get("updated_at") or s.get("created_at"))) and since <= t <= now)
    sup_open = sum(1 for s in sup if s.get("status") not in ("resolved", "closed"))
    comp = int(round(sum(_completeness(u) for u in members) / len(members))) if members else 0
    nudged = [n for n in d["nudges"] if (t := _dt(n.get("at"))) and t >= now - timedelta(days=30)]
    came_back = sum(1 for n in nudged if (la := last.get(n.get("user_id"))) and (nt := _dt(n.get("at"))) and la > nt)

    return {
        "days": days, "since": since, "now": now,
        "members": len(members), "new_members": new_in_period, "active": active, "active_pct": _pct(active, len(members)),
        "quiet": len(quiet), "intros_made": intros_made, "intros_sent": intros_sent, "people_connected": people_connected,
        "events_held": len(past), "upcoming": len(upcoming), "rsvps": rsvp_yes, "attended": attended, "checkin_events": len(with_checkin),
        "turnout_pct": turnout_pct, "avg_rsvp": round(rsvp_yes / len(past), 1) if past else 0, "event_rows": ev_rows, "event_goers": event_goers,
        "perk_opens": len(opens), "perk_users": perk_users, "perks_offered": len(d["resources"]), "top_perks": top_perks,
        "weekly": weekly, "joins": joins, "sup_resolved": sup_resolved, "sup_open": sup_open, "completeness": comp,
        "pending_apps": d["pending_apps"], "nudged": len(nudged), "came_back": came_back,
    }


def previous(d: Dict[str, Any], days: int = 90) -> Dict[str, Any]:
    """The same numbers for the window just before this one, as the community looked then: only people who had joined and
    only things that had happened by that date. Used to show whether each number is going up or down."""
    then = d["now"] - timedelta(days=days)
    users = [u for u in d["users"] if (j := _joined(u)) is None or j <= then]
    return compute({**d, "now": then, "users": users, "acts": [(u, t) for u, t in d["acts"] if t <= then]}, days)


def impact_summary(m: Dict[str, Any], prev: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """The four headline numbers for the admin home, in plain words, with how each moved against the window before."""
    turnout = f"{m['turnout_pct']}% showed up" if m["turnout_pct"] is not None else f"{m['rsvps']} RSVPs"
    out = {
        "period_days": m["days"], "period_label": PERIODS.get(m["days"], f"Last {m['days']} days"),
        "cards": [
            {"key": "active", "label": "Active members", "value": f"{m['active']}", "of": f"of {m['members']}", "note": f"{m['active_pct']}% did something in the last {ACTIVE_DAYS} days", "to": None},
            {"key": "intros", "label": "Introductions made", "value": f"{m['intros_made']}", "note": f"{m['intros_sent']} asked for · {m['people_connected']} people connected", "to": "/requests"},
            {"key": "turnout", "label": "Event turnout", "value": f"{m['events_held']}", "unit": _plural(m["events_held"], "event").split(" ", 1)[1], "note": f"{m['rsvps']} RSVPs · {turnout}", "to": "/events"},
            {"key": "perks", "label": "Perk results", "value": f"{m['perk_opens']}", "unit": "opens", "note": f"{m['perk_users']} members used a perk · {m['perks_offered']} offered", "to": "/resources"},
        ],
        "quiet": m["quiet"],
        "weekly": m["weekly"],
    }
    if prev and prev["members"] > 0:
        label = f"vs previous {m['days']} days" if m["days"] != 365 else "vs the 12 months before"
        pairs = {"active": ("active", "active"), "intros": ("intros_made", "intros_made"), "turnout": ("events_held", "events_held"), "perks": ("perk_opens", "perk_opens")}
        for c in out["cards"]:
            k = pairs[c["key"]][0]
            c["delta"] = {"value": m[k] - prev[k], "label": label}
    return out


def reliability_summary(m: Dict[str, Any]) -> Dict[str, Any]:
    """What members see about how dependable their community is: totals only, never names. Same counts the admin sends to sponsors."""
    t = m["turnout_pct"]
    return {
        "period_days": m["days"], "period_label": PERIODS.get(m["days"], f"Last {m['days']} days"),
        "tiles": [
            {"key": "show", "label": "Members who show up", "value": f"{t}%" if t is not None else "n/a", "note": "of RSVPs came along" if t is not None else "Shown once events use check-in"},
            {"key": "events", "label": "Events held", "value": str(m["events_held"]), "note": f"{m['upcoming']} coming up"},
            {"key": "intros", "label": "Introductions made", "value": str(m["intros_made"]), "note": f"{m['people_connected']} people connected"},
            {"key": "help", "label": "Help requests answered", "value": str(m["sup_resolved"]), "note": f"{m['sup_open']} still open"},
        ],
    }


def _insights(m: Dict[str, Any]) -> List[str]:
    out = []
    if m["members"]:
        out.append(f"{m['active']} of {m['members']} members ({m['active_pct']}%) were active in the last {ACTIVE_DAYS} days.")
    if m["new_members"]:
        out.append(f"{_plural(m['new_members'], 'person', 'people')} joined in this period.")
    if m["intros_made"]:
        out.append(f"{_plural(m['intros_made'], 'introduction')} led to a conversation, connecting {m['people_connected']} members.")
    if m["events_held"]:
        out.append(f"{_plural(m['events_held'], 'event')} drew {m['rsvps']} RSVPs ({m['avg_rsvp']} on average)" + (f", and {m['turnout_pct']}% of those who signed up came." if m["turnout_pct"] is not None else "."))
    if m["perk_opens"]:
        top = m["top_perks"][0]["label"] if m["top_perks"] else None
        out.append(f"Members opened perks {m['perk_opens']} times" + (f"; the most used was {top}." if top else "."))
    return out


def build_report(m: Dict[str, Any], kind: str, community: str, offer: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    meta = REPORT_TYPES[kind]
    period = PERIODS.get(m["days"], f"Last {m['days']} days")
    turnout = f"{m['turnout_pct']}%" if m["turnout_pct"] is not None else "n/a"
    reach = {"kind": "reach", "title": "Reach", "subtitle": f"Who is in the community and who is taking part. {period}.",
             "tiles": [_tile("Members", m["members"], "", True), _tile("Active members", m["active"], f"{m['active_pct']}% in last {ACTIVE_DAYS} days"),
                       _tile("New members", m["new_members"], period.lower()), _tile("Introductions made", m["intros_made"], f"{m['people_connected']} people connected")],
             "charts": [{"type": "columns", "title": "Active members per week", "items": m["weekly"]}, {"type": "columns", "title": "New members per month", "items": m["joins"]}],
             "insights": _insights(m)[:3]}
    events = {"kind": "events", "title": "Events and turnout", "subtitle": f"What was held and who came. {period}.",
              "tiles": [_tile("Events held", m["events_held"]), _tile("RSVPs", m["rsvps"], f"{m['avg_rsvp']} per event"), _tile("Checked in", m["attended"] if m["checkin_events"] else "n/a", f"{m['checkin_events']} events with check-in"), _tile("Turnout", turnout, "of those who signed up", True)],
              "charts": [{"type": "table", "title": "Recent events", "columns": ["Event", "Date", "RSVPs", "Came"], "rows": m["event_rows"]}], "insights": []}
    perks = {"kind": "perks", "title": "Perks and offers", "subtitle": f"How members used what the community offers. {period}.",
             "tiles": [_tile("Perk opens", m["perk_opens"], "", True), _tile("Members who used a perk", m["perk_users"]), _tile("Perks offered", m["perks_offered"])],
             "charts": [{"type": "hbar", "title": "Most used perks", "items": m["top_perks"]}], "insights": []}
    intros = {"kind": "connections", "title": "Connections", "subtitle": f"Introductions and help between members. {period}.",
              "tiles": [_tile("Introductions asked for", m["intros_sent"]), _tile("Led to a conversation", m["intros_made"], "", True), _tile("People connected", m["people_connected"]), _tile("Help requests answered", m["sup_resolved"])],
              "charts": [], "insights": []}
    health = {"kind": "health", "title": "Community health", "subtitle": "Who is active, who is drifting, and what is next.",
              "tiles": [_tile("Active in 30 days", f"{m['active_pct']}%", f"{m['active']} of {m['members']}", True), _tile("Going quiet", m["quiet"], f"nothing in {ACTIVE_DAYS}+ days"),
                        _tile("Waiting to join", m["pending_apps"], "applications"), _tile("Upcoming events", m["upcoming"])],
              "charts": [{"type": "columns", "title": "Active members per week", "items": m["weekly"]}],
              "insights": ([f"{_plural(m['quiet'], 'member')} {'has' if m['quiet'] == 1 else 'have'} gone quiet. "
                            + (f"Of {m['nudged']} nudged in the last 30 days, {m['came_back']} came back." if m["nudged"] else "A short nudge from the team is the quickest way to bring people back.")] if m["quiet"] else ["Nobody has gone quiet. Everyone who joined more than two weeks ago has been active recently."])}
    served = {"kind": "served", "title": "People served", "subtitle": f"Reach and growth. {period}.",
              "tiles": [_tile("Members served", m["members"], "", True), _tile("Joined", m["new_members"], period.lower()), _tile("Took part in an event", m["event_goers"]), _tile("Profiles complete", f"{m['completeness']}%", "on average")],
              "charts": [{"type": "columns", "title": "New members per month", "items": m["joins"]}], "insights": _insights(m)[:2]}
    support = {"kind": "support", "title": "Help given", "subtitle": f"Requests members raised and how many were answered. {period}.",
               "tiles": [_tile("Help requests answered", m["sup_resolved"], "", True), _tile("Still open", m["sup_open"]), _tile("Introductions made", m["intros_made"])], "charts": [], "insights": []}
    if kind == "sponsor":
        # a pitch, not a results report: who you would reach, proof they show up and act, what we do for you, what we ask in return
        reach.update(title="Who you would reach", subtitle=f"The people in our community and how often they take part. {period}.", insights=_insights(m))
        events.update(title="People who show up", subtitle=f"Events held and how many came. {period}.")
        perks.update(title="Members who act on offers", subtitle=f"How members used what partners offered them. {period}.")
        of = clean_offer(offer if offer is not None else DEFAULT_OFFER)
        sections = [reach, events, perks]
        for key, title, sub in (("give", "What we do for you", "How we promote your brand."), ("ask", "What we ask in return", "Product samples and in-person activations for our guests.")):
            if of[key]:
                sections.append({"kind": f"offer_{key}", "title": title, "subtitle": sub, "tiles": [], "charts": [], "insights": [], "cards": of[key]})
    elif kind == "funder":
        sections = [served, intros, events, support]
    else:
        sections = [health, reach, events, perks]
        sections[1]["charts"] = [sections[1]["charts"][1]]
    sections = [s for s in sections if s["tiles"] or s.get("cards")]
    return {"type": kind, "title": meta["title"], "audience": meta["audience"], "headline": meta["headline"], "community": community,
            "generated_at": m["now"].isoformat(), "period_days": m["days"], "period_label": period, "sections": sections}


# ---------- going quiet ----------
def quiet_list(d: Dict[str, Any], days: int = ACTIVE_DAYS) -> List[Dict[str, Any]]:
    now = d["now"]
    members = _members(d["users"])
    mids = {u["id"] for u in members}
    last = _last_active([(u, t) for u, t in d["acts"] if u in mids])
    last_nudge: Dict[str, datetime] = {}
    for n in d.get("nudges", []):
        if (t := _dt(n.get("at"))) and (n.get("user_id") not in last_nudge or t > last_nudge[n["user_id"]]):
            last_nudge[n["user_id"]] = t
    ev = {e["id"]: e for e in d["events"]}
    last_rsvp: Dict[str, Tuple[datetime, str]] = {}
    for r in d["rsvp_log"]:
        if r.get("status") == "yes" and (t := _dt(r.get("at"))) and r.get("user_id") in mids and (r["user_id"] not in last_rsvp or t > last_rsvp[r["user_id"]][0]):
            last_rsvp[r["user_id"]] = (t, (ev.get(r.get("event_id")) or {}).get("title") or "an event")
    out = []
    for u in members:
        joined = _joined(u)
        if joined and joined > now - timedelta(days=GRACE_DAYS):
            continue
        la = last.get(u["id"])
        if la and la >= now - timedelta(days=days):
            continue
        quiet_for = (now - (la or joined or now)).days
        if la:
            reason = f"Last active {quiet_for} days ago"
        else:
            reason = "Hasn't done anything since joining" if joined else "No activity recorded"
        if u["id"] in last_rsvp:
            reason += f" · last RSVP: {_short(last_rsvp[u['id']][1], 28)}"
        ln = last_nudge.get(u["id"])
        out.append({"id": u["id"], "name": u.get("name") or "Member", "title": u.get("title"), "avatar_url": u.get("avatar_url"),
                    "last_active_at": la.isoformat() if la else None, "days_quiet": quiet_for, "reason": reason,
                    "nudged_at": ln.isoformat() if ln else None,
                    "nudged_recently": bool(ln and ln > now - timedelta(days=NUDGE_COOLDOWN_DAYS))})
    out.sort(key=lambda r: (r["nudged_recently"], -r["days_quiet"]))
    return out


# ---------- Instagram section (only when the admin has connected Instagram and ticked it) ----------
def _n(v: Any) -> str:
    return f"{v:,}" if isinstance(v, (int, float)) else "n/a"


def instagram_section(snap: Dict[str, Any], hist: List[Dict[str, Any]]) -> Dict[str, Any]:
    a, t, aud = snap["account"], snap.get("totals") or {}, snap.get("audience") or {}
    reach, eng = t.get("reach"), t.get("accounts_engaged")
    charts: List[Dict[str, Any]] = []
    pts = [h for h in hist if h.get("followers") is not None]
    if len(pts) >= 2:
        charts.append({"type": "columns", "title": "Followers over time", "items": [{"label": datetime.fromisoformat(h["day"]).strftime("%b %-d"), "value": h["followers"]} for h in pts[-8:]]})
    if aud.get("country"):
        charts.append({"type": "hbar", "title": "Where the audience is", "items": aud["country"]})
    if aud.get("city"):
        charts.append({"type": "hbar", "title": "Top cities", "items": aud["city"]})
    if aud.get("age"):
        charts.append({"type": "hbar", "title": "Audience by age", "items": aud["age"]})
    if aud.get("gender"):
        charts.append({"type": "donut", "title": "Audience by gender", "items": aud["gender"]})
    if snap.get("top_posts"):
        charts.append({"type": "table", "title": "Best recent posts", "columns": ["Post", "Type", "Reach", "Likes"],
                       "rows": [[p.get("caption") or "(no caption)", p.get("kind"), _n(p.get("reach")), _n(p.get("likes"))] for p in snap["top_posts"]]})
    insights = []
    if reach is not None and a["followers"]:
        insights.append(f"Content reached {reach:,} accounts in the last 30 days, {reach / a['followers']:.1f} times the follower count.")
    if reach and eng is not None:
        insights.append(f"{eng:,} accounts engaged with it ({_pct(eng, reach)}% of those reached).")
    if snap.get("audience_note"):
        insights.append(snap["audience_note"])
    return {"kind": "instagram", "title": "Instagram reach", "subtitle": f"@{a.get('username')}. Last 30 days. Reach counts accounts, not followers, and includes people who don't follow.",
            "tiles": [_tile("Followers", _n(a["followers"]), "", True), _tile("Accounts reached", _n(reach), "last 30 days"), _tile("Views", _n(t.get("views")), "last 30 days"),
                      _tile("Accounts engaged", _n(eng)), _tile("Profile link taps", _n(t.get("profile_links_taps")))],
            "charts": charts, "insights": insights}


def add_instagram(report: Dict[str, Any], snap: Optional[Dict[str, Any]], hist: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not snap:
        return report
    sec = instagram_section(snap, hist)
    secs = list(report["sections"])
    secs.insert(1 if report["type"] == "sponsor" else len(secs), sec)  # a sponsor sees reach straight after the headline numbers
    return {**report, "sections": secs, "sample": bool(report.get("sample") or snap.get("sample"))}


def tiktok_section(snap: Dict[str, Any], hist: List[Dict[str, Any]]) -> Dict[str, Any]:
    a, t = snap["account"], snap.get("totals") or {}
    charts: List[Dict[str, Any]] = []
    pts = [h for h in hist if h.get("followers") is not None]
    if len(pts) >= 2:
        charts.append({"type": "columns", "title": "Followers over time", "items": [{"label": datetime.fromisoformat(h["day"]).strftime("%b %-d"), "value": h["followers"]} for h in pts[-8:]]})
    if snap.get("top_posts"):
        charts.append({"type": "table", "title": "Best recent videos", "columns": ["Video", "Views", "Likes", "Shares"],
                       "rows": [[p.get("caption") or "(no caption)", _n(p.get("views")), _n(p.get("likes")), _n(p.get("shares"))] for p in snap["top_posts"]]})
    inter = (t.get("likes") or 0) + (t.get("comments") or 0) + (t.get("shares") or 0)
    insights = []
    if t.get("videos_posted") and t.get("views"):
        insights.append(f"{_plural(t['videos_posted'], 'video')} posted in the last 30 days were watched {t['views']:,} times, about {t['views'] // t['videos_posted']:,} each.")
    if t.get("views") and inter:
        insights.append(f"{inter:,} likes, comments and shares: {_pct(inter, t['views'])}% of views led to a reaction.")
    return {"kind": "tiktok", "title": "TikTok reach", "subtitle": f"@{a.get('username')}. Last 30 days. TikTok counts views of videos posted in the period, not unique accounts.",
            "tiles": [_tile("Followers", _n(a["followers"]), "", True), _tile("Video views", _n(t.get("views")), "videos posted in last 30 days"), _tile("Likes", _n(t.get("likes"))),
                      _tile("Shares", _n(t.get("shares"))), _tile("Videos posted", _n(t.get("videos_posted")), "last 30 days")],
            "charts": charts, "insights": insights}


def _sum(*vals: Optional[int]) -> Optional[int]:
    got = [v for v in vals if isinstance(v, (int, float))]
    return int(sum(got)) if got else None


def social_section(ig: Dict[str, Any], tt: Dict[str, Any]) -> Dict[str, Any]:
    """Instagram and TikTok together, then each on its own below: overall followers and views, and how they split."""
    ia, it, ta, tt_ = ig["account"], ig.get("totals") or {}, tt["account"], tt.get("totals") or {}
    followers = ia["followers"] + ta["followers"]
    views = _sum(it.get("views"), tt_.get("views"))
    tt_inter = _sum(tt_.get("likes"), tt_.get("comments"), tt_.get("shares"))
    inter = _sum(it.get("total_interactions"), tt_inter)
    split = lambda a, b: [{"label": "Instagram", "value": a or 0}, {"label": "TikTok", "value": b or 0}]  # noqa: E731
    insights = [f"Together the two accounts have {followers:,} followers. Someone who follows both is counted on each, so treat it as an upper bound."]
    if views:
        lead = "Instagram" if (it.get("views") or 0) >= (tt_.get("views") or 0) else "TikTok"
        share = _pct(max(it.get("views") or 0, tt_.get("views") or 0), views)
        insights.append(f"Content was viewed {views:,} times across both in the last 30 days; {lead} drove {share}% of those views.")
    return {"kind": "social", "title": "Social reach", "subtitle": "Instagram and TikTok together, then each on its own. Last 30 days.",
            "tiles": [_tile("Followers across both", _n(followers), f"Instagram {_n(ia['followers'])} · TikTok {_n(ta['followers'])}", True),
                      _tile("Views, last 30 days", _n(views), f"Instagram {_n(it.get('views'))} · TikTok {_n(tt_.get('views'))}"),
                      _tile("Reactions and interactions", _n(inter), "likes, comments, shares, saves"),
                      _tile("Instagram accounts reached", _n(it.get("reach")), "unique accounts, last 30 days")],
            "charts": [{"type": "hbar", "title": "Followers by platform", "items": split(ia["followers"], ta["followers"])},
                       {"type": "hbar", "title": "Views by platform, last 30 days", "items": split(it.get("views"), tt_.get("views"))}],
            "insights": insights}


def add_social(report: Dict[str, Any], ig: Optional[Dict[str, Any]] = None, ig_hist: Optional[List[Dict[str, Any]]] = None,
               tt: Optional[Dict[str, Any]] = None, tt_hist: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """Whatever social accounts are connected and ticked: both together as 'Social reach' then each alone, or just the one."""
    new: List[Dict[str, Any]] = []
    if ig and tt:
        new.append(social_section(ig, tt))
    if ig:
        new.append(instagram_section(ig, ig_hist or []))
    if tt:
        new.append(tiktok_section(tt, tt_hist or []))
    if not new:
        return report
    secs = list(report["sections"])
    at = 1 if report["type"] == "sponsor" else len(secs)  # a sponsor sees reach straight after the headline numbers
    secs[at:at] = new
    return {**report, "sections": secs, "sample": bool(report.get("sample") or (ig or {}).get("sample") or (tt or {}).get("sample"))}
