"""Birthdays and ages.

A member's birthday is the thing we store (ISO date, YYYY-MM-DD). `age` is derived from it: it is
set whenever a birthday is saved and recalculated for everyone every day (see refresh_all_ages), so
ages tick over on their own. Other members only ever see the age, never the birthday itself
(see routes/_common.PRIVATE_FIELDS).
"""
from __future__ import annotations

import asyncio
import logging
import re
from datetime import date, datetime, timezone
from typing import Any, Optional

logger = logging.getLogger("pathwai.birthday")

MIN_AGE = 13   # Pathwai's minimum age (see the Terms)
MAX_AGE = 120

_MONTHS = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}


class BirthdayError(ValueError):
    pass


def today_utc() -> date:
    return datetime.now(timezone.utc).date()


def _mk(y: int, m: int, d: int) -> date:
    try:
        return date(y, m, d)
    except ValueError:
        raise BirthdayError("That isn't a real date.")


def parse_date(v: Any) -> Optional[date]:
    """Reads the formats people actually type or export: 1990-04-23, 1990/4/23, 04/23/1990, 23/04/1990
    (when the first number can't be a month), Apr 23 1990, 23 April 1990. Returns None for blank."""
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v).strip()
    if not s:
        return None
    s = s.split("T")[0] if re.match(r"^\d{4}-\d{2}-\d{2}T", s) else s
    m = re.match(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$", s)
    if m:
        return _mk(int(m[1]), int(m[2]), int(m[3]))
    m = re.match(r"^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$", s)
    if m:
        a, b, y = int(m[1]), int(m[2]), int(m[3])
        # Month first (North American) unless that can't be right.
        return _mk(y, a, b) if a <= 12 else _mk(y, b, a)
    m = re.match(r"^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$", s)
    if m and m[1][:3].lower() in _MONTHS:
        return _mk(int(m[3]), _MONTHS[m[1][:3].lower()], int(m[2]))
    m = re.match(r"^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$", s)
    if m and m[2][:3].lower() in _MONTHS:
        return _mk(int(m[3]), _MONTHS[m[2][:3].lower()], int(m[1]))
    raise BirthdayError("Enter your birthday as a date, like 1990-04-23.")


def age_on(born: date, today: Optional[date] = None) -> int:
    today = today or today_utc()
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def clean_birthday(v: Any, min_age: int = MIN_AGE) -> Optional[str]:
    """-> ISO string or None (blank). Raises BirthdayError with a message fit to show the member."""
    d = parse_date(v)
    if d is None:
        return None
    a = age_on(d)
    if a < 0:
        raise BirthdayError("Your birthday can't be in the future.")
    if a < min_age:
        raise BirthdayError(f"You need to be at least {min_age} to use Pathwai.")
    if a > MAX_AGE:
        raise BirthdayError("Please check the year of your birthday.")
    return d.isoformat()


def age_from(birthday: Any) -> Optional[int]:
    try:
        d = parse_date(birthday)
    except BirthdayError:
        return None
    return age_on(d) if d else None


async def _refresh_collection(coll) -> int:
    n = 0
    async for u in coll.find({"birthday": {"$nin": [None, ""]}}, {"id": 1, "birthday": 1, "age": 1}):
        a = age_from(u.get("birthday"))
        if a is not None and u.get("age") != a:
            await coll.update_one({"id": u["id"]}, {"$set": {"age": a}})
            n += 1
    return n


async def refresh_all_ages() -> int:
    """Recalculate `age` from `birthday` for every account and every community's members."""
    from database import COMMUNITY_SLUGS, dbfor, hub_db
    total = 0
    try:
        total += await _refresh_collection(hub_db().accounts)
    except Exception as exc:  # noqa: BLE001
        logger.warning("age refresh (accounts) failed: %s", exc)
    for slug in list(COMMUNITY_SLUGS):
        try:
            total += await _refresh_collection(dbfor(slug).users)
        except Exception as exc:  # noqa: BLE001
            logger.warning("age refresh (%s) failed: %s", slug, exc)
    return total


async def age_loop() -> None:
    """Runs for the life of the server: once at start-up, then every few hours (cheap: only rows
    whose age actually changed are written)."""
    await asyncio.sleep(20)  # let start-up finish registering communities first
    while True:
        try:
            n = await refresh_all_ages()
            if n:
                logger.info("updated %s member ages", n)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.warning("age refresh failed: %s", exc)
        await asyncio.sleep(6 * 3600)
