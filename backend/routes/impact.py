"""Impact, reports and "going quiet" for community admins.

  GET  /admin/impact?days=            the four headline numbers for the admin home
  GET  /community/reliability?days=   the member-facing "how dependable is this community" totals
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
import report_deck
import impact
from auth import get_current_user, require_role
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


async def _report(kind: str, days: int, include: Optional[List[str]] = None) -> dict:
    cfg = await _config()
    d = await impact.load(db)
    offer = None
    if kind == "sponsor":
        offer = (await db.partnership_offer.find_one({"_key": "singleton"}) or {}).get("offer")
        offer = impact.clean_offer(offer) if offer is not None else None
    rep = impact.build_report(impact.compute(d, _days(days)), kind, cfg.get("community_name") or "Community", offer)
    if "instagram" in (include or []) or "tiktok" in (include or []):  # only what the last sync saved: a shared link never makes a live call to Instagram or TikTok
        import instagram
        import tiktok
        ig = await instagram.latest(db) if "instagram" in include else None
        tt = await tiktok.latest(db) if "tiktok" in include else None
        rep = impact.add_social(rep, ig, await instagram.history(db) if ig else None, tt, await tiktok.history(db) if tt else None)
    return rep


def _include(raw: Optional[str]) -> List[str]:
    return [x for x in (raw or "").split(",") if x in ("instagram", "tiktok")]


@router.get("/community/reliability")
async def community_reliability(days: int = Query(90), me: dict = Depends(get_current_user)):
    """Any signed-in member: how dependable this community is (totals only), from the same records as the admin's reports."""
    d = await impact.load(db)
    return impact.reliability_summary(impact.compute(d, _days(days)))


@router.get("/admin/impact")
async def get_impact(days: int = Query(90), me: dict = Depends(require_role("admin"))):
    d = await impact.load(db)
    n = _days(days)
    return impact.impact_summary(impact.compute(d, n), impact.previous(d, n))


@router.get("/admin/report-types")
async def report_types(me: dict = Depends(require_role("admin"))):
    return {"types": [{"kind": k, **v} for k, v in impact.REPORT_TYPES.items()], "periods": [{"days": k, "label": v} for k, v in impact.PERIODS.items()]}


@router.get("/admin/reports/{kind}.pdf")
async def report_pdf(kind: str, days: int = Query(90), include: str = Query(""), me: dict = Depends(require_role("admin"))):
    _check_kind(kind)
    cfg = await _config()
    rep = await _report(kind, days, _include(include))
    rep["headline"] = [{"label": t["label"], "value": t["value"]} for t in rep["sections"][0]["tiles"][:4]]
    pdf = audit_pdf.build_pdf(rep, cfg, None, None, label=rep["title"])
    slug = "".join(ch if ch.isalnum() else "-" for ch in rep["community"].lower()).strip("-") or "community"
    await audit(me["id"], "admin.report_pdf", "report", kind)
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{slug}-{kind}-report-{datetime.utcnow().strftime("%Y-%m-%d")}.pdf"', "Cache-Control": "no-store"})


class OfferIn(BaseModel):
    give: List[dict] = []
    ask: List[dict] = []


@router.get("/admin/partnership-offer")
async def get_offer(me: dict = Depends(require_role("admin"))):
    """What this community offers a brand and asks in return (the cards on the partnership proposal). Starts as sensible text to edit."""
    doc = await db.partnership_offer.find_one({"_key": "singleton"}) or {}
    return {"offer": impact.clean_offer(doc["offer"]) if doc.get("offer") is not None else impact.DEFAULT_OFFER, "custom": doc.get("offer") is not None}


@router.put("/admin/partnership-offer")
async def put_offer(body: OfferIn, me: dict = Depends(require_role("admin"))):
    offer = impact.clean_offer({"give": body.give, "ask": body.ask})
    await db.partnership_offer.update_one({"_key": "singleton"}, {"$set": {"_key": "singleton", "offer": offer, "updated_at": now_iso(), "updated_by": me["id"]}}, upsert=True)
    await audit(me["id"], "admin.partnership_offer", "report", "sponsor")
    return {"offer": offer, "custom": True}


@router.delete("/admin/partnership-offer")
async def reset_offer(me: dict = Depends(require_role("admin"))):
    await db.partnership_offer.delete_one({"_key": "singleton"})
    return {"offer": impact.DEFAULT_OFFER, "custom": False}


async def _saved_hidden(kind: str) -> List[str]:
    doc = await db.deck_selection.find_one({"kind": kind}) or {}
    return report_deck.clean_hidden(doc.get("hidden"))


class DeckSelectionIn(BaseModel):
    hidden: List[str] = []


@router.get("/admin/deck-selection/{kind}")
async def get_deck_selection(kind: str, me: dict = Depends(require_role("admin"))):
    """What this community switched off for the slides of one report type (empty = everything is shown)."""
    _check_kind(kind)
    return {"kind": kind, "hidden": await _saved_hidden(kind)}


@router.put("/admin/deck-selection/{kind}")
async def put_deck_selection(kind: str, body: DeckSelectionIn, me: dict = Depends(require_role("admin"))):
    _check_kind(kind)
    hidden = report_deck.clean_hidden(body.hidden)
    await db.deck_selection.update_one({"kind": kind}, {"$set": {"kind": kind, "hidden": hidden, "updated_at": now_iso(), "updated_by": me["id"]}}, upsert=True)
    await audit(me["id"], "admin.deck_selection", "report", kind, {"hidden": len(hidden)})
    return {"kind": kind, "hidden": hidden}


@router.get("/admin/reports/{kind}/deck.pdf")
async def report_deck_pdf(kind: str, days: int = Query(90), include: str = Query(""), label: str = Query(""), me: dict = Depends(require_role("admin"))):
    """The same report as a widescreen slide deck in the community's own colours, logo, photos and story."""
    _check_kind(kind)
    cfg = await _config()
    rep = await _report(kind, days, _include(include))
    rep = report_deck.apply_selection(rep, await _saved_hidden(kind))
    if label.strip():
        rep["label"] = label.strip()[:80]
    pdf = report_deck.build_deck(rep, cfg)
    slug = "".join(ch if ch.isalnum() else "-" for ch in rep["community"].lower()).strip("-") or "community"
    await audit(me["id"], "admin.report_deck", "report", kind)
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{slug}-{kind}-slides-{datetime.utcnow().strftime("%Y-%m-%d")}.pdf"', "Cache-Control": "no-store"})


@router.get("/admin/reports/{kind}")
async def report_json(kind: str, days: int = Query(90), include: str = Query(""), me: dict = Depends(require_role("admin"))):
    _check_kind(kind)
    return await _report(kind, days, _include(include))


# ---------- read-only live links ----------
class ShareIn(BaseModel):
    kind: str
    days: int = 90
    label: Optional[str] = None
    include: List[str] = []


def _share_view(s: dict) -> dict:
    return {k: s.get(k) for k in ("id", "token", "kind", "days", "label", "include", "created_at", "views", "last_viewed_at", "revoked")}


@router.get("/admin/report-shares")
async def list_shares(me: dict = Depends(require_role("admin"))):
    rows = [_share_view(s) async for s in db.report_shares.find({"revoked": {"$ne": True}}).sort("created_at", -1)]
    return {"shares": rows}


@router.post("/admin/report-shares", status_code=201)
async def create_share(body: ShareIn, me: dict = Depends(require_role("admin"))):
    _check_kind(body.kind)
    doc = {"id": str(uuid.uuid4()), "token": secrets.token_urlsafe(24), "kind": body.kind, "days": _days(body.days),
           "label": (body.label or "").strip()[:80] or None, "include": _include(",".join(body.include)), "created_by": me["id"], "created_at": now_iso(), "views": 0, "revoked": False}
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
    rep = await _report(s["kind"], s.get("days") or 90, s.get("include") or [])
    cfg = await _config()
    # the community's own look, so the shared page and its slides come out in its colours, logo and photos (a support email is left out:
    # a shared link carries totals and public branding only, never an address)
    brand = {k: v for k, v in (cfg.get("brand") or {}).items() if k != "support_email"}
    brand["accent"] = (brand.get("colors") or {}).get("accent") or (cfg.get("theme") or {}).get("accent")
    photos = [p for p in (cfg.get("gallery_photos") or []) if isinstance(p, str)][:2]
    if len(photos) < 2 and isinstance(cfg.get("dashboard_cover_url"), str) and cfg["dashboard_cover_url"] not in photos:
        photos.append(cfg["dashboard_cover_url"])
    return {**rep, "label": s.get("label"), "read_only": True, "live": True, "brand": brand,
            "photos": photos, "about": (cfg.get("about") or "")[:400], "about_url": cfg.get("about_url") or ""}


# ---------- Instagram status (for the Reports page) ----------
@router.get("/admin/instagram")
async def instagram_status(me: dict = Depends(require_role("admin"))):
    import instagram
    d = await db.integrations.find_one({"provider": "instagram"}) or {}
    snap = await instagram.latest(db)
    return {"connected": bool(d.get("enabled") and d.get("credentials")), "has_data": bool(snap), "fetched_at": (snap or {}).get("fetched_at"),
            "handle": ((snap or {}).get("account") or {}).get("username"), "followers": ((snap or {}).get("account") or {}).get("followers"), "sample": bool((snap or {}).get("sample"))}


@router.get("/admin/tiktok")
async def tiktok_status(me: dict = Depends(require_role("admin"))):
    import tiktok
    d = await db.integrations.find_one({"provider": "tiktok"}) or {}
    snap = await tiktok.latest(db)
    return {"connected": bool(d.get("enabled") and d.get("credentials")), "has_data": bool(snap), "fetched_at": (snap or {}).get("fetched_at"),
            "handle": ((snap or {}).get("account") or {}).get("username"), "followers": ((snap or {}).get("account") or {}).get("followers"), "sample": bool((snap or {}).get("sample"))}


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
