"""Terms of Service / Privacy Policy agreement: every path that creates an account must require it
server-side (not just a checkbox in the form), and record which version was accepted and when."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
os.environ["ENABLE_AI_CHAT"] = "true"

from fastapi.testclient import TestClient

import server
from database import hub_db
from routes._common import LEGAL_VERSION


def _acct(email):
    return asyncio.run(hub_db().accounts.find_one({"email": email}))


def test_hub_signup_requires_acceptance_and_records_it():
    with TestClient(server.app) as c:
        base = {"email": "consent1@example.com", "password": "ConsentPass123", "name": "Con Sent"}
        for extra in ({}, {"accepted_terms": False}):
            r = c.post("/api/hub/signup", json={**base, **extra})
            assert r.status_code == 422, r.text
            assert "Terms of Service" in r.text
        assert _acct("consent1@example.com") is None  # nothing was created
        r = c.post("/api/hub/signup", json={**base, "accepted_terms": True})
        assert r.status_code == 201, r.text
        a = _acct("consent1@example.com")
        assert a["terms_version"] == LEGAL_VERSION and a["terms_accepted_at"]
        assert "terms_accepted_at" in r.json()["account"]


def test_legacy_community_signup_and_invites_also_require_it():
    with TestClient(server.app) as c:
        body = {"email": "consent2@example.com", "password": "ConsentPass123", "name": "Legacy Signup"}
        assert c.post("/api/auth/signup", json=body).status_code == 422
        assert c.post("/api/auth/signup", json={**body, "accepted_terms": True}).status_code == 201
        assert c.post("/api/auth/login", json={"email": "admin@yourcommunity.app", "password": "Demo123!"}).status_code == 200
        inv = c.post("/api/invites", json={"role": "member"}).json()
        c.post("/api/auth/logout")
        acc = {"name": "Invited Person", "email": "consent3@example.com", "password": "ConsentPass123", "fields": {}}
        r = c.post(f"/api/invites/{inv['code']}/accept", json=acc)
        assert r.status_code == 422 and "Terms of Service" in r.text
        # the invite was not consumed by the refused attempt
        assert c.post(f"/api/invites/{inv['code']}/accept", json={**acc, "accepted_terms": True}).status_code == 201
