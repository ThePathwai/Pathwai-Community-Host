import os, sys, asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
import pytest
from fastapi.testclient import TestClient
import server
import instagram


def client(email):
    c = TestClient(server.app)
    c.__enter__()
    assert c.post("/api/auth/login", json={"email": email, "password": "Demo123!"}).status_code == 200
    return c


@pytest.fixture(scope="module")
def admin():
    c = client("admin@yourcommunity.app")
    yield c
    c.__exit__(None, None, None)


@pytest.fixture(scope="module")
def member():
    c = client("demo@yourcommunity.app")
    yield c
    c.__exit__(None, None, None)


def test_instagram_is_listed_and_admin_only(admin, member):
    assert "instagram" in [p["provider"] for p in admin.get("/api/admin/integrations").json()["integrations"]]
    assert member.get("/api/admin/instagram").status_code == 403
    assert admin.get("/api/admin/instagram").json()["connected"] is False


def test_demo_connect_sync_and_report_section(admin):
    assert admin.put("/api/admin/integrations/instagram", json={"credentials": {"api_key": "demo"}}).status_code == 200
    t = admin.post("/api/admin/integrations/instagram/test").json()
    assert t["ok"] and "demo" in t["message"].lower()
    s = admin.post("/api/admin/integrations/instagram/sync").json()
    assert s["ok"] and s["result"]["followers"] > 0
    st = admin.get("/api/admin/instagram").json()
    assert st["connected"] and st["has_data"] and st["handle"] == "yourcommunity" and st["sample"]

    plain = admin.get("/api/admin/reports/sponsor").json()
    assert "instagram" not in [x["kind"] for x in plain["sections"]]  # off unless asked for
    rep = admin.get("/api/admin/reports/sponsor", params={"include": "instagram"}).json()
    kinds = [x["kind"] for x in rep["sections"]]
    assert kinds[1] == "instagram"  # a sponsor sees reach straight after the headline numbers
    sec = rep["sections"][1]
    assert [t["label"] for t in sec["tiles"]][:2] == ["Followers", "Accounts reached"]
    assert any(c["title"] == "Where the audience is" for c in sec["charts"])
    board = admin.get("/api/admin/reports/board", params={"include": "instagram"}).json()
    assert [x["kind"] for x in board["sections"]][-1] == "instagram"
    pdf = admin.get("/api/admin/reports/funder.pdf", params={"include": "instagram"})
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"


def test_share_link_carries_instagram_and_disconnect_removes_it(admin):
    s = admin.post("/api/admin/report-shares", json={"kind": "sponsor", "include": ["instagram", "bogus"]}).json()
    assert s["include"] == ["instagram"]
    anon = TestClient(server.app)
    body = anon.get(f"/api/public/report/{s['token']}").json()
    assert "instagram" in [x["kind"] for x in body["sections"]]
    assert "access_token" not in anon.get(f"/api/public/report/{s['token']}").text
    assert admin.delete("/api/admin/integrations/instagram").status_code == 200
    again = anon.get(f"/api/public/report/{s['token']}").json()
    assert "instagram" not in [x["kind"] for x in again["sections"]]  # the saved numbers went with the connection
    assert admin.get("/api/admin/instagram").json()["has_data"] is False


def _fake_get(followers, fail=()):
    async def fake(client, path, token, params=None, soft=False):
        p = params or {}
        if path == "me":
            return {"username": "acme", "account_type": "BUSINESS", "followers_count": followers, "follows_count": 10, "media_count": 40}
        if path == "me/media":
            return {"data": [{"id": "m1", "caption": "Launch night", "media_type": "VIDEO", "media_product_type": "REELS", "like_count": 30, "comments_count": 2},
                             {"id": "m2", "caption": "Quiet post", "media_type": "IMAGE", "media_product_type": "FEED", "like_count": 5, "comments_count": 0}]}
        if path.startswith("m") and path.endswith("/insights") and path != "me/insights":
            return {"data": [{"name": "reach", "values": [{"value": 900 if path.startswith("m1") else 90}]}, {"name": "saved", "values": [{"value": 4}]}]}
        if path == "me/insights":
            if p.get("metric") in fail:
                return None
            if p.get("metric") == "follower_demographics":
                dim = p["breakdown"]
                return {"data": [{"total_value": {"breakdowns": [{"results": [{"dimension_values": ["CA" if dim == "country" else "x"], "value": 50}, {"dimension_values": ["US" if dim == "country" else "y"], "value": 70}]}]}}]}
            return {"data": [{"name": p["metric"], "total_value": {"value": 1234}}]}
        raise AssertionError(path)
    return fake


def test_live_snapshot_parsing_and_soft_failures(monkeypatch):
    monkeypatch.setattr(instagram, "_get", _fake_get(5000, fail=("views",)))
    snap = asyncio.run(instagram.fetch_snapshot("tok"))
    assert snap["account"]["followers"] == 5000 and snap["totals"]["reach"] == 1234
    assert snap["totals"]["views"] is None and snap["unavailable"] == ["views"]  # one metric missing never sinks the rest
    assert snap["audience"]["country"][0] == {"label": "United States", "value": 70}  # biggest first, code turned into a name
    assert snap["top_posts"][0]["caption"] == "Launch night" and snap["top_posts"][0]["kind"] == "Reel" and snap["top_posts"][0]["reach"] == 900


def test_small_accounts_skip_audience_breakdowns(monkeypatch):
    monkeypatch.setattr(instagram, "_get", _fake_get(60))
    snap = asyncio.run(instagram.fetch_snapshot("tok"))
    assert snap["audience"] == {} and "100 followers" in snap["audience_note"]


def test_personal_account_is_explained(monkeypatch):
    from routes import integrations as ig
    async def me(token):
        return {"username": "me", "account_type": "PERSONAL", "followers_count": 3}
    monkeypatch.setattr(instagram, "whoami", me)
    with pytest.raises(ig.IntegrationError) as e:
        asyncio.run(ig.instagram_test({"api_key": "real-token"}, {}))
    assert "Business or Creator" in str(e.value)
