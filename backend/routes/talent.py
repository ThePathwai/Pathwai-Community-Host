"""Talent pool: find skilled people and startups across Canada, and be found. Everything is opt-in (talent.listed / talent.startup_listed on the
account). The only way to reach someone is a message request they can accept or decline; no email address ever leaves the server."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import talent as tl
from database import hub_db
from .hub import _now, _platform_thread_out, _preview, _request_out, request_gate, require_account

router = APIRouter(tags=["talent"])
MAX_REQUESTS_PER_DAY = 10
PAGE = 60


class TalentIn(BaseModel):
    listed: Optional[bool] = None
    headline: Optional[str] = None
    about: Optional[str] = None
    categories: Optional[List[str]] = None
    skills: Optional[List[str]] = None
    open_to: Optional[List[str]] = None
    availability: Optional[str] = None
    work_mode: Optional[List[str]] = None
    experience: Optional[str] = None
    province: Optional[str] = None
    city: Optional[str] = None
    startup_listed: Optional[bool] = None
    hiring_for: Optional[List[str]] = None
    hiring_note: Optional[str] = None


class MessageIn(BaseModel):
    message: str = Field(min_length=1, max_length=800)


class RespondIn(BaseModel):
    accept: bool


@router.get("/talent/options")
async def talent_options():
    return tl.options()


def _me_out(acc: Dict[str, Any]) -> Dict[str, Any]:
    t = {**tl.clean_profile({}), **(acc.get("talent") or {})}
    st = acc.get("startup") or {}
    return {"talent": t, "complete": tl.is_complete(t), "has_startup": bool(st.get("name")), "startup_name": st.get("name") or "",
            "defaults": {"province": t.get("province") or st.get("province") or "", "city": t.get("city") or ""}}


@router.get("/talent/me")
async def my_talent(acc: dict = Depends(require_account)):
    return _me_out(acc)


@router.put("/talent/me")
async def save_my_talent(body: TalentIn, acc: dict = Depends(require_account)):
    merged = {**(acc.get("talent") or {}), **{k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}}
    cleaned = tl.clean_profile(merged)
    if cleaned["listed"] and not tl.is_complete(cleaned):
        raise HTTPException(status_code=400, detail="To be listed, add a headline, pick at least one area, and say what you are open to.")
    if cleaned["startup_listed"] and not (acc.get("startup") or {}).get("name"):
        raise HTTPException(status_code=400, detail="Add your startup to your profile first, then you can show it to talent.")
    await hub_db().accounts.update_one({"id": acc["id"]}, {"$set": {"talent": cleaned, "updated_at": _now()}})
    return _me_out({**acc, "talent": cleaned})


async def _pool() -> List[Dict[str, Any]]:
    return [a async for a in hub_db().accounts.find({"$or": [{"talent.listed": True}, {"talent.startup_listed": True}]}, {"_id": 0, "password_hash": 0})]


@router.get("/talent")
async def search_talent(kind: str = "people", q: str = "", category: str = "", skill: str = "", open_to: str = "", province: str = "",
                        remote: bool = False, available: bool = False, acc: dict = Depends(require_account)):
    t = acc.get("talent") or {}
    st = acc.get("startup") or {}
    needs_talent = "talent" in (st.get("needs") or [])
    viewer = {"province": t.get("province") or st.get("province") or "", "hiring_for": t.get("hiring_for") or [], "needs_talent": needs_talent,
              "categories": t.get("categories") or []}
    pool = [a for a in await _pool() if a["id"] != acc["id"]]
    f = {"q": q, "category": category if category in tl.CATEGORIES else "", "skill": skill, "open_to": open_to if open_to in tl.OPEN_TO else None,
         "province": province.upper() if province.upper() in tl.PROVINCES else "", "remote": remote, "available": available}
    people = tl.rank_people([tl.person_card(a) for a in pool if tl.listed_person(a)], viewer, f)
    startups = tl.rank_startups([tl.startup_card(a) for a in pool if tl.listed_startup(a)], viewer, f)
    shown = startups if kind == "startups" else people
    return {"kind": "startups" if kind == "startups" else "people", "results": shown[:PAGE], "total": len(shown),
            "counts": {"people": len(people), "startups": len(startups)},
            "viewer": {"province": viewer["province"], "hiring_for": viewer["hiring_for"], "needs_talent": needs_talent, "listed": bool(t.get("listed")),
                       "startup_listed": bool(t.get("startup_listed")), "has_startup": bool(st.get("name")), "complete": tl.is_complete({**tl.clean_profile({}), **t})}}


@router.post("/talent/{account_id}/message", status_code=201)
async def message_request(account_id: str, body: MessageIn, acc: dict = Depends(require_account)):
    """Sends a first message as a request. The other person sees it in their inbox with Accept and Decline; until they accept, you cannot send more."""
    if account_id == acc["id"]:
        raise HTTPException(status_code=400, detail="That is you.")
    target = await hub_db().accounts.find_one({"id": account_id}, {"_id": 0, "password_hash": 0})
    if not target or not (tl.listed_person(target) or tl.listed_startup(target)):
        raise HTTPException(status_code=404, detail="That person is not in the talent pool.")
    text = body.message.strip()
    if len(text) < 10:
        raise HTTPException(status_code=400, detail="Say a little about why you are reaching out (at least a sentence).")
    me_email = acc["email"].strip().lower()
    to_email = target["email"].strip().lower()
    pair = sorted({me_email, to_email})
    now = _now()
    existing = await hub_db().platform_threads.find_one({"participant_emails": pair})
    if existing:
        await request_gate(existing, me_email)  # pending-from-me or declined stops here; pending-from-them is accepted by replying
        thread_id = existing["id"]
    else:
        since = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        sent = await hub_db().platform_threads.count_documents({"request.from_email": me_email, "created_at": {"$gte": since}})
        if sent >= MAX_REQUESTS_PER_DAY:
            raise HTTPException(status_code=429, detail="You have sent a lot of requests today. Try again tomorrow.")
        thread_id = str(uuid.uuid4())
        await hub_db().platform_threads.insert_one({
            "id": thread_id, "participant_emails": pair, "subject": f"Message from {acc.get('name') or 'a founder'}", "context": {"type": "talent", "title": "Talent pool"},
            "created_at": now, "read_at": {me_email: now}, "request": {"state": "pending", "from_email": me_email, "kind": "talent", "created_at": now},
        })
    await hub_db().platform_messages.insert_one({"id": str(uuid.uuid4()), "thread_id": thread_id, "sender_email": me_email, "body": text, "created_at": now})
    await hub_db().platform_threads.update_one({"id": thread_id}, {"$set": {"last_message_at": now, "last_message_preview": _preview(text), "last_sender_email": me_email}})
    t = await hub_db().platform_threads.find_one({"id": thread_id})
    read = dict(t.get("read_at") or {})
    read[me_email] = now
    await hub_db().platform_threads.update_one({"id": thread_id}, {"$set": {"read_at": read}})
    t = await hub_db().platform_threads.find_one({"id": thread_id})
    return {"ok": True, "thread_id": thread_id, "request": _request_out(t, me_email)}


@router.post("/hub/messages/threads/{thread_id}/respond")
async def respond_to_request(thread_id: str, body: RespondIn, acc: dict = Depends(require_account)):
    me_email = acc["email"].strip().lower()
    t = await hub_db().platform_threads.find_one({"id": thread_id})
    if not t or me_email not in t["participant_emails"]:
        raise HTTPException(status_code=404, detail="Conversation not found")
    r = t.get("request")
    if not r or r.get("state") != "pending":
        raise HTTPException(status_code=400, detail="There is no open request here.")
    if r.get("from_email") == me_email:
        raise HTTPException(status_code=403, detail="Only the person it was sent to can answer.")
    await hub_db().platform_threads.update_one({"id": thread_id}, {"$set": {"request.state": "accepted" if body.accept else "declined", "request.responded_at": _now()}})
    t = await hub_db().platform_threads.find_one({"id": thread_id})
    return await _platform_thread_out(t, me_email)
