"""The talent pool: skilled people and startups across Canada who have chosen to be found.

Opt-in by design. Nothing here is shown until a person turns "Show me in Talent" on, and a card only ever carries what they typed into their
talent profile (headline, skills, what they are open to, where they are) plus their name and photo. Never an email address: the only way to reach
someone is a message request they can accept or decline (see routes/talent.py).

This file is pure rules (no database), so the same ranking can be tested without one."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

PROVINCES = ["ON", "BC", "AB", "SK", "MB", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"]

# key -> (label, the skills people tick under it). Founders filter by category first, then by a skill.
CATEGORIES: Dict[str, Dict[str, Any]] = {
    "engineering": {"label": "Engineering", "skills": ["Frontend", "Backend", "Full-stack", "Mobile (iOS/Android)", "DevOps and cloud", "Security", "QA and testing", "Hardware and embedded"]},
    "data_ai": {"label": "Data and AI", "skills": ["Machine learning", "Data analysis", "Data engineering", "AI products and prompts", "Analytics and BI"]},
    "design": {"label": "Design", "skills": ["Product design", "UX research", "Brand and identity", "Graphic design", "Motion and video", "Web design"]},
    "product": {"label": "Product", "skills": ["Product management", "Project management", "Technical writing", "Business analysis"]},
    "marketing": {"label": "Marketing", "skills": ["Growth marketing", "SEO and content", "Paid ads", "Social media", "Email and CRM", "PR and comms", "Brand strategy"]},
    "sales": {"label": "Sales", "skills": ["Outbound sales", "Enterprise sales", "Account management", "Partnerships", "Sales operations", "Business development"]},
    "finance": {"label": "Finance and accounting", "skills": ["Accounting", "Bookkeeping", "Tax", "SR&ED claims", "Fractional CFO", "Fundraising support", "Financial modelling", "Payroll"]},
    "operations": {"label": "Operations", "skills": ["Operations", "Supply chain", "Procurement", "Customer support", "Customer success", "Office and admin"]},
    "legal": {"label": "Legal and compliance", "skills": ["Corporate law", "Intellectual property", "Contracts", "Privacy and compliance", "Immigration"]},
    "people": {"label": "People and HR", "skills": ["Recruiting", "HR", "Coaching", "Training and facilitation"]},
    "other": {"label": "Something else", "skills": []},
}
OPEN_TO = {"full_time": "Full-time", "part_time": "Part-time", "contract": "Contract or freelance", "co_founder": "Co-founding", "advising": "Advising", "internship": "Internship"}
AVAILABILITY = {"now": "Available now", "soon": "Within a month", "exploring": "Just exploring"}
WORK_MODE = {"remote": "Remote", "hybrid": "Hybrid", "onsite": "On site"}
EXPERIENCE = {"junior": "0 to 2 years", "mid": "3 to 5 years", "senior": "6 to 10 years", "lead": "10+ years"}

MAX_SKILLS = 12
_SKILL_LABELS = {s.lower(): s for c in CATEGORIES.values() for s in c["skills"]}


def options() -> Dict[str, Any]:
    return {
        "categories": [{"key": k, "label": v["label"], "skills": v["skills"]} for k, v in CATEGORIES.items()],
        "open_to": [{"key": k, "label": v} for k, v in OPEN_TO.items()],
        "availability": [{"key": k, "label": v} for k, v in AVAILABILITY.items()],
        "work_mode": [{"key": k, "label": v} for k, v in WORK_MODE.items()],
        "experience": [{"key": k, "label": v} for k, v in EXPERIENCE.items()],
        "provinces": PROVINCES,
    }


def _pick(raw: Any, allowed) -> List[str]:
    out: List[str] = []
    for v in raw if isinstance(raw, (list, tuple)) else []:
        v = str(v).strip().lower()
        if v in allowed and v not in out:
            out.append(v)
    return out


def _one(raw: Any, allowed) -> str:
    v = str(raw or "").strip().lower()
    return v if v in allowed else ""


def _text(raw: Any, n: int) -> str:
    return re.sub(r"\s+", " ", str(raw or "")).strip()[:n]


def clean_skills(raw: Any) -> List[str]:
    """Known skills keep their proper spelling; a few of a person's own are allowed too (short, letters and common marks only)."""
    out: List[str] = []
    for v in raw if isinstance(raw, (list, tuple)) else []:
        s = _text(v, 40)
        if not s or not re.fullmatch(r"[\w .+#&/()\-]+", s):
            continue
        s = _SKILL_LABELS.get(s.lower(), s)
        if s.lower() not in {x.lower() for x in out}:
            out.append(s)
    return out[:MAX_SKILLS]


def clean_profile(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    raw = raw or {}
    prov = str(raw.get("province") or "").strip().upper()
    return {
        "listed": bool(raw.get("listed")),
        "headline": _text(raw.get("headline"), 90),
        "about": _text(raw.get("about"), 400),
        "categories": _pick(raw.get("categories"), CATEGORIES)[:4],
        "skills": clean_skills(raw.get("skills")),
        "open_to": _pick(raw.get("open_to"), OPEN_TO),
        "availability": _one(raw.get("availability"), AVAILABILITY),
        "work_mode": _pick(raw.get("work_mode"), WORK_MODE),
        "experience": _one(raw.get("experience"), EXPERIENCE),
        "province": prov if prov in PROVINCES else "",
        "city": _text(raw.get("city"), 60),
        # The startup side: show my startup to talent, and which kinds of people it is looking for.
        "startup_listed": bool(raw.get("startup_listed")),
        "hiring_for": _pick(raw.get("hiring_for"), CATEGORIES)[:6],
        "hiring_note": _text(raw.get("hiring_note"), 200),
    }


def is_complete(t: Dict[str, Any]) -> bool:
    """Enough to be worth listing: a headline, at least one category and one thing they are open to."""
    return bool(t.get("headline") and t.get("categories") and t.get("open_to"))


def person_card(acc: Dict[str, Any]) -> Dict[str, Any]:
    t = acc.get("talent") or {}
    st = acc.get("startup") or {}
    return {
        "id": acc["id"], "name": acc.get("name") or "", "avatar_url": acc.get("avatar_url"),
        "headline": t.get("headline", ""), "about": t.get("about", ""), "categories": t.get("categories", []), "skills": t.get("skills", []),
        "open_to": t.get("open_to", []), "availability": t.get("availability", ""), "work_mode": t.get("work_mode", []), "experience": t.get("experience", ""),
        "province": t.get("province", ""), "city": t.get("city", ""),
        "company": st.get("name") or acc.get("company") or "",
        "photos": (acc.get("photos") or [])[:4], "location": acc.get("location") or "",
    }


def startup_card(acc: Dict[str, Any]) -> Dict[str, Any]:
    t = acc.get("talent") or {}
    st = acc.get("startup") or {}
    return {
        "id": acc["id"], "name": st.get("name") or "", "one_liner": st.get("one_liner") or "", "stage": st.get("stage") or "", "sectors": st.get("sectors") or [],
        "province": st.get("province") or t.get("province", ""), "city": t.get("city", ""), "employees": st.get("employees"),
        "hiring_for": t.get("hiring_for", []), "hiring_note": t.get("hiring_note", ""),
        "founder": {"name": acc.get("name") or "", "avatar_url": acc.get("avatar_url")},
    }


def listed_person(acc: Dict[str, Any]) -> bool:
    t = acc.get("talent") or {}
    return bool(t.get("listed") and is_complete(t))


def listed_startup(acc: Dict[str, Any]) -> bool:
    t = acc.get("talent") or {}
    st = acc.get("startup") or {}
    return bool(t.get("startup_listed") and st.get("name"))


def _haystack(c: Dict[str, Any]) -> str:
    return " ".join([c.get("name", ""), c.get("headline", ""), c.get("about", ""), c.get("company", ""), c.get("city", ""), " ".join(c.get("skills", [])),
                     " ".join(CATEGORIES[k]["label"] for k in c.get("categories", []) if k in CATEGORIES)]).lower()


def rank_people(cards: List[Dict[str, Any]], viewer: Dict[str, Any], f: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Filter, then order by how well each person fits what this viewer is looking for. `viewer` is {province, hiring_for, needs_talent}.
    Every card gets `reasons`: the short, true lines that explain why it is where it is."""
    q = (f.get("q") or "").strip().lower()
    out = []
    for c in cards:
        if f.get("category") and f["category"] not in c["categories"]:
            continue
        if f.get("skill") and f["skill"].lower() not in [s.lower() for s in c["skills"]]:
            continue
        if f.get("open_to") and f["open_to"] not in c["open_to"]:
            continue
        if f.get("province") and c["province"] != f["province"] and "remote" not in c["work_mode"]:
            continue
        if f.get("remote") and "remote" not in c["work_mode"]:
            continue
        if f.get("available") and c["availability"] not in ("now", "soon"):
            continue
        if q and q not in _haystack(c):
            continue
        score, reasons = 0, []
        want = [k for k in viewer.get("hiring_for", []) if k in c["categories"]]
        for k in want:
            score += 6
            reasons.append(f"{CATEGORIES[k]['label']}, which you are looking for.")
        if viewer.get("province") and c["province"] == viewer["province"]:
            score += 3
            reasons.append(f"In {c['city'] + ', ' if c['city'] else ''}{c['province']}, your province.")
        elif "remote" in c["work_mode"]:
            score += 1
            reasons.append("Works remotely, so location is not a barrier.")
        if c["availability"] == "now":
            score += 2
            reasons.append("Available now.")
        elif c["availability"] == "soon":
            score += 1
        if f.get("open_to") is None and viewer.get("needs_talent") and ("full_time" in c["open_to"] or "contract" in c["open_to"] or "part_time" in c["open_to"]):
            score += 1
        out.append({**c, "reasons": reasons[:3], "score": score})
    out.sort(key=lambda c: (-c["score"], (c["name"] or "").lower()))
    return out


def rank_startups(cards: List[Dict[str, Any]], viewer: Dict[str, Any], f: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Startups for skilled people to find. `viewer` is {province, categories, skills} of the person looking."""
    q = (f.get("q") or "").strip().lower()
    out = []
    for c in cards:
        if f.get("category") and f["category"] not in c["hiring_for"]:
            continue
        if f.get("province") and c["province"] != f["province"]:
            continue
        if q and q not in " ".join([c["name"], c["one_liner"], c["city"], " ".join(c["sectors"]), c["hiring_note"]]).lower():
            continue
        score, reasons = 0, []
        hit = [k for k in viewer.get("categories", []) if k in c["hiring_for"]]
        for k in hit:
            score += 6
            reasons.append(f"Looking for {CATEGORIES[k]['label'].lower()}, which is what you do.")
        if viewer.get("province") and c["province"] == viewer["province"]:
            score += 3
            reasons.append(f"In {c['province']}, your province.")
        out.append({**c, "reasons": reasons[:3], "score": score})
    out.sort(key=lambda c: (-c["score"], (c["name"] or "").lower()))
    return out


def public_extras(p: Dict[str, Any]) -> Dict[str, Any]:
    """What a platform profile may show beyond name, photo and bio: the talent profile and the startup, each only if the person chose to list it.
    `p` is a directory person (see directory.person_by_email). Never an email or contact detail."""
    acc = {"id": p.get("id") or "", "name": p.get("name"), "avatar_url": p.get("avatar_url"), "company": p.get("company"), "photos": p.get("photos"),
           "talent": p.get("talent") or {}, "startup": p.get("startup") or {}, "location": p.get("location")}
    person = person_card(acc) if listed_person(acc) else None
    startup = startup_card(acc) if listed_startup(acc) else None
    loc = ""
    if person:
        loc = ", ".join(x for x in (person["city"], person["province"]) if x)
    return {"id": p.get("id"), "location": loc or (p.get("location") or ""), "talent": person, "startup": startup}
