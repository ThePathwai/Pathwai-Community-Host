import os, sys, asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
import server
import impact
import tiktok


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


def test_tiktok_is_listed_and_admin_only(admin, member):
    p = {x["provider"]: x for x in admin.get("/api/admin/integrations").json()["integrations"]}
    assert [f["key"] for f in p["tiktok"]["credential_fields"]] == ["client_key", "client_secret", "refresh_token"]
    assert member.get("/api/admin/tiktok").status_code == 403
    assert admin.get("/api/admin/tiktok").json()["connected"] is False


def test_demo_connect_sync_and_the_combined_social_section(admin):
    assert admin.put("/api/admin/integrations/tiktok", json={"credentials": {"client_key": "demo"}}).status_code == 200
    assert "demo" in admin.post("/api/admin/integrations/tiktok/test").json()["message"].lower()
    s = admin.post("/api/admin/integrations/tiktok/sync").json()
    assert s["ok"] and s["result"]["followers"] > 0
    st = admin.get("/api/admin/tiktok").json()
    assert st["connected"] and st["has_data"] and st["sample"]
    # TikTok alone: just its own section
    only = admin.get("/api/admin/reports/board", params={"include": "tiktok"}).json()["sections"]
    assert [x["kind"] for x in only][-1] == "tiktok" and "social" not in [x["kind"] for x in only]
    # with Instagram too: Social reach (both together), then each on its own
    admin.put("/api/admin/integrations/instagram", json={"credentials": {"api_key": "demo"}})
    admin.post("/api/admin/integrations/instagram/sync")
    rep = admin.get("/api/admin/reports/sponsor", params={"include": "instagram,tiktok"}).json()
    kinds = [x["kind"] for x in rep["sections"]]
    assert kinds[1:4] == ["social", "instagram", "tiktok"]
    soc = rep["sections"][1]
    ig, tt = admin.get("/api/admin/instagram").json(), admin.get("/api/admin/tiktok").json()
    assert soc["tiles"][0]["value"] == f"{ig['followers'] + tt['followers']:,}"
    assert [c["title"] for c in soc["charts"]] == ["Followers by platform", "Views by platform, last 30 days"]
    assert {i["label"] for i in soc["charts"][0]["items"]} == {"Instagram", "TikTok"}
    assert admin.get("/api/admin/reports/sponsor/deck.pdf", params={"include": "instagram,tiktok"}).content[:4] == b"%PDF"
    assert admin.get("/api/admin/reports/funder.pdf", params={"include": "instagram,tiktok"}).content[:4] == b"%PDF"


def test_share_link_carries_both_and_disconnecting_removes_tiktok(admin):
    s = admin.post("/api/admin/report-shares", json={"kind": "sponsor", "include": ["instagram", "tiktok", "bogus"]}).json()
    assert s["include"] == ["instagram", "tiktok"]
    anon = TestClient(server.app)
    body = anon.get(f"/api/public/report/{s['token']}")
    assert {"social", "instagram", "tiktok"} <= {x["kind"] for x in body.json()["sections"]}
    for secret in ("client_secret", "refresh_token", "access_token"):
        assert secret not in body.text
    assert admin.delete("/api/admin/integrations/tiktok").status_code == 200
    again = {x["kind"] for x in anon.get(f"/api/public/report/{s['token']}").json()["sections"]}
    assert "tiktok" not in again and "social" not in again and "instagram" in again
    assert admin.get("/api/admin/tiktok").json()["has_data"] is False
    admin.delete("/api/admin/integrations/instagram")  # leave the shared test database as it was found


def test_the_last_30_days_come_from_the_videos_posted_in_them():
    now = datetime.now(timezone.utc)
    ts = lambda d: int((now - timedelta(days=d)).timestamp())  # noqa: E731
    vids = [{"id": "a", "title": "New", "create_time": ts(3), "view_count": 1000, "like_count": 100, "comment_count": 10, "share_count": 20},
            {"id": "b", "title": "Old", "create_time": ts(90), "view_count": 50000, "like_count": 1, "comment_count": 1, "share_count": 1}]
    snap = tiktok.build_snapshot({"username": "tpl", "follower_count": 4200, "likes_count": 9000, "video_count": 40}, vids, now)
    assert snap["totals"] == {"videos_posted": 1, "views": 1000, "likes": 100, "comments": 10, "shares": 20}
    assert snap["top_posts"][0]["id"] == "b" and snap["account"]["followers"] == 4200
    sec = impact.tiktok_section(snap, [])
    assert sec["tiles"][1]["value"] == "1,000" and sec["charts"][0]["title"] == "Best recent videos"


def test_fetch_reads_pages_and_a_rejected_token_is_explained(monkeypatch):
    calls = []

    async def fake_call(client, method, path, token, **kw):
        calls.append((method, path))
        if path == "user/info/":
            return {"user": {"username": "tpl", "follower_count": 10}}
        page = len([c for c in calls if c[1] == "video/list/"])
        return {"videos": [{"id": str(page), "title": "t", "create_time": int(datetime.now(timezone.utc).timestamp()), "view_count": 5}], "has_more": page < 2, "cursor": page}

    monkeypatch.setattr(tiktok, "_call", fake_call)
    snap = asyncio.run(tiktok.fetch_snapshot("tok"))
    assert snap["totals"]["views"] == 10 and snap["totals"]["videos_posted"] == 2 and len([c for c in calls if c[1] == "video/list/"]) == 2

    class Bad:
        status_code = 400
        def json(self): return {"error": "invalid_grant"}
        text = ""

    class FakeClient:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, *a, **k): return Bad()

    monkeypatch.setattr(tiktok.httpx, "AsyncClient", FakeClient)
    with pytest.raises(tiktok.TikTokError, match="refresh token"):
        asyncio.run(tiktok.refresh_access("k", "s", "r"))
