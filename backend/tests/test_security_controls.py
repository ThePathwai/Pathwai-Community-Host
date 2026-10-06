"""Technical controls behind the SOC 2 readiness work: response hardening, request correlation, session
revocation, the platform audit log and the account export / delete lifecycle."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
os.environ["ENABLE_AI_CHAT"] = "true"

from fastapi.testclient import TestClient

import server
from database import dbfor, hub_db

PW = "Contr0lsPass99"


def _signup(c, email, name="Control Tester"):
    r = c.post("/api/hub/signup", json={"accepted_terms": True, "email": email, "password": PW, "name": name})
    assert r.status_code == 201, r.text
    return r.json()["account"]


def _audit(action, actor_id=None):
    q = {"action": action}
    if actor_id:
        q["actor_id"] = actor_id
    return asyncio.run(_find(q))


async def _find(q):
    return [e async for e in hub_db().audit_log.find(q)]


def test_security_headers_and_request_id():
    with TestClient(server.app) as c:
        r = c.get("/api/health")
        assert r.headers["x-content-type-options"] == "nosniff"
        assert r.headers["x-frame-options"] == "DENY"
        assert "frame-ancestors 'none'" in r.headers["content-security-policy"]
        assert r.headers["referrer-policy"] and r.headers["permissions-policy"]
        assert r.headers["cache-control"] == "no-store"  # JSON API: never kept by a shared cache
        assert len(r.headers["x-request-id"]) >= 8
        # a caller-supplied correlation id is echoed; a junk one is replaced
        assert c.get("/api/health", headers={"X-Request-ID": "trace-abc-12345"}).headers["x-request-id"] == "trace-abc-12345"
        assert c.get("/api/health", headers={"X-Request-ID": "x y<script>"}).headers["x-request-id"] != "x y<script>"
        # errors carry them too
        assert c.get("/api/nope-nothing-here").headers["x-request-id"]


def test_audit_entries_carry_request_id_and_signup_is_on_the_platform_log():
    with TestClient(server.app) as c:
        acc = _signup(c, "audit1@example.com")
        entries = _audit("auth.signup", acc["id"])
        assert entries and entries[0]["request_id"] not in (None, "-") and entries[0]["created_at"]
        assert entries[0]["meta"]["terms_version"]


def test_sign_out_everywhere_kills_other_sessions_but_not_new_logins():
    with TestClient(server.app) as c1:
        _signup(c1, "revoke1@example.com")
        old_access, old_refresh = c1.cookies.get("access_token"), c1.cookies.get("refresh_token")
        assert c1.get("/api/hub/me").json()["account"]
        with TestClient(server.app) as other:  # "another device" holding the same tokens
            other.cookies.set("access_token", old_access)
            other.cookies.set("refresh_token", old_refresh)
            assert other.get("/api/hub/me").json()["account"]
            assert c1.post("/api/hub/account/sign-out-everywhere").status_code == 200
            assert other.get("/api/hub/me").json()["account"] is None
            assert other.post("/api/auth/refresh").status_code == 401
        # signing in again afterwards works immediately (token is newer than the cutoff)
        r = c1.post("/api/auth/login", json={"email": "revoke1@example.com", "password": PW})
        assert r.status_code == 200, r.text
        assert c1.get("/api/hub/me").json()["account"]["email"] == "revoke1@example.com"
        assert _audit("auth.sessions_revoked")


def test_password_reset_revokes_old_sessions_and_old_password_dies_everywhere():
    from auth import create_reset_token
    with TestClient(server.app) as c:
        _signup(c, "revoke2@example.com")
        with TestClient(server.app) as thief:
            thief.cookies.set("access_token", c.cookies.get("access_token"))
            assert thief.get("/api/hub/me").json()["account"]
            r = c.post("/api/auth/reset-password", json={"token": create_reset_token("revoke2@example.com"), "password": "BrandNewPass123"})
            assert r.status_code == 200, r.text
            assert thief.get("/api/hub/me").json()["account"] is None
        assert c.post("/api/auth/login", json={"email": "revoke2@example.com", "password": PW}).status_code == 401
        assert c.post("/api/auth/login", json={"email": "revoke2@example.com", "password": "BrandNewPass123"}).status_code == 200


def test_change_password_updates_every_record_and_revokes_other_sessions():
    with TestClient(server.app) as c:
        assert c.post("/api/auth/login", json={"email": "demo@yourcommunity.app", "password": "Demo123!"}).status_code == 200
        with TestClient(server.app) as other:
            other.cookies.set("access_token", c.cookies.get("access_token"))
            assert other.get("/api/auth/me").status_code == 200
            weak = c.post("/api/me/change-password", json={"current_password": "Demo123!", "new_password": "short1"})
            assert weak.status_code == 400
            ok = c.post("/api/me/change-password", json={"current_password": "Demo123!", "new_password": "ChangedPass456"})
            assert ok.status_code == 200, ok.text
            assert other.get("/api/auth/me").status_code == 401  # the other device is signed out
            assert c.get("/api/auth/me").status_code == 200  # this one was re-issued
        # new password works, old one does not (no stale hash left on the platform record)
        c.post("/api/auth/logout")
        assert c.post("/api/auth/login", json={"email": "demo@yourcommunity.app", "password": "Demo123!"}).status_code == 401
        assert c.post("/api/auth/login", json={"email": "demo@yourcommunity.app", "password": "ChangedPass456"}).status_code == 200
        # put the demo persona back (the API rightly refuses the 8-char demo password now) so other tests still find it
        from auth import hash_password
        from directory import revoke_sessions_for_email
        assert asyncio.run(revoke_sessions_for_email("demo@yourcommunity.app", hash_password("Demo123!")))


def test_export_includes_my_data_and_never_the_password_hash():
    with TestClient(server.app) as c:
        acc = _signup(c, "export1@example.com", "Export Person")
        r = c.get("/api/hub/account/export")
        assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
        body = r.json()
        assert body["account"]["email"] == "export1@example.com"
        assert "password_hash" not in r.text and "sessions_valid_after" not in r.text
        assert _audit("account.exported", acc["id"])
        c.post("/api/auth/logout")
        assert c.get("/api/hub/account/export").status_code == 401


def test_delete_account_requires_reauth_and_removes_the_person():
    with TestClient(server.app) as c:
        acc = _signup(c, "delete1@example.com", "Delete Me")
        bad = c.post("/api/hub/account/delete", json={"confirm": "DELETE", "password": "wrong-password-1"})
        assert bad.status_code == 400
        assert c.post("/api/hub/account/delete", json={"confirm": "nope", "password": PW}).status_code == 400
        assert asyncio.run(hub_db().accounts.find_one({"email": "delete1@example.com"}))
        ok = c.post("/api/hub/account/delete", json={"confirm": "delete", "password": PW})
        assert ok.status_code == 200, ok.text
        assert asyncio.run(hub_db().accounts.find_one({"email": "delete1@example.com"})) is None
        assert c.post("/api/auth/login", json={"email": "delete1@example.com", "password": PW}).status_code == 401
        entry = _audit("account.deleted", acc["id"])
        assert entry and "delete1@example.com" not in str(entry[0])  # the log outlives the person; their email doesn't


def test_delete_account_is_refused_for_the_only_admin_of_a_community():
    with TestClient(server.app) as c:
        _signup(c, "founder1@example.com", "Founder One")
        r = c.post("/api/hub/communities", json={"name": "Solo Founder Club", "category": "other"})
        assert r.status_code == 201, r.text
        slug = r.json()["slug"]
        assert _audit("community.created")
        res = c.post("/api/hub/account/delete", json={"confirm": "DELETE", "password": PW})
        assert res.status_code == 409 and "Solo Founder Club" in res.text
        assert asyncio.run(dbfor(slug).users.find_one({"email": "founder1@example.com"}))


def test_platform_audit_log_is_platform_admin_only():
    with TestClient(server.app) as c:
        _signup(c, "nobody1@example.com")
        assert c.get("/api/hub/admin/audit-log").status_code == 403
        c.post("/api/auth/logout")
        assert c.post("/api/auth/login", json={"email": "admin@yourcommunity.app", "password": "Demo123!"}).status_code == 200
        r = c.get("/api/hub/admin/audit-log", params={"action": "auth.login_success"})
        assert r.status_code == 200 and r.json()["entries"]
