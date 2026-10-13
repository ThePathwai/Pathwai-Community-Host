import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
import pytest
from fastapi.testclient import TestClient
import server


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:
        yield client


def login(c, email):
    c.post("/api/auth/logout")
    assert c.post("/api/auth/login", json={"email": email, "password": "Demo123!"}).status_code == 200


def titles(c):
    return [n["title"] for n in c.get("/api/notifications").json()["notifications"]]


def test_news_and_perks_notify_members(c):
    login(c, "admin@yourcommunity.app")
    assert c.post("/api/announcements", json={"title": "Pitch Day moved", "body": "Now on Friday at 6pm."}).status_code in (200, 201)
    assert c.post("/api/resources", json={"title": "Free legal hour", "description": "Book a slot."}).status_code in (200, 201)
    login(c, "demo@yourcommunity.app")
    t = titles(c)
    assert "News: Pitch Day moved" in t and "New perk: Free legal hour" in t


def test_member_kind_switch_is_respected_and_all_on_works(c):
    login(c, "demo@yourcommunity.app")
    assert c.patch("/api/me/settings", json={"notifications": {"kinds": {"resources": False}}}).status_code == 200
    login(c, "admin@yourcommunity.app")
    c.post("/api/resources", json={"title": "Second perk", "description": "x"})
    login(c, "demo@yourcommunity.app")
    assert "New perk: Second perk" not in titles(c)
    all_on = {"in_app": True, "email": True, "kinds": {k: True for k in ["requests", "events", "members", "matches", "announcements", "resources", "support"]}}
    assert c.patch("/api/me/settings", json={"notifications": all_on}).status_code == 200
    s = c.get("/api/me/settings").json()["settings"]["notifications"]
    assert s["in_app"] and all(s["kinds"].values())


def test_member_post_notifies_when_approved(c):
    login(c, "demo@yourcommunity.app")
    r = c.post("/api/announcements", json={"title": "Member news item", "body": "hello"})
    assert r.status_code in (200, 201); aid = r.json()["id"]
    login(c, "admin@yourcommunity.app")
    assert c.post(f"/api/admin/moderation/announcement/{aid}", json={"decision": "approve"}).status_code == 200
    # the author is excluded; another member hears about it
    assert "News: Member news item" in titles(c)
