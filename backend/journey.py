"""Journey: a founder's own plan for building the startup, and how far along it is.

The plan is a list of milestones, each filed under one of the five stages (idea, prototype, launched, revenue, growth). A founder
can add their own, tick them off, give them a due date and a note, or take suggestions. Suggestions come from two places, and
every one says why it is there: a short list of starter milestones per stage (data/journey_templates.json, limited by the
profile, for example "Incorporate" only shows to someone who is not incorporated), and the programs that are a good match
right now ("Apply to X", with its deadline).

Progress is plain counting, nothing hidden: milestones done out of milestones planned, per stage and overall. When most of the
milestones in the current stage are done, the page offers to move the founder to the next stage. The same rules run in the
browser (frontend/src/lib/journey.js) for the in-browser demo, and a test keeps the two identical."""
from __future__ import annotations

import json
import uuid
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import navigator as nav

TEMPLATES_FILE = Path(__file__).parent / "data" / "journey_templates.json"
STATUSES = ["todo", "doing", "done"]
STATUS_LABEL = {"todo": "To do", "doing": "In progress", "done": "Done"}
STAGE_NAME = {"idea": "Idea", "prototype": "Prototype", "launched": "Launched", "revenue": "Revenue", "growth": "Growth"}
MAX_MILESTONES = 120
MAX_ADD_MANY = 20
READY_SHARE = 0.8   # this much of a stage's plan done, and the page offers the next stage
READY_MIN = 3       # but only when the stage has at least this many milestones, so one tick does not count as a stage
SOON_DAYS = 30      # a later-stage milestone with a due date this close is shown now

_templates_cache: Optional[List[Dict[str, Any]]] = None


def load_templates() -> List[Dict[str, Any]]:
    global _templates_cache
    if _templates_cache is None:
        _templates_cache = json.loads(TEMPLATES_FILE.read_text(encoding="utf-8"))["templates"]
    return _templates_cache


def _days(iso: str, today: date) -> Optional[int]:
    try:
        return (date.fromisoformat(str(iso)[:10]) - today).days
    except (TypeError, ValueError):
        return None


def _due(v: Any) -> str:
    s = str(v or "").strip()
    if not s:
        return ""
    try:
        return date.fromisoformat(s[:10]).isoformat()
    except ValueError:
        raise ValueError("The due date is not a valid date.")


def _title(v: Any) -> str:
    s = " ".join(str(v or "").split())
    if len(s) < 2:
        raise ValueError("Give the milestone a short title.")
    return s[:120]


def _new_id() -> str:
    return "j-" + uuid.uuid4().hex[:8]


def _clean(raw: Dict[str, Any], default_stage: str, today: date, new_id: Callable[[], str]) -> Dict[str, Any]:
    stage = str(raw.get("stage") or default_stage).strip().lower()
    status = str(raw.get("status") or "todo").strip().lower()
    if status not in STATUSES:
        raise ValueError("Status must be to do, in progress or done.")
    return {
        "id": new_id(), "title": _title(raw.get("title")), "stage": stage if stage in nav.STAGES else default_stage,
        "status": status, "due": _due(raw.get("due")), "note": " ".join(str(raw.get("note") or "").split())[:500],
        "key": str(raw.get("key") or "")[:60], "program_id": str(raw.get("program_id") or "")[:120],
        "program_name": str(raw.get("program_name") or "")[:120],
        "created_at": today.isoformat(), "done_at": today.isoformat() if status == "done" else "",
    }


def _add(items: List[Dict[str, Any]], raw: Dict[str, Any], default_stage: str, today: date, new_id: Callable[[], str]) -> List[Dict[str, Any]]:
    m = _clean(raw, default_stage, today, new_id)
    if m["key"] and any(i.get("key") == m["key"] for i in items):
        return items  # a suggestion that is already on the plan is not added twice
    if len(items) >= MAX_MILESTONES:
        raise ValueError(f"Your plan is full ({MAX_MILESTONES} milestones). Remove one to add another.")
    return items + [m]


def update_journey(items: Optional[List[Dict[str, Any]]], body: Dict[str, Any], default_stage: str = "idea", today: Optional[date] = None,
                   new_id: Optional[Callable[[], str]] = None) -> List[Dict[str, Any]]:
    """Apply one change to the plan and return the new plan. `op` is add, add_many, update or remove. Raises ValueError with a message
    a person can read."""
    today = today or date.today()
    new_id = new_id or _new_id
    default_stage = default_stage if default_stage in nav.STAGES else "idea"
    items = [dict(i) for i in (items or [])]
    op = str(body.get("op") or "")
    if op == "add":
        return _add(items, body, default_stage, today, new_id)
    if op == "add_many":
        for raw in (body.get("items") or [])[:MAX_ADD_MANY]:
            items = _add(items, raw if isinstance(raw, dict) else {}, default_stage, today, new_id)
        return items
    if op not in ("remove", "update"):
        raise ValueError("Unknown change.")
    mid = str(body.get("id") or "")
    at = next((n for n, i in enumerate(items) if i.get("id") == mid), -1)
    if at < 0:
        raise ValueError("That milestone is not on your plan.")
    if op == "remove":
        return items[:at] + items[at + 1:]
    if op == "update":
        m = items[at]
        if "title" in body:
            m["title"] = _title(body["title"])
        if "stage" in body and str(body["stage"]).strip().lower() in nav.STAGES:
            m["stage"] = str(body["stage"]).strip().lower()
        if "due" in body:
            m["due"] = _due(body["due"])
        if "note" in body:
            m["note"] = " ".join(str(body["note"] or "").split())[:500]
        if "status" in body:
            st = str(body["status"]).strip().lower()
            if st not in STATUSES:
                raise ValueError("Status must be to do, in progress or done.")
            if st == "done" and m.get("status") != "done":
                m["done_at"] = today.isoformat()
            elif st != "done":
                m["done_at"] = ""
            m["status"] = st
        return items
    return items


def _applies(tpl: Dict[str, Any], profile: Dict[str, Any]) -> bool:
    w = tpl.get("when") or {}
    if "incorporated" in w:
        inc = profile["incorporated"]
        if w["incorporated"] is False and inc is True:
            return False
        if w["incorporated"] is True and inc is not True:
            return False
    for key, field in (("needs_any", "needs"), ("sectors_any", "sectors"), ("audiences_any", "audiences")):
        if key in w and not any(x in profile[field] for x in w[key]):
            return False
    return True


def suggestions(raw_profile: Optional[Dict[str, Any]], items: Optional[List[Dict[str, Any]]], programs: List[Dict[str, Any]], today: Optional[date] = None,
                templates: Optional[List[Dict[str, Any]]] = None, program_limit: int = 3) -> Dict[str, List[Dict[str, Any]]]:
    """What could be added, per stage. Each has a `why`. Anything already on the plan is left out. In the current stage the order is:
    the starter milestones that matter most, then programs worth applying to now, then the rest."""
    today = today or date.today()
    profile = nav.normalize_profile(raw_profile)
    have = {i.get("key") for i in (items or []) if i.get("key")}
    out: Dict[str, List[Dict[str, Any]]] = {s: [] for s in nav.STAGES}
    for tpl in (templates if templates is not None else load_templates()):
        if tpl["key"] in have or not _applies(tpl, profile):
            continue
        out[tpl["stage"]].append({"key": tpl["key"], "title": tpl["title"], "stage": tpl["stage"], "why": tpl["why"], "core": bool(tpl.get("core"))})
    res = nav.suggest(programs, profile, today, limit=60)
    picks: List[Dict[str, Any]] = []
    for m in res["matches"]:
        key = f"prog:{m['id']}"
        if len(picks) >= program_limit:
            break
        if m["fit"] != "strong" or m["status"] not in ("open", "rolling") or key in have:
            continue
        dl = m.get("deadline") or {}
        verb = "Explore" if m.get("type") == "resource" else "Apply to"
        picks.append({"key": key, "title": f"{verb} {m['name']}", "stage": profile["stage"], "why": nav._why(m), "core": False,
                      "program_id": m["id"], "program_name": m["name"], "due": dl.get("date") if dl.get("kind") == "fixed" else ""})
    cur = out[profile["stage"]]
    out[profile["stage"]] = [s for s in cur if s["core"]] + picks + [s for s in cur if not s["core"]]
    return out


def summary(items: Optional[List[Dict[str, Any]]], current_stage: str, today: Optional[date] = None) -> Dict[str, Any]:
    """The counting: per stage and overall, what is next, what is overdue, what was done lately, and whether it is time for the next stage."""
    today = today or date.today()
    items = items or []
    current_stage = current_stage if current_stage in nav.STAGES else "idea"
    cur = nav.STAGES.index(current_stage)
    stages = []
    for s in nav.STAGES:
        mine = [i for i in items if i.get("stage") == s]
        overdue = sum(1 for i in mine if i.get("status") != "done" and i.get("due") and (_days(i["due"], today) or 0) < 0)
        stages.append({"stage": s, "name": STAGE_NAME[s], "total": len(mine), "done": sum(1 for i in mine if i.get("status") == "done"),
                       "doing": sum(1 for i in mine if i.get("status") == "doing"), "overdue": overdue})
    cands = []
    for n, m in enumerate(items):
        if m.get("status") == "done":
            continue
        si = nav.STAGES.index(m["stage"])
        d = _days(m["due"], today) if m.get("due") else None
        if si > cur and not (d is not None and d <= SOON_DAYS):
            continue
        rank = 0 if d is not None and d < 0 else 1 if d is not None else 2 if m.get("status") == "doing" else 3
        cands.append((rank, d if d is not None else 0, abs(cur - si), n, m, d))
    cands.sort(key=lambda c: c[:4])
    next_up = [{**m, "overdue": bool(d is not None and d < 0), "days": d} for _r, _d, _p, _n, m, d in cands[:3]]
    done = [(i.get("done_at") or "", n, i) for n, i in enumerate(items) if i.get("status") == "done"]
    done.sort(key=lambda r: (r[0], r[1]), reverse=True)
    week_ago = (today - timedelta(days=6)).isoformat()
    total, finished = len(items), len(done)
    ready = None
    cs = stages[cur]
    if cur < len(nav.STAGES) - 1 and cs["total"] >= READY_MIN and cs["done"] / cs["total"] >= READY_SHARE:
        nxt = nav.STAGES[cur + 1]
        ready = {"to": nxt, "to_name": STAGE_NAME[nxt], "done": cs["done"], "total": cs["total"],
                 "text": f"You have finished {cs['done']} of {cs['total']} milestones in {cs['name']}."}
    return {"current": current_stage, "stages": stages, "total": total, "done": finished, "percent": (200 * finished + total) // (2 * total) if total else 0,
            "overdue": sum(s["overdue"] for s in stages), "done_this_week": sum(1 for d, _n, _i in done if d >= week_ago),
            "next_up": next_up, "recent": [{"id": i["id"], "title": i["title"], "stage": i["stage"], "done_at": i.get("done_at") or ""} for _d, _n, i in done[:5]],
            "ready": ready}
