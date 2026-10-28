"""The Navigator's guide: a chat you can ask about programs, deadlines, eligibility and communities, plus the "next steps"
feed that sits on the Hub. Both read the ONE profile on the person's account, so when the profile changes, or a community
changes its programs, every answer changes with it: nothing here stores results, it is all worked out on each request.

Rules first, always: every sentence below is built from the catalog entry and the matching rules in navigator.py, so the
guide can say "I do not know" but cannot invent a program, an amount or a date. A language model may reword the reply
(routes/navigator.py) but only ever sees these same facts. The JS twin for the in-browser demo is
frontend/src/lib/navigatorGuide.js; tests/test_navigator_guide_parity.py keeps the two identical."""
from __future__ import annotations

import re
from datetime import date
from typing import Any, Dict, List, Optional

import navigator as nav

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# Short names people actually type. Anything not listed here is still found by its full name.
ALIASES: Dict[str, List[str]] = {
    "irap": ["irap", "nrc irap"], "sred": ["sr&ed", "sred", "sr and ed"], "oitc": ["oitc", "innovation tax credit"],
    "canexport-smes": ["canexport"], "csbfp": ["csbfp", "small business financing"], "futurpreneur-core": ["futurpreneur"],
    "futurpreneur-newcomer": ["futurpreneur newcomer", "futurpreneur for newcomers"], "belf": ["belf", "black entrepreneurship loan"],
    "dmz-bip": ["dmz"], "indigenous-growth-fund": ["indigenous growth fund", "indigenous growth"], "wef": ["wef", "women entrepreneurship fund"],
    "communitech-fierce-founders": ["fierce founders", "communitech"], "venturelab-hci": ["venturelab", "hardware catalyst"],
    "velocity": ["velocity"], "ovin-rd": ["ovin"], "mitacs-accelerate": ["mitacs"], "summer-company": ["summer company"],
    "starter-company-plus": ["starter company"], "bmo-launch-me": ["bmo launch me", "launch me"], "bdc-capital": ["bdc"],
    "startup-visa": ["start-up visa", "startup visa"],
}
TYPE_WORDS = [("tax credit", "tax_credit"), ("grant", "grant"), ("loan", "loan"), ("accelerator", "accelerator"), ("incubator", "incubator"),
              ("competition", "competition"), ("pitch", "competition"), ("investor", "investor"), ("venture capital", "investor"), ("visa", "immigration"),
              ("immigration", "immigration")]
TYPE_NOUN = {"grant": "grants", "loan": "loans", "tax_credit": "tax credits", "accelerator": "accelerators", "incubator": "incubators",
             "competition": "competitions", "investor": "investors", "immigration": "immigration routes"}
W = {
    "profile": ["my profile", "about me", "know about me", "where am i", "my startup", "what do you know"],
    "communities": ["communit", "join", "network", "cohort"],
    "deadline": ["deadline", "closing", "closes", "close soon", "due", "when does", "last day", "running out"],
    "next": ["next", "first", "start", "what should i", "where do i", "path", "plan", "recommend", "suggest", "best", "advice", "help me"],
    "eligible": ["eligible", "eligib", "qualify", "can i apply", "can we apply", "am i able", "do i meet", "requirements", "require"],
    "amount": ["how much", "amount", "worth", "money", "funding amount", "size of"],
    "compare": ["compare", " vs ", "versus", "difference between", "which is better"],
    "hello": ["hi", "hello", "hey", "help", "what can you do", "who are you"],
}
GENERIC = {"program", "fund", "the", "canada", "ontario", "startup", "start", "small", "business", "capital", "venture", "women", "black", "plus", "university"}


def _fmt_date(iso: Optional[str]) -> str:
    try:
        d = date.fromisoformat(str(iso)[:10])
        return f"{MONTHS[d.month - 1]} {d.day}, {d.year}"
    except (TypeError, ValueError):
        return str(iso or "")


def _has(q: str, words: List[str]) -> bool:
    """Short words ("due", "hi") only count as whole words, so "introduce" is not a deadline question."""
    return any((re.search(r"(?<![a-z0-9])" + re.escape(w) + r"(?![a-z0-9])", q) if len(w) <= 4 and not w.startswith(" ") else w in q) for w in words)


def _s(text: Any) -> str:
    """One tidy sentence: trimmed, and ended with a full stop when the source note did not."""
    t = " ".join(str(text or "").split())
    return t if not t or t[-1] in ".!?" else t + "."


def _aliases(p: Dict[str, Any]) -> List[str]:
    name = str(p.get("name") or "").lower()
    out = [name, re.sub(r"\s*\(.*?\)\s*", " ", name).strip()] + ALIASES.get(p.get("id"), [])
    return [a for a in dict.fromkeys(out) if len(a) >= 3]


def find_programs(q: str, programs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Programs named in the question, longest match first (so "futurpreneur newcomer" beats "futurpreneur")."""
    hits = []
    for p in programs:
        best = 0
        for a in _aliases(p):
            if re.search(r"(?<![a-z0-9])" + re.escape(a) + r"(?![a-z0-9])", q):
                best = max(best, len(a))
        if best:
            hits.append((best, p))
    hits.sort(key=lambda h: (-h[0], str(h[1].get("name"))))
    return [p for _, p in hits[:2]]


def deadline_text(p: Dict[str, Any], today: date) -> str:
    return _s(_deadline_text(p, today))


def _deadline_text(p: Dict[str, Any], today: date) -> str:
    st = nav.effective_status(p, today)
    dl = p.get("deadline") or {}
    kind = dl.get("kind")
    if st == "paused":
        return "It is paused right now. " + (dl.get("note") or "")
    if kind == "fixed":
        d = nav._days_until(dl.get("date"), today)
        if d is None:
            return "Check the program page for the deadline."
        if d < 0:
            return f"The deadline was {_fmt_date(dl.get('date'))}. It has closed."
        return f"It closes {_fmt_date(dl.get('date'))}, in {d} day{'' if d == 1 else 's'}."
    if st == "closed" or kind == "closed":
        return "It is closed right now. " + (dl.get("note") or "")
    if kind == "rolling":
        return "Intake is rolling, so there is no fixed deadline." + (" " + dl["note"] if dl.get("note") else "")
    if kind == "annual":
        return _s(dl.get("note") or "It runs once a year") + " Check the page for this year's date."
    return "No deadline is published. Check the program page." + (" " + dl["note"] if dl.get("note") else "")


def _row(p: Dict[str, Any], ev: Dict[str, Any], today: date) -> Dict[str, Any]:
    return {**nav._brief(p), "status": nav.effective_status(p, today), "fit": ev["fit"], "score": ev["score"],
            "reasons": ev["reasons"], "cautions": ev["cautions"], "skip": ev.get("skip"), "checks": ev.get("checks")}


FIT_LINE = {"strong": "It looks like a good match for you.", "possible": "It is worth a look.", "later": "Not yet, but it could be a match later."}


def _detail(p: Dict[str, Any], profile: Dict[str, Any], q: str, today: date) -> Dict[str, Any]:
    ev = nav.evaluate(p, profile, today)
    row = _row(p, ev, today)
    fit = FIT_LINE.get(ev["fit"]) or ("Probably not for you. " + _s(ev.get("skip") or "A hard requirement does not match"))
    asks_deadline, asks_amount, asks_elig = _has(q, W["deadline"]), _has(q, W["amount"]), _has(q, W["eligible"])
    parts: List[str] = []
    # The deadline sentence is added separately, so the rule engine's own deadline notes are dropped to avoid saying it twice.
    ev = {**ev, "reasons": [r for r in ev["reasons"] if "deadline" not in r.lower() and not r.startswith("Closes in")],
          "cautions": [c for c in ev["cautions"] if "deadline" not in c.lower() and not c.startswith("Paused")]}
    if asks_deadline:
        parts += [f"{p['name']}: " + deadline_text(p, today), fit]
    elif asks_amount:
        parts += [f"{p['name']}: " + _s(p.get("amount") or "The amount is not published. Check the program page"), fit]
    elif asks_elig:
        parts += [f"{p['name']}: {fit}"]
        parts += ev["reasons"][:2] + ev["cautions"][:2]
        reqs = (p.get("requirements") or [])[:3]
        if reqs:
            parts.append("What they ask for: " + "; ".join(r.rstrip(".") for r in reqs) + ".")
    else:
        parts += [f"{p['name']} ({p.get('org')}): {p.get('summary')}", fit]
        parts += ev["reasons"][:1] + ev["cautions"][:1]
        parts.append(deadline_text(p, today))
    if p.get("verified") != "official":
        parts.append("I could only confirm this through a secondary source, so check the official page before you rely on it.")
    return {"reply": " ".join(_s(x) for x in parts if x), "cards": [row], "focus": p["id"], "intent": "program",
            "suggestions": ["When does it close?", "Am I eligible?", "What should I do next?"]}


def _filter_rank(ranked: List[Dict[str, Any]], key: str, value: str) -> List[Dict[str, Any]]:
    out = [m for m in ranked if (value in (m.get("needs") or []) if key == "need" else m.get("type") == value)]
    live = [m for m in out if m["status"] not in ("closed", "paused")]
    return live or out


def _profile_text(profile: Dict[str, Any], startup: Dict[str, Any], missing: List[str]) -> str:
    bits = [f"you are at the {nav.STAGE_LABEL[profile['stage']]} stage"]
    if profile["needs"]:
        bits.append("looking for " + nav._join([nav.NEED_LABEL[n] for n in profile["needs"][:4]]))
    if profile["sectors"]:
        bits.append("building in " + nav._join(profile["sectors"][:3]))
    if profile["incorporated"] is True:
        bits.append("incorporated")
    elif profile["incorporated"] is False:
        bits.append("not incorporated yet")
    s = "Here is what I have: " + ", ".join(bits) + "."
    if startup.get("name"):
        s = f"For {startup['name']}: " + s[0].lower() + s[1:]
    if missing:
        s += " Add " + nav._join(missing[:3]) + " to your profile and I can be more specific."
    return s


MISSING_LABELS = [("needs", "what you need next"), ("sectors", "what you build"), ("incorporated", "whether you are incorporated"), ("goal", "your next goal"),
                  ("city", "your city"), ("age", "your age or birthday")]


def completeness(startup: Dict[str, Any], account: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    acc = account or {}
    have = {"needs": bool(startup.get("needs")), "sectors": bool(startup.get("sectors")), "incorporated": startup.get("incorporated") is not None,
            "goal": bool(startup.get("goal")), "city": bool(str(acc.get("location") or "").strip()), "age": bool(acc.get("age"))}
    missing = [{"key": k, "label": label} for k, label in MISSING_LABELS if not have[k]]
    total = len(MISSING_LABELS) + 2  # stage + a name or one-liner always count as the starting point
    done = len(MISSING_LABELS) - len(missing) + (1 if startup.get("stage") else 0) + (1 if startup.get("name") or startup.get("one_liner") else 0)
    return {"percent": int(100 * done / total + 0.5), "missing": missing}


def answer(question: str, programs: List[Dict[str, Any]], communities: List[Dict[str, Any]], raw_profile: Optional[Dict[str, Any]],
           today: Optional[date] = None, focus: Optional[str] = None, startup: Optional[Dict[str, Any]] = None, account: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    today = today or date.today()
    q = " " + re.sub(r"\s+", " ", str(question or "").strip().lower()) + " "
    profile = nav.normalize_profile(raw_profile)
    res = nav.suggest(programs, raw_profile, today, limit=60)
    ranked = res["matches"]
    missing = [m["label"] for m in completeness(startup or {}, account)["missing"]]
    base = {"cards": [], "focus": focus, "suggestions": ["What should I do next?", "What is closing soon?", "Which communities fit me?"]}

    named = find_programs(q, programs)
    short = len(q.split()) <= 4 and not _has(q, ["soon", "any", "all", "which", "my"])
    if not named and focus and not _has(q, W["next"] + W["communities"] + W["profile"]) and (re.search(r"(?<![a-z0-9])(it|this|that|them)(?![a-z0-9])", q) or (short and _has(q, W["deadline"] + W["eligible"] + W["amount"]))):
        named = [p for p in programs if p["id"] == focus][:1]

    if len(named) == 2 and _has(q, W["compare"] + [" or ", " and "]):
        a, b = named
        ra, rb = _row(a, nav.evaluate(a, profile, today), today), _row(b, nav.evaluate(b, profile, today), today)
        lines = []
        for p, r in ((a, ra), (b, rb)):
            lines.append(f"{p['name']}: {FIT_LINE.get(r['fit']) or 'Probably not for you.'} " + deadline_text(p, today) + (" " + _s(p["amount"]) if p.get("amount") and len(p["amount"]) < 90 else ""))
        return {**base, "reply": " ".join(lines), "cards": [ra, rb], "intent": "compare", "focus": a["id"]}
    if named:
        return {**base, **_detail(named[0], profile, q, today)}

    if _has(q, W["profile"]):
        return {**base, "reply": _profile_text(profile, startup or {}, missing), "intent": "profile",
                "suggestions": ["What should I do next?", "Which communities fit me?", "What is closing soon?"]}

    if _has(q, W["communities"]):
        coms = nav.rank_communities(communities, raw_profile, limit=3)
        if not coms:
            return {**base, "reply": "No community is a clear fit yet. Communities show up here once they switch on the Navigator and say who they serve.", "intent": "communities"}
        text = "Closest fits: " + " ".join(f"{c['name']}: {_s(c['reasons'][0] if c.get('reasons') else 'a possible fit')}" for c in coms)
        return {**base, "reply": text, "communities": coms, "intent": "communities"}

    if _has(q, W["deadline"]):
        soon = []
        for m in ranked:
            dl = m.get("deadline") or {}
            d = nav._days_until(dl.get("date"), today) if dl.get("kind") == "fixed" else None
            if d is not None and d >= 0 and m["status"] not in ("closed", "paused"):
                soon.append((d, m))
        soon.sort(key=lambda t: (t[0], t[1]["name"]))
        if not soon:
            live = [m for m in ranked if m["status"] == "rolling"][:3]
            t = "Nothing that fits you has a fixed deadline coming up."
            if live:
                t += " These take applications on a rolling basis: " + nav._join([m["name"] for m in live]) + "."
            return {**base, "reply": t, "cards": live, "intent": "deadlines"}
        top = soon[:3]
        return {**base, "reply": "Closing soonest for you: " + " ".join(f"{m['name']} closes {_fmt_date(m['deadline']['date'])}, in {d} day{'' if d == 1 else 's'}." for d, m in top),
                "cards": [m for _, m in top], "intent": "deadlines", "focus": top[0][1]["id"]}

    need_keys = [k for k in nav.NEEDS if any(w in q for w in KEYWORD_WORDS.get(k, []))]
    type_key = next((t for w, t in TYPE_WORDS if w in q), None)
    if need_keys or type_key:
        if type_key:
            pool, label = _filter_rank(ranked, "type", type_key), TYPE_NOUN[type_key]
        else:
            pool, label = _filter_rank(ranked, "need", need_keys[0]), nav.NEED_LABEL[need_keys[0]]
        top = pool[:3]
        if not top:
            return {**base, "reply": f"I do not have {label} that fit you right now. Try the All programs tab, or tell me more about your startup.", "intent": "filter"}
        return {**base, "reply": f"For {label}, the best fits for you: " + " ".join(f"{m['name']}: " + (f"gives you {label}." if type_key is None else _s(nav._why(m))) for m in top), "cards": top, "intent": "filter", "focus": top[0]["id"]}

    if _has(q, W["next"]) or not _has(q, W["hello"]):
        text = res["summary"]
        if res["path"]:
            text += " Your path. " + " ".join(f"{s['label']}: {s['name']}." for s in res["path"])
        if not _has(q, W["next"]):
            text = "I am not sure I understood that, but here is where you stand. " + text
        cards = ranked[:3]
        return {**base, "reply": text, "cards": cards, "intent": "next", "focus": cards[0]["id"] if cards else focus}

    return {**base, "reply": "I can tell you which programs fit you, when they close, whether you qualify, and which communities to join. Ask about one by name, or tap a question below.", "intent": "hello"}


KEYWORD_WORDS = {k: [w for w in v] for k, v in {
    "funding": ["funding", "money", "capital", "cash", "finance"], "mentorship": ["mentor", "coach", "advice"], "space": ["workspace", "office", "co-working", "coworking"],
    "customers": ["customer", "clients", "pilot", "sales"], "export": ["export", "international", "abroad"], "rd": ["r&d", "research", "prototype"],
    "ip": ["patent", "trademark", "intellectual"], "talent": ["hire", "hiring", "talent", "intern", "staff"], "network": ["network", "introduc", "connect"],
    "tax": ["tax"], "training": ["training", "course", "learn", "workshop"], "visa": ["immigra", "visa", "permanent resident", "work permit"],
}.items()}


def home_feed(programs: List[Dict[str, Any]], communities: List[Dict[str, Any]], account: Optional[Dict[str, Any]], today: Optional[date] = None) -> Dict[str, Any]:
    """Everything the Hub's "Your next steps" card shows, worked out from the account's one startup profile."""
    today = today or date.today()
    startup = (account or {}).get("startup") or {}
    comp = completeness(startup, account)
    if not account or not startup.get("stage"):
        return {"signed_in": bool(account), "has_profile": False, "completeness": comp}
    raw = nav.navigator_profile(account)
    res = nav.suggest(programs, raw, today, limit=60)
    ranked = res["matches"]
    soon = []
    for m in ranked:
        dl = m.get("deadline") or {}
        d = nav._days_until(dl.get("date"), today) if dl.get("kind") == "fixed" else None
        if d is not None and 0 <= d <= 45 and m["status"] not in ("closed", "paused"):
            soon.append({**m, "days_left": d})
    soon.sort(key=lambda m: (m["days_left"], m["name"]))
    live_ids = [m["id"] for m in ranked if m["status"] not in ("closed", "paused")]
    seen = (account or {}).get("nav_seen")
    new_ids = [i for i in live_ids if i not in seen] if isinstance(seen, list) else []
    return {
        "signed_in": True, "has_profile": True,
        "startup": {"name": startup.get("name") or "", "one_liner": startup.get("one_liner") or "", "stage": raw["stage"], "stage_label": nav.STAGE_LABEL[raw["stage"]]},
        "summary": res["summary"], "top": ranked[:3], "path": res["path"], "trajectory": res["trajectory"], "tracked": (account or {}).get("tracked") or [], "closing_soon": soon[:6], "matched": len(ranked),
        "communities": nav.rank_communities(communities, raw, limit=3),
        "new_ids": new_ids[:20], "new_count": len(new_ids), "live_ids": live_ids[:100],
        "completeness": comp, "as_of": today.isoformat(),
    }
