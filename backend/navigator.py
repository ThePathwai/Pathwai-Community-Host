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
import uuid
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
# Plain words, because "open" and "rolling" read as the same thing: open = taking applications now (often with a closing date),
# rolling = no deadline, apply whenever, check = the organisation has not published dates.
STATUS_LABEL = {"open": "Open now", "rolling": "Apply anytime", "check": "Dates not posted", "closed": "Closed", "paused": "Paused"}
STATUS_HELP = {
    "open": "Taking applications right now. If there is a closing date, it is shown.",
    "rolling": "No deadline. Apply whenever you are ready.",
    "check": "The organisation has not published dates. Check its page before you plan around it.",
    "closed": "Not taking applications.",
    "paused": "Not taking applications for now.",
}


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
    return next((r for r in rs if not r.startswith(STAGE_LINE_PREFIXES)), rs[0] if rs else row.get("summary", ""))


def _join(items: List[str]) -> str:
    items = list(items)
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


CHECK_Q = {"apply": "Can I apply?", "stage": "Is it for my stage?", "need": "Does it give me what I need?", "timing": "Can I apply now?"}
CHECK_ORDER = ["apply", "stage", "need", "timing"]
_SEVERITY = {"yes": 0, "maybe": 1, "later": 2, "no": 3}
STAGE_LINE_PREFIXES = ("Built for founders at your stage", "Open to companies at any stage")
FIT_WORD = {"strong": "Good match", "possible": "Worth a look", "later": "Not yet", "skip": "Not matched"}


def _worst(items: List[Dict[str, Any]]) -> str:
    return max((i["state"] for i in items), key=lambda s: _SEVERITY[s], default="yes")


def evaluate(program: Dict[str, Any], profile: Dict[str, Any], today: Optional[date] = None) -> Dict[str, Any]:
    """Judge one program for one founder by asking four plain questions. `profile` must already be normalize_profile()'d.

    1. Can I apply?            province, group, age, student, team size, sector, incorporation
    2. Is it for my stage?     the program's stages against yours
    3. Does it give me what I need?   what it offers against what you asked for
    4. Can I apply now?        open, apply anytime, closed, paused, deadline

    Each question is answered "yes", "maybe" (we are missing an answer from your profile), "later" (a step you have not taken
    yet, such as incorporating) or "no". There are no points. The match follows from the answers:
      - a "no" on question 1 or 2 means "skip" (not matched, with that reason)
      - a "later" on question 1 or 2 means "later" (not yet)
      - yes, yes, yes on questions 1 to 3 means "strong" (good match); anything else left means "possible" (worth a look)
    Timing (question 4) never changes the match: a closed program that fits you is still a match, shown as closed.
    `score` only orders programs inside a match group; it is never shown."""
    today = today or date.today()
    req = program.get("requires") or {}

    # 1. Can I apply?
    facets: List[Dict[str, Any]] = []
    tailored: List[str] = []   # reasons that show a program is made for this person (their group), not just open to them
    focus: List[str] = []      # and the same for their sector, which reads second

    def add(state: str, text: str, ask: str = "") -> None:
        facets.append({"state": state, "text": text, **({"ask": ask} if ask else {})})

    restricted = program.get("restricted_to") or []
    if restricted:
        label = _join([AUDIENCE_LABEL.get(a, a) for a in restricted])
        if any(a in profile["audiences"] for a in restricted):
            add("yes", f"For {label} founders only. You qualify.")
            tailored.append(f"For {label} founders, which you are.")
        else:
            add("no", f"For {label} founders")
    provs = program.get("provinces") or ["any"]
    if "any" not in provs:
        if profile["province"] in provs:
            add("yes", f"Open to founders in {profile['province']}.")
        else:
            add("no", "Only for " + _join(provs))
    age = profile["age"]
    lo, hi = req.get("age_min"), req.get("age_max")
    if lo is not None or hi is not None:
        span = f"{lo} to {hi}" if lo is not None and hi is not None else f"{lo}+" if lo is not None else f"up to {hi}"
        if age is None:
            add("maybe", "Has an age limit" + (f" ({lo} to {hi})" if lo is not None and hi is not None else "") + "; add your age to check", "age")
        elif (lo is not None and age < lo) or (hi is not None and age > hi):
            add("no", "Age limit " + span)
        else:
            add("yes", f"Age limit {span}. You fit.")
    if req.get("student"):
        add("yes", "For students. You are one.") if profile["student"] else add("no", "Only for students")
    emp = profile["employees"]
    if req.get("max_employees") is not None:
        if emp is None:
            add("maybe", f"Limit of {req['max_employees']} employees; add your team size to check", "employees")
        elif emp > req["max_employees"]:
            add("no", f"Limit of {req['max_employees']} employees")
        else:
            add("yes", f"Limit of {req['max_employees']} employees. You are within it.")
    sectors = [s for s in (program.get("sectors") or ["any"])]
    specific = "any" not in sectors
    if specific:
        sec_hits = [s for s in profile["sectors"] if s in sectors]
        if sec_hits:
            add("yes", "Focused on " + _join(sec_hits) + ", your area.")
            focus.append("Focused on " + _join(sec_hits) + ", your area.")
        elif profile["sectors"]:
            add("no", "Focused on " + _join(sectors))
        else:
            add("maybe", "Focused on " + _join(sectors) + "; add your sector to check.", "sectors")
    aud_hits = [a for a in profile["audiences"] if a in (program.get("audiences") or [])]
    if aud_hits and not restricted:
        add("yes", "Designed for " + _join([AUDIENCE_LABEL[a] for a in aud_hits]) + " founders.")
        tailored.append("Designed for " + _join([AUDIENCE_LABEL[a] for a in aud_hits]) + " founders.")
    if req.get("incorporated"):
        if profile["incorporated"] is True:
            add("yes", "Needs an incorporated company. You have one.")
        elif profile["incorporated"] is False:
            add("later", "Needs an incorporated company.")
        else:
            add("maybe", "Requires an incorporated company; say whether you are incorporated to check.", "incorporated")
    if req.get("min_employees") is not None:
        if emp is None:
            add("maybe", f"Needs at least {req['min_employees']} full-time employees; add your team size to check", "employees")
        elif emp < req["min_employees"]:
            add("later", f"Needs at least {req['min_employees']} full-time employees.")
        else:
            add("yes", f"Needs at least {req['min_employees']} employees. You have them.")
    a_state = _worst(facets)
    blocking = next((f for f in facets if f["state"] == a_state), None)
    if a_state == "yes":
        a_text = ("You meet what they ask for." + (" " + (tailored + focus)[0] if tailored or focus else "")) if facets else "Nothing rules you out."
    else:
        a_text = blocking["text"]
    apply_check = {"key": "apply", "q": CHECK_Q["apply"], "state": a_state, "text": a_text, "items": facets, **({"ask": blocking["ask"]} if blocking and blocking.get("ask") else {})}

    # 2. Is it for my stage?
    stages = [s for s in (program.get("stages") or STAGES) if s in STAGES] or list(STAGES)
    si = STAGES.index(profile["stage"])
    if profile["stage"] in stages:
        if len(stages) >= 4:
            stage_check = {"key": "stage", "q": CHECK_Q["stage"], "state": "yes", "text": f"Open to companies at any stage, including yours ({STAGE_LABEL[profile['stage']]})."}
        else:
            stage_check = {"key": "stage", "q": CHECK_Q["stage"], "state": "yes", "text": f"Built for founders at your stage ({STAGE_LABEL[profile['stage']]})."}
    else:
        earliest = min(STAGES.index(s) for s in stages)
        latest = max(STAGES.index(s) for s in stages)
        if si > latest:
            stage_check = {"key": "stage", "q": CHECK_Q["stage"], "state": "no", "text": "Aimed at earlier-stage companies"}
        else:
            stage_check = {"key": "stage", "q": CHECK_Q["stage"], "state": "later", "text": f"Aimed at companies that are {STAGE_LABEL[STAGES[earliest]]} or further along."}

    # 3. Does it give me what I need?
    provides = program.get("needs") or []
    hits = [n for n in profile["needs"] if n in provides]
    misses = [n for n in profile["needs"] if n not in provides]
    if hits:
        text = "Gives you " + _join([NEED_LABEL[n] for n in hits[:3]]) + ", which you asked for."
        if misses:
            text += " It does not cover " + _join([NEED_LABEL[n] for n in misses[:3]]) + "."
        need_check = {"key": "need", "q": CHECK_Q["need"], "state": "yes", "text": text}
    elif profile["needs"]:
        text = "Does not cover what you asked for (" + _join([NEED_LABEL[n] for n in profile["needs"][:3]]) + ")."
        if provides:
            text += " It offers " + _join([NEED_LABEL[n] for n in provides[:3] if n in NEED_LABEL]) + "."
        need_check = {"key": "need", "q": CHECK_Q["need"], "state": "no", "text": text}
    else:
        need_check = {"key": "need", "q": CHECK_Q["need"], "state": "maybe", "text": "You have not said what you need, so this cannot be checked yet.", "ask": "needs"}

    # 4. Can I apply now?
    status = effective_status(program, today)
    dl = program.get("deadline") or {}
    days = _days_until(dl.get("date"), today) if dl.get("kind") == "fixed" else None
    if status == "closed":
        timing_check = {"key": "timing", "q": CHECK_Q["timing"], "state": "no", "text": ("Closed right now. " + (dl.get("note") or "")).strip()}
    elif status == "paused":
        timing_check = {"key": "timing", "q": CHECK_Q["timing"], "state": "no", "text": ("Paused. " + (dl.get("note") or "")).strip()}
    elif days is not None:
        timing_check = {"key": "timing", "q": CHECK_Q["timing"], "state": "yes", "text": f"Closes in {days} day{'' if days == 1 else 's'} ({dl.get('date')})."}
    elif status in ("open", "rolling"):
        timing_check = {"key": "timing", "q": CHECK_Q["timing"], "state": "yes", "text": "Taking applications now" + (": " + dl["note"] if dl.get("kind") == "rolling" and dl.get("note") else ".")}
    else:
        timing_check = {"key": "timing", "q": CHECK_Q["timing"], "state": "maybe", "text": "No deadline was published, so check the site before planning around it."}

    checks = [apply_check, stage_check, need_check, timing_check]

    # The order inside a match group: live before closed, made for you before merely open to you, more needs covered,
    # sooner deadline, then how sure we are of the details. Packed into one number, used for sorting only.
    live = 0 if status in ("closed", "paused") else 1
    urgency = 3 if (days is not None and days <= 60) else 2 if status == "open" else 1 if status == "rolling" else 0
    trust = {"official": 2, "third_party": 1}.get(program.get("verified") or "unconfirmed", 0)
    score = live * 10000 + (len(tailored) + len(focus)) * 1000 + min(3, len(hits)) * 100 + urgency * 10 + trust

    # Reasons and cautions are the same answers, flattened to sentences for the places that show one line.
    reasons = tailored + ([need_check["text"]] if need_check["state"] == "yes" else []) + focus + ([timing_check["text"]] if timing_check["state"] == "yes" else []) + ([stage_check["text"]] if stage_check["state"] == "yes" else [])
    steps = [f["text"] for f in facets if f["state"] == "later"] + ([stage_check["text"]] if stage_check["state"] == "later" else [])
    cautions = steps + [f["text"] for f in facets if f["state"] in ("maybe", "no")]
    cautions += [c["text"] for c in (need_check, timing_check) if c["state"] != "yes"]
    if program.get("verified") == "unconfirmed":
        cautions.append("We could not confirm the current details. Check the program page.")
    out = {"score": score, "reasons": [r for r in reasons if r], "cautions": cautions, "skip": "", "checks": checks}

    stopper = next((c for c in (apply_check, stage_check) if c["state"] == "no"), None)
    if stopper:
        why = blocking["text"] if stopper is apply_check else stopper["text"]
        return {**out, "fit": "skip", "score": 0, "reasons": [], "cautions": [], "skip": why}
    if "later" in (apply_check["state"], stage_check["state"]):
        return {**out, "fit": "later"}
    if apply_check["state"] == "yes" and stage_check["state"] == "yes" and need_check["state"] == "yes":
        return {**out, "fit": "strong"}
    return {**out, "fit": "possible"}


def _brief(program: Dict[str, Any]) -> Dict[str, Any]:
    keys = ["id", "name", "org", "level", "type", "summary", "amount", "stages", "audiences", "needs", "sectors", "provinces", "requirements",
            "deadline", "status", "phase", "apply_url", "link_label", "link_kind", "link_note", "link_exact", "source_url", "verified", "last_checked", "restricted_to", "community"]
    return {k: program.get(k) for k in keys if k in program}


def _verdict(p: Dict[str, Any], profile: Dict[str, Any], today: date) -> Dict[str, Any]:
    """What a card needs to show about one program for one founder: the match, the sentences and the four answers.
    A program that is not matched carries its one reason in `cautions`, so the card can say why."""
    ev = evaluate(p, profile, today)
    if ev["fit"] == "skip":
        return {"fit": "skip", "score": 0, "reasons": [], "cautions": [ev["skip"]], "checks": ev["checks"]}
    return {"fit": ev["fit"], "score": ev["score"], "reasons": ev["reasons"], "cautions": ev["cautions"], "checks": ev["checks"]}


def suggest(programs: List[Dict[str, Any]], raw_profile: Optional[Dict[str, Any]], today: Optional[date] = None, limit: int = 8) -> Dict[str, Any]:
    today = today or date.today()
    profile = normalize_profile(raw_profile)
    strong: List[Dict[str, Any]] = []
    possible: List[Dict[str, Any]] = []
    later: List[Dict[str, Any]] = []
    skipped = 0
    others: List[Dict[str, Any]] = []
    for p in programs:
        ev = evaluate(p, profile, today)
        if ev["fit"] == "skip":
            skipped += 1
            # Not left out, just not matched: the founder can still look, and sees why it does not line up.
            others.append({**_brief(p), "status": effective_status(p, today), **_verdict(p, profile, today)})
            continue
        row = {**_brief(p), "status": effective_status(p, today), **_verdict(p, profile, today)}
        {"strong": strong, "possible": possible, "later": later}[ev["fit"]].append(row)
    for bucket in (strong, possible, later):
        bucket.sort(key=lambda r: (-r["score"], r["name"]))
    ranked = strong + possible
    live_rank = {"open": 0, "rolling": 1, "check": 2, "closed": 3, "paused": 3}
    others.sort(key=lambda r: (live_rank.get(r["status"], 2), r["name"]))
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
        "others": others,
        "path": path,
        "trajectory": trajectory(programs, profile, today),
        "summary": summary_text(profile, ranked, later),
        "as_of": today.isoformat(),
    }


def _anytime(p: Dict[str, Any]) -> bool:
    """Not tied to a stage: resources, and anything that serves four or more of the five stages."""
    st = [x for x in (p.get("stages") or STAGES) if x in STAGES]
    return p.get("type") == "resource" or len(st) >= 4 or not st


def trajectory(programs: List[Dict[str, Any]], raw_profile: Optional[Dict[str, Any]], today: Optional[date] = None, per_stage: int = 3, any_limit: int = 6, current_limit: int = 5) -> Dict[str, Any]:
    """Where the founder came from, where they are and where they are going.

    Not every program lines up with a stage, and the route does not pretend they do. Programs aimed at particular stages sit
    on the route: behind you are those that end at a stage you have passed, ahead are those that first open at a later stage,
    and the current column holds what fits right now. A column can be short or empty. Programs that are not tied to a stage
    (resources, and anything serving four or more stages) go in "anytime". The same hard rules (province, age, group,
    sector) apply to everything, and a program is shown once."""
    today = today or date.today()
    profile = normalize_profile(raw_profile)
    cur = STAGES.index(profile["stage"])
    state_of = lambda i: "past" if i < cur else "current" if i == cur else "future"

    def usable(p: Dict[str, Any], stage: str):
        ev = evaluate(p, {**profile, "stage": stage}, today)
        return None if ev["fit"] == "skip" else ev

    stages_out: List[Dict[str, Any]] = []
    for i, stage in enumerate(STAGES):
        state = state_of(i)
        rows = []
        for p in programs:
            if _anytime(p):
                continue
            st_list = [x for x in (p.get("stages") or STAGES) if x in STAGES]
            first, last = min(STAGES.index(x) for x in st_list), max(STAGES.index(x) for x in st_list)
            if state == "past" and last != i:
                continue
            if state == "future" and first != i:
                continue
            if state == "current" and stage not in st_list:
                continue
            ev = usable(p, stage)
            if ev is None:
                continue
            status = effective_status(p, today)
            if status in ("closed", "paused") and state != "past":
                continue
            live = 0 if state == "current" or status in ("open", "rolling") else 1 if status == "check" else 2
            rows.append((live, -ev["score"], p["name"], p, ev, status, first, last))
        rows.sort(key=lambda r: r[:3])
        picked: List[Any] = []
        limit = current_limit if state == "current" else per_stage
        # Mix the column: at most two of one kind first, then fill any gaps from what is left.
        for cap in (2, limit):
            for r in rows:
                if len(picked) >= limit:
                    break
                if r in picked or sum(1 for x in picked if x[3].get("type") == r[3].get("type")) >= cap:
                    continue
                picked.append(r)
        picked.sort(key=lambda r: r[:3])
        out = []
        for _live, _s, _n, p, ev, status, first, last in picked:
            if state == "future":
                note = f"Opens up at the {STAGE_LABEL[stage]} stage."
                if ev["cautions"]:
                    note += " " + ev["cautions"][0]
            elif state == "past":
                note = "Aimed at this stage and earlier. You may have used it, or skipped it."
            else:
                note = _why({**_brief(p), "reasons": ev["reasons"]})
            out.append({**_brief(p), "status": status, **_verdict(p, profile, today), "note": note})
        stages_out.append({"stage": stage, "label": STAGE_LABEL[stage], "hint": STAGE_HINT[stage], "state": state, "available": len(rows), "programs": out})

    anytime_rows = []
    for p in programs:
        if not _anytime(p):
            continue
        ev = usable(p, profile["stage"])
        status = effective_status(p, today)
        if ev is None or status in ("closed", "paused"):
            continue
        live = 0 if status in ("open", "rolling") else 1
        anytime_rows.append((live, -ev["score"], p["name"], p, ev, status))
    anytime_rows.sort(key=lambda r: r[:3])
    anytime = [{**_brief(p), "status": status, **_verdict(p, profile, today), "note": p.get("summary", "")} for _l, _s, _n, p, ev, status in anytime_rows[:any_limit]]

    nxt = stages_out[cur + 1] if cur + 1 < len(stages_out) else None
    story = ""
    if cur > 0:
        story += f"You've come through {_join([c['label'] for c in stages_out[:cur]])}. "
    story += f"Right now you're {STAGE_NOW[profile['stage']]}. "
    if nxt:
        names = [r["name"] for r in nxt["programs"][:2]]
        if len(names) > 1:
            story += f"Next up is {nxt['label']}, where {_join(names)} come into reach."
        elif names:
            story += f"Next up is {nxt['label']}, where {names[0]} comes into reach."
        else:
            story += f"Next up is {nxt['label']}. Nothing new opens up there, so lean on what already fits."
    else:
        story += "You're at the top of the ladder, so the focus now is scaling and export."
    return {"current": profile["stage"], "index": cur, "stages": stages_out, "anytime": anytime, "anytime_total": len(anytime_rows), "story": story}


# What founders most often want at each stage. Only used to put the likely choices first when someone has not picked anything yet.
STAGE_GOALS = {
    "idea": ["mentorship", "training", "funding"], "prototype": ["funding", "mentorship", "space"], "launched": ["customers", "funding", "network"],
    "revenue": ["funding", "export", "talent"], "growth": ["export", "talent", "funding"],
}
ROUTE_PER_GOAL = 2   # resources shown under each thing the founder wants
ROUTE_COMING_UP = 3  # resources previewed for the next stage


def _route_options(ranked: List[Dict[str, Any]], profile: Dict[str, Any]) -> List[Dict[str, Any]]:
    """The things a founder can ask for next. Only what the directory can actually deliver for this founder: a need is offered when at
    least one live (open, rolling or dates-not-posted) resource that suits them covers it, with that number shown. Needs they already
    picked always stay, so a choice never vanishes. Likely-for-this-stage first, then the best-covered."""
    out = []
    for k in NEEDS:
        n = sum(1 for r in ranked if k in (r.get("needs") or []) and r["status"] in ("open", "rolling", "check"))
        if n or k in profile["needs"]:
            out.append({"key": k, "label": NEED_LABEL[k], "common": k in STAGE_GOALS[profile["stage"]], "count": n})
    out.sort(key=lambda o: (0 if o["common"] else 1, -o["count"]))
    return out


def route_plan(programs: List[Dict[str, Any]], raw_profile: Optional[Dict[str, Any]], tracked: Optional[List[Dict[str, Any]]] = None,
               today: Optional[date] = None) -> Dict[str, Any]:
    """The founder's path: for each thing they want next (their `needs`, in the order they chose them), the few resources worth
    using for it, best first, each with the four-question verdict and the exact page. Then a short preview of what opens up at
    the next stage. A resource is shown once, under the first thing it helps with. Resources already marked done are left out
    here (they are listed under what the founder has used). Closed or paused ones only appear when too few are open."""
    today = today or date.today()
    profile = normalize_profile(raw_profile)
    cur = STAGES.index(profile["stage"])
    res = suggest(programs, profile, today, limit=len(programs) + 1)
    mine = {t.get("id"): t for t in (tracked or [])}
    done = {i for i, t in mine.items() if t.get("state") == "done"}
    ranked = [r for r in res["matches"] if r["id"] not in done]
    used: set = set()
    steps = []
    for need in profile["needs"]:
        fits = [r for r in ranked if need in (r.get("needs") or []) and r["id"] not in used]
        live = [r for r in fits if r["status"] in ("open", "rolling", "check")]
        waiting = [r for r in fits if r["status"] in ("closed", "paused")]
        live.sort(key=lambda r: 0 if (mine.get(r["id"]) or {}).get("state") == "in" else 1)  # what you are already in comes first (stable)
        picks = live[:ROUTE_PER_GOAL]
        if len(picks) < 2:
            picks = picks + waiting[:2 - len(picks)]
        used.update(r["id"] for r in picks)
        steps.append({"need": need, "label": NEED_LABEL[need], "title": "To get " + NEED_LABEL[need],
                      "resources": [{**r, "mine": (mine.get(r["id"]) or {}).get("state", "")} for r in picks],
                      "more": max(0, len(live) - ROUTE_PER_GOAL)})
    nxt = STAGES[cur + 1] if cur + 1 < len(STAGES) else None
    coming = None
    if nxt:
        col = res["trajectory"]["stages"][cur + 1]
        rows = [r for r in col["programs"] if r["id"] not in used and r["id"] not in done][:ROUTE_COMING_UP]
        coming = {"stage": nxt, "label": STAGE_LABEL[nxt], "hint": STAGE_HINT[nxt], "programs": rows}
    return {
        "stage": profile["stage"], "label": STAGE_LABEL[profile["stage"]], "goal": profile["goal"], "needs": profile["needs"],
        "options": _route_options(ranked, profile),
        "steps": steps, "coming_up": coming, "next": nxt, "as_of": today.isoformat(),
    }


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


# ---------- programs a founder is in, or has been part of ----------
TRACK_STATES = ("in", "done", "none")
MAX_TRACKED = 60


def update_tracked(items: Optional[List[Dict[str, Any]]], body: Dict[str, Any], default_stage: str = "idea", today: Optional[date] = None) -> List[Dict[str, Any]]:
    """Add, change or remove one entry in the account's "programs I'm in / have done" list. Raises ValueError with a readable message.

    state "in" = in it now, "done" = took part before, "none" = remove. `stage` is the company stage it happened at."""
    today = today or date.today()
    rows = [i for i in (items or []) if isinstance(i, dict) and i.get("id")]
    state = str(body.get("state") or "")
    if state not in TRACK_STATES:
        raise ValueError("Choose in, done or none")
    pid = str(body.get("id") or "").strip()[:80]
    if state == "none":
        return [i for i in rows if i["id"] != pid]
    name = " ".join(str(body.get("name") or "").split())[:120]
    if len(name) < 2:
        raise ValueError("Give the program a name")
    stage = str(body.get("stage") or "").strip().lower()
    if stage not in STAGES:
        stage = default_stage if default_stage in STAGES else "idea"
    kind = str(body.get("type") or "")
    row = {"id": pid or "m-" + uuid.uuid4().hex[:8], "name": name, "org": " ".join(str(body.get("org") or "").split())[:120],
           "type": kind if kind in TYPES else "", "state": state, "stage": stage, "at": today.isoformat()}
    out = [i for i in rows if i["id"] != row["id"]] + [row]
    if len(out) > MAX_TRACKED:
        raise ValueError(f"You can track up to {MAX_TRACKED} programs")
    return out


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
