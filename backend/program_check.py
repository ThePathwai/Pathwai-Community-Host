"""Reads a program's official page and checks what we say about it against what the page says.

The catalog is a list of programs written down by people. A page can change the day after. So for every program we read its official
page (program_job.py does the fetching, politely) and, from the page's own words, work out:

  1. the exact section to send a founder to ("How to apply", "Eligibility"), as a link that scrolls straight to it;
  2. which of our listed requirements the page really states (those no longer need to be re-confirmed by the founder), with the sentence that proves it;
  3. whether the page says applications are closed, open, rolling, or gives a closing date, with the sentence that proves it.

Nothing here guesses. A requirement is "confirmed" only when most of its distinctive words sit together in one sentence of the page. A status
or deadline is changed only when the page states it plainly, and the sentence is kept so it can be shown. When the page cannot be read, or
says something unclear, we change nothing and say so. Pure functions only (no network, no database) so every rule can be tested."""
from __future__ import annotations

import hashlib
import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote, urldefrag, urlparse

from bs4 import BeautifulSoup

MAX_TEXT = 400_000
MONTHS = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"], 1)}
MONTHS.update({k[:3]: v for k, v in list(MONTHS.items())})
MONTHS["sept"] = 9

STOP = set("""the and for with that this from your you are will have has was were been their them they our out any all can may must not but its into over such
than then also only more most each other which who whom whose what when where while about after before under above between within without per via""".split())


# ---------------------------------------------------------------- reading the page
def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def parse_page(html: str) -> Dict[str, Any]:
    """The page as the pieces we need: title, sentences ("blocks"), and the headings with the id you can jump to."""
    soup = BeautifulSoup((html or "")[: MAX_TEXT * 3], "html.parser")
    title = _clean(soup.title.get_text()) if soup.title else ""
    for t in soup(["script", "style", "noscript", "template", "svg", "iframe", "form", "select", "option"]):
        t.decompose()
    for t in soup.find_all(["nav", "footer", "header"]):
        # a page header that holds the page's own h1 is the page, not site chrome
        if t.name == "header" and t.find(["h1", "h2"]):
            continue
        t.decompose()
    headings: List[Dict[str, Any]] = []
    for h in soup.find_all(["h1", "h2", "h3", "h4", "summary", "button"]):
        text = _clean(h.get_text(" "))
        if h.name == "button" and not h.get("aria-controls"):
            continue
        if not text or len(text) > 120:
            continue
        hid = h.get("id")
        if not hid:
            # the id is often on the wrapping section or on an empty anchor just before the heading
            for anc in (h.parent, h.find_parent("section"), h.find_parent("div")):
                if anc is not None and anc.get("id") and anc.get("id") != "main" and len(anc.get("id")) < 60:
                    hid = anc.get("id")
                    break
        if not hid:
            prev = h.find_previous_sibling()
            if prev is not None and prev.name == "a" and (prev.get("name") or prev.get("id")) and not _clean(prev.get_text()):
                hid = prev.get("name") or prev.get("id")
        headings.append({"text": text, "id": hid if hid and re.fullmatch(r"[A-Za-z][\w:.-]{0,59}", hid) else None, "level": h.name})
    blocks: List[str] = []
    for el in soup.find_all(["p", "li", "td", "th", "dd", "dt", "h1", "h2", "h3", "h4", "summary", "blockquote", "div"]):
        if el.name == "div" and el.find(["p", "li", "div", "h1", "h2", "h3", "h4", "table"]):
            continue
        t = _clean(el.get_text(" "))
        if 12 <= len(t) <= 900:
            blocks.append(t)
        elif len(t) > 900:   # a long paragraph: keep it by sentence so evidence is a sentence, not a page
            blocks.extend(s for s in re.split(r"(?<=[.!?])\s+", t) if 12 <= len(s) <= 900)
    text = _clean(soup.get_text(" "))[:MAX_TEXT]
    return {"title": title, "headings": headings, "blocks": blocks, "text": text, "hash": hashlib.sha1(text.encode("utf-8", "ignore")).hexdigest()[:12]}


# ---------------------------------------------------------------- the right section of the page
SECTION_PATTERNS = {
    "apply": [r"^how to apply$", r"^apply(ing)?( now| today)?$", r"how (do )?(you |i |to )?apply", r"application process", r"^(the )?application( form| steps)?$", r"apply (now|today|here)", r"^applications?\b", r"^get started$", r"^next steps$", r"^intake"],
    "eligibility": [r"^eligibility( criteria| requirements)?$", r"^who (can|should|is eligible to) apply", r"^who (is it for|qualifies)", r"eligib", r"^(program |application )?requirements$", r"^qualif", r"^criteria$", r"^am i eligible"],
    "deadline": [r"deadline", r"important dates", r"^key dates", r"^timeline$", r"^intake dates?", r"^when to apply"],
    "funding": [r"^(what you get|funding|what we offer|benefits|what is covered|how much)"],
    "contact": [r"^contact( us)?$", r"^get in touch$", r"^talk to"],
}
KIND_ORDER = {"apply": ["apply", "eligibility", "deadline"], "program": ["eligibility", "apply", "deadline"], "contact": ["contact", "apply"],
              "directory": [], "tool": ["apply"], "news": [], "overview": ["eligibility", "apply"]}


def _fragment(text: str) -> str:
    t = _clean(text)
    t = t[:70].rsplit(" ", 1)[0] if len(t) > 70 else t
    return quote(t, safe="").replace("-", "%2D").replace(",", "%2C").replace("&", "%26")


def find_section(model: Dict[str, Any], base_url: str, want: str) -> Optional[Dict[str, str]]:
    """The heading that best matches what the founder is there to do, and a link that scrolls to it. Prefers the heading's own id (works in every
    browser); otherwise a text fragment, which current Chrome, Edge, Safari and Firefox scroll to and highlight; older ones just open the page."""
    best: Optional[Tuple[int, Dict[str, Any]]] = None
    pats = SECTION_PATTERNS.get(want, [])
    for h in model["headings"]:
        if h["level"] == "h1":
            continue
        low = h["text"].lower()
        for rank, pat in enumerate(pats):
            if re.search(pat, low):
                score = rank * 10 + (0 if h["id"] else 3) + (0 if len(low) <= 40 else 2)
                if best is None or score < best[0]:
                    best = (score, h)
                break
    if not best:
        return None
    h = best[1]
    base = urldefrag(base_url)[0]
    url = f"{base}#{h['id']}" if h["id"] else f"{base}#:~:text={_fragment(h['text'])}"
    return {"want": want, "label": h["text"], "url": url, "by": "id" if h["id"] else "text"}


def best_links(model: Dict[str, Any], base_url: str, kind: str) -> Dict[str, Any]:
    wants = KIND_ORDER.get(kind or "program", ["eligibility", "apply"])
    found: Dict[str, Dict[str, str]] = {}
    for w in dict.fromkeys(wants + ["apply", "eligibility"]):
        s = find_section(model, base_url, w)
        if s:
            found[w] = s
    primary = next((found[w] for w in wants if w in found), None)
    return {"primary": primary, "sections": found}


# ---------------------------------------------------------------- do the page's words back up our requirements?
def _tokens(s: str) -> List[str]:
    out = []
    for w in re.findall(r"[a-z0-9$%][a-z0-9$%.,']*", (s or "").lower()):
        w = w.strip(".,'")
        if not w or w in STOP or (len(w) < 3 and not w.isdigit()):
            continue
        out.append(w)
    return out


def _stem(w: str) -> str:
    if re.search(r"\d", w):
        return w.replace(",", "")
    for suf in ("ations", "ation", "ments", "ment", "ities", "ity", "ings", "ing", "ies", "ied", "ed", "es", "s", "ly"):
        if w.endswith(suf) and len(w) - len(suf) >= 4:
            return w[: -len(suf)]
    return w


ALIASES = {"incorporated": ["incorporat", "corporation"], "employees": ["employe", "staff"], "canadian": ["canad"], "for-profit": ["profit"],
           "ontario": ["ontario", "ont."], "newcomer": ["newcomer", "immigrant", "refugee"], "indigenous": ["indigenous", "first nations", "inuit", "metis", "métis"]}


def _present(stem: str, block_low: str) -> bool:
    if stem in block_low:
        return True
    for k, alts in ALIASES.items():
        if stem.startswith(k[:6]) and any(a in block_low for a in alts):
            return True
    return False


def verify_requirement(model: Dict[str, Any], requirement: str) -> Dict[str, Any]:
    """Confirmed when most of the requirement's distinctive words sit together in one sentence of the page. The sentence is the evidence."""
    stems = list(dict.fromkeys(_stem(w) for w in _tokens(requirement)))
    if not stems:
        return {"requirement": requirement, "confirmed": False}
    best, best_frac = "", 0.0
    for b in model["blocks"]:
        low = b.lower()
        hit = sum(1 for s in stems if _present(s, low))
        frac = hit / len(stems)
        if frac > best_frac or (frac == best_frac and best and len(b) < len(best)):
            best, best_frac = b, frac
    need = 0.67 if len(stems) >= 3 else 1.0
    ok = best_frac >= need and (len(stems) >= 2 or bool(re.search(r"\d", stems[0])))
    return {"requirement": requirement, "confirmed": ok, **({"evidence": best[:220]} if ok else {})}


def name_matches(model: Dict[str, Any], program: Dict[str, Any]) -> bool:
    """Does this page talk about this program at all? (A page that moved or a generic home page will not.)"""
    skip = ("program", "fund", "grant", "ontario", "canada", "start", "startup", "toronto")
    toks = [t for t in dict.fromkeys(_stem(w) for w in _tokens(program.get("name", ""))) if t not in skip]
    if not toks:
        return True
    low = (model["title"] + " " + model["text"][:60000]).lower()
    return sum(1 for t in toks if t in low) / len(toks) >= 0.6


# ---------------------------------------------------------------- what the page says about timing
_MON = "|".join(sorted(MONTHS, key=len, reverse=True))
CLOSED_RX = re.compile(r"(applications?|intake|submissions?|program|call|window|portal)( is| are| has| have| was)?( now| currently| officially)? (closed|paused)|no longer (accepting|taking|open for) (new )?(applications?|submissions?)|not (currently )?(accepting|taking) (new )?(applications?|submissions?)|(applications?|intake) (has|have) closed|closed to (new )?applications?|(is|are) closed for", re.I)
OPEN_RX = re.compile(r"(applications?|intake|submissions?|call|portal|program)( is| are)( now| currently)? open\b|now (accepting|open for|taking) (new )?(applications?|submissions?)|(currently|now) accepting (new )?(applications?|submissions?)|applications? (now )?open\b|accepting applications", re.I)
ROLLING_RX = re.compile(r"rolling (basis|intake|admission|application|deadline)|apply (at )?any ?time|(open|apply|accepted|accepting)[^.]{0,40}year[- ]round|on an ongoing basis|no (fixed |set )?(application )?deadline|continuous intake|ongoing intake|applications? (are )?(accepted|reviewed) (on a )?(rolling|continuous)", re.I)
DEADLINE_WORDS = re.compile(r"deadline|closes?|closing|due|apply by|submit by|until|no later than|applications? (must be )?(received|submitted) by|intake", re.I)
DATE_RXS = [
    re.compile(r"\b(" + _MON + r")\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,|\s)\s*(20\d\d)\b", re.I),
    re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+(" + _MON + r")\.?,?\s+(20\d\d)\b", re.I),
    re.compile(r"\b(20\d\d)-(\d\d)-(\d\d)\b"),
]


def _dates(s: str) -> List[date]:
    out = []
    for i, rx in enumerate(DATE_RXS):
        for m in rx.finditer(s):
            try:
                if i == 0:
                    d = date(int(m.group(3)), MONTHS[m.group(1).lower()], int(m.group(2)))
                elif i == 1:
                    d = date(int(m.group(3)), MONTHS[m.group(2).lower()], int(m.group(1)))
                else:
                    d = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
                out.append(d)
            except (ValueError, KeyError):
                pass
    return out


def timing_signals(model: Dict[str, Any], today: date) -> Dict[str, Any]:
    """Plain statements on the page about whether and until when you can apply. Each carries the sentence it came from."""
    sig: Dict[str, Any] = {"closed": None, "open": None, "rolling": None, "deadline": None}
    soonest: Optional[Tuple[date, str]] = None
    for b in model["blocks"]:
        if len(b) >= 400:
            continue
        if sig["closed"] is None and CLOSED_RX.search(b):
            sig["closed"] = b[:220]
        if sig["open"] is None and OPEN_RX.search(b):
            sig["open"] = b[:220]
        if sig["rolling"] is None and ROLLING_RX.search(b):
            sig["rolling"] = b[:220]
        if DEADLINE_WORDS.search(b):
            for d in _dates(b):
                if today <= d <= date(today.year + 2, today.month, 1) and (soonest is None or d < soonest[0]):
                    soonest = (d, b[:220])
    if soonest:
        sig["deadline"] = {"date": soonest[0].isoformat(), "evidence": soonest[1]}
    return sig


def decide_timing(program: Dict[str, Any], sig: Dict[str, Any], today: date) -> Optional[Dict[str, Any]]:
    """The change to status and deadline the page justifies, or None. Only plain statements count, and conflicting ones change nothing."""
    dl, closed, op, rolling = sig.get("deadline"), sig.get("closed"), sig.get("open"), sig.get("rolling")
    note = (program.get("deadline") or {}).get("note") or ""
    if closed and (op or rolling or dl):
        return None   # the page says both: do not guess which is current
    if closed:
        return {"status": "closed", "deadline": {"kind": "closed", "date": None, "note": note}, "evidence": closed}
    if dl:
        return {"status": "open", "deadline": {"kind": "fixed", "date": dl["date"], "note": ""}, "evidence": dl["evidence"]}
    if rolling:
        return {"status": "rolling", "deadline": {"kind": "rolling", "date": None, "note": note}, "evidence": rolling}
    if op and (program.get("deadline") or {}).get("kind") != "fixed":
        return {"status": "open", "deadline": program.get("deadline") or {"kind": "none_published", "date": None, "note": ""}, "evidence": op}
    return None


# ---------------------------------------------------------------- put it together
def check_page(program: Dict[str, Any], html: str, url: str, now: datetime) -> Dict[str, Any]:
    """Everything we learn from one page. `ok` is False when the page does not appear to be about this program at all."""
    model = parse_page(html)
    today = now.date()
    links = best_links(model, url, program.get("link_kind", "program"))
    reqs = [verify_requirement(model, r) for r in (program.get("requirements") or [])]
    sig = timing_signals(model, today)
    named = name_matches(model, program)
    ok = bool(named and len(model["text"]) > 400)
    return {
        "id": program["id"], "url": urldefrag(url)[0], "host": (urlparse(url).hostname or "").replace("www.", ""),
        "checked_at": now.isoformat(), "title": model["title"][:160], "hash": model["hash"], "named": named, "ok": ok,
        **({} if ok else {"problem": "The page loaded but does not mention this program, so we left the entry as written." if len(model["text"]) > 400 else "The page loaded but has almost no readable text (it may need a browser to show its content)."}),
        "section": links["primary"], "sections": links["sections"],
        "requirements": reqs, "signals": sig, "timing": decide_timing(program, sig, today) if ok else None,
    }


def merge_check(program: Dict[str, Any], chk: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """The program as the founder should see it: the same entry, with the link pointing at the right section and the facts the page backs up.
    A failed or missing check leaves the entry exactly as written (and `page_check` says when we last managed to read the page)."""
    if not chk:
        return program
    out = dict(program)
    pc: Dict[str, Any] = {"checked_at": chk.get("checked_at"), "host": chk.get("host"), "ok": bool(chk.get("ok")), "stale": bool(chk.get("stale"))}
    if chk.get("ok"):
        out["base_url"] = program.get("apply_url")
        sec = chk.get("section")
        if sec and (program.get("apply_url") or "").startswith("http"):
            out["apply_url"] = sec["url"]
            pc["section"] = {"label": sec["label"], "want": sec["want"]}
            out["link_exact"] = True
        confirmed = [r for r in chk.get("requirements", []) if r.get("confirmed")]
        pc["confirmed"] = [r["requirement"] for r in confirmed]
        pc["evidence"] = {r["requirement"]: r["evidence"] for r in confirmed[:8]}
        pc["total"] = len(chk.get("requirements", []))
        t = chk.get("timing")
        if t:
            out["status"], out["deadline"] = t["status"], t["deadline"]
            pc["timing"] = {"status": t["status"], "evidence": t["evidence"]}
        out["verified"] = "official"
        out["last_checked"] = (chk.get("checked_at") or "")[:10] or program.get("last_checked")
    else:
        pc["problem"] = chk.get("problem") or "We could not read this program's page."
    out["page_check"] = pc
    return out
