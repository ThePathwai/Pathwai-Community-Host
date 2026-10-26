"""Built-in texts and email: Pathwai's own Twilio and SendGrid, text credits, the shared STOP list.

The provider calls are intercepted with httpx.MockTransport, so nothing leaves the process, but the requests built
(URLs, auth, bodies) are exactly what would go over the wire. The default test environment is the demo one, which
simulates sends; the "real path" tests switch that off (DEMO_MODE=false) and set the platform variables."""
import asyncio
import base64
import hashlib
import hmac
import json
import os
import sys
import uuid
from urllib.parse import parse_qs

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
os.environ["ENABLE_AI_CHAT"] = "true"

import httpx
import pytest
from fastapi.testclient import TestClient

import messaging
import server
from database import hub_db
from routes.hub import in_community


@pytest.fixture
def mock_http(monkeypatch):
    real = httpx.AsyncClient
    state = {"handler": lambda req: httpx.Response(500), "calls": []}

    def factory(*a, **kw):
        def h(req):
            state["calls"].append(req)
            return state["handler"](req)
        kw["transport"] = httpx.MockTransport(h)
        return real(*a, **kw)

    monkeypatch.setattr(httpx, "AsyncClient", factory)
    return state


@pytest.fixture(scope="module")
def club():
    with TestClient(server.app) as client:
        r = client.post("/api/hub/signup", json={"accepted_terms": True, "email": "founder@msg.example.com", "password": "MsgPass12345", "name": "Msg Founder"})
        assert r.status_code == 201, r.text
        r = client.post("/api/hub/communities", json={"name": "Live Test Club", "category": "other"})
        assert r.status_code == 201, r.text
        slug = r.json()["slug"]
        client.headers.update({"X-Community": slug})
        me = client.get("/api/auth/me").json()
        yield {"c": client, "slug": slug, "admin_email": me["email"]}


def run_in(slug, make_coro):
    with in_community(slug):
        return asyncio.run(make_coro())


def add_member(slug, name, email, phone=None, sms=False):
    doc = {"id": str(uuid.uuid4()), "name": name, "email": email, "role": "member", "member_type": "member", "membership_status": "approved",
           "password_hash": "!", "created_at": "2026-01-01T00:00:00+00:00", "settings": {"notifications": {"sms": sms, "email": True}},
           "contact": {"phone": phone or "", "email": email}}
    run_in(slug, lambda: server.db.users.insert_one(dict(doc)))
    return doc


def _form(req):
    return {k: v[0] for k, v in parse_qs(req.content.decode(), keep_blank_values=True).items()}


def _credits(slug):
    return run_in(slug, messaging.account)["sms_credits"]


def _set_credits(slug, n):
    run_in(slug, lambda: server.db.messaging.update_one({"_key": "account"}, {"$set": {"sms_credits": n}}, upsert=True))


def _live(monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "false")
    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "ACtest123")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "twtoken")
    monkeypatch.setenv("TWILIO_MESSAGING_SERVICE_SID", "MGpathwai")
    monkeypatch.setenv("SENDGRID_API_KEY", "SG.platform")
    monkeypatch.setenv("MAIL_FROM_EMAIL", "hello@pathwai.test")


def test_segment_counts():
    assert messaging.segments("") == 0
    assert messaging.segments("a" * 160) == 1 and messaging.segments("a" * 161) == 2 and messaging.segments("a" * 306) == 2 and messaging.segments("a" * 307) == 3
    assert messaging.segments("Hi 😀") == 1 and messaging.segments("😀" * 35) == 1 and messaging.segments("😀" * 36) == 2  # an emoji drops the limit to 70, and counts as two
    assert messaging.segments("{" * 80) == 1 and messaging.segments("{" * 81) == 2  # { } [ ] ^ ~ | \\ and € take two places
    assert messaging.to_e164("(416) 555-0101") == "+14165550101" and messaging.to_e164("12") is None


def test_demo_blast_is_simulated_and_uses_credits(club):
    c, slug = club["c"], club["slug"]
    add_member(slug, "Dee", "dee@msg.example.com", "416-555-0201", sms=True)
    st = c.get("/api/admin/messaging").json()
    assert st["simulated"] and st["sms_available"] and st["email_available"] and st["sms_credits"] >= 1
    a = c.post("/api/admin/blasts/audience", json={"type": "all"}).json()
    assert a["sms_count"] >= 1 and a["sms_credits"] == st["sms_credits"]
    before = _credits(slug)
    r = c.post("/api/admin/blasts/send", json={"message": "Doors at 7", "channel": "sms", "audience": {"type": "all"}}).json()
    assert r["demo"] and r["sms_sent"] == a["sms_count"] and r["sms_credits_used"] == r["sms_sent"]
    assert _credits(slug) == before - r["sms_credits_used"] == r["sms_credits_left"]


def test_real_path_texts_and_email_go_out_under_the_community_name(club, mock_http, monkeypatch):
    c, slug = club["c"], club["slug"]
    _live(monkeypatch)
    m1 = add_member(slug, "Ann", "ann@msg.example.com", "(416) 555-0101", sms=True)
    add_member(slug, "", "noname@msg.example.com", "416-555-0102", sms=True)
    add_member(slug, "Cy", "cy@msg.example.com", "+1 416 555 0103", sms=True)
    _set_credits(slug, 100)
    sms_calls, mail_calls = [], []

    def handler(req):
        if req.url.host == "api.twilio.com":
            assert base64.b64decode(req.headers["authorization"].split()[1]).decode() == "ACtest123:twtoken"
            assert req.url.path == "/2010-04-01/Accounts/ACtest123/Messages.json"
            f = _form(req)
            sms_calls.append(f)
            if f["To"] == "+14165550103":
                return httpx.Response(400, json={"message": "The 'To' number is not a valid phone number", "code": 21211})
            return httpx.Response(201, json={"sid": "SM1"})
        if req.url.host == "api.sendgrid.com":
            assert req.headers["authorization"] == "Bearer SG.platform"
            mail_calls.append(json.loads(req.content))
            return httpx.Response(202)
        return httpx.Response(404)

    mock_http["handler"] = handler
    audience = c.post("/api/admin/blasts/audience", json={"type": "all"}).json()
    assert not audience["simulated"]
    r = c.post("/api/admin/blasts/send", json={"message": "Court closed tonight", "subject": "Heads up", "channel": "both", "audience": {"type": "all"}}).json()
    assert not r["demo"]
    assert r["sms_sent"] == 3 - 1 + (audience["sms_count"] - 3) and r["sms_failed"] == 1 and any("not a valid phone number" in e for e in r["errors"])
    assert {f["To"] for f in sms_calls} >= {"+14165550101", "+14165550102", "+14165550103"}
    for f in sms_calls:
        assert f["MessagingServiceSid"] == "MGpathwai" and "From" not in f
        assert f["Body"].startswith("Live Test Club: Court closed tonight") and f["Body"].endswith("Reply STOP to opt out.")
    # the failed text was refunded: only delivered texts are charged
    assert r["sms_credits_used"] == r["sms_sent"] and _credits(slug) == 100 - r["sms_sent"]
    assert r["email_sent"] == len(mail_calls) >= 4 and r["email_failed"] == 0
    for payload in mail_calls:
        to = payload["personalizations"][0]["to"][0]
        assert to.get("name", "x") not in ("", None)  # SendGrid rejects null/empty names, so they are omitted
        assert payload["from"] == {"email": "hello@pathwai.test", "name": "Live Test Club"}
        assert payload["reply_to"] == {"email": club["admin_email"]}
        assert payload["subject"] == "Heads up" and "Court closed tonight" in payload["content"][0]["value"] and "turn off email" in payload["content"][0]["value"]
    # a stopped number is left out of the next blast, in every community
    run_in(slug, lambda: messaging.set_opt_out("+14165550101", True))
    again = c.post("/api/admin/blasts/audience", json={"type": "all"}).json()
    assert again["sms_count"] == audience["sms_count"] - 1
    run_in(slug, lambda: messaging.set_opt_out("+14165550101", False))
    assert m1["id"]


def test_not_enough_credits_sends_nothing(club, mock_http, monkeypatch):
    c, slug = club["c"], club["slug"]
    _live(monkeypatch)
    _set_credits(slug, 1)
    mock_http["handler"] = lambda req: httpx.Response(201, json={})
    r = c.post("/api/admin/blasts/send", json={"message": "x", "channel": "sms", "audience": {"type": "all"}})
    assert r.status_code == 400 and "credits" in r.json()["detail"]
    assert not [x for x in mock_http["calls"] if x.url.host == "api.twilio.com"] and _credits(slug) == 1
    # email and in-app need no credits
    ok = c.post("/api/admin/blasts/send", json={"message": "x", "channel": "email", "audience": {"type": "all"}})
    assert ok.status_code == 200 and ok.json()["sms_credits_used"] == 0


def test_real_deployment_without_provider_variables_refuses_instead_of_pretending(club, monkeypatch):
    c = club["c"]
    monkeypatch.setenv("DEMO_MODE", "false")
    for k in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_MESSAGING_SERVICE_SID", "TWILIO_FROM_NUMBER", "SENDGRID_API_KEY", "MAIL_FROM_EMAIL", "MESSAGING_SIMULATE"):
        monkeypatch.delenv(k, raising=False)
    st = c.get("/api/admin/messaging").json()
    assert not st["sms_available"] and not st["email_available"] and not st["simulated"]
    assert c.post("/api/admin/blasts/send", json={"message": "hi", "channel": "sms"}).status_code == 400
    assert c.post("/api/admin/blasts/send", json={"message": "hi", "channel": "email"}).status_code == 400
    # in-app notifications need nothing
    assert c.post("/api/admin/blasts/send", json={"message": "hi", "channel": "none", "internal": True}).status_code == 200


def test_stop_reply_is_platform_wide_and_signed(club, monkeypatch):
    c, slug = club["c"], club["slug"]
    _live(monkeypatch)
    monkeypatch.setenv("PUBLIC_API_URL", "https://pathwai.example.com")
    m = add_member(slug, "Eve", "eve@msg.example.com", "(647) 555-0188", sms=True)
    yes_only = add_member(slug, "Fay", "fay@msg.example.com", "(647) 555-0199", sms=False)
    url = "https://pathwai.example.com/api/webhooks/twilio"

    def post(body, frm, sig=True):
        form = {"From": frm, "Body": body, "To": "+15550001111"}
        good = base64.b64encode(hmac.new(b"twtoken", (url + "".join(k + form[k] for k in sorted(form))).encode(), hashlib.sha1).digest()).decode()
        return c.post("/api/webhooks/twilio", data=form, headers={"X-Twilio-Signature": good if sig else "nope"})

    assert post("STOP", "+16475550188", sig=False).status_code == 400
    assert post("STOP", "+16475550188").status_code == 200
    assert run_in(slug, lambda: server.db.users.find_one({"id": m["id"]}))["settings"]["notifications"]["sms"] is False
    assert "+16475550188" in run_in(slug, messaging.opted_out_phones)
    # a "yes" from someone who never said STOP must not switch texting on
    assert post("yes", "+16475550199").status_code == 200
    assert run_in(slug, lambda: server.db.users.find_one({"id": yes_only["id"]}))["settings"]["notifications"]["sms"] is False
    assert post("START", "+16475550188").status_code == 200
    assert run_in(slug, lambda: server.db.users.find_one({"id": m["id"]}))["settings"]["notifications"]["sms"] is True
    assert "+16475550188" not in run_in(slug, messaging.opted_out_phones)


def test_only_the_pathwai_team_can_add_credits(club):
    c = club["c"]
    assert c.post("/api/admin/messaging/credits", json={"credits": 100}).status_code == 403  # a community admin, not platform staff
    with TestClient(server.app) as staff:
        staff.post("/api/auth/login", json={"email": "admin@yourcommunity.app", "password": "Demo123!"})
        st = staff.get("/api/admin/messaging").json()
        assert st["can_grant"]
        r = staff.post("/api/admin/messaging/credits", json={"credits": 25}).json()
        assert r["sms_credits"] == st["sms_credits"] + 25
        assert staff.post("/api/admin/messaging/credits", json={"credits": 0}).status_code == 422
