"""Connected tools: Stripe (membership dues, event tickets), Instagram and TikTok (read-only analytics for reports),
Disco (preview), plus link-based form tools. Everything else Pathwai does itself: members, events, texts and email
are built in (see routes/blasts.py and messaging.py), and data from other tools comes in through "Import your data"
(routes/data_import.py). Credentials are encrypted at rest and never returned to the browser.

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

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from auth import JWT_SECRET, get_current_user, require_role
from database import current_community, db
from ._common import public_base_url, return_base_url, audit, clean, now_iso
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
    "disco": {
        "label": "Disco", "kind": "api", "preview": True,
        "description": "Preview: show the Disco programs your members are in, and how far along they are, inside your community. Try it with the key \"demo\". Live connections are switched on per Academy once its Disco API access (Enterprise plan) is confirmed.",
        "capabilities": ["Programs members are enrolled in", "Progress and completion", "Next live session", "Matched to members by email"],
        "credentials": [{"key": "api_key", "label": "Disco API key", "placeholder": "Disco Admin Area → Settings → API  (or 'demo' to try it)"}],
        "settings": [],
        "defaults": {},
        "docs": "https://docs.disco.co/api",
    },
    "instagram": {
        "label": "Instagram", "kind": "api",
        "description": "Bring your Instagram Business or Creator analytics into Pathwai: followers, 30-day reach, who your audience is and your best posts. Add it to sponsor, funder and board reports. Try it with the token \"demo\".",
        "capabilities": ["Followers and 30-day reach", "Audience by country, city, age and gender", "Best recent posts", "Adds a section to your reports"],
        "credentials": [{"key": "api_key", "label": "Instagram access token", "placeholder": "Instagram User access token  (or 'demo' to try it)"}],
        "settings": [],
        "defaults": {},
        "docs": "https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login",
    },
    "tiktok": {
        "label": "TikTok", "kind": "api",
        "description": "Bring your TikTok account into Pathwai: followers, video views, likes and your best recent videos. It sits beside Instagram in your reports, with the two added together for your overall social reach. Try it with the client key \"demo\".",
        "capabilities": ["Followers, likes and videos", "Views, likes and shares for the last 30 days", "Best recent videos", "Combined with Instagram into one social reach"],
        "credentials": [{"key": "client_key", "label": "Client key", "placeholder": "From your TikTok developer app  (or 'demo' to try it)"},
                        {"key": "client_secret", "label": "Client secret", "placeholder": "From your TikTok developer app"},
                        {"key": "refresh_token", "label": "Refresh token", "placeholder": "From authorizing your account with user.info.stat and video.list"}],
        "settings": [],
        "defaults": {},
        "docs": "https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info/",
    },
    "stripe": {
        "label": "Stripe", "kind": "api",
        "description": "Charge membership dues and sell event tickets with Stripe Checkout. Members pay on Stripe's own secure page, so card details never touch Pathwai, and payments update member status automatically.",
        "capabilities": ["Membership plans (Checkout)", "Paid event tickets", "Webhook-driven billing status", "Customer sync"],
        "credentials": [{"key": "api_key", "label": "Secret or restricted key", "placeholder": "sk_live_… / rk_… (or 'demo')"},
                        {"key": "webhook_secret", "label": "Webhook signing secret", "placeholder": "whsec_…"}],
        "settings": [{"key": "currency", "label": "Currency", "placeholder": "cad"},
                     {"key": "plans", "label": "Membership plans", "type": "plans"}],
        "defaults": {"currency": "cad", "plans": []},
        "docs": "https://docs.stripe.com/keys",
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
    return (c.get("api_key") or c.get("account_sid") or c.get("client_key") or "").lower().startswith("demo")


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


# --------------------------------------------------------------------------- Disco (preview)
async def _demo_disco() -> List[Any]:
    """Sample programs, enrolled from whoever is already a member, so the whole flow can be tried without a Disco account."""
    from .learning import MemberProgress, ProgramIn
    emails = [u["email"] async for u in db.users.find({"email": {"$ne": None}}, {"email": 1}).limit(8) if u.get("email")]
    t = datetime.now(timezone.utc)
    iso = lambda d: d.isoformat().replace("+00:00", "Z")
    shapes = [
        ("demo-pitch", "Pitch Fundamentals", "Build a five-minute pitch: story, slides, delivery and the questions you'll get.", 8, [("completed", 100, "Pitch Day", None), ("enrolled", 62, "Module 5: Slides that sell", 4), ("enrolled", 25, "Module 2: Your story", 9)]),
        ("demo-discovery", "Customer Discovery Bootcamp", "Ten customer interviews in four weeks, with a coach.", 6, [("enrolled", 50, "Module 3: Run the interview", 2), ("enrolled", 83, "Module 5: Synthesize what you heard", 6), ("completed", 100, "Wrap-up", None)]),
        ("demo-funding", "Funding Readiness", "Cap tables, SAFEs, grants and what investors look for at pre-seed.", 5, [("enrolled", 40, "Module 2: Cap tables", 11), ("enrolled", 20, "Module 1: Funding map", 11)]),
    ]
    out = []
    for ext, name, desc, mods, shape in shapes:
        members = []
        for i, (status, pct, cur, days) in enumerate(shape):
            if i >= len(emails):
                break
            members.append(MemberProgress(email=emails[(i + len(out)) % len(emails)], status=status, progress_pct=pct, modules_done=int(mods * pct / 100), current_module=cur,
                                          next_session_at=iso(t + timedelta(days=days)) if days else None, completed_at=iso(t - timedelta(days=3)) if status == "completed" else None))
        out.append(ProgramIn(external_id=ext, name=name, description=desc, url="https://example.com/disco/" + ext, status="active", starts_at=iso(t - timedelta(days=21)),
                             ends_at=iso(t + timedelta(days=35)), modules_total=mods, tags=["Disco", "Cohort"], members=members))
    return out


def _disco_live_unavailable() -> IntegrationError:
    return IntegrationError("Live Disco connections aren't switched on yet. Use the key \"demo\" to preview, or ask us to turn on your Academy once its Disco API access (Enterprise plan) is confirmed.")


async def disco_test(c, s) -> str:
    if _is_demo(c):
        return "Demo mode: connected to a sample Academy (3 programs)."
    raise _disco_live_unavailable()


async def disco_sync(c, s) -> Dict[str, Any]:
    if not _is_demo(c):
        raise _disco_live_unavailable()
    from .learning import _upsert
    res = await _upsert("disco", await _demo_disco())
    return {"programs": res["programs"], "enrollments": res["enrollments"], "unmatched_members": res["unmatched_members"]}


# --------------------------------------------------------------------------- Instagram analytics
async def instagram_test(c, s) -> str:
    import instagram
    if instagram.is_demo(c.get("api_key", "")):
        return "Demo mode: connected to @yourcommunity (sample numbers)."
    try:
        me = await instagram.whoami(c["api_key"])
    except instagram.InstagramError as exc:
        raise IntegrationError(str(exc))
    if (me.get("account_type") or "").upper() not in ("BUSINESS", "MEDIA_CREATOR", "CREATOR"):
        raise IntegrationError("That Instagram account is a personal account. Switch it to a Business or Creator account (free, in Instagram's settings) to get analytics.")
    return f"Connected to @{me.get('username')} ({me.get('followers_count', 0):,} followers)."


async def instagram_sync(c, s) -> Dict[str, Any]:
    import instagram
    token = c.get("api_key", "")
    try:
        snap = instagram.demo_snapshot(current_community() or "demo") if instagram.is_demo(token) else await instagram.fetch_snapshot(token)
    except instagram.InstagramError as exc:
        raise IntegrationError(str(exc))
    await instagram.save_snapshot(db, snap)
    if not instagram.is_demo(token):  # long-lived tokens last 60 days: renew about weekly so a connected account never lapses
        d = await _doc("instagram")
        try:
            last = datetime.fromisoformat(d.get("token_refreshed_at") or "2000-01-01T00:00:00+00:00")
        except ValueError:
            last = datetime(2000, 1, 1, tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - last > timedelta(days=7):
            new = await instagram.refresh_token(token)
            if new:
                await db.integrations.update_one({"provider": "instagram"}, {"$set": {"credentials.api_key": enc(new), "token_refreshed_at": now_iso()}})
    t = snap.get("totals") or {}
    return {"followers": snap["account"]["followers"], "reach_30d": t.get("reach") if t.get("reach") is not None else "n/a", "posts_read": len(snap.get("top_posts") or [])}


# --------------------------------------------------------------------------- TikTok analytics
async def _tiktok_token(c) -> str:
    """A fresh day-long access token from the saved refresh token; a renewed refresh token (TikTok may rotate it) is saved straight away."""
    import tiktok
    try:
        access, new_refresh = await tiktok.refresh_access(c.get("client_key", ""), c.get("client_secret", ""), c.get("refresh_token", ""))
    except tiktok.TikTokError as exc:
        raise IntegrationError(str(exc))
    if new_refresh and new_refresh != c.get("refresh_token"):
        await db.integrations.update_one({"provider": "tiktok"}, {"$set": {"credentials.refresh_token": enc(new_refresh), "token_refreshed_at": now_iso()}})
    return access


async def tiktok_test(c, s) -> str:
    import tiktok
    if tiktok.is_demo(c.get("client_key", "")):
        return "Demo mode: connected to @yourcommunity on TikTok (sample numbers)."
    if not (c.get("client_secret") and c.get("refresh_token")):
        raise IntegrationError("Add the client secret and the refresh token as well as the client key.")
    try:
        me = await tiktok.whoami(await _tiktok_token(c))
    except tiktok.TikTokError as exc:
        raise IntegrationError(str(exc))
    return f"Connected to @{me.get('username') or me.get('display_name')} ({me.get('follower_count', 0):,} followers)."


async def tiktok_sync(c, s) -> Dict[str, Any]:
    import tiktok
    try:
        snap = tiktok.demo_snapshot(current_community() or "demo") if tiktok.is_demo(c.get("client_key", "")) else await tiktok.fetch_snapshot(await _tiktok_token(c))
    except tiktok.TikTokError as exc:
        raise IntegrationError(str(exc))
    await tiktok.save_snapshot(db, snap)
    return {"followers": snap["account"]["followers"], "views_30d": (snap.get("totals") or {}).get("views", 0), "videos_read": len(snap.get("top_posts") or [])}


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
    uid = md.get("user_id") or obj.get("client_reference_id") or ((obj.get("subscription_details") or {}).get("metadata") or {}).get("user_id")
    if not await db.stripe_events.find_one({"id": ev.get("id")}):
        # Recorded only AFTER it was handled (below): Stripe retries a failed delivery, and a retry must
        # not be skipped as "already seen" when the first attempt blew up half way.
        if typ == "checkout.session.completed" and obj.get("payment_status") not in (None, "paid", "no_payment_required"):
            return {"received": True, "skipped": "payment not completed yet"}
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
        await db.stripe_events.insert_one({"id": ev.get("id"), "type": typ, "at": now_iso()})
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
    origin = return_base_url(request)
    form = {"mode": "subscription" if plan.get("interval") in ("month", "year") else "payment", "success_url": f"{origin}/settings?paid=1", "cancel_url": f"{origin}/settings",
            "client_reference_id": me["id"], "customer_email": me.get("email"), "metadata[user_id]": me["id"], "metadata[plan_key]": plan["key"],
            "line_items[0][quantity]": "1"}
    if form["mode"] == "subscription":
        # Subscription events (renewals, cancellations) carry the subscription's own metadata, not the
        # checkout session's -- without this the webhook can't tell whose subscription changed.
        form.update({"subscription_data[metadata][user_id]": me["id"], "subscription_data[metadata][plan_key]": plan["key"]})
    if plan.get("price_id"):
        form["line_items[0][price]"] = plan["price_id"]
    else:
        form.update({"line_items[0][price_data][currency]": s.get("currency") or "cad", "line_items[0][price_data][unit_amount]": str(int(plan.get("amount_cents") or 0)),
                     "line_items[0][price_data][product_data][name]": plan["label"]})
        if form["mode"] == "subscription":
            form["line_items[0][price_data][recurring][interval]"] = plan["interval"]
    j = await _http("POST", f"{STRIPE}/checkout/sessions", headers=_sh(c), data={k: v for k, v in form.items() if v not in (None, "")}, what="Stripe")
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
    origin = return_base_url(request)
    form = {"mode": "payment", "success_url": f"{origin}/events/{event_id}?paid=1", "cancel_url": f"{origin}/events/{event_id}", "client_reference_id": me["id"],
            "customer_email": me.get("email"), "metadata[user_id]": me["id"], "metadata[event_id]": event_id, "metadata[tier_id]": tier["id"] if tier else "",
            "metadata[tier_name]": label, "line_items[0][quantity]": "1",
            "line_items[0][price_data][currency]": e.get("currency") or s.get("currency") or "cad", "line_items[0][price_data][unit_amount]": str(int(price)),
            "line_items[0][price_data][product_data][name]": f"{e.get('title', 'Event ticket')} — {label}" if tier else e.get("title", "Event ticket")}
    j = await _http("POST", f"{STRIPE}/checkout/sessions", headers=_sh(c), data={k: v for k, v in form.items() if v not in (None, "")}, what="Stripe")
    return {"url": j.get("url")}


# --------------------------------------------------------------------------- admin API
TESTS = {"disco": disco_test, "instagram": instagram_test, "tiktok": tiktok_test, "stripe": stripe_test}
SYNCS = {"disco": disco_sync, "instagram": instagram_sync, "tiktok": tiktok_sync, "stripe": stripe_sync}


WEBHOOKS = {"stripe": "/api/webhooks/stripe"}  # texts and email are built in (routes/blasts.py), so no webhook is set up here


def _public(provider: str, d: Dict[str, Any], base: str = "") -> Dict[str, Any]:
    meta = PROVIDERS[provider]
    creds = {k: dec(v) for k, v in (d.get("credentials") or {}).items()}
    return {"provider": provider, "label": meta["label"], "kind": meta["kind"], "description": meta["description"], "capabilities": meta["capabilities"],
            "credential_fields": meta["credentials"], "setting_fields": meta["settings"], "docs": meta.get("docs"), "preview": bool(meta.get("preview")),
            "enabled": bool(d.get("enabled")), "status": d.get("status", "disconnected"), "demo": _is_demo(creds), "masked": {k: mask(v) for k, v in creds.items()},
            "settings": {**meta["defaults"], **(d.get("settings") or {})}, "last_sync_at": d.get("last_sync_at"), "last_result": d.get("last_result"),
            "last_error": d.get("last_error"), "log": (d.get("log") or [])[-8:][::-1],
            "webhook_path": (f"{WEBHOOKS[provider]}?community={current_community()}" if provider in WEBHOOKS else None),
            "webhook_url": (f"{base}{WEBHOOKS[provider]}?community={current_community()}" if provider in WEBHOOKS and base else None)}


class IntegrationIn(BaseModel):
    credentials: Dict[str, str] = {}
    settings: Dict[str, Any] = {}
    enabled: Optional[bool] = None


@router.get("/admin/integrations")
async def list_integrations(request: Request, _: dict = Depends(require_role("admin"))):
    docs = {d["provider"]: d async for d in db.integrations.find({})}
    base = public_base_url(request)
    return {"integrations": [_public(p, docs.get(p, {}), base) for p in PROVIDERS]}


@router.put("/admin/integrations/{provider}")
async def save_integration(provider: str, body: IntegrationIn, request: Request, me: dict = Depends(require_role("admin"))):
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
    return _public(provider, await _doc(provider), public_base_url(request))


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
    if provider == "instagram":  # the saved numbers go with the connection, so a shared report can't keep showing them
        await db.instagram_latest.delete_many({})
        await db.instagram_history.delete_many({})
    if provider == "tiktok":
        await db.tiktok_latest.delete_many({})
        await db.tiktok_history.delete_many({})
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
