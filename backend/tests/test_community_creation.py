"""Self-serve community creation: a brand-new Pathwai account can become the founding admin of a
brand-new community (the "admin" branch of onboarding), distinct from the "member" branch that
just browses/applies to communities that already exist (see routes/hub.py, Signup.jsx)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
os.environ["ENABLE_AI_CHAT"] = "true"  # smoke tests exercise chat end to end even though it defaults off in production

import asyncio

import pytest
from fastapi.testclient import TestClient

import database
import server


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:
        yield client


@pytest.fixture(autouse=True, scope="module")
def _cleanup_dynamic_communities(c):
    """COMMUNITY_SLUGS and hub_db().communities are both process-global, so a community created
    here would otherwise leak into every test module that runs after this one (they share one
    mongomock client and one Python process). Undo it once this module's tests are done."""
    before = list(database.COMMUNITY_SLUGS)
    yield
    created = [s for s in database.COMMUNITY_SLUGS if s not in before]
    database.COMMUNITY_SLUGS[:] = before
    if created:
        asyncio.run(database.hub_db().communities.delete_many({"slug": {"$in": created}}))


def test_categories_listed(c):
    r = c.get("/api/hub/community-categories").json()
    keys = {x["key"] for x in r["categories"]}
    assert {"church", "wellness", "dinner_club", "professional", "other"} <= keys


def test_creating_a_community_makes_the_signer_its_admin(c):
    r = c.post("/api/hub/signup", json={"email": "founder@example.com", "password": "Sup3rSecret!", "name": "Jordan Founder"})
    assert r.status_code == 201, r.text

    r = c.post("/api/hub/communities", json={"name": "River City Runners", "category": "wellness", "tagline": "A running crew that meets weekly."})
    assert r.status_code == 201, r.text
    slug = r.json()["slug"]
    assert slug == "river-city-runners"

    # the create call already set the community cookie — the founder lands straight in as admin
    cfg = c.get("/api/community/config", headers={"X-Community": slug}).json()
    assert cfg["community_name"] == "River City Runners"
    assert cfg["tagline"] == "A running crew that meets weekly."
    assert cfg["setup_completed"] is False  # still needs the setup wizard

    me = c.get("/api/auth/me", headers={"X-Community": slug}).json()
    assert me["role"] == "admin" and me["email"] == "founder@example.com"

    # and it shows up in their hub list as an approved admin community
    hub = c.get("/api/hub/communities").json()["communities"]
    mine = next(x for x in hub if x["slug"] == slug)
    assert mine["my"]["status"] == "approved" and mine["my"]["role"] == "admin"


def test_duplicate_names_get_a_unique_slug(c):
    c.post("/api/hub/signup", json={"email": "founder2@example.com", "password": "Sup3rSecret!", "name": "Alex Second"})
    r = c.post("/api/hub/communities", json={"name": "River City Runners", "category": "wellness"})
    assert r.status_code == 201
    assert r.json()["slug"] == "river-city-runners-2"


def test_creating_a_community_requires_being_signed_in(c):
    c.post("/api/auth/logout")
    r = c.post("/api/hub/communities", json={"name": "No Account Club"})
    assert r.status_code == 401
