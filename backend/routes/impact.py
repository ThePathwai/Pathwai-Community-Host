"""Impact, reports and "going quiet" for community admins.

  GET  /admin/impact?days=            the four headline numbers for the admin home
  GET  /admin/reports/{type}?days=    a sponsor / funder / board report as data
  GET  /admin/reports/{type}.pdf      the same report as a PDF
  GET/POST/DELETE /admin/report-shares   read-only live links to share instead of a PDF
  GET  /public/report/{token}         what a shared link shows (no login; totals only, never names)
  GET  /admin/quiet, POST /admin/quiet/nudge   members who have gone quiet, and a one-tap nudge
"""
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel

import audit_pdf
import impact
from auth import require_role
from database import db
from ._common import audit, now_iso
from .notifications import notify

router = APIRouter(tags=["impact"])


async def _config() -> dict:
    from .community_config import get_config
    return await get_config()


def _days(days: int) -> int:
    return days if days in impact.PERIODS else 90


def _check_kind(kind: str) -> None:
    if kind not in impact.REPORT_TYPES:
        raise HTTPException(status_code=400, detail="Unknown report type")


async def _report(kind: str, days: int) -> dict:
    cfg = await _config()
    d = await impact.load(db)
    return impact.build_report(impact.compute(d, _days(days)), kind, cfg.get("community_name") or "Community")


@router.get("/admin/impact")
async def get_impact(days: int = Query(90), me: dict = Depends(require_role("admin"))):
    d = await impact.load(db)
    return impact.impact_summary(impact.compute(d, _days(days)))


@router.get("/admin/report-types")
async def report_types(me: dict = Depends(require_role("admin"))):
    return {"types": [{"kind": k, **v} for k, v in impact.REPORT_TYPES.items()], "periods": [{"days": k, "label": v} for k, v in impact.PERIODS.items()]}


@router.get("/admin/reports/{kind}.pdf")
async def report_pdf(kind: str, days: int = Query(90), me: dict = Depends(require_role("admin"))):
    _check_kind(kind)
    cfg = await _config()
    rep = await _report(kind, days)
    rep["headline"] = [{"label": t["label"], "value": t["value"]} for t in rep["sections"][0]["tiles"][:4]]
    pdf = audit_pdf.build_pdf(rep, cfg, None, None, label=rep["title"])
    slug = "".join(ch if ch.isalnum() else "-" for ch in rep["community"].lower()).strip("-") or "community"
    await audit(me["id"], "admin.report_pdf", "report", kind)
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{slug}-{kind}-report-{datetime.utcnow().strftime("%Y-%m-%d")}.pdf"', "Cache-Control": "no-store"})


@router.get("/admin/reports/{kind}")
async def report_json(kind: str, days: int = Query(90), me: dict = Depends(require_role("admin"))):
    _check_kind(kind)
    return await _report(kind, days)


# ---------- read-only live links ----------
class ShareIn(BaseModel):
    kind: str
    days: int = 90
    label: Optional[str] = None


def _share_view(s: dict) -> dict:
    return {k: s.get(k) for k in ("id", "token", "kind", "days", "label", "created_at", "views", "last_viewed_at", "revoked")}


@router.get("/admin/report-shares")
async def list_shares(me: dict = Depends(require_role("admin"))):
    rows = [_share_view(s) async for s in db.report_shares.find({"revoked": {"$ne": True}}).sort("created_at", -1)]
    return {"shares": rows}


@router.post("/admin/report-shares", status_code=201)
async def create_share(body: ShareIn, me: dict = Depends(require_role("admin"))):
    _check_kind(body.kind)
    doc = {"id": str(uuid.uuid4()), "token": secrets.token_urlsafe(24), "kind": body.kind, "days": _days(body.days),
           "label": (body.label or "").strip()[:80] or None, "created_by": me["id"], "created_at": now_iso(), "views": 0, "revoked": False}
    await db.report_shares.insert_one(dict(doc))
    await audit(me["id"], "admin.report_share_created", "report", body.kind, {"share_id": doc["id"]})
    return _share_view(doc)


@router.delete("/admin/report-shares/{share_id}")
async def revoke_share(share_id: str, me: dict = Depends(require_role("admin"))):
    r = await db.report_shares.update_one({"id": share_id}, {"$set": {"revoked": True, "revoked_at": now_iso()}})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Link not found")
    await audit(me["id"], "admin.report_share_revoked", "report", share_id)
    return {"ok": True}


@router.get("/public/report/{token}")
async def public_report(token: str):
    s = await db.report_shares.find_one({"token": token, "revoked": {"$ne": True}})
    if not s:
        raise HTTPException(status_code=404, detail="This link is no longer active.")
    await db.report_shares.update_one({"id": s["id"]}, {"$inc": {"views": 1}, "$set": {"last_viewed_at": now_iso()}})
    rep = await _report(s["kind"], s.get("days") or 90)
    cfg = await _config()
    brand = cfg.get("brand") or {}
    return {**rep, "label": s.get("label"), "read_only": True, "live": True,
            "brand": {"accent": (brand.get("colors") or {}).get("accent") or (cfg.get("theme") or {}).get("accent"), "logo_url": brand.get("logo_url")}}


# ---------- going quiet ----------
class NudgeIn(BaseModel):
    user_ids: List[str]
    message: Optional[str] = None


@router.get("/admin/quiet")
async def quiet(days: int = Query(impact.ACTIVE_DAYS, ge=7, le=180), me: dict = Depends(require_role("admin"))):
    d = await impact.load(db)
    rows = impact.quiet_list(d, days)
    m = impact.compute(d, 90)
    return {"members": rows[:60], "total": len(rows), "days": days, "nudged_30d": m["nudged"], "came_back_30d": m["came_back"]}


@router.post("/admin/quiet/nudge")
async def nudge(body: NudgeIn, me: dict = Depends(require_role("admin"))):
    ids = list(dict.fromkeys(body.user_ids))[:100]
    if not ids:
        raise HTTPException(status_code=400, detail="Pick at least one person")
    cfg = await _config()
    community = cfg.get("community_name") or "the community"
    now = datetime.now(timezone.utc)
    nxt = None
    async for e in db.events.find({"starts_at": {"$gt": now.isoformat()}}).sort("starts_at", 1).limit(1):
        nxt = e
    note = (body.message or "").strip()[:400]
    sent, skipped = 0, []
    for uid in ids:
        u = await db.users.find_one({"id": uid})
        if not u or u.get("role") == "admin":
            continue
        recent = await db.nudges.find_one({"user_id": uid, "at": {"$gte": (now - timedelta(days=impact.NUDGE_COOLDOWN_DAYS)).isoformat()}})
        if recent:
            skipped.append(uid)
            continue
        first = (u.get("name") or "").split(" ")[0]
        text = note or (f"{nxt.get('title')} is coming up. We'd love to see you there." if nxt else "Have a look at what's new, and say hello to someone.")
        await notify(uid, "nudge", f"{first + ', we' if first else 'We'}'ve missed you at {community}", text, link=f"/events/{nxt['id']}" if (nxt and not note) else "/")
        await db.nudges.insert_one({"id": str(uuid.uuid4()), "user_id": uid, "by": me["id"], "at": now.isoformat(), "message": text})
        sent += 1
    if sent:
        await audit(me["id"], "admin.nudge", "user", None, {"sent": sent})
    return {"ok": True, "sent": sent, "skipped": len(skipped), "skipped_ids": skipped}
