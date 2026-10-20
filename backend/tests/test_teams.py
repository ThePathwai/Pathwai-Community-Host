import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
import pytest
from fastapi.testclient import TestClient
import server


def client(email):
    c = TestClient(server.app)
    c.__enter__()
    r = c.post("/api/auth/login", json={"email": email, "password": "Demo123!"})
    assert r.status_code == 200, r.text
    return c


@pytest.fixture(scope="module")
def member():
    c = client("demo@yourcommunity.app")
    yield c
    c.__exit__(None, None, None)


@pytest.fixture(scope="module")
def admin():
    c = client("admin@yourcommunity.app")
    yield c
    c.__exit__(None, None, None)


def test_teams_nav_exists_but_is_off_by_default(member):
    nav = {n["key"]: n for n in member.get("/api/community/config").json()["nav"]}
    assert nav["teams"]["enabled"] is False


def test_start_join_leave(member, admin):
    r = member.post("/api/teams", json={"name": "Spring shoot crew", "description": "Two-day shoot.", "looking_for": ["Gaffer", "gaffer", "Colourist"]})
    assert r.status_code == 201, r.text
    t = r.json()
    assert t["is_lead"] and t["is_member"] and t["member_count"] == 1 and t["status"] == "active"
    assert t["looking_for"] == ["Gaffer", "Colourist"]
    tid = t["id"]
    # someone else joins
    j = admin.post(f"/api/teams/{tid}/join")
    assert j.status_code == 200 and j.json()["member_count"] == 2 and j.json()["is_member"]
    assert admin.post(f"/api/teams/{tid}/join").json()["member_count"] == 2  # joining twice changes nothing
    assert tid in [x["id"] for x in admin.get("/api/teams", params={"mine": True}).json()]
    # the lead's detail shows members
    d = member.get(f"/api/teams/{tid}").json()
    assert {m["id"] for m in d["members"]} >= {t["lead_id"]}
    assert len(d["members"]) == 2
    # leaving: lead hands over automatically
    lv = member.post(f"/api/teams/{tid}/leave").json()
    assert lv["is_member"] is False and lv["lead_id"] != t["lead_id"] and lv["member_count"] == 1
    # last person leaves: team closes
    assert admin.post(f"/api/teams/{tid}/leave").json().get("deleted") is True
    assert admin.get(f"/api/teams/{tid}").status_code == 404


def test_only_lead_or_admin_manage(member, admin):
    tid = member.post("/api/teams", json={"name": "Livestream team"}).json()["id"]
    assert member.patch(f"/api/teams/{tid}", json={"status": "bogus"}).status_code == 400
    assert member.patch(f"/api/teams/{tid}", json={"status": "done", "name": "Livestream crew"}).json()["status"] == "done"
    assert admin.post(f"/api/teams/{tid}/join").status_code == 400  # a finished team isn't taking people
    assert admin.patch(f"/api/teams/{tid}", json={"status": "active"}).status_code == 200  # admins can manage any team
    assert member.delete(f"/api/teams/{tid}").status_code == 200


def test_lead_can_add_and_remove_people(member, admin):
    me = member.get("/api/auth/me").json()
    adm = admin.get("/api/auth/me").json()
    tid = member.post("/api/teams", json={"name": "Edit suite"}).json()["id"]
    assert member.post(f"/api/teams/{tid}/members", json={"user_id": adm["id"]}).json()["member_count"] == 2
    assert member.post(f"/api/teams/{tid}/members", json={"user_id": "nobody"}).status_code == 404
    assert member.delete(f"/api/teams/{tid}/members/{me['id']}").status_code == 400  # lead can't be removed
    assert member.delete(f"/api/teams/{tid}/members/{adm['id']}").json()["member_count"] == 1
    member.delete(f"/api/teams/{tid}")
