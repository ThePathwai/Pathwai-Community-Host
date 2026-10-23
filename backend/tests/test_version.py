"""/api/version tells a browser which build the server is running, so a stale copy can refresh itself."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"

from fastapi.testclient import TestClient

import server


def test_version_reports_short_commit(monkeypatch):
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "abcdef1234567890")
    with TestClient(server.app) as c:
        r = c.get("/api/version")
        assert r.status_code == 200
        assert r.json() == {"build": "abcdef1"}


def test_version_is_empty_without_a_commit(monkeypatch):
    monkeypatch.delenv("RAILWAY_GIT_COMMIT_SHA", raising=False)
    with TestClient(server.app) as c:
        assert c.get("/api/version").json() == {"build": ""}
