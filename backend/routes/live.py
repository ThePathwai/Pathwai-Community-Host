"""GET /api/live -- the Server-Sent Events stream behind automatic page refresh (see realtime.py)."""
from __future__ import annotations

import asyncio
import json
import time

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

import realtime
from auth import get_current_user
from database import current_community

router = APIRouter(tags=["live"])

PING_SECONDS = 20     # keeps proxies from closing an idle connection
MAX_SECONDS = 600     # then the browser reconnects (and re-syncs): bounds any one connection's lifetime


@router.get("/live")
async def live(request: Request, me: dict = Depends(get_current_user)):
    community = current_community()
    sub = realtime.subscribe(community, me["id"])

    async def stream():
        try:
            yield "retry: 3000\n\nevent: hello\ndata: {}\n\n"
            deadline = time.monotonic() + MAX_SECONDS
            while time.monotonic() < deadline:
                if await request.is_disconnected():
                    break
                try:
                    ev = await asyncio.wait_for(sub.queue.get(), timeout=PING_SECONDS)
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
                    continue
                yield f"event: change\ndata: {json.dumps(ev)}\n\n"
        finally:
            realtime.unsubscribe(community, sub)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"})
