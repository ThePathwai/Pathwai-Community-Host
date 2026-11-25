"""The admin suite: simple, real numbers about who visits Pathwai and who has an account.

Visits are counted by a tiny beacon the site sends when a page opens (POST /hub/track). It stores the page, the day, whether the person was signed in and
an anonymous code that changes every day (it cannot be turned back into a person, and there is no cookie). Account numbers come straight from the
accounts themselves, so when someone deletes their account it leaves this list too. The only thing kept is an anonymous count (the audit log keeps
opaque ids, never emails), so "how many have signed up" stays honest. Exporting before a deletion is the way to keep a copy.

Everything here except the beacon is for platform admins only.
"""
from __future__ import annotations

import csv
import hashlib
import io
import re
import time
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from auth import JWT_SECRET, client_ip
from database import hub_db
from navigator import NEED_LABEL, TYPE_LABEL
from ._common import audit_platform
from .hub import account_from_request, is_platform_admin, require_account

router = APIRouter(tags=["admin-suite"])

TZ = ZoneInfo("America/Toronto")  # days are Toronto days, because that is where the team and the pilots are
KEEP_DAYS = 400
_seen_active: Dict[str, float] = {}
_hits: Dict[str, List[float]] = defaultdict(list)


def _need_admin(acc: dict) -> None:
    if not is_platform_admin(acc.get("email")):
        raise HTTPException(status_code=403, detail="Platform admins only.")


def _day(dt: datetime) -> str:
    return dt.astimezone(TZ).date().isoformat()


def clean_path(raw: str) -> str:
    """Page only: no query, no ids. /people/abc123 becomes /people/:id so the list stays short and holds nothing personal."""
    p = (urlparse(raw or "/").path or "/")[:120]
    p = re.sub(r"/+", "/", p)
    if not p.startswith("/"):
        p = "/" + p
    p = p.rstrip("/") or "/"
    parts = p.split("/")
    for i, seg in enumerate(parts):
        if i >= 2 and seg:
            parts[i] = ":id"
    return "/".join(parts)[:80]


def _ref_host(raw: str, own: str) -> str:
    try:
        h = (urlparse(raw or "").hostname or "").lower().removeprefix("www.")
    except ValueError:
        return ""
    return "" if not h or h == own else h[:60]


class TrackIn(BaseModel):
    path: str = Field(default="/", max_length=300)
    ref: str = Field(default="", max_length=300)


@router.post("/hub/track", status_code=204)
async def track(body: TrackIn, request: Request):
    """Count one page view. Open to everyone, never fails the page, and ignores platform admins so your own clicks do not count."""
    ip = client_ip(request)
    now = time.time()
    hits = [t for t in _hits[ip] if now - t < 60]
    if len(hits) >= 60:
        _hits[ip] = hits
        return Response(status_code=204)
    hits.append(now)
    _hits[ip] = hits
    if len(_hits) > 20000:
        _hits.clear()
    try:
        acc = await account_from_request(request)
        if acc and is_platform_admin(acc.get("email")):
            return Response(status_code=204)
        path = clean_path(body.path)
        if path.startswith("/admin") or path.startswith("/api"):
            return Response(status_code=204)
        stamp = datetime.now(timezone.utc)
        day = _day(stamp)
        ua = (request.headers.get("user-agent") or "")[:200]
        visitor = hashlib.sha256(f"{JWT_SECRET}|{day}|{ip}|{ua}".encode()).hexdigest()[:16]
        own = (request.headers.get("host") or "").split(":")[0].lower().removeprefix("www.")
        await hub_db().web_events.insert_one({"ts": stamp, "day": day, "path": path, "visitor": visitor, "signed_in": bool(acc),
                                              "ref": _ref_host(body.ref, own)})
        if acc and acc.get("id") and now - _seen_active.get(acc["id"], 0) > 900:
            _seen_active[acc["id"]] = now
            await hub_db().accounts.update_one({"id": acc["id"]}, {"$set": {"last_active_at": stamp.isoformat()}})
        if len(_seen_active) > 50000:
            _seen_active.clear()
        if int(now) % 200 == 0:  # housekeeping: nothing older than KEEP_DAYS is useful
            await hub_db().web_events.delete_many({"ts": {"$lt": stamp - timedelta(days=KEEP_DAYS)}})
    except Exception:  # noqa: BLE001 -- counting visits must never break a page
        pass
    return Response(status_code=204)


def _parse(s: Any) -> Optional[datetime]:
    if isinstance(s, datetime):
        return s if s.tzinfo else s.replace(tzinfo=timezone.utc)
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


async def _real_accounts() -> List[dict]:
    rows = []
    async for a in hub_db().accounts.find({}, {"_id": 0, "password_hash": 0, "sessions_valid_after": 0, "oauth_sub": 0}):
        if not is_platform_admin(a.get("email")):
            rows.append(a)
    return rows


def _stage(a: dict) -> str:
    return str((a.get("startup") or {}).get("stage") or "")


def _saved(a: dict) -> Dict[str, dict]:
    """Programs this person has saved to their shortlist ("yes") or marked as one they are in or have done, one entry per program."""
    out: Dict[str, dict] = {}
    for i in (a.get("interest") or []) + (a.get("tracked") or []):
        if isinstance(i, dict) and i.get("id") and i.get("state") != "no":
            out.setdefault(i["id"], i)
    return out


def _demand(accounts: List[dict]) -> Dict[str, Any]:
    """What founders are asking for: the needs they chose on their profile, and the programs they actually saved."""
    needs: Counter = Counter()
    asked = 0
    progs: Dict[str, dict] = {}
    for a in accounts:
        chosen = [n for n in ((a.get("startup") or {}).get("needs") or []) if n in NEED_LABEL]
        if chosen:
            asked += 1
            needs.update(set(chosen))
        for pid, i in _saved(a).items():
            row = progs.setdefault(pid, {"name": i.get("name") or pid, "org": i.get("org") or "", "type": i.get("type") or "", "saves": 0})
            row["saves"] += 1
    kinds: Counter = Counter()
    for r in progs.values():
        if r["type"]:
            kinds[r["type"]] += r["saves"]
    top = sorted(progs.values(), key=lambda r: (-r["saves"], r["name"]))[:8]
    return {
        "founders_with_needs": asked,
        "needs": [{"need": k, "label": NEED_LABEL[k][0].upper() + NEED_LABEL[k][1:], "count": c, "share": round(c / asked, 3) if asked else 0} for k, c in needs.most_common()],
        "programs": top,
        "types": [{"type": k, "label": TYPE_LABEL.get(k, k), "saves": c} for k, c in kinds.most_common(6)],
    }


def _row(a: dict) -> Dict[str, Any]:
    st = a.get("startup") or {}
    return {
        "id": a.get("id"), "name": a.get("name") or "", "email": a.get("email") or "",
        "signed_up": (_parse(a.get("created_at")) or datetime.now(timezone.utc)).astimezone(TZ).date().isoformat() if a.get("created_at") else "",
        "last_active": (_parse(a.get("last_active_at")) or datetime.now(timezone.utc)).astimezone(TZ).date().isoformat() if a.get("last_active_at") else "",
        "startup": st.get("name") or "", "stage": _stage(a), "province": st.get("province") or "",
        "profile_done": bool(a.get("profile_completed")), "tracked": len(_saved(a)), "plan_items": len(a.get("journey") or []),
    }


@router.get("/hub/admin/overview")
async def overview(days: int = Query(30, ge=7, le=90), acc: dict = Depends(require_account)):
    """Visits and account numbers for the last `days` days (Toronto days), plus the pilot funnel. Platform admins only."""
    _need_admin(acc)
    now = datetime.now(timezone.utc)
    today = now.astimezone(TZ).date()
    span = [(today - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]
    first = span[0]

    visitors: Dict[str, set] = defaultdict(set)
    views: Counter = Counter()
    pages: Counter = Counter()
    refs: Counter = Counter()
    signed = 0
    async for e in hub_db().web_events.find({"day": {"$gte": first}}, {"_id": 0}):
        views[e["day"]] += 1
        visitors[e["day"]].add(e["visitor"])
        pages[e["path"]] += 1
        signed += 1 if e.get("signed_in") else 0
        if e.get("ref"):
            refs[e["ref"]] += 1
    total_views = sum(views.values())

    accounts = await _real_accounts()
    signups: Counter = Counter()
    for a in accounts:
        d = _parse(a.get("created_at"))
        if d:
            signups[_day(d)] += 1
    week, month = now - timedelta(days=7), now - timedelta(days=30)

    def active_since(t):
        return sum(1 for a in accounts if (_parse(a.get("last_active_at")) or datetime.min.replace(tzinfo=timezone.utc)) >= t)

    log = hub_db().audit_log
    signed_up_ever = await log.count_documents({"action": "auth.signup"})
    gone_ever = await log.count_documents({"action": {"$in": ["account.deleted", "account.deleted_by_admin"]}})
    gone_range = await log.count_documents({"action": {"$in": ["account.deleted", "account.deleted_by_admin"]},
                                            "created_at": {"$gte": datetime.fromisoformat(first).replace(tzinfo=TZ).astimezone(timezone.utc)}})
    n = len(accounts)
    funnel = [
        ("Signed up", n),
        ("Finished their profile", sum(1 for a in accounts if a.get("profile_completed"))),
        ("Told us their stage", sum(1 for a in accounts if _stage(a))),
        ("Saved a program", sum(1 for a in accounts if _saved(a))),
        ("Built a plan", sum(1 for a in accounts if a.get("journey"))),
        ("Came back this week", active_since(week)),
    ]
    return {
        "days": days, "timezone": "America/Toronto", "as_of": now.isoformat(),
        "visits": {"visitors": sum(len(v) for v in visitors.values()), "page_views": total_views,
                   "signed_in_share": round(signed / total_views, 3) if total_views else 0,
                   "series": [{"day": d, "visitors": len(visitors.get(d, ())), "page_views": views.get(d, 0)} for d in span],
                   "top_pages": [{"path": p, "views": c} for p, c in pages.most_common(8)],
                   "top_sources": [{"source": s, "views": c} for s, c in refs.most_common(6)]},
        "accounts": {"total": n, "new": sum(signups.get(d, 0) for d in span), "active_7d": active_since(week), "active_30d": active_since(month),
                     "signed_up_ever": signed_up_ever, "deleted_ever": gone_ever, "deleted_in_range": gone_range,
                     "series": [{"day": d, "signups": signups.get(d, 0)} for d in span]},
        "funnel": [{"label": k, "count": v, "share": round(v / n, 3) if n else 0} for k, v in funnel],
        "demand": _demand(accounts),
    }


@router.get("/hub/admin/users")
async def users(q: str = "", acc: dict = Depends(require_account)):
    """Everyone who has an account (platform admins left out), newest first. Platform admins only."""
    _need_admin(acc)
    ql = (q or "").strip().lower()
    rows = [_row(a) for a in await _real_accounts()]
    if ql:
        rows = [r for r in rows if ql in r["name"].lower() or ql in r["email"] or ql in r["startup"].lower()]
    rows.sort(key=lambda r: r["signed_up"], reverse=True)
    return {"users": rows[:500], "total": len(rows)}


def _safe(v: Any) -> str:
    s = "" if v is None else str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@") else s  # a spreadsheet must never run a name as a formula


@router.get("/hub/admin/users/export")
async def export_users(request: Request, acc: dict = Depends(require_account)):
    """Download everyone with an account as a spreadsheet. A deleted account leaves the list, so this is how a copy is kept."""
    _need_admin(acc)
    cols = ["name", "email", "signed_up", "last_active", "startup", "stage", "province", "profile_done", "tracked", "plan_items"]
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(cols)
    rows = [_row(a) for a in await _real_accounts()]
    rows.sort(key=lambda r: r["signed_up"], reverse=True)
    for r in rows:
        w.writerow([_safe(r[c]) for c in cols])
    await audit_platform(acc["id"], "admin.accounts_exported", "user", None, {"rows": len(rows)}, request=request)
    name = f"pathwai-accounts-{datetime.now(TZ).date().isoformat()}.csv"
    return Response(out.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"})


async def ensure_indexes() -> None:
    await hub_db().web_events.create_index([("day", 1)])
    await hub_db().web_events.create_index([("ts", 1)])
