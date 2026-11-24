"""On a real deployment, person-level data (the member directory, a member's profile, the demo 'me' user and members'
help requests) is only for signed-in people. The demo/dev/test environment keeps its old open behaviour."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
os.environ["ENABLE_AI_CHAT"] = "true"

from fastapi.testclient import TestClient

import server
from routes import navigator as navroutes
from routes import support_requests as sr


def test_member_data_needs_login_on_a_real_deployment(monkeypatch):
    with TestClient(server.app) as c:
        assert c.get("/api/users").status_code == 200  # demo/test environment stays open
        monkeypatch.setattr(server, "demo_mode", lambda: False)
        monkeypatch.setattr(sr, "demo_mode", lambda: False)
        monkeypatch.setattr(navroutes, "demo_mode", lambda: False)
        for path in ("/api/users", "/api/users/u-founder-me", "/api/support-requests", "/api/me", "/api/navigator/checks"):
            assert c.get(path).status_code == 401, path
        assert c.get("/api/navigator/programs").status_code == 200   # the programs directory stays public
