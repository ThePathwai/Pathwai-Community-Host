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


@router.get("/push/status")
async def status(me: dict = Depends(get_current_user)):
    """What the server knows about my registered devices and how the last push to each went."""
    devices = [{"host": _host(d["endpoint"]), "added": d.get("created_at"), "last_status": d.get("last_status"),
                "last_detail": d.get("last_detail"), "last_at": d.get("last_at")}
               async for d in db.push_subscriptions.find({"user_id": me["id"]})]
    return {"devices": devices}


class TestIn(BaseModel):
    endpoint: Optional[str] = None


@router.post("/push/test")
async def push_test(body: TestIn = TestIn(), me: dict = Depends(get_current_user)):
    """Send a real push right now and report exactly what each push service answered. Unlike the bell
    test, this can't be faked by the page being open, so it proves push itself works."""
    from auth import rate_limit

    await rate_limit("push_test", me["id"], 20, 3600, "That's plenty of tests for now. Try again in a little while.")
    q: Dict[str, Any] = {"user_id": me["id"]}
    if body.endpoint:
        q["endpoint"] = body.endpoint
    subs = [d async for d in db.push_subscriptions.find(q)]
    if not subs:
        return {"devices": [], "message": "This device isn't registered for push yet."}
    key = await vapid()
    payload = json.dumps({"title": "Push test", "body": "If you can see this, push works on this device.", "url": "/notifications", "tag": "push-test-" + os.urandom(3).hex()})
    out = []
    for sub in subs:
        status_code, detail = _unpack(await asyncio.to_thread(_send_one, sub, payload, key))
        if status_code in (404, 410):
            await db.push_subscriptions.delete_one({"endpoint": sub["endpoint"]})
        else:
            await db.push_subscriptions.update_one({"endpoint": sub["endpoint"]}, {"$set": {"last_status": status_code, "last_detail": detail, "last_at": now_iso()}})
        out.append({"host": _host(sub["endpoint"]), "endpoint": sub["endpoint"], "status": status_code, "detail": detail, "ok": 200 <= status_code < 300})
    return {"devices": out}


async def ensure_indexes() -> None:
    await db.push_subscriptions.create_index([("endpoint", 1)], unique=True)
    await db.push_subscriptions.create_index([("user_id", 1)])


# --------------------------------------------------------------------------- sending
def _send_one(sub: Dict[str, Any], payload: str, key: Dict[str, str]):
    """Blocking send to one device (run in a thread). Returns (HTTP status, short detail); status 0 means
    we never got an answer (network error, bad key...). High urgency so a locked, sleeping phone is woken
    right away instead of the message waiting for the phone's next battery-saver check-in."""
    from py_vapid import Vapid
    from pywebpush import WebPushException, webpush

    try:
        r = webpush(subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]}, data=payload,
                    vapid_private_key=Vapid.from_pem(key["private"].encode()), vapid_claims={"sub": key["subject"]},
                    ttl=86400, timeout=10, headers={"Urgency": "high"})
        return getattr(r, "status_code", 201), ""
    except WebPushException as exc:
        resp = getattr(exc, "response", None)
        return (getattr(resp, "status_code", None) or 0), (getattr(resp, "text", "") or str(exc))[:200]
    except Exception as exc:  # noqa: BLE001
        return 0, f"{type(exc).__name__}: {exc}"[:200]


def _unpack(result) -> tuple:
    return result if isinstance(result, tuple) else (result, "")


def _host(endpoint: str) -> str:
    return urlparse(endpoint).hostname or "?"


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
                status, detail = _unpack(await asyncio.to_thread(_send_one, sub, payload, key))
            if status in (404, 410):  # the device uninstalled / revoked it
                await db.push_subscriptions.delete_one({"endpoint": sub["endpoint"]})
                return
            if not 200 <= status < 300:
                logger.warning("push to a %s device failed: status %s %s", _host(sub["endpoint"]), status, detail)
            await db.push_subscriptions.update_one({"endpoint": sub["endpoint"]}, {"$set": {"last_status": status, "last_detail": detail, "last_at": now_iso()}})

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
