from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Request

from database import db
from ._common import approved_q, audience_ok, clean, member_type, viewer
from .matches import compute_people
from .portal import _effective, completion, sync_reminders

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
async def dashboard(request: Request, role: Optional[str] = "founder"):
    me = await viewer(request, role)
    if not me:
        return {"me": None}
    now = datetime.now(timezone.utc).isoformat()
    events = [clean(e) async for e in db.events.find(approved_q({"starts_at": {"$gte": now}})).sort("starts_at", 1).limit(4)]
    featured = [clean(r) async for r in db.resources.find(approved_q({"is_featured": True})).limit(4)]
    anns = [clean(a) async for a in db.announcements.find(approved_q()).sort("published_at", -1).limit(3)]
    slack = [clean(s) async for s in db.slack_signals.find({}).sort("posted_at", -1).limit(4)]
    emails = [clean(e) async for e in db.email_updates.find({}).sort("received_at", -1).limit(4)]
    reqs = [clean(r) async for r in db.support_requests.find({"status": "open"}).sort("created_at", -1).limit(4)]
    cfg = await db.community_config.find_one({"_key": "singleton"}) or {}
    real = await db.users.find_one({"id": me["id"]}) or {}
    await sync_reminders(me)
    my_reqs = [r async for r in db.member_requests.find({"user_id": me["id"]})]
    open_reqs = []
    for r in my_reqs:
        st = _effective(r)
        if st in ("not_started", "in_progress", "overdue"):
            open_reqs.append({"id": r["id"], "title": r.get("title"), "kind": r.get("kind"), "due_date": r.get("due_date"),
                              "status": st, "reason": r.get("reason")})
    open_reqs.sort(key=lambda r: (r["status"] != "overdue", r.get("due_date") or "9999"))
    my_rsvps = []
    async for e in db.events.find({f"rsvps.{me['id']}": {"$in": ["yes", "maybe"]}, "starts_at": {"$gte": now}}).sort("starts_at", 1).limit(4):
        my_rsvps.append({"id": e["id"], "title": e.get("title"), "starts_at": e.get("starts_at"), "rsvp": e["rsvps"][me["id"]], "prep": e.get("prep"), "cover_url": e.get("cover_url"), "location": e.get("location")})
    team = [clean(t) async for t in db.support_requests.find({"user_id": me["id"], "to_team": True, "status": {"$nin": ["resolved", "closed"]}}).sort("updated_at", -1).limit(3)]
    milestones = [{"id": e["id"], "title": e.get("title"), "starts_at": e.get("starts_at")}
                  async for e in db.events.find(approved_q({"category": {"$in": ["Milestone", "Deadline"]}, "starts_at": {"$gte": now}})).sort("starts_at", 1).limit(3)]
    people = await compute_people(me, limit=6)
    events = [e for e in events if audience_ok(e, me)]
    from .admin import _req_view
    joined = [u async for u in db.users.find({"hidden_from_directory": {"$ne": True}, "id": {"$ne": me["id"]}, "membership_status": "approved"})]
    joined.sort(key=lambda u: str(u.get("membership_decided_at") or u.get("created_at") or ""), reverse=True)
    new_members = [{"id": u["id"], "name": u.get("name"), "title": u.get("title"), "avatar_url": u.get("avatar_url"), "joined_at": u.get("membership_decided_at") or u.get("created_at")} for u in joined[:4]]
    pend = []
    if me.get("role") == "admin":
        pend = [_req_view(u) async for u in db.users.find({"membership_status": "pending"})]
        pend.sort(key=lambda u: str(u.get("requested_at") or ""), reverse=True)
    return {
        "new_members": new_members,
        "membership_requests": pend[:5],
        "membership_requests_total": len(pend),
        "member_type": member_type(real),
        "profile_completion": completion(real, cfg),
        "open_requests": open_reqs,
        "my_rsvps": my_rsvps,
        "team_support": team,
        "milestones": milestones,
        "recommended_people": people[:3],
        "me": me,
        "community_name": cfg.get("community_name"),
        "upcoming_events": events,
        "featured_resources": featured,
        "announcements": anns,
        "slack_signals": slack,
        "email_updates": emails,
        "support_requests_open": reqs,
        "smart_matches": people[:4],
        "pending_profile_requests": await db.profile_requests.count_documents({"user_id": me["id"], "status": "pending"}),
        "unread_notifications": await db.notifications.count_documents({"user_id": me["id"], "read": {"$ne": True}}),
        "stats": {
            "members": await db.users.count_documents({"hidden_from_directory": {"$ne": True}}),
            "events": await db.events.count_documents({"starts_at": {"$gte": now}}),
            "open_requests": await db.support_requests.count_documents({"status": "open"}),
        },
        "widgets": cfg.get("widgets") or [],
    }
