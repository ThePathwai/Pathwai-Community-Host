"""The standard Pathwai profile: collected once on the account (not per community) right after
signup via PATCH /hub/profile, then used to pre-fill every community application and every
self-serve community's founding-admin entry — see routes/hub.py's AccountProfileIn / hub_update_profile,
and the "already have a profile" prefill logic in hub_apply / create_community."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
os.environ["ENABLE_AI_CHAT"] = "true"  # smoke tests exercise chat end to end even though it defaults off in production

import pytest
from fastapi.testclient import TestClient

import database
import server

PROFILE = {
    "age": 29, "title": "Physiotherapist", "company": "Bayview Health Clinic", "location": "Leslieville",
    "bio": "Recent padel convert who still plays a lot of tennis.",
    "skill_set": ["Injury prevention", "Match warm-ups"], "interests_hobbies": ["Running", "Brunch"],
    "goals": ["Move up a division"], "support_needs": ["A consistent Tuesday partner"],
    "contact": {"phone": "+1 416 555 0199", "linkedin": "https://linkedin.com/in/priya-profile", "instagram": "@priya.profile", "website": "https://priya.example"},
}


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:
        yield client


@pytest.fixture(autouse=True, scope="module")
def _cleanup_dynamic_communities(c):
    before = list(database.COMMUNITY_SLUGS)
    yield
    created = [s for s in database.COMMUNITY_SLUGS if s not in before]
    database.COMMUNITY_SLUGS[:] = before
    if created:
        asyncio.run(database.hub_db().communities.delete_many({"slug": {"$in": created}}))


def test_new_account_starts_with_a_blank_but_shaped_profile(c):
    r = c.post("/api/hub/signup", json={"email": "profile1@example.com", "password": "Sup3rSecret!", "name": "Priya Profile"})
    assert r.status_code == 201, r.text
    me = c.get("/api/hub/me").json()["account"]
    assert me["title"] == "" and me["bio"] == "" and me["skill_set"] == [] and me.get("profile_completed") is False
    assert me["age"] is None and me["contact"] == {"phone": "", "linkedin": "", "instagram": "", "website": ""}


def test_patch_hub_profile_requires_auth():
    with TestClient(server.app) as anon:
        r = anon.patch("/api/hub/profile", json=PROFILE)
        assert r.status_code == 401


def test_saving_the_standard_profile_persists_on_the_account(c):
    r = c.patch("/api/hub/profile", json=PROFILE)
    assert r.status_code == 200, r.text
    acct = r.json()["account"]
    assert acct["title"] == "Physiotherapist" and acct["bio"].startswith("Recent padel convert")
    assert acct["skill_set"] == PROFILE["skill_set"] and acct["profile_completed"] is True
    assert acct["age"] == 29
    assert acct["contact"]["phone"] == "+1 416 555 0199" and acct["contact"]["linkedin"] == PROFILE["contact"]["linkedin"]

    me = c.get("/api/hub/me").json()["account"]
    assert me["company"] == "Bayview Health Clinic" and me["goals"] == PROFILE["goals"]


def test_name_updates_through_the_profile_endpoint(c):
    r = c.patch("/api/hub/profile", json={"name": "Priya P. Renamed"})
    assert r.status_code == 200, r.text
    assert r.json()["account"]["name"] == "Priya P. Renamed"
    # a partial patch (no contact key at all) must not wipe the contact info saved earlier
    assert r.json()["account"]["contact"]["phone"] == "+1 416 555 0199"


def test_age_is_bounded(c):
    r = c.patch("/api/hub/profile", json={"age": 5})
    assert r.status_code == 422
    r = c.patch("/api/hub/profile", json={"age": 200})
    assert r.status_code == 422


def test_applying_to_a_community_prefills_from_the_saved_profile(c):
    r = c.post("/api/hub/communities/grace/apply", json={"message": "Excited to join"})
    assert r.status_code == 201, r.text
    doc = asyncio.run(database.dbfor("grace").users.find_one({"email": "profile1@example.com"}))
    assert doc["title"] == "Physiotherapist"
    assert doc["company"] == "Bayview Health Clinic"
    assert doc["location"] == "Leslieville"
    assert doc["bio"].startswith("Recent padel convert")
    assert doc["skill_set"] == PROFILE["skill_set"]
    assert doc["interests_hobbies"] == PROFILE["interests_hobbies"]
    assert doc["goals"] == PROFILE["goals"]
    assert doc["support_needs"] == PROFILE["support_needs"]
    assert doc["age"] == 29
    assert doc["contact"]["email"] == "profile1@example.com"  # community contact email still tracks the login email
    assert doc["contact"]["phone"] == "+1 416 555 0199"
    assert doc["contact"]["linkedin"] == PROFILE["contact"]["linkedin"]


def test_apply_time_title_overrides_the_saved_profile_title(c):
    c.post("/api/hub/signup", json={"email": "profile2@example.com", "password": "Sup3rSecret!", "name": "Sam Second"})
    c.patch("/api/hub/profile", json=PROFILE)
    r = c.post("/api/hub/communities/the-village/apply", json={"title": "Sommelier", "message": "Referred by a friend"})
    assert r.status_code == 201, r.text
    doc = asyncio.run(database.dbfor("the-village").users.find_one({"email": "profile2@example.com"}))
    assert doc["title"] == "Sommelier"  # explicit apply-form title wins
    assert doc["bio"].startswith("Recent padel convert")  # everything else still comes from the profile


def test_starting_a_community_carries_the_profile_into_the_founding_admin_entry(c):
    c.post("/api/hub/signup", json={"email": "founder-profile@example.com", "password": "Sup3rSecret!", "name": "Founder Profile"})
    c.patch("/api/hub/profile", json=PROFILE)
    r = c.post("/api/hub/communities", json={"name": "Profile Test Club", "category": "wellness"})
    assert r.status_code == 201, r.text
    slug = r.json()["slug"]
    me = c.get("/api/auth/me", headers={"X-Community": slug}).json()
    assert me["title"] == "Founder"  # role label, not the account's occupation
    assert me["company"] == "Profile Test Club"  # the new community, not the account's employer
    assert me["bio"].startswith("Recent padel convert")  # personal details still carry over
    assert me["skill_set"] == PROFILE["skill_set"]
    assert me["location"] == PROFILE["location"]
    assert me["age"] == 29
    assert me["contact"]["phone"] == "+1 416 555 0199"
    assert me["contact"]["email"] == "founder-profile@example.com"
