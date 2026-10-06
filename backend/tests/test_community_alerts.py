"""Community alerts: a new event, a new member, an approval and a decline each create bell
notifications for the right people -- and respect each member's Settings toggles."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
os.environ["ENABLE_AI_CHAT"] = "true"

import pytest
from fastapi.testclient import TestClient

import server

PW = "Alerts-Pass-99x"


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:
        yield client


def login(c, email, pw="Demo123!"):
    c.post("/api/auth/logout")
    r = c.post("/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text


def inbox(c, **params):
    r = c.get("/api/notifications", params={"sync": False, **params})
    assert r.status_code == 200
    return r.json()


def titles(c):
    return [n["title"] for n in inbox(c)["notifications"]]


def test_new_event_notifies_members_but_not_the_admin_who_added_it_or_muted_members(c):
    # one member mutes "New events"; another member leaves everything on
    login(c, "demo@yourcommunity.app")
    assert c.patch("/api/me/settings", json={"notifications": {"kinds": {"events": False}}}).status_code == 200
    login(c, "admin@yourcommunity.app")
    admin_before = len(inbox(c)["notifications"])
    r = c.post("/api/events", json={"title": "Alerts Test Mixer", "starts_at": "2031-05-01T18:00:00Z", "location": "Toronto"})
    assert r.status_code == 201, r.text
    eid = r.json()["id"]
    assert len(inbox(c)["notifications"]) == admin_before  # the person who made it isn't pinged
    login(c, "demo@yourcommunity.app")
    assert "New event: Alerts Test Mixer" not in titles(c)  # muted
    assert c.patch("/api/me/settings", json={"notifications": {"kinds": {"events": True}}}).status_code == 200
    # un-muted, the next event reaches them, linking to the event
    login(c, "admin@yourcommunity.app")
    eid2 = c.post("/api/events", json={"title": "Alerts Second Mixer", "starts_at": "2031-05-08T18:00:00Z"}).json()["id"]
    login(c, "demo@yourcommunity.app")
    got = [n for n in inbox(c)["notifications"] if n["title"] == "New event: Alerts Second Mixer"]
    assert got and got[0]["link"] == f"/events/{eid2}" and got[0]["kind"] == "event_new" and not got[0]["read"]


def test_invite_signup_tells_members_someone_joined(c):
    login(c, "admin@yourcommunity.app")
    code = c.post("/api/invites", json={"email": "invitee@example.com"}).json()["code"]
    c.post("/api/auth/logout")
    r = c.post(f"/api/invites/{code}/accept", json={"accepted_terms": True, "email": "invitee@example.com", "password": PW, "name": "Ivy Invited", "fields": {}})
    assert r.status_code == 201, r.text
    login(c, "demo@yourcommunity.app")
    assert any(n["title"] == "Ivy Invited joined the community" for n in inbox(c)["notifications"])


def test_approval_welcomes_the_applicant_and_tells_members_someone_joined(c):
    c.post("/api/auth/logout")
    r = c.post("/api/auth/signup", json={"accepted_terms": True, "email": "newperson@example.com", "password": PW, "name": "Nia New"})
    assert r.status_code == 201, r.text
    login(c, "admin@yourcommunity.app")
    uid = next(x["id"] for x in c.get("/api/admin/membership-requests?status=pending").json()["requests"] if x["email"] == "newperson@example.com")
    before = len(inbox(c)["notifications"])
    assert c.post(f"/api/admin/membership-requests/{uid}/decision", json={"decision": "approve"}).status_code == 200
    assert len(inbox(c)["notifications"]) == before  # the admin who approved isn't pinged about their own action
    login(c, "demo@yourcommunity.app")
    joined = [n for n in inbox(c)["notifications"] if n["kind"] == "member_joined"]
    assert any("Nia New joined" in n["title"] and n["link"] == f"/members/{uid}" for n in joined)
    # the new member got the welcome, and not their own "joined" ping
    login(c, "newperson@example.com", PW)
    t = titles(c)
    assert "Welcome to the community" in t and not any("Nia New joined" in x for x in t)


def test_decline_tells_the_applicant_and_nobody_else(c):
    c.post("/api/auth/logout")
    assert c.post("/api/auth/signup", json={"accepted_terms": True, "email": "notthisone@example.com", "password": PW, "name": "Rex Declined"}).status_code == 201
    login(c, "admin@yourcommunity.app")
    uid = next(x["id"] for x in c.get("/api/admin/membership-requests?status=pending").json()["requests"] if x["email"] == "notthisone@example.com")
    assert c.post(f"/api/admin/membership-requests/{uid}/decision", json={"decision": "reject", "note": "internal only"}).status_code == 200
    login(c, "demo@yourcommunity.app")
    assert not any("Rex Declined" in x for x in titles(c))
    # the applicant's notification never repeats the admin's private note
    from database import db  # noqa: PLC0415
    import asyncio

    async def mine():
        return [n async for n in db.notifications.find({"user_id": uid})]
    notes = asyncio.run(mine())
    assert any(n["title"] == "Your membership request wasn't approved" for n in notes)
    assert all("internal only" not in (n.get("body") or "") for n in notes)


def test_in_app_off_silences_everything_and_poll_skips_reminder_sync(c):
    login(c, "demo@yourcommunity.app")
    assert c.patch("/api/me/settings", json={"notifications": {"in_app": False}}).status_code == 200
    login(c, "admin@yourcommunity.app")
    assert c.post("/api/events", json={"title": "Silent Event", "starts_at": "2031-06-01T18:00:00Z"}).status_code == 201
    login(c, "demo@yourcommunity.app")
    assert "New event: Silent Event" not in titles(c)
    assert c.patch("/api/me/settings", json={"notifications": {"in_app": True}}).status_code == 200
    # the unread_only poll the browser uses returns the unread count alongside the items
    d = inbox(c, unread_only=True, limit=10)
    assert "unread" in d and all(not n["read"] for n in d["notifications"])
