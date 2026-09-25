import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from database import db
from ._common import clean, now_iso

router = APIRouter(tags=["notifications"])


async def ensure_indexes() -> None:
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])


async def notify(user_id: str, kind: str, title: str, body: str = "", link: Optional[str] = None, meta: Optional[dict] = None):
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()), "user_id": user_id, "kind": kind, "title": title, "body": body,
        "link": link, "meta": meta or {}, "read": False, "created_at": now_iso(),
    })


class ReadIn(BaseModel):
    ids: Optional[List[str]] = None


@router.get("/notifications")
async def list_notifications(unread_only: bool = False, limit: int = 50, me: dict = Depends(get_current_user)):
    from .portal import sync_reminders
    await sync_reminders(me)
    q = {"user_id": me["id"]}
    if unread_only:
        q["read"] = False
    items = [clean(n) async for n in db.notifications.find(q).sort("created_at", -1).limit(limit)]
    return {"notifications": items, "unread": await db.notifications.count_documents({"user_id": me["id"], "read": False})}


@router.post("/notifications/read")
async def mark_read(body: ReadIn = ReadIn(), me: dict = Depends(get_current_user)):
    q = {"user_id": me["id"]}
    if body.ids:
        q["id"] = {"$in": body.ids}
    await db.notifications.update_many(q, {"$set": {"read": True}})
    return {"ok": True, "unread": await db.notifications.count_documents({"user_id": me["id"], "read": False})}


@router.delete("/notifications/{nid}")
async def delete_notification(nid: str, me: dict = Depends(get_current_user)):
    n = await db.notifications.find_one({"id": nid})
    if not n:
        raise HTTPException(status_code=404, detail="Not found")
    if n["user_id"] != me["id"] and me.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not yours")
    await db.notifications.delete_one({"id": nid})
    return {"ok": True}
