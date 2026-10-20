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
    "sponsor": {"title": "Sponsor report", "audience": "For sponsors and partners", "headline": "What your support reached", "blurb": "Reach, event turnout and how members used the perks you backed."},
    "funder": {"title": "Funder report", "audience": "For funders and grant reporting", "headline": "Who this community served, and what happened", "blurb": "People served, connections made, participation and the help given."},
    "board": {"title": "Board report", "audience": "For the board or leadership team", "headline": "How the community is doing", "blurb": "Health of the membership: who is active, who is drifting, and what is coming up."},
}
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
    intros_sent = sum(1 for c in connects if (t := _dt(c.get("created_at"))) and t >= since)
    intros_made = sum(1 for c in connects if c.get("status") == "accepted" and (t := _dt(c.get("updated_at") or c.get("created_at"))) and t >= since)
    people_connected = len({x for c in connects if c.get("status") == "accepted" and (t := _dt(c.get("updated_at") or c.get("created_at"))) and t >= since for x in (c.get("sender_id"), c.get("recipient_id"))} & mids)

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

    opens = [r for r in d["engagement"] if (t := _dt(r.get("at"))) and t >= since]
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
    sup_resolved = sum(1 for s in sup if s.get("status") in ("resolved", "closed") and (t := _dt(s.get("updated_at") or s.get("created_at"))) and t >= since)
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


def impact_summary(m: Dict[str, Any]) -> Dict[str, Any]:
    """The four headline numbers for the admin home, in plain words."""
    turnout = f"{m['turnout_pct']}% showed up" if m["turnout_pct"] is not None else f"{m['rsvps']} RSVPs"
    return {
        "period_days": m["days"], "period_label": PERIODS.get(m["days"], f"Last {m['days']} days"),
        "cards": [
            {"key": "active", "label": "Active members", "value": f"{m['active']}", "of": f"of {m['members']}", "note": f"{m['active_pct']}% did something in the last {ACTIVE_DAYS} days", "to": None},
            {"key": "intros", "label": "Introductions made", "value": f"{m['intros_made']}", "note": f"{m['intros_sent']} asked for · {m['people_connected']} people connected", "to": "/requests"},
            {"key": "turnout", "label": "Event turnout", "value": f"{m['events_held']}", "unit": _plural(m["events_held"], "event").split(" ", 1)[1], "note": f"{m['rsvps']} RSVPs · {turnout}", "to": "/events"},
            {"key": "perks", "label": "Perk results", "value": f"{m['perk_opens']}", "unit": "opens", "note": f"{m['perk_users']} members used a perk · {m['perks_offered']} offered", "to": "/resources"},
        ],
        "quiet": m["quiet"],
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


def build_report(m: Dict[str, Any], kind: str, community: str) -> Dict[str, Any]:
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
        sections = [reach, events, perks]
        sections[0]["insights"] = _insights(m)
    elif kind == "funder":
        sections = [served, intros, events, support]
    else:
        sections = [health, reach, events, perks]
        sections[1]["charts"] = [sections[1]["charts"][1]]
    sections = [s for s in sections if s["tiles"]]
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
