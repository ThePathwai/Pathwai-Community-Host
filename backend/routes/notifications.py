import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user, rate_limit
from database import db
from ._common import clean, now_iso

router = APIRouter(tags=["notifications"])


async def ensure_indexes() -> None:
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])


def _push(rows: List[dict]) -> None:
    """Also send each new notification to the person's phones/computers (see routes/push.py), and make
    any page they have open pick it up straight away (see realtime.py)."""
    try:
        import realtime
        from database import current_community
        for r in rows:
            realtime.publish(current_community(), "notifications", user_id=r["user_id"])
    except Exception:  # noqa: BLE001
        pass
    try:
        from .push import schedule_push
        schedule_push(rows)
    except Exception:  # noqa: BLE001
        pass


async def notify(user_id: str, kind: str, title: str, body: str = "", link: Optional[str] = None, meta: Optional[dict] = None):
    row = {
        "id": str(uuid.uuid4()), "user_id": user_id, "kind": kind, "title": title, "body": body,
        "link": link, "meta": meta or {}, "read": False, "created_at": now_iso(),
    }
    await db.notifications.insert_one(dict(row))
    _push([row])


async def notify_members(kind_key: str, kind: str, title: str, body: str = "", link: Optional[str] = None,
                         meta: Optional[dict] = None, exclude: Optional[List[str]] = None) -> int:
    """Tell every current member of this community about something (a new event, a new member).

    Skips people who are still waiting for approval or were turned down, anyone in `exclude` (the person
    who caused the change), and anyone who switched in-app notifications -- or this `kind_key`
    ("events", "members", ...) -- off in Settings. Returns how many were notified. Never raises: a
    notification problem must not break the action that triggered it."""
    try:
        skip = set(exclude or [])
        stamp = now_iso()
        rows = []
        async for u in db.users.find({"membership_status": {"$nin": ["pending", "rejected"]}}, {"id": 1, "settings": 1}):
            if u["id"] in skip:
                continue
            prefs = ((u.get("settings") or {}).get("notifications")) or {}
            if prefs.get("in_app") is False or (prefs.get("kinds") or {}).get(kind_key) is False:
                continue
            rows.append({"id": str(uuid.uuid4()), "user_id": u["id"], "kind": kind, "title": title, "body": body,
                         "link": link, "meta": meta or {}, "read": False, "created_at": stamp})
        if rows:
            await db.notifications.insert_many([dict(r) for r in rows])
            _push(rows)
        return len(rows)
    except Exception:  # noqa: BLE001
        import logging
        logging.getLogger(__name__).warning("notify_members failed for %s", kind, exc_info=True)
        return 0


@router.post("/notifications/test")
async def send_test(me: dict = Depends(get_current_user)):
    """"Send me a test": the one way an admin can see a pop-up work, since you're never alerted about
    your own actions (adding an event, approving someone)."""
    await rate_limit("notify_test", me["id"], 10, 3600, "That's plenty of tests for now. Try again in a little while.")
    await notify(me["id"], "test", "Test notification", "If this popped up, alerts are working on this device.", "/notifications")
    return {"ok": True}


class ReadIn(BaseModel):
    ids: Optional[List[str]] = None


@router.get("/notifications")
async def list_notifications(unread_only: bool = False, limit: int = 50, sync: bool = True, me: dict = Depends(get_current_user)):
    # `sync=false` is what the browser's background check uses every 30 seconds: it only needs what's
    # new, so it skips regenerating the due-soon/event reminders (those still refresh when you open
    # the Notifications page or the app).
    if sync:
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
