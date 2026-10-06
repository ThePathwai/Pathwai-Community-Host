"""Live refresh: a write in a community pings that community's other open tabs (and nobody else's)."""
import json
import os
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
os.environ["ENABLE_AI_CHAT"] = "true"

from fastapi.testclient import TestClient

import server
from routes import live as live_mod


def test_live_topic_mapping():
    t = server.live_topic
    assert t("/api/events") == "events" and t("/api/events/abc/rsvp") == "events"
    assert t("/api/events/abc/view") is None  # analytics beacon: nobody needs a refresh for it
    assert t("/api/admin/membership-requests/x/decision") == "members" and t("/api/admin/invites") == "admin"
    assert t("/api/announcements") == "updates" and t("/api/messages/threads/1") == "messages"
    assert t("/api/auth/login") is None and t("/api/push/subscribe") is None and t("/api/notifications/read") is None
    assert t("/health") is None


def _serve(port):
    import uvicorn

    srv = uvicorn.Server(uvicorn.Config(server.app, host="127.0.0.1", port=port, log_level="warning"))
    th = threading.Thread(target=srv.run, daemon=True)
    th.start()
    for _ in range(100):
        if srv.started:
            return srv
        time.sleep(0.1)
    raise RuntimeError("server didn't start")


def _listen(base, cookies, out, cid):
    import httpx

    with httpx.Client(base_url=base, cookies=cookies, timeout=30) as c, c.stream("GET", f"/api/live?cid={cid}") as r:
        out["status"] = r.status_code
        out["ctype"] = r.headers.get("content-type")
        got = []
        for line in r.iter_lines():
            if not line:
                continue
            out.setdefault("lines", []).append(line)
            if line.startswith("data:") and out["lines"][-2] == "event: change":
                got.append(json.loads(line[5:]))
                out["events"] = got
                if {"events", "notifications"} <= {e["topic"] for e in got}:
                    break


def test_a_write_reaches_other_open_tabs_but_not_the_tab_that_made_it():
    import httpx

    live_mod.MAX_SECONDS = 20
    port = 8934
    srv = _serve(port)
    base = f"http://127.0.0.1:{port}"
    try:
        with httpx.Client(base_url=base) as anon:
            assert anon.get("/api/live").status_code == 401  # signed in only
        member = httpx.Client(base_url=base)
        assert member.post("/api/auth/login", json={"email": "demo@yourcommunity.app", "password": "Demo123!"}).status_code == 200
        admin = httpx.Client(base_url=base)
        assert admin.post("/api/auth/login", json={"email": "admin@yourcommunity.app", "password": "Demo123!"}).status_code == 200
        out = {}
        th = threading.Thread(target=_listen, args=(base, member.cookies, out, "tab-A"), daemon=True)
        th.start()
        for _ in range(60):  # wait for the stream to say hello
            if any("hello" in x for x in out.get("lines", [])):
                break
            time.sleep(0.1)
        assert out["status"] == 200 and out["ctype"].startswith("text/event-stream")
        r = admin.post("/api/events", json={"title": "Live Test Mixer", "starts_at": "2031-09-01T18:00:00Z"}, headers={"X-Client-Id": "tab-B"})
        assert r.status_code == 201
        th.join(timeout=10)
        evs = {e["topic"]: e for e in out["events"]}
        assert evs["events"]["origin"] == "tab-B"  # a page skips it when the origin is its own id
        assert "notifications" in evs  # the member's bell is pinged instantly too (targeted at them only)
    finally:
        srv.should_exit = True


def test_events_stay_inside_their_community_and_targeted_ones_reach_only_that_person():
    import asyncio

    import realtime

    async def run():
        a1 = realtime.subscribe("alpha", "u1")
        a2 = realtime.subscribe("alpha", "u2")
        b1 = realtime.subscribe("beta", "u1")
        realtime.publish("alpha", "events", origin="t")
        realtime.publish("alpha", "notifications", user_id="u2")
        await asyncio.sleep(0.05)
        got = lambda s: [s.queue.get_nowait()["topic"] for _ in range(s.queue.qsize())]
        res = (got(a1), got(a2), got(b1))
        for s, c in ((a1, "alpha"), (a2, "alpha"), (b1, "beta")):
            realtime.unsubscribe(c, s)
        return res

    a1, a2, b1 = asyncio.run(run())
    assert a1 == ["events"] and a2 == ["events", "notifications"] and b1 == []
    assert realtime.connected("alpha") == 0
