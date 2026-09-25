from typing import Optional

from fastapi import APIRouter

from database import db
from ._common import clean

router = APIRouter(tags=["feeds"])


@router.get("/slack-signals")
async def slack_signals(space: Optional[str] = None, limit: int = 50):
    q = {"space_slug": space} if space and space != "all" else {}
    return [clean(s) async for s in db.slack_signals.find(q).sort("posted_at", -1).limit(limit)]


@router.get("/email-updates")
async def email_updates(space: Optional[str] = None, important_only: bool = False, limit: int = 50):
    q = {}
    if space and space != "all":
        q["space_slug"] = space
    if important_only:
        q["is_important"] = True
    return [clean(e) async for e in db.email_updates.find(q).sort("received_at", -1).limit(limit)]
