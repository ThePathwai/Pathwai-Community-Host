"""Demo data for the community portal workflows. Idempotent."""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

STAGES = ["Idea", "Pre-seed", "Seed", "Series A", "Growth"]


def _iso(days=0, hours=0):
    return (datetime.now(timezone.utc) + timedelta(days=days, hours=hours)).isoformat()


def _day(days):
    return (datetime.now(timezone.utc) + timedelta(days=days)).date().isoformat()


async def seed_portal_demo(db):
    if await db.member_requests.count_documents({}) > 0:
        return
    # stage + member types for the simulated community (deterministic)
    async for u in db.users.find({"is_simulated": True}):
        h = int(hashlib.sha1(u["id"].encode()).hexdigest(), 16)
        upd = {}
        if not u.get("stage"):
            upd["stage"] = STAGES[h % len(STAGES)]
        if u.get("role") != "mentor":
            if h % 11 == 0:
                upd["member_type"] = "alumni"
            elif h % 13 == 0:
                upd["member_type"] = "partner"
        if upd:
            await db.users.update_one({"id": u["id"]}, {"$set": upd})
    me = await db.users.find_one({"id": "u-founder-me"})
    admin = await db.users.find_one({"id": "u-admin-me"})
    if not me or not admin:
        return
    await db.users.update_one({"id": me["id"]}, {"$set": {
        "stage": "Pre-seed", "phone": "+1 416 555 0142", "cohort": "Spring 2026 cohort", "team_size": "3",
        "problem": "Small operators can't afford enterprise-grade procurement tooling.",
        "documents": [{"title": "Pitch deck (v3)", "url": "https://example.com/deck"}]}})

    def req(kind, title, reason, due, status="not_started", **kw):
        return {"id": f"rq-{kind}-{me['id']}", "user_id": me["id"], "kind": kind, "title": title, "reason": reason,
                "due_date": due, "status": status, "created_by": admin["id"], "created_by_name": admin["name"],
                "created_at": _iso(-6), "updated_at": _iso(-6), "external_url": None, "webhook_token": None, **kw}
    from routes.portal import REQUEST_KINDS
    reqs = [
        req("traction_update", "Traction update for the Q3 funder report", "Funders review this each quarter — new users, revenue, pilots.", _day(3), fields=REQUEST_KINDS["traction_update"]["fields"]),
        req("profile_update", "Refresh your business description", "Helps us match you to the right mentors and programs.", _day(10), "in_progress", fields=REQUEST_KINDS["profile_update"]["fields"]),
        req("questionnaire", "Mid-program check-in (Typeform)", "A 5-minute check-in so the team knows where you need support.", _day(-2),
            fields=[], external_url="https://example.com/typeform/check-in", external_provider="Typeform", webhook_token="demo-webhook-token"),
        req("event_followup", "Follow-up: Founder Office Hours", "What did you take away and what's next?", None, "reviewed",
            fields=REQUEST_KINDS["event_followup"]["fields"], response={"takeaway": "Pricing tiers", "next_step": "Test 3 price points"}, submitted_at=_iso(-20)),
    ]
    await db.member_requests.insert_many(reqs)
    # a few more members so the admin view has volume
    others = [u async for u in db.users.find({"is_simulated": True}).limit(6)]
    for i, u in enumerate(others):
        st = ["submitted", "not_started", "in_progress", "submitted", "overdue-ish", "resolved"][i]
        doc = {"id": f"rq-seed-{i}", "user_id": u["id"], "kind": "traction_update", "title": "Traction update for the Q3 funder report",
               "reason": "Quarterly reporting", "due_date": _day(-1 if st == "overdue-ish" else 5), "fields": REQUEST_KINDS["traction_update"]["fields"],
               "status": "not_started" if st == "overdue-ish" else st, "created_by": admin["id"], "created_by_name": admin["name"],
               "created_at": _iso(-8), "updated_at": _iso(-2), "external_url": None, "webhook_token": None}
        if st == "submitted":
            doc.update(response={"traction": "120 weekly active users, 2 paid pilots", "stage": "Seed"}, submitted_at=_iso(-1))
        await db.member_requests.insert_one(doc)

    # moderation: two pending community submissions
    await db.resources.insert_one({"id": "res-pending-1", "title": "Term sheet checklist for first-time founders", "url": "https://example.com/term-sheet",
        "category": "Funding", "format": "Guide", "type": "guide", "description": "One-page checklist of clauses to negotiate.", "tags": ["fundraising", "legal"],
        "source": "community", "author": others[0]["name"] if others else "Member", "is_featured": False, "saved_by": [], "published_at": _iso(-1),
        "status": "pending", "submitted_by": others[0]["id"] if others else None, "submitted_by_name": others[0]["name"] if others else None})
    await db.events.insert_one({"id": "evt-pending-1", "title": "Founder roundtable: hiring your first engineer", "description": "Peer roundtable, Chatham House rules.",
        "starts_at": _iso(9, 2), "ends_at": _iso(9, 3), "location": "MaRS, Toronto", "host": others[1]["name"] if len(others) > 1 else "Member",
        "category": "Roundtable", "tags": ["hiring"], "source": "community", "attendee_ids": [], "rsvps": {}, "status": "pending",
        "submitted_by": others[1]["id"] if len(others) > 1 else None, "submitted_by_name": others[1]["name"] if len(others) > 1 else None, "created_at": _iso(-1)})

    # team support example
    await db.support_requests.insert_one({"id": "sup-team-1", "user_id": me["id"], "to_team": True,
        "user_snapshot": {k: me.get(k) for k in ("id", "name", "avatar_url", "title", "company")},
        "title": "Need help polishing my seed pitch deck", "description": "Demo day is in 3 weeks — want feedback on the story and financials slide.",
        "category": "pitch / deck support", "category_label": "Pitch / deck support", "urgency": "high", "deadline": _day(14),
        "status": "in_progress", "assignee_id": admin["id"], "tags": [], "helpers": [], "last_response": "Matching you with a mentor who has closed 3 seed rounds — intro coming this week.",
        "timeline": [{"status": "submitted", "at": _iso(-5), "by": me["name"]}, {"status": "assigned", "at": _iso(-4), "by": admin["name"]},
                     {"status": "in_progress", "at": _iso(-2), "by": admin["name"], "note": "Matching you with a mentor who has closed 3 seed rounds — intro coming this week."}],
        "created_at": _iso(-5), "updated_at": _iso(-2), "resolved_at": None})

    # richer event detail + RSVP state for the demo member
    async for e in db.events.find({"starts_at": {"$gte": _iso(0)}}).sort("starts_at", 1).limit(3):
        await db.events.update_one({"id": e["id"]}, {"$set": {
            "agenda": ["Welcome and intros (10 min)", "Main session (35 min)", "Open Q&A (15 min)"],
            "prep": "Bring one specific question you want feedback on.", "capacity": e.get("capacity")}})
    first = await db.events.find_one({"starts_at": {"$gte": _iso(0)}}, sort=[("starts_at", 1)])
    if first:
        await db.events.update_one({"id": first["id"]}, {"$set": {f"rsvps.{me['id']}": "yes"}, "$addToSet": {"attendee_ids": me["id"]}})
    # a mentor assigned to the demo member
    mentor = await db.users.find_one({"role": "mentor", "is_simulated": True})
    if mentor:
        await db.users.update_one({"id": me["id"]}, {"$set": {"mentor_ids": [mentor["id"]]}})
