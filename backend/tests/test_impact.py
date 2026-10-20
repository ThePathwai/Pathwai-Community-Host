import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
import server
import impact


def client(email):
    c = TestClient(server.app)
    c.__enter__()
    r = c.post("/api/auth/login", json={"email": email, "password": "Demo123!"})
    assert r.status_code == 200, r.text
    return c


@pytest.fixture(scope="module")
def member():
    c = client("demo@yourcommunity.app")
    yield c
    c.__exit__(None, None, None)


@pytest.fixture(scope="module")
def admin():
    c = client("admin@yourcommunity.app")
    yield c
    c.__exit__(None, None, None)


def test_members_cannot_see_impact_or_reports(member):
    for path in ("/api/admin/impact", "/api/admin/reports/sponsor", "/api/admin/quiet", "/api/admin/report-shares"):
        assert member.get(path).status_code == 403
    assert member.post("/api/admin/quiet/nudge", json={"user_ids": ["x"]}).status_code == 403


def test_impact_summary_has_the_four_cards(admin):
    r = admin.get("/api/admin/impact")
    assert r.status_code == 200, r.text
    j = r.json()
    assert [c["key"] for c in j["cards"]] == ["active", "intros", "turnout", "perks"]
    assert j["period_days"] == 90 and isinstance(j["quiet"], int)


@pytest.mark.parametrize("kind", ["sponsor", "funder", "board"])
def test_each_report_type_builds_and_has_a_pdf(admin, kind):
    r = admin.get(f"/api/admin/reports/{kind}", params={"days": 30})
    assert r.status_code == 200, r.text
    rep = r.json()
    assert rep["type"] == kind and rep["period_days"] == 30 and rep["sections"]
    for s in rep["sections"]:
        assert {"title", "tiles", "charts", "insights"} <= set(s)
    pdf = admin.get(f"/api/admin/reports/{kind}.pdf")
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    assert admin.get("/api/admin/reports/nope").status_code == 400


def test_live_share_link_is_public_aggregate_only_and_revocable(admin):
    s = admin.post("/api/admin/report-shares", json={"kind": "sponsor", "days": 90, "label": "Acme Corp"}).json()
    assert s["token"] and s["kind"] == "sponsor"
    anon = TestClient(server.app)
    r = anon.get(f"/api/public/report/{s['token']}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["read_only"] is True and body["label"] == "Acme Corp" and body["sections"]
    assert "@" not in r.text  # totals only: no emails, no member records
    assert [x for x in admin.get("/api/admin/report-shares").json()["shares"] if x["id"] == s["id"]][0]["views"] >= 1
    assert admin.delete(f"/api/admin/report-shares/{s['id']}").status_code == 200
    assert anon.get(f"/api/public/report/{s['token']}").status_code == 404
    assert anon.get("/api/public/report/not-a-real-token").status_code == 404
    assert admin.post("/api/admin/report-shares", json={"kind": "bogus"}).status_code == 400


def test_last_seen_is_recorded_and_throttled(member):
    import activity
    activity._seen.clear()
    assert member.get("/api/notifications").status_code == 200
    n = len(activity._seen)
    assert n >= 1  # a write was made for this person
    member.get("/api/notifications")
    assert len(activity._seen) == n  # the second request inside the window changes nothing


def _d(now, users, acts=(), nudges=()):
    return {"now": now, "users": users, "events": [], "rsvp_log": [], "acts": list(acts), "nudges": list(nudges)}


def test_quiet_rules():
    now = datetime(2026, 10, 1, tzinfo=timezone.utc)
    u = lambda i, days: {"id": i, "name": i, "role": "member", "created_at": (now - timedelta(days=days)).isoformat()}
    users = [u("old_active", 200), u("old_quiet", 200), u("never", 60), u("new", 5), u("admin", 300) | {"role": "admin"}]
    acts = [("old_active", now - timedelta(days=3)), ("old_quiet", now - timedelta(days=45))]
    rows = {r["id"]: r for r in impact.quiet_list(_d(now, users, acts), 30)}
    assert set(rows) == {"old_quiet", "never"}  # new joiners get two weeks of grace; admins are never listed
    assert rows["old_quiet"]["days_quiet"] == 45 and "45 days" in rows["old_quiet"]["reason"]
    assert "since joining" in rows["never"]["reason"]
    rows2 = {r["id"]: r for r in impact.quiet_list(_d(now, users, acts, [{"user_id": "never", "at": (now - timedelta(days=2)).isoformat()}]), 30)}
    assert rows2["never"]["nudged_recently"] and list(rows2)[-1] == "never"  # nudged people sink to the bottom


def test_nudge_notifies_once_then_cools_down(admin, member):
    q = admin.get("/api/admin/quiet", params={"days": 7}).json()
    target = member.get("/api/auth/me")
    uid = target.json().get("id") if target.status_code == 200 else None
    assert uid
    first = admin.post("/api/admin/quiet/nudge", json={"user_ids": [uid], "message": "Come to Friday's session"}).json()
    assert first["sent"] == 1
    again = admin.post("/api/admin/quiet/nudge", json={"user_ids": [uid]}).json()
    assert again["sent"] == 0 and again["skipped"] == 1
    notes = member.get("/api/notifications").json()["notifications"]
    assert any(n["kind"] == "nudge" and "Friday" in n["body"] for n in notes)
    assert admin.post("/api/admin/quiet/nudge", json={"user_ids": []}).status_code == 400
