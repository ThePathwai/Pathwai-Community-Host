"""Google Forms auto-complete.

Admins already send members a Google Form link as a Request (Admin -> Requests -> add a form link).
Without this, the member has to come back and tap "I've completed it". With it, a tiny Google Apps
Script on the form calls us when someone submits, and the matching request is marked complete on its
own. Nothing is read from Google: it needs no Google sign-in, no API key and no Google Cloud project.

The hook URL carries a secret, so only someone who has it can mark requests complete. It is stored per
community and can be replaced (POST /admin/google-forms/reset). The community is pinned with
`?community=<slug>` because Google's servers send no cookies.
"""
from __future__ import annotations

import secrets
from typing import Any, Dict, Optional
from urllib.parse import quote, urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from auth import client_ip, rate_limit, require_role
from database import current_community, db
from ._common import audit, public_base_url

router = APIRouter(tags=["google-forms"])
KEY = "google_forms"


class HookIn(BaseModel):
    email: Optional[str] = Field(default=None, max_length=320)
    form_url: Optional[str] = Field(default=None, max_length=500)


async def _secret(rotate: bool = False) -> str:
    doc = await db.form_hooks.find_one({"_key": KEY})
    if rotate or not doc or not doc.get("secret"):
        s = secrets.token_urlsafe(24)
        await db.form_hooks.update_one({"_key": KEY}, {"$set": {"secret": s}}, upsert=True)
        return s
    return doc["secret"]


def script_for(url: str) -> str:
    return (
        "function onFormSubmit(e) {\n"
        "  var form = FormApp.getActiveForm();\n"
        f"  UrlFetchApp.fetch(\"{url}\", {{\n"
        "    method: \"post\",\n"
        "    contentType: \"application/json\",\n"
        "    muteHttpExceptions: true,\n"
        "    payload: JSON.stringify({\n"
        "      email: e.response.getRespondentEmail(),\n"
        "      form_url: form.getPublishedUrl()\n"
        "    })\n"
        "  });\n"
        "}\n")


async def _setup(request: Request) -> Dict[str, str]:
    url = f"{public_base_url(request)}/api/webhooks/google-forms/{await _secret()}?community={quote(current_community() or '')}"
    return {"webhook_url": url, "script": script_for(url)}


@router.get("/admin/google-forms/setup")
async def setup(request: Request, _: dict = Depends(require_role("admin"))):
    return await _setup(request)


@router.post("/admin/google-forms/reset")
async def reset(request: Request, me: dict = Depends(require_role("admin"))):
    """New secret: the old script stops working until the new one is pasted in."""
    await _secret(rotate=True)
    await audit(me["id"], "google_forms.hook_reset", "community", None)
    return await _setup(request)


def _norm(u: Optional[str]) -> str:
    """Compare form links without query strings, fragments, a trailing slash or /viewform."""
    try:
        p = urlsplit((u or "").strip())
    except ValueError:
        return ""
    path = p.path.rstrip("/")
    if path.endswith("/viewform"):
        path = path[: -len("/viewform")]
    return f"{p.netloc.lower()}{path}"


def _is_google(r: Dict[str, Any]) -> bool:
    url = (r.get("external_url") or "").lower()
    return "docs.google.com/forms" in url or "forms.gle" in url or "google" in (r.get("external_provider") or "").lower()


@router.post("/webhooks/google-forms/{secret}")
async def form_submitted(secret: str, body: HookIn, request: Request):
    await rate_limit("gform_hook", client_ip(request), 300, 3600, "Too many requests.")
    doc = await db.form_hooks.find_one({"_key": KEY})
    if not doc or not doc.get("secret") or not secrets.compare_digest(doc["secret"], secret):
        raise HTTPException(status_code=404, detail="Unknown link")
    email = (body.email or "").strip().lower()
    if not email:
        return {"ok": True, "matched": 0, "reason": "The form didn't collect an email address. Turn on 'Collect email addresses' in the form's settings."}
    u = await db.users.find_one({"email": email})
    if not u:
        return {"ok": True, "matched": 0, "reason": "No member in this community has that email."}
    open_reqs = [r async for r in db.member_requests.find({"user_id": u["id"], "status": {"$in": ["not_started", "in_progress"]}, "external_url": {"$nin": [None, ""]}}).sort("created_at", -1)]
    cands = [r for r in open_reqs if _is_google(r)]
    want = _norm(body.form_url)
    hit = next((r for r in cands if want and _norm(r["external_url"]) == want), None)
    if not hit and len(cands) == 1:
        hit = cands[0]  # one open Google Form for this person: it can only be that one (covers forms.gle short links)
    if not hit:
        return {"ok": True, "matched": 0, "reason": "No open Google Form request for that person." if not cands else "Several open forms and none matched this one."}
    from .portal import _mark_submitted
    await _mark_submitted(hit, {"completed_external_form": True, "external_payload": {"source": "google_forms"}}, {"id": u["id"]}, "google_forms")
    try:
        import realtime
        realtime.publish(current_community(), "requests")  # the member's and the admin's Requests pages update at once
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "matched": 1, "request_id": hit["id"]}
