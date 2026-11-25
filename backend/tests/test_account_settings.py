"""The Settings tab on the account profile: how you sign in, and changing your password, for every member (no community needed)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"

from fastapi.testclient import TestClient

import server

OLD, NEW = "Sup3rSecret!", "Brand-new-pass-77"


def test_settings_endpoints_need_a_signed_in_account():
    with TestClient(server.app) as anon:
        assert anon.get("/api/hub/account/security").status_code == 401
        assert anon.post("/api/hub/account/change-password", json={"current_password": OLD, "new_password": NEW}).status_code == 401


def test_a_member_can_see_how_they_sign_in_and_change_their_password():
    with TestClient(server.app) as c:
        assert c.post("/api/hub/signup", json={"accepted_terms": True, "email": "settings1@example.com", "password": OLD, "name": "Sam Settings"}).status_code == 201
        sec = c.get("/api/hub/account/security").json()
        assert sec["email"] == "settings1@example.com" and sec["has_password"] is True
        assert "password_hash" not in sec

        assert c.post("/api/hub/account/change-password", json={"current_password": "wrong-pass-123", "new_password": NEW}).status_code == 400
        assert c.post("/api/hub/account/change-password", json={"current_password": OLD, "new_password": "short1"}).status_code == 400
        r = c.post("/api/hub/account/change-password", json={"current_password": OLD, "new_password": NEW})
        assert r.status_code == 200, r.text
        # this device stays signed in, and only the new password works from now on
        assert c.get("/api/hub/me").json()["account"]["email"] == "settings1@example.com"

    with TestClient(server.app) as fresh:
        assert fresh.post("/api/auth/login", json={"email": "settings1@example.com", "password": OLD}).status_code in (400, 401)
        assert fresh.post("/api/auth/login", json={"email": "settings1@example.com", "password": NEW}).status_code == 200
