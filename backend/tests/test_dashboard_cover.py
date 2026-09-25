"""The dashboard's "next event" hero widget shows a photo the admin sets (dashboard_cover_url) when
there's no upcoming event with its own cover image. See routes/community_config.py's
dashboard_cover_url handling; the logo-placeholder fallback when neither is set lives in the
frontend (Dashboard.jsx)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
os.environ["ENABLE_AI_CHAT"] = "true"  # smoke tests exercise chat end to end even though it defaults off in production

import pytest
from fastapi.testclient import TestClient

import server

SMALL_JPEG = "data:image/jpeg;base64," + ("A" * 200)


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:
        yield client


def login(c, email):
    c.post("/api/auth/logout")
    assert c.post("/api/auth/login", json={"email": email, "password": "Demo123!"}).status_code == 200


def test_dashboard_cover_default_none(c):
    login(c, "admin@yourcommunity.app")
    assert c.get("/api/community/config").json()["dashboard_cover_url"] is None


def test_admin_can_set_and_clear_dashboard_cover(c):
    login(c, "admin@yourcommunity.app")
    r = c.patch("/api/community/config", json={"dashboard_cover_url": SMALL_JPEG})
    assert r.status_code == 200
    assert r.json()["dashboard_cover_url"] == SMALL_JPEG
    assert c.get("/api/community/config").json()["dashboard_cover_url"] == SMALL_JPEG

    r = c.patch("/api/community/config", json={"dashboard_cover_url": ""})
    assert r.status_code == 200
    assert r.json()["dashboard_cover_url"] is None


def test_dashboard_cover_reject_bad_url(c):
    login(c, "admin@yourcommunity.app")
    r = c.patch("/api/community/config", json={"dashboard_cover_url": "ftp://not-allowed.example/x.jpg"})
    assert r.status_code == 400


def test_dashboard_cover_reject_oversized(c):
    login(c, "admin@yourcommunity.app")
    huge = "data:image/jpeg;base64," + ("A" * 800_000)
    r = c.patch("/api/community/config", json={"dashboard_cover_url": huge})
    assert r.status_code == 400


def test_non_admin_cannot_set_dashboard_cover(c):
    login(c, "demo@yourcommunity.app")
    r = c.patch("/api/community/config", json={"dashboard_cover_url": SMALL_JPEG})
    assert r.status_code == 403
    # leave the config clean for other test modules
    login(c, "admin@yourcommunity.app")
    c.patch("/api/community/config", json={"dashboard_cover_url": ""})
