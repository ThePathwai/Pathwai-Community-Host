"""In-app, email-style direct messaging between members.

This is the one place members actually talk: the "Reach out" button on a member's profile, the
"Request an intro" flow on Matches, the "Message" action on a Help board post, and the "New message"
composer on the Messages tab itself all create or continue a conversation here, in Pathwai -- never a
hand-off to the member's own phone or inbox. A conversation is identified by its exact set of
participants (like an email thread's recipient list, not a persistent group channel): messaging the
same one-or-more people again continues the existing thread instead of forking a new one, but the
Subject set when the thread is started is cosmetic after that -- replies don't carry their own
subject, same as replying to an email. Most threads are one-to-one, but the composer lets someone
address several members at once (see `recipient_ids`), the way an email's To: field can.

See connect_requests.py for a different, older mechanism (a structured "kind" of request -- 20-min
chat, async question -- that the recipient explicitly accepts or declines). That one still exists for
the communities already using it; this module is the general-purpose inbox and is what every new
"contact a member" entry point should use.
"""
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from database import db
from ._common import audit, clean, now_iso
from .notifications import notify

router = APIRouter(tags=["messages"])


async def ensure_indexes() -> None:
    await db.message_threads.create_index("participant_ids")
    await db.message_threads.create_index([("last_message_at", -1)])
    await db.messages.create_index([("thread_id", 1), ("created_at", 1)])


def _preview(body: str, n: int = 140) -> str:
    body = " ".join((body or "").split())
    return body if len(body) <= n else body[: n - 1].rstrip() + "…"


async def _thread_out(t: Dict[str, Any], me_id: str) -> Dict[str, Any]:
    t = clean(t)
    other_ids = [p for p in t["participant_ids"] if p != me_id]
    others = []
    for oid in other_ids:
        u = await db.users.find_one({"id": oid})
        # `role` rides along so the inbox can filter "who's it with" by Members vs. Admin & team
        # (see Inbox.jsx's filter bar and RecipientPicker's contact filter, which do the same thing
        # when picking a recipient to compose to).
        others.append({"id": u["id"], "name": u["name"], "avatar_url": u.get("avatar_url"), "title": u.get("title"), "role": u.get("role")}
                      if u else {"id": oid, "name": "Former member", "avatar_url": None, "title": None, "role": None})
    t["others"] = others
    t["other"] = others[0] if others else None  # convenience for the common one-to-one case
    my_read_at = (t.get("read_at") or {}).get(me_id)
    t["unread"] = bool(t.get("last_message_at") and t.get("last_sender_id") != me_id and (not my_read_at or my_read_at < t["last_message_at"]))
    t.pop("read_at", None)
    return t


class ThreadIn(BaseModel):
    recipient_ids: List[str] = Field(min_length=1)
    subject: str = ""
    body: str
    context: Optional[Dict[str, Any]] = None  # e.g. {"type": "support_request", "id": ..., "title": ...}


class ReplyIn(BaseModel):
    body: str


@router.get("/messages/threads")
async def list_threads(me: dict = Depends(get_current_user)):
    items = [t async for t in db.message_threads.find({"participant_ids": me["id"]}).sort("last_message_at", -1)]
    out = [await _thread_out(t, me["id"]) for t in items]
    return {"threads": out, "unread": sum(1 for t in out if t["unread"])}


@router.post("/messages/threads", status_code=201)
async def start_thread(body: ThreadIn, me: dict = Depends(get_current_user)):
    if not body.body.strip():
        raise HTTPException(status_code=400, detail="Write a message")
    recipient_ids = sorted({r for r in body.recipient_ids if r and r != me["id"]})
    if not recipient_ids:
        raise HTTPException(status_code=400, detail="Add at least one recipient")
    for rid in recipient_ids:
        if not await db.users.find_one({"id": rid}):
            raise HTTPException(status_code=404, detail="One of the people you added isn't a member here")
    participant_ids = sorted({me["id"], *recipient_ids})
    now = now_iso()
    existing = await db.message_threads.find_one({"participant_ids": participant_ids})
    if existing:
        thread_id = existing["id"]
    else:
        thread_id = str(uuid.uuid4())
        await db.message_threads.insert_one({
            "id": thread_id, "participant_ids": participant_ids, "subject": body.subject.strip()[:140] or "New message",
            "context": body.context, "created_at": now, "read_at": {me["id"]: now},
        })
    await db.messages.insert_one({"id": str(uuid.uuid4()), "thread_id": thread_id, "sender_id": me["id"], "body": body.body.strip(), "created_at": now})
    await db.message_threads.update_one({"id": thread_id}, {"$set": {
        "last_message_at": now, "last_message_preview": _preview(body.body), "last_sender_id": me["id"], f"read_at.{me['id']}": now,
    }})
    for rid in recipient_ids:
        await notify(rid, "message", f"{me.get('name')} sent you a message", _preview(body.body), link=f"/inbox/{thread_id}")
    t = await db.message_threads.find_one({"id": thread_id})
    return await _thread_out(t, me["id"])


@router.get("/messages/threads/{thread_id}")
async def get_thread(thread_id: str, me: dict = Depends(get_current_user)):
    t = await db.message_threads.find_one({"id": thread_id})
    if not t or me["id"] not in t["participant_ids"]:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.message_threads.update_one({"id": thread_id}, {"$set": {f"read_at.{me['id']}": now_iso()}})
    t = await db.message_threads.find_one({"id": thread_id})
    out = await _thread_out(t, me["id"])
    out["messages"] = [clean(m) async for m in db.messages.find({"thread_id": thread_id}).sort("created_at", 1)]
    return out


@router.post("/messages/threads/{thread_id}/reply", status_code=201)
async def reply(thread_id: str, body: ReplyIn, me: dict = Depends(get_current_user)):
    if not body.body.strip():
        raise HTTPException(status_code=400, detail="Write a message")
    t = await db.message_threads.find_one({"id": thread_id})
    if not t or me["id"] not in t["participant_ids"]:
        raise HTTPException(status_code=404, detail="Conversation not found")
    now = now_iso()
    msg = {"id": str(uuid.uuid4()), "thread_id": thread_id, "sender_id": me["id"], "body": body.body.strip(), "created_at": now}
    await db.messages.insert_one(dict(msg))
    await db.message_threads.update_one({"id": thread_id}, {"$set": {
        "last_message_at": now, "last_message_preview": _preview(body.body), "last_sender_id": me["id"], f"read_at.{me['id']}": now,
    }})
    for pid in t["participant_ids"]:
        if pid != me["id"]:
            await notify(pid, "message", f"{me.get('name')} sent you a message", _preview(body.body), link=f"/inbox/{thread_id}")
    return clean(msg)


class ReportIn(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


async def _resync_thread_summary(thread_id: str) -> None:
    """After a message is deleted, the thread's list-row preview (last_message_at/preview/sender)
    has to point at whatever is now actually the newest message -- otherwise a deleted message's
    text would keep showing in the inbox list even though opening the thread no longer has it."""
    last = await db.messages.find({"thread_id": thread_id}).sort("created_at", -1).limit(1).to_list(1)
    if last:
        m = last[0]
        await db.message_threads.update_one({"id": thread_id}, {"$set": {
            "last_message_at": m["created_at"], "last_message_preview": _preview(m["body"]), "last_sender_id": m["sender_id"],
        }})
    else:
        t = await db.message_threads.find_one({"id": thread_id})
        await db.message_threads.update_one({"id": thread_id}, {"$set": {
            "last_message_at": t["created_at"], "last_message_preview": "", "last_sender_id": None,
        }})


@router.delete("/messages/threads/{thread_id}/messages/{message_id}")
async def delete_message(thread_id: str, message_id: str, me: dict = Depends(get_current_user)):
    t = await db.message_threads.find_one({"id": thread_id})
    if not t or me["id"] not in t["participant_ids"]:
        raise HTTPException(status_code=404, detail="Conversation not found")
    m = await db.messages.find_one({"id": message_id, "thread_id": thread_id})
    if not m:
        raise HTTPException(status_code=404, detail="Message not found")
    if m["sender_id"] != me["id"] and me.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only the sender can delete this message")
    await db.messages.delete_one({"id": message_id})
    await _resync_thread_summary(thread_id)
    await audit(me["id"], "message.deleted", "message", message_id, {"thread_id": thread_id, "by_admin": m["sender_id"] != me["id"]})
    return {"ok": True}


@router.post("/messages/threads/{thread_id}/messages/{message_id}/report", status_code=201)
async def report_message(thread_id: str, message_id: str, body: ReportIn, me: dict = Depends(get_current_user)):
    """Flags a message for the community's admins to review for conduct, same shape as a help-board
    report would take -- it doesn't remove or hide the message (only Delete does that), it just puts
    it in front of the team. Shows up in Admin > Audit log (filterable by the "message.reported"
    action) and pings every admin the way a new membership request does."""
    t = await db.message_threads.find_one({"id": thread_id})
    if not t or me["id"] not in t["participant_ids"]:
        raise HTTPException(status_code=404, detail="Conversation not found")
    m = await db.messages.find_one({"id": message_id, "thread_id": thread_id})
    if not m:
        raise HTTPException(status_code=404, detail="Message not found")
    reported_user = await db.users.find_one({"id": m["sender_id"]})
    await audit(me["id"], "message.reported", "message", message_id, {
        "thread_id": thread_id, "reason": body.reason.strip(), "message_preview": _preview(m["body"]),
        "reported_user_id": m["sender_id"], "reported_user_name": (reported_user or {}).get("name"),
    })
    async for a in db.users.find({"role": "admin"}):
        await notify(a["id"], "message_reported", "A message was reported", body.reason.strip()[:140], link="/admin?tab=audit")
    return {"ok": True}
