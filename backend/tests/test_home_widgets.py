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
    r = c.post("/api/auth/login", json={"email": email, "password": "Demo123!"})
    assert r.status_code == 200, r.text


def test_default_hides_nothing(c):
    cfg = c.get("/api/community/config").json()
    assert cfg["home_hidden"] == {"member": [], "admin": []}


def test_admin_can_hide_blocks_per_audience(c):
    login(c, "admin@yourcommunity.app")
    r = c.patch("/api/community/config", json={"home_hidden": {"member": ["perks", "news", "perks"], "admin": ["photos"]}})
    assert r.status_code == 200, r.text
    got = c.get("/api/community/config").json()["home_hidden"]
    assert got == {"member": ["perks", "news"], "admin": ["photos"]}
    c.patch("/api/community/config", json={"home_hidden": {"member": [], "admin": []}})


def test_unknown_block_is_rejected(c):
    login(c, "admin@yourcommunity.app")
    assert c.patch("/api/community/config", json={"home_hidden": {"member": ["nope"], "admin": []}}).status_code == 400
    assert c.patch("/api/community/config", json={"home_hidden": "all"}).status_code == 400


def test_members_cannot_change_it(c):
    login(c, "demo@yourcommunity.app")
    assert c.patch("/api/community/config", json={"home_hidden": {"member": ["perks"], "admin": []}}).status_code == 403
