"""Bulk-add members from a CSV file (Admin -> Members -> Import members).

What it does
  * Every usable row becomes an approved member of THIS community, even when most of the profile is
    blank. Nothing is required: a missing name is taken from the email ("jane.doe@x.com" -> "Jane Doe"),
    and a row with no email still becomes a directory profile (it just can't sign in until an email is
    added -- it gets a placeholder address, flagged `email_missing`).
  * Duplicates (same email twice in the file, or already a member here) are skipped, never overwritten.
  * Nobody gets a password. People claim their account with a "set your password" link (7 days). The
    link is emailed when email sending is configured and the admin ticks the box, and is always handed
    back to the admin so it can be shared another way (WhatsApp, their own email) -- email sending
    isn't required for the import to be useful.
  * `dry_run=true` runs the whole thing without writing, so the admin can see what will happen first.

Why not let people claim an imported profile by signing up with that email? Pathwai doesn't verify
emails at signup, so anyone could claim a pre-approved member's profile. The reset link proves the
person controls the inbox.
"""
from __future__ import annotations

import asyncio
import csv
import io
import logging
import os
import re
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

import emailer
from auth import create_reset_token, rate_limit, require_role
from database import COMMUNITY_SLUGS, current_community, db, dbfor, hub_db
from birthday import BirthdayError, age_from, clean_birthday
from directory import record_membership
from ._common import audit, now_iso, return_base_url

logger = logging.getLogger(__name__)
router = APIRouter(tags=["member-import"])

MAX_ROWS = 1000
MAX_CHARS = 1_500_000
LINK_DAYS = 7
PLACEHOLDER_DOMAIN = "no-email.invalid"
EMAIL_RE = re.compile(r"^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]{2,}$")

# header (lower-cased, punctuation stripped) -> field. Anything not listed is ignored and reported.
ALIASES: Dict[str, List[str]] = {
    "name": ["name", "full name", "fullname", "member", "member name", "display name", "contact name", "contact"],
    "first_name": ["first name", "firstname", "first", "given name", "forename"],
    "last_name": ["last name", "lastname", "last", "surname", "family name"],
    "email": ["email", "e mail", "email address", "emailaddress", "mail", "primary email", "work email"],
    "phone": ["phone", "phone number", "mobile", "mobile number", "cell", "cell phone", "telephone", "tel", "whatsapp"],
    "title": ["title", "job title", "role", "position", "headline", "occupation", "profession"],
    "company": ["company", "organization", "organisation", "org", "employer", "business", "business name", "startup"],
    "location": ["location", "city", "city province", "city state", "region", "address", "town", "country"],
    "bio": ["bio", "about", "about me", "description", "summary", "notes", "introduction"],
    "tagline": ["tagline", "one liner", "slogan"],
    "birthday": ["birthday", "birth day", "birthdate", "birth date", "date of birth", "dob", "born", "bday", "b day"],
    "linkedin": ["linkedin", "linkedin url", "linkedin profile", "linked in"],
    "instagram": ["instagram", "instagram handle", "ig", "insta"],
    "website": ["website", "web site", "url", "site", "portfolio", "link"],
    "skills": ["skills", "skill set", "expertise", "strengths", "services", "services offered", "can help with"],
    "interests": ["interests", "hobbies", "interests hobbies", "interests and hobbies"],
    "goals": ["goals", "looking for", "seeking", "needs", "support needs", "wants"],
}
_LOOKUP = {a: field for field, names in ALIASES.items() for a in names}
TEMPLATE_HEADER = ["name", "email", "phone", "birthday", "title", "company", "location", "bio", "linkedin", "instagram", "website", "skills", "interests", "goals"]


def _norm_header(h: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", (h or "").lower().replace("﻿", ""))).strip()


def _split_list(v: str) -> List[str]:
    out, seen = [], set()
    for part in re.split(r"[;|,\n]+", v or ""):
        t = part.strip()
        if t and t.lower() not in seen:
            seen.add(t.lower())
            out.append(t[:60])
    return out[:12]


def _name_from_email(email: str) -> str:
    local = email.split("@")[0]
    local = re.sub(r"\+.*$", "", local)
    words = [w for w in re.split(r"[._\-\d]+", local) if w]
    return " ".join(w.capitalize() for w in words)[:120]


def parse_csv(text: str):
    """-> (rows, headers_used, headers_ignored). Each row: dict of canonical field -> cleaned string,
    plus `_line` (the row's line number in the file, header = 1)."""
    text = (text or "").replace("﻿", "")
    if not text.strip():
        raise HTTPException(status_code=400, detail="That file is empty.")
    if len(text) > MAX_CHARS:
        raise HTTPException(status_code=413, detail="That file is too big. Split it into files of up to 1,000 people.")
    sample = text[:4000]
    try:
        delim = csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
    except csv.Error:
        delim = ","
    reader = csv.reader(io.StringIO(text), delimiter=delim)
    try:
        header = next(reader)
    except StopIteration:
        raise HTTPException(status_code=400, detail="That file is empty.")
    fields: List[Optional[str]] = []
    used, ignored = [], []
    for h in header:
        f = _LOOKUP.get(_norm_header(h))
        fields.append(f)
        if f:
            used.append(h.strip())
        elif h.strip():
            ignored.append(h.strip())
    # No recognisable header at all? The file may have been exported without one: treat a first row that
    # holds an email as data and assume the order name, email.
    headerless = not any(fields) and any(EMAIL_RE.match((c or "").strip()) for c in header)
    rows: List[Dict[str, Any]] = []
    if headerless:
        fields = ["name", "email"] + [None] * max(0, len(header) - 2)
        used, ignored = ["(column 1)", "(column 2)"], []
        reader = csv.reader(io.StringIO(text), delimiter=delim)
    elif not any(fields):
        raise HTTPException(status_code=400, detail="I couldn't find a name or email column. Add a header row such as: name, email (use the template as a guide).")
    for i, raw in enumerate(reader, start=1 if headerless else 2):
        if not any((c or "").strip() for c in raw):
            continue
        row: Dict[str, Any] = {"_line": i}
        for f, cell in zip(fields, raw):
            if f and (cell or "").strip():
                row[f] = row.get(f) or cell.strip()  # if two columns map to one field, the first filled one wins
        rows.append(row)
        if len(rows) > MAX_ROWS:
            raise HTTPException(status_code=413, detail=f"That file has more than {MAX_ROWS:,} people. Split it into smaller files.")
    return rows, used, ignored


def _clean_url(v: str) -> str:
    v = (v or "").strip()[:200]
    return v


def _handle(v: str) -> str:
    return (v or "").strip()[:80]


def build_profile(row: Dict[str, Any]):
    """-> (name, email_or_None, doc_fields, notes). Never raises: whatever is missing is simply blank."""
    notes: List[str] = []
    email = (row.get("email") or "").strip().lower()
    # people sometimes paste "Jane <jane@x.com>" or several addresses: keep the first usable one
    if email and not EMAIL_RE.match(email):
        m = re.search(r"[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]{2,}", email)
        if m:
            email = m.group(0)
        else:
            notes.append(f"“{row.get('email')[:40]}” isn't a valid email, so this profile was added without one")
            email = ""
    name = (row.get("name") or " ".join(x for x in (row.get("first_name"), row.get("last_name")) if x)).strip()
    if not name and email:
        name = _name_from_email(email)
        if name:
            notes.append("no name given, so one was made from the email")
    if not name:
        name = "Unnamed member"
        notes.append("no name given")
    if not email:
        if "no email" not in " ".join(notes) and "valid email" not in " ".join(notes):
            notes.append("no email: they can't sign in until you add one")
    phone = (row.get("phone") or "")[:40]
    contact = {"phone": phone, "linkedin": _clean_url(row.get("linkedin", "")), "instagram": _handle(row.get("instagram", "")), "website": _clean_url(row.get("website", ""))}
    birthday = None
    if (row.get("birthday") or "").strip():
        try:
            birthday = clean_birthday(row.get("birthday"))
        except BirthdayError as e:
            notes.append(f"birthday “{row.get('birthday')[:30]}” skipped: {e}")
    fields = {
        "birthday": birthday, "age": age_from(birthday),
        "title": (row.get("title") or "")[:120], "company": (row.get("company") or "")[:120], "location": (row.get("location") or "")[:120],
        "bio": (row.get("bio") or "")[:1000], "tagline": (row.get("tagline") or "")[:160],
        "skill_set": _split_list(row.get("skills", "")), "interests_hobbies": _split_list(row.get("interests", "")), "goals": _split_list(row.get("goals", "")),
        "contact": contact,
    }
    return name[:120], (email or None), fields, notes


class ImportIn(BaseModel):
    csv: str = Field(min_length=1)
    dry_run: bool = True
    send_invites: bool = False
    # The admin confirms these people agreed to be added and to Pathwai's Terms (we can't tick that for them).
    confirm_permission: bool = False


@router.get("/admin/members/import/template")
async def template(_: dict = Depends(require_role("admin"))):
    sample = [
        ["Ada Okafor", "ada@example.com", "+1 416 555 0101", "1990-04-23", "Founder", "Okafor Labs", "Toronto", "Building tools for small shops", "https://linkedin.com/in/ada", "@ada", "https://okaforlabs.com", "Product; Fundraising", "Running; Jazz", "Find a CTO"],
        ["Marcus Bell", "marcus@example.com", "", "", "", "", "Mississauga", "", "", "", "", "", "", ""],
        ["", "sam.lee@example.com", "", "", "", "", "", "", "", "", "", "", "", ""],
        ["Priya N.", "", "", "", "Designer", "", "", "", "", "", "", "", "", ""],
    ]
    return {"header": TEMPLATE_HEADER, "rows": sample, "tip": "Only one of name or email is needed. Leave anything you don't have blank."}


async def _existing_emails() -> set:
    return {u["email"] async for u in db.users.find({"email": {"$exists": True}}, {"email": 1}) if u.get("email")}


async def _known_password(email: str) -> Optional[str]:
    """The password hash this email already uses elsewhere on Pathwai, if any (cheap lookups only: the
    platform account, then the cross-community directory index -- never a scan of every community)."""
    acc = await hub_db().accounts.find_one({"email": email}, {"password_hash": 1})
    if acc and acc.get("password_hash"):
        return acc["password_hash"]
    async for hit in hub_db().member_directory.find({"email": email}):
        other = await dbfor(hit["slug"]).users.find_one({"email": email}, {"password_hash": 1}) if hit.get("slug") in COMMUNITY_SLUGS else None
        if other and other.get("password_hash"):
            return other["password_hash"]
    return None


def _placeholder(uid: str) -> str:
    return f"member-{uid[:8]}@{PLACEHOLDER_DOMAIN}"


@router.post("/admin/members/import")
async def import_members(body: ImportIn, request: Request, me: dict = Depends(require_role("admin"))):
    await rate_limit("member_import", me["id"], 30, 3600, "That's a lot of imports for now. Try again in a little while.")
    if not body.dry_run and not body.confirm_permission:
        raise HTTPException(status_code=400, detail="Please confirm you have these people's permission to add them.")
    rows, used, ignored = parse_csv(body.csv)
    if not rows:
        raise HTTPException(status_code=400, detail="I couldn't find any people in that file (only a header row).")

    have = await _existing_emails()
    seen: set = set()
    base = return_base_url(request)
    results: List[Dict[str, Any]] = []
    to_insert: List[Dict[str, Any]] = []
    stamp = now_iso()

    for row in rows:
        name, email, fields, notes = build_profile(row)
        res: Dict[str, Any] = {"line": row["_line"], "name": name, "email": email or "", "notes": notes}
        if email and email in have:
            res.update(status="skipped", reason="already a member here")
            results.append(res); continue
        if email and email in seen:
            res.update(status="skipped", reason="appears twice in this file")
            results.append(res); continue
        if not email and name == "Unnamed member" and not any(fields[k] for k in ("title", "company", "location", "bio", "tagline", "skill_set", "interests_hobbies", "goals")) and not fields["contact"]["phone"]:
            res.update(status="skipped", reason="nothing usable in this row")
            results.append(res); continue
        if email:
            seen.add(email)
        uid = str(uuid.uuid4())
        # Someone who already has a Pathwai login (a platform account, or a member of another community)
        # keeps it: the password carries over, so they just sign in. Everyone else gets a set-password link.
        pw = await _known_password(email) if email else None
        res.update(status="created" if not body.dry_run else "will_create", has_login=bool(pw), id=uid)
        contact = dict(fields["contact"])
        if email:
            contact["email"] = email
        doc = {
            "id": uid, "name": name, "email": email or _placeholder(uid), "password_hash": pw, "role": "member", "member_type": "founder",
            "tagline": fields["tagline"], "bio": fields["bio"], "title": fields["title"], "company": fields["company"], "location": fields["location"],
            "age": fields["age"], "birthday": fields["birthday"], "avatar_url": "", "cover_url": "", "expertise": [], "skill_set": fields["skill_set"], "focus_areas": [], "open_to": [],
            "services_offered": [], "topics_can_advise_on": [], "interests_hobbies": fields["interests_hobbies"], "goals": fields["goals"],
            "support_needs": [], "needs_seeking": [], "custom_fields": {}, "contact": contact, "contact_visibility": "members",
            "hidden_from_directory": False, "membership_status": "approved", "membership_decided_at": stamp, "membership_decided_by_name": me.get("name"),
            "signup_source": "csv_import", "imported_at": stamp, "imported_by": me["id"], "created_at": stamp, "updated_at": stamp,
        }
        if not email:
            doc["email_missing"] = True
        res["_doc"] = doc
        results.append(res)
        to_insert.append(doc)

    emailed = 0
    email_ready = bool(os.environ.get("SENDGRID_API_KEY"))
    if not body.dry_run and to_insert:
        await db.users.insert_many([dict(d) for d in to_insert])
        slug = current_community()
        for d in to_insert:
            if not d.get("email_missing"):
                await record_membership(slug, d["email"], d["id"])
        community = ((await db.community_config.find_one({"_key": "singleton"})) or {}).get("community_name") or "your community"
        sem = asyncio.Semaphore(5)

        async def _invite(r: Dict[str, Any]) -> None:
            nonlocal emailed
            link = f"{base}/reset-password?token={create_reset_token(r['email'], days=LINK_DAYS)}"
            r["link"] = link
            if not body.send_invites or not email_ready:
                return
            text = (f"Hi {r['name']},\n\nYou've been added to {community} on Pathwai. Set your password to sign in (this link works for {LINK_DAYS} days):\n\n{link}\n\n"
                    f"By signing in you agree to the Terms and Privacy Policy at {base}/terms and {base}/privacy.\n\nIf you weren't expecting this, you can ignore this email.")
            async with sem:
                try:
                    await emailer.send_email(r["email"], f"You've been added to {community}", text)
                    r["emailed"] = True
                    emailed += 1
                except Exception as exc:  # noqa: BLE001
                    r["emailed"] = False
                    r["notes"].append("the invitation email failed to send")
                    logger.warning("import invite email failed for %s: %s", r["email"], exc)

        await asyncio.gather(*[_invite(r) for r in results if r["status"] == "created" and r["email"] and not r.get("has_login")])
        await audit(me["id"], "admin.members_imported", "community", None, {
            "created": len(to_insert), "skipped": sum(1 for r in results if r["status"] == "skipped"), "invites_emailed": emailed,
            "without_email": sum(1 for d in to_insert if d.get("email_missing"))})

    for r in results:
        r.pop("_doc", None)
    created = sum(1 for r in results if r["status"] in ("created", "will_create"))
    return {
        "dry_run": body.dry_run, "total": len(results), "created": created, "skipped": sum(1 for r in results if r["status"] == "skipped"),
        "without_email": sum(1 for r in results if r["status"] in ("created", "will_create") and not r["email"]),
        "already_have_login": sum(1 for r in results if r.get("has_login") and r["status"] in ("created", "will_create")),
        "with_notes": sum(1 for r in results if r["notes"] and r["status"] != "skipped"),
        "columns_used": used, "columns_ignored": ignored,
        "emailed": emailed, "email_configured": email_ready, "link_days": LINK_DAYS,
        "rows": results,
    }
