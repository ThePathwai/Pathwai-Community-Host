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
TOPIC_PHRASE = {"network": "meeting other founders and business owners", "pitch": "pitches and demos", "mentorship": "mentors and advisors", "funding": "funding and investors",
                "workshop": "learning something (a workshop, panel or class)", "customers": "sales and finding customers"}
TOPIC_LABEL = {"network": "Meet people", "pitch": "Pitch", "mentorship": "Mentors", "funding": "Funding", "workshop": "Learn", "customers": "Customers"}
NEED_REASON = {
    "network": "Good for meeting people, and you asked for a network.",
    "mentorship": "Has mentors or advisors, and you asked for mentors.",
    "funding": "Covers funding or investors, and you asked for funding.",
    "customers": "Covers sales or customers, and you asked for first customers.",
    "training": "A workshop or class, and you asked for training.",
}
NEED_REASON.update({
    "export": "About selling abroad, and you asked for help exporting.",
    "rd": "About R&D and innovation funding, and you asked for R&D support.",
    "ip": "Covers patents and IP, and you asked for IP help.",
    "talent": "Covers hiring and team building, and you asked for help with talent.",
    "tax": "Covers tax and accounting, and you asked for tax help.",
    "legal": "Covers legal basics, and you asked for legal help.",
    "visa": "Covers immigration for founders, and you asked for visa help.",
    "tools": "Covers tools and software, and you asked for tools and discounts.",
    "space": "About workspace, and you asked for a place to work.",
})
# What an event is about, read from its title and summary when we rank it (so these never need a re-read of the page). Topics tell us network, pitch,
# mentors, funding, learning and customers; these cover the rest of what a founder can ask for, plus sector and stage.
NEED_WORDS = {
    "export": re.compile(r"export|international (?:trade|expansion|markets?)|global markets?|canexport|trade mission|cross-border|selling abroad", re.I),
    "rd": re.compile(r"\br&d\b|research and development|sr&ed|sred|irap|commerciali[sz]ation|deep ?tech|university research|lab to market", re.I),
    "ip": re.compile(r"intellectual property|patents?\b|trademarks?|copyright|\bip (?:strategy|protection|basics)", re.I),
    "talent": re.compile(r"\bhiring\b|recruit|talent|team building|co-?op students?|interns?\b|first hire|building your team", re.I),
    "tax": re.compile(r"\btax(?:es)?\b|accounting|bookkeeping|\bcra\b|\bgst\b|\bhst\b", re.I),
    "legal": re.compile(r"\blegal\b|lawyer|law firm|contracts?\b|incorporat|compliance|privacy law|shareholder|terms of service", re.I),
    "visa": re.compile(r"\bvisa\b|immigration|work permit|start-?up visa|permanent residen", re.I),
    "tools": re.compile(r"software|\btools\b|ai tools|automation|no-?code|cloud credits|\baws\b|google cloud|microsoft for startups", re.I),
    "space": re.compile(r"co-?working|workspace|office space|maker ?space|lab space|desk space", re.I),
}
SECTOR_WORDS = {
    "tech": re.compile(r"\bai\b|artificial intelligence|machine learning|saas|software|deep ?tech|cyber|developers?\b|\bapi\b|fintech|blockchain", re.I),
    "hardware": re.compile(r"hardware|robotics|manufactur|\biot\b|semiconductor|electronics|3d print", re.I),
    "health": re.compile(r"health|med ?tech|biotech|clinical|life sciences?|pharma|wellness|patient", re.I),
    "cleantech": re.compile(r"clean ?tech|climate|energy|sustainab|net[- ]zero|carbon|renewable|green ?tech", re.I),
    "mobility": re.compile(r"mobility|transport|automotive|electric vehicles?|\bev\b|logistics|supply chain", re.I),
    "creative": re.compile(r"creative|media\b|film|music|design\b|gaming|games\b|fashion|content creators?", re.I),
    "retail": re.compile(r"retail|e-?commerce|consumer|\bdtc\b|shopify|direct[- ]to[- ]consumer", re.I),
    "food": re.compile(r"\bfood\b|agri|restaurant|beverage|farm|grocery|cpg\b", re.I),
    "services": re.compile(r"consulting|agency|professional services|freelanc", re.I),
    "social": re.compile(r"social enterprise|non-?profit|social impact|charit|community impact", re.I),
}
# Events that say who they are pitched at: first ideas and first customers, or scaling up. A founder at the other end gets told, not hidden.
EARLY_WORDS = re.compile(r"idea[- ]stage|pre-?seed|early[- ]stage|first-?time founders?|aspiring (?:founders?|entrepreneurs?)|ideation|zero to one|0 to 1|startup (?:basics|101)|getting started|validate your idea|from idea", re.I)
LATE_WORDS = re.compile(r"scale-?ups?|scaling up|growth[- ]stage|series [a-c]\b|late[- ]stage|going global|international expansion|exit strategy|\$?\d+m(?:illion)? arr", re.I)
STAGE_LABEL_EARLY = ("idea", "prototype")
STAGE_LABEL_LATE = ("revenue", "growth")


def event_hay(e: Dict[str, Any]) -> str:
    return " ".join([e.get("title") or "", e.get("summary") or "", e.get("org") or ""]).lower()


# For listings that cover everything (Eventbrite and the like), an event has to look like a founder event before we keep it.
FOUNDER_WORDS = re.compile(r"founder|startup|start-up|entrepreneur|small business|business owner|investor|venture|pitch|scale-?up|innovation|b2b|saas|\bvc\b|accelerator|incubator|side hustle", re.I)
# Things that are not what we are looking for even when a keyword slips in, and the everyday hobby and language groups that share a Meetup page with founders.
NOISE_WORDS = re.compile(r"\b(?:singles|speed dating|dating|crypto signals?|forex|mlm|multi-level|nft mint|passive income|get rich|real estate seminar|timeshare|"
                         r"(?:spanish|french|english|mandarin|language) (?:conversation|practice|exchange|class|lessons?)|conversation (?:practice|exchange)|language exchange|"
                         r"yoga|pilates|zumba|karaoke|trivia|board games?|book club|bible study|worship|salsa|bachata|hiking|bike ride|pickleball|poker|bingo|"
                         r"wine tasting|paint(?:ing)? (?:night|and sip)|kids?|children|toddlers?|seniors?|retirees?|dog|meet friends|make friends|friendship|"
                         r"\d+(?:st|nd|rd|th) (?:global|international|world) conf(?:erence)?|global conf(?:erence|\.)? on)\b", re.I)
# A copied or template listing, not a real event page.
COPY_TITLE = re.compile(r"^\s*(?:copy of|duplicate of|test event|untitled)\b", re.I)
# Words that make an ordinary-looking event a business-owner event. Listings that cover everything (a Meetup group, a Luma calendar, Eventbrite) need one of these
# or a founder word in the title or description; only an organizer page that is all about founders (DMZ, MaRS, a business centre) skips the check.
BUSINESS_WORDS = re.compile(r"business|networking|entrepreneur|owners?\b|start-?ups?|founders?|funding|investors?|marketing|sales\b|customers?|e-?commerce|freelanc|consult(?:ant|ing)|"
                            r"side hustle|grants?\b|loans?\b|pitch|b2b|saas|leadership|brand(?:ing)?|revenue|pricing|procurement|export|accelerator|incubator|mentor|small business|"
                            r"workshop on (?:tax|hiring|bookkeeping)|bookkeeping|incorporat|go-to-market|\bgtm\b|\bvc\b|venture|scale-?up|innovation|chamber of commerce|board of trade", re.I)
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
    """Where an event is. An address that names its province wins, then a well-known city, then the listing's own region field
    (some listings send a wrong code, for example Nunavut for a North York cafe), then the source's usual province."""
    m = re.search(r",\s*(ON|BC|AB|SK|MB|QC|NB|NS|PE|NL|YT|NT|NU)\b", text or "")
    if m:
        return m.group(1)
    c = (city or "").strip().lower()
    if c in CITY_PROVINCE:
        return CITY_PROVINCE[c]
    r = (region or "").strip()
    if r.upper() in nav.PROVINCES:
        return r.upper()
    if r.lower() in PROVINCE_NAMES:
        return PROVINCE_NAMES[r.lower()]
    return default


# A street address outside Canada: a US zip code, or a country name. Founders here are looking for Canadian events, so these never pass.
FOREIGN_PLACE = re.compile(r"\b(?:USA|U\.S\.A?\.?|United States(?: of America)?|United Kingdom|U\.K\.)\b|,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b")
ONLINE_VENUE = re.compile(r"\s*(?:ms teams|microsoft teams|zoom|google meet|webex|virtual|online|webinar)\b", re.I)   # a "venue" that is really a meeting link


def is_foreign(venue: str, city: str = "") -> bool:
    return bool(FOREIGN_PLACE.search(f"{venue or ''} {city or ''}"))


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


def relevant(title: str, summary: str, source: Dict[str, Any]) -> bool:
    """Is this a business-owner event? An organizer page that is all about founders is trusted for ordinary titles; every other listing (a Meetup group,
    a Luma calendar, Eventbrite) must look like one by its own title or description. Hobby, language-practice, copied and conference-mill listings never pass."""
    text = f"{title} {summary}"
    if NOISE_WORDS.search(text) or COPY_TITLE.search(title or ""):
        return False
    trusted = bool(source.get("founder")) and source.get("group", "organizer") == "organizer"
    return trusted or bool(FOUNDER_WORDS.search(text) or BUSINESS_WORDS.search(text))


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
    if not relevant(title, summary, source):
        return None
    venue_text = str(raw.get("venue") or "")
    online = bool(raw.get("online")) or bool(re.search(r"\b(?:online|virtual|webinar|zoom)\b", title, re.I)) or bool(ONLINE_VENUE.match(venue_text))
    province = _province(str(raw.get("region") or ""), str(raw.get("city") or ""), str(raw.get("venue") or ""), source.get("province") or "")
    country = str(raw.get("country") or "").strip().lower()
    if country and country not in ("ca", "canada") and not online:
        return None
    if is_foreign(venue_text, str(raw.get("city") or "")) and not online:
        return None
    if not online and not province and source.get("kind") in ("eventbrite", "meetup", "luma") and not country:
        return None
    day, clock = local_parts(raw.get("start"), start)
    cls = classify(title, summary)
    price = raw.get("price")
    return {
        "id": event_id(title, day, url), "title": title, "start": start.isoformat(), "end": end.isoformat(), "date": day, "time": clock,
        "url": url, "summary": summary, "image": _https(raw.get("image")),
        "venue": _clean(raw.get("venue"), 120), "city": _clean(raw.get("city"), 60) or ("" if online else source.get("city", "")), "province": province, "online": online,
        "price": "free" if price == 0 else "paid" if isinstance(price, (int, float)) and price > 0 else "unknown",
        "org": _clean(raw.get("org"), 80) or source.get("name", ""), "source_id": source["id"], "source_name": source.get("name", ""), "priority": int(source.get("priority", 5)),
        "topics": cls["topics"] or ["network"],
        # A group's own page (Monday Girl, a Black business network) can say who all its events are made for.
        "audiences": list(dict.fromkeys([*cls["audiences"], *[a for a in (source.get("audiences") or []) if a in AUDIENCE_STRICT]])),
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


def cap_series(events: List[Dict[str, Any]], per: int = 3) -> List[Dict[str, Any]]:
    """A weekly meetup is one thing, not sixteen. Keep the next few dates of each repeating event from one source."""
    seen: Dict[str, int] = {}
    out = []
    for e in sorted(events, key=lambda x: (x["start"], x["title"])):
        key = e.get("source_id", "") + "|" + re.sub(r"[^a-z]+", "", e["title"].lower())[:60]
        seen[key] = seen.get(key, 0) + 1
        if seen[key] <= per:
            out.append(e)
    return out


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
        hay = event_hay(e)
        need_hits = [TOPIC_NEED[t] for t in e["topics"] if TOPIC_NEED[t] in needs] + [n for n, rx in NEED_WORDS.items() if n in needs and rx.search(hay)]
        need_hits = list(dict.fromkeys(need_hits))
        for n in need_hits:
            reasons.append(NEED_REASON[n])
        sector_hits = [sec for sec in profile["sectors"] if SECTOR_WORDS.get(sec) and SECTOR_WORDS[sec].search(hay)]
        if sector_hits:
            reasons.append("About " + nav._join(sector_hits) + ", your sector.")
        aimed = "early" if EARLY_WORDS.search(hay) else "late" if LATE_WORDS.search(hay) and not EARLY_WORDS.search(hay) else ""
        stage_fit = 0
        if aimed and (raw_profile or {}).get("stage"):
            mine_early, mine_late = profile["stage"] in STAGE_LABEL_EARLY, profile["stage"] in STAGE_LABEL_LATE
            if (aimed == "early" and mine_early) or (aimed == "late" and mine_late):
                stage_fit = 1
                reasons.append("Pitched at founders at your stage.")
            elif (aimed == "early" and mine_late) or (aimed == "late" and mine_early):
                stage_fit = -1
        # Every event says why it may fit and why it may not, so nothing sits on the list as a mystery.
        if not need_hits and not sector_hits and e["topics"]:
            reasons.append("Covers " + nav._join([TOPIC_PHRASE[t] for t in e["topics"] if t in TOPIC_PHRASE][:2]) + ".")
        if e["price"] == "free":
            reasons.append("Free to attend.")
        if profile.get("city") and not e["online"] and e["city"] and e["city"].strip().lower() == profile["city"].strip().lower():
            reasons.append(f"In {e['city']}, your city.")
        have_profile = bool((raw_profile or {}).get("stage"))
        if needs and not need_hits:
            cautions.append("Not about what you asked for (" + nav._join([nav.NEED_LABEL[n] for n in needs[:3]]) + "). Worth it mainly for the people you would meet.")
        if stage_fit < 0:
            cautions.append("Pitched at " + ("first-time and early-stage founders" if aimed == "early" else "scale-ups and later-stage founders") + ", and you are at the " + nav.STAGE_LABEL[profile["stage"]] + " stage.")
        if e["price"] == "paid":
            cautions.append("Paid. Check the price and what it includes on the event page.")
        if (profile.get("city") and not e["online"] and e["city"] and e["province"] == prov and e["city"].strip().lower() != profile["city"].strip().lower()):
            cautions.append(f"In {e['city']}, not {profile['city']}. Check the travel.")
        if not have_profile:
            cautions.append("We do not know your startup yet, so this is a general match. Add it to see how well this fits.")
        if not cautions:
            cautions.append("Details can change. Confirm the date, price and place on the event page.")
        if not tailored and not reasons:
            reasons.append(f"A founder-focused event from {e['org']}.")
        # How well it fits, for picking the best few. Made for your group counts most, then what you asked for, your sector, your stage and your city.
        # Never shown; the reasons are what the founder reads.
        score = (100000 if group_hits else 0) + 10000 * min(3, len(need_hits)) + (6000 if sector_hits else 0) + 4000 * stage_fit \
            + (3000 if profile.get("city") and not e["online"] and (e["city"] or "").strip().lower() == profile["city"].strip().lower() else 0) \
            + (1000 if e["province"] == prov and not e["online"] else 500 if e["online"] else 0) + (200 if e["price"] == "free" else 0)
        row = {**e, "reasons": tailored + reasons, "cautions": cautions, "days_away": (d - today).days, "score": score,
               "fit": "strong" if (group_hits or need_hits or sector_hits) else "possible"}
        if not where_ok:
            others.append({**row, "fit": "skip", "cautions": [f"In {e['city'] or e['province']}, outside your province ({prov}). Online events and events near you show first.", *cautions]})
        elif group_miss and not group_hits:
            label = nav._join([nav.AUDIENCE_LABEL[a] for a in group_miss])
            others.append({**row, "fit": "skip", "cautions": [f"Made for {label} founders. Add your group in your profile if it applies.", *cautions]})
        else:
            fits.append(row)
    total = len(fits) + len(others)
    # The few that fit best, whatever their date: made for you or about what you asked for, nearest first among equals. Only with a profile to match against.
    best = [r["id"] for r in sorted((r for r in fits if r["score"] >= 10000), key=lambda r: (-r["score"], r["start"]))[:5]] if (raw_profile or {}).get("stage") else []
    return {"profile": {"province": prov, "needs": needs, "audiences": profile["audiences"]}, "events": fits, "others": others, "best": best,
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
