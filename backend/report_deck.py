"""Renders a sponsor / funder / board report (impact.build_report) as a 16:9 slide deck PDF in the community's own look.

The deck is built from the community's brand settings, so every community gets its own: its colours (accent, background,
text), its logo, its photos and its story. Nothing is hard-coded to one brand; contrast is checked so text stays readable
whatever palette an admin picks, and a logo is recoloured when it would otherwise vanish into the background.

Slides: cover, "at a glance" (one headline number per section), one slide per report section (numbers plus charts),
and a closing slide with the community's story and how to reach it.
"""
from __future__ import annotations

import base64
import io
import ipaddress
import os
import re
import socket
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from reportlab.lib import colors
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

PW, PH = 960.0, 540.0  # 13.33 x 7.5 in: the usual widescreen slide
MARGIN = 56.0
MAX_IMG_BYTES = 3 * 1024 * 1024
FONT, BOLD = "Helvetica", "Helvetica-Bold"


# ---------------------------------------------------------------- colour helpers
def _t(s: Any) -> str:
    """Text the built-in PDF fonts can draw (Latin-1 / Windows-1252); anything else becomes '?'."""
    return str(s if s is not None else "").encode("cp1252", "replace").decode("cp1252")


def _lum(c: colors.Color) -> float:
    def f(v: float) -> float:
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c.red) + 0.7152 * f(c.green) + 0.0722 * f(c.blue)


def _contrast(a: colors.Color, b: colors.Color) -> float:
    la, lb = _lum(a), _lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def _mix(a: colors.Color, b: colors.Color, t: float) -> colors.Color:
    """t = 0 gives a, t = 1 gives b."""
    return colors.Color(a.red + (b.red - a.red) * t, a.green + (b.green - a.green) * t, a.blue + (b.blue - a.blue) * t)


def _hex(v: Any, fallback: str) -> colors.Color:
    try:
        return colors.HexColor(str(v))
    except Exception:  # noqa: BLE001
        return colors.HexColor(fallback)


def _readable_on(bg: colors.Color, prefer: colors.Color) -> colors.Color:
    """`prefer` if it reads on `bg`, otherwise black or white, whichever reads better."""
    if _contrast(prefer, bg) >= 4.5:
        return prefer
    return colors.HexColor("#0B0B0C") if _contrast(colors.HexColor("#0B0B0C"), bg) >= _contrast(colors.white, bg) else colors.white


class Theme:
    """The community's look, with every colour pair checked for contrast."""

    def __init__(self, cfg: Dict[str, Any]):
        brand = (cfg or {}).get("brand") or {}
        cols = brand.get("colors") or {}
        self.name = _t((cfg or {}).get("community_name") or "Community")
        self.bg = _hex(cols.get("background"), "#0D0D0D")
        self.dark = _lum(self.bg) < 0.3
        self.surface = _hex(cols.get("surface"), "#171717")
        self.text = _readable_on(self.bg, _hex(cols.get("text"), "#EBEBEB"))
        self.muted = _hex(cols.get("muted"), "#A1A1A1")
        if _contrast(self.muted, self.bg) < 3.2:
            self.muted = _mix(self.text, self.bg, 0.35)
        self.border = _hex(cols.get("border"), "#2E2E2E")
        self.accent = _hex(cols.get("accent"), "#EBEBEB")
        self.on_accent = _readable_on(self.accent, _hex(cols.get("on_accent"), "#FFFFFF" if _lum(self.accent) < 0.4 else "#0B0B0C"))
        # the accent used for numbers and bars drawn on the slide background: the accent itself when it stands out, else the text colour
        self.accent_fg = self.accent if _contrast(self.accent, self.bg) >= 3 else self.text
        self.panel = self.surface if _contrast(self.surface, self.bg) >= 1.04 else _mix(self.bg, self.text, 0.07)
        self.soft = _mix(self.bg, self.accent_fg, 0.14)
        self.series = [self.accent_fg, _mix(self.accent_fg, self.text, 0.5), _mix(self.accent_fg, self.bg, 0.55), _mix(self.muted, self.bg, 0.2), _mix(self.accent_fg, self.text, 0.8)]
        self.logo_url = brand.get("logo_url") or None
        self.mark_url = brand.get("logo_mark_url") or None
        self.logo_adapts = brand.get("logo_adapts", True) is not False
        photos = [p for p in ((cfg or {}).get("gallery_photos") or []) if isinstance(p, str)]
        cover = (cfg or {}).get("dashboard_cover_url")
        self.photos = photos + ([cover] if isinstance(cover, str) and cover and cover not in photos else [])
        self.about = _t(((cfg or {}).get("about") or "")).strip()
        self.site = ((cfg or {}).get("about_url") or "").strip()
        self.email = _t((brand.get("support_email") or "")).strip()
        self.tagline = _t((brand.get("footer_text") or "")).strip()


# ---------------------------------------------------------------- images
def _public_host(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    except Exception:  # noqa: BLE001
        return False
    return bool(infos) and all(ipaddress.ip_address(i[4][0]).is_global for i in infos)


def _load_bytes(url: Optional[str]) -> Optional[bytes]:
    """Bytes of a logo or photo from a data: URI, one of our own uploads, or a public https link. Never raises."""
    if not url or not isinstance(url, str):
        return None
    try:
        if url.startswith("data:image/"):
            head, _, body = url.partition(",")
            raw = base64.b64decode(body) if ";base64" in head else urllib.parse.unquote_to_bytes(body)
            return raw if raw and len(raw) <= MAX_IMG_BYTES else None
        if url.startswith("/api/uploads/"):
            from routes.uploads import STORE
            p = STORE / Path(url).name
            return p.read_bytes() if p.is_file() and p.stat().st_size <= MAX_IMG_BYTES else None
        if url.startswith("https://"):
            host = urllib.parse.urlparse(url).hostname or ""
            if not host or not _public_host(host):
                return None
            req = urllib.request.Request(url, headers={"User-Agent": "Pathwai-report/1.0"})
            with urllib.request.urlopen(req, timeout=4) as r:  # noqa: S310 (https only, public hosts only)
                raw = r.read(MAX_IMG_BYTES + 1)
            return raw if len(raw) <= MAX_IMG_BYTES else None
    except Exception:  # noqa: BLE001
        return None
    return None


def _open(url: Optional[str]):
    raw = _load_bytes(url)
    if not raw:
        return None
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(raw))
        im.load()
        return im.convert("RGBA")
    except Exception:  # noqa: BLE001
        return None


def _png(im) -> ImageReader:
    buf = io.BytesIO()
    im.save(buf, "PNG")
    buf.seek(0)
    return ImageReader(buf)


def _logo_for(url: Optional[str], bg: colors.Color, adapts: bool, fg: colors.Color) -> Optional[Tuple[ImageReader, float]]:
    """A logo ready to sit on `bg`, with its width/height ratio. A one-colour logo that would disappear is recoloured to `fg`."""
    im = _open(url)
    if im is None:
        return None
    im.thumbnail((900, 400))
    px = list(getattr(im, "get_flattened_data", im.getdata)())
    solid = [p for p in px if p[3] > 40]
    if solid:
        n = len(solid)
        mean = tuple(sum(p[i] for p in solid) / n for i in range(3))
        var = sum(sum((p[i] - mean[i]) ** 2 for i in range(3)) for p in solid) / n
        mean_c = colors.Color(mean[0] / 255, mean[1] / 255, mean[2] / 255)
        mono = var < 900  # near one colour (std dev under ~17 per channel summed)
        if mono and _contrast(mean_c, bg) < 3:
            r, g, b = int(fg.red * 255), int(fg.green * 255), int(fg.blue * 255)
            im.putdata([(r, g, b, p[3]) for p in px])
    return _png(im), im.width / max(im.height, 1)


def _photo_cover(url: Optional[str], w: float, h: float, tint: Optional[colors.Color] = None, strength: float = 0.0) -> Optional[ImageReader]:
    """A photo cropped to fill a w x h box (centre crop), optionally washed with a colour."""
    im = _open(url)
    if im is None:
        return None
    from PIL import Image
    target = w / h
    cur = im.width / im.height
    if cur > target:
        nw = int(im.height * target)
        x0 = (im.width - nw) // 2
        im = im.crop((x0, 0, x0 + nw, im.height))
    else:
        nh = int(im.width / target)
        y0 = (im.height - nh) // 3  # a little above centre: faces and subjects usually sit high
        im = im.crop((0, y0, im.width, y0 + nh))
    im = im.resize((min(int(w * 2.2), im.width), min(int(h * 2.2), im.height)))
    bgc = Image.new("RGBA", im.size, (255, 255, 255, 255))
    bgc.alpha_composite(im)
    out = bgc.convert("RGB")
    if tint is not None and strength > 0:
        wash = Image.new("RGB", out.size, (int(tint.red * 255), int(tint.green * 255), int(tint.blue * 255)))
        out = Image.blend(out, wash, strength)
    return _png(out.convert("RGBA"))


# ---------------------------------------------------------------- drawing helpers
def _fit(c: Any, text: str, font: str, size: float, width: float) -> str:
    """Text trimmed with an ellipsis so it fits `width`."""
    text = _t(text)
    if stringWidth(text, font, size) <= width:
        return text
    while len(text) > 1 and stringWidth(text + "\u2026", font, size) > width:
        text = text[:-1]
    return text.rstrip() + "\u2026"


def _para(c: canvas.Canvas, text: str, x: float, y_top: float, width: float, font: str, size: float, color: colors.Color, leading: Optional[float] = None, max_lines: int = 99) -> float:
    """Wrapped text from y_top downwards. Returns the y of the bottom of the block."""
    lead = leading or size * 1.3
    lines = simpleSplit(_t(text), font, size, width)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = _fit(c, lines[-1] + " …", font, size, width)
    c.setFillColor(color)
    c.setFont(font, size)
    y = y_top - size
    for ln in lines:
        c.drawString(x, y, ln)
        y -= lead
    return y + lead - size * 0.3


def _caps(c: canvas.Canvas, text: str, x: float, y: float, size: float, color: colors.Color, space: float = 1.6) -> None:
    t = c.beginText(x, y)
    t.setFont(BOLD, size)
    t.setCharSpace(space)
    t.setFillColor(color)
    t.textOut(_t(text).upper())
    t.setCharSpace(0)  # the spacing would otherwise carry on into every later piece of text
    c.drawText(t)


def _draw_logo(c: canvas.Canvas, logo: Optional[Tuple[ImageReader, float]], x: float, y: float, max_w: float, max_h: float, align: str = "left") -> float:
    """Draw a logo inside a box; returns the width used."""
    if not logo:
        return 0.0
    img, ratio = logo
    h = max_h
    w = h * ratio
    if w > max_w:
        w, h = max_w, max_w / ratio
    x0 = x if align == "left" else x - w
    c.drawImage(img, x0, y + (max_h - h) / 2, w, h, mask="auto")
    return w


def _wordmark(c: canvas.Canvas, th: Theme, x: float, y: float, size: float, color: colors.Color) -> None:
    """Stand-in for a missing logo: a coloured square and the community's name."""
    c.setFillColor(th.accent)
    c.roundRect(x, y - 2, size * 0.9, size * 0.9, size * 0.2, fill=1, stroke=0)
    c.setFillColor(color)
    c.setFont(BOLD, size)
    c.drawString(x + size * 1.15, y, _fit(c, th.name.upper(), BOLD, size, 440))


def _rings(c: canvas.Canvas, cx: float, cy: float, color: colors.Color, alpha: float, radii: List[float], width: float = 1.2) -> None:
    c.saveState()
    c.setStrokeColor(color)
    c.setStrokeAlpha(alpha)
    c.setLineWidth(width)
    for r in radii:
        c.circle(cx, cy, r, stroke=1, fill=0)
    c.restoreState()


# ---------------------------------------------------------------- layout constants (the on-screen preview, frontend/src/components/DeckPreview.jsx, uses the same numbers)
BODY_TOP, BODY_BOT = 412.0, 62.0      # the area every slide's content sits in (y is measured up from the bottom)
BODY_H = BODY_TOP - BODY_BOT
GAP = 14.0
LEFT_W = 380.0                        # the tile column on a slide that also has charts
INS_SIZE, INS_LEAD, INS_GAP = 11.5, 15.0, 8.0


def _ins_lines(text: str, width: float) -> int:
    """How many lines an insight takes (an estimate shared with the preview so both lay out the same)."""
    return max(1, min(3, -(-int(len(text) * INS_SIZE * 0.53) // max(int(width - 16), 1))))


def _ins_h(items: List[str], width: float) -> float:
    return sum(_ins_lines(t, width) * INS_LEAD + INS_GAP for t in items) - INS_GAP if items else 0.0


def _card_lines(text: str, size: float, width: float) -> int:
    """Lines a card's sentence takes (an estimate shared with the preview)."""
    return max(1, -(-int(len(text) * size * 0.5) // max(int(width), 1)))


def _val_size(val: str, w: float, h: float, big: bool) -> float:
    """Font size for a tile's number: as large as the tile allows, smaller for long values, always inside the tile."""
    base = max(34.0, min(84.0, h * 0.38)) if big else max(30.0, min(46.0, h * 0.36))
    n = len(val)
    if n > 6:
        base *= 0.78
    if n > 9:
        base *= 0.8
    while base > 18 and n * base * 0.64 > w - 40:
        base -= 2
    return base


# ---------------------------------------------------------------- what the admin chose to show
def section_id(s: dict) -> str:
    return str(s.get("kind") or s.get("title") or "")


def selection_keys(rep: Dict[str, Any]) -> List[str]:
    """Every thing in a report an admin can switch off, as stable keys: s:<section>, t:<section>:<number label>, c:<section>:<chart title>, i:<section>:<n>, glance."""
    keys = ["glance"]
    for s in rep.get("sections") or []:
        sid = section_id(s)
        keys.append(f"s:{sid}")
        keys += [f"t:{sid}:{t.get('label', '')}" for t in s.get("tiles") or []]
        keys += [f"c:{sid}:{c.get('title', '')}" for c in s.get("charts") or []]
        keys += [f"i:{sid}:{n}" for n, _ in enumerate(s.get("insights") or [])]
        keys += [f"k:{sid}:{c.get('title', '')}" for c in s.get("cards") or []]
    return keys


def clean_hidden(hidden: Any, rep: Optional[Dict[str, Any]] = None) -> List[str]:
    """Only strings, bounded, and (when a report is given) only keys that exist in it."""
    out = [h[:200] for h in (hidden or []) if isinstance(h, str)][:300]
    if rep is not None:
        ok = set(selection_keys(rep))
        out = [h for h in out if h in ok]
    return list(dict.fromkeys(out))


def apply_selection(rep: Dict[str, Any], hidden: Any) -> Dict[str, Any]:
    """The report with what the admin switched off taken out. A section with nothing left is dropped; the full report is never changed."""
    hide = set(clean_hidden(hidden))
    if not hide:
        return rep
    secs = []
    for s in rep.get("sections") or []:
        sid = section_id(s)
        if f"s:{sid}" in hide:
            continue
        ns = {**s,
              "tiles": [t for t in s.get("tiles") or [] if f"t:{sid}:{t.get('label', '')}" not in hide],
              "charts": [c for c in s.get("charts") or [] if f"c:{sid}:{c.get('title', '')}" not in hide],
              "insights": [x for n, x in enumerate(s.get("insights") or []) if f"i:{sid}:{n}" not in hide]}
        if s.get("cards"):
            ns["cards"] = [c for c in s["cards"] if f"k:{sid}:{c.get('title', '')}" not in hide]
        if ns["tiles"] or ns["charts"] or ns["insights"] or ns.get("cards"):
            secs.append(ns)
    return {**rep, "sections": secs, "hide_glance": "glance" in hide}


# ---------------------------------------------------------------- charts (drawn within x, y .. x+w, y+h; y is the bottom)
def _fv(v: Any) -> str:
    """A chart number with thousands separators (3,610), words and decimals left alone."""
    return f"{v:,}" if isinstance(v, int) and not isinstance(v, bool) else str(v)


def _chart_title(c: canvas.Canvas, th: Theme, title: str, x: float, y_top: float, w: float) -> float:
    _caps(c, _fit(c, title.upper(), BOLD, 8.5, w), x, y_top - 9, 8.5, th.muted, 1.2)
    return y_top - 26


def _empty(c: canvas.Canvas, th: Theme, x: float, y: float, w: float, h: float) -> None:
    _para(c, "Nothing to chart yet. This fills in as members take part.", x, y + h, w, FONT, 11, th.muted)


def _columns(c, th: Theme, items: List[dict], x: float, y: float, w: float, h: float) -> None:
    items = items[-10:]
    if not items or sum(i.get("value", 0) for i in items) == 0:
        return _empty(c, th, x, y, w, h)
    n = len(items)
    vmax = max(i["value"] for i in items) or 1
    base, top = y + 18, y + h - 20
    slot = w / n
    bw = min(slot * 0.62, 48)
    c.setStrokeColor(th.border)
    c.setLineWidth(0.8)
    c.line(x, base, x + w, base)
    for i, it in enumerate(items):
        cx = x + i * slot + slot / 2
        bh = max((top - base) * it["value"] / vmax, 3 if it["value"] else 0)
        last = i == n - 1
        c.setFillColor(th.accent_fg if last else _mix(th.accent_fg, th.bg, 0.45))
        if bh:
            c.roundRect(cx - bw / 2, base, bw, bh, min(5, bw / 3), fill=1, stroke=0)
        c.setFillColor(th.text)
        c.setFont(BOLD, 11)
        c.drawCentredString(cx, base + bh + 5, _fv(it["value"]))
        c.setFillColor(th.muted)
        c.setFont(FONT, 8.5)
        c.drawCentredString(cx, y + 3, _fit(c, str(it["label"]), FONT, 8.5, slot + 6))


def _hbar(c, th: Theme, items: List[dict], x: float, y: float, w: float, h: float, unit: str = "") -> None:
    items = items[:7]
    if not items or sum(i.get("value", 0) for i in items) == 0:
        return _empty(c, th, x, y, w, h)
    row = min(40.0, h / len(items))
    vmax = max(i["value"] for i in items) or 1
    label_w = w * 0.38
    track_x, track_w = x + label_w + 10, w - label_w - 10 - 58
    for i, it in enumerate(items):
        ry = y + h - (i + 1) * row
        c.setFillColor(th.text)
        c.setFont(FONT, 11)
        c.drawString(x, ry + row / 2 - 4, _fit(c, str(it["label"]), FONT, 11, label_w))
        c.setFillColor(th.soft)
        c.roundRect(track_x, ry + row / 2 - 5, track_w, 10, 5, fill=1, stroke=0)
        bw = max(track_w * it["value"] / vmax, 7 if it["value"] else 0)
        if bw:
            c.setFillColor(th.accent_fg if i == 0 else _mix(th.accent_fg, th.bg, 0.3))
            c.roundRect(track_x, ry + row / 2 - 5, bw, 10, 5, fill=1, stroke=0)
        c.setFillColor(th.text)
        c.setFont(BOLD, 11)
        c.drawString(track_x + track_w + 10, ry + row / 2 - 4, f"{it['value']}%" if unit == "% full" else _fv(it["value"]))


def _table(c, th: Theme, cols: List[str], rows: List[List[Any]], x: float, y: float, w: float, h: float) -> None:
    rows = rows[:7]
    n = len(cols)
    if not rows:
        return _empty(c, th, x, y, w, h)
    fr = {2: [0.65, 0.35], 3: [0.46, 0.30, 0.24], 4: [0.40, 0.24, 0.18, 0.18]}.get(n) or [1 / n] * n
    xs = [x]
    for f in fr:
        xs.append(xs[-1] + w * f)
    rh = min(46.0, (h - 26) / len(rows))
    c.setStrokeColor(th.text)
    c.setLineWidth(0.8)
    ty = y + h - 4
    for j, col in enumerate(cols):
        _caps(c, _fit(c, col.upper(), BOLD, 8, w * fr[j] - 6), xs[j], ty - 6, 8, th.muted, 1.0)
    c.line(x, ty - 14, x + w, ty - 14)
    for i, r in enumerate(rows):
        ry = ty - 14 - (i + 1) * rh
        for j, cell in enumerate(r[:n]):
            c.setFillColor(th.text if j == 0 else th.muted)
            f, s = (BOLD, 11.5) if j == 0 else (FONT, 10.5)
            c.setFont(f, s)
            c.drawString(xs[j], ry + rh / 2 - 4, _fit(c, str(cell), f, s, w * fr[j] - 10))
        c.setStrokeColor(th.border)
        c.setLineWidth(0.5)
        c.line(x, ry, x + w, ry)


def _donut(c, th: Theme, items: List[dict], x: float, y: float, w: float, h: float) -> None:
    items = items[:5]
    total = sum(i["value"] for i in items)
    if not items or not total:
        return _empty(c, th, x, y, w, h)
    r = min(h / 2 - 6, 88)
    cx, cy = x + r + 4, y + h / 2
    start = 90.0
    for i, it in enumerate(items):
        sweep = -360.0 * it["value"] / total
        if it["value"]:
            c.setFillColor(th.series[i])
            c.setStrokeColor(th.panel)
            c.setLineWidth(2)
            c.wedge(cx - r, cy - r, cx + r, cy + r, start, sweep, fill=1, stroke=1)
        start += sweep
    c.setFillColor(th.panel)
    c.circle(cx, cy, r * 0.58, fill=1, stroke=0)
    lx = cx + r + 26
    row = 26
    ly = cy + row * len(items) / 2 - 8
    for i, it in enumerate(items):
        yy = ly - i * row
        c.setFillColor(th.series[i])
        c.roundRect(lx, yy - 1, 11, 11, 2, fill=1, stroke=0)
        c.setFillColor(th.text)
        c.setFont(FONT, 11)
        c.drawString(lx + 18, yy, _fit(c, str(it["label"]), FONT, 11, x + w - lx - 90))
        c.setFont(BOLD, 11)
        c.drawRightString(x + w, yy, f"{round(100 * it['value'] / total)}%")


def _has_data(ch: dict) -> bool:
    t = ch.get("type")
    if t == "table":
        return bool(ch.get("rows"))
    if t in ("columns", "hbar", "donut"):
        return sum(i.get("value", 0) for i in (ch.get("items") or [])) > 0
    return False


def _nat_h(ch: dict) -> float:
    """How much of the slide a chart wants, relative to the other chart on it (a short table asks for less than a column chart)."""
    t = ch.get("type")
    if t == "table":
        return 64 + 40 * min(len(ch.get("rows") or []), 7)
    if t == "hbar":
        return 60 + 34 * min(len(ch.get("items") or []), 7)
    return 200.0


def _chart(c, th: Theme, ch: dict, x: float, y: float, w: float, h: float) -> None:
    top = _chart_title(c, th, ch.get("title") or "", x, y + h, w)
    bh = top - y
    t = ch.get("type")
    if t == "columns":
        _columns(c, th, ch.get("items") or [], x, y, w, bh)
    elif t == "hbar":
        _hbar(c, th, ch.get("items") or [], x, y, w, bh, ch.get("unit", ""))
    elif t == "table":
        _table(c, th, ch.get("columns") or [], ch.get("rows") or [], x, y, w, bh)
    elif t == "donut":
        _donut(c, th, ch.get("items") or [], x, y, w, bh)


# ---------------------------------------------------------------- slide furniture
class _Deck:
    def __init__(self, report: Dict[str, Any], cfg: Dict[str, Any], label: Optional[str]):
        self.rep, self.th = report, Theme(cfg)
        self.label = _t(label or report.get("audience") or "")
        self.page = 0
        th = self.th
        self.logo_on_bg = _logo_for(th.logo_url or th.mark_url, th.bg, th.logo_adapts, th.text)
        self.mark_on_bg = _logo_for(th.mark_url or th.logo_url, th.bg, th.logo_adapts, th.text)
        self.logo_on_accent = _logo_for(th.logo_url or th.mark_url, th.accent, th.logo_adapts, th.on_accent)
        try:
            self.when = datetime.fromisoformat(report["generated_at"]).strftime("%B %-d, %Y")
        except Exception:  # noqa: BLE001
            self.when = ""

    def background(self, c: canvas.Canvas) -> None:
        c.setFillColor(self.th.bg)
        c.rect(0, 0, PW, PH, fill=1, stroke=0)

    def header(self, c: canvas.Canvas, eyebrow: str, title: str, subtitle: str = "") -> float:
        """Every content slide opens the same way, so the title and the body always sit in the same place."""
        th = self.th
        c.setFillColor(th.accent)
        c.rect(MARGIN, PH - 46, 34, 4, fill=1, stroke=0)
        _caps(c, eyebrow, MARGIN + 46, PH - 48.5, 8.5, th.muted, 1.6)
        if self.mark_on_bg:
            _draw_logo(c, self.mark_on_bg, PW - MARGIN, PH - 60, 120, 26, align="right")
        elif self.logo_on_bg is None:
            c.setFillColor(th.muted)
            c.setFont(BOLD, 9)
            c.drawRightString(PW - MARGIN, PH - 48.5, _fit(c, th.name.upper(), BOLD, 9, 240))
        c.setFillColor(th.text)
        c.setFont(BOLD, 30)
        c.drawString(MARGIN, PH - 88, _fit(c, _t(title), BOLD, 30, PW - 2 * MARGIN))
        if subtitle:
            c.setFillColor(th.muted)
            c.setFont(FONT, 12.5)
            c.drawString(MARGIN, PH - 110, _fit(c, _t(subtitle), FONT, 12.5, PW - 2 * MARGIN))
        return BODY_TOP

    def footer(self, c: canvas.Canvas) -> None:
        th = self.th
        c.setStrokeColor(th.border)
        c.setLineWidth(0.6)
        c.line(MARGIN, 40, PW - MARGIN, 40)
        c.setFillColor(th.muted)
        c.setFont(FONT, 8)
        left = f"{th.name}  ·  {self.rep.get('period_label', '')}" + ("  ·  Sample data" if self.rep.get("sample") else "")
        c.drawString(MARGIN, 24, _fit(c, left, FONT, 8, 520))
        c.drawRightString(PW - MARGIN, 24, f"{self.page}")

    def next(self, c: canvas.Canvas) -> None:
        c.showPage()
        self.page += 1

    # ---- cover
    def cover(self, c: canvas.Canvas) -> None:
        th, rep = self.th, self.rep
        self.page = 1
        self.background(c)
        panel_x = PW * 0.60
        # right panel: the community's own photo washed in its accent, or a pattern in its accent
        photo = _photo_cover(th.photos[0], PW - panel_x, PH, th.accent, 0.22) if th.photos else None
        if photo:
            c.drawImage(photo, panel_x, 0, PW - panel_x, PH)
        else:
            c.setFillColor(th.accent)
            c.rect(panel_x, 0, PW - panel_x, PH, fill=1, stroke=0)
            _rings(c, PW - 30, PH * 0.34, th.on_accent, 0.22, [60, 110, 170, 240, 320, 410])
            c.saveState()
            c.setFillColor(th.on_accent)
            c.setFillAlpha(0.07)
            c.circle(panel_x + 70, PH - 70, 120, fill=1, stroke=0)
            c.restoreState()
        # a thin accent seam between the two halves
        c.setFillColor(th.accent)
        c.rect(panel_x - 5, 0, 5, PH, fill=1, stroke=0)
        # logo
        if self.logo_on_bg:
            _draw_logo(c, self.logo_on_bg, MARGIN, PH - MARGIN - 52, 240, 52)
        else:
            _wordmark(c, th, MARGIN, PH - MARGIN - 20, 18, th.text)
        _caps(c, f"{rep.get('title', 'Report')}  ·  {rep.get('period_label', '')}", MARGIN, 330, 9, th.muted, 1.8)
        y = _para(c, th.name, MARGIN, 318, panel_x - MARGIN - 40, BOLD, 44, th.text, 48, 3)
        c.setFillColor(th.accent)
        c.rect(MARGIN, y - 8, 54, 5, fill=1, stroke=0)
        head = rep.get("headline") if isinstance(rep.get("headline"), str) else ""
        y = _para(c, head, MARGIN, y - 24, panel_x - MARGIN - 50, FONT, 17, th.muted, 23, 3)
        who = f"Prepared for {_t(rep['label'])}" if rep.get("label") else ""
        if who:
            _para(c, who, MARGIN, 96, panel_x - MARGIN - 50, BOLD, 11, th.text)
        c.setFillColor(th.muted)
        c.setFont(FONT, 9.5)
        c.drawString(MARGIN, 60, f"{self.when}" + ("   ·   Sample data" if rep.get("sample") else ""))
        self.next(c)


    # ---- a number tile: the figure at the top, what it means at the bottom, however tall the tile is
    def _tile(self, c, t: dict, x: float, top: float, w: float, h: float, big: bool = False) -> None:
        th = self.th
        hi = bool(t.get("accent"))
        c.setFillColor(th.panel)
        c.roundRect(x, top - h, w, h, 12, fill=1, stroke=0)
        if hi:
            c.setFillColor(th.accent)
            c.roundRect(x, top - h, 4.5, h, 2.2, fill=1, stroke=0)
        pad = 20.0
        lab_s, note_s = (13.5, 10.5) if big else (11.5, 9.5)
        lab = simpleSplit(_t(t.get("label", "")), BOLD if big else FONT, lab_s, w - pad - 14)[:2]
        note = simpleSplit(_t(t.get("note", "")), FONT, note_s, w - pad - 14)[:2] if t.get("note") else []
        block = len(lab) * (lab_s + 3) + (len(note) * (note_s + 3) + 3 if note else 0)
        val = _t(t.get("value", ""))
        size = min(_val_size(val, w, h, big), max(20.0, h - 16 - block - 14))
        c.setFillColor(th.accent_fg if hi else th.text)
        c.setFont(BOLD, size)
        c.drawString(x + pad, top - 16 - size * 0.8, _fit(c, val, BOLD, size, w - pad - 12))
        y = top - h + 14 + block - lab_s
        c.setFillColor(th.text)
        c.setFont(BOLD if big else FONT, lab_s)
        for ln in lab:
            c.drawString(x + pad, y, ln)
            y -= lab_s + 3
        if note:
            y -= 3
            c.setFillColor(th.muted)
            c.setFont(FONT, note_s)
            for ln in note:
                c.drawString(x + pad, y, ln)
                y -= note_s + 3

    def _insights(self, c, items: List[str], x: float, top: float, width: float) -> None:
        th = self.th
        y = top
        for ins in items:
            n = _ins_lines(ins, width)
            c.setFillColor(th.accent)
            c.circle(x + 3.5, y - 8, 3, fill=1, stroke=0)
            _para(c, ins, x + 16, y, width - 16, FONT, INS_SIZE, th.text, INS_LEAD, n)
            y -= n * INS_LEAD + INS_GAP

    # ---- at a glance: the one number that matters from each section, then the plain-language headline
    def glance(self, c: canvas.Canvas) -> None:
        th, rep = self.th, self.rep
        picks = []
        for s in rep["sections"]:
            tiles = s.get("tiles") or []
            if not tiles:
                continue
            t = next((x for x in tiles if x.get("accent")), tiles[0])
            picks.append((s, t))
        picks = picks[:4]
        if not picks or rep.get("hide_glance"):
            return
        self.background(c)
        self.header(c, "At a glance", "The numbers that matter", f"{rep.get('period_label', '')}. Every figure is counted from {th.name}'s own records.")
        n = len(picks)
        gap = 18.0
        w = (PW - 2 * MARGIN - gap * (n - 1)) / n
        line = next((ins for s in rep["sections"] for ins in (s.get("insights") or [])), "")
        band = 78.0 if line else 0.0
        ch = BODY_H - (band + 22 if line else 0)
        ch = min(ch, 300.0)
        top = BODY_TOP - ((BODY_H - ch - (band + 22 if line else 0)) * 0.3)
        for i, (s, t) in enumerate(picks):
            x = MARGIN + i * (w + gap)
            c.setFillColor(th.panel)
            c.roundRect(x, top - ch, w, ch, 14, fill=1, stroke=0)
            c.setFillColor(th.accent)
            c.roundRect(x, top - ch, 5, ch, 2.5, fill=1, stroke=0)
            _caps(c, _fit(c, s["title"].upper(), BOLD, 8.5, w - 48), x + 24, top - 30, 8.5, th.muted, 1.4)
            val = _t(t["value"])
            size = 66 if len(val) <= 4 else 54 if len(val) <= 6 else 40 if len(val) <= 9 else 30
            while size > 20 and len(val) * size * 0.58 > w - 48:
                size -= 2
            c.setFillColor(th.accent_fg)
            c.setFont(BOLD, size)
            c.drawString(x + 24, top - 52 - size * 0.8, _fit(c, val, BOLD, size, w - 40))
            lab = simpleSplit(_t(t["label"]), BOLD, 14, w - 48)[:2]
            note = simpleSplit(_t(t.get("note", "")), FONT, 10.5, w - 48)[:3] if t.get("note") else []
            block = len(lab) * 18 + (len(note) * 13.5 + 4 if note else 0)
            y = top - ch + 22 + block - 14
            c.setFillColor(th.text)
            c.setFont(BOLD, 14)
            for ln in lab:
                c.drawString(x + 24, y, ln)
                y -= 18
            y -= 3
            c.setFillColor(th.muted)
            c.setFont(FONT, 10.5)
            for ln in note:
                c.drawString(x + 24, y, ln)
                y -= 13.5
        if line:
            by = top - ch - 22
            c.setFillColor(th.soft)
            c.roundRect(MARGIN, by - band, PW - 2 * MARGIN, band, 12, fill=1, stroke=0)
            c.setFillColor(th.accent)
            c.roundRect(MARGIN, by - band, 5, band, 2.5, fill=1, stroke=0)
            lines = simpleSplit(_t(line), BOLD, 15, PW - 2 * MARGIN - 56)[:3]
            ty = by - band / 2 + len(lines) * 10 - 3
            c.setFillColor(th.text)
            c.setFont(BOLD, 15)
            for ln in lines:
                c.drawString(MARGIN + 26, ty, ln)
                ty -= 20
        self.footer(c)
        self.next(c)

    # ---- one slide per section
    def section(self, c: canvas.Canvas, s: dict) -> None:
        self.background(c)
        self.header(c, self.rep.get("title", "Report"), s.get("title", ""), s.get("subtitle", ""))
        tiles = (s.get("tiles") or [])[:6]
        charts = [ch for ch in (s.get("charts") or []) if ch.get("type") in ("columns", "hbar", "table", "donut") and _has_data(ch)][:2]
        insights = (s.get("insights") or [])[:3]
        if s.get("cards"):
            self._cards(c, s["cards"][:6])
        elif charts and len(charts) == 1 and charts[0].get("type") == "table" and tiles:
            self._tiles_over_table(c, tiles, charts[0])
        elif charts:
            self._with_charts(c, tiles, charts, insights)
        else:
            self._tiles_only(c, tiles, insights)
        self.footer(c)
        self.next(c)

    # ---- numbered cards: what we offer and what we ask for. Text is sized to fit, never cut mid-sentence where it can be helped
    def _cards(self, c, cards: List[dict]) -> None:
        th = self.th
        n = len(cards)
        cols = {1: 1, 2: 2, 3: 3, 4: 2}.get(n, 3)
        rows = -(-n // cols)
        width = PW - 2 * MARGIN
        w = (width - GAP * (cols - 1)) / cols
        h = min(200.0 if rows == 1 else 230.0, (BODY_H - (rows - 1) * GAP) / rows)
        group = rows * h + (rows - 1) * GAP
        y0 = BODY_TOP - (BODY_H - group) * 0.35
        iw = w - 44
        for i, cd in enumerate(cards):
            x = MARGIN + (i % cols) * (w + GAP)
            top = y0 - (i // cols) * (h + GAP)
            c.setFillColor(th.panel)
            c.roundRect(x, top - h, w, h, 12, fill=1, stroke=0)
            c.setFillColor(th.accent)
            c.roundRect(x, top - h, 4.5, h, 2.2, fill=1, stroke=0)
            tsz = 20.0 if w > 300 else 16.0
            title = simpleSplit(_t(cd.get("title", "")), BOLD, tsz, iw)[:2]
            text = _t(cd.get("text", ""))
            room = h - 22 - 14 - len(title) * (tsz + 5) - 10 - 20
            size = 16.0 if w > 300 else 13.5
            while size > 10.5 and _card_lines(text, size, iw) * size * 1.4 > room:
                size -= 0.5
            lines = simpleSplit(text, FONT, size, iw)[: max(1, int(room // (size * 1.4)))]
            c.setFillColor(th.accent_fg)
            c.setFont(BOLD, 10)
            c.drawString(x + 22, top - 28, f"{i + 1:02d}")
            y = top - 28 - 10 - tsz
            c.setFillColor(th.text)
            c.setFont(BOLD, tsz)
            for ln in title:
                c.drawString(x + 22, y, ln)
                y -= tsz + 5
            y -= 5
            c.setFillColor(th.muted)
            c.setFont(FONT, size)
            for ln in lines:
                c.drawString(x + 22, y, ln)
                y -= size * 1.4

    def _with_charts(self, c, tiles: List[dict], charts: List[dict], insights: List[str]) -> None:
        th = self.th
        if tiles:
            ih = _ins_h(insights, LEFT_W)
            rows = -(-len(tiles) // 2)
            tw = (LEFT_W - GAP) / 2
            th_ = max(88.0, min(176.0, (BODY_H - (ih + 18 if ih else 0) - (rows - 1) * GAP) / rows))
            for i, t in enumerate(tiles):
                self._tile(c, t, MARGIN + (i % 2) * (tw + GAP), BODY_TOP - (i // 2) * (th_ + GAP), tw, th_)
            if insights:
                self._insights(c, insights, MARGIN, BODY_TOP - rows * th_ - (rows - 1) * GAP - 18, LEFT_W)
            px = MARGIN + LEFT_W + 30
        else:
            px = MARGIN
        pw = PW - MARGIN - px
        nat = [_nat_h(ch) for ch in charts]
        total = BODY_H - (len(charts) - 1) * GAP
        top = BODY_TOP
        for ch, n in zip(charts, nat):
            h = n / sum(nat) * total
            c.setFillColor(th.panel)
            c.roundRect(px, top - h, pw, h, 12, fill=1, stroke=0)
            _chart(c, th, ch, px + 18, top - h + 14, pw - 36, h - 26)
            top -= h + GAP

    def _tiles_over_table(self, c, tiles: List[dict], table: dict) -> None:
        """A table is wide, so it gets the full width under a row of tiles instead of a narrow column beside them."""
        th = self.th
        tiles = tiles[:4]
        n = len(tiles)
        width = PW - 2 * MARGIN
        w = (width - GAP * (n - 1)) / n
        h = 124.0
        for i, t in enumerate(tiles):
            self._tile(c, t, MARGIN + i * (w + GAP), BODY_TOP, w, h)
        top = BODY_TOP - h - GAP
        ph = top - BODY_BOT
        c.setFillColor(th.panel)
        c.roundRect(MARGIN, top - ph, width, ph, 12, fill=1, stroke=0)
        _chart(c, th, table, MARGIN + 22, top - ph + 14, width - 44, ph - 26)

    def _tiles_only(self, c, tiles: List[dict], insights: List[str]) -> None:
        n = len(tiles)
        if n:
            cols = {1: 1, 2: 2, 3: 3, 4: 4}.get(n, 3)
            rows = -(-n // cols)
            width = PW - 2 * MARGIN
            ih = _ins_h(insights, width)
            extra = ih + 28 if ih else 0
            h = min(210.0, (BODY_H - extra - (rows - 1) * GAP) / rows)
            group = rows * h + (rows - 1) * GAP + extra
            y0 = BODY_TOP - (BODY_H - group) * 0.35
            w = (width - GAP * (cols - 1)) / cols
            for i, t in enumerate(tiles):
                self._tile(c, t, MARGIN + (i % cols) * (w + GAP), y0 - (i // cols) * (h + GAP), w, h, big=True)
            if insights:
                self._insights(c, insights, MARGIN, y0 - rows * h - (rows - 1) * GAP - 28, width)
        elif insights:
            self._insights(c, insights, MARGIN, BODY_TOP - 20, PW - 2 * MARGIN)


    # ---- closing
    def closing(self, c: canvas.Canvas) -> None:
        th = self.th
        self.background(c)
        panel_w = PW * 0.38
        photo = _photo_cover(th.photos[1] if len(th.photos) > 1 else None, panel_w, PH, th.accent, 0.22) if len(th.photos) > 1 else None
        if photo:
            c.drawImage(photo, PW - panel_w, 0, panel_w, PH)
        else:
            c.setFillColor(th.accent)
            c.rect(PW - panel_w, 0, panel_w, PH, fill=1, stroke=0)
            _rings(c, PW - panel_w, PH * 0.62, th.on_accent, 0.2, [50, 100, 160, 230, 310, 400])
        c.setFillColor(th.accent)
        c.rect(PW - panel_w - 5, 0, 5, PH, fill=1, stroke=0)
        text_w = PW - panel_w - MARGIN - 56
        if self.logo_on_bg:
            _draw_logo(c, self.logo_on_bg, MARGIN, PH - MARGIN - 46, 220, 46)
        else:
            _wordmark(c, th, MARGIN, PH - MARGIN - 18, 16, th.text)
        _para(c, "Let's work together." if self.rep.get("type") == "sponsor" else "Thank you.", MARGIN, 360, text_w, BOLD, 50 if self.rep.get("type") != "sponsor" else 40, th.text, 54, 1)
        c.setFillColor(th.accent)
        c.rect(MARGIN, 292, 54, 5, fill=1, stroke=0)
        y = 276
        if th.about:
            y = _para(c, th.about, MARGIN, y, text_w, FONT, 13, th.muted, 19, 5) - 14
        contact = [x for x in (th.site.replace("https://", "").replace("http://", "").rstrip("/"), th.email) if x]
        for item in contact[:2]:
            c.setFillColor(th.accent)
            c.circle(MARGIN + 3.5, y - 7, 3, fill=1, stroke=0)
            c.setFillColor(th.text)
            c.setFont(BOLD, 12)
            c.drawString(MARGIN + 16, y - 11, _fit(c, item, BOLD, 12, text_w - 20))
            y -= 24
        c.setFillColor(th.muted)
        c.setFont(FONT, 8.5)
        c.drawString(MARGIN, 52, _fit(c, "Every figure is counted from this community's own records, never estimated. Totals only: no member names or contact details.", FONT, 8.5, text_w + 60))
        c.drawString(MARGIN, 38, "Made with Pathwai")
        self.page += 0
        c.showPage()


def build_deck(report: Dict[str, Any], cfg: Dict[str, Any], label: Optional[str] = None) -> bytes:
    """The report as a widescreen PDF deck in the community's own colours, logo, photos and story."""
    d = _Deck(report, cfg, label)
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(PW, PH), pageCompression=1)
    c.setTitle(_t(f"{d.th.name}: {report.get('title', 'report')}"))
    c.setAuthor("Pathwai")
    c.setSubject(_t(report.get("headline") if isinstance(report.get("headline"), str) else report.get("title", "")))
    d.cover(c)
    d.glance(c)
    for s in report["sections"]:
        d.section(c, s)
    d.closing(c)
    c.save()
    return buf.getvalue()
