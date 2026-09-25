"""Connect requests — members can ask another community member for a 20-min chat
(or async question / intro). Requests are tracked as Airtable-tagged signals so
they surface on the community team's ops feed.
"""
from datetime import datetime, timezone
from typing import Optional
import uuid

REQUEST_KINDS = {
    "20-min-chat": {
        "label": "20-min chat",
        "verb": "requested a 20-min chat",
    },
    "async-question": {
        "label": "Async question",
        "verb": "sent an async question",
    },
    "intro": {
        "label": "Warm intro",
        "verb": "asked for a warm intro",
    },
}

DEFAULT_KIND = "20-min-chat"


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def kind_meta(kind: str) -> dict:
    return REQUEST_KINDS.get(kind, REQUEST_KINDS[DEFAULT_KIND])


async def create(
    db,
    *,
    sender: dict,
    recipient: dict,
    kind: str,
    topic: str,
    note: Optional[str] = None,
) -> dict:
    if not sender or not recipient:
        raise ValueError("sender and recipient are required")
    if sender.get("id") == recipient.get("id"):
        raise ValueError("Can't send a connect request to yourself")
    if not topic or not topic.strip():
        raise ValueError("A short topic line is required")
    kind = kind if kind in REQUEST_KINDS else DEFAULT_KIND

    doc = {
        "id": str(uuid.uuid4()),
        "sender_id": sender["id"],
        "sender_name": sender.get("name"),
        "sender_role": sender.get("role"),
        "sender_avatar_url": sender.get("avatar_url"),
        "recipient_id": recipient["id"],
        "recipient_name": recipient.get("name"),
        "recipient_role": recipient.get("role"),
        "recipient_avatar_url": recipient.get("avatar_url"),
        "kind": kind,
        "kind_label": REQUEST_KINDS[kind]["label"],
        "topic": topic.strip()[:240],
        "note": (note or "").strip()[:800] or None,
        "status": "pending",
        "source": "airtable",
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    await db.connect_requests.insert_one(dict(doc))
    return doc


def _strip(doc):
    if doc is None:
        return None
    doc.pop("_id", None)
    return doc


async def list_for_user(db, user_id: str, *, scope: str = "all", limit: int = 24) -> list:
    """scope ∈ {'sent', 'received', 'all'}"""
    if scope == "sent":
        q = {"sender_id": user_id}
    elif scope == "received":
        q = {"recipient_id": user_id}
    else:
        q = {"$or": [{"sender_id": user_id}, {"recipient_id": user_id}]}
    cursor = db.connect_requests.find(q).sort("created_at", -1).limit(limit)
    return [_strip(d) async for d in cursor]


async def respond(db, request_id: str, status: str) -> dict:
    if status not in {"accepted", "declined"}:
        raise ValueError("status must be 'accepted' or 'declined'")
    existing = await db.connect_requests.find_one({"id": request_id})
    if not existing:
        raise ValueError("Request not found")
    await db.connect_requests.update_one(
        {"id": request_id},
        {"$set": {"status": status, "updated_at": _now_iso()}},
    )
    existing["status"] = status
    return _strip(existing)
