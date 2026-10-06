"""Live updates: a tiny in-process "something changed" broadcaster behind Server-Sent Events.

Every browser tab that's signed in keeps one open connection (GET /api/live, routes/live.py). When
anyone changes something -- adds an event, approves a member, sends a message -- the server tells the
other connected people in the SAME community which topic changed ("events", "members", ...). The page
then re-loads its own data through the normal, permission-checked API. Events carry no data, only a
topic, so nothing private travels over this channel.

Single-process by design: it matches the one-replica Railway setup. Running several replicas would need
a shared channel (e.g. Redis pub/sub) behind `publish()`; nothing else would change.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Optional, Set

logger = logging.getLogger(__name__)
MAX_QUEUE = 100


class Subscriber:
    def __init__(self, user_id: str, loop: asyncio.AbstractEventLoop):
        self.user_id = user_id
        self.loop = loop
        self.queue: "asyncio.Queue[Dict[str, Any]]" = asyncio.Queue(maxsize=MAX_QUEUE)

    def _put(self, event: Dict[str, Any]) -> None:
        if self.queue.full():  # a stuck/slow tab: drop the backlog and just tell it to re-sync everything
            while not self.queue.empty():
                self.queue.get_nowait()
            event = {"topic": "*"}
        self.queue.put_nowait(event)


_SUBS: Dict[str, Set[Subscriber]] = {}


def subscribe(community: str, user_id: str) -> Subscriber:
    sub = Subscriber(user_id, asyncio.get_running_loop())
    _SUBS.setdefault(community, set()).add(sub)
    return sub


def unsubscribe(community: str, sub: Subscriber) -> None:
    subs = _SUBS.get(community)
    if subs:
        subs.discard(sub)
        if not subs:
            _SUBS.pop(community, None)


def publish(community: str, topic: str, origin: Optional[str] = None, user_id: Optional[str] = None) -> None:
    """Tell everyone connected to `community` (or only `user_id`) that `topic` changed. `origin` is the
    tab that made the change, so it can skip re-loading what it just updated itself."""
    if not community:
        return
    event = {"topic": topic, "origin": origin}
    for sub in list(_SUBS.get(community, ())):
        if user_id and sub.user_id != user_id:
            continue
        try:
            sub.loop.call_soon_threadsafe(sub._put, event)
        except RuntimeError:  # that tab's loop is gone
            pass


def connected(community: str) -> int:
    return len(_SUBS.get(community, ()))
