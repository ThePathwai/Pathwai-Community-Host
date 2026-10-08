"""Self-serve account controls for the signed-in person: download my data, sign out everywhere, delete my
account, plus the platform-admin view of the platform audit log.

These back the promises in the Privacy Policy (access, portability, deletion) and the SOC 2 expectations
around session management and personal-data lifecycle. Every one writes to the platform audit log.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from auth import client_ip, create_reset_token, rate_limit, verify_password
from database import dbfor, hub_db
from directory import _forget_membership, find_all_for_email, list_all_people, revoke_sessions_for_email
from ._common import audit, audit_platform, clean
from .hub import in_community, is_platform_admin, require_account

router = APIRouter(tags=["account"])

# Per-community collections whose rows belong to one person (matched on `user_id`). Exported on request and
# erased on account deletion. `payments` is exported but deliberately KEPT on deletion: payment records are
# financial records the community and its payment provider must retain.
USER_OWNED = ["notifications", "member_requests", "profile_requests", "support_requests", "match_actions",
              "resource_engagement", "event_views", "event_feedback"]
EXPORT_ONLY = ["payments"]
SECRET_FIELDS = ("_id", "password_hash", "sessions_valid_after", "oauth_sub")


def _scrub(doc: Optional[dict]) -> dict:
    return {k: v for k, v in (doc or {}).items() if k not in SECRET_FIELDS}


def _clear_session_cookies(response: Response) -> None:
    for name in ("access_token", "refresh_token", "pw_community"):
        response.delete_cookie(name, path="/")


async def sole_admin_communities(recs: List[Any]) -> List[str]:
    """Names of the communities where this person is the ONLY approved admin (so removing them would leave it with none)."""
    sole: List[str] = []
    for slug, rec in recs:
        if rec.get("role") != "admin":
            continue
        others = await dbfor(slug).users.count_documents({"role": "admin", "id": {"$ne": rec["id"]}, "platform_admin": {"$ne": True},
                                                          "membership_status": {"$in": ["approved", None]}})
        if not others:
            cfg = await dbfor(slug).community_config.find_one({"_key": "singleton"}) or {}
            sole.append(cfg.get("community_name") or slug)
    return sole


async def erase_in_community(slug: str, rec: dict, email: str, ghost: str) -> None:
    """Deletes one person's profile and personal activity in ONE community. Their messages stay (attributed to a
    ghost id) so other people's conversations don't lose their other half."""
    d, uid = dbfor(slug), rec["id"]
    for col in USER_OWNED:
        await d[col].delete_many({"user_id": uid})
    await d.messages.update_many({"sender_id": uid}, {"$set": {"sender_id": ghost}})
    await d.message_threads.update_many({"last_sender_id": uid}, {"$set": {"last_sender_id": ghost}})
    await d.message_threads.update_many({"participant_ids": uid}, {"$pull": {"participant_ids": uid}})
    await d.users.delete_one({"id": uid})
    await _forget_membership(slug, email)
    with in_community(slug):
        await audit(uid, "member.account_deleted", "user", uid)


async def erase_platform_account(email: str, hub: Optional[dict], ghost: str) -> None:
    """Deletes the platform-level (Hub) side of an account: follows, platform messages and the account row itself."""
    h = hub_db()
    ghost_email = f"{ghost}@deleted.invalid"
    await h.follows.delete_many({"$or": [{"follower_email": email}, {"followee_email": email}]})
    await h.platform_messages.update_many({"sender_email": email}, {"$set": {"sender_email": ghost_email}})
    await h.platform_threads.update_many({"last_sender_email": email}, {"$set": {"last_sender_email": ghost_email}})
    async for t in h.platform_threads.find({"participant_emails": email}):
        await h.platform_threads.update_one({"id": t["id"]}, {"$set": {"participant_emails": sorted({*(e for e in t["participant_emails"] if e != email), ghost_email})}})
    if hub:
        await h.accounts.delete_one({"id": hub["id"]})


@router.get("/hub/account/export")
async def export_my_data(request: Request, acc: dict = Depends(require_account)):
    """Everything Pathwai holds about the signed-in person, as one JSON download."""
    await rate_limit("account_export", acc["id"], 5, 3600, "You've requested several exports recently. Please try again later.")
    email = acc["email"].strip().lower()
    hub = await hub_db().accounts.find_one({"email": email})
    out: Dict[str, Any] = {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "notes": "Includes your platform account, your profile and activity in each community, who you follow and "
                 "your platform messages. Payment records are included for your reference. Messages other people "
                 "sent you are not included. Your password is stored only as a one-way hash and is never exported.",
        "account": _scrub(hub) or _scrub(acc),
        "communities": [],
    }
    for slug, rec in await find_all_for_email(email):
        d = dbfor(slug)
        block: Dict[str, Any] = {"slug": slug, "profile": _scrub(rec)}
        for col in USER_OWNED + EXPORT_ONLY:
            block[col] = [_scrub(x) async for x in d[col].find({"user_id": rec["id"]})]
        block["messages_sent"] = [_scrub(x) async for x in d.messages.find({"sender_id": rec["id"]})]
        out["communities"].append(block)
    out["following"] = [f["followee_email"] async for f in hub_db().follows.find({"follower_email": email})]
    out["followers"] = [f["follower_email"] async for f in hub_db().follows.find({"followee_email": email})]
    out["platform_messages_sent"] = [_scrub(m) async for m in hub_db().platform_messages.find({"sender_email": email})]
    await audit_platform(acc["id"], "account.exported", "user", acc["id"], request=request)
    return JSONResponse(jsonable_encoder(out), headers={"Content-Disposition": 'attachment; filename="pathwai-my-data.json"'})


@router.post("/hub/account/sign-out-everywhere")
async def sign_out_everywhere(request: Request, response: Response, acc: dict = Depends(require_account)):
    """Invalidates every session this person has, on every device, including this one."""
    await revoke_sessions_for_email(acc["email"])
    await audit_platform(acc["id"], "auth.sessions_revoked", "user", acc["id"], request=request)
    _clear_session_cookies(response)
    return {"ok": True}


class DeleteAccountIn(BaseModel):
    confirm: str = ""
    password: Optional[str] = None
    email: Optional[str] = None


@router.post("/hub/account/delete")
async def delete_my_account(body: DeleteAccountIn, request: Request, response: Response, acc: dict = Depends(require_account)):
    """Permanently deletes the person's platform account and their profile and personal activity in every
    community. Re-authenticates first (password, or typing the account email for Google/Apple sign-ins) and
    refuses while the person is the only admin of a community, so no community is left without one."""
    await rate_limit("account_delete", acc["id"], 5, 3600, "Too many attempts. Please try again later.")
    email = acc["email"].strip().lower()
    if (body.confirm or "").strip().upper() != "DELETE":
        raise HTTPException(status_code=400, detail='Type DELETE to confirm.')
    hub = await hub_db().accounts.find_one({"email": email})
    recs = await find_all_for_email(email)
    pw_hash = (hub or {}).get("password_hash") or next((r.get("password_hash") for _, r in recs if r.get("password_hash")), None)
    if pw_hash:
        if not body.password or not verify_password(body.password, pw_hash):
            raise HTTPException(status_code=400, detail="That password isn't correct.")
    elif (body.email or "").strip().lower() != email:
        raise HTTPException(status_code=400, detail="Type your account email to confirm.")

    sole = await sole_admin_communities(recs)
    if sole:
        raise HTTPException(status_code=409, detail="You're the only admin of " + ", ".join(sole) + ". Make someone else an admin before deleting your account.")

    ghost = f"deleted-{uuid.uuid4().hex[:8]}"
    slugs = []
    for slug, rec in recs:
        await erase_in_community(slug, rec, email, ghost)
        slugs.append(slug)
    await erase_platform_account(email, hub, ghost)
    # The audit entry keeps the opaque id, never the email: the log must survive deletion, the identity must not.
    await audit_platform(acc["id"], "account.deleted", "user", acc["id"], {"communities": slugs}, request=request)
    _clear_session_cookies(response)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Admin tools: reset a forgotten password by link, and delete an account.
# Email isn't always set up, so "Forgot password" can silently go nowhere; these let an admin hand the person a
# one-time link (or clear the account so they can sign up again) without ever seeing or choosing a password.
# ---------------------------------------------------------------------------
RESET_LINK_DAYS = 7


def make_reset_link(request: Request, email: str) -> Dict[str, Any]:
    """A /reset-password link an admin can send by text or DM. One-time use (see auth_reset_password) and
    expires in RESET_LINK_DAYS days. The admin never sees or sets the password: the person picks their own."""
    base = (os.environ.get("FRONTEND_URL") or "").rstrip("/") or (request.headers.get("origin") or "").rstrip("/") or str(request.base_url).rstrip("/")
    return {"link": f"{base}/reset-password?token={create_reset_token(email, days=RESET_LINK_DAYS)}", "expires_in_days": RESET_LINK_DAYS}


def _need_platform_admin(acc: dict) -> None:
    if not is_platform_admin(acc.get("email")):
        raise HTTPException(status_code=403, detail="Platform admins only.")


class AccountEmailIn(BaseModel):
    email: str
    confirm: str = ""


@router.get("/hub/admin/accounts")
async def platform_accounts(q: str = "", limit: int = Query(50, ge=1, le=200), acc: dict = Depends(require_account)):
    """Every person on the platform (by email), searchable by name or email. Platform admins only."""
    _need_platform_admin(acc)
    ql = (q or "").strip().lower()
    with_account = {a["email"] async for a in hub_db().accounts.find({}, {"email": 1})}
    rows = []
    for p in await list_all_people():
        if ql and ql not in p["email"] and ql not in (p.get("name") or "").lower():
            continue
        rows.append({"email": p["email"], "name": p.get("name") or p["email"], "communities": [slug for slug, _ in p["memberships"]],
                     "has_account": p["email"] in with_account, "platform_admin": is_platform_admin(p["email"])})
    rows.sort(key=lambda r: (r["name"] or "").lower())
    return {"accounts": rows[:limit], "total": len(rows)}


@router.post("/hub/admin/accounts/reset-link")
async def platform_reset_link(body: AccountEmailIn, request: Request, acc: dict = Depends(require_account)):
    _need_platform_admin(acc)
    await rate_limit("admin_reset_link", acc["id"], 30, 3600, "Too many reset links. Please try again later.")
    email = (body.email or "").strip().lower()
    hub = await hub_db().accounts.find_one({"email": email}, {"id": 1})
    recs = await find_all_for_email(email)
    if not hub and not recs:
        raise HTTPException(status_code=404, detail="No account with that email.")
    await audit_platform(acc["id"], "account.reset_link_issued", "user", hub["id"] if hub else recs[0][1]["id"], request=request)
    return make_reset_link(request, email)


@router.post("/hub/admin/accounts/delete")
async def platform_delete_account(body: AccountEmailIn, request: Request, acc: dict = Depends(require_account)):
    """Permanently deletes someone else's platform account and their profile and activity in every community.
    Refuses your own account (use Settings), other platform admins, and anyone who is the only admin of a community."""
    _need_platform_admin(acc)
    await rate_limit("admin_account_delete", acc["id"], 20, 3600, "Too many deletions. Please try again later.")
    email = (body.email or "").strip().lower()
    if (body.confirm or "").strip().upper() != "DELETE":
        raise HTTPException(status_code=400, detail="Type DELETE to confirm.")
    if email == acc["email"].strip().lower():
        raise HTTPException(status_code=400, detail="That's your own account. Delete it from Settings instead.")
    if is_platform_admin(email):
        raise HTTPException(status_code=403, detail="Platform admin accounts can't be deleted from here.")
    hub = await hub_db().accounts.find_one({"email": email})
    recs = await find_all_for_email(email)
    if not hub and not recs:
        raise HTTPException(status_code=404, detail="No account with that email.")
    sole = await sole_admin_communities(recs)
    if sole:
        raise HTTPException(status_code=409, detail="They're the only admin of " + ", ".join(sole) + ". Make someone else an admin first.")
    ghost = f"deleted-{uuid.uuid4().hex[:8]}"
    slugs = []
    for slug, rec in recs:
        await erase_in_community(slug, rec, email, ghost)
        slugs.append(slug)
    await erase_platform_account(email, hub, ghost)
    await audit_platform(acc["id"], "account.deleted_by_admin", "user", (hub or {}).get("id") or (recs[0][1]["id"] if recs else None), {"communities": slugs}, request=request)
    return {"ok": True, "communities": slugs}


@router.get("/hub/admin/audit-log")
async def platform_audit_log(action: Optional[str] = None, limit: int = Query(100, ge=1, le=500), since: Optional[str] = None,
                             acc: dict = Depends(require_account)):
    """Platform audit log (sign-ins, account lifecycle, community creation, platform-admin access). Platform admins only."""
    if not is_platform_admin(acc["email"]):
        raise HTTPException(status_code=403, detail="Platform admins only")
    q: Dict[str, Any] = {}
    if action and action != "all":
        q["action"] = action
    if since:
        try:
            q["created_at"] = {"$gte": datetime.fromisoformat(since.replace("Z", "+00:00"))}
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid date: {since}")
    entries = [clean(e) async for e in hub_db().audit_log.find(q).sort("created_at", -1).limit(limit)]
    return {"entries": jsonable_encoder(entries), "total": len(entries)}
