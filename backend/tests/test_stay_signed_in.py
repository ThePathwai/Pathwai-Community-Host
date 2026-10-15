"""Staying signed in (a year, renewed on use, community stays pinned) and phones registered once, reachable from any community."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"

import pytest
from fastapi.testclient import TestClient

import server
import auth
from routes import push as push_mod

PW = "Demo123!"


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:
        yield client


def _cookie_headers(r):
    return [h.decode() for k, h in r.headers.raw if k.lower() == b"set-cookie"]


def _max_age(headers, name):
    line = next(h for h in headers if h.startswith(name + "="))
    return int(line.lower().split("max-age=")[1].split(";")[0])


def test_sign_in_lasts_a_year_by_default():
    assert auth.REFRESH_DAYS >= 365


def test_login_cookie_and_community_pin_last_a_year(c):
    r = c.post("/api/auth/login", json={"email": "demo@yourcommunity.app", "password": PW})
    assert r.status_code == 200
    h = _cookie_headers(r)
    assert _max_age(h, "refresh_token") >= 364 * 86400
    r2 = c.post("/api/hub/enter", json={"slug": "playr"})
    assert r2.status_code == 200
    assert _max_age(_cookie_headers(r2), "pw_community") >= 364 * 86400


def test_lapsed_access_token_is_renewed_from_the_refresh_cookie(c):
    c.post("/api/auth/login", json={"email": "demo@yourcommunity.app", "password": PW})
    c.post("/api/hub/enter", json={"slug": "playr"})
    # what a phone looks like an hour later: the browser has dropped the short access cookie
    c.cookies.delete("access_token")
    assert c.get("/api/auth/me").status_code == 401
    r = c.post("/api/auth/refresh")
    assert r.status_code == 200
    h = _cookie_headers(r)
    assert any(x.startswith("access_token=") for x in h) and _max_age(h, "refresh_token") >= 364 * 86400
    assert _max_age(h, "pw_community") >= 364 * 86400  # still in the same community
    assert c.get("/api/auth/me").status_code == 200


def test_vapid_subject_is_always_a_real_contact(monkeypatch):
    for k in ("VAPID_SUBJECT", "REACT_APP_LEGAL_EMAIL", "PLATFORM_ADMIN_EMAILS", "FRONTEND_URL", "RAILWAY_PUBLIC_DOMAIN"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("PLATFORM_ADMIN_EMAILS", "me@example.com, fife@gmail.com")
    assert push_mod._vapid_subject() == "mailto:fife@gmail.com"  # placeholder domains are skipped
    monkeypatch.delenv("PLATFORM_ADMIN_EMAILS")
    monkeypatch.setenv("FRONTEND_URL", "https://pathwai.example.org/")
    assert push_mod._vapid_subject() == "https://pathwai.example.org"
    monkeypatch.delenv("FRONTEND_URL")
    monkeypatch.setenv("RAILWAY_PUBLIC_DOMAIN", "pathwai-production.up.railway.app")
    assert push_mod._vapid_subject() == "https://pathwai-production.up.railway.app"
    monkeypatch.setenv("VAPID_SUBJECT", "ops@pathwai.app")
    assert push_mod._vapid_subject() == "mailto:ops@pathwai.app"


def test_a_phone_registered_in_one_community_is_found_from_another(c):
    from database import db, hub_db, set_community
    c.post("/api/auth/login", json={"email": "demo@yourcommunity.app", "password": PW})
    c.post("/api/hub/enter", json={"slug": "playr"})
    uid = c.get("/api/auth/me").json()["id"]
    dev = {"endpoint": "https://web.push.apple.com/QXYZ-mirror-test-endpoint-123456", "keys": {"p256dh": "B" + "x" * 86, "auth": "y" * 22}}
    assert c.post("/api/push/subscribe", json=dev).status_code == 200

    async def look():
        in_hub = await hub_db().push_subscriptions.count_documents({"endpoint": dev["endpoint"]})
        set_community("")  # a different (or no) community is open when the notification is created
        try:
            found = await push_mod._subs_for([uid])
        finally:
            set_community("playr")
        return in_hub, [s["endpoint"] for s in found.get(uid, [])]

    in_hub, found = asyncio.run(look())
    assert in_hub == 1 and dev["endpoint"] in found
    # signing the phone out removes it everywhere
    assert c.post("/api/push/unsubscribe", json={"endpoint": dev["endpoint"]}).status_code == 200

    async def gone():
        return await hub_db().push_subscriptions.count_documents({"endpoint": dev["endpoint"]}), await db.push_subscriptions.count_documents({"endpoint": dev["endpoint"]})

    assert asyncio.run(gone()) == (0, 0)


def test_closed_app_test_goes_through_the_real_notification_path(c, monkeypatch):
    import time
    c.post("/api/auth/login", json={"email": "demo@yourcommunity.app", "password": PW})
    c.post("/api/hub/enter", json={"slug": "playr"})
    # nothing registered yet: tell them what to do first
    c.post("/api/push/unsubscribe", json={"endpoint": "https://web.push.apple.com/none-registered-yet-0000000"})
    from database import db, hub_db

    async def wipe():
        me = c.get("/api/auth/me").json()["id"]
        await db.push_subscriptions.delete_many({"user_id": me}); await hub_db().push_subscriptions.delete_many({"user_id": me})
    asyncio.run(wipe())
    assert c.post("/api/push/test-later", json={"seconds": 5}).json()["ok"] is False

    sent = []
    monkeypatch.setattr(push_mod, "_send_one", lambda sub, payload, key: (sent.append((sub["endpoint"], payload)) or (201, "")))
    dev = {"endpoint": "https://web.push.apple.com/QXYZ-closed-test-endpoint-98765", "keys": {"p256dh": "B" + "x" * 86, "auth": "y" * 22}}
    assert c.post("/api/push/subscribe", json=dev).status_code == 200
    r = c.post("/api/push/test-later", json={"seconds": 5}).json()
    assert r["ok"] is True and r["devices"] == 1
    deadline = time.time() + 12
    while not sent and time.time() < deadline:
        time.sleep(0.3)
    assert sent and sent[0][0] == dev["endpoint"] and "Test while the app is closed" in sent[0][1]
    st = c.get("/api/push/status").json()["devices"]
    assert st and st[0]["last_status"] == 201
    c.post("/api/push/unsubscribe", json={"endpoint": dev["endpoint"]})
    assert c.post("/api/push/test-later", json={"seconds": 1}).status_code == 422  # too soon to be a meaningful test
