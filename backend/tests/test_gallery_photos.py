"""The dashboard's portrait (4:5) photo carousel — each photo is placed by the admin (client-side
crop) before it's saved, so it always shows the part of the photo they chose rather than a blind
center-crop. See routes/community_config.py's gallery_photos handling."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
os.environ["ENABLE_AI_CHAT"] = "true"  # smoke tests exercise chat end to end even though it defaults off in production

import pytest
from fastapi.testclient import TestClient

import server

SMALL_JPEG = "data:image/jpeg;base64," + ("A" * 200)
SMALL_PNG = "data:image/png;base64," + ("B" * 200)


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:
        yield client


def login(c, email):
    c.post("/api/auth/logout")
    assert c.post("/api/auth/login", json={"email": email, "password": "Demo123!"}).status_code == 200


def test_gallery_photos_default_empty(c):
    login(c, "admin@yourcommunity.app")
    assert c.get("/api/community/config").json()["gallery_photos"] == []


def test_admin_can_set_gallery_photos(c):
    login(c, "admin@yourcommunity.app")
    photos = [SMALL_JPEG, "https://images.example.com/portrait.jpg", SMALL_PNG]
    r = c.patch("/api/community/config", json={"gallery_photos": photos})
    assert r.status_code == 200
    assert r.json()["gallery_photos"] == photos
    # persisted for subsequent reads, including by a non-admin member of the same community
    login(c, "demo@yourcommunity.app")
    assert c.get("/api/community/config").json()["gallery_photos"] == photos


def test_gallery_photos_reorder_and_remove(c):
    login(c, "admin@yourcommunity.app")
    c.patch("/api/community/config", json={"gallery_photos": [SMALL_JPEG, SMALL_PNG]})
    r = c.patch("/api/community/config", json={"gallery_photos": [SMALL_PNG, SMALL_JPEG]})
    assert r.json()["gallery_photos"] == [SMALL_PNG, SMALL_JPEG]
    r = c.patch("/api/community/config", json={"gallery_photos": [SMALL_PNG]})
    assert r.json()["gallery_photos"] == [SMALL_PNG]
    r = c.patch("/api/community/config", json={"gallery_photos": []})
    assert r.json()["gallery_photos"] == []


def test_gallery_photos_reject_bad_url(c):
    login(c, "admin@yourcommunity.app")
    r = c.patch("/api/community/config", json={"gallery_photos": ["ftp://not-allowed.example/x.jpg"]})
    assert r.status_code == 400
    r = c.patch("/api/community/config", json={"gallery_photos": ["http://insecure.example/x.jpg"]})
    assert r.status_code == 400


def test_gallery_photos_reject_too_many(c):
    login(c, "admin@yourcommunity.app")
    r = c.patch("/api/community/config", json={"gallery_photos": ["https://images.example.com/p.jpg"] * 11})
    assert r.status_code == 400


def test_gallery_photos_reject_oversized(c):
    login(c, "admin@yourcommunity.app")
    huge = "data:image/jpeg;base64," + ("A" * 800_000)
    r = c.patch("/api/community/config", json={"gallery_photos": [huge]})
    assert r.status_code == 400


def test_non_admin_cannot_set_gallery_photos(c):
    login(c, "demo@yourcommunity.app")
    r = c.patch("/api/community/config", json={"gallery_photos": ["https://images.example.com/x.jpg"]})
    assert r.status_code == 403
    # leave the config clean for other test modules
    login(c, "admin@yourcommunity.app")
    c.patch("/api/community/config", json={"gallery_photos": []})
