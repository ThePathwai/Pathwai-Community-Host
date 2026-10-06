"""A community's external share link (GET /hub/communities/{slug}/public, reached with no login at
frontend's /c/:slug) and the signup that names it as a join target (SignupIn.join_slug), which is
how a brand-new person coming from that link lands straight inside the community instead of the
generic Hub. See routes/hub.py's hub_community_public / _apply_to_community / hub_signup."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
os.environ["ENABLE_AI_CHAT"] = "true"

from fastapi.testclient import TestClient

import server


def test_community_public_landing_needs_no_auth_and_hides_nothing_sensitive():
    with TestClient(server.app) as c:
        r = c.get("/api/hub/communities/playr/public")
        assert r.status_code == 200
        body = r.json()
        assert body["slug"] == "playr" and body["name"] and "brand" in body
        assert set(body.keys()) >= {"tagline", "about", "kind", "members", "upcoming_events", "require_approval", "apply_questions"}
        # no session, no cookie at all was ever set for this request
        assert "pw_community" not in r.cookies

        assert c.get("/api/hub/communities/not-a-real-slug/public").status_code == 404


def test_signup_with_join_slug_applies_to_that_community_when_approval_is_required():
    with TestClient(server.app) as c:
        # playr requires approval by default (seeded) -- joining via the share link still means
        # waiting on an admin, same as applying the normal way, just in one request instead of two.
        r = c.post("/api/hub/signup", json={"accepted_terms": True, "email": "sharelink1@example.com", "password": "Sup3rSecret!", "name": "Share Linker", "join_slug": "playr"})
        assert r.status_code == 201
        body = r.json()
        assert body["joined"] == {"slug": "playr", "status": "pending"}
        # pending means not seated yet -- no community cookie, still on the generic Hub
        assert "pw_community" not in r.cookies

        mine = c.get("/api/hub/communities").json()["communities"]
        playr = next(x for x in mine if x["slug"] == "playr")
        assert playr["my"]["status"] == "pending"


def test_require_approval_cannot_be_turned_off_even_by_an_admin():
    with TestClient(server.app) as c:
        # Policy: every community requires admin approval, full stop -- there's no way to skip it,
        # not even via the same PATCH /community/config an admin would use from Settings. Confirms
        # the field is excluded from patch_config's allowed set (routes/community_config.py) and that
        # _apply_to_community (routes/hub.py) and auth_signup (server.py) both hardcode it too.
        c.post("/api/auth/login", json={"email": "admin@yourcommunity.app", "password": "Demo123!"})
        c.post("/api/hub/enter", json={"slug": "playr"})
        r = c.patch("/api/community/config", json={"require_approval": False})
        assert r.status_code == 200
        assert r.json()["require_approval"] is True  # silently ignored, not applied
        c.post("/api/auth/logout")

        r = c.post("/api/hub/signup", json={"accepted_terms": True, "email": "sharelink2@example.com", "password": "Sup3rSecret!", "name": "Fast Joiner", "join_slug": "playr"})
        assert r.status_code == 201
        assert r.json()["joined"] == {"slug": "playr", "status": "pending"}
        assert "pw_community" not in r.cookies  # never seated without approval, whatever the config says


def test_signup_with_unknown_join_slug_is_ignored_not_rejected():
    with TestClient(server.app) as c:
        r = c.post("/api/hub/signup", json={"accepted_terms": True, "email": "sharelink3@example.com", "password": "Sup3rSecret!", "name": "Typo Link", "join_slug": "not-a-real-slug"})
        assert r.status_code == 201
        assert r.json()["joined"] is None


def test_signup_without_join_slug_behaves_exactly_as_before():
    with TestClient(server.app) as c:
        r = c.post("/api/hub/signup", json={"accepted_terms": True, "email": "plain-signup@example.com", "password": "Sup3rSecret!", "name": "Plain Signup"})
        assert r.status_code == 201
        assert r.json()["joined"] is None
        assert "pw_community" not in r.cookies
