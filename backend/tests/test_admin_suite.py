"""The admin suite: real visit and account numbers for platform admins only; a deleted account leaves the list but not the anonymous count."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"

import pytest
from fastapi.testclient import TestClient

import server
from routes.platform_stats import clean_path

PW = "Passw0rd-long-1"


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:
        yield client


def hub_signup(c, name, email):
    c.post("/api/auth/logout")
    r = c.post("/api/hub/signup", json={"accepted_terms": True, "email": email, "password": PW, "name": name})
    assert r.status_code == 201, r.text


def as_admin(c):
    c.post("/api/auth/logout")
    r = c.post("/api/auth/login", json={"email": "admin@yourcommunity.app", "password": "Demo123!"})
    assert r.status_code == 200, r.text


def test_pages_are_stored_without_ids_or_queries():
    assert clean_path("/people/8f3a?x=1") == "/people/:id"
    assert clean_path("/navigator?q=grants#top") == "/navigator"
    assert clean_path("") == "/"
    assert clean_path("/members/abc/def") == "/members/:id/:id"


def test_the_admin_pages_are_closed_to_everyone_else(c):
    c.post("/api/auth/logout")
    assert c.get("/api/hub/admin/overview").status_code == 401
    hub_signup(c, "Ordinary Person", "ordinary.person@example.com")
    assert c.get("/api/hub/admin/overview").status_code == 403
    assert c.get("/api/hub/admin/users").status_code == 403
    assert c.get("/api/hub/admin/users/export").status_code == 403
    me = c.get("/api/hub/me").json()["account"]
    assert me["platform_admin"] is False


def test_visits_and_accounts_show_up_as_real_numbers(c):
    c.post("/api/auth/logout")
    assert c.post("/api/hub/track", json={"path": "/navigator?utm=x", "ref": "https://www.example-news.com/story"}).status_code == 204
    hub_signup(c, "Pilot Founder", "pilot.founder@example.com")
    assert c.post("/api/hub/track", json={"path": "/people/abc123"}).status_code == 204
    as_admin(c)
    assert c.get("/api/hub/me").json()["account"]["platform_admin"] is True
    assert c.post("/api/hub/track", json={"path": "/navigator"}).status_code == 204  # an admin's own clicks are not counted
    o = c.get("/api/hub/admin/overview?days=30").json()
    pages = {p["path"]: p["views"] for p in o["visits"]["top_pages"]}
    assert pages.get("/navigator") == 1 and pages.get("/people/:id") == 1
    assert o["visits"]["page_views"] == 2 and 1 <= o["visits"]["visitors"] <= 2
    assert o["visits"]["top_sources"] == [{"source": "example-news.com", "views": 1}]
    assert len(o["visits"]["series"]) == 30 and len(o["accounts"]["series"]) == 30
    assert o["accounts"]["total"] >= 2 and o["accounts"]["new"] >= 2 and o["accounts"]["signed_up_ever"] >= 2
    assert o["funnel"][0]["label"] == "Signed up" and o["funnel"][0]["count"] == o["accounts"]["total"]
    assert o["accounts"]["active_7d"] >= 1  # the signed-in visit above marked that person as active


def test_the_list_and_the_export_hold_each_account_once_and_never_a_password(c):
    as_admin(c)
    rows = c.get("/api/hub/admin/users?q=pilot.founder").json()
    assert rows["total"] == 1 and rows["users"][0]["email"] == "pilot.founder@example.com"
    assert "password_hash" not in rows["users"][0]
    r = c.get("/api/hub/admin/users/export")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    body = r.text
    assert body.splitlines()[0].startswith("name,email,signed_up") and "pilot.founder@example.com" in body
    assert "password" not in body.lower().replace("passw0rd-long-1", "")  # no hash column
    assert "admin@yourcommunity.app" not in body  # the team's own accounts are not pilot numbers
    log = c.get("/api/hub/admin/audit-log?action=admin.accounts_exported").json()
    assert log["total"] >= 1


def test_a_formula_in_a_name_cannot_run_in_a_spreadsheet(c):
    hub_signup(c, "=HYPERLINK(1)", "formula.name@example.com")
    as_admin(c)
    body = c.get("/api/hub/admin/users/export").text
    assert "'=HYPERLINK(1)" in body and ",=HYPERLINK" not in body and not any(l.startswith("=") for l in body.splitlines())


def test_deleting_your_own_account_removes_it_here_but_the_count_remembers(c):
    c.post("/api/auth/logout")
    c.post("/api/auth/login", json={"email": "pilot.founder@example.com", "password": PW})
    d = c.post("/api/hub/account/delete", json={"confirm": "DELETE", "password": PW})
    assert d.status_code == 200, d.text
    as_admin(c)
    assert c.get("/api/hub/admin/users?q=pilot.founder").json()["total"] == 0
    assert "pilot.founder@example.com" not in c.get("/api/hub/admin/users/export").text
    o = c.get("/api/hub/admin/overview?days=30").json()
    assert o["accounts"]["deleted_ever"] >= 1 and o["accounts"]["deleted_in_range"] >= 1
    assert o["accounts"]["signed_up_ever"] >= o["accounts"]["total"] + 1


def test_what_founders_are_looking_for_comes_from_real_choices(c):
    hub_signup(c, "Needs Founder", "needs.founder@example.com")
    r = c.patch("/api/hub/profile", json={"startup": {"name": "Needs Co", "stage": "prototype", "province": "ON", "needs": ["funding", "mentorship"], "sectors": ["software"]}})
    assert r.status_code == 200, r.text
    assert c.post("/api/navigator/interest", json={"id": "prog-a", "name": "Program A", "org": "Org A", "type": "grant", "state": "yes"}).status_code == 200
    assert c.post("/api/navigator/interest", json={"id": "prog-b", "name": "Program B", "org": "Org B", "type": "loan", "state": "no"}).status_code == 200
    hub_signup(c, "Second Founder", "second.founder@example.com")
    c.patch("/api/hub/profile", json={"startup": {"name": "Second Co", "stage": "idea", "province": "ON", "needs": ["funding"]}})
    c.post("/api/navigator/interest", json={"id": "prog-a", "name": "Program A", "org": "Org A", "type": "grant", "state": "yes"})
    as_admin(c)
    d = c.get("/api/hub/admin/overview?days=7").json()["demand"]
    needs = {n["need"]: n for n in d["needs"]}
    assert needs["funding"]["count"] == 2 and needs["mentorship"]["count"] == 1 and needs["funding"]["label"] == "Funding"
    assert d["founders_with_needs"] == 2 and needs["funding"]["share"] == 1.0
    top = {p["name"]: p["saves"] for p in d["programs"]}
    assert top.get("Program A") == 2 and "Program B" not in top  # a program someone hid is not a save
    assert {"type": "grant", "label": "Grant", "saves": 2} in d["types"]
