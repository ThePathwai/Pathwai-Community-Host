"""Upcoming events for founders: read public event listings, keep the ones that matter to a founder, and say why each one fits.

Pure logic, no database and no network (the fetching lives in events_job.py). Three readers turn a page into raw events:
  - JSON-LD: the schema.org Event data that Eventbrite, Meetup, most organizers and many calendars publish for search engines
  - Next data: the JSON a Next.js page (Luma, Meetup) embeds to draw itself
  - ICS: a calendar feed
Every raw event is cleaned into one shape (normalize), tagged by what it is good for (topics) and who it is made for (audiences),
then ranked per founder (rank_events). We keep only what a founder needs to decide: title, when, where, a short summary and the link
back to the organizer's own page. Nothing is shown as if it were ours; every card links to the original."""
from __future__ import annotations

import hashlib
import html as htmllib
import json
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urljoin, urlparse

import navigator as nav

HORIZON_DAYS = 120          # how far ahead we keep events
SUMMARY_MAX = 240

PROVINCE_NAMES = {
    "ontario": "ON", "british columbia": "BC", "alberta": "AB", "saskatchewan": "SK", "manitoba": "MB", "quebec": "QC", "québec": "QC",
    "new brunswick": "NB", "nova scotia": "NS", "prince edward island": "PE", "newfoundland and labrador": "NL", "newfoundland": "NL",
    "yukon": "YT", "northwest territories": "NT", "nunavut": "NU",
}
CITY_PROVINCE = {
    "toronto": "ON", "mississauga": "ON", "brampton": "ON", "markham": "ON", "vaughan": "ON", "ottawa": "ON", "waterloo": "ON", "kitchener": "ON",
    "hamilton": "ON", "london": "ON", "oakville": "ON", "burlington": "ON", "guelph": "ON", "kingston": "ON", "vancouver": "BC", "victoria": "BC",
    "burnaby": "BC", "calgary": "AB", "edmonton": "AB", "winnipeg": "MB", "regina": "SK", "saskatoon": "SK", "montreal": "QC", "montréal": "QC",
    "quebec city": "QC", "halifax": "NS", "fredericton": "NB", "moncton": "NB", "st. john's": "NL", "charlottetown": "PE",
}

# What an event is good for. Order matters only for display. Each topic maps to the Navigator need it serves.
TOPICS = {
    "network": r"network|mixer|meet[- ]?up|meetup|social|connect|drink[- ]?up|soir[ée]e|happy hour|community|founders? (?:night|dinner|circle|breakfast|brunch|lunch)|roundtable|cohort",
    "pitch": r"pitch|demo day|showcase|competition|startup battle|shark",
    "mentorship": r"mentor|office hours|advis(?:or|er)|fireside|ask me anything|\bama\b|coaching|1[- ]on[- ]1|one[- ]on[- ]one",
    "funding": r"investor|funding|fundrais|\bvc\b|venture|angel|capital|grant|raise|financ|loan|seed",
    "workshop": r"workshop|bootcamp|masterclass|training|webinar|course|learn|class\b|clinic|panel|summit|conference|bootcamp",
    "customers": r"customer|sales|go[- ]to[- ]market|\bgtm\b|procurement|buyer|pilot|marketing|growth|supplier|b2b",
}
TOPIC_NEED = {"network": "network", "pitch": "funding", "mentorship": "mentorship", "funding": "funding", "workshop": "training", "customers": "customers"}
TOPIC_LABEL = {"network": "Meet people", "pitch": "Pitch", "mentorship": "Mentors", "funding": "Funding", "workshop": "Learn", "customers": "Customers"}
NEED_REASON = {
    "network": "Good for meeting people, and you asked for a network.",
    "mentorship": "Has mentors or advisors, and you asked for mentors.",
    "funding": "Covers funding or investors, and you asked for funding.",
    "customers": "Covers sales or customers, and you asked for first customers.",
    "training": "A workshop or class, and you asked for training.",
}
# For listings that cover everything (Eventbrite and the like), an event has to look like a founder event before we keep it.
FOUNDER_WORDS = re.compile(r"founder|startup|start-up|entrepreneur|small business|business owner|investor|venture|pitch|scale-?up|innovation|b2b|saas|\bvc\b|accelerator|incubator|side hustle", re.I)
# Things that are not what we are looking for even when a keyword slips in.
NOISE_WORDS = re.compile(r"\b(?:singles|speed dating|dating|crypto signals?|forex|mlm|multi-level|nft mint|passive income|get rich|real estate seminar|timeshare)\b", re.I)
AUDIENCE_WORDS = {
    "black": r"\bblack\b(?: (?:founders?|entrepreneurs?|owned|professionals?|business|innovators?|women|led))?|african|caribbean|afro",
    "women": r"\bwomen\b|\bwoman\b|female|\bher\b founders?|ladies",
    "indigenous": r"indigenous|first nations|m[ée]tis|inuit|aboriginal",
    "newcomer": r"newcomer|immigrant|refugee|new to canada",
    "youth": r"\byouth\b|under 30|under 35|young (?:founders?|entrepreneurs?)|gen z",
    "student": r"\bstudents?\b|campus|undergrad|grad student",
}
# A group word only marks an event as "made for" that group when it sits in the title or the opening line (a venue named "Black Hole Cafe" should not).
AUDIENCE_STRICT = {
    "black": r"\bblack (?:founders?|entrepreneurs?|owned|professionals?|business|innovators?|women|led|excellence|tech|creatives?|in tech)\b|\bblack\b.{0,20}\b(?:network|summit|mixer|night)\b|\bafro\b|\bbea\b",
    "women": r"\bwomen\b|\bwomxn\b|\bfemale founders?\b|\bher\b",
    "indigenous": r"indigenous|first nations|m[ée]tis|inuit",
    "newcomer": r"newcomers?|immigrants?|refugees?|new to canada",
    "youth": r"\byouth\b|under 30|under 35|young (?:founders?|entrepreneurs?)",
    "student": r"\bstudents?\b|\bcampus\b|undergrad",
}
EVENT_TYPES = {"event", "businessevent", "socialevent", "educationevent", "courseinstance", "exhibitionevent", "festival", "sportsevent", "musicevent",
               "theaterevent", "foodevent", "literaryevent", "saleevent", "screeningevent", "visualartsevent", "childrensevent", "comedyevent", "danceevent"}


def _clean(s: Any, limit: int = 0) -> str:
    s = htmllib.unescape(re.sub(r"<[^>]+>", " ", str(s or "")))
    s = re.sub(r"\s+", " ", s).strip()
    return s[:limit].rstrip() if limit else s


def _https(u: Any, base: str = "") -> str:
    u = str(u or "").strip()
    if not u:
        return ""
    if isinstance(u, str) and base:
        u = urljoin(base, u)
    return u if re.match(r"^https://", u, re.I) and len(u) < 600 else ""


def _first(v: Any) -> Any:
    return v[0] if isinstance(v, list) and v else v


# ---------------------------------------------------------------------------------------------------- readers
def _walk(node: Any) -> Iterable[Dict[str, Any]]:
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from _walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from _walk(v)


def _is_event(d: Dict[str, Any]) -> bool:
    t = d.get("@type")
    ts = [str(x).lower() for x in (t if isinstance(t, list) else [t])]
    return any(x in EVENT_TYPES for x in ts) and bool(d.get("name")) and bool(d.get("startDate"))


def _img(v: Any) -> Any:
    v = _first(v)
    return v.get("url") if isinstance(v, dict) else v


def parse_jsonld(html: str, base_url: str = "") -> List[Dict[str, Any]]:
    """Every schema.org Event in the page's <script type="application/ld+json"> blocks."""
    out: List[Dict[str, Any]] = []
    for m in re.finditer(r"<script[^>]+type=[\"']application/ld\+json[\"'][^>]*>(.*?)</script>", html or "", re.I | re.S):
        try:
            data = json.loads(htmllib.unescape(m.group(1).strip()) if "&quot;" in m.group(1) else m.group(1).strip())
        except (ValueError, TypeError):
            continue
        for d in _walk(data):
            if not _is_event(d):
                continue
            loc = _first(d.get("location")) or {}
            addr = loc.get("address") if isinstance(loc, dict) else {}
            if isinstance(addr, str):
                addr = {"streetAddress": addr}
            addr = addr or {}
            offers = _first(d.get("offers")) or {}
            org = _first(d.get("organizer")) or {}
            mode = str(d.get("eventAttendanceMode") or "").lower()
            online = "onlineeventattendancemode" in mode and "mixed" not in mode or (isinstance(loc, dict) and str(loc.get("@type", "")).lower() == "virtuallocation")
            price = None
            if isinstance(offers, dict):
                for k in ("price", "lowPrice"):
                    if offers.get(k) not in (None, ""):
                        try:
                            price = float(str(offers[k]).replace(",", ""))
                        except ValueError:
                            pass
                        break
            if d.get("isAccessibleForFree") is True:
                price = 0.0
            out.append({
                "title": d.get("name"), "start": d.get("startDate"), "end": d.get("endDate"), "url": _https(d.get("url"), base_url) or _https(offers.get("url") if isinstance(offers, dict) else "", base_url),
                "summary": d.get("description"), "image": _https(_img(d.get("image")), base_url),
                "venue": (loc.get("name") if isinstance(loc, dict) else "") or "", "city": addr.get("addressLocality") or "", "region": addr.get("addressRegion") or "",
                "country": (addr.get("addressCountry") if isinstance(addr.get("addressCountry"), str) else (addr.get("addressCountry") or {}).get("name", "")) or "",
                "online": bool(online), "price": price, "org": (org.get("name") if isinstance(org, dict) else str(org or "")) or "",
                "status": str(d.get("eventStatus") or ""),
            })
    return out


def parse_next_data(html: str, base_url: str = "") -> List[Dict[str, Any]]:
    """Events inside the JSON a Next.js page embeds (<script id="__NEXT_DATA__">). Looks for objects that have a name, a start time and a link."""
    m = re.search(r"<script[^>]+id=[\"']__NEXT_DATA__[\"'][^>]*>(.*?)</script>", html or "", re.I | re.S)
    if not m:
        return []
    try:
        data = json.loads(m.group(1))
    except ValueError:
        return []
    out, seen = [], set()
    for d in _walk(data):
        ev = d.get("event") if isinstance(d.get("event"), dict) and (d["event"].get("start_at") or d["event"].get("startDate") or d["event"].get("dateTime")) else d
        name = ev.get("name") or ev.get("title")
        start = ev.get("start_at") or ev.get("startDate") or ev.get("dateTime") or ev.get("start")
        slug = ev.get("url") or ev.get("slug") or ev.get("eventUrl") or ev.get("link")
        if not (isinstance(name, str) and isinstance(start, str) and slug):
            continue
        url = _https(slug if str(slug).startswith("http") else (urljoin(base_url, "/" + str(slug).lstrip("/"))), base_url)
        if not url or (name, start) in seen:
            continue
        seen.add((name, start))
        geo = ev.get("geo_address_info") or ev.get("venue") or {}
        geo = geo if isinstance(geo, dict) else {}
        online = str(ev.get("location_type") or ev.get("eventType") or "").lower() in ("online", "virtual") or bool(ev.get("is_online") or ev.get("isOnline"))
        out.append({"title": name, "start": start, "end": ev.get("end_at") or ev.get("endDate") or ev.get("end"), "url": url,
                    "summary": ev.get("description") or ev.get("description_short") or "", "image": _https(ev.get("cover_url") or ev.get("image") or ""),
                    "venue": geo.get("address") or geo.get("name") or "", "city": geo.get("city") or geo.get("city_state") or ev.get("city") or "", "region": geo.get("region") or geo.get("state") or "",
                    "country": geo.get("country") or "", "online": online, "price": None, "org": "", "status": ""})
    return out


def _ics_unfold(text: str) -> List[str]:
    lines: List[str] = []
    for raw in (text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw[:1] in (" ", "\t") and lines:
            lines[-1] += raw[1:]
        else:
            lines.append(raw)
    return lines


def parse_ics(text: str, base_url: str = "") -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    cur: Optional[Dict[str, str]] = None
    for line in _ics_unfold(text):
        if line.startswith("BEGIN:VEVENT"):
            cur = {}
        elif line.startswith("END:VEVENT") and cur is not None:
            def val(k: str) -> str:
                return (cur.get(k) or "").replace("\\n", " ").replace("\\,", ",").replace("\\;", ";")
            if val("SUMMARY") and val("DTSTART"):
                loc = val("LOCATION")
                out.append({"title": val("SUMMARY"), "start": val("DTSTART"), "end": val("DTEND"), "url": _https(val("URL"), base_url), "summary": val("DESCRIPTION"),
                            "image": "", "venue": loc, "city": "", "region": "", "country": "", "online": bool(re.search(r"zoom|teams|online|virtual|webinar|https?://", loc, re.I)), "price": None, "org": "", "status": val("STATUS")})
            cur = None
        elif cur is not None and ":" in line:
            k, v = line.split(":", 1)
            cur[k.split(";")[0].upper()] = v
    return out


def parse_events(kind: str, body: str, base_url: str = "") -> List[Dict[str, Any]]:
    if kind == "ics" or (body or "").lstrip().startswith("BEGIN:VCALENDAR"):
        return parse_ics(body, base_url)
    found = parse_jsonld(body, base_url)
    if not found and kind in ("luma", "meetup", "next", "auto"):
        found = parse_next_data(body, base_url)
    return found


# ---------------------------------------------------------------------------------------------------- cleaning
def _when(v: Any) -> Optional[datetime]:
    """An ISO date or date-time, an ICS date or date-time, or a unix time, as an aware UTC datetime (a bare date is noon UTC so it never slips a day)."""
    if v in (None, ""):
        return None
    s = str(v).strip()
    try:
        if re.fullmatch(r"\d{10,13}", s):
            n = int(s)
            return datetime.fromtimestamp(n / 1000 if n > 1e11 else n, tz=timezone.utc)
        m = re.fullmatch(r"(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?", s)
        if m:
            y, mo, d, hh, mi, ss, z = m.groups()
            if hh is None:
                return datetime(int(y), int(mo), int(d), 12, tzinfo=timezone.utc)
            return datetime(int(y), int(mo), int(d), int(hh), int(mi), int(ss or 0), tzinfo=timezone.utc)
        s2 = s.replace("Z", "+00:00")
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s2):
            return datetime.fromisoformat(s2 + "T12:00:00+00:00")
        dt = datetime.fromisoformat(s2)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _province(region: str, city: str, text: str, default: str) -> str:
    r = (region or "").strip()
    if r.upper() in nav.PROVINCES:
        return r.upper()
    if r.lower() in PROVINCE_NAMES:
        return PROVINCE_NAMES[r.lower()]
    c = (city or "").strip().lower()
    if c in CITY_PROVINCE:
        return CITY_PROVINCE[c]
    m = re.search(r",\s*(ON|BC|AB|SK|MB|QC|NB|NS|PE|NL|YT|NT|NU)\b", text or "")
    if m:
        return m.group(1)
    return default


def classify(title: str, summary: str) -> Dict[str, List[str]]:
    """What the event is good for, and who it is made for. The title counts for more than the blurb."""
    head = f"{title}. {summary[:160]}"
    full = f"{title}. {summary}"
    topics = [k for k, rx in TOPICS.items() if re.search(rx, head, re.I)] or [k for k, rx in TOPICS.items() if re.search(rx, full, re.I)][:2]
    audiences = [k for k, rx in AUDIENCE_STRICT.items() if re.search(rx, head, re.I)]
    return {"topics": topics[:3], "audiences": audiences}


def local_parts(v: Any, fallback: datetime) -> tuple:
    """The date and clock time as the organizer wrote them (so a 9:30 pm event in Toronto stays on its own day). Unix times and UTC
    calendar times carry no local clock, so they give a date only."""
    t = str(v or "").strip()
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?", t)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}", (f"{m.group(4)}:{m.group(5)}" if m.group(4) else "")
    m = re.fullmatch(r"(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{2})?", t)   # an ICS time without Z is local; with Z it is UTC
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}", (f"{m.group(4)}:{m.group(5)}" if m.group(4) else "")
    return fallback.date().isoformat(), ""


def event_id(title: str, start: str, url: str) -> str:
    key = re.sub(r"[^a-z0-9]+", "", title.lower())[:80] + "|" + start[:10]
    return hashlib.sha1(key.encode()).hexdigest()[:16]


def normalize(raw: Dict[str, Any], source: Dict[str, Any], now: Optional[datetime] = None) -> Optional[Dict[str, Any]]:
    """One clean event, or None when it is not upcoming, not in Canada or online, not a founder event, or missing a title, a date or a link."""
    now = now or datetime.now(timezone.utc)
    title = _clean(raw.get("title"), 140)
    start = _when(raw.get("start"))
    url = _https(raw.get("url"))
    if not title or not start or not url:
        return None
    if "cancel" in str(raw.get("status") or "").lower():
        return None
    end = _when(raw.get("end")) or start
    if end < now - timedelta(hours=3) or start > now + timedelta(days=HORIZON_DAYS):
        return None
    summary = _clean(raw.get("summary"), SUMMARY_MAX)
    text = f"{title} {summary}"
    if NOISE_WORDS.search(text):
        return None
    online = bool(raw.get("online")) or bool(re.search(r"\b(?:online|virtual|webinar|zoom)\b", title, re.I))
    province = _province(str(raw.get("region") or ""), str(raw.get("city") or ""), str(raw.get("venue") or ""), source.get("province") or "")
    country = str(raw.get("country") or "").strip().lower()
    if country and country not in ("ca", "canada") and not online:
        return None
    if not online and not province and source.get("kind") in ("eventbrite", "meetup", "luma") and not country:
        return None
    day, clock = local_parts(raw.get("start"), start)
    cls = classify(title, summary)
    if source.get("strict", True) and not (FOUNDER_WORDS.search(text) or source.get("founder")):
        return None
    if not cls["topics"] and not source.get("founder"):
        return None
    price = raw.get("price")
    return {
        "id": event_id(title, day, url), "title": title, "start": start.isoformat(), "end": end.isoformat(), "date": day, "time": clock,
        "url": url, "summary": summary, "image": _https(raw.get("image")),
        "venue": _clean(raw.get("venue"), 120), "city": _clean(raw.get("city"), 60) or source.get("city", ""), "province": province, "online": online,
        "price": "free" if price == 0 else "paid" if isinstance(price, (int, float)) and price > 0 else "unknown",
        "org": _clean(raw.get("org"), 80) or source.get("name", ""), "source_id": source["id"], "source_name": source.get("name", ""), "priority": int(source.get("priority", 5)),
        "topics": cls["topics"] or ["network"], "audiences": cls["audiences"],
    }


def dedupe(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """The same event listed on two sites: keep the organizer's own page (lower priority number), then the earliest listing."""
    best: Dict[str, Dict[str, Any]] = {}
    for e in events:
        key = re.sub(r"[^a-z0-9]+", "", e["title"].lower())[:60] + "|" + e["date"]
        cur = best.get(key)
        if cur is None or e.get("priority", 5) < cur.get("priority", 5):
            best[key] = e
    return list(best.values())


# ---------------------------------------------------------------------------------------------------- ranking
def _profile_needs_for(profile: Dict[str, Any]) -> List[str]:
    return list(profile.get("needs") or [])


def rank_events(events: List[Dict[str, Any]], raw_profile: Optional[Dict[str, Any]], today: Optional[date] = None, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Split events into the ones for this founder and the rest, each with reasons.

    For you: in their province or online, upcoming, and either made for a group they belong to, or matching something they asked for,
    or a general founder event. Everything else (another province, or made for a group they did not say they belong to) goes under
    "others" with the one reason, the same way the Programs page does it. Both lists run in date order."""
    today = today or date.today()
    f = filters or {}
    profile = nav.normalize_profile(raw_profile)
    needs = _profile_needs_for(profile)
    prov = profile["province"]
    q = (f.get("q") or "").strip().lower()
    horizon = today + timedelta(days=int(f.get("days") or HORIZON_DAYS))
    fits: List[Dict[str, Any]] = []
    others: List[Dict[str, Any]] = []
    for e in sorted(events, key=lambda x: (x["start"], x["title"])):
        d = date.fromisoformat(e["date"])
        if d < today or d > horizon:
            continue
        if q and q not in " ".join([e["title"], e["org"], e["city"], e["summary"]]).lower():
            continue
        if f.get("online") is True and not e["online"]:
            continue
        if f.get("online") is False and e["online"]:
            continue
        if f.get("free") and e["price"] != "free":
            continue
        if f.get("topic") and f["topic"] not in e["topics"]:
            continue
        reasons: List[str] = []
        cautions: List[str] = []
        where_ok = e["online"] or e["province"] == prov or not e["province"]
        if e["online"]:
            reasons.append("Online, so you can join from anywhere.")
        elif e["province"] == prov:
            reasons.append(f"In {e['city'] or e['province']}, in your province ({prov}).")
        elif not e["province"]:
            cautions.append("We could not tell where this is. Check the event page.")
        group_hits = [a for a in e["audiences"] if a in profile["audiences"]]
        group_miss = [a for a in e["audiences"] if a not in profile["audiences"]]
        tailored = []
        if group_hits:
            tailored.append("Made for " + nav._join([nav.AUDIENCE_LABEL[a] for a in group_hits]) + " founders, which you are.")
        need_hits = [TOPIC_NEED[t] for t in e["topics"] if TOPIC_NEED[t] in needs]
        for n in dict.fromkeys(need_hits):
            reasons.append(NEED_REASON[n])
        row = {**e, "reasons": tailored + reasons, "cautions": cautions, "days_away": (d - today).days,
               "fit": "strong" if (group_hits or need_hits) else "possible"}
        if not where_ok:
            others.append({**row, "fit": "skip", "reasons": [], "cautions": [f"In {e['city'] or e['province']}, outside your province ({prov}). Online events and events near you show first."]})
        elif group_miss and not group_hits:
            label = nav._join([nav.AUDIENCE_LABEL[a] for a in group_miss])
            others.append({**row, "fit": "skip", "reasons": [], "cautions": [f"Made for {label} founders. Add your group in your profile if it applies."]})
        else:
            fits.append(row)
    total = len(fits) + len(others)
    return {"profile": {"province": prov, "needs": needs, "audiences": profile["audiences"]}, "events": fits, "others": others,
            "totals": {"fit": len(fits), "others": len(others), "all": total}, "as_of": today.isoformat()}


def week_label(d: date, today: date) -> str:
    """Group headings: This week, Next week, then the month."""
    start = today - timedelta(days=today.weekday())
    delta = (d - start).days
    if delta < 7:
        return "This week"
    if delta < 14:
        return "Next week"
    return d.strftime("%B %Y")
