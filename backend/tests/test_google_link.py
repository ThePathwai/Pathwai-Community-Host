"""Google Calendar subscribe feed + Google Forms auto-complete hook."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"

import pytest
from fastapi.testclient import TestClient

import server


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:
        yield client


def login(c, email, pw="Demo123!"):
    c.post("/api/auth/logout")
    assert c.post("/api/auth/login", json={"email": email, "password": pw}).status_code == 200


def test_feed_link_is_private_valid_ics_and_resettable(c):
    login(c, "admin@yourcommunity.app")
    r = c.post("/api/events", json={"title": "Feed, Test; Night", "description": "Line one\nLine two", "starts_at": "2031-09-01T18:00:00Z", "ends_at": "2031-09-01T20:00:00Z", "location": "Toronto, ON"})
    assert r.status_code == 201, r.text
    eid = r.json()["id"]
    login(c, "demo@yourcommunity.app")
    me = c.get("/api/me/calendar").json()
    assert me["feed_url"].startswith("http") and ".ics?community=" in me["feed_url"]
    assert me["webcal_url"].startswith("webcal://") and me["google_url"].startswith("https://calendar.google.com/calendar/r?cid=webcal")
    assert c.get("/api/me/calendar").json()["feed_url"] == me["feed_url"]  # stable
    path = "/api/" + me["feed_url"].split("/api/", 1)[1]
    c.post("/api/auth/logout")  # a calendar app has no cookies
    r = c.get(path)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/calendar")
    body = r.text
    assert body.startswith("BEGIN:VCALENDAR") and body.rstrip().endswith("END:VCALENDAR") and "\r\n" in body
    assert f"UID:{eid}@pathwai" in body and "DTSTART:20310901T180000Z" in body and "DTEND:20310901T200000Z" in body
    assert "SUMMARY:Feed\\, Test\; Night" in body and "LOCATION:Toronto\\, ON" in body and "Line one\\nLine two" in body
    assert all(len(l.encode()) <= 75 for l in body.split("\r\n"))
    # bad / missing token
    assert c.get("/api/calendar/feed/not-a-real-token-at-all-000.ics?community=playr").status_code == 404
    # reset kills the old link
    login(c, "demo@yourcommunity.app")
    new = c.post("/api/me/calendar/reset").json()
    assert new["feed_url"] != me["feed_url"]
    c.post("/api/auth/logout")
    assert c.get(path).status_code == 404
    assert c.get("/api/" + new["feed_url"].split("/api/", 1)[1]).status_code == 200


def test_feed_hides_events_outside_the_members_audience(c):
    login(c, "admin@yourcommunity.app")
    r = c.post("/api/events", json={"title": "Mentors Only Dinner", "starts_at": "2031-10-01T18:00:00Z", "audience": ["mentor"]})
    assert r.status_code == 201, r.text
    login(c, "demo@yourcommunity.app")
    path = "/api/" + c.get("/api/me/calendar").json()["feed_url"].split("/api/", 1)[1]
    c.post("/api/auth/logout")
    assert "Mentors Only Dinner" not in c.get(path).text


def _request(c, member_email, url, title):
    login(c, "admin@yourcommunity.app")
    uid = next(u["id"] for u in c.get("/api/users", params={"q": ""}).json() if u.get("email") == member_email) if False else None
    users = c.get("/api/admin/users").json()
    uid = next(u["id"] for u in users if u["email"] == member_email)
    r = c.post("/api/admin/member-requests", json={"user_ids": [uid], "kind": "availability", "title": title, "external_url": url, "external_provider": "Google Form"})
    assert r.status_code == 201, r.text
    return uid


def test_form_link_must_be_http(c):
    login(c, "admin@yourcommunity.app")
    users = c.get("/api/admin/users").json()
    uid = next(u["id"] for u in users if u["email"] == "demo@yourcommunity.app")
    r = c.post("/api/admin/member-requests", json={"user_ids": [uid], "kind": "availability", "external_url": "javascript:alert(1)"})
    assert r.status_code == 400


def test_form_link_without_https_is_fixed_up(c):
    login(c, "admin@yourcommunity.app")
    assert c.post("/api/admin/users", json={"name": "Bare Link", "email": "bare.link@example.com", "password": "Passw0rd-long-1"}).status_code == 201
    uid = _request(c, "bare.link@example.com", "  docs.google.com/forms/d/e/1FAIpQLSCCC/viewform ", "Bare link survey")
    login(c, "bare.link@example.com", "Passw0rd-long-1")
    reqs = c.get("/api/me/requests").json()["requests"]
    mine = next(r for r in reqs if r["title"] == "Bare link survey")
    assert mine["external_url"] == "https://docs.google.com/forms/d/e/1FAIpQLSCCC/viewform"
    out = c.post(f"/api/member-requests/{mine['id']}/external-open").json()
    assert out["url"] == mine["external_url"]


def test_google_form_submission_completes_the_matching_request(c):
    # fresh members, so this doesn't disturb the seeded demo member's requests used by other tests
    login(c, "admin@yourcommunity.app")
    assert c.post("/api/admin/users", json={"name": "Multi Form", "email": "multi.form@example.com", "password": "Passw0rd-long-1"}).status_code == 201
    _request(c, "multi.form@example.com", "https://docs.google.com/forms/d/e/1FAIpQLSAAA/viewform?usp=sf_link", "Survey A")
    _request(c, "multi.form@example.com", "https://docs.google.com/forms/d/e/1FAIpQLSBBB/viewform", "Survey B")
    login(c, "admin@yourcommunity.app")
    setup = c.get("/api/admin/google-forms/setup").json()
    assert "/api/webhooks/google-forms/" in setup["webhook_url"] and setup["webhook_url"] in setup["script"] and "getRespondentEmail" in setup["script"]
    hook = "/api/" + setup["webhook_url"].split("/api/", 1)[1]
    c.post("/api/auth/logout")
    # wrong secret
    assert c.post(hook.replace("/google-forms/", "/google-forms/x"), json={"email": "multi.form@example.com"}).status_code == 404
    # no email collected / unknown member: harmless
    assert c.post(hook, json={}).json()["matched"] == 0
    assert c.post(hook, json={"email": "nobody@example.com"}).json()["matched"] == 0
    # two open forms and an unknown form link: ambiguous, nothing completed
    assert c.post(hook, json={"email": "multi.form@example.com", "form_url": "https://docs.google.com/forms/d/e/1FAIpQLSZZZ/viewform"}).json()["matched"] == 0
    # exact form match completes just that one
    r = c.post(hook, json={"email": "MULTI.form@example.com", "form_url": "https://docs.google.com/forms/d/e/1FAIpQLSAAA/viewform"}).json()
    assert r["matched"] == 1
    login(c, "multi.form@example.com", "Passw0rd-long-1")
    mine = {x["title"]: x["status"] for x in c.get("/api/me/requests").json()["requests"]}
    assert mine["Survey A"] == "submitted" and mine["Survey B"] != "submitted"
    # a member with exactly one open Google Form: it can only be that one, even with a short-link style URL
    login(c, "admin@yourcommunity.app")
    assert c.post("/api/admin/users", json={"name": "Single Form", "email": "single.form@example.com", "password": "Passw0rd-long-1"}).status_code == 201
    _request(c, "single.form@example.com", "https://forms.gle/abc123", "Short link survey")
    c.post("/api/auth/logout")
    r = c.post(hook, json={"email": "single.form@example.com", "form_url": "https://docs.google.com/forms/d/e/other/viewform"}).json()
    assert r["matched"] == 1, r
    # reset invalidates the old hook
    login(c, "admin@yourcommunity.app")
    new = c.post("/api/admin/google-forms/reset").json()
    assert new["webhook_url"] != setup["webhook_url"]
    c.post("/api/auth/logout")
    assert c.post(hook, json={"email": "multi.form@example.com"}).status_code == 404


def test_setup_is_admin_only(c):
    login(c, "demo@yourcommunity.app")
    assert c.get("/api/admin/google-forms/setup").status_code == 403

