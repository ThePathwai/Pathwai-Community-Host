"""TikTok account analytics for community admins (TikTok Display API v2).

What it reads, for ONE account the admin connects: follower, like and video totals, and the account's latest videos with
their views, likes, comments and shares. From those it works out the last 30 days (videos posted in that window and what
they earned). Nothing is posted, and nothing about individual followers is available from TikTok, only totals.
TikTok's Display API counts video views, not unique accounts reached, and shares no audience breakdown, so reports say "views"
for TikTok and never mix the two kinds of number without saying so.

The admin connects with their TikTok developer app's client key and secret plus a refresh token (an access token only lasts a day;
the refresh token lasts a year and is renewed every time we use it). `demo` as the client key gives sample data with no account at all.
"""
from __future__ import annotations

import hashlib
import random
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

API = "https://open.tiktokapis.com/v2"
USER_FIELDS = "open_id,display_name,username,follower_count,following_count,likes_count,video_count"
VIDEO_FIELDS = "id,title,video_description,create_time,share_url,view_count,like_count,comment_count,share_count,duration"


class TikTokError(Exception):
    pass


def is_demo(client_key: str) -> bool:
    return (client_key or "").strip().lower().startswith("demo")


async def refresh_access(client_key: str, client_secret: str, refresh_token: str) -> Tuple[str, Optional[str]]:
    """Trade the refresh token for a day-long access token (and a renewed refresh token, which TikTok may rotate)."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(f"{API}/oauth/token/", data={"client_key": client_key, "client_secret": client_secret, "grant_type": "refresh_token", "refresh_token": refresh_token},
                                  headers={"Content-Type": "application/x-www-form-urlencoded"})
    except httpx.HTTPError:
        raise TikTokError("Couldn't reach TikTok from this server. Check the server's network access and try again.")
    j = {}
    try:
        j = r.json()
    except Exception:  # noqa: BLE001
        pass
    if r.status_code != 200 or not j.get("access_token"):
        raise TikTokError("TikTok rejected the connection. The refresh token may have expired or been revoked: authorize the app again and paste the new refresh token here.")
    return j["access_token"], j.get("refresh_token")


async def _call(client: httpx.AsyncClient, method: str, path: str, token: str, **kw) -> dict:
    try:
        r = await client.request(method, f"{API}/{path.lstrip('/')}", headers={"Authorization": f"Bearer {token}"}, **kw)
    except httpx.HTTPError:
        raise TikTokError("Couldn't reach TikTok from this server. Check the server's network access and try again.")
    try:
        j = r.json()
    except Exception:  # noqa: BLE001
        j = {}
    err = (j.get("error") or {})
    if r.status_code != 200 or (err.get("code") not in (None, "ok")):
        raise TikTokError(f"TikTok returned an error: {err.get('message') or r.text[:160] or r.status_code}")
    return j.get("data") or {}


async def whoami(token: str) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=15) as client:
        return (await _call(client, "GET", "user/info/", token, params={"fields": USER_FIELDS})).get("user") or {}


async def fetch_snapshot(token: str) -> Dict[str, Any]:
    """The account and its latest videos (up to 60, three pages), with the last 30 days worked out from them."""
    now = datetime.now(timezone.utc)
    async with httpx.AsyncClient(timeout=20) as client:
        me = (await _call(client, "GET", "user/info/", token, params={"fields": USER_FIELDS})).get("user") or {}
        vids: List[dict] = []
        cursor = None
        for _ in range(3):
            body: Dict[str, Any] = {"max_count": 20}
            if cursor:
                body["cursor"] = cursor
            page = await _call(client, "POST", "video/list/", token, params={"fields": VIDEO_FIELDS}, json=body)
            vids += page.get("videos") or []
            if not page.get("has_more"):
                break
            cursor = page.get("cursor")
    return build_snapshot(me, vids, now)


def _video(v: dict) -> Dict[str, Any]:
    cap = (v.get("title") or v.get("video_description") or "").strip().replace("\n", " ")
    ts = v.get("create_time")
    return {"id": v.get("id"), "caption": cap[:70] + ("…" if len(cap) > 70 else ""), "permalink": v.get("share_url"),
            "posted_at": datetime.fromtimestamp(int(ts), timezone.utc).isoformat() if ts else None,
            "views": int(v.get("view_count") or 0), "likes": int(v.get("like_count") or 0), "comments": int(v.get("comment_count") or 0), "shares": int(v.get("share_count") or 0)}


def build_snapshot(me: Dict[str, Any], vids: List[dict], now: datetime, *, sample: bool = False) -> Dict[str, Any]:
    posts = [_video(v) for v in vids]
    since = now - timedelta(days=30)
    recent = [p for p in posts if p["posted_at"] and datetime.fromisoformat(p["posted_at"]) >= since]
    tot = lambda k: sum(p[k] for p in recent)  # noqa: E731
    snap = {
        "fetched_at": now.isoformat(), "days": 30,
        "account": {"username": me.get("username") or me.get("display_name"), "name": me.get("display_name"), "followers": int(me.get("follower_count") or 0),
                    "following": int(me.get("following_count") or 0), "likes": int(me.get("likes_count") or 0), "videos": int(me.get("video_count") or 0)},
        "totals": {"videos_posted": len(recent), "views": tot("views"), "likes": tot("likes"), "comments": tot("comments"), "shares": tot("shares")},
        "top_posts": sorted(posts, key=lambda p: -p["views"])[:5],
    }
    if sample:
        snap["sample"] = True
    return snap


# ---------- sample data for the "demo" key and the in-browser demo ----------
def demo_snapshot(seed: str = "demo") -> Dict[str, Any]:
    r = random.Random(int(hashlib.sha256(("tt" + seed).encode()).hexdigest()[:8], 16))
    now = datetime.now(timezone.utc)
    followers = r.randint(3200, 14000)
    names = ["Founders mixer in 30 seconds", "Meet our newest members", "What happens at Demo Day", "Perk spotlight: cloud credits", "Pitch night highlights", "A day in the community"]
    vids = []
    for i, n in enumerate(names):
        v = int(followers * r.uniform(0.6, 3.4))
        vids.append({"id": f"tt{i}", "title": n, "create_time": int((now - timedelta(days=2 + i * 4)).timestamp()), "share_url": None, "view_count": v,
                     "like_count": int(v * r.uniform(0.06, 0.12)), "comment_count": int(v * r.uniform(0.004, 0.012)), "share_count": int(v * r.uniform(0.01, 0.03))})
    me = {"username": "yourcommunity", "display_name": "Your Community", "follower_count": followers, "following_count": r.randint(80, 400),
          "likes_count": int(sum(v["like_count"] for v in vids) * r.uniform(3, 6)), "video_count": r.randint(30, 160)}
    return build_snapshot(me, vids, now, sample=True)


# ---------- storing it ----------
async def save_snapshot(db: Any, snap: Dict[str, Any]) -> None:
    await db.tiktok_latest.update_one({"_key": "latest"}, {"$set": {"_key": "latest", "data": snap, "fetched_at": snap["fetched_at"]}}, upsert=True)
    day = snap["fetched_at"][:10]
    t = snap.get("totals") or {}
    await db.tiktok_history.update_one({"day": day}, {"$set": {"day": day, "followers": snap["account"]["followers"], "views_30d": t.get("views")}}, upsert=True)


async def latest(db: Any) -> Optional[Dict[str, Any]]:
    d = await db.tiktok_latest.find_one({"_key": "latest"})
    return d.get("data") if d else None


async def history(db: Any, limit: int = 12) -> List[Dict[str, Any]]:
    rows = await db.tiktok_history.find({}).sort("day", 1).to_list(400)
    return [{"day": r["day"], "followers": r.get("followers")} for r in rows][-limit:]
