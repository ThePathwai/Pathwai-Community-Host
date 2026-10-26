"""Pathwai's own text and email sending.

Communities do not bring a Twilio or SendGrid account. Pathwai runs one of each and every community
sends through them, so an admin just writes a message and picks who gets it.

  * Text: one shared Twilio Messaging Service (or number). Each community's name leads the message
    ("Humber Innovation Network: ...") so people know who it is from. Texts cost real money, so each
    community has a credit balance (1 credit = 1 text segment to 1 person). Email and in-app are free.
  * Email: one SendGrid sender address. The community's name is the "from" name and the sending
    admin's address is the reply-to, so replies go to a person.
  * STOP: a reply of STOP is kept in a platform-wide list (hub database) and respected in every
    community that texts that number, because the sender number is shared.

Set on the server (Railway variables):
  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_MESSAGING_SERVICE_SID (or TWILIO_FROM_NUMBER)
  SENDGRID_API_KEY, MAIL_FROM_EMAIL (an address on a domain authenticated in SendGrid), MAIL_FROM_NAME
  SMS_STARTING_CREDITS (optional, default 50): credits every community begins with

Simulation: in the demo/dev/test environment (database.demo_mode) or with MESSAGING_SIMULATE=true,
nothing is sent: the whole flow runs and reports as a simulated send. A real deployment that has not
set the variables above refuses to send, saying so, instead of pretending."""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import re
from typing import Any, Dict, Optional
from urllib.parse import quote

import httpx

from database import db, demo_mode, hub_db

logger = logging.getLogger("pathwai.messaging")


class MessagingError(Exception):
    pass


# --------------------------------------------------------------------------- what is switched on
def simulated() -> bool:
    return demo_mode() or os.environ.get("MESSAGING_SIMULATE", "").strip().lower() == "true"


def sms_ready() -> bool:
    return bool(os.environ.get("TWILIO_ACCOUNT_SID") and os.environ.get("TWILIO_AUTH_TOKEN")
                and (os.environ.get("TWILIO_MESSAGING_SERVICE_SID") or os.environ.get("TWILIO_FROM_NUMBER")))


def email_ready() -> bool:
    return bool(os.environ.get("SENDGRID_API_KEY") and os.environ.get("MAIL_FROM_EMAIL"))


def sms_available() -> bool:
    return simulated() or sms_ready()


def email_available() -> bool:
    return simulated() or email_ready()


# --------------------------------------------------------------------------- text length / credits
_GSM = set("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\[~]|€")


_GSM_EXT = set("^{}\\[~]|€")  # these take two characters' room in a plain-text message


def segments(text: str) -> int:
    """How many text segments a message takes (what Twilio bills): 160 / 153 characters each for plain
    text, 70 / 67 once an emoji or other non-GSM character is in it (counted in UTF-16 units, so an emoji is two)."""
    if not text:
        return 0
    if all(ch in _GSM for ch in text):
        n = sum(2 if ch in _GSM_EXT else 1 for ch in text)
        return 1 if n <= 160 else -(-n // 153)
    n = len(text.encode("utf-16-le")) // 2
    return 1 if n <= 70 else -(-n // 67)


def starting_credits() -> int:
    try:
        return max(0, int(os.environ.get("SMS_STARTING_CREDITS", "50")))
    except ValueError:
        return 50


async def account() -> Dict[str, Any]:
    """This community's messaging balance, created on first use."""
    d = await db.messaging.find_one({"_key": "account"})
    if not d:
        d = {"_key": "account", "sms_credits": starting_credits(), "sms_used": 0, "sms_granted": starting_credits()}
        await db.messaging.update_one({"_key": "account"}, {"$setOnInsert": d}, upsert=True)
        d = await db.messaging.find_one({"_key": "account"})
    return {"sms_credits": int(d.get("sms_credits") or 0), "sms_used": int(d.get("sms_used") or 0), "sms_granted": int(d.get("sms_granted") or 0)}


async def spend(n: int) -> bool:
    """Take `n` credits if there are enough. Atomic: two blasts at once cannot both spend the same credits."""
    await account()
    got = await db.messaging.find_one_and_update({"_key": "account", "sms_credits": {"$gte": n}}, {"$inc": {"sms_credits": -n, "sms_used": n}})
    return got is not None


async def refund(n: int) -> None:
    if n > 0:
        await db.messaging.update_one({"_key": "account"}, {"$inc": {"sms_credits": n, "sms_used": -n}})


async def grant(n: int) -> Dict[str, Any]:
    await account()
    await db.messaging.update_one({"_key": "account"}, {"$inc": {"sms_credits": n, "sms_granted": n}})
    return await account()


# --------------------------------------------------------------------------- STOP list (shared across communities)
async def opted_out_phones() -> set:
    return {d["phone"] async for d in hub_db().sms_optouts.find({})}


async def set_opt_out(phone: str, stopped: bool) -> None:
    if stopped:
        await hub_db().sms_optouts.update_one({"phone": phone}, {"$set": {"phone": phone}}, upsert=True)
    else:
        await hub_db().sms_optouts.delete_many({"phone": phone})


# --------------------------------------------------------------------------- sending
def _twilio_auth() -> Dict[str, str]:
    tok = base64.b64encode(f"{os.environ.get('TWILIO_ACCOUNT_SID', '')}:{os.environ.get('TWILIO_AUTH_TOKEN', '')}".encode()).decode()
    return {"Authorization": f"Basic {tok}"}


async def send_sms(to: str, body: str) -> None:
    """One text through Pathwai's Twilio. Raises MessagingError with a plain message on failure."""
    if simulated():
        return
    if not sms_ready():
        raise MessagingError("Text messaging isn't switched on for Pathwai yet.")
    data = {"To": to, "Body": body}
    if os.environ.get("TWILIO_MESSAGING_SERVICE_SID"):
        data["MessagingServiceSid"] = os.environ["TWILIO_MESSAGING_SERVICE_SID"]
    else:
        data["From"] = os.environ["TWILIO_FROM_NUMBER"]
    sid = quote(os.environ["TWILIO_ACCOUNT_SID"], safe="")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json", headers=_twilio_auth(), data=data)
    except httpx.HTTPError as exc:
        raise MessagingError("Couldn't reach the text service.") from exc
    if r.status_code >= 400:
        try:
            j = r.json()
            code, msg = j.get("code"), j.get("message")
        except Exception:  # noqa: BLE001
            code, msg = None, r.text[:120]
        if code == 21610:
            raise MessagingError("They replied STOP, so texts to them are blocked.")
        raise MessagingError(msg or f"HTTP {r.status_code}")


async def send_email(to: str, name: str, subject: str, body: str, *, from_name: str, reply_to: Optional[str] = None, footer: str = "") -> None:
    """One email through Pathwai's SendGrid, from the community's name, replies to a real person."""
    if simulated():
        return
    if not email_ready():
        raise MessagingError("Email sending isn't switched on for Pathwai yet.")
    payload: Dict[str, Any] = {
        "personalizations": [{"to": [{"email": to, **({"name": name} if name else {})}]}],
        "from": {"email": os.environ["MAIL_FROM_EMAIL"], "name": (from_name or os.environ.get("MAIL_FROM_NAME") or "Pathwai")[:80]},
        "subject": subject,
        "content": [{"type": "text/plain", "value": body + footer}],
    }
    if reply_to:
        payload["reply_to"] = {"email": reply_to}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post("https://api.sendgrid.com/v3/mail/send", headers={"Authorization": f"Bearer {os.environ['SENDGRID_API_KEY']}"}, json=payload)
    except httpx.HTTPError as exc:
        raise MessagingError("Couldn't reach the email service.") from exc
    if r.status_code >= 400:
        try:
            msg = r.json().get("errors", [{}])[0].get("message")
        except Exception:  # noqa: BLE001
            msg = r.text[:120]
        raise MessagingError(msg or f"HTTP {r.status_code}")


def verify_twilio_signature(url: str, params: Dict[str, str], signature: str, token: Optional[str] = None) -> bool:
    token = token if token is not None else os.environ.get("TWILIO_AUTH_TOKEN", "")
    payload = url + "".join(k + params[k] for k in sorted(params))
    mac = base64.b64encode(hmac.new(token.encode(), payload.encode(), hashlib.sha1).digest()).decode()
    return hmac.compare_digest(mac, signature or "")


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
