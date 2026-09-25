"""Message blasts: one admin composer, sent by text (Twilio), email (SendGrid), or both.

Only members who opted in to each channel (Settings → Notifications) and have the needed contact info receive
anything — a phone number for text (CASL/TCPA opt-in required), an email address for email. Every text ends with
an opt-out line, and STOP replies turn a member's texting off automatically. Demo credentials ('demo') simulate
sends so the whole flow can be tried without a real Twilio or SendGrid account."""
from __future__ import annotations

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
from ._common import audit, clean, now_iso
from .integrations import _creds, _doc, _is_demo, _twh
from .notifications import notify

router = APIRouter(tags=["blasts"])
OPT_OUT = " Reply STOP to opt out."
MAX_RECIPIENTS = 1000


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
    return {"sms": sms, "email": email, "total_members": len(people),
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
    channel: str = "sms"  # sms | email | both
    audience: Audience = Audience()


async def _send_sms(c: Dict[str, str], s: Dict[str, Any], to: str, body: str) -> None:
    data = {"To": to, "Body": body}
    if s.get("messaging_service_sid"):
        data["MessagingServiceSid"] = s["messaging_service_sid"]
    else:
        data["From"] = s["from_number"]
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(f"https://api.twilio.com/2010-04-01/Accounts/{c['account_sid']}/Messages.json", headers=_twh(c), data=data)
    if r.status_code >= 400:
        try:
            msg = r.json().get("message")
        except Exception:  # noqa: BLE001
            msg = r.text[:120]
        raise RuntimeError(msg or f"HTTP {r.status_code}")


async def _send_email(c: Dict[str, str], s: Dict[str, Any], to: str, name: str, subject: str, body: str) -> None:
    payload = {
        "personalizations": [{"to": [{"email": to, "name": name}]}],
        "from": {"email": s.get("from_email"), "name": s.get("from_name") or None},
        "subject": subject,
        "content": [{"type": "text/plain", "value": body}],
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
    if body.channel not in ("sms", "email", "both"):
        raise HTTPException(status_code=400, detail="Channel must be sms, email or both")
    want_sms, want_email = body.channel in ("sms", "both"), body.channel in ("email", "both")
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
    if len(r["sms"]) + len(r["email"]) == 0:
        raise HTTPException(status_code=400, detail="No one in this audience has opted in and has the contact info needed.")
    if len(r["sms"]) > MAX_RECIPIENTS or len(r["email"]) > MAX_RECIPIENTS:
        raise HTTPException(status_code=400, detail=f"That audience is over {MAX_RECIPIENTS} people. Narrow it down.")

    text = body.message.strip()
    if want_sms and "stop" not in text.lower():
        text += OPT_OUT
    subject = (body.subject or "").strip() or (body.message.strip()[:60] + ("…" if len(body.message.strip()) > 60 else ""))

    sms_sent = sms_failed = email_sent = email_failed = 0
    errors: List[str] = []
    if want_sms:
        for p in r["sms"]:
            try:
                if not sms_demo:
                    await _send_sms(tc, ts, p["phone"], text)
                sms_sent += 1
            except Exception as exc:  # noqa: BLE001
                sms_failed += 1
                if len(errors) < 6:
                    errors.append(f"Text to {p['name']}: {exc}")
    if want_email:
        for p in r["email"]:
            try:
                if not email_demo:
                    await _send_email(ec, es, p["email"], p["name"] or "", subject, body.message.strip())
                email_sent += 1
            except Exception as exc:  # noqa: BLE001
                email_failed += 1
                if len(errors) < 6:
                    errors.append(f"Email to {p['name']}: {exc}")

    doc = {"id": str(uuid.uuid4()), "message": body.message.strip(), "subject": subject if want_email else None, "channel": body.channel,
           "audience": body.audience.model_dump(), "sms_sent": sms_sent, "sms_failed": sms_failed, "email_sent": email_sent, "email_failed": email_failed,
           "skipped": {"sms_no_phone": r["sms_no_phone"], "sms_not_opted_in": r["sms_not_opted_in"], "email_not_opted_in": r["email_not_opted_in"]},
           "errors": errors, "demo": (sms_demo if want_sms else True) and (email_demo if want_email else True),
           "by": me["id"], "by_name": me.get("name"), "at": now_iso()}
    await db.message_blasts.insert_one(dict(doc))
    await audit(me["id"], "blast.sent", "blast", doc["id"], {"channel": body.channel, "sms_sent": sms_sent, "email_sent": email_sent})
    return doc


@router.get("/admin/blasts/history")
async def history(_: dict = Depends(require_role("admin"))):
    return {"blasts": [clean(b) async for b in db.message_blasts.find({}).sort("at", -1).limit(30)]}


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
    if not _is_demo(c) and not verify_twilio_signature(str(request.url), form, request.headers.get("x-twilio-signature", ""), c.get("auth_token", "")):
        raise HTTPException(status_code=400, detail="Bad signature")
    word = (form.get("Body") or "").strip().lower()
    phone = to_e164(form.get("From"))
    if phone and word in ("stop", "stopall", "unsubscribe", "cancel", "end", "quit", "start", "unstop"):
        on = word in ("start", "unstop")
        async for u in db.users.find({}):
            if to_e164((u.get("contact") or {}).get("phone") or u.get("phone")) == phone:
                await db.users.update_one({"id": u["id"]}, {"$set": {"settings.notifications.sms": on}})
    return {"ok": True}
