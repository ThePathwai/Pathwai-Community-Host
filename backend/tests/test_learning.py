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


PAYLOAD = {"source": "disco", "programs": [{
    "external_id": "p1", "name": "Pitch Fundamentals", "description": "Five-minute pitch.", "url": "https://example.com/p1", "modules_total": 8, "tags": ["Cohort"],
    "members": [
        {"email": "Demo@YourCommunity.app", "status": "enrolled", "modules_done": 4, "current_module": "Module 5", "next_session_at": "2030-01-01T15:00:00Z"},
        {"email": "admin@yourcommunity.app", "status": "completed", "certificate_url": "https://example.com/cert"},
        {"email": "nobody@nowhere.example", "status": "enrolled", "progress_pct": 10},
    ]}]}


def test_sync_is_admin_only_and_validates(c):
    login(c, "demo@yourcommunity.app")
    assert c.put("/api/admin/learning/sync", json=PAYLOAD).status_code == 403
    login(c, "admin@yourcommunity.app")
    bad = {"programs": [{**PAYLOAD["programs"][0], "url": "http://insecure.example"}]}
    assert c.put("/api/admin/learning/sync", json=bad).status_code == 400


def test_sync_matches_by_email_and_is_idempotent(c):
    login(c, "admin@yourcommunity.app")
    r = c.put("/api/admin/learning/sync", json=PAYLOAD)
    assert r.status_code == 200 and r.json()["result"] == {"programs": 1, "enrollments": 2, "unmatched_members": 1}
    assert c.put("/api/admin/learning/sync", json=PAYLOAD).json()["result"]["enrollments"] == 2
    assert len(c.get("/api/learning/programs").json()["programs"]) == 1


def test_mine_programs_and_people(c):
    login(c, "demo@yourcommunity.app")
    mine = c.get("/api/learning/mine").json()
    assert len(mine["programs"]) == 1
    my = mine["programs"][0]["my"]
    assert my["progress_pct"] == 50 and my["current_module"] == "Module 5"
    assert mine["summary"] == {"enrolled": 1, "completed": 0, "next_session_at": "2030-01-01T15:00:00Z"}
    progs = c.get("/api/learning/programs").json()["programs"]
    assert progs[0]["enrolled_count"] == 2 and progs[0]["completed_count"] == 1 and progs[0]["cohort_preview"]
    me = c.get("/api/auth/me").json()
    ppl = c.get(f"/api/learning/people/{me['id']}").json()["programs"]
    assert ppl[0]["name"] == "Pitch Fundamentals" and "next_session_at" not in ppl[0] and "current_module" not in ppl[0]
    login(c, "admin@yourcommunity.app")
    assert c.get("/api/learning/mine").json()["summary"]["completed"] == 1


def test_disco_demo_provider(c):
    login(c, "admin@yourcommunity.app")
    j = c.get("/api/admin/integrations").json()
    d = next(p for p in j["integrations"] if p["provider"] == "disco")
    assert d["preview"]
    c.put("/api/admin/integrations/disco", json={"credentials": {"api_key": "live-looking-key"}})
    r = c.post("/api/admin/integrations/disco/test")
    assert r.status_code == 400 and "aren't switched on" in r.json()["detail"]
    c.put("/api/admin/integrations/disco", json={"credentials": {"api_key": "demo"}})
    assert c.post("/api/admin/integrations/disco/test").json()["ok"]
    res = c.post("/api/admin/integrations/disco/sync").json()["result"]
    assert res["programs"] == 3 and res["enrollments"] >= 3
    assert len(c.get("/api/learning/programs").json()["programs"]) >= 3
