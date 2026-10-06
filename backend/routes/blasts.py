"""Message blasts: one admin composer, sent by text (Twilio), email (SendGrid), or both.

Only members who opted in to each channel (Settings → Notifications) and have the needed contact info receive
anything — a phone number for text (CASL/TCPA opt-in required), an email address for email. Every text ends with
an opt-out line, and STOP replies turn a member's texting off automatically. Demo credentials ('demo') simulate
sends so the whole flow can be tried without a real Twilio or SendGrid account."""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import re
import uuid
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from auth import get_current_user, require_role
from database import db
from urllib.parse import quote

from ._common import audit, clean, now_iso, public_base_url
from .integrations import _creds, _doc, _is_demo, _twh
from .notifications import notify

router = APIRouter(tags=["blasts"])
OPT_OUT = " Reply STOP to opt out."
MAX_RECIPIENTS = 1000
EMAIL_FOOTER = "\n\n--\nYou're receiving this because you're a member of this community. To stop these emails, turn off email in Settings > Notifications."
SEND_CONCURRENCY = 8  # parallel provider calls per blast: a 1000-person audience sent one by one would outlast the request


async def _fan_out(items: List[Any], fn) -> List[Optional[Exception]]:
    """Run `fn(item)` for every item, a few at a time; returns each item's exception (or None), in order."""
    sem = asyncio.Semaphore(SEND_CONCURRENCY)

    async def one(item):
        async with sem:
            try:
                await fn(item)
                return None
            except Exception as exc:  # noqa: BLE001
                return exc

    return list(await asyncio.gather(*(one(i) for i in items)))


def to_e164(raw: Optional[str], default_cc: str = "1") -> Optional[str]:
    digits = re.sub(r"[^\d+]", "", raw or "")
    if not digits:
        return None
    if digits.startswith("+"):
        d = digits[1:]
    elif len(digits) == 10:
        d = default_cc + digits
    else:
        d = digits
    return "+" + d if 10 <= len(d) <= 15 else None


class Audience(BaseModel):
    type: str = "all"            # all | event | admins
    event_id: Optional[str] = None


async def _members(aud: Audience) -> List[dict]:
    q: Dict[str, Any] = {}
    if aud.type == "admins":
        q["role"] = "admin"
    elif aud.type == "event":
        e = await db.events.find_one({"id": aud.event_id})
        if not e:
            raise HTTPException(status_code=404, detail="Event not found")
        q["id"] = {"$in": e.get("attendee_ids") or []}
    elif aud.type != "all":
        raise HTTPException(status_code=400, detail="Unknown audience")
    out = []
    async for u in db.users.find(q):
        if (u.get("membership_status") or "approved") == "approved":
            out.append(u)
    return out


async def resolve(aud: Audience) -> Dict[str, Any]:
    """Split the audience by channel: who can be texted, who can be emailed, and who's skipped and why."""
    people = await _members(aud)
    sms, email, sms_no_phone, sms_not_opted, email_not_opted = [], [], 0, 0, 0
    for u in people:
        notifs = (u.get("settings") or {}).get("notifications") or {}
        phone = to_e164((u.get("contact") or {}).get("phone") or u.get("phone"))
        if notifs.get("sms", False):
            if phone:
                sms.append({"id": u["id"], "name": u.get("name"), "phone": phone})
            else:
                sms_no_phone += 1
        else:
            sms_not_opted += 1
        addr = u.get("email")
        if notifs.get("email", True) and addr:
            email.append({"id": u["id"], "name": u.get("name"), "email": addr})
        elif not notifs.get("email", True):
            email_not_opted += 1
    # `people` rides along (not just the counts) so send_blast can fan an in-app "Pathwai Internal"
    # blast out to everyone in the audience -- that channel isn't gated by the SMS/email opt-in
    # settings the way text and email are, so it needs the raw member list, not just who's opted in.
    return {"sms": sms, "email": email, "people": people, "total_members": len(people),
            "sms_no_phone": sms_no_phone, "sms_not_opted_in": sms_not_opted, "email_not_opted_in": email_not_opted}


@router.post("/admin/blasts/audience")
async def audience(aud: Audience, _: dict = Depends(require_role("admin"))):
    r = await resolve(aud)
    tw, sg = await _doc("twilio"), await _doc("sendgrid")
    return {"sms_count": len(r["sms"]), "email_count": len(r["email"]), "total_members": r["total_members"],
            "sms_no_phone": r["sms_no_phone"], "sms_not_opted_in": r["sms_not_opted_in"], "email_not_opted_in": r["email_not_opted_in"],
            "twilio_connected": bool(tw.get("enabled")), "sendgrid_connected": bool(sg.get("enabled")),
            "sms_demo": _is_demo(await _creds("twilio")) if tw.get("enabled") else False,
            "email_demo": _is_demo(await _creds("sendgrid")) if sg.get("enabled") else False}


class SendIn(BaseModel):
    message: str = Field(min_length=1, max_length=1600)
    subject: Optional[str] = Field(default=None, max_length=140)
    channel: str = "sms"  # sms | email | both | none (none = Pathwai Internal only, see `internal` below)
    # A third, independent send option alongside text/email: an in-app notification (see
    # routes/notifications.py's notify()) to everyone in the audience. Kept separate from `channel`
    # rather than folded into its enum, since it isn't gated by Twilio/SendGrid or by a member's
    # SMS/email opt-in settings the way those two are -- it can be sent alone (channel="none") or
    # alongside either or both of the others.
    internal: bool = False
    audience: Audience = Audience()


async def _send_sms(c: Dict[str, str], s: Dict[str, Any], to: str, body: str) -> None:
    data = {"To": to, "Body": body}
    if s.get("messaging_service_sid"):
        data["MessagingServiceSid"] = s["messaging_service_sid"]
    else:
        data["From"] = s["from_number"]
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(f"https://api.twilio.com/2010-04-01/Accounts/{quote(c['account_sid'], safe='')}/Messages.json", headers=_twh(c), data=data)
    if r.status_code >= 400:
        try:
            msg = r.json().get("message")
        except Exception:  # noqa: BLE001
            msg = r.text[:120]
        raise RuntimeError(msg or f"HTTP {r.status_code}")


async def _send_email(c: Dict[str, str], s: Dict[str, Any], to: str, name: str, subject: str, body: str) -> None:
    # SendGrid rejects empty/null names, so only include a name when there is one.
    payload = {
        "personalizations": [{"to": [{"email": to, **({"name": name} if name else {})}]}],
        "from": {"email": s.get("from_email"), **({"name": s["from_name"]} if s.get("from_name") else {})},
        "subject": subject,
        "content": [{"type": "text/plain", "value": body + EMAIL_FOOTER}],
    }
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post("https://api.sendgrid.com/v3/mail/send", headers={"Authorization": f"Bearer {c['api_key']}"}, json=payload)
    if r.status_code >= 400:
        try:
            msg = r.json().get("errors", [{}])[0].get("message")
        except Exception:  # noqa: BLE001
            msg = r.text[:120]
        raise RuntimeError(msg or f"HTTP {r.status_code}")


@router.post("/admin/blasts/send")
async def send_blast(body: SendIn, me: dict = Depends(require_role("admin"))):
    if body.channel not in ("sms", "email", "both", "none"):
        raise HTTPException(status_code=400, detail="Channel must be sms, email, both or none")
    want_sms, want_email, want_internal = body.channel in ("sms", "both"), body.channel in ("email", "both"), body.internal
    if not (want_sms or want_email or want_internal):
        raise HTTPException(status_code=400, detail="Choose at least one way to send this: text, email or Pathwai Internal.")
    tw, sg = (await _doc("twilio")) if want_sms else {}, (await _doc("sendgrid")) if want_email else {}
    if want_sms and not (tw.get("enabled") and tw.get("credentials")):
        raise HTTPException(status_code=400, detail="Connect Twilio first (Admin → Integrations) to send texts.")
    if want_email and not (sg.get("enabled") and sg.get("credentials")):
        raise HTTPException(status_code=400, detail="Connect SendGrid first (Admin → Integrations) to send email.")
    tc = await _creds("twilio") if want_sms else {}
    ts = {**(tw.get("settings") or {})}
    ec = await _creds("sendgrid") if want_email else {}
    es = {**(sg.get("settings") or {})}
    sms_demo, email_demo = _is_demo(tc), _is_demo(ec)
    if want_sms and not sms_demo and not (ts.get("from_number") or ts.get("messaging_service_sid")):
        raise HTTPException(status_code=400, detail="Add a sending number in the Twilio settings.")
    if want_email and not email_demo and not es.get("from_email"):
        raise HTTPException(status_code=400, detail="Add a from email in the SendGrid settings.")

    r = await resolve(body.audience)
    # Total reach across just the channels actually chosen -- Pathwai Internal reaches everyone in
    # the audience regardless of their SMS/email opt-in settings, so a blast can still go out over
    # it even when no one has opted in to text or email.
    reach = (len(r["sms"]) if want_sms else 0) + (len(r["email"]) if want_email else 0) + (len(r["people"]) if want_internal else 0)
    if reach == 0:
        raise HTTPException(status_code=400, detail="No one in this audience can be reached through the channels you chose.")
    if len(r["sms"]) > MAX_RECIPIENTS or len(r["email"]) > MAX_RECIPIENTS or len(r["people"]) > MAX_RECIPIENTS:
        raise HTTPException(status_code=400, detail=f"That audience is over {MAX_RECIPIENTS} people. Narrow it down.")

    text = body.message.strip()
    if want_sms and "stop" not in text.lower():
        text += OPT_OUT
    subject = (body.subject or "").strip() or (body.message.strip()[:60] + ("…" if len(body.message.strip()) > 60 else ""))

    sms_sent = sms_failed = email_sent = email_failed = 0
    errors: List[str] = []
    if want_sms:
        async def _one_sms(p):
            if not sms_demo:
                await _send_sms(tc, ts, p["phone"], text)

        for p, exc in zip(r["sms"], await _fan_out(r["sms"], _one_sms)):
            if exc is None:
                sms_sent += 1
            else:
                sms_failed += 1
                if len(errors) < 6:
                    errors.append(f"Text to {p['name']}: {exc}")
    if want_email:
        async def _one_email(p):
            if not email_demo:
                await _send_email(ec, es, p["email"], p["name"] or "", subject, body.message.strip())

        for p, exc in zip(r["email"], await _fan_out(r["email"], _one_email)):
            if exc is None:
                email_sent += 1
            else:
                email_failed += 1
                if len(errors) < 6:
                    errors.append(f"Email to {p['name']}: {exc}")

    internal_sent = 0
    if want_internal:
        # No integration, no opt-in gate, never fails mid-send the way a text or email can -- it's
        # just a notification row per member, the same mechanism a membership request or a reported
        # message uses to reach someone inside the product.
        for u in r["people"]:
            await notify(u["id"], "blast", subject, body.message.strip(), link="/updates")
        internal_sent = len(r["people"])

    doc = {"id": str(uuid.uuid4()), "message": body.message.strip(), "subject": subject if (want_email or want_internal) else None, "channel": body.channel,
           "internal": want_internal, "internal_sent": internal_sent,
           "audience": body.audience.model_dump(), "sms_sent": sms_sent, "sms_failed": sms_failed, "email_sent": email_sent, "email_failed": email_failed,
           "skipped": {"sms_no_phone": r["sms_no_phone"], "sms_not_opted_in": r["sms_not_opted_in"], "email_not_opted_in": r["email_not_opted_in"]},
           "errors": errors, "demo": (sms_demo if want_sms else True) and (email_demo if want_email else True),
           "by": me["id"], "by_name": me.get("name"), "at": now_iso()}
    await db.message_blasts.insert_one(dict(doc))
    await audit(me["id"], "blast.sent", "blast", doc["id"], {"channel": body.channel, "internal": want_internal, "sms_sent": sms_sent, "email_sent": email_sent, "internal_sent": internal_sent})
    return doc


@router.get("/admin/blasts/history")
async def history(
    audience_type: Optional[str] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
    _: dict = Depends(require_role("admin")),
):
    # Same shape as /admin/audit-log's own filters (see routes/admin.py) -- "context" here is which
    # audience a blast went to (All members / an event's guests / Admins only), and since/until are
    # plain ISO-string bounds on `at`, which sorts and compares fine as text.
    q: Dict[str, Any] = {}
    # "all" is a real audience value ("All members"), so the no-filter sentinel has to be something
    # else -- an empty/omitted param, not the string "all" (which Resources.jsx-style filters use
    # for "no filter" elsewhere, but would be ambiguous here).
    if audience_type:
        q["audience.type"] = audience_type
    win: Dict[str, str] = {}
    if since:
        win["$gte"] = since
    if until:
        win["$lte"] = until
    if win:
        q["at"] = win
    return {"blasts": [clean(b) async for b in db.message_blasts.find(q).sort("at", -1).limit(100)]}


def verify_twilio_signature(url: str, params: Dict[str, str], signature: str, token: str) -> bool:
    payload = url + "".join(k + params[k] for k in sorted(params))
    mac = base64.b64encode(hmac.new(token.encode(), payload.encode(), hashlib.sha1).digest()).decode()
    return hmac.compare_digest(mac, signature or "")


@router.post("/webhooks/twilio")
async def twilio_inbound(request: Request):
    """Twilio calls this when someone replies. STOP/UNSUBSCRIBE turns their texts off; START turns them back on."""
    tw = await _doc("twilio")
    c = await _creds("twilio")
    if not tw.get("enabled"):
        raise HTTPException(status_code=400, detail="Twilio isn't connected")
    form = {k: str(v) for k, v in (await request.form()).items()}
    if not _is_demo(c):
        # Twilio signs the exact public URL it called. Behind Railway's proxy this server sees an internal
        # host/scheme, so check the externally visible URL(s) as well as the raw one.
        q = ("?" + request.url.query) if request.url.query else ""
        candidates = {str(request.url), f"{public_base_url(request)}{request.url.path}{q}"}
        sig = request.headers.get("x-twilio-signature", "")
        if not any(verify_twilio_signature(u, form, sig, c.get("auth_token", "")) for u in candidates):
            raise HTTPException(status_code=400, detail="Bad signature")
    word = (form.get("Body") or "").strip().lower()
    phone = to_e164(form.get("From"))
    if phone and word in ("stop", "stopall", "unsubscribe", "cancel", "end", "quit", "start", "unstop"):
        on = word in ("start", "unstop")
        async for u in db.users.find({}):
            if to_e164((u.get("contact") or {}).get("phone") or u.get("phone")) == phone:
                await db.users.update_one({"id": u["id"]}, {"$set": {"settings.notifications.sms": on}})
    return {"ok": True}
