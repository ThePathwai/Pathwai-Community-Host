from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

import audits
from auth import hash_password, require_role
import uuid

from database import current_community, db, hub_db
from directory import find_all_for_email, reindex_email
from ._common import audit, clean, now_iso
from .account import erase_in_community, erase_platform_account, make_reset_link
from .hub import is_platform_admin

router = APIRouter(tags=["admin"])


class AuditRun(BaseModel):
    session_id: Optional[str] = None


@router.get("/admin/audits")
async def audits_catalogue():
    return {"audits": audits.list_audits()}


@router.post("/admin/audits/{kind}")
async def run_audit(kind: str, body: AuditRun = AuditRun(), me: dict = Depends(require_role("admin"))):
    if kind not in audits.AUDIT_KINDS:
        raise HTTPException(status_code=400, detail=f"Unknown audit kind: {kind}")
    return await audits.run_audit(db, kind, "admin", body.session_id)


@router.get("/admin/audit-log")
async def audit_log(
    action: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    since: Optional[str] = None,
    until: Optional[str] = None,
    _: dict = Depends(require_role("admin")),
):
    q = {}
    if action and action != "all":
        q["action"] = action
    win = {}
    for k, v in (("$gte", since), ("$lte", until)):
        if v:
            try:
                win[k] = datetime.fromisoformat(v.replace("Z", "+00:00"))
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid date: {v}")
    if win:
        q["created_at"] = win
    entries = [clean(e) async for e in db.audit_log.find(q).sort("created_at", -1).limit(limit)]
    ids = {e["actor_id"] for e in entries if e.get("actor_id")}
    actors = {}
    if ids:
        async for u in db.users.find({"id": {"$in": list(ids)}}, {"_id": 0, "id": 1, "name": 1, "role": 1}):
            actors[u["id"]] = u
    return {"entries": entries, "actors": actors, "total": len(entries)}


@router.get("/admin/audit-log/actions")
async def audit_actions(_: dict = Depends(require_role("admin"))):
    return {"actions": sorted([a for a in await db.audit_log.distinct("action") if a])}


@router.get("/admin/overview")
async def overview(_: dict = Depends(require_role("admin"))):
    return {
        "members": await db.users.count_documents({}),
        "events": await db.events.count_documents({}),
        "resources": await db.resources.count_documents({}),
        "open_support_requests": await db.support_requests.count_documents({"status": "open"}),
        "pending_applications": await db.applications.count_documents({"status": "pending"}),
        "invites": await db.invites.count_documents({}),
    }


class AdminUserIn(BaseModel):
    name: str
    email: str
    password: str
    role: str = "member"
    hidden_from_directory: bool = False


@router.get("/admin/users")
async def admin_users(_: dict = Depends(require_role("admin"))):
    return [clean(u) async for u in db.users.find({}).sort("name", 1)]


@router.post("/admin/users", status_code=201)
async def admin_create_user(body: AdminUserIn, me: dict = Depends(require_role("admin"))):
    import uuid
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email already exists")
    doc = {"id": str(uuid.uuid4()), "name": body.name, "email": email, "role": body.role,
           "password_hash": hash_password(body.password), "hidden_from_directory": body.hidden_from_directory,
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.users.insert_one(dict(doc))
    await reindex_email(email)
    await audit(me["id"], "admin.user_created", "user", doc["id"])
    doc.pop("password_hash")
    return doc


async def _member_or_404(uid: str) -> dict:
    rec = await db.users.find_one({"id": uid})
    if not rec:
        raise HTTPException(status_code=404, detail="Member not found.")
    return rec


@router.post("/admin/users/{uid}/reset-link")
async def admin_member_reset_link(uid: str, request: Request, me: dict = Depends(require_role("admin"))):
    """A one-time password-reset link for a member who forgot their password (handy while email isn't set up).
    Their login is shared across every community they're in, so a community admin can only do this for someone
    who belongs to THIS community alone; platform admins can do it for anyone."""
    rec = await _member_or_404(uid)
    email = (rec.get("email") or "").strip().lower()
    if not email or rec.get("email_missing"):
        raise HTTPException(status_code=400, detail="This member has no email on file, so there's no login to reset.")
    if rec["id"] == me["id"]:
        raise HTTPException(status_code=400, detail="Use \"Forgot password\" on the sign-in page for your own account.")
    if not is_platform_admin(me.get("email")):
        if is_platform_admin(email):
            raise HTTPException(status_code=403, detail="You can't reset a platform admin's password.")
        others = [slug for slug, _ in await find_all_for_email(email) if slug != current_community()]
        if others:
            raise HTTPException(status_code=403, detail="This person is also in other communities and shares one login with them. Ask them to use \"Forgot password\", or ask a platform admin.")
    await audit(me["id"], "admin.reset_link_issued", "user", uid)
    return {**make_reset_link(request, email), "email": email, "name": rec.get("name")}


@router.delete("/admin/users/{uid}")
async def admin_delete_member(uid: str, me: dict = Depends(require_role("admin"))):
    """Removes a member (or an applicant) from this community, with their profile and activity here. If this was
    the only community they belonged to, their Pathwai account is deleted too, so they can sign up again with the
    same email. Refuses yourself, platform admins and the community's last admin."""
    rec = await _member_or_404(uid)
    email = (rec.get("email") or "").strip().lower()
    if rec["id"] == me["id"]:
        raise HTTPException(status_code=400, detail="You can't delete yourself here. Use Settings → Delete my account.")
    if rec.get("platform_admin") or is_platform_admin(email):
        raise HTTPException(status_code=403, detail="You can't delete a platform admin.")
    if rec.get("role") == "admin":
        others = await db.users.count_documents({"role": "admin", "id": {"$ne": uid}, "platform_admin": {"$ne": True}, "membership_status": {"$in": ["approved", None]}})
        if not others:
            raise HTTPException(status_code=409, detail="This is the community's only admin. Make someone else an admin first.")
    slug = current_community()
    ghost = f"deleted-{uuid.uuid4().hex[:8]}"
    await erase_in_community(slug, rec, email, ghost)
    account_deleted = False
    if email and not rec.get("email_missing"):
        if not await find_all_for_email(email):  # no other community left: clear the platform account too
            hub = await hub_db().accounts.find_one({"email": email})
            await erase_platform_account(email, hub, ghost)
            account_deleted = bool(hub)
    await audit(me["id"], "admin.member_deleted", "user", uid, {"account_deleted": account_deleted})
    return {"ok": True, "account_deleted": account_deleted}


# --------------------------------------------------------------------------- membership approvals
def _req_view(u: dict) -> dict:
    # Mirrors every field the onboarding profile (BuildProfileStep / AccountProfileForm) collects, so an
    # admin reviewing an application sees the same profile the applicant already built — not a trimmed copy.
    contact = u.get("contact") or {}
    return {"id": u["id"], "name": u.get("name"), "email": None if u.get("email_missing") else u.get("email"), "title": u.get("title"), "company": u.get("company"),
            "bio": u.get("bio"), "tagline": u.get("tagline"), "join_reason": u.get("join_reason"), "avatar_url": u.get("avatar_url"),
            "location": u.get("location"), "age": u.get("age"), "status": u.get("membership_status", "approved"), "requested_at": u.get("created_at"),
            "decided_at": u.get("membership_decided_at"), "protected": bool(u.get("platform_admin")) or is_platform_admin(u.get("email")), "role": u.get("role"), "decided_by_name": u.get("membership_decided_by_name"), "note": u.get("membership_note"),
            "skill_set": u.get("skill_set") or u.get("expertise") or [], "interests_hobbies": u.get("interests_hobbies") or [],
            "goals": u.get("goals") or [], "support_needs": u.get("support_needs") or [],
            "linkedin": contact.get("linkedin") or (u.get("social_links") or {}).get("linkedin"),
            "phone": contact.get("phone"), "instagram": contact.get("instagram"), "website": contact.get("website")}


@router.get("/admin/membership-requests")
async def membership_requests(status: str = "pending", _: dict = Depends(require_role("admin"))):
    # Anyone with no status on record (older members, people added by an invite) counts as approved, same as at sign-in.
    rows = [u async for u in db.users.find({}) if (u.get("membership_status") or "approved") in ("pending", "approved", "rejected")]
    for u in rows:
        u["membership_status"] = u.get("membership_status") or "approved"
    counts = {"pending": 0, "approved": 0, "rejected": 0}
    for u in rows:
        counts[u["membership_status"]] += 1
    if status != "all":
        rows = [u for u in rows if u["membership_status"] == status]
    rows.sort(key=lambda u: str(u.get("membership_decided_at") or u.get("created_at") or ""), reverse=True)
    return {"requests": [_req_view(u) for u in rows], "counts": counts}


class MembershipDecision(BaseModel):
    decision: str
    note: Optional[str] = None


@router.post("/admin/membership-requests/{uid}/decision")
async def decide_membership(uid: str, body: MembershipDecision, me: dict = Depends(require_role("admin"))):
    if body.decision not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="decision must be approve or reject")
    u = await db.users.find_one({"id": uid})
    if not u:
        raise HTTPException(status_code=404, detail="Membership request not found")
    approved = body.decision == "approve"
    await db.users.update_one({"id": uid}, {"$set": {
        "membership_status": "approved" if approved else "rejected", "hidden_from_directory": not approved,
        "membership_decided_at": now_iso(), "membership_decided_by": me["id"], "membership_decided_by_name": me.get("name"),
        "membership_note": (body.note or "").strip() or None}})
    await audit(me["id"], "membership.approved" if approved else "membership.rejected", "user", uid, {"note": body.note})
    from .notifications import notify, notify_members
    if approved:
        await notify(uid, "membership", "Welcome to the community", "Your membership request was approved. You can now sign in.", "/")
        # ...and the rest of the community hears someone new has joined.
        await notify_members("members", "member_joined", f"{u.get('name') or 'Someone'} joined the community", "Say hello.",
                             link=f"/members/{uid}", meta={"user_id": uid}, exclude=[uid, me["id"]])
    else:
        await notify(uid, "membership", "Your membership request wasn't approved", "The community team reviewed your request and wasn't able to approve it this time.", "/")
    return {"ok": True, "status": "approved" if approved else "rejected"}
