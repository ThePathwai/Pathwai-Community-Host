"""Push notifications: the pop-up on a phone's lock screen or a desktop even when Pathwai isn't open.

How it fits together
  * The browser registers a service worker (frontend/public/sw.js) and subscribes to its vendor's push
    service (Google, Apple, Mozilla or Microsoft). It hands us the subscription: POST /push/subscribe.
  * Whenever a notification row is created (routes/notifications.py -> notify / notify_members) we also
    send a push to that person's subscribed devices.
  * The push is signed with a VAPID key pair. No setup needed: if VAPID_PRIVATE_KEY isn't set in the
    environment, a pair is generated on first use and kept (encrypted) in the platform database.

Security notes
  * The server POSTs to whatever endpoint a signed-in user registers, so endpoints are restricted to the
    real push-service hosts below (https only). Otherwise a user could point it at an internal address.
  * A device is unsubscribed on sign-out, and when its push service says it's gone (404/410).
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from database import db, hub_db
from ._common import now_iso

logger = logging.getLogger(__name__)
router = APIRouter(tags=["push"])

ALLOWED_PUSH_HOSTS = ("fcm.googleapis.com", "updates.push.services.mozilla.com", "push.services.mozilla.com")
ALLOWED_PUSH_SUFFIXES = (".push.services.mozilla.com", ".push.apple.com", ".notify.windows.com")
MAX_DEVICES_PER_USER = 10
_TASKS: set = set()
_VAPID: Dict[str, Any] = {}


def endpoint_allowed(url: str) -> bool:
    try:
        u = urlparse(url)
    except Exception:  # noqa: BLE001
        return False
    host = (u.hostname or "").lower()
    if u.scheme != "https" or not host or u.port not in (None, 443) or u.username or u.password:
        return False
    return host in ALLOWED_PUSH_HOSTS or host.endswith(ALLOWED_PUSH_SUFFIXES)


# --------------------------------------------------------------------------- VAPID keys
def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


async def vapid() -> Dict[str, str]:
    """{'private': PEM, 'public': base64url uncompressed point, 'subject': 'mailto:...'}"""
    if _VAPID:
        return _VAPID
    from cryptography.hazmat.primitives import serialization
    from py_vapid import Vapid

    contact = (os.environ.get("REACT_APP_LEGAL_EMAIL") or os.environ.get("PLATFORM_ADMIN_EMAILS", "").split(",")[0]).strip() or "admin@example.com"
    subject = os.environ.get("VAPID_SUBJECT") or f"mailto:{contact}"
    pem = (os.environ.get("VAPID_PRIVATE_KEY") or "").replace("\\n", "\n").strip()
    if not pem:
        from .integrations import dec, enc

        row = await hub_db().platform_settings.find_one({"_key": "vapid"})
        if row and row.get("private_enc"):
            pem = dec(row["private_enc"])
        if not pem:
            v = Vapid()
            v.generate_keys()
            pem = v.private_pem().decode()
            await hub_db().platform_settings.update_one({"_key": "vapid"}, {"$set": {"private_enc": enc(pem), "created_at": now_iso()}}, upsert=True)
    v = Vapid.from_pem(pem.encode())
    pub = v.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    _VAPID.update({"private": pem, "public": _b64url(pub), "subject": subject})
    return _VAPID


# --------------------------------------------------------------------------- endpoints
class KeysIn(BaseModel):
    p256dh: str = Field(min_length=20, max_length=200)
    auth: str = Field(min_length=8, max_length=100)


class SubscribeIn(BaseModel):
    endpoint: str = Field(min_length=20, max_length=1000)
    keys: KeysIn


class UnsubscribeIn(BaseModel):
    endpoint: str


@router.get("/push/public-key")
async def public_key():
    return {"key": (await vapid())["public"]}


@router.post("/push/subscribe")
async def subscribe(body: SubscribeIn, me: dict = Depends(get_current_user)):
    if not endpoint_allowed(body.endpoint):
        raise HTTPException(status_code=400, detail="That push address isn't from a supported browser push service.")
    existing = [s async for s in db.push_subscriptions.find({"user_id": me["id"]}).sort("created_at", 1)]
    mine = any(s["endpoint"] == body.endpoint for s in existing)
    if not mine and len(existing) >= MAX_DEVICES_PER_USER:
        await db.push_subscriptions.delete_one({"id": existing[0]["id"]})  # drop the oldest device
    await db.push_subscriptions.update_one(
        {"endpoint": body.endpoint},
        {"$set": {"user_id": me["id"], "keys": body.keys.model_dump(), "updated_at": now_iso()},
         "$setOnInsert": {"id": os.urandom(8).hex(), "created_at": now_iso()}},
        upsert=True)
    return {"ok": True}


@router.post("/push/unsubscribe")
async def unsubscribe(body: UnsubscribeIn, me: dict = Depends(get_current_user)):
    await db.push_subscriptions.delete_many({"endpoint": body.endpoint, "user_id": me["id"]})
    return {"ok": True}


async def ensure_indexes() -> None:
    await db.push_subscriptions.create_index([("endpoint", 1)], unique=True)
    await db.push_subscriptions.create_index([("user_id", 1)])


# --------------------------------------------------------------------------- sending
def _send_one(sub: Dict[str, Any], payload: str, key: Dict[str, str]):
    """Blocking send to one device (run in a thread). Returns the HTTP status."""
    from py_vapid import Vapid
    from pywebpush import WebPushException, webpush

    try:
        r = webpush(subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]}, data=payload,
                    vapid_private_key=Vapid.from_pem(key["private"].encode()), vapid_claims={"sub": key["subject"]}, ttl=86400, timeout=10)
        return getattr(r, "status_code", 201)
    except WebPushException as exc:
        return getattr(getattr(exc, "response", None), "status_code", None) or 0


async def _deliver(rows: List[Dict[str, Any]]) -> None:
    try:
        ids = list({r["user_id"] for r in rows})
        async for u in db.users.find({"id": {"$in": ids}}, {"id": 1, "settings": 1}):
            if (((u.get("settings") or {}).get("notifications")) or {}).get("in_app") is False:
                ids.remove(u["id"])  # they switched notifications off in Settings
        subs: Dict[str, List[Dict[str, Any]]] = {}
        async for s in db.push_subscriptions.find({"user_id": {"$in": ids}}):
            subs.setdefault(s["user_id"], []).append(s)
        if not subs:
            return
        key = await vapid()
        limit = asyncio.Semaphore(8)

        async def one(sub, payload):
            async with limit:
                status = await asyncio.to_thread(_send_one, sub, payload, key)
            if status in (404, 410):  # the device uninstalled / revoked it
                await db.push_subscriptions.delete_one({"endpoint": sub["endpoint"]})
            elif status and status >= 400:
                logger.info("push to a device failed with %s", status)

        jobs = []
        for r in rows:
            payload = json.dumps({"title": r["title"], "body": r.get("body") or "", "url": r.get("link") or "/notifications", "tag": r["id"]})
            jobs += [one(s, payload) for s in subs.get(r["user_id"], [])]
        await asyncio.gather(*jobs, return_exceptions=True)
    except Exception:  # noqa: BLE001
        logger.warning("push delivery failed", exc_info=True)


def schedule_push(rows: List[Dict[str, Any]]) -> None:
    """Fire-and-forget: never slows down or breaks the request that created the notifications."""
    if not rows:
        return
    try:
        t = asyncio.get_running_loop().create_task(_deliver(rows))  # copies the pinned-community context
        _TASKS.add(t)
        t.add_done_callback(_TASKS.discard)
    except Exception:  # noqa: BLE001
        logger.warning("could not schedule push", exc_info=True)
