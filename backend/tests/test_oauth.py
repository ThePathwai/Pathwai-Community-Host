"""Google / Apple sign-in: verifies an ID token's signature against the provider's public keys
and signs the person into Pathwai's multi-community account model. We never call the real
Google/Apple JWKS endpoints in tests — `_jwk_client` is monkeypatched to hand back the public half
of a keypair generated in-process, and the tokens are signed with the matching private half."""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
os.environ["ENABLE_AI_CHAT"] = "true"  # smoke tests exercise chat end to end even though it defaults off in production

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

import server
import routes.oauth as oauth_mod

CLIENT_ID = "test-client-id.apps.googleusercontent.com"


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:
        yield client


@pytest.fixture(scope="module")
def keypair():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key, key.public_key()


class _FakeSigningKey:
    def __init__(self, key):
        self.key = key


def _jwks(public_key):
    return lambda provider: type("Fake", (), {"get_signing_key_from_jwt": staticmethod(lambda tok: _FakeSigningKey(public_key))})()


def _token(priv, **overrides):
    claims = {"iss": "https://accounts.google.com", "aud": CLIENT_ID, "email": "someone@gmail.com",
              "email_verified": True, "sub": "goog-sub-1", "name": "Someone Person",
              "iat": int(time.time()), "exp": int(time.time()) + 3600}
    claims.update(overrides)
    return jwt.encode(claims, priv, algorithm="RS256")


def test_providers_unconfigured_by_default(c, monkeypatch):
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("APPLE_CLIENT_ID", raising=False)
    r = c.get("/api/auth/oauth/providers").json()
    assert r["google"]["configured"] is False
    assert r["apple"]["configured"] is False
    assert r["google"]["client_id"] is None


def test_unconfigured_provider_rejects_with_501(c, monkeypatch):
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    r = c.post("/api/auth/oauth/google", json={"credential": "whatever.token.here"})
    assert r.status_code == 501


def test_unknown_provider_404(c):
    r = c.post("/api/auth/oauth/facebook", json={"credential": "whatever.token.here"})
    assert r.status_code == 404


def test_new_person_gets_a_fresh_platform_account(c, monkeypatch, keypair):
    priv, pub = keypair
    monkeypatch.setenv("GOOGLE_CLIENT_ID", CLIENT_ID)
    monkeypatch.setattr(oauth_mod, "_jwk_client", _jwks(pub))
    token = _token(priv, email="brand.new@gmail.com", sub="goog-new-1")

    c.post("/api/auth/logout")
    # a first-ever sign-in would create an account, so it must carry the Terms/Privacy agreement:
    # without it the server answers 428 and creates nothing (the client then asks and retries)
    r = c.post("/api/auth/oauth/google", json={"credential": token})
    assert r.status_code == 428 and r.json()["detail"]["code"] == "terms_required", r.text
    assert c.get("/api/hub/me").json()["account"] is None
    r = c.post("/api/auth/oauth/google", json={"credential": token, "accepted_terms": True})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["new_account"] is True
    assert body["account"]["email"] == "brand.new@gmail.com"
    assert body["user"] is None  # no community membership yet — lands on the hub

    me = c.get("/api/hub/me").json()
    assert me["account"]["email"] == "brand.new@gmail.com"
    # signing in again with the same verified email reuses the same account, doesn't duplicate it
    r2 = c.post("/api/auth/oauth/google", json={"credential": _token(priv, email="brand.new@gmail.com", sub="goog-new-1")})
    assert r2.json()["new_account"] is False
    assert r2.json()["account"]["id"] == body["account"]["id"]


def test_signin_matches_an_existing_community_member_by_email(c, monkeypatch, keypair):
    priv, pub = keypair
    monkeypatch.setenv("GOOGLE_CLIENT_ID", CLIENT_ID)
    monkeypatch.setattr(oauth_mod, "_jwk_client", _jwks(pub))
    token = _token(priv, email="demo@yourcommunity.app", sub="goog-existing-1")

    c.post("/api/auth/logout")
    r = c.post("/api/auth/oauth/google", json={"credential": token})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["new_account"] is False
    assert body["user"]["email"] == "demo@yourcommunity.app"


def test_bad_signature_is_rejected(c, monkeypatch, keypair):
    priv, _pub = keypair
    other_pub = rsa.generate_private_key(public_exponent=65537, key_size=2048).public_key()
    monkeypatch.setenv("GOOGLE_CLIENT_ID", CLIENT_ID)
    monkeypatch.setattr(oauth_mod, "_jwk_client", _jwks(other_pub))
    token = _token(priv, email="mallory@gmail.com")  # signed with `priv`, verified against an unrelated public key

    r = c.post("/api/auth/oauth/google", json={"credential": token})
    assert r.status_code == 401


def test_wrong_audience_is_rejected(c, monkeypatch, keypair):
    priv, pub = keypair
    monkeypatch.setenv("GOOGLE_CLIENT_ID", CLIENT_ID)
    monkeypatch.setattr(oauth_mod, "_jwk_client", _jwks(pub))
    token = _token(priv, aud="someone-elses-client-id")

    r = c.post("/api/auth/oauth/google", json={"credential": token})
    assert r.status_code == 401


def test_token_without_email_is_rejected(c, monkeypatch, keypair):
    priv, pub = keypair
    monkeypatch.setenv("GOOGLE_CLIENT_ID", CLIENT_ID)
    monkeypatch.setattr(oauth_mod, "_jwk_client", _jwks(pub))
    claims = {"iss": "https://accounts.google.com", "aud": CLIENT_ID, "sub": "no-email-1", "iat": int(time.time()), "exp": int(time.time()) + 3600}
    token = jwt.encode(claims, priv, algorithm="RS256")

    r = c.post("/api/auth/oauth/google", json={"credential": token})
    assert r.status_code == 400
