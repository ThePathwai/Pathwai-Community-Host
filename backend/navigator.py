"""Pathwai Navigator: which Canadian innovation programs fit this founder, and why.

Pure logic, no database. A catalog of programs (data/programs_ca.json plus any a community admin lists
themselves) is scored against a founder's profile. Every result carries plain-language reasons and cautions,
so the answer to "why this one?" is always on the screen, and the answer never depends on a model: the
numbers come from the rules below. An optional model call (see routes/navigator.py) only rewrites the
summary in friendlier words from these same facts.

The same rules are ported to the browser in frontend/src/lib/navigator.js for the static demo, and
tests/test_navigator.py checks the two give identical answers on shared cases. Change one, change both.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional

DATA_FILE = Path(__file__).parent / "data" / "programs_ca.json"

STAGES = ["idea", "prototype", "launched", "revenue", "growth"]
STAGE_LABEL = {"idea": "idea", "prototype": "prototype", "launched": "just launched", "revenue": "earning revenue", "growth": "growing"}
STAGE_HINT = {
    "idea": "Still validating the idea",
    "prototype": "Building a first version",
    "launched": "Launched, first customers",
    "revenue": "Steady revenue",
    "growth": "Scaling a proven product",
}
STAGE_NOW = {"idea": "at the idea stage", "prototype": "at the prototype stage", "launched": "just launched", "revenue": "earning revenue", "growth": "growing"}
NEEDS = ["funding", "mentorship", "space", "customers", "export", "rd", "ip", "talent", "network", "tax", "training", "visa"]
NEED_LABEL = {
    "funding": "funding", "mentorship": "mentors", "space": "a workspace", "customers": "first customers", "export": "export help",
    "rd": "R&D support", "ip": "IP protection", "talent": "talent", "network": "a network", "tax": "tax savings", "training": "training", "visa": "an immigration route",
}
AUDIENCES = ["women", "black", "indigenous", "newcomer", "youth", "student", "rural"]
AUDIENCE_LABEL = {"women": "women", "black": "Black", "indigenous": "Indigenous", "newcomer": "newcomer", "youth": "young", "student": "student", "rural": "rural"}
SECTORS = ["tech", "hardware", "health", "cleantech", "mobility", "creative", "retail", "food", "services", "social"]
PROVINCES = ["ON", "BC", "AB", "SK", "MB", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"]
TYPES = ["grant", "loan", "tax_credit", "accelerator", "incubator", "mentorship", "competition", "investor", "immigration", "research_partnership", "resource"]
TYPE_LABEL = {
    "grant": "Grant", "loan": "Loan", "tax_credit": "Tax credit", "accelerator": "Accelerator", "incubator": "Incubator", "mentorship": "Mentorship",
    "competition": "Competition", "investor": "Investor", "immigration": "Immigration", "research_partnership": "Research partner", "resource": "Resource",
}
STATUSES = ["open", "rolling", "check", "closed", "paused"]
STATUS_LABEL = {"open": "Open", "rolling": "Rolling", "check": "Check the site", "closed": "Closed", "paused": "Paused"}
STATUS_POINTS = {"open": 10, "rolling": 8, "check": 0, "closed": -25, "paused": -35}
VERIFIED_POINTS = {"official": 4, "third_party": 1, "unconfirmed": -4}
PHASE_ORDER = ["learn", "fund", "scale"]
PHASE_LABEL = {"learn": "Start here", "fund": "Then fund it", "scale": "Then scale"}

_catalog_cache: Optional[Dict[str, Any]] = None


def load_catalog() -> Dict[str, Any]:
    global _catalog_cache
    if _catalog_cache is None:
        _catalog_cache = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    return _catalog_cache


def _list(v: Any, allowed: Optional[List[str]] = None, cap: int = 12) -> List[str]:
    out: List[str] = []
    for x in v if isinstance(v, list) else []:
        s = str(x).strip().lower()
        if s and s not in out and (allowed is None or s in allowed):
            out.append(s)
    return out[:cap]


def _int(v: Any, lo: int, hi: int) -> Optional[int]:
    try:
        n = int(v)
    except (TypeError, ValueError):
        return None
    return n if lo <= n <= hi else None


def normalize_profile(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Clamp whatever the browser sent into the small vocabulary the rules understand."""
    raw = raw or {}
    stage = str(raw.get("stage") or "idea").strip().lower()
    inc = raw.get("incorporated")
    if isinstance(inc, str):
        inc = {"yes": True, "no": False}.get(inc.strip().lower())
    elif not isinstance(inc, bool):
        inc = None
    province = str(raw.get("province") or "ON").strip().upper()
    audiences = _list(raw.get("audiences"), AUDIENCES)
    age = _int(raw.get("age"), 13, 110)
    student = bool(raw.get("student")) or "student" in audiences
    if student and "student" not in audiences:
        audiences.append("student")
    if age is not None and age <= 29 and "youth" not in audiences:
        audiences.append("youth")
    return {
        "stage": stage if stage in STAGES else "idea",
        "audiences": audiences,
        "age": age,
        "province": province if province in PROVINCES else "ON",
        "city": str(raw.get("city") or "").strip()[:80],
        "sectors": _list(raw.get("sectors"), SECTORS),
        "incorporated": inc,
        "employees": _int(raw.get("employees"), 0, 100000),
        "student": student,
        "needs": _list(raw.get("needs"), NEEDS),
        "goal": str(raw.get("goal") or "").strip()[:500],
    }


PITCH_KEYS = ["problem", "solution", "traction", "market", "ask"]


def _clean_pitch(raw: Any) -> Dict[str, str]:
    """The five pitch "slides" shown on the profile (same as a community member card). Blank ones are dropped."""
    raw = raw if isinstance(raw, dict) else {}
    out = {k: " ".join(str(raw.get(k) or "").split())[:600] for k in PITCH_KEYS}
    return {k: v for k, v in out.items() if v}


def _clean_documents(raw: Any) -> List[Dict[str, str]]:
    """Links to a deck or one-pager: web addresses only (never a file), at most six."""
    out: List[Dict[str, str]] = []
    for d in raw if isinstance(raw, list) else []:
        d = d if isinstance(d, dict) else {}
        url = str(d.get("url") or "").strip()[:300]
        if url.lower().startswith(("http://", "https://")):
            out.append({"title": str(d.get("title") or "").strip()[:80], "url": url})
    return out[:6]


def clean_startup(raw: Optional[Dict[str, Any]], age: Optional[int] = None) -> Dict[str, Any]:
    """The startup part of an account profile, as stored on the account. Same vocabulary as the Navigator form
    (so the two can never drift apart), plus the two free-text lines a founder is known by. Age and city are not
    stored here: they already live on the account, and `navigator_profile` merges them back in."""
    raw = raw or {}
    p = normalize_profile({**raw, "age": None})  # age is stripped: it is derived, never stored here
    return {
        "name": str(raw.get("name") or "").strip()[:80],
        "one_liner": str(raw.get("one_liner") or "").strip()[:200],
        "stage": p["stage"], "sectors": p["sectors"], "audiences": _list(raw.get("audiences"), AUDIENCES),
        "incorporated": p["incorporated"], "employees": p["employees"], "student": bool(raw.get("student")),
        "needs": p["needs"], "goal": p["goal"], "province": p["province"],
        "seeking": bool(raw.get("seeking", True)),
        "pitch": _clean_pitch(raw.get("pitch")),
        "documents": _clean_documents(raw.get("documents")),
    }


def navigator_profile(account: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """What the Navigator should start from for a signed-in person: their startup details plus age and city from the
    rest of their account. Empty dict when they have not filled anything in."""
    st = (account or {}).get("startup") or {}
    if not st:
        return {}
    loc = str((account or {}).get("location") or "").split(",")[0].strip()
    return {**st, "age": (account or {}).get("age"), "city": loc}


def _days_until(iso: Optional[str], today: date) -> Optional[int]:
    try:
        return (date.fromisoformat(str(iso)[:10]) - today).days
    except (TypeError, ValueError):
        return None


def effective_status(program: Dict[str, Any], today: date) -> str:
    """A fixed deadline that has passed means closed, whatever the stored status says."""
    status = program.get("status") if program.get("status") in STATUSES else "check"
    dl = program.get("deadline") or {}
    if dl.get("kind") == "fixed":
        d = _days_until(dl.get("date"), today)
        if d is not None and d < 0:
            return "closed"
    return status


def _why(row: Dict[str, Any]) -> str:
    """The most specific reason first: skip the generic stage line when a sharper one exists."""
    rs = row.get("reasons") or []
    return next((r for r in rs if not r.startswith("Built for founders at your stage")), rs[0] if rs else row.get("summary", ""))


def _join(items: List[str]) -> str:
    items = list(items)
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def evaluate(program: Dict[str, Any], profile: Dict[str, Any], today: Optional[date] = None) -> Dict[str, Any]:
    """Score one program for one founder. `profile` must already be normalize_profile()'d.

    Returns {"fit": strong|possible|later|skip, "score": int, "reasons": [...], "cautions": [...], "skip": why}.
    "skip" means a hard rule rules it out (wrong province, group-specific program, age or sector mismatch);
    "later" means they will fit after a step they have not taken yet (incorporating, reaching a later stage)."""
    today = today or date.today()
    req = program.get("requires") or {}
    reasons: List[str] = []
    cautions: List[str] = []
    later: List[str] = []
    score = 0

    def skip(why: str) -> Dict[str, Any]:
        return {"fit": "skip", "score": 0, "reasons": [], "cautions": [], "skip": why}

    restricted = program.get("restricted_to") or []
    if restricted and not any(a in profile["audiences"] for a in restricted):
        return skip("For " + _join([AUDIENCE_LABEL.get(a, a) for a in restricted]) + " founders")
    provs = program.get("provinces") or ["any"]
    if "any" not in provs and profile["province"] not in provs:
        return skip("Only for " + _join(provs))
    age = profile["age"]
    if req.get("age_min") is not None or req.get("age_max") is not None:
        lo, hi = req.get("age_min"), req.get("age_max")
        if age is not None and ((lo is not None and age < lo) or (hi is not None and age > hi)):
            return skip("Age limit " + (f"{lo} to {hi}" if lo is not None and hi is not None else f"{lo}+" if lo is not None else f"up to {hi}"))
        if age is None:
            cautions.append("Has an age limit" + (f" ({lo} to {hi})" if lo is not None and hi is not None else "") + "; add your age to check")
    if req.get("student") and not profile["student"]:
        return skip("Only for students")
    emp = profile["employees"]
    if req.get("max_employees") is not None and emp is not None and emp > req["max_employees"]:
        return skip(f"Limit of {req['max_employees']} employees")
    sectors = [s for s in (program.get("sectors") or ["any"])]
    specific = "any" not in sectors
    if specific and profile["sectors"] and not any(s in sectors for s in profile["sectors"]):
        return skip("Focused on " + _join(sectors))

    stages = program.get("stages") or STAGES
    si = STAGES.index(profile["stage"])
    if profile["stage"] in stages:
        score += 30
        reasons.append(f"Built for founders at your stage ({STAGE_LABEL[profile['stage']]}).")
    else:
        earliest = min(STAGES.index(s) for s in stages if s in STAGES)
        latest = max(STAGES.index(s) for s in stages if s in STAGES)
        if si > latest:
            return skip("Aimed at earlier-stage companies")
        later.append(f"Aimed at companies that are {STAGE_LABEL[STAGES[earliest]]} or further along.")
        score -= 10

    if req.get("incorporated"):
        if profile["incorporated"] is False:
            later.append("Needs an incorporated company.")
        elif profile["incorporated"] is None:
            cautions.append("Requires an incorporated company.")
    if req.get("min_employees") is not None and emp is not None and emp < req["min_employees"]:
        later.append(f"Needs at least {req['min_employees']} full-time employees.")

    prov = set(program.get("needs") or [])
    hits = [n for n in profile["needs"] if n in prov]
    if hits:
        score += min(3, len(hits)) * 12
        reasons.append("Gives you " + _join([NEED_LABEL[n] for n in hits[:3]]) + ", which you asked for.")
    elif profile["needs"]:
        cautions.append("Does not cover what you listed as your needs.")

    aud_hits = [a for a in profile["audiences"] if a in (program.get("audiences") or [])]
    if aud_hits:
        score += 15
        reasons.append("Designed for " + _join([AUDIENCE_LABEL[a] for a in aud_hits]) + " founders.")
    if specific:
        sec_hits = [s for s in profile["sectors"] if s in sectors]
        if sec_hits:
            score += 10
            reasons.append("Focused on " + _join(sec_hits) + ", your area.")
        elif not profile["sectors"]:
            score -= 15
            cautions.append("Focused on " + _join(sectors) + "; add your sector to check.")

    status = effective_status(program, today)
    score += STATUS_POINTS[status]
    dl = program.get("deadline") or {}
    days = _days_until(dl.get("date"), today) if dl.get("kind") == "fixed" else None
    if status == "closed":
        cautions.append("Closed right now. " + (dl.get("note") or ""))
    elif status == "paused":
        cautions.append("Paused. " + (dl.get("note") or ""))
    elif days is not None:
        if days <= 60:
            score += 8
        reasons.append(f"Closes in {days} day{'' if days == 1 else 's'} ({dl.get('date')}).")
    elif status in ("open", "rolling"):
        reasons.append("Taking applications now" + (": " + dl["note"] if dl.get("kind") == "rolling" and dl.get("note") else "."))
    else:
        cautions.append("No deadline was published, so check the site before planning around it.")

    score += VERIFIED_POINTS.get(program.get("verified") or "unconfirmed", -4)
    if program.get("verified") == "unconfirmed":
        cautions.append("We could not confirm the current details. Check the program page.")

    reasons = [r for r in reasons if r]
    if later:
        return {"fit": "later", "score": score, "reasons": reasons, "cautions": later + cautions, "skip": ""}
    if score >= 55:
        fit = "strong"
    elif score >= 25:
        fit = "possible"
    else:
        return skip("Not a strong match")
    return {"fit": fit, "score": score, "reasons": reasons, "cautions": cautions, "skip": ""}


def _brief(program: Dict[str, Any]) -> Dict[str, Any]:
    keys = ["id", "name", "org", "level", "type", "summary", "amount", "stages", "audiences", "needs", "sectors", "provinces", "requirements",
            "deadline", "status", "phase", "apply_url", "source_url", "verified", "last_checked", "restricted_to", "community"]
    return {k: program.get(k) for k in keys if k in program}


def suggest(programs: List[Dict[str, Any]], raw_profile: Optional[Dict[str, Any]], today: Optional[date] = None, limit: int = 8) -> Dict[str, Any]:
    today = today or date.today()
    profile = normalize_profile(raw_profile)
    strong: List[Dict[str, Any]] = []
    possible: List[Dict[str, Any]] = []
    later: List[Dict[str, Any]] = []
    skipped = 0
    for p in programs:
        ev = evaluate(p, profile, today)
        if ev["fit"] == "skip":
            skipped += 1
            continue
        row = {**_brief(p), "status": effective_status(p, today), "fit": ev["fit"], "score": ev["score"], "reasons": ev["reasons"], "cautions": ev["cautions"]}
        {"strong": strong, "possible": possible, "later": later}[ev["fit"]].append(row)
    for bucket in (strong, possible, later):
        bucket.sort(key=lambda r: (-r["score"], r["name"]))
    ranked = strong + possible
    # A three-step path: the best "start here", "fund it" and "scale" match, so the answer reads as a plan rather than a list.
    path: List[Dict[str, Any]] = []
    for phase in PHASE_ORDER:
        pick = next((r for r in ranked if r.get("phase") == phase and r["status"] not in ("closed", "paused")), None) or next((r for r in ranked if r.get("phase") == phase), None)
        if pick:
            path.append({"phase": phase, "label": PHASE_LABEL[phase], "program_id": pick["id"], "name": pick["name"], "why": _why(pick)})
    return {
        "profile": profile,
        "matches": ranked[:limit],
        "more": ranked[limit:limit + 8],
        "later": later[:5],
        "skipped": skipped,
        "path": path,
        "trajectory": trajectory(programs, profile, today),
        "summary": summary_text(profile, ranked, later),
        "as_of": today.isoformat(),
    }


def trajectory(programs: List[Dict[str, Any]], raw_profile: Optional[Dict[str, Any]], today: Optional[date] = None, per_stage: int = 3) -> Dict[str, Any]:
    """Where the founder came from, where they are and where they are going: the five stages, each with the programs that serve it.

    Programs are re-scored as if the founder were at each stage, so the same hard rules (province, age, group, sector) apply
    all the way along. Behind you favours programs that end at that stage, ahead favours programs that first open there,
    and a program is shown in one column only."""
    today = today or date.today()
    profile = normalize_profile(raw_profile)
    cur = STAGES.index(profile["stage"])
    state_of = lambda i: "past" if i < cur else "current" if i == cur else "future"
    order = [cur] + list(range(cur + 1, len(STAGES))) + list(range(cur - 1, -1, -1))
    used: set = set()
    cols: Dict[int, Dict[str, Any]] = {}
    for i in order:
        stage = STAGES[i]
        state = state_of(i)
        at = {**profile, "stage": stage}
        rows = []
        for p in programs:
            st_list = [x for x in (p.get("stages") or STAGES) if x in STAGES] or list(STAGES)
            if stage not in st_list:
                continue
            ev = evaluate(p, at, today)
            if ev["fit"] == "skip":
                continue
            status = effective_status(p, today)
            first, last = min(STAGES.index(x) for x in st_list), max(STAGES.index(x) for x in st_list)
            live = 0 if status in ("open", "rolling") else 1 if status == "check" else 2
            if state == "past":
                lead = 0 if last == i else 1
            elif state == "future":
                lead = 0 if first == i else 1
            else:
                lead = 0
            res = 1 if p.get("type") == "resource" else 0
            if state == "current":
                live = 0  # the column you are in follows the same order as your matches: best fit first
            rows.append((lead, res, live, -ev["score"], p["name"], p, ev, status, first, last))
        rows.sort(key=lambda r: r[:5])
        pool = [r for r in rows if r[5]["id"] not in used and not (r[7] in ("closed", "paused") and state != "past")]
        picked = []
        # Mix the column: at most two of one kind first, then fill any gaps from what is left.
        for cap in (2, per_stage):
            for r in pool:
                if len(picked) >= per_stage:
                    break
                if r in picked or sum(1 for x in picked if x[5].get("type") == r[5].get("type")) >= cap:
                    continue
                picked.append(r)
        picked.sort(key=lambda r: r[:5])
        out = []
        for lead, _res, live, _s, _n, p, ev, status, first, last in picked:
            used.add(p["id"])
            if state == "future":
                note = (f"Opens up at the {STAGE_LABEL[stage]} stage." if first == i else "Gets easier to land as you grow.")
                if ev["cautions"]:
                    note += " " + ev["cautions"][0]
            elif state == "past":
                note = "Built for this stage; you have likely used or outgrown it." if last == i else p.get("summary", "")
            else:
                note = _why({**_brief(p), "reasons": ev["reasons"]})
            out.append({**_brief(p), "status": status, "fit": ev["fit"], "score": ev["score"], "note": note})
        cols[i] = {"stage": stage, "label": STAGE_LABEL[stage], "hint": STAGE_HINT[stage], "state": state, "available": len(rows), "programs": out}
    stages = [cols[i] for i in range(len(STAGES))]
    nxt = stages[cur + 1] if cur + 1 < len(stages) else None
    prev = stages[cur - 1] if cur > 0 else None
    story = ""
    if cur > 0:
        story += f"You've come through {_join([c['label'] for c in stages[:cur]])}. "
    story += f"Right now you're {STAGE_NOW[profile['stage']]}. "
    if nxt:
        names = [r["name"] for r in nxt["programs"][:2]]
        story += f"Next up is {nxt['label']}" + (f", where {_join(names)} come into reach." if len(names) > 1 else f", where {names[0]} comes into reach." if names else ".")
    else:
        story += "You're at the top of the ladder, so the focus now is scaling and export."
    return {"current": profile["stage"], "index": cur, "stages": stages, "story": story}


def summary_text(profile: Dict[str, Any], ranked: List[Dict[str, Any]], later: List[Dict[str, Any]]) -> str:
    stage = STAGE_LABEL[profile["stage"]]
    need = _join([NEED_LABEL[n] for n in profile["needs"][:3]])
    if not ranked:
        return f"Nothing in the directory is a clean fit for a founder who is {stage} yet" + (f" and looking for {need}" if need else "") + ". The directory is growing; try adding a community that lists its own programs."
    top = ranked[0]
    live = [r for r in ranked if r["status"] in ("open", "rolling")]
    s = f"You're at the {stage} stage" + (f" and looking for {need}" if need else "") + f". Start with {top['name']}: " + _why(top)
    if len(live) and live[0]["id"] != top["id"]:
        s += f" {live[0]['name']} is taking applications now."
    if later:
        s += f" {later[0]['name']} is worth keeping in view for later."
    return s


# ---------- communities ----------
def evaluate_community(com: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
    """Score a community's own navigator profile (stages it serves, who it is for, what it provides)."""
    nav = com.get("navigator") or {}
    reasons: List[str] = []
    score = 0
    if profile["stage"] in (nav.get("stages") or []):
        score += 30
        reasons.append(f"Members here are at the {STAGE_LABEL[profile['stage']]} stage, like you.")
    hits = [n for n in profile["needs"] if n in (nav.get("provides") or [])]
    if hits:
        score += min(3, len(hits)) * 12
        reasons.append("Offers " + _join([NEED_LABEL[n] for n in hits[:3]]) + ".")
    aud = [a for a in profile["audiences"] if a in (nav.get("audiences") or [])]
    if aud:
        score += 20
        reasons.append("Built with " + _join([AUDIENCE_LABEL[a] for a in aud]) + " founders in mind.")
    sec = [s for s in profile["sectors"] if s in (nav.get("sectors") or [])]
    if sec:
        score += 10
        reasons.append("Active in " + _join(sec) + ".")
    city = profile["city"].lower()
    if city and city and city == str(nav.get("city") or "").lower():
        score += 15
        reasons.append(f"Based in {nav.get('city')}.")
    elif profile["province"] in (nav.get("provinces") or []):
        score += 5
    return {"slug": com["slug"], "name": com["name"], "kind": com.get("kind"), "tagline": com.get("tagline"), "blurb": nav.get("blurb") or "", "members": com.get("members"),
            "brand": com.get("brand"), "city": nav.get("city") or "", "score": score, "reasons": reasons, "programs": com.get("program_count", 0)}


def rank_communities(communities: List[Dict[str, Any]], raw_profile: Optional[Dict[str, Any]], limit: int = 4) -> List[Dict[str, Any]]:
    profile = normalize_profile(raw_profile)
    rows = [evaluate_community(c, profile) for c in communities]
    rows = [r for r in rows if r["score"] > 0]
    rows.sort(key=lambda r: (-r["score"], r["name"]))
    return rows[:limit]


# ---------- listing / filtering ----------
def filter_programs(programs: List[Dict[str, Any]], q: str = "", ptype: str = "", province: str = "", stage: str = "", audience: str = "",
                    status: str = "", need: str = "", today: Optional[date] = None) -> List[Dict[str, Any]]:
    today = today or date.today()
    out = []
    ql = q.strip().lower()
    for p in programs:
        st = effective_status(p, today)
        if ptype and p.get("type") != ptype:
            continue
        if province and "any" not in (p.get("provinces") or ["any"]) and province.upper() not in (p.get("provinces") or []):
            continue
        if stage and stage not in (p.get("stages") or []):
            continue
        if audience and audience not in (p.get("audiences") or []) and audience not in (p.get("restricted_to") or []):
            continue
        if need and need not in (p.get("needs") or []):
            continue
        if status == "live" and st not in ("open", "rolling"):
            continue
        if status in STATUSES and status != "live" and st != status:
            continue
        if ql and ql not in " ".join([p.get("name", ""), p.get("org", ""), p.get("summary", ""), " ".join(p.get("requirements") or [])]).lower():
            continue
        out.append({**_brief(p), "status": st})
    out.sort(key=lambda r: (0 if r["status"] in ("open", "rolling") else 1 if r["status"] == "check" else 2, r["name"]))
    return out


def clean_listing(body: Dict[str, Any]) -> Dict[str, Any]:
    """Validate a program a community admin lists. Raises ValueError with a message the admin can read."""
    name = str(body.get("name") or "").strip()
    if len(name) < 3:
        raise ValueError("Give the program a name")
    url = str(body.get("apply_url") or "").strip()
    if url and not (url.startswith("https://") or url.startswith("http://")) or len(url) > 300 or " " in url:
        raise ValueError("The apply link must start with https://")
    kind = str(body.get("type") or "mentorship")
    if kind not in TYPES:
        kind = "mentorship"
    status = str(body.get("status") or "open")
    if status not in STATUSES:
        status = "open"
    dkind = str(body.get("deadline_kind") or ("fixed" if body.get("deadline_date") else "rolling"))
    if dkind not in ("fixed", "rolling", "annual", "none_published", "closed"):
        dkind = "rolling"
    ddate = str(body.get("deadline_date") or "").strip()[:10] or None
    if dkind == "fixed":
        try:
            date.fromisoformat(ddate or "")
        except ValueError:
            raise ValueError("Use a deadline date like 2026-12-01")
    else:
        ddate = None
    reqs = [str(r).strip()[:140] for r in (body.get("requirements") or []) if str(r).strip()][:8]
    return {
        "name": name[:120], "org": str(body.get("org") or "").strip()[:120], "type": kind,
        "summary": str(body.get("summary") or "").strip()[:240], "amount": str(body.get("amount") or "").strip()[:160],
        "stages": _list(body.get("stages"), STAGES) or list(STAGES), "audiences": _list(body.get("audiences"), AUDIENCES),
        "needs": _list(body.get("needs"), NEEDS), "sectors": _list(body.get("sectors"), SECTORS) or ["any"],
        "requirements": reqs, "status": status, "apply_url": url,
        "deadline": {"kind": dkind, "date": ddate, "note": str(body.get("deadline_note") or "").strip()[:160]},
    }


def community_program(row: Dict[str, Any], slug: str, community_name: str, province: str = "ON") -> Dict[str, Any]:
    """A community-listed program, shaped like a catalog entry so the same scorer works on it."""
    return {
        "id": f"c-{slug}-{row['id']}", "name": row["name"], "org": row.get("org") or community_name, "level": "community", "type": row.get("type") or "mentorship",
        "summary": row.get("summary") or "", "amount": row.get("amount") or "", "stages": row.get("stages") or list(STAGES), "audiences": row.get("audiences") or [],
        "needs": row.get("needs") or [], "sectors": row.get("sectors") or ["any"], "provinces": ["any"], "restricted_to": [], "requires": {},
        "requirements": row.get("requirements") or [], "deadline": row.get("deadline") or {"kind": "rolling", "date": None, "note": ""},
        "status": row.get("status") or "open", "phase": "learn", "apply_url": row.get("apply_url") or f"/c/{slug}", "source_url": f"/c/{slug}",
        "verified": "official", "last_checked": (row.get("updated_at") or "")[:10],
        "community": {"slug": slug, "name": community_name},
    }
