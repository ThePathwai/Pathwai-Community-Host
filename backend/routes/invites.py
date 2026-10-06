import os
import secrets
import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr

from auth import create_access_token, create_refresh_token, hash_password, require_role, set_auth_cookies
from database import db
from directory import reindex_email
from ._common import TERMS_REQUIRED_MSG, audit, clean, now_iso, terms_stamp
from .community_config import get_config

router = APIRouter(tags=["invites"])


class InviteIn(BaseModel):
    email: Optional[str] = None
    role: str = "member"
    note: Optional[str] = None


class AcceptIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    fields: Dict[str, Any] = {}
    accepted_terms: bool = False


@router.post("/invites", status_code=201)
async def create_invite(body: InviteIn, me: dict = Depends(require_role("admin"))):
    doc = {"id": str(uuid.uuid4()), "code": secrets.token_urlsafe(8), "email": body.email, "role": body.role,
           "note": body.note, "status": "pending", "created_by": me["id"], "created_at": now_iso()}
    await db.invites.insert_one(dict(doc))
    await audit(me["id"], "invite.created", "invite", doc["id"])
    return doc


@router.get("/invites")
async def list_invites(_: dict = Depends(require_role("admin"))):
    return [clean(i) async for i in db.invites.find({}).sort("created_at", -1)]


@router.delete("/invites/{code}")
async def revoke(code: str, me: dict = Depends(require_role("admin"))):
    await db.invites.update_one({"code": code}, {"$set": {"status": "revoked"}})
    await audit(me["id"], "invite.revoked", "invite", code)
    return {"ok": True}


@router.get("/invites/{code}")
async def get_invite(code: str):
    inv = await db.invites.find_one({"code": code})
    if not inv or inv["status"] != "pending":
        raise HTTPException(status_code=404, detail="Invite not found or already used")
    cfg = await get_config()
    return {"code": code, "email": inv.get("email"), "role": inv.get("role"), "community_name": cfg["community_name"],
            "signup_fields": cfg["signup_fields"], "member_label_singular": cfg["member_label_singular"]}


@router.post("/invites/{code}/accept", status_code=201)
async def accept(code: str, body: AcceptIn, response: Response):
    inv = await db.invites.find_one({"code": code})
    if not inv or inv["status"] != "pending":
        raise HTTPException(status_code=404, detail="Invite not found or already used")
    cfg = await get_config()
    missing = [f["label"] for f in cfg["signup_fields"] if f.get("required") and not body.fields.get(f["key"])]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required field(s): {', '.join(missing)}")
    if not body.accepted_terms:
        raise HTTPException(status_code=422, detail=TERMS_REQUIRED_MSG)
    if len(body.password) < 10:
        raise HTTPException(status_code=400, detail="Password must be at least 10 characters")
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="An account with that email already exists")
    uid = str(uuid.uuid4())
    doc = {"id": uid, "name": body.name.strip(), "email": email, "password_hash": hash_password(body.password),
           "role": inv.get("role") or "member", "signup_source": "invite", "hidden_from_directory": False,
           "created_at": now_iso(), "updated_at": now_iso(), "custom_fields": {}, **terms_stamp()}
    for k, v in body.fields.items():
        if k in ("title", "company", "location", "bio"):
            doc[k] = v
        elif k == "expertise":
            doc[k] = v if isinstance(v, list) else [x.strip() for x in str(v).split(",") if x.strip()]
        else:
            doc["custom_fields"][k] = v
    await db.users.insert_one(dict(doc))
    await reindex_email(email)
    await db.invites.update_one({"code": code}, {"$set": {"status": "accepted", "accepted_by": uid, "accepted_at": now_iso()}})
    access, refresh = create_access_token(uid, doc["role"]), create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    doc.pop("password_hash")
    return {"ok": True, "user": doc}
