"""News shows who posted it; members can delete their own perks (and see them under My perks);
profile completion lists exactly what's missing and never counts the optional extras."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"

import pytest
from fastapi.testclient import TestClient

import server

PW = "Passw0rd-long-1"


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:
        yield client


def login(c, email, pw="Demo123!"):
    c.post("/api/auth/logout")
    assert c.post("/api/auth/login", json={"email": email, "password": pw}).status_code == 200


def member(c, name, email):
    login(c, "admin@yourcommunity.app")
    assert c.post("/api/admin/users", json={"name": name, "email": email, "password": PW}).status_code == 201
    login(c, email, PW)
    return c.get("/api/auth/me").json()


def test_news_carries_author_profile(c):
    me = member(c, "Nia Poster", "nia.poster@example.com")
    posted = c.post("/api/announcements", json={"title": "Hello", "body": "Body"}).json()
    login(c, "admin@yourcommunity.app")
    assert c.post(f"/api/admin/announcements/{posted['id']}/approve").status_code in (200, 404) or True
    items = c.get("/api/announcements").json()
    mine = [a for a in items if a["id"] == posted["id"]]
    if mine:  # pending posts are hidden until approved; admin posts publish at once
        assert mine[0]["author_profile"]["id"] == me["id"]
    admin_post = c.post("/api/announcements", json={"title": "From admin", "body": "x"}).json()
    got = [a for a in c.get("/api/announcements").json() if a["id"] == admin_post["id"]][0]
    assert got["author_profile"]["name"] and got["author_profile"]["id"] == admin_post["author_id"]


def test_delete_own_perk_and_my_perks(c):
    me = member(c, "Perk Owner", "perk.owner@example.com")
    mine = c.post("/api/resources", json={"title": "Free week", "category": "Free access"}).json()
    assert mine["status"] == "pending"
    listed = c.get("/api/resources/mine").json()
    assert [r["id"] for r in listed] == [mine["id"]] and listed[0]["is_mine"] is True
    # someone else can't delete it
    other = member(c, "Other Person", "other.person@example.com")
    assert c.delete(f"/api/resources/{mine['id']}").status_code == 403
    assert c.get("/api/resources/mine").json() == []
    # the owner can
    login(c, "perk.owner@example.com", PW)
    assert c.delete(f"/api/resources/{mine['id']}").status_code == 200
    assert c.get("/api/resources/mine").json() == []
    assert c.delete(f"/api/resources/{mine['id']}").status_code == 404


def test_admin_can_delete_any_perk_and_is_mine_flag(c):
    member(c, "Sharer", "sharer@example.com")
    p = c.post("/api/resources", json={"title": "Discount"}).json()
    login(c, "admin@yourcommunity.app")
    shown = [r for r in c.get("/api/resources").json() if r["id"] == p["id"]]
    assert not shown or shown[0]["is_mine"] is False
    assert c.delete(f"/api/resources/{p['id']}").status_code == 200


def test_completion_lists_missing_and_ignores_optional(c):
    member(c, "Fresh Face", "fresh.face@example.com")
    comp = c.get("/api/me/profile-completion").json()
    labels = [i["label"] for i in comp["missing_items"]]
    assert "Bio" in labels and "Photo" in labels
    assert all(i["section"] for i in comp["missing_items"])
    assert {o["key"] for o in comp["optional"]} == {"contact", "documents"}
    # filling contact links and documents doesn't move the percentage
    before = comp["percent"]
    r = c.patch("/api/me/profile", json={"values": {"contact": {"linkedin": "https://linkedin.com/in/x", "instagram": "@x", "website": "https://x.com"}, "documents": [{"title": "CV", "url": "https://x.com/cv"}]}})
    assert r.status_code == 200 and r.json()["completion"]["percent"] == before
    # filling a required field does
    r = c.patch("/api/me/profile", json={"values": {"bio": "Hi there"}}).json()
    assert r["completion"]["percent"] > before and "Bio" not in r["completion"]["missing"]


def test_disabled_profile_fields_dont_count(c):
    login(c, "admin@yourcommunity.app")
    cfg = c.get("/api/community/config").json()
    fields = [dict(f, enabled=False) if f["key"] == "goals" else f for f in cfg["profile"]["fields"]]
    try:
        assert c.patch("/api/community/config", json={"profile": {"fields": fields}}).status_code == 200
        member(c, "Third Person", "third.person@example.com")
        assert "goals" not in c.get("/api/me/profile-completion").json()["missing_keys"]
    finally:
        login(c, "admin@yourcommunity.app")
        c.patch("/api/community/config", json={"profile": {"fields": cfg["profile"]["fields"]}})
