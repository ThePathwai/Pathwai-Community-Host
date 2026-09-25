from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

import chatbot
from database import db
from ._common import viewer

router = APIRouter(tags=["chat"])


class ChatIn(BaseModel):
    message: str
    session_id: Optional[str] = None
    role: Optional[str] = "founder"


_ROUTES = [
    (("event", "game", "clinic", "tournament", "attend", "night"), "Browse events", "/events"),
    (("mentor", "who can help", "connect", "member", "introduc", "match", "partner"), "See recommended connections", "/matches"),
    (("resource", "perk", "discount", "deal", "offer", "guide"), "Browse perks", "/resources"),
    (("due", "request", "form", "update", "todo", "task", "availability"), "View your requests", "/requests"),
    (("profile", "bio", "missing"), "Edit your profile", "/profile"),
    (("support", "help me", "stuck"), "Ask the team for support", "/support"),
    (("announcement", "news"), "Read updates", "/updates"),
]


def _actions(message: str, me):
    m = (message or "").lower()
    acts = [{"label": label, "to": to} for keys, label, to in _ROUTES if any(k in m for k in keys)]
    return acts[:3] or [{"label": "See recommended connections", "to": "/matches"}, {"label": "View your requests", "to": "/requests"}]


class ResetIn(BaseModel):
    session_id: str


@router.get("/chat/quick-starts")
async def quick_starts(role: str = "founder"):
    return {"role": role, "prompts": chatbot.QUICK_STARTS_BY_ROLE.get(role, chatbot.QUICK_STARTS_BY_ROLE["member"])}


@router.post("/chat/message")
async def chat_message(body: ChatIn, request: Request):
    me = await viewer(request, body.role)
    role = (me or {}).get("role") or body.role or "member"
    sid = await chatbot.get_or_create_session(db, body.session_id, role)
    try:
        reply = await chatbot.send_chat(db, sid, role, body.message)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return {"session_id": sid, "reply": reply, "actions": _actions(body.message, me)}


@router.get("/chat/history")
async def chat_history(session_id: str):
    return {"session_id": session_id, "messages": await chatbot.load_history(db, session_id, limit=100)}


@router.post("/chat/reset")
async def chat_reset(body: ResetIn):
    await db.chat_messages.delete_many({"session_id": body.session_id})
    return {"ok": True}
