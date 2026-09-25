"""External software integrations: Airtable (members), Luma (events + guests), Stripe (memberships, tickets),
plus link-based form tools. Credentials are encrypted at rest and never returned to the browser.

Demo mode: use an API key that starts with "demo" and every provider answers from built-in sample data, so the
whole flow (test -> sync -> results in the portal) can be tried without touching a real account."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from urllib.parse import quote

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from auth import JWT_SECRET, get_current_user, require_role
from database import current_community, db
from ._common import audit, clean, now_iso
from .notifications import notify

router = APIRouter(tags=["integrations"])

_FERNET = Fernet(base64.urlsafe_b64encode(hashlib.sha256((os.environ.get("INTEGRATIONS_SECRET") or JWT_SECRET).encode()).digest()))
SAFE_SEGMENT = re.compile(r"^[A-Za-z0-9_ %.\-]{1,80}$")


class IntegrationError(Exception):
    pass


def enc(v: str) -> str:
    return _FERNET.encrypt(v.encode()).decode()


def dec(v: str) -> str:
    try:
        return _FERNET.decrypt(v.encode()).decode()
    except InvalidToken:
        return ""


def mask(v: str) -> str:
    return ("•" * 8 + v[-4:]) if v and len(v) > 8 else ("•" * 8 if v else "")


# --------------------------------------------------------------------------- registry
PROVIDERS: Dict[str, Dict[str, Any]] = {
    "airtable": {
        "label": "Airtable", "kind": "api",
        "description": "Import your member list from an Airtable base and push profile updates and request responses back.",
        "capabilities": ["Import members", "Write profile changes back", "Track request responses"],
        "credentials": [{"key": "api_key", "label": "Personal access token", "placeholder": "pat…  (or 'demo' to try it)"}],
        "settings": [
            {"key": "base_id", "label": "Base ID", "placeholder": "appXXXXXXXXXXXXXX"},
            {"key": "table", "label": "Table name", "placeholder": "Members"},
            {"key": "push_enabled", "label": "Write changes back to Airtable", "type": "bool"},
        ],
        "defaults": {"table": "Members", "push_enabled": False, "field_map": {"name": "Name", "email": "Email", "company": "Company", "title": "Title", "stage": "Stage", "industry": "Industry", "bio": "Bio"}},
        "docs": "https://airtable.com/create/tokens",
    },
    "luma": {
        "label": "Luma", "kind": "api",
        "description": "Sync your Luma calendar into Events and mark approved guests as going.",
        "capabilities": ["Import events", "Sync approved guests as RSVPs", "Register-on-Luma links"],
        "credentials": [{"key": "api_key", "label": "Luma API key", "placeholder": "Luma Plus API key  (or 'demo')"}],
        "settings": [{"key": "default_category", "label": "Event type for imported events", "placeholder": "Meetup"}],
        "defaults": {"default_category": "Meetup"},
        "docs": "https://docs.lu.ma/reference/getting-started-with-your-api",
    },
    "stripe": {
        "label": "Stripe", "kind": "api",
        "description": "Charge membership dues and sell event tickets with Stripe Checkout; payments update member status automatically.",
        "capabilities": ["Membership plans (Checkout)", "Paid event tickets", "Webhook-driven billing status", "Customer sync"],
        "credentials": [{"key": "api_key", "label": "Secret or restricted key", "placeholder": "sk_live_… / rk_… (or 'demo')"},
                        {"key": "webhook_secret", "label": "Webhook signing secret", "placeholder": "whsec_…"}],
        "settings": [{"key": "currency", "label": "Currency", "placeholder": "cad"},
                     {"key": "plans", "label": "Membership plans", "type": "plans"}],
        "defaults": {"currency": "cad", "plans": []},
        "docs": "https://docs.stripe.com/keys",
    },
    "twilio": {
        "label": "Twilio", "kind": "api",
        "description": "Send text-message blasts to members who opted in: announcements, event reminders and last-minute changes.",
        "capabilities": ["SMS blasts", "Audience by event or role", "Delivery report", "STOP opt-out sync"],
        "credentials": [{"key": "account_sid", "label": "Account SID", "placeholder": "AC…  (or 'demo' to try it)"},
                        {"key": "auth_token", "label": "Auth token", "placeholder": "Twilio auth token"}],
        "settings": [{"key": "from_number", "label": "Sending number", "placeholder": "+14165550100"},
                     {"key": "messaging_service_sid", "label": "Messaging Service SID (optional)", "placeholder": "MG…"}],
        "defaults": {"from_number": "", "messaging_service_sid": ""},
        "docs": "https://console.twilio.com/",
    },
    "sendgrid": {
        "label": "SendGrid", "kind": "api",
        "description": "Send email blasts to members: announcements, event reminders and updates.",
        "capabilities": ["Email blasts", "Audience by event or role", "Delivery report"],
        "credentials": [{"key": "api_key", "label": "API key", "placeholder": "SG.…  (or 'demo' to try it)"}],
        "settings": [{"key": "from_email", "label": "From email", "placeholder": "hello@yourcommunity.com"},
                     {"key": "from_name", "label": "From name", "placeholder": "Your community"}],
        "defaults": {"from_email": "", "from_name": ""},
        "docs": "https://app.sendgrid.com/settings/api_keys",
    },
    "typeform": {"label": "Typeform", "kind": "link", "description": "Send members to Typeform surveys from Requests; completion is tracked by confirm-or-webhook.", "capabilities": ["External form requests"], "credentials": [], "settings": [], "defaults": {}},
    "google_forms": {"label": "Google Forms", "kind": "link", "description": "Send members to Google Forms from Requests.", "capabilities": ["External form requests"], "credentials": [], "settings": [], "defaults": {}},
    "jotform": {"label": "Jotform", "kind": "link", "description": "Send members to Jotform from Requests.", "capabilities": ["External form requests"], "credentials": [], "settings": [], "defaults": {}},
}


async def _doc(provider: str) -> Dict[str, Any]:
    return await db.integrations.find_one({"provider": provider}) or {}


async def _creds(provider: str) -> Dict[str, str]:
    d = await _doc(provider)
    return {k: dec(v) for k, v in (d.get("credentials") or {}).items()}


def _is_demo(c: Dict[str, str]) -> bool:
    return (c.get("api_key") or c.get("account_sid") or "").lower().startswith("demo")


async def _log(provider: str, level: str, msg: str, **fields) -> None:
    entry = {"at": now_iso(), "level": level, "msg": msg}
    upd: Dict[str, Any] = {"$push": {"log": {"$each": [entry], "$slice": -40}}}
    if fields:
        upd["$set"] = fields
    await db.integrations.update_one({"provider": provider}, upd)


# --------------------------------------------------------------------------- http helper
async def _http(method: str, url: str, *, headers=None, params=None, data=None, json_body=None, what="the service") -> Any:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.request(method, url, headers=headers, params=params, data=data, json=json_body)
    except httpx.HTTPError:
        raise IntegrationError(f"Couldn't reach {what} from this server. Check the server's network access and try again.")
    if r.status_code in (401, 403):
        raise IntegrationError(f"{what} rejected the credentials (HTTP {r.status_code}). Check the key and its permissions.")
    if r.status_code == 404:
        raise IntegrationError(f"{what} couldn't find that resource. Check the base/table/event name.")
    if r.status_code >= 400:
        try:
            msg = r.json().get("error", {}).get("message") or r.text[:160]
        except Exception:  # noqa: BLE001
            msg = r.text[:160]
        raise IntegrationError(f"{what} returned an error: {msg}")
    return r.json()


# --------------------------------------------------------------------------- demo data
DEMO_AIRTABLE = [
    {"id": "recDemo1", "fields": {"Name": "Amara Johnson", "Email": "amara@voltgrid.example", "Company": "VoltGrid", "Title": "Founder", "Stage": "Seed", "Industry": "CleanTech", "Bio": "Grid-scale battery software."}},
    {"id": "recDemo2", "fields": {"Name": "Kwame Mensah", "Email": "kwame@fieldnote.example", "Company": "FieldNote", "Title": "CEO", "Stage": "Pre-seed", "Industry": "AgTech", "Bio": "Voice notes for farm crews."}},
    {"id": "recDemo3", "fields": {"Name": "Lena Park", "Email": "lena@caremesh.example", "Company": "CareMesh", "Title": "COO", "Stage": "Series A", "Industry": "HealthTech", "Bio": "Care coordination for clinics."}},
]


def _demo_luma() -> List[Dict[str, Any]]:
    t = datetime.now(timezone.utc)
    return [
        {"api_id": "evt-demo-1", "event": {"api_id": "evt-demo-1", "name": "Demo Day Prep Clinic", "description": "Pitch feedback in small groups.", "start_at": (t + timedelta(days=6)).isoformat(), "end_at": (t + timedelta(days=6, hours=2)).isoformat(), "url": "https://lu.ma/demo-day-prep", "geo_address_json": {"full_address": "MaRS, Toronto"}, "cover_url": None}, "guests": ["demo@yourcommunity.app"]},
        {"api_id": "evt-demo-2", "event": {"api_id": "evt-demo-2", "name": "Founders Coffee — Virtual", "description": "Casual weekly check-in.", "start_at": (t + timedelta(days=9)).isoformat(), "end_at": (t + timedelta(days=9, hours=1)).isoformat(), "url": "https://lu.ma/founders-coffee", "meeting_url": "https://zoom.example/j/123", "cover_url": None}, "guests": []},
    ]


# --------------------------------------------------------------------------- Airtable
def _airtable_headers(c):
    return {"Authorization": f"Bearer {c['api_key']}"}


def _at_url(s):
    for k in ("base_id", "table"):
        if not SAFE_SEGMENT.match(str(s.get(k) or "")):
            raise IntegrationError("Enter a valid Airtable base ID and table name first.")
    return f"https://api.airtable.com/v0/{s['base_id']}/{quote(s['table'], safe='')}"


async def airtable_fetch(c, s) -> List[Dict[str, Any]]:
    if _is_demo(c):
        return DEMO_AIRTABLE
    out, offset = [], None
    for _ in range(20):
        params = {"pageSize": 100, **({"offset": offset} if offset else {})}
        j = await _http("GET", _at_url(s), headers=_airtable_headers(c), params=params, what="Airtable")
        out += j.get("records", [])
        offset = j.get("offset")
        if not offset:
            break
    return out


async def airtable_test(c, s) -> str:
    if _is_demo(c):
        return "Demo mode: connected to sample data (3 members)."
    j = await _http("GET", _at_url(s), headers=_airtable_headers(c), params={"maxRecords": 1}, what="Airtable")
    return f"Connected. Table '{s['table']}' is readable ({len(j.get('records', []))} sample record)."


async def airtable_sync(c, s) -> Dict[str, Any]:
    fm = {**PROVIDERS["airtable"]["defaults"]["field_map"], **(s.get("field_map") or {})}
    created = updated = skipped = 0
    for rec in await airtable_fetch(c, s):
        f = rec.get("fields", {})
        email = str(f.get(fm["email"]) or "").strip().lower()
        if not email or "@" not in email:
            skipped += 1
            continue
        vals = {k: f.get(fm[k]) for k in ("name", "company", "title", "stage", "industry", "bio") if f.get(fm.get(k, "")) not in (None, "")}
        existing = await db.users.find_one({"email": email})
        if existing:
            # never overwrite what the member entered themselves
            fill = {k: v for k, v in vals.items() if not existing.get(k)}
            await db.users.update_one({"id": existing["id"]}, {"$set": {**fill, "airtable_record_id": rec["id"]}})
            updated += 1
        else:
            await db.users.insert_one({"id": str(uuid.uuid4()), "email": email, "name": vals.pop("name", email.split("@")[0]), "role": "founder", "member_type": "founder",
                                       "password_hash": "!imported", "imported_from": "airtable", "airtable_record_id": rec["id"], "is_imported": True,
                                       "created_at": now_iso(), "updated_at": now_iso(), **vals})
            created += 1
    return {"created": created, "updated": updated, "skipped": skipped}


async def push_member(user_id: str, extra: Optional[Dict[str, Any]] = None) -> None:
    """Best-effort write-back of a member's profile/request response to Airtable (only when enabled)."""
    d = await _doc("airtable")
    s = {**PROVIDERS["airtable"]["defaults"], **(d.get("settings") or {})}
    if not (d.get("enabled") and s.get("push_enabled")):
        return
    try:
        c = await _creds("airtable")
        u = await db.users.find_one({"id": user_id})
        if not u or not u.get("email"):
            return
        fm = {**PROVIDERS["airtable"]["defaults"]["field_map"], **(s.get("field_map") or {})}
        fields = {fm[k]: u.get(k) for k in ("name", "company", "title", "stage", "industry", "bio") if u.get(k)}
        for k, v in (extra or {}).items():
            fields[str(k)[:60]] = v if isinstance(v, (str, int, float)) else json.dumps(v)
        if _is_demo(c):
            await _log("airtable", "info", f"[demo] would update Airtable record for {u['email']}: {', '.join(fields)}")
            return
        url = _at_url(s)
        found = await _http("GET", url, headers=_airtable_headers(c), params={"filterByFormula": f"LOWER({{{fm['email']}}})='{u['email'].lower()}'", "maxRecords": 1}, what="Airtable")
        if found.get("records"):
            await _http("PATCH", f"{url}/{found['records'][0]['id']}", headers=_airtable_headers(c), json_body={"fields": fields, "typecast": True}, what="Airtable")
        else:
            await _http("POST", url, headers=_airtable_headers(c), json_body={"fields": {**fields, fm["email"]: u["email"]}, "typecast": True}, what="Airtable")
        await _log("airtable", "info", f"Pushed update for {u['email']}")
    except IntegrationError as exc:
        await _log("airtable", "error", f"Push failed: {exc}")


# --------------------------------------------------------------------------- Luma
LUMA = "https://api.lu.ma/public/v1"


async def luma_fetch(c) -> List[Dict[str, Any]]:
    if _is_demo(c):
        return _demo_luma()
    h = {"x-luma-api-key": c["api_key"]}
    j = await _http("GET", f"{LUMA}/calendar/list-events", headers=h, params={"after": datetime.now(timezone.utc).isoformat(), "pagination_limit": 50}, what="Luma")
    out = []
    for entry in j.get("entries", []):
        ev = entry.get("event", entry)
        guests: List[str] = []
        try:
            g = await _http("GET", f"{LUMA}/event/get-guests", headers=h, params={"event_api_id": ev["api_id"], "pagination_limit": 200}, what="Luma")
            guests = [x.get("guest", x).get("email", "").lower() for x in g.get("entries", []) if x.get("guest", x).get("approval_status", "approved") == "approved"]
        except IntegrationError:
            pass
        out.append({"api_id": ev["api_id"], "event": ev, "guests": guests})
    return out


async def luma_test(c, s) -> str:
    if _is_demo(c):
        return "Demo mode: connected to a sample calendar (2 upcoming events)."
    j = await _http("GET", f"{LUMA}/calendar/list-events", headers={"x-luma-api-key": c["api_key"]}, params={"pagination_limit": 1}, what="Luma")
    return f"Connected. Calendar is readable ({len(j.get('entries', []))} sample event)."


async def luma_sync(c, s) -> Dict[str, Any]:
    created = updated = rsvps = 0
    for item in await luma_fetch(c):
        ev = item["event"]
        loc = (ev.get("geo_address_json") or {}).get("full_address") or ("Virtual" if ev.get("meeting_url") or ev.get("zoom_meeting_url") else "")
        fields = {"title": ev.get("name"), "description": ev.get("description") or ev.get("description_md") or "", "starts_at": ev.get("start_at"),
                  "ends_at": ev.get("end_at"), "location": loc, "virtual_url": ev.get("meeting_url") or ev.get("zoom_meeting_url"),
                  "url": ev.get("url"), "cover_url": ev.get("cover_url"), "category": s.get("default_category") or "Meetup", "source": "luma",
                  "external_id": item["api_id"], "status": "approved", "host": "Community team"}
        existing = await db.events.find_one({"external_id": item["api_id"]})
        if existing:
            await db.events.update_one({"id": existing["id"]}, {"$set": fields})
            eid = existing["id"]; updated += 1
        else:
            eid = str(uuid.uuid4())
            await db.events.insert_one({"id": eid, **fields, "attendee_ids": [], "rsvps": {}, "tags": [], "created_at": now_iso()})
            created += 1
        for email in item["guests"]:
            u = await db.users.find_one({"email": email})
            if u:
                await db.events.update_one({"id": eid}, {"$set": {f"rsvps.{u['id']}": "yes"}, "$addToSet": {"attendee_ids": u["id"]}})
                rsvps += 1
    return {"events_created": created, "events_updated": updated, "guests_matched": rsvps}


# --------------------------------------------------------------------------- Stripe
STRIPE = "https://api.stripe.com/v1"


def _sh(c):
    return {"Authorization": f"Bearer {c['api_key']}"}


async def stripe_test(c, s) -> str:
    if _is_demo(c):
        return "Demo mode: connected to a sample Stripe account."
    j = await _http("GET", f"{STRIPE}/account", headers=_sh(c), what="Stripe")
    return f"Connected to Stripe account {j.get('id', '')}" + ("" if c.get("webhook_secret") else " — add the webhook signing secret so payments update members automatically.")


async def stripe_sync(c, s) -> Dict[str, Any]:
    if _is_demo(c):
        subs = [{"status": "active", "customer_email": "demo@yourcommunity.app", "plan": "Member"}]
    else:
        subs = []
        j = await _http("GET", f"{STRIPE}/subscriptions", headers=_sh(c), params={"limit": 100, "status": "all", "expand[]": "data.customer"}, what="Stripe")
        for x in j.get("data", []):
            cust = x.get("customer") if isinstance(x.get("customer"), dict) else {}
            price = ((x.get("items") or {}).get("data") or [{}])[0].get("price", {})
            subs.append({"status": x.get("status"), "customer_email": (cust.get("email") or "").lower(), "plan": price.get("nickname") or price.get("id")})
    matched = 0
    for sub in subs:
        u = await db.users.find_one({"email": (sub["customer_email"] or "").lower()})
        if u:
            await db.users.update_one({"id": u["id"]}, {"$set": {"billing_status": "active" if sub["status"] in ("active", "trialing") else sub["status"], "billing_plan": sub["plan"]}})
            matched += 1
    return {"subscriptions": len(subs), "members_matched": matched}


def verify_stripe_signature(payload: bytes, header: str, secret: str, tolerance: int = 300) -> bool:
    try:
        parts = dict(p.split("=", 1) for p in header.split(","))
        ts, v1 = parts["t"], [p.split("=", 1)[1] for p in header.split(",") if p.startswith("v1=")]
    except Exception:  # noqa: BLE001
        return False
    if abs(time.time() - int(ts)) > tolerance:
        return False
    expected = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, s) for s in v1)


async def _set_paid(user_id: str, plan: Optional[str], status: str = "active") -> None:
    await db.users.update_one({"id": user_id}, {"$set": {"billing_status": status, **({"billing_plan": plan} if plan else {}), "billing_updated_at": now_iso()}})


@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    c = await _creds("stripe")
    d = await _doc("stripe")
    if not d.get("enabled") or not c.get("webhook_secret"):
        raise HTTPException(status_code=400, detail="Stripe isn't connected")
    if not verify_stripe_signature(body, request.headers.get("stripe-signature", ""), c["webhook_secret"]):
        raise HTTPException(status_code=400, detail="Invalid signature")
    ev = json.loads(body)
    obj = (ev.get("data") or {}).get("object") or {}
    typ = ev.get("type", "")
    md = obj.get("metadata") or {}
    uid = md.get("user_id") or obj.get("client_reference_id")
    if not await db.stripe_events.find_one({"id": ev.get("id")}):
        await db.stripe_events.insert_one({"id": ev.get("id"), "type": typ, "at": now_iso()})
        if typ == "checkout.session.completed" and uid:
            if md.get("event_id"):
                await db.events.update_one({"id": md["event_id"]}, {"$set": {f"rsvps.{uid}": "yes"}, "$addToSet": {"attendee_ids": uid}})
                await db.payments.insert_one({"id": str(uuid.uuid4()), "user_id": uid, "kind": "ticket", "event_id": md["event_id"], "tier_id": md.get("tier_id") or None, "tier_name": md.get("tier_name"), "amount": obj.get("amount_total"), "currency": obj.get("currency"), "at": now_iso()})
                await notify(uid, "payment", "Ticket confirmed", "You're registered.", link=f"/events/{md['event_id']}")
            else:
                await _set_paid(uid, md.get("plan_key"))
                await db.payments.insert_one({"id": str(uuid.uuid4()), "user_id": uid, "kind": "membership", "plan": md.get("plan_key"), "amount": obj.get("amount_total"), "currency": obj.get("currency"), "at": now_iso()})
                await notify(uid, "payment", "Membership active", "Thanks — your membership is confirmed.", link="/settings")
        elif typ in ("invoice.paid", "invoice.payment_failed", "customer.subscription.deleted", "customer.subscription.updated"):
            email = (obj.get("customer_email") or "").lower()
            u = await db.users.find_one({"id": uid}) if uid else (await db.users.find_one({"email": email}) if email else None)
            if u:
                status = {"invoice.paid": "active", "invoice.payment_failed": "past_due", "customer.subscription.deleted": "canceled"}.get(typ) or obj.get("status", "active")
                await _set_paid(u["id"], None, status)
        await _log("stripe", "info", f"Webhook {typ}")
    return {"received": True}


# ---- member-facing billing
class CheckoutIn(BaseModel):
    plan_key: str


async def _stripe_ready():
    d = await _doc("stripe")
    if not d.get("enabled"):
        raise HTTPException(status_code=400, detail="Payments aren't set up for this community yet.")
    return d, await _creds("stripe"), {**PROVIDERS["stripe"]["defaults"], **(d.get("settings") or {})}


@router.get("/me/billing")
async def my_billing(me: dict = Depends(get_current_user)):
    d = await _doc("stripe")
    u = await db.users.find_one({"id": me["id"]}) or {}
    s = {**PROVIDERS["stripe"]["defaults"], **(d.get("settings") or {})}
    pays = [clean(p) async for p in db.payments.find({"user_id": me["id"]}).sort("at", -1).limit(10)]
    return {"enabled": bool(d.get("enabled")), "plans": s.get("plans") or [], "status": u.get("billing_status"), "plan": u.get("billing_plan"), "payments": pays, "currency": s.get("currency")}


@router.post("/me/billing/checkout")
async def membership_checkout(body: CheckoutIn, request: Request, me: dict = Depends(get_current_user)):
    d, c, s = await _stripe_ready()
    plan = next((p for p in s.get("plans") or [] if p.get("key") == body.plan_key), None)
    if not plan:
        raise HTTPException(status_code=404, detail="That plan isn't available.")
    if _is_demo(c):
        await _set_paid(me["id"], plan["label"])
        await db.payments.insert_one({"id": str(uuid.uuid4()), "user_id": me["id"], "kind": "membership", "plan": plan["label"], "amount": plan.get("amount_cents"), "currency": s.get("currency"), "at": now_iso(), "demo": True})
        return {"url": None, "demo": True, "message": "Demo mode: payment simulated and your membership is now active."}
    origin = request.headers.get("origin") or str(request.base_url).rstrip("/")
    form = {"mode": "subscription" if plan.get("interval") in ("month", "year") else "payment", "success_url": f"{origin}/settings?paid=1", "cancel_url": f"{origin}/settings",
            "client_reference_id": me["id"], "customer_email": me.get("email"), "metadata[user_id]": me["id"], "metadata[plan_key]": plan["key"],
            "line_items[0][quantity]": "1"}
    if plan.get("price_id"):
        form["line_items[0][price]"] = plan["price_id"]
    else:
        form.update({"line_items[0][price_data][currency]": s.get("currency") or "cad", "line_items[0][price_data][unit_amount]": str(int(plan.get("amount_cents") or 0)),
                     "line_items[0][price_data][product_data][name]": plan["label"]})
        if form["mode"] == "subscription":
            form["line_items[0][price_data][recurring][interval]"] = plan["interval"]
    j = await _http("POST", f"{STRIPE}/checkout/sessions", headers=_sh(c), data=form, what="Stripe")
    return {"url": j.get("url")}


class TicketCheckoutIn(BaseModel):
    tier_id: Optional[str] = None


async def _tier_sold_count(event_id: str, tier_id: str) -> int:
    return await db.payments.count_documents({"kind": "ticket", "event_id": event_id, "tier_id": tier_id})


@router.post("/events/{event_id}/checkout")
async def ticket_checkout(event_id: str, request: Request, body: TicketCheckoutIn = TicketCheckoutIn(), me: dict = Depends(get_current_user)):
    e = await db.events.find_one({"id": event_id})
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    tiers = e.get("ticket_tiers") or []
    tier = None
    if tiers:
        tier = next((t for t in tiers if t["id"] == body.tier_id), None)
        if not tier:
            raise HTTPException(status_code=400, detail="Pick a ticket type.")
        if tier.get("capacity") is not None and await _tier_sold_count(event_id, tier["id"]) >= tier["capacity"]:
            raise HTTPException(status_code=409, detail=f"{tier['name']} is sold out.")
        price, label = tier["price_cents"], tier["name"]
    else:
        if not e.get("price_cents"):
            raise HTTPException(status_code=404, detail="This event has no ticket price.")
        price, label = e["price_cents"], e.get("title", "Event ticket")
    d, c, s = await _stripe_ready()
    if not tiers and e.get("capacity") and len(e.get("attendee_ids") or []) >= int(e["capacity"]) and me["id"] not in (e.get("attendee_ids") or []):
        raise HTTPException(status_code=409, detail="Sold out.")
    if await db.payments.find_one({"kind": "ticket", "event_id": event_id, "user_id": me["id"]}):
        raise HTTPException(status_code=409, detail="You already have a ticket.")
    if _is_demo(c):
        await db.events.update_one({"id": event_id}, {"$set": {f"rsvps.{me['id']}": "yes"}, "$addToSet": {"attendee_ids": me["id"]}})
        await db.payments.insert_one({"id": str(uuid.uuid4()), "user_id": me["id"], "kind": "ticket", "event_id": event_id, "tier_id": tier["id"] if tier else None,
                                      "tier_name": label, "amount": price, "currency": e.get("currency") or s.get("currency"), "at": now_iso(), "demo": True})
        return {"url": None, "demo": True, "message": "Demo mode: ticket purchase simulated — you're registered."}
    origin = request.headers.get("origin") or str(request.base_url).rstrip("/")
    form = {"mode": "payment", "success_url": f"{origin}/events/{event_id}?paid=1", "cancel_url": f"{origin}/events/{event_id}", "client_reference_id": me["id"],
            "customer_email": me.get("email"), "metadata[user_id]": me["id"], "metadata[event_id]": event_id, "metadata[tier_id]": tier["id"] if tier else "",
            "metadata[tier_name]": label, "line_items[0][quantity]": "1",
            "line_items[0][price_data][currency]": e.get("currency") or s.get("currency") or "cad", "line_items[0][price_data][unit_amount]": str(int(price)),
            "line_items[0][price_data][product_data][name]": f"{e.get('title', 'Event ticket')} — {label}" if tier else e.get("title", "Event ticket")}
    j = await _http("POST", f"{STRIPE}/checkout/sessions", headers=_sh(c), data=form, what="Stripe")
    return {"url": j.get("url")}


# --------------------------------------------------------------------------- admin API
async def twilio_test(c, s) -> str:
    if _is_demo(c):
        return "Demo mode: connected to a sample Twilio account. Texts are simulated, nothing is sent."
    if not (s.get("from_number") or s.get("messaging_service_sid")):
        raise IntegrationError("Add a sending number or a Messaging Service SID.")
    j = await _http("GET", f"https://api.twilio.com/2010-04-01/Accounts/{quote(c.get('account_sid', ''), safe='')}.json", headers=_twh(c), what="Twilio")
    return f"Connected to Twilio account {j.get('friendly_name') or j.get('sid', '')}"


def _twh(c):
    tok = base64.b64encode(f"{c.get('account_sid', '')}:{c.get('auth_token', '')}".encode()).decode()
    return {"Authorization": f"Basic {tok}"}


async def sendgrid_test(c, s) -> str:
    if _is_demo(c):
        return "Demo mode: connected to a sample SendGrid account. Emails are simulated, nothing is sent."
    if not s.get("from_email"):
        raise IntegrationError("Add a from email address.")
    j = await _http("GET", "https://api.sendgrid.com/v3/user/account", headers={"Authorization": f"Bearer {c['api_key']}"}, what="SendGrid")
    return f"Connected to SendGrid ({j.get('type', 'account')})"


TESTS = {"airtable": airtable_test, "luma": luma_test, "stripe": stripe_test, "twilio": twilio_test, "sendgrid": sendgrid_test}
SYNCS = {"airtable": airtable_sync, "luma": luma_sync, "stripe": stripe_sync}


WEBHOOKS = {"stripe": "/api/webhooks/stripe", "twilio": "/api/webhooks/twilio"}  # sendgrid has no inbound webhook yet


def _public(provider: str, d: Dict[str, Any]) -> Dict[str, Any]:
    meta = PROVIDERS[provider]
    creds = {k: dec(v) for k, v in (d.get("credentials") or {}).items()}
    return {"provider": provider, "label": meta["label"], "kind": meta["kind"], "description": meta["description"], "capabilities": meta["capabilities"],
            "credential_fields": meta["credentials"], "setting_fields": meta["settings"], "docs": meta.get("docs"),
            "enabled": bool(d.get("enabled")), "status": d.get("status", "disconnected"), "demo": _is_demo(creds), "masked": {k: mask(v) for k, v in creds.items()},
            "settings": {**meta["defaults"], **(d.get("settings") or {})}, "last_sync_at": d.get("last_sync_at"), "last_result": d.get("last_result"),
            "last_error": d.get("last_error"), "log": (d.get("log") or [])[-8:][::-1],
            "webhook_path": (f"{WEBHOOKS[provider]}?community={current_community()}" if provider in WEBHOOKS else None)}


class IntegrationIn(BaseModel):
    credentials: Dict[str, str] = {}
    settings: Dict[str, Any] = {}
    enabled: Optional[bool] = None


@router.get("/admin/integrations")
async def list_integrations(_: dict = Depends(require_role("admin"))):
    docs = {d["provider"]: d async for d in db.integrations.find({})}
    return {"integrations": [_public(p, docs.get(p, {})) for p in PROVIDERS]}


@router.put("/admin/integrations/{provider}")
async def save_integration(provider: str, body: IntegrationIn, me: dict = Depends(require_role("admin"))):
    if provider not in PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown integration")
    meta = PROVIDERS[provider]
    d = await _doc(provider)
    creds = dict(d.get("credentials") or {})
    for k, v in body.credentials.items():
        if k in {f["key"] for f in meta["credentials"]} and v.strip():  # blank = keep the saved secret
            creds[k] = enc(v.strip())
    settings = {**(d.get("settings") or {})}
    for k, v in body.settings.items():
        if k in {f["key"] for f in meta["settings"]}:
            settings[k] = v
    if provider == "airtable":
        for k in ("base_id", "table"):
            if settings.get(k) and not SAFE_SEGMENT.match(str(settings[k])):
                raise HTTPException(status_code=400, detail=f"That {k.replace('_', ' ')} doesn't look right.")
    if provider == "stripe":
        plans = []
        for p in settings.get("plans") or []:
            if str(p.get("label", "")).strip():
                plans.append({"key": p.get("key") or re.sub(r"[^a-z0-9]+", "-", p["label"].lower()).strip("-"), "label": p["label"].strip()[:60], "price_id": (p.get("price_id") or "").strip() or None,
                              "amount_cents": int(float(p.get("amount_cents") or 0)), "interval": p.get("interval") or "month"})
        settings["plans"] = plans
    enabled = body.enabled if body.enabled is not None else (bool(creds) or meta["kind"] == "link")
    await db.integrations.update_one({"provider": provider}, {"$set": {"provider": provider, "label": meta["label"], "credentials": creds, "settings": settings,
                                     "enabled": enabled, "status": "saved" if enabled else "disconnected", "updated_at": now_iso()}}, upsert=True)
    await audit(me["id"], "integration.saved", "integration", provider, {"enabled": enabled})
    return _public(provider, await _doc(provider))


@router.post("/admin/integrations/{provider}/test")
async def test_integration(provider: str, me: dict = Depends(require_role("admin"))):
    if provider not in TESTS:
        raise HTTPException(status_code=400, detail="This tool doesn't need a connection test.")
    d = await _doc(provider)
    if not d.get("credentials"):
        raise HTTPException(status_code=400, detail="Save your credentials first.")
    c, s = await _creds(provider), {**PROVIDERS[provider]["defaults"], **(d.get("settings") or {})}
    try:
        msg = await TESTS[provider](c, s)
        await db.integrations.update_one({"provider": provider}, {"$set": {"status": "demo" if _is_demo(c) else "connected", "last_error": None}})
        await _log(provider, "info", msg)
        return {"ok": True, "message": msg}
    except IntegrationError as exc:
        await db.integrations.update_one({"provider": provider}, {"$set": {"status": "error", "last_error": str(exc)}})
        await _log(provider, "error", str(exc))
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/admin/integrations/{provider}/sync")
async def sync_integration(provider: str, me: dict = Depends(require_role("admin"))):
    if provider not in SYNCS:
        raise HTTPException(status_code=400, detail="Nothing to sync for this tool.")
    d = await _doc(provider)
    if not d.get("enabled") or not d.get("credentials"):
        raise HTTPException(status_code=400, detail="Connect this tool first.")
    c, s = await _creds(provider), {**PROVIDERS[provider]["defaults"], **(d.get("settings") or {})}
    try:
        res = await SYNCS[provider](c, s)
    except IntegrationError as exc:
        await db.integrations.update_one({"provider": provider}, {"$set": {"status": "error", "last_error": str(exc)}})
        await _log(provider, "error", str(exc))
        raise HTTPException(status_code=400, detail=str(exc))
    await db.integrations.update_one({"provider": provider}, {"$set": {"status": "demo" if _is_demo(c) else "connected", "last_error": None, "last_sync_at": now_iso(), "last_result": res}})
    await _log(provider, "info", "Sync complete: " + ", ".join(f"{k.replace('_', ' ')} {v}" for k, v in res.items()))
    await audit(me["id"], "integration.synced", "integration", provider, res)
    return {"ok": True, "result": res}


@router.delete("/admin/integrations/{provider}")
async def disconnect_integration(provider: str, me: dict = Depends(require_role("admin"))):
    if provider not in PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown integration")
    await db.integrations.delete_one({"provider": provider})
    await audit(me["id"], "integration.disconnected", "integration", provider)
    return {"ok": True}


@router.get("/integrations/public")
async def public_integrations():
    """Which tools are connected (no secrets) — lets the member UI show 'Register on Luma', billing, etc."""
    out = {}
    async for d in db.integrations.find({"enabled": True}):
        out[d["provider"]] = True
    return {"connected": out}


@router.get("/admin/events/{event_id}/sales")
async def event_sales(event_id: str, _: dict = Depends(require_role("admin"))):
    e = await db.events.find_one({"id": event_id})
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    tiers = e.get("ticket_tiers") or []
    orders = []
    revenue = 0
    by_tier: Dict[str, Dict[str, Any]] = {}
    async for p in db.payments.find({"kind": "ticket", "event_id": event_id}).sort("at", -1):
        u = await db.users.find_one({"id": p.get("user_id")}) or {}
        amt = int(p.get("amount") or 0)
        revenue += amt
        tid = p.get("tier_id") or "_general"
        row = by_tier.setdefault(tid, {"id": tid, "name": p.get("tier_name") or "General admission", "sold": 0, "revenue_cents": 0})
        row["sold"] += 1
        row["revenue_cents"] += amt
        orders.append({"id": p.get("id"), "name": u.get("name") or "Member", "email": u.get("email"), "tier_name": p.get("tier_name"),
                       "amount": p.get("amount"), "currency": p.get("currency"), "at": p.get("at"), "demo": bool(p.get("demo"))})
    tier_rows = []
    if tiers:
        for t in tiers:
            row = by_tier.get(t["id"], {"sold": 0, "revenue_cents": 0})
            tier_rows.append({"id": t["id"], "name": t["name"], "price_cents": t["price_cents"], "capacity": t.get("capacity"),
                              "sold": row["sold"], "revenue_cents": row["revenue_cents"],
                              "sold_out": t.get("capacity") is not None and row["sold"] >= t["capacity"]})
    views_total = await db.event_views.count_documents({"event_id": event_id})
    unique_viewers = len(await db.event_views.distinct("user_id", {"event_id": event_id, "user_id": {"$ne": None}}))
    anon_views = views_total - await db.event_views.count_documents({"event_id": event_id, "user_id": {"$ne": None}})
    sold_total = len(orders)
    d = await _doc("stripe")
    return {"price_cents": e.get("price_cents"), "capacity": e.get("capacity"), "sold": sold_total, "revenue_cents": revenue, "currency": e.get("currency") or "cad",
            "attending": len(e.get("attendee_ids") or []), "orders": orders, "stripe_connected": bool(d.get("enabled")),
            "tiers": tier_rows,
            "traffic": {"views": views_total, "unique_viewers": unique_viewers, "anonymous_views": anon_views,
                        "conversion_rate": round(sold_total / unique_viewers, 4) if unique_viewers else (0.0 if views_total == 0 else None)}}
