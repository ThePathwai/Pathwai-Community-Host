"""Instagram Business / Creator analytics for community admins (Instagram API with Instagram Login).

What it reads, for ONE account the admin connects with its own access token: follower count, 30-day account
insights (reach, views, accounts engaged, interactions, profile link taps), the audience's country / city / age /
gender split, and the latest posts with their reach. Nothing is posted, and nothing about individual followers is
ever available from Meta, only totals. The newest snapshot is kept in the community's database, plus one small
row per day so follower growth can be charted as it builds up.

Needs an Instagram Business or Creator account. `demo` as the token gives sample data with no account at all.
"""
from __future__ import annotations

import asyncio
import hashlib
import random
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx

GRAPH = "https://graph.instagram.com/v23.0"
ACCOUNT_METRICS = ("reach", "views", "accounts_engaged", "total_interactions", "profile_links_taps")
COUNTRIES = {"CA": "Canada", "US": "United States", "GB": "United Kingdom", "NG": "Nigeria", "GH": "Ghana", "JM": "Jamaica", "TT": "Trinidad and Tobago", "IN": "India",
             "FR": "France", "DE": "Germany", "AU": "Australia", "ZA": "South Africa", "KE": "Kenya", "BR": "Brazil", "MX": "Mexico", "NL": "Netherlands"}
GENDERS = {"F": "Women", "M": "Men", "U": "Not specified"}


class InstagramError(Exception):
    pass


def is_demo(token: str) -> bool:
    return (token or "").strip().lower().startswith("demo")


async def _get(client: httpx.AsyncClient, path: str, token: str, params: Optional[dict] = None, *, soft: bool = False) -> Optional[dict]:
    """One Graph call. `soft=True` returns None instead of raising when this one metric isn't available for the account."""
    try:
        r = await client.get(f"{GRAPH}/{path.lstrip('/')}", params={**(params or {}), "access_token": token})
    except httpx.HTTPError:
        if soft:
            return None
        raise InstagramError("Couldn't reach Instagram from this server. Check the server's network access and try again.")
    if r.status_code == 200:
        return r.json()
    try:
        err = (r.json() or {}).get("error") or {}
    except Exception:  # noqa: BLE001
        err = {}
    if soft:
        return None
    code, msg = err.get("code"), err.get("message") or r.text[:160]
    if r.status_code in (400, 401, 403) and (code in (190, 102) or err.get("type") == "OAuthException"):
        raise InstagramError("Instagram rejected the access token. It may have expired (they last 60 days) or been revoked. Generate a new one and save it here.")
    raise InstagramError(f"Instagram returned an error: {msg}")


def _total(resp: Optional[dict]) -> Optional[int]:
    try:
        return int(resp["data"][0]["total_value"]["value"])
    except (TypeError, KeyError, IndexError, ValueError):
        return None


def _breakdown(resp: Optional[dict], labels: Optional[Dict[str, str]] = None, top: int = 6) -> List[Dict[str, Any]]:
    try:
        results = resp["data"][0]["total_value"]["breakdowns"][0]["results"]
    except (TypeError, KeyError, IndexError):
        return []
    rows = []
    for x in results:
        key = (x.get("dimension_values") or ["?"])[0]
        rows.append({"label": (labels or {}).get(key, key), "value": int(x.get("value") or 0)})
    rows.sort(key=lambda r: -r["value"])
    return rows[:top]


async def whoami(token: str) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=15) as client:
        return await _get(client, "me", token, {"fields": "user_id,username,account_type,followers_count"}) or {}


async def fetch_snapshot(token: str) -> Dict[str, Any]:
    """Pull everything for the connected account. One metric failing (some aren't offered on every account) never sinks the rest."""
    now = datetime.now(timezone.utc)
    since, until = int((now - timedelta(days=30)).timestamp()), int(now.timestamp())
    async with httpx.AsyncClient(timeout=15) as client:
        me = await _get(client, "me", token, {"fields": "user_id,username,name,account_type,followers_count,follows_count,media_count"})
        totals: Dict[str, Optional[int]] = {}
        missing: List[str] = []
        res = await asyncio.gather(*[_get(client, "me/insights", token, {"metric": m, "metric_type": "total_value", "period": "day", "since": since, "until": until}, soft=True) for m in ACCOUNT_METRICS])
        for m, r in zip(ACCOUNT_METRICS, res):
            v = _total(r)
            totals[m] = v
            if v is None:
                missing.append(m)
        followers = int(me.get("followers_count") or 0)
        demo: Dict[str, List[Dict[str, Any]]] = {}
        if followers >= 100:  # Meta only returns audience breakdowns for accounts with 100+ followers
            dims = (("country", COUNTRIES), ("city", None), ("age", None), ("gender", GENDERS))
            res = await asyncio.gather(*[_get(client, "me/insights", token, {"metric": "follower_demographics", "metric_type": "total_value", "period": "lifetime", "breakdown": d, "timeframe": "this_month"}, soft=True) for d, _ in dims])
            for (d, labels), r in zip(dims, res):
                demo[d] = _breakdown(r, labels, 6 if d != "age" else 7)
        media = (await _get(client, "me/media", token, {"fields": "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count", "limit": 12}, soft=True) or {}).get("data") or []

        async def post_insights(p: dict) -> dict:
            for metrics in ("reach,views,saved,shares", "reach,saved"):
                r = await _get(client, f"{p['id']}/insights", token, {"metric": metrics}, soft=True)
                if r:
                    vals = {x["name"]: (x.get("values") or [{}])[0].get("value") for x in r.get("data", [])}
                    return {**p, **{k: vals.get(k) for k in ("reach", "views", "saved", "shares")}}
            return p

        posts = await asyncio.gather(*[post_insights(p) for p in media])
    return {
        "fetched_at": now.isoformat(), "days": 30,
        "account": {"username": me.get("username"), "name": me.get("name"), "account_type": me.get("account_type"), "followers": followers,
                    "following": int(me.get("follows_count") or 0), "posts": int(me.get("media_count") or 0)},
        "totals": totals, "unavailable": missing, "audience": demo,
        "audience_note": None if followers >= 100 else "Instagram only shares audience breakdowns once an account has 100 followers.",
        "top_posts": sorted([_post(p) for p in posts], key=lambda p: -(p.get("reach") or p["likes"] + p["comments"]))[:5],
    }


def _post(p: dict) -> Dict[str, Any]:
    cap = (p.get("caption") or "").strip().replace("\n", " ")
    kind = {"REELS": "Reel", "FEED": "Post", "STORY": "Story"}.get((p.get("media_product_type") or "").upper()) or ("Reel" if p.get("media_type") == "VIDEO" else "Post")
    return {"id": p.get("id"), "caption": cap[:70] + ("…" if len(cap) > 70 else ""), "kind": kind, "permalink": p.get("permalink"), "posted_at": p.get("timestamp"),
            "likes": int(p.get("like_count") or 0), "comments": int(p.get("comments_count") or 0), "reach": p.get("reach"), "views": p.get("views"),
            "saved": p.get("saved"), "shares": p.get("shares")}


async def refresh_token(token: str) -> Optional[str]:
    """Long-lived tokens last 60 days and can be renewed (once they're a day old). Best effort: a failure just means we keep the old one."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get("https://graph.instagram.com/refresh_access_token", params={"grant_type": "ig_refresh_token", "access_token": token})
        if r.status_code == 200 and r.json().get("access_token"):
            return r.json()["access_token"]
    except Exception:  # noqa: BLE001
        pass
    return None


# ---------- sample data for the "demo" token and the in-browser demo ----------
def demo_snapshot(seed: str = "demo") -> Dict[str, Any]:
    r = random.Random(int(hashlib.sha256(seed.encode()).hexdigest()[:8], 16))
    followers = r.randint(2400, 9800)
    reach = int(followers * r.uniform(2.2, 4.5))
    now = datetime.now(timezone.utc)
    names = ["Founders mixer recap", "Meet our newest members", "Behind the scenes at Demo Day", "Perk spotlight: cloud credits", "Pitch night highlights"]
    posts = []
    for i, n in enumerate(names):
        pr = int(reach * r.uniform(0.06, 0.2))
        posts.append({"id": f"demo{i}", "caption": n, "kind": "Reel" if i % 2 == 0 else "Post", "permalink": None, "posted_at": (now - timedelta(days=3 + i * 5)).isoformat(),
                      "likes": int(pr * r.uniform(0.04, 0.1)), "comments": int(pr * r.uniform(0.003, 0.012)), "reach": pr, "views": int(pr * r.uniform(1.1, 1.8)), "saved": int(pr * 0.012), "shares": int(pr * 0.01)})
    posts.sort(key=lambda p: -p["reach"])

    def split(labels, weights):
        tot = followers
        return [{"label": l, "value": int(tot * w)} for l, w in zip(labels, weights)]
    return {"fetched_at": now.isoformat(), "days": 30, "sample": True,
            "account": {"username": "yourcommunity", "name": "Your Community", "account_type": "BUSINESS", "followers": followers, "following": r.randint(180, 600), "posts": r.randint(90, 400)},
            "totals": {"reach": reach, "views": int(reach * r.uniform(1.6, 2.4)), "accounts_engaged": int(reach * r.uniform(0.04, 0.09)), "total_interactions": int(reach * r.uniform(0.07, 0.14)), "profile_links_taps": int(reach * r.uniform(0.004, 0.012))},
            "unavailable": [],
            "audience": {"country": split(["Canada", "United States", "United Kingdom", "Nigeria", "Jamaica"], [0.62, 0.17, 0.06, 0.05, 0.03]),
                         "city": split(["Toronto", "Mississauga", "Brampton", "Ottawa", "New York"], [0.34, 0.1, 0.06, 0.05, 0.04]),
                         "age": split(["18-24", "25-34", "35-44", "45-54", "55-64"], [0.22, 0.43, 0.2, 0.08, 0.03]),
                         "gender": split(["Women", "Men", "Not specified"], [0.57, 0.41, 0.02])},
            "audience_note": None, "top_posts": posts[:5]}


# ---------- storing it ----------
async def save_snapshot(db: Any, snap: Dict[str, Any]) -> None:
    await db.instagram_latest.update_one({"_key": "latest"}, {"$set": {"_key": "latest", "data": snap, "fetched_at": snap["fetched_at"]}}, upsert=True)
    day = snap["fetched_at"][:10]
    t = snap.get("totals") or {}
    await db.instagram_history.update_one({"day": day}, {"$set": {"day": day, "followers": snap["account"]["followers"], "reach_30d": t.get("reach"), "views_30d": t.get("views")}}, upsert=True)


async def latest(db: Any) -> Optional[Dict[str, Any]]:
    d = await db.instagram_latest.find_one({"_key": "latest"})
    return d.get("data") if d else None


async def history(db: Any, limit: int = 12) -> List[Dict[str, Any]]:
    rows = await db.instagram_history.find({}).sort("day", 1).to_list(400)
    return [{"day": r["day"], "followers": r.get("followers")} for r in rows][-limit:]
