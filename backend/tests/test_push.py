"""Push notifications: device registration rules, automatic VAPID keys, and a real encrypted push
delivered to a local stand-in for the browser's push service (decrypted with the device's own key)."""
import base64
import http.server
import json
import os
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
os.environ["ENABLE_AI_CHAT"] = "true"

import pytest
from fastapi.testclient import TestClient

import server
from routes import push as push_mod

PW = "Demo123!"


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:
        yield client


def login(c, email):
    c.post("/api/auth/logout")
    assert c.post("/api/auth/login", json={"email": email, "password": PW}).status_code == 200


def _device(endpoint="https://fcm.googleapis.com/fcm/send/abc123def456ghi789"):
    return {"endpoint": endpoint, "keys": {"p256dh": "B" + "x" * 86, "auth": "y" * 22}}


def test_endpoint_allowlist():
    ok = ["https://fcm.googleapis.com/fcm/send/x" * 1, "https://updates.push.services.mozilla.com/wpush/v2/x",
          "https://web.push.apple.com/QAbc", "https://wns2-par02p.notify.windows.com/w/?token=x"]
    bad = ["http://fcm.googleapis.com/x", "https://localhost/x", "https://169.254.169.254/latest", "https://fcm.googleapis.com.evil.com/x",
           "https://evil.com/fcm.googleapis.com", "https://user:pw@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "https://notpush.apple.com/x", "ftp://web.push.apple.com/x"]
    assert all(push_mod.endpoint_allowed(u) for u in ok)
    assert not any(push_mod.endpoint_allowed(u) for u in bad)


def test_subscribe_rules(c):
    assert c.post("/api/push/subscribe", json=_device()).status_code in (401, 403)  # signed-in only
    login(c, "demo@yourcommunity.app")
    assert c.post("/api/push/subscribe", json=_device("https://evil.example.com/x/yyyyyyyyyyyy")).status_code == 400
    assert c.post("/api/push/subscribe", json=_device("http://169.254.169.254/latest/meta-data/aaaaaa")).status_code == 400
    assert c.post("/api/push/subscribe", json=_device()).status_code == 200
    assert c.post("/api/push/subscribe", json=_device()).status_code == 200  # idempotent

    import asyncio
    from database import db

    async def rows():
        return [s async for s in db.push_subscriptions.find({})]
    assert len(asyncio.run(rows())) == 1
    # someone else can't remove my device; I can
    login(c, "admin@yourcommunity.app")
    c.post("/api/push/unsubscribe", json={"endpoint": _device()["endpoint"]})
    assert len(asyncio.run(rows())) == 1
    login(c, "demo@yourcommunity.app")
    c.post("/api/push/unsubscribe", json={"endpoint": _device()["endpoint"]})
    assert len(asyncio.run(rows())) == 0


def test_vapid_keys_are_generated_once_and_reused(c):
    a = c.get("/api/push/public-key").json()["key"]
    assert len(a) in (86, 87)  # base64url of a 65-byte uncompressed P-256 point
    push_mod._VAPID.clear()  # simulate a restart: the same key must load back from the database
    assert c.get("/api/push/public-key").json()["key"] == a


def test_a_new_notification_is_pushed_to_the_persons_devices_only(c, monkeypatch):
    sent = []
    monkeypatch.setattr(push_mod, "_send_one", lambda sub, payload, key: sent.append((sub["endpoint"], json.loads(payload))) or (201, ""))
    login(c, "demo@yourcommunity.app")
    c.post("/api/push/subscribe", json=_device("https://fcm.googleapis.com/fcm/send/demo-device-1111111"))
    login(c, "admin@yourcommunity.app")
    assert c.post("/api/events", json={"title": "Push Test Social", "starts_at": "2031-07-01T18:00:00Z"}).status_code == 201
    for _ in range(40):
        if sent:
            break
        time.sleep(0.1)
    assert len(sent) == 1 and sent[0][0].endswith("demo-device-1111111")
    p = sent[0][1]
    assert p["title"] == "New event: Push Test Social" and p["url"].startswith("/events/") and p["tag"]
    # muting "New events" stops the push too
    login(c, "demo@yourcommunity.app")
    c.patch("/api/me/settings", json={"notifications": {"kinds": {"events": False}}})
    login(c, "admin@yourcommunity.app")
    c.post("/api/events", json={"title": "Muted One", "starts_at": "2031-07-02T18:00:00Z"})
    time.sleep(0.6)
    assert len(sent) == 1
    login(c, "demo@yourcommunity.app")
    c.patch("/api/me/settings", json={"notifications": {"kinds": {"events": True}}})
    c.post("/api/push/unsubscribe", json={"endpoint": "https://fcm.googleapis.com/fcm/send/demo-device-1111111"})


def test_real_encrypted_push_reaches_the_push_service_and_decrypts(c):
    """Uses the real pywebpush code against a local server standing in for Google's push service, then
    decrypts the body with the device's private key -- proving the payload is a valid RFC 8291 push."""
    import http_ece
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    got = {}

    class H(http.server.BaseHTTPRequestHandler):
        def do_POST(self):
            got["headers"] = {k.lower(): v for k, v in self.headers.items()}
            got["body"] = self.rfile.read(int(self.headers["Content-Length"]))
            self.send_response(201)
            self.end_headers()

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    priv = ec.generate_private_key(ec.SECP256R1())
    pub = priv.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    auth = os.urandom(16)
    b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
    sub = {"endpoint": f"http://127.0.0.1:{srv.server_port}/push/abc", "keys": {"p256dh": b64(pub), "auth": b64(auth)}}
    login(c, "demo@yourcommunity.app")
    key = __import__("asyncio").run(push_mod.vapid())
    status, detail = push_mod._send_one(sub, json.dumps({"title": "Hello", "body": "World", "url": "/x", "tag": "t"}), key)
    srv.shutdown()
    assert status == 201
    assert got["headers"]["urgency"] == "high" and got["headers"]["content-encoding"] == "aes128gcm" and got["headers"]["authorization"].startswith("vapid ")
    plain = http_ece.decrypt(got["body"], private_key=priv, auth_secret=auth, version="aes128gcm")
    assert json.loads(plain)["title"] == "Hello"


def test_push_test_and_status_report_what_the_push_service_said(c, monkeypatch):
    calls = []
    answers = iter([(201, ""), (403, "UnauthorizedRegistration"), (410, "gone")])
    monkeypatch.setattr(push_mod, "_send_one", lambda sub, payload, key: calls.append(json.loads(payload)) or next(answers))
    login(c, "demo@yourcommunity.app")
    assert c.post("/api/push/test", json={}).json()["devices"] == []  # nothing registered yet
    dev = _device("https://fcm.googleapis.com/fcm/send/status-device-2222222")
    c.post("/api/push/subscribe", json=dev)
    r = c.post("/api/push/test", json={"endpoint": dev["endpoint"]}).json()["devices"][0]
    assert r["ok"] and r["status"] == 201 and r["host"] == "fcm.googleapis.com" and calls[0]["title"] == "Push test"
    st = c.get("/api/push/status").json()["devices"][0]
    assert st["last_status"] == 201 and "endpoint" not in st  # the full push address is never echoed back
    r = c.post("/api/push/test", json={}).json()["devices"][0]
    assert not r["ok"] and r["status"] == 403 and r["detail"] == "UnauthorizedRegistration"
    assert c.get("/api/push/status").json()["devices"][0]["last_status"] == 403
    # the push service saying "gone" removes the dead registration
    c.post("/api/push/test", json={})
    assert c.get("/api/push/status").json()["devices"] == []
