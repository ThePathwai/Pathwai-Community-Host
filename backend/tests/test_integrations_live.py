"""Integrations against REAL-provider code paths (not the 'demo' key simulation).

Every outbound call is intercepted with httpx.MockTransport, so nothing leaves the process, but the
requests Pathwai builds (URLs, auth headers, bodies, pagination) and the way it reads each provider's
responses are exactly what would go over the wire with a real key. Each test pins what that provider's
documentation says the request has to look like.

Everything runs inside a brand-new self-serve community, so the shared in-memory database used by the
other test modules is left as it was found.
"""
import asyncio
import base64
import hashlib
import hmac
import json
import os
import sys
import time
import uuid
from urllib.parse import parse_qs

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
os.environ["ENABLE_AI_CHAT"] = "true"

import httpx
import pytest
from fastapi.testclient import TestClient

import server
from routes.hub import in_community
from routes import integrations as integ


# --------------------------------------------------------------------------- plumbing
@pytest.fixture
def mock_http(monkeypatch):
    """Route every httpx.AsyncClient (what integrations/blasts/emailer use) through `state['handler']`."""
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
    """A fresh community whose founder (admin) is signed in on `client`."""
    with TestClient(server.app) as client:
        r = client.post("/api/hub/signup", json={"accepted_terms": True, "email": "founder@live.example.com", "password": "LivePass12345", "name": "Live Founder"})
        assert r.status_code == 201, r.text
        r = client.post("/api/hub/communities", json={"name": "Live Test Club", "category": "other"})
        assert r.status_code == 201, r.text
        slug = r.json()["slug"]
        client.headers.update({"X-Community": slug})
        me = client.get("/api/auth/me").json()
        assert me["role"] == "admin"
        yield {"c": client, "slug": slug, "admin_id": me["id"], "admin_email": me["email"]}


def run_in(slug, make_coro):
    """Run `make_coro()` against that community's database. Takes a factory, not a coroutine: `server.db.x`
    resolves the active community when the expression is evaluated, which must happen inside the context."""
    with in_community(slug):
        return asyncio.run(make_coro())


def add_member(slug, name, email, phone=None, sms=False):
    doc = {"id": str(uuid.uuid4()), "name": name, "email": email, "role": "member", "member_type": "member", "membership_status": "approved",
           "password_hash": "!", "created_at": "2026-01-01T00:00:00+00:00", "settings": {"notifications": {"sms": sms, "email": True}},
           "contact": {"phone": phone or "", "email": email}}
    run_in(slug, lambda: server.db.users.insert_one(dict(doc)))
    return doc


def save(c, provider, creds=None, settings=None):
    r = c.put(f"/api/admin/integrations/{provider}", json={"credentials": creds or {}, "settings": settings or {}})
    assert r.status_code == 200, r.text
    return r.json()


# --------------------------------------------------------------------------- Airtable
def test_airtable_formula_escaping():
    assert integ._at_quote("o'brien@x.com") == "o\\'brien@x.com"
    assert integ._at_quote("a\\b") == "a\\\\b"
    assert integ._at_quote("plain@x.com") == "plain@x.com"


def test_airtable_real_import_and_push(club, mock_http):
    c, slug = club["c"], club["slug"]
    save(c, "airtable", {"api_key": "patREALKEY"}, {"base_id": "appABC123", "table": "Members", "push_enabled": True})
    pages = {
        None: {"records": [{"id": "rec1", "fields": {"Name": "Ada Lovelace", "Email": "Ada@Engine.example.com", "Company": "Analytical"}},
                           {"id": "rec2", "fields": {"Name": "No Email"}}], "offset": "itr_2"},
        "itr_2": {"records": [{"id": "rec3", "fields": {"Name": "Grace Hopper", "Email": "grace@navy.example.com", "Title": "Admiral"}}]},
    }

    def handler(req):
        assert req.url.host == "api.airtable.com" and req.url.path == "/v0/appABC123/Members"
        assert req.headers["authorization"] == "Bearer patREALKEY"
        return httpx.Response(200, json=pages[req.url.params.get("offset")])

    mock_http["handler"] = handler
    assert c.post("/api/admin/integrations/airtable/test").json()["ok"]
    res = c.post("/api/admin/integrations/airtable/sync").json()["result"]
    assert res == {"created": 2, "updated": 0, "skipped": 1}
    users = {u["email"]: u for u in c.get("/api/admin/users").json()}
    assert users["ada@engine.example.com"]["company"] == "Analytical" and users["grace@navy.example.com"]["title"] == "Admiral"
    # a second sync updates instead of duplicating
    assert c.post("/api/admin/integrations/airtable/sync").json()["result"]["updated"] == 2

    # write-back: an email with an apostrophe must be escaped in the filter formula, and an unknown
    # email creates a record while a known one patches it
    o = add_member(slug, "Pat O'Brien", "o'brien@x.com")
    seen = []

    def push_handler(req):
        seen.append((req.method, str(req.url), req.content))
        if req.method == "GET":
            return httpx.Response(200, json={"records": []})
        return httpx.Response(200, json={"id": "recNew", "fields": {}})

    mock_http["handler"] = push_handler
    run_in(slug, lambda: integ.push_member(o["id"], {"Request": "waiver", "Answers": {"a": 1}}))
    get = next(s for s in seen if s[0] == "GET")
    formula = httpx.URL(get[1]).params["filterByFormula"]
    assert formula == "LOWER({Email})='o\\'brien@x.com'"
    post = next(s for s in seen if s[0] == "POST")
    body = json.loads(post[2])
    assert body["fields"]["Email"] == "o'brien@x.com" and body["fields"]["Name"] == "Pat O'Brien" and body["typecast"] is True
    assert json.loads(post[2])["fields"]["Answers"] == '{"a": 1}'  # non-scalars are JSON-encoded

    seen.clear()
    mock_http["handler"] = lambda req: (seen.append(req.method) or httpx.Response(200, json={"records": [{"id": "recExisting"}]} if req.method == "GET" else {}))
    run_in(slug, lambda: integ.push_member(o["id"]))
    assert seen == ["GET", "PATCH"]


def test_airtable_bad_key_is_a_friendly_error(club, mock_http):
    c = club["c"]
    mock_http["handler"] = lambda req: httpx.Response(401, json={"error": {"type": "AUTHENTICATION_REQUIRED"}})
    r = c.post("/api/admin/integrations/airtable/test")
    assert r.status_code == 400 and "rejected the credentials" in r.json()["detail"]


# --------------------------------------------------------------------------- Luma
def _evt(i, **kw):
    return {"id": f"evt-{i}", "name": f"Event {i}", "description": "d", "start_at": "2099-02-0%dT18:00:00.000Z" % i, "end_at": "2099-02-0%dT20:00:00.000Z" % i,
            "url": f"https://luma.com/e{i}", "cover_url": None, "geo_address_json": {"full_address": "MaRS, Toronto"}, **kw}


def test_luma_current_api_sync(club, mock_http):
    c, slug = club["c"], club["slug"]
    attendee = add_member(slug, "Luma Guest", "guest@luma.example.com")
    save(c, "luma", {"api_key": "luma-real-key"})
    seen = []

    def handler(req):
        seen.append(req)
        assert req.url.host == "public-api.luma.com" and req.headers["x-luma-api-key"] == "luma-real-key"
        p = req.url.params
        if req.url.path == "/v1/calendars/events/list":
            if p.get("pagination_cursor") == "c2":
                return httpx.Response(200, json={"entries": [_evt(2)], "has_more": False})
            return httpx.Response(200, json={"entries": [_evt(1)], "has_more": True, "next_cursor": "c2"})
        if req.url.path == "/v1/events/guests/list":
            assert p["event_id"] in ("evt-1", "evt-2")
            if p["event_id"] == "evt-2":
                return httpx.Response(200, json={"entries": [], "has_more": False})
            return httpx.Response(200, json={"entries": [{"email": "GUEST@luma.example.com", "approval_status": "approved"},
                                                         {"email": "declined@luma.example.com", "approval_status": "declined"}], "has_more": False})
        return httpx.Response(404, json={})

    mock_http["handler"] = handler
    assert c.post("/api/admin/integrations/luma/test").json()["ok"]
    res = c.post("/api/admin/integrations/luma/sync").json()["result"]
    assert res == {"events_created": 2, "events_updated": 0, "guests_matched": 1}
    events = run_in(slug, lambda: _list(server.db.events, {"source": "luma"}))
    assert {e["external_id"] for e in events} == {"evt-1", "evt-2"}
    e1 = next(e for e in events if e["external_id"] == "evt-1")
    assert e1["rsvps"] == {attendee["id"]: "yes"} and e1["location"] == "MaRS, Toronto" and e1["url"] == "https://luma.com/e1"
    # idempotent
    assert c.post("/api/admin/integrations/luma/sync").json()["result"]["events_updated"] == 2
    assert not any(r.url.path.startswith("/public/v1") for r in seen)


def test_luma_falls_back_to_legacy_api(club, mock_http):
    c, slug = club["c"], club["slug"]
    run_in(slug, lambda: server.db.events.delete_many({"source": "luma"}))

    def handler(req):
        if req.url.host == "public-api.luma.com":
            return httpx.Response(404, json={"message": "not found"})
        assert req.url.host == "api.lu.ma"
        if req.url.path == "/public/v1/calendar/list-events":
            return httpx.Response(200, json={"entries": [{"api_id": "evt-L1", "event": {"api_id": "evt-L1", "name": "Legacy", "start_at": "2099-03-01T18:00:00Z", "url": "https://lu.ma/l1"}}]})
        if req.url.path == "/public/v1/event/get-guests":
            assert req.url.params["event_api_id"] == "evt-L1"
            return httpx.Response(200, json={"entries": [{"guest": {"email": "guest@luma.example.com", "approval_status": "approved"}}]})
        return httpx.Response(404)

    mock_http["handler"] = handler
    res = c.post("/api/admin/integrations/luma/sync").json()["result"]
    assert res["events_created"] == 1 and res["guests_matched"] == 1


def test_luma_bad_key(club, mock_http):
    mock_http["handler"] = lambda req: httpx.Response(401, json={"message": "unauthorized"})
    r = club["c"].post("/api/admin/integrations/luma/sync")
    assert r.status_code == 400 and "rejected the credentials" in r.json()["detail"]


async def _list(col, q):
    return [d async for d in col.find(q)]


# --------------------------------------------------------------------------- Stripe
def _form(req):
    return {k: v[0] for k, v in parse_qs(req.content.decode(), keep_blank_values=True).items()}


def _stripe_sig(payload: bytes, secret="whsec_live", ts=None):
    ts = str(ts or int(time.time()))
    return f"t={ts},v1=" + hmac.new(secret.encode(), ts.encode() + b"." + payload, hashlib.sha256).hexdigest()


def _hook(c, slug, event, **kw):
    payload = json.dumps(event).encode()
    return c.post(f"/api/webhooks/stripe?community={slug}", content=payload, headers={"stripe-signature": _stripe_sig(payload, **kw)})


def test_stripe_checkout_forms_and_webhooks(club, mock_http):
    c, slug, uid = club["c"], club["slug"], club["admin_id"]
    save(c, "stripe", {"api_key": "sk_test_REAL", "webhook_secret": "whsec_live"},
         {"currency": "cad", "plans": [{"label": "Pro Monthly", "amount_cents": 3000, "interval": "month"}, {"label": "Lifetime", "amount_cents": 90000, "interval": "once"}]})
    seen = []

    def handler(req):
        seen.append(req)
        assert req.headers["authorization"] == "Bearer sk_test_REAL"
        if req.url.path == "/v1/account":
            return httpx.Response(200, json={"id": "acct_123"})
        assert req.url.path == "/v1/checkout/sessions" and req.method == "POST"
        return httpx.Response(200, json={"id": "cs_1", "url": "https://checkout.stripe.com/c/pay/cs_1"})

    mock_http["handler"] = handler
    assert "acct_123" in c.post("/api/admin/integrations/stripe/test").json()["message"]

    # subscription plan: return URLs come from the allowed Origin; subscription metadata is set so renewals can be matched
    out = c.post("/api/me/billing/checkout", json={"plan_key": "pro-monthly"}, headers={"Origin": "https://app.example.com"}).json()
    assert out["url"].startswith("https://checkout.stripe.com/")
    f = _form(seen[-1])
    assert f["mode"] == "subscription" and f["success_url"] == "https://app.example.com/settings?paid=1" and f["cancel_url"] == "https://app.example.com/settings"
    assert f["metadata[user_id]"] == uid and f["subscription_data[metadata][user_id]"] == uid and f["customer_email"] == club["admin_email"]
    assert f["line_items[0][price_data][unit_amount]"] == "3000" and f["line_items[0][price_data][recurring][interval]"] == "month"

    # one-off plan
    c.post("/api/me/billing/checkout", json={"plan_key": "lifetime"})
    f = _form(seen[-1])
    assert f["mode"] == "payment" and "subscription_data[metadata][user_id]" not in f

    # ticket: no blank form fields (Stripe rejects empty metadata/customer values)
    ev = c.post("/api/events", json={"title": "Gala", "starts_at": "2099-01-01T10:00:00+00:00", "price_cents": 4000}).json()
    c.post(f"/api/events/{ev['id']}/checkout", json={}, headers={"Origin": "https://app.example.com"})
    f = _form(seen[-1])
    assert f["metadata[event_id]"] == ev["id"] and f["success_url"] == f"https://app.example.com/events/{ev['id']}?paid=1"
    assert all(v != "" for v in f.values())

    # --- webhooks: signed with the saved secret, routed by ?community=
    def status():
        return c.get("/api/me/billing").json()["status"]

    invoice_paid = {"id": "evt_inv_1", "type": "invoice.paid", "data": {"object": {"customer_email": "x@y.example.com", "subscription_details": {"metadata": {"user_id": uid}}}}}
    assert _hook(c, slug, invoice_paid).status_code == 200 and status() == "active"
    failed = {"id": "evt_inv_2", "type": "invoice.payment_failed", "data": {"object": {"subscription_details": {"metadata": {"user_id": uid}}}}}
    assert _hook(c, slug, failed).status_code == 200 and status() == "past_due"
    # an event id that was already handled is not applied again (Stripe redelivers): replaying the old
    # invoice.paid must NOT flip the member back to "active"
    assert _hook(c, slug, invoice_paid).status_code == 200 and status() == "past_due"
    sub_deleted = {"id": "evt_sub_3", "type": "customer.subscription.deleted", "data": {"object": {"metadata": {"user_id": uid}}}}
    assert _hook(c, slug, sub_deleted).status_code == 200 and status() == "canceled"

    # checkout.session.completed marks membership active and records the payment; unpaid (async) sessions are ignored
    unpaid = {"id": "evt_cs_unpaid", "type": "checkout.session.completed", "data": {"object": {"client_reference_id": uid, "payment_status": "unpaid", "metadata": {"user_id": uid, "plan_key": "pro-monthly"}}}}
    assert _hook(c, slug, unpaid).status_code == 200 and status() == "canceled"
    done = {"id": "evt_cs_done", "type": "checkout.session.completed", "data": {"object": {"client_reference_id": uid, "payment_status": "paid", "amount_total": 3000, "currency": "cad", "metadata": {"user_id": uid, "plan_key": "pro-monthly"}}}}
    assert _hook(c, slug, done).status_code == 200 and status() == "active"
    assert c.get("/api/me/billing").json()["payments"][0]["amount"] == 3000
    # paid ticket: RSVPs the buyer
    ticket = {"id": "evt_cs_ticket", "type": "checkout.session.completed", "data": {"object": {"client_reference_id": uid, "payment_status": "paid", "amount_total": 4000, "currency": "cad",
                                                                                              "metadata": {"user_id": uid, "event_id": ev["id"], "tier_id": "", "tier_name": "Gala"}}}}
    assert _hook(c, slug, ticket).status_code == 200
    assert c.get(f"/api/events/{ev['id']}").json()["my_rsvp"] == "yes"

    # bad / stale signatures and a missing ?community= are all rejected
    payload = json.dumps(done).encode()
    assert c.post(f"/api/webhooks/stripe?community={slug}", content=payload, headers={"stripe-signature": "t=1,v1=bad"}).status_code == 400
    assert c.post(f"/api/webhooks/stripe?community={slug}", content=payload, headers={"stripe-signature": _stripe_sig(payload, ts=int(time.time()) - 4000)}).status_code == 400
    plain = TestClient(server.app)  # no X-Community header, no cookie, no ?community= -> not this community's webhook
    assert plain.post("/api/webhooks/stripe", content=payload, headers={"stripe-signature": _stripe_sig(payload)}).status_code == 400


def test_stripe_failed_handling_is_retryable(club, mock_http):
    """An event whose handling crashed must not be recorded as processed (Stripe will retry it)."""
    c, slug, uid = club["c"], club["slug"], club["admin_id"]
    ev = {"id": "evt_retry", "type": "checkout.session.completed", "data": {"object": {"client_reference_id": uid, "payment_status": "paid", "amount_total": 1, "currency": "cad",
                                                                                      "metadata": {"user_id": uid, "event_id": "does-not-matter"}}}}
    orig = integ.notify

    async def boom(*a, **k):
        raise RuntimeError("db hiccup")

    integ.notify = boom
    try:
        with pytest.raises(RuntimeError):
            _hook(c, slug, ev)
    finally:
        integ.notify = orig
    assert run_in(slug, lambda: server.db.stripe_events.find_one({"id": "evt_retry"})) is None
    assert _hook(c, slug, ev).status_code == 200
    assert run_in(slug, lambda: server.db.stripe_events.find_one({"id": "evt_retry"})) is not None


# --------------------------------------------------------------------------- Twilio + SendGrid
def test_twilio_sendgrid_blast_and_stop_webhook(club, mock_http, monkeypatch):
    c, slug = club["c"], club["slug"]
    m1 = add_member(slug, "Ann", "ann@blast.example.com", "(416) 555-0101", sms=True)
    m2 = add_member(slug, "", "noname@blast.example.com", "416-555-0102", sms=True)
    m3 = add_member(slug, "Cy", "cy@blast.example.com", "+1 416 555 0103", sms=True)
    save(c, "twilio", {"account_sid": "ACtest123", "auth_token": "twtoken"}, {"from_number": "+14165550100"})
    save(c, "sendgrid", {"api_key": "SG.realkey"}, {"from_email": "hello@club.test"})  # no from_name on purpose
    sms_calls, mail_calls = [], []

    def handler(req):
        if req.url.host == "api.twilio.com":
            auth = base64.b64decode(req.headers["authorization"].split()[1]).decode()
            assert auth == "ACtest123:twtoken"
            if req.method == "GET":
                assert req.url.path == "/2010-04-01/Accounts/ACtest123.json"
                return httpx.Response(200, json={"friendly_name": "Live Club"})
            assert req.url.path == "/2010-04-01/Accounts/ACtest123/Messages.json"
            f = _form(req)
            sms_calls.append(f)
            if f["To"] == "+14165550103":
                return httpx.Response(400, json={"message": "The 'To' number is not a valid phone number"})
            return httpx.Response(201, json={"sid": "SM1"})
        if req.url.host == "api.sendgrid.com":
            if req.method == "GET":
                return httpx.Response(200, json={"type": "free"})
            assert req.headers["authorization"] == "Bearer SG.realkey"
            mail_calls.append(json.loads(req.content))
            return httpx.Response(202)
        return httpx.Response(404)

    mock_http["handler"] = handler
    assert "Live Club" in c.post("/api/admin/integrations/twilio/test").json()["message"]
    assert c.post("/api/admin/integrations/sendgrid/test").json()["ok"]

    r = c.post("/api/admin/blasts/send", json={"message": "Court closed tonight", "subject": "Heads up", "channel": "both", "audience": {"type": "all"}}).json()
    assert not r["demo"]
    assert r["sms_sent"] == 2 and r["sms_failed"] == 1 and any("not a valid phone number" in e for e in r["errors"])
    assert {f["To"] for f in sms_calls} == {"+14165550101", "+14165550102", "+14165550103"}
    assert all(f["From"] == "+14165550100" and f["Body"].endswith("Reply STOP to opt out.") for f in sms_calls)
    # email: one send per member; SendGrid rejects null/empty names, so they are omitted rather than sent as null
    assert r["email_sent"] == len(mail_calls) >= 4 and r["email_failed"] == 0
    for payload in mail_calls:
        to = payload["personalizations"][0]["to"][0]
        assert to.get("name", "x") != "" and to.get("name", "x") is not None
        assert payload["from"] == {"email": "hello@club.test"}
        assert payload["subject"] == "Heads up" and "Court closed tonight" in payload["content"][0]["value"] and "turn off email" in payload["content"][0]["value"]

    # STOP reply: Twilio signs the exact public URL it called -- here the one behind a proxy (PUBLIC_API_URL)
    monkeypatch.setenv("PUBLIC_API_URL", "https://pathwai.example.com")
    form = {"From": "+14165550101", "Body": "STOP", "To": "+14165550100"}
    url = f"https://pathwai.example.com/api/webhooks/twilio?community={slug}"
    sig = base64.b64encode(hmac.new(b"twtoken", (url + "".join(k + form[k] for k in sorted(form))).encode(), hashlib.sha1).digest()).decode()
    assert c.post(f"/api/webhooks/twilio?community={slug}", data=form, headers={"X-Twilio-Signature": "nope"}).status_code == 400
    assert c.post(f"/api/webhooks/twilio?community={slug}", data=form, headers={"X-Twilio-Signature": sig}).status_code == 200
    u = run_in(slug, lambda: server.db.users.find_one({"id": m1["id"]}))
    assert u["settings"]["notifications"]["sms"] is False
    form["Body"] = "START"
    sig = base64.b64encode(hmac.new(b"twtoken", (url + "".join(k + form[k] for k in sorted(form))).encode(), hashlib.sha1).digest()).decode()
    assert c.post(f"/api/webhooks/twilio?community={slug}", data=form, headers={"X-Twilio-Signature": sig}).status_code == 200
    assert run_in(slug, lambda: server.db.users.find_one({"id": m1["id"]}))["settings"]["notifications"]["sms"] is True


def test_integration_list_shows_absolute_webhook_url(club, monkeypatch):
    c, slug = club["c"], club["slug"]
    monkeypatch.setenv("PUBLIC_API_URL", "https://pathwai.example.com")
    rows = {r["provider"]: r for r in c.get("/api/admin/integrations").json()["integrations"]}
    assert rows["stripe"]["webhook_url"] == f"https://pathwai.example.com/api/webhooks/stripe?community={slug}"
    assert rows["twilio"]["webhook_url"] == f"https://pathwai.example.com/api/webhooks/twilio?community={slug}"
    assert rows["airtable"]["webhook_url"] is None


def test_blast_over_provider_outage_reports_failures_not_500(club, mock_http):
    c = club["c"]
    mock_http["handler"] = lambda req: httpx.Response(503, text="Service Unavailable")
    r = c.post("/api/admin/blasts/send", json={"message": "x", "channel": "sms", "audience": {"type": "all"}})
    assert r.status_code == 200 and r.json()["sms_sent"] == 0 and r.json()["sms_failed"] >= 3


# --------------------------------------------------------------------------- platform email (password resets)
def test_platform_email_via_sendgrid(mock_http, monkeypatch):
    import emailer
    monkeypatch.setenv("SENDGRID_API_KEY", "SG.platform")
    monkeypatch.setenv("MAIL_FROM_EMAIL", "no-reply@pathwai.test")
    got = []

    def ok(req):
        got.append((req.headers["authorization"], json.loads(req.content)))
        return httpx.Response(202)

    mock_http["handler"] = ok
    asyncio.run(emailer.send_email("to@x.test", "Reset", "link"))
    auth, payload = got[0]
    assert auth == "Bearer SG.platform" and payload["from"]["email"] == "no-reply@pathwai.test" and payload["personalizations"][0]["to"] == [{"email": "to@x.test"}]
    mock_http["handler"] = lambda req: httpx.Response(403, json={"errors": [{"message": "The from address does not match a verified Sender Identity."}]})
    with pytest.raises(RuntimeError, match="Sender Identity"):
        asyncio.run(emailer.send_email("to@x.test", "Reset", "link"))
