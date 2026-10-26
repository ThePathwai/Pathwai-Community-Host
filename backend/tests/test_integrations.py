import os, sys, time, hmac, hashlib, json
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
os.environ["ENABLE_AI_CHAT"] = "true"  # smoke tests exercise chat end to end even though it defaults off in production
import pytest
from fastapi.testclient import TestClient
import server
from routes.integrations import verify_stripe_signature


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:
        yield client


def login(c, email):
    c.post("/api/auth/logout")
    assert c.post("/api/auth/login", json={"email": email, "password": "Demo123!"}).status_code == 200


def test_admin_only_and_masking(c):
    login(c, "demo@yourcommunity.app")
    assert c.get("/api/admin/integrations").status_code == 403
    login(c, "admin@yourcommunity.app")
    r = c.put("/api/admin/integrations/stripe", json={"credentials": {"api_key": "demo", "webhook_secret": "whsec_x"}, "settings": {"currency": "cad"}})
    assert r.status_code == 200
    j = r.json()
    assert j["demo"] and j["masked"]["api_key"].startswith("•")
    assert "api_key" not in j["settings"]


def test_only_real_connections_are_offered(c):
    """Texts, email, members and events are built in, so nothing to connect for them (or for Airtable and Luma)."""
    login(c, "admin@yourcommunity.app")
    names = {i["provider"] for i in c.get("/api/admin/integrations").json()["integrations"]}
    assert {"stripe", "instagram", "tiktok", "disco", "google_forms"} <= names
    assert not names & {"airtable", "luma", "twilio", "sendgrid"}
    for gone in ("airtable", "luma", "twilio", "sendgrid"):
        assert c.put(f"/api/admin/integrations/{gone}", json={"credentials": {"api_key": "demo"}}).status_code == 404


def test_stripe_demo_and_webhook(c):
    login(c, "admin@yourcommunity.app")
    r = c.put("/api/admin/integrations/stripe", json={"credentials": {"api_key": "demo", "webhook_secret": "whsec_test"},
              "settings": {"currency": "cad", "plans": [{"label": "Member", "amount_cents": 2500, "interval": "month"}]}}).json()
    assert r["settings"]["plans"][0]["key"] == "member"
    assert c.post("/api/admin/integrations/stripe/test").json()["ok"]
    login(c, "demo@yourcommunity.app")
    b = c.get("/api/me/billing").json()
    assert b["enabled"] and b["plans"][0]["label"] == "Member" and b["status"] is None
    out = c.post("/api/me/billing/checkout", json={"plan_key": "member"}).json()
    assert out["demo"] and c.get("/api/me/billing").json()["status"] == "active"
    # signed webhook flips status; bad signature is rejected
    me = c.get("/api/auth/me").json()
    payload = json.dumps({"id": "evt_1", "type": "customer.subscription.deleted", "data": {"object": {"metadata": {"user_id": me["id"]}}}}).encode()
    ts = str(int(time.time()))
    sig = hmac.new(b"whsec_test", ts.encode() + b"." + payload, hashlib.sha256).hexdigest()
    assert c.post("/api/webhooks/stripe", content=payload, headers={"stripe-signature": f"t={ts},v1=bad"}).status_code == 400
    assert c.post("/api/webhooks/stripe", content=payload, headers={"stripe-signature": f"t={ts},v1={sig}"}).status_code == 200
    assert c.get("/api/me/billing").json()["status"] == "canceled"
    assert verify_stripe_signature(payload, f"t={int(time.time()) - 4000},v1={sig}", "whsec_test") is False


def test_paid_event_ticket_and_disconnect(c):
    login(c, "admin@yourcommunity.app")
    ev = c.post("/api/events", json={"title": "Paid masterclass", "starts_at": "2099-01-01T10:00:00+00:00", "price_cents": 4000}).json()
    login(c, "demo@yourcommunity.app")
    assert c.post(f"/api/events/{ev['id']}/checkout").json()["demo"]
    assert c.get(f"/api/events/{ev['id']}").json()["my_rsvp"] == "yes"
    login(c, "admin@yourcommunity.app")
    assert c.delete("/api/admin/integrations/stripe").status_code == 200
    assert next(i for i in c.get("/api/admin/integrations").json()["integrations"] if i["provider"] == "stripe")["status"] == "disconnected"


def test_brand_config_validation(c):
    login(c, "admin@yourcommunity.app")
    # mongomock is a single process-wide store for the whole pytest run (not reset per TestClient
    # block), so every field this test mutates has to be restored before it ends, or later
    # tests/modules that assume playr's seeded defaults (brand, nav included) break depending on
    # file-alphabetical run order. See test_hub_share.py's comment for the same risk, caught once
    # already on `require_approval`.
    before = c.get("/api/community/config").json()
    try:
        assert c.patch("/api/community/config", json={"brand": {"colors": {"accent": "red"}}}).status_code == 400
        assert c.patch("/api/community/config", json={"brand": {"font": "Comic Sans"}}).status_code == 400
        assert c.patch("/api/community/config", json={"brand": {"logo_url": "http://insecure/x.png"}}).status_code == 400
        assert c.patch("/api/community/config", json={"custom_links": [{"label": "x", "url": "javascript:alert(1)"}]}).status_code == 400
        ok = c.patch("/api/community/config", json={"community_name": "Acme Hub", "brand": {"preset": "ocean", "mode": "dark", "colors": {"accent": "#3B82F6"}, "font": "Manrope"}, "nav": [{"key": "events", "label": "Happenings", "enabled": True}]}).json()
        assert ok["brand"]["font"] == "Manrope" and ok["brand"]["colors"]["background"] == "#09090B" and ok["theme"]["accent"] == "#3B82F6"
        assert ok["nav"][0]["label"] == "Happenings" and len(ok["nav"]) == 11
    finally:
        c.patch("/api/community/config", json={"community_name": before["community_name"], "brand": before["brand"], "nav": before["nav"]})


def test_admin_inline_edit():
    from fastapi.testclient import TestClient
    import server
    with TestClient(server.app) as c:
        c.post("/api/auth/login", json={"email": "admin@yourcommunity.app", "password": "Demo123!"})
        ev = c.get("/api/events").json()[0]
        r = c.patch(f"/api/admin/content/events/{ev['id']}", json={"values": {"title": "Renamed by admin", "tags": "a, b", "bogus": 1}})
        assert r.status_code == 200 and r.json()["title"] == "Renamed by admin" and r.json()["tags"] == ["a", "b"] and "bogus" not in r.json()
        u = c.get("/api/users").json()[0]
        assert c.patch(f"/api/admin/users/{u['id']}/profile", json={"values": {"bio": "Edited bio"}}).json()["bio"] == "Edited bio"
        assert c.delete(f"/api/admin/content/events/{ev['id']}").status_code == 200
        c.post("/api/auth/logout")
        c.post("/api/auth/login", json={"email": "demo@yourcommunity.app", "password": "Demo123!"})
        assert c.patch(f"/api/admin/content/events/x", json={"values": {"title": "y"}}).status_code == 403
