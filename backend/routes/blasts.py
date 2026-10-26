"""Message blasts: one admin composer, sent by text, email, in-app, or any mix of them.

Sending is built in. Pathwai runs its own Twilio and SendGrid (see messaging.py), so a community admin never
connects anything: they write the message, pick the people, and it goes out under the community's name. Texts
use credits (1 credit = 1 text segment to 1 person); email and in-app are free.

Only members who opted in to each channel (Settings -> Notifications) and have the needed contact info receive
anything -- a phone number for text (CASL/TCPA opt-in required), an email address for email. Every text ends with
an opt-out line, and a STOP reply turns texting off for that phone number everywhere on Pathwai. In the demo
environment sends are simulated, so the whole flow can be tried without real messages going out."""
from __future__ import annotations

import asyncio
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

import messaging as msg
from auth import rate_limit, require_role
from database import COMMUNITY_SLUGS, db, dbfor
from messaging import to_e164
from ._common import audit, clean, now_iso, public_base_url
from .hub import is_platform_admin
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
    stopped = await msg.opted_out_phones()  # replied STOP to Pathwai's number, in any community
    sms, email, sms_no_phone, sms_not_opted, email_not_opted = [], [], 0, 0, 0
    for u in people:
        notifs = (u.get("settings") or {}).get("notifications") or {}
        phone = to_e164((u.get("contact") or {}).get("phone") or u.get("phone"))
        if notifs.get("sms", False) and not (phone and phone in stopped):
            if phone:
                sms.append({"id": u["id"], "name": u.get("name"), "phone": phone})
            else:
                sms_no_phone += 1
        else:
            sms_not_opted += 1
        addr = u.get("email")
        if notifs.get("email", True) and addr and not u.get("email_missing"):
            email.append({"id": u["id"], "name": u.get("name"), "email": addr})
        elif not notifs.get("email", True):
            email_not_opted += 1
    # `people` rides along (not just the counts) so send_blast can fan an in-app "Pathwai Internal"
    # blast out to everyone in the audience -- that channel isn't gated by the SMS/email opt-in
    # settings the way text and email are, so it needs the raw member list, not just who's opted in.
    return {"sms": sms, "email": email, "people": people, "total_members": len(people),
            "sms_no_phone": sms_no_phone, "sms_not_opted_in": sms_not_opted, "email_not_opted_in": email_not_opted}


async def _community_name() -> str:
    cfg = await db.community_config.find_one({"_key": "singleton"}) or {}
    return (cfg.get("community_name") or cfg.get("name") or "Your community").strip()


async def _status(me: Optional[dict] = None) -> Dict[str, Any]:
    acct = await msg.account()
    return {"sms_available": msg.sms_available(), "email_available": msg.email_available(), "simulated": msg.simulated(),
            "sms_credits": acct["sms_credits"], "sms_used": acct["sms_used"],
            "can_grant": bool(me and is_platform_admin(me.get("email")))}


@router.get("/admin/messaging")
async def messaging_status(me: dict = Depends(require_role("admin"))):
    """What this community can send right now, and how many text credits it has left."""
    return await _status(me)


class GrantIn(BaseModel):
    credits: int = Field(ge=1, le=1_000_000)


@router.post("/admin/messaging/credits")
async def grant_credits(body: GrantIn, me: dict = Depends(require_role("admin"))):
    """Pathwai staff only: add text credits to this community (until self-serve top-ups exist)."""
    if not is_platform_admin(me.get("email")):
        raise HTTPException(status_code=403, detail="Only the Pathwai team can add text credits.")
    acct = await msg.grant(body.credits)
    await audit(me["id"], "messaging.credits_granted", "community", None, {"credits": body.credits})
    return {**(await _status(me)), **acct}


@router.post("/admin/blasts/audience")
async def audience(aud: Audience, me: dict = Depends(require_role("admin"))):
    r = await resolve(aud)
    return {"sms_count": len(r["sms"]), "email_count": len(r["email"]), "total_members": r["total_members"],
            "sms_no_phone": r["sms_no_phone"], "sms_not_opted_in": r["sms_not_opted_in"], "email_not_opted_in": r["email_not_opted_in"],
            **(await _status(me))}


class SendIn(BaseModel):
    message: str = Field(min_length=1, max_length=1600)
    subject: Optional[str] = Field(default=None, max_length=140)
    channel: str = "sms"  # sms | email | both | none (none = Pathwai Internal only, see `internal` below)
    # A third, independent send option alongside text/email: an in-app notification (see
    # routes/notifications.py's notify()) to everyone in the audience. Kept separate from `channel`
    # rather than folded into its enum, since it isn't gated by a member's SMS/email opt-in
    # settings the way those two are -- it can be sent alone (channel="none") or
    # alongside either or both of the others.
    internal: bool = False
    audience: Audience = Audience()


def _sms_body(community: str, message: str) -> str:
    """The text as sent: who it is from, the message, and the opt-out line (unless the admin already wrote one)."""
    body = f"{community}: {message.strip()}"
    if "stop" not in message.lower():
        body += OPT_OUT
    return body


@router.post("/admin/blasts/send")
async def send_blast(body: SendIn, me: dict = Depends(require_role("admin"))):
    if body.channel not in ("sms", "email", "both", "none"):
        raise HTTPException(status_code=400, detail="Channel must be sms, email, both or none")
    want_sms, want_email, want_internal = body.channel in ("sms", "both"), body.channel in ("email", "both"), body.internal
    if not (want_sms or want_email or want_internal):
        raise HTTPException(status_code=400, detail="Choose at least one way to send this: text, email or Pathwai Internal.")
    if want_sms and not msg.sms_available():
        raise HTTPException(status_code=400, detail="Text messaging isn't switched on yet. Send by email or in the app for now.")
    if want_email and not msg.email_available():
        raise HTTPException(status_code=400, detail="Email sending isn't switched on yet. Send in the app for now.")
    await rate_limit("blast", me["id"], 30, 3600, "That's a lot of messages for now. Try again in a little while.")

    r = await resolve(body.audience)
    # Total reach across just the channels actually chosen -- Pathwai Internal reaches everyone in
    # the audience regardless of their SMS/email opt-in settings, so a blast can still go out over
    # it even when no one has opted in to text or email.
    reach = (len(r["sms"]) if want_sms else 0) + (len(r["email"]) if want_email else 0) + (len(r["people"]) if want_internal else 0)
    if reach == 0:
        raise HTTPException(status_code=400, detail="No one in this audience can be reached through the channels you chose.")
    if len(r["sms"]) > MAX_RECIPIENTS or len(r["email"]) > MAX_RECIPIENTS or len(r["people"]) > MAX_RECIPIENTS:
        raise HTTPException(status_code=400, detail=f"That audience is over {MAX_RECIPIENTS} people. Narrow it down.")

    community = await _community_name()
    text = _sms_body(community, body.message)
    per_text = msg.segments(text)
    cost = per_text * len(r["sms"]) if want_sms else 0
    if want_sms and r["sms"]:
        if not await msg.spend(cost):
            have = (await msg.account())["sms_credits"]
            raise HTTPException(status_code=400, detail=f"This text needs {cost:,} credits ({len(r['sms']):,} people, {per_text} per text) and you have {have:,}. Shorten it, narrow the audience or ask for more credits.")
    subject = (body.subject or "").strip() or (body.message.strip()[:60] + ("…" if len(body.message.strip()) > 60 else ""))

    sms_sent = sms_failed = email_sent = email_failed = 0
    errors: List[str] = []
    if want_sms:
        async def _one_sms(p):
            await msg.send_sms(p["phone"], text)

        for p, exc in zip(r["sms"], await _fan_out(r["sms"], _one_sms)):
            if exc is None:
                sms_sent += 1
            else:
                sms_failed += 1
                if len(errors) < 6:
                    errors.append(f"Text to {p['name']}: {exc}")
        await msg.refund(sms_failed * per_text)  # people who didn't get one aren't charged
        cost -= sms_failed * per_text
    if want_email:
        async def _one_email(p):
            await msg.send_email(p["email"], p["name"] or "", subject, body.message.strip(), from_name=community, reply_to=me.get("email"), footer=EMAIL_FOOTER)

        for p, exc in zip(r["email"], await _fan_out(r["email"], _one_email)):
            if exc is None:
                email_sent += 1
            else:
                email_failed += 1
                if len(errors) < 6:
                    errors.append(f"Email to {p['name']}: {exc}")

    internal_sent = 0
    if want_internal:
        # No opt-in gate, never fails mid-send the way a text or email can -- it's just a
        # notification row per member, the same mechanism a membership request or a reported
        # message uses to reach someone inside the product.
        for u in r["people"]:
            await notify(u["id"], "blast", subject, body.message.strip(), link="/updates")
        internal_sent = len(r["people"])

    doc = {"id": str(uuid.uuid4()), "message": body.message.strip(), "subject": subject if (want_email or want_internal) else None, "channel": body.channel,
           "internal": want_internal, "internal_sent": internal_sent,
           "audience": body.audience.model_dump(), "sms_sent": sms_sent, "sms_failed": sms_failed, "email_sent": email_sent, "email_failed": email_failed,
           "sms_credits_used": cost if want_sms else 0,
           "skipped": {"sms_no_phone": r["sms_no_phone"], "sms_not_opted_in": r["sms_not_opted_in"], "email_not_opted_in": r["email_not_opted_in"]},
           "errors": errors, "demo": msg.simulated() and (want_sms or want_email),
           "by": me["id"], "by_name": me.get("name"), "at": now_iso()}
    await db.message_blasts.insert_one(dict(doc))
    await audit(me["id"], "blast.sent", "blast", doc["id"], {"channel": body.channel, "internal": want_internal, "sms_sent": sms_sent, "email_sent": email_sent, "internal_sent": internal_sent})
    return {**doc, "sms_credits_left": (await msg.account())["sms_credits"]}


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


STOP_WORDS = ("stop", "stopall", "unsubscribe", "cancel", "end", "quit")
START_WORDS = ("start", "unstop", "yes")  # "yes" only counts for a number that had said STOP


@router.post("/webhooks/twilio")
async def twilio_inbound(request: Request):
    """Twilio calls this when someone replies to Pathwai's number. STOP turns their texts off, START turns them back on.

    The number is shared by every community, so the reply applies everywhere: the phone goes on (or off) a
    platform-wide list, and every member profile with that phone is switched to match."""
    form = {k: str(v) for k, v in (await request.form()).items()}
    if not msg.simulated():
        if not msg.sms_ready():
            raise HTTPException(status_code=400, detail="Text messaging isn't switched on")
        # Twilio signs the exact public URL it called. Behind Railway's proxy this server sees an internal
        # host/scheme, so check the externally visible URL(s) as well as the raw one.
        q = ("?" + request.url.query) if request.url.query else ""
        candidates = {str(request.url), f"{public_base_url(request)}{request.url.path}{q}"}
        sig = request.headers.get("x-twilio-signature", "")
        if not any(msg.verify_twilio_signature(u, form, sig) for u in candidates):
            raise HTTPException(status_code=400, detail="Bad signature")
    word = (form.get("Body") or "").strip().lower()
    phone = to_e164(form.get("From"))
    if phone and word in STOP_WORDS + START_WORDS:
        on = word in START_WORDS
        if on and phone not in await msg.opted_out_phones():
            return {"ok": True}  # a "yes" to some other question must not switch texting back on
        await msg.set_opt_out(phone, stopped=not on)
        for slug in list(COMMUNITY_SLUGS):
            async for u in dbfor(slug).users.find({"$or": [{"contact.phone": {"$exists": True, "$ne": ""}}, {"phone": {"$exists": True, "$ne": ""}}]}):
                if to_e164((u.get("contact") or {}).get("phone") or u.get("phone")) == phone:
                    await dbfor(slug).users.update_one({"id": u["id"]}, {"$set": {"settings.notifications.sms": on}})
    return {"ok": True}
