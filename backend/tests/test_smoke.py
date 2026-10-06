import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
# Chat defaults OFF in production (ENABLE_AI_CHAT unset/false) — the smoke suite still exercises it
# end to end, so turn it on just for this test run rather than skipping those assertions.
os.environ["ENABLE_AI_CHAT"] = "true"
import pytest
from fastapi.testclient import TestClient
import server


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:
        yield client


def login(c, email, pw="Demo123!"):
    r = c.post("/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return r


def test_root(c):
    assert c.get("/api/").json()["app"] == "Pathwai"


def test_demo_accounts(c):
    a = c.get("/api/auth/demo-accounts").json()
    assert [x["demo_role"] for x in a["accounts"]] == ["member", "admin"]


def test_auth_flow(c):
    login(c, "demo@yourcommunity.app")
    assert c.get("/api/auth/me").json()["name"] == "Fife Ashley-Dejo"
    assert c.post("/api/auth/refresh").status_code == 200
    c.post("/api/auth/logout")
    assert c.get("/api/auth/me").status_code == 401


def test_password_reset_flow(c):
    from auth import create_reset_token

    # Same generic response whether or not the email is registered — never leaks which emails exist.
    assert c.post("/api/auth/forgot-password", json={"email": "demo@yourcommunity.app"}).status_code == 200
    assert c.post("/api/auth/forgot-password", json={"email": "nobody-here@example.com"}).status_code == 200

    # A garbage token is rejected.
    assert c.post("/api/auth/reset-password", json={"token": "not-a-real-token", "password": "NewPass1234!"}).status_code == 400

    token = create_reset_token("demo@yourcommunity.app")
    # Same 10-character minimum as signup -- a reset must not be a way around the password rule.
    assert c.post("/api/auth/reset-password", json={"token": token, "password": "Short123!"}).status_code == 422
    assert c.post("/api/auth/reset-password", json={"token": token, "password": "NewPass1234!"}).status_code == 200

    # Old password no longer works, new one does.
    assert c.post("/api/auth/login", json={"email": "demo@yourcommunity.app", "password": "Demo123!"}).status_code == 401
    r = c.post("/api/auth/login", json={"email": "demo@yourcommunity.app", "password": "NewPass1234!"})
    assert r.status_code == 200, r.text

    # Put the demo password back (straight in the DB: "Demo123!" is deliberately too short for the
    # reset endpoint now) so later tests and other modules' fixtures aren't affected.
    import asyncio
    from auth import hash_password
    asyncio.run(server.db.users.update_many({"email": "demo@yourcommunity.app"}, {"$set": {"password_hash": hash_password("Demo123!")}}))
    c.post("/api/auth/logout")


def test_lockout_429(c):
    for _ in range(5):
        assert c.post("/api/auth/login", json={"email": "x@y.com", "password": "bad"}).status_code == 401
    assert c.post("/api/auth/login", json={"email": "x@y.com", "password": "bad"}).status_code == 429


def test_public_reads(c):
    for path, key in [("/api/organizations", "organizations"), ("/api/discover", "counts"), ("/api/mentors", "mentors")]:
        assert key in c.get(path).json(), path
    assert len(c.get("/api/organizations").json()["organizations"]) == 6
    for p in ["/api/events", "/api/resources", "/api/announcements", "/api/slack-signals", "/api/email-updates",
              "/api/users", "/api/users/filters", "/api/community/config", "/api/support-requests",
              "/api/matches?role=founder", "/api/dashboard?role=founder", "/api/chat/quick-starts?role=founder",
              "/api/admin/audits", "/api/profile-requests/kinds", "/api/connect-requests/kinds"]:
        r = c.get(p)
        assert r.status_code == 200, (p, r.text)


def test_members_gate_and_apply(c):
    c.post("/api/auth/logout")
    g = c.get("/api/organizations/indoor-series/members").json()
    assert g["gated"] is True and "members_full" not in g
    login(c, "demo@yourcommunity.app")
    f = c.get("/api/organizations/indoor-series/members").json()
    assert f["gated"] is False and f["members_full"]
    for slug in ["indoor-series", "after-hours", "playr-academy", "outdoor-series"]:
        assert c.get(f"/api/organizations/{slug}/members").json()["total"] > 0, slug


def test_authed_flows(c):
    login(c, "demo@yourcommunity.app")
    ev = c.get("/api/events?upcoming=true").json()
    assert ev
    r = c.post(f"/api/events/{ev[0]['id']}/rsvp"); assert r.status_code == 200
    res = c.get("/api/resources").json()
    assert c.post(f"/api/resources/{res[0]['id']}/save").json()["ok"]
    assert c.get("/api/me/memberships").json()["total"] >= 2
    assert c.get("/api/me/profile-requests").json()["total"] >= 1
    r = c.post("/api/support-requests", json={"title": "Need a shooting partner", "tags": ["shooting"], "category": "coaching"})
    assert r.status_code == 201
    me = c.get("/api/auth/me").json()
    assert c.patch(f"/api/users/{me['id']}", json={"bio": "hello"}).status_code == 200
    assert c.patch("/api/users/u-dre", json={"bio": "x"}).status_code == 403


def test_admin(c):
    c.post("/api/auth/logout")
    assert c.get("/api/admin/audit-log").status_code == 401
    login(c, "demo@yourcommunity.app")
    assert c.get("/api/admin/audit-log").status_code == 403
    login(c, "admin@yourcommunity.app")
    assert c.get("/api/admin/audit-log").status_code == 200
    # mongomock is a process-wide store for the whole pytest run (not reset per TestClient block),
    # so community_name/event_types have to be restored before this test ends, or any module that
    # runs later (alphabetically or under a different collection order) inherits "Test Co" instead
    # of playr's seeded defaults -- same risk already caught in test_hub_share.py/test_integrations.py.
    before = c.get("/api/community/config").json()
    try:
        r = c.patch("/api/community/config", json={"community_name": "Test Co", "event_types": ["A", "B"]})
        assert r.json()["event_types"] == ["A", "B"]
        inv = c.post("/api/invites", json={"role": "member"}).json()
        c.post("/api/auth/logout")
        j = c.post(f"/api/invites/{inv['code']}/accept", json={"accepted_terms": True, "name": "New Person", "email": "new@x.com", "password": "StrongPass1234", "fields": {}})
        assert j.status_code == 201, j.text
    finally:
        c.post("/api/auth/login", json={"email": "admin@yourcommunity.app", "password": "Demo123!"})
        c.patch("/api/community/config", json={"community_name": before["community_name"], "event_types": before["event_types"]})


def test_signup_and_chat(c):
    r = c.post("/api/auth/signup", json={"accepted_terms": True, "email": "sig@x.com", "password": "StrongPass1234", "name": "Sig Nup"})
    assert r.status_code == 201
    r = c.post("/api/chat/message", json={"message": "who can help me?", "role": "founder"})
    assert r.status_code == 200 and r.json()["reply"]
