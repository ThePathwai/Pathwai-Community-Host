"""Connected tools (Stripe) against REAL-provider code paths (not the 'demo' key simulation).

Texts and email are built in now and tested in test_messaging.py; imports in test_data_import.py.

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
