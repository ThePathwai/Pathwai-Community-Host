"""Admin tools for a member who forgot their password or needs their account removed: one-time reset links,
removing a member from a community, and the platform-admin account search / reset / delete."""
import os
import sys
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"

import pytest
from fastapi.testclient import TestClient

import server

PW = "Passw0rd-long-1"
NEW = "BrandNewPass-77"


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:
        yield client


def login(c, email, pw="Demo123!"):
    c.post("/api/auth/logout")
    r = c.post("/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text


def make_member(c, name, email):
    login(c, "admin@yourcommunity.app")
    r = c.post("/api/admin/users", json={"name": name, "email": email, "password": PW})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def token_of(link):
    return parse_qs(urlparse(link).query)["token"][0]


def test_admin_reset_link_lets_a_member_pick_a_new_password_once(c):
    uid = make_member(c, "Forgot Pw", "forgot.pw@example.com")
    r = c.post(f"/api/admin/users/{uid}/reset-link")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "/reset-password?token=" in body["link"] and body["expires_in_days"] == 7 and body["email"] == "forgot.pw@example.com"
    c.post("/api/auth/logout")
    tok = token_of(body["link"])
    assert c.post("/api/auth/reset-password", json={"token": tok, "password": NEW}).status_code == 200
    assert c.post("/api/auth/login", json={"email": "forgot.pw@example.com", "password": PW}).status_code == 401
    assert c.post("/api/auth/login", json={"email": "forgot.pw@example.com", "password": NEW}).status_code == 200
    # the same link can't be replayed
    again = c.post("/api/auth/reset-password", json={"token": tok, "password": "AnotherPass-88x"})
    assert again.status_code == 400 and "already been used" in again.json()["detail"]


def test_ordinary_members_cannot_use_the_admin_tools(c):
    uid = make_member(c, "Target One", "target.one@example.com")
    login(c, "demo@yourcommunity.app")
    assert c.post(f"/api/admin/users/{uid}/reset-link").status_code == 403
    assert c.delete(f"/api/admin/users/{uid}").status_code == 403
    assert c.get("/api/hub/admin/accounts").status_code == 403
    assert c.post("/api/hub/admin/accounts/reset-link", json={"email": "target.one@example.com"}).status_code == 403
    assert c.post("/api/hub/admin/accounts/delete", json={"email": "target.one@example.com", "confirm": "DELETE"}).status_code == 403


def test_a_community_admin_cannot_reset_someone_who_shares_a_login_with_other_communities(c):
    login(c, "pastor@c3.example")  # admin of one community only (not a platform admin)
    people = c.get("/api/admin/users").json()
    shared = next(u for u in people if u["email"] == "demo@yourcommunity.app")
    r = c.post(f"/api/admin/users/{shared['id']}/reset-link")
    assert r.status_code == 403 and "other communities" in r.json()["detail"]


def test_removing_a_member_deletes_their_account_when_it_was_their_only_community(c):
    # a platform account that also has a profile in the community
    c.post("/api/auth/logout")
    assert c.post("/api/hub/signup", json={"accepted_terms": True, "email": "gone.soon@example.com", "password": PW, "name": "Gone Soon"}).status_code == 201
    uid = make_member(c, "Gone Soon", "gone.soon@example.com")
    assert c.delete(f"/api/admin/users/{uid}").json() == {"ok": True, "account_deleted": True}
    assert not any(u["email"] == "gone.soon@example.com" for u in c.get("/api/admin/users").json())
    # they can now sign up again with the same email
    c.post("/api/auth/logout")
    assert c.post("/api/hub/signup", json={"accepted_terms": True, "email": "gone.soon@example.com", "password": PW, "name": "Gone Soon"}).status_code == 201


def test_admin_cannot_delete_themselves_or_the_last_admin(c):
    login(c, "admin@yourcommunity.app")
    me = c.get("/api/auth/me").json()
    assert c.delete(f"/api/admin/users/{me['id']}").status_code == 400
    assert c.delete("/api/admin/users/does-not-exist").status_code == 404
    login(c, "pastor@c3.example")
    me = c.get("/api/auth/me").json()
    other_admin = c.delete(f"/api/admin/users/{me['id']}")
    assert other_admin.status_code == 400  # yourself first


def test_platform_admin_can_find_reset_and_delete_any_account(c):
    c.post("/api/auth/logout")
    assert c.post("/api/hub/signup", json={"accepted_terms": True, "email": "lonely.acct@example.com", "password": PW, "name": "Lonely Account"}).status_code == 201
    login(c, "admin@yourcommunity.app")
    found = c.get("/api/hub/admin/accounts", params={"q": "lonely"}).json()
    assert found["total"] == 1 and found["accounts"][0]["email"] == "lonely.acct@example.com" and found["accounts"][0]["has_account"] is True
    link = c.post("/api/hub/admin/accounts/reset-link", json={"email": "lonely.acct@example.com"}).json()["link"]
    assert "/reset-password?token=" in link
    assert c.post("/api/hub/admin/accounts/reset-link", json={"email": "nobody@example.com"}).status_code == 404
    # guard rails
    assert c.post("/api/hub/admin/accounts/delete", json={"email": "lonely.acct@example.com", "confirm": "nope"}).status_code == 400
    assert c.post("/api/hub/admin/accounts/delete", json={"email": "admin@yourcommunity.app", "confirm": "DELETE"}).status_code == 400  # yourself
    assert c.post("/api/hub/admin/accounts/delete", json={"email": "pastor@c3.example", "confirm": "DELETE"}).status_code == 409  # sole admin of a community
    ok = c.post("/api/hub/admin/accounts/delete", json={"email": "lonely.acct@example.com", "confirm": "DELETE"})
    assert ok.status_code == 200, ok.text
    assert c.get("/api/hub/admin/accounts", params={"q": "lonely"}).json()["total"] == 0
    c.post("/api/auth/logout")
    assert c.post("/api/auth/login", json={"email": "lonely.acct@example.com", "password": PW}).status_code == 401


def test_members_without_a_status_show_up_as_approved_so_admins_can_reach_them(c):
    uid = make_member(c, "Legacy Person", "legacy.person@example.com")  # admin-created accounts carry no membership status
    rows = c.get("/api/admin/membership-requests", params={"status": "approved"}).json()["requests"]
    row = next(r for r in rows if r["id"] == uid)
    assert row["status"] == "approved" and row["email"] == "legacy.person@example.com" and not row["protected"]
    # ...and the platform admin's own row is marked protected so the UI offers no delete / reset on it
    mine = next(r for r in rows if r["email"] == "admin@yourcommunity.app")
    assert mine["protected"] is True


def test_about_the_brand_settings_are_saved_and_validated(c):
    login(c, "admin@yourcommunity.app")
    r = c.patch("/api/community/config", json={"about": "  We run wellness events.  ", "about_url": "https://example.com", "about_cta": "Our site"})
    assert r.status_code == 200 and r.json()["about"] == "We run wellness events." and r.json()["about_url"] == "https://example.com" and r.json()["about_cta"] == "Our site"
    assert c.patch("/api/community/config", json={"about_url": "javascript:alert(1)"}).status_code == 400
    assert c.get("/api/community/config").json()["about_url"] == "https://example.com"
    login(c, "demo@yourcommunity.app")
    assert c.patch("/api/community/config", json={"about": "x"}).status_code == 403
