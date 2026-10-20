"""Last-seen tracking, kept apart from the user record so it never leaks through profile endpoints.

`touch(user)` is called for each signed-in request but writes at most once every 15 minutes per person
per community (the in-process cache absorbs the rest), so it adds no meaningful load.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Dict, Tuple

from database import current_community, db

THROTTLE_S = 900
_seen: Dict[Tuple[str, str], float] = {}


async def touch(user: dict) -> None:
    uid = (user or {}).get("id")
    if not uid:
        return
    key = (current_community() or "", uid)
    now = time.time()
    if now - _seen.get(key, 0) < THROTTLE_S:
        return
    if len(_seen) > 50000:
        _seen.clear()
    _seen[key] = now
    try:
        stamp = datetime.now(timezone.utc).isoformat()
        await db.member_activity.update_one({"user_id": uid}, {"$set": {"user_id": uid, "last_seen_at": stamp}}, upsert=True)
    except Exception:  # noqa: BLE001 -- tracking must never break a request
        logging.getLogger(__name__).debug("last-seen write failed", exc_info=True)
