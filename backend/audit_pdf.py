"""Renders the audit report (see audit_report.py) as a print-ready, chart-led PDF with reportlab.

Charts are drawn directly (no image libraries): thin bars with rounded data ends, direct value labels, a legend
beside every multi-series chart, and a fixed series colour order so each colour always means the same thing.
"""
from __future__ import annotations

import io
import re
from datetime import datetime
from typing import Any, Dict, List, Optional
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import BaseDocTemplate, Flowable, Frame, KeepTogether, PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle

INK = colors.HexColor("#111111")
MUTED = colors.HexColor("#5F5F5A")
FAINT = colors.HexColor("#E6E5E0")
TRACK = colors.HexColor("#EFEEEA")
PAPER = colors.HexColor("#FFFFFF")
# categorical order (validated palette, fixed order): blue, orange, aqua, yellow, magenta
SERIES = [colors.HexColor(h) for h in ("#2A78D6", "#EB6834", "#1BAF7A", "#EDA100", "#E87BA4")]

W, H = letter
MARGIN = 0.7 * inch
CONTENT_W = W - 2 * MARGIN


def _t(s: Any) -> str:
    """Text the built-in PDF fonts can draw (Latin-1 / Windows-1252); anything else becomes '?'."""
    return str(s if s is not None else "").encode("cp1252", "replace").decode("cp1252")


def _lum(c: colors.Color) -> float:
    def f(v: float) -> float:
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c.red) + 0.7152 * f(c.green) + 0.0722 * f(c.blue)


def _brand(config: Dict[str, Any]) -> colors.Color:
    hexv = (((config or {}).get("brand") or {}).get("colors") or {}).get("accent") or ""
    try:
        c = colors.HexColor(hexv)
    except Exception:  # noqa: BLE001
        return INK
    return c if _lum(c) < 0.25 else colors.HexColor("#111111")  # white text must stay readable on the band


S_H1 = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=26, leading=30, textColor=INK, alignment=TA_LEFT)
S_H2 = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=INK)
S_H3 = ParagraphStyle("h3", fontName="Helvetica-Bold", fontSize=10.5, leading=13, textColor=INK, spaceAfter=4)
S_BODY = ParagraphStyle("body", fontName="Helvetica", fontSize=10, leading=14.5, textColor=INK)
S_MUTED = ParagraphStyle("muted", parent=S_BODY, textColor=MUTED, fontSize=9.5, leading=13.5)
S_BUL = ParagraphStyle("bul", parent=S_BODY, leftIndent=12, bulletIndent=0, spaceAfter=4)
S_EYE = ParagraphStyle("eye", fontName="Helvetica-Bold", fontSize=7.5, leading=10, textColor=MUTED)


class _Tiles(Flowable):
    """Row of big-number tiles."""

    def __init__(self, tiles: List[Dict[str, Any]], width: float, brand: colors.Color):
        super().__init__()
        self.tiles, self.width, self.brand = tiles[:5], width, brand
        self.height = 66

    def wrap(self, aw, ah):
        return self.width, self.height

    def draw(self):
        c, n = self.canv, max(len(self.tiles), 1)
        gap = 8
        w = min((self.width - gap * (n - 1)) / n, 132)
        for i, t in enumerate(self.tiles):
            x = i * (w + gap)
            c.setFillColor(colors.HexColor("#F7F6F2"))
            c.setStrokeColor(self.brand if t.get("accent") else FAINT)
            c.setLineWidth(1.4 if t.get("accent") else 0.6)
            c.roundRect(x, 0, w, self.height, 6, fill=1, stroke=1)
            c.setFillColor(INK)
            c.setFont("Helvetica-Bold", 22 if len(_t(t["value"])) < 7 else 16)
            c.drawString(x + 10, self.height - 30, _t(t["value"]))
            c.setFillColor(MUTED)
            c.setFont("Helvetica", 8)
            lab = _t(t["label"])
            while c.stringWidth(lab, "Helvetica", 8) > w - 18 and len(lab) > 4:
                lab = lab[:-2]
            c.drawString(x + 10, 24, lab)
            if t.get("note"):
                c.setFont("Helvetica", 7)
                note = _t(t["note"])
                while c.stringWidth(note, "Helvetica", 7) > w - 18 and len(note) > 4:
                    note = note[:-2]
                c.drawString(x + 10, 12, note)


class _HBar(Flowable):
    """Horizontal bars, labels on the left, the value drawn at the end of each bar."""

    ROW = 18.5

    def __init__(self, items: List[Dict[str, Any]], width: float, unit: str = "", vmax: Optional[float] = None, color=SERIES[0]):
        super().__init__()
        self.items, self.width, self.unit, self.color = items, width, unit, color
        self.vmax = vmax or max([i["value"] for i in items] + [1])
        self.height = self.ROW * max(len(items), 1) + 2

    def wrap(self, aw, ah):
        return self.width, self.height

    def draw(self):
        c = self.canv
        label_w = self.width * 0.40
        track_x, track_w = label_w + 8, self.width - label_w - 8 - 62
        for i, it in enumerate(self.items):
            y = self.height - (i + 1) * self.ROW + 4
            c.setFillColor(INK)
            c.setFont("Helvetica", 8.5)
            lab = _t(it["label"])
            while c.stringWidth(lab, "Helvetica", 8.5) > label_w and len(lab) > 4:
                lab = lab[:-2]
            c.drawString(0, y + 3, lab)
            c.setFillColor(TRACK)
            c.roundRect(track_x, y + 1, track_w, 8, 4, fill=1, stroke=0)
            bw = max(track_w * (it["value"] / self.vmax), 0 if it["value"] == 0 else 6)
            if bw:
                c.setFillColor(self.color)
                c.roundRect(track_x, y + 1, bw, 8, 4, fill=1, stroke=0)
            c.setFillColor(INK)
            c.setFont("Helvetica-Bold", 8.5)
            val = f"{it['value']}%" if self.unit == "% full" else str(it["value"])
            c.drawString(track_x + track_w + 8, y + 2.5, val)
            if it.get("note"):
                c.setFillColor(MUTED)
                c.setFont("Helvetica", 7.5)
                c.drawString(track_x + track_w + 8 + c.stringWidth(val, "Helvetica-Bold", 8.5) + 4, y + 2.5, _t(it["note"]))


class _Columns(Flowable):
    """Vertical columns over time, value above each column, label under it."""

    def __init__(self, items: List[Dict[str, Any]], width: float, color=SERIES[0]):
        super().__init__()
        self.items, self.width, self.color, self.height = items, width, color, 120

    def wrap(self, aw, ah):
        return self.width, self.height

    def draw(self):
        c = self.canv
        n = max(len(self.items), 1)
        vmax = max([i["value"] for i in self.items] + [1])
        base, top = 20, self.height - 16
        slot = self.width / n
        bw = min(slot * 0.5, 34)
        c.setStrokeColor(FAINT)
        c.setLineWidth(0.8)
        c.line(0, base, self.width, base)
        for i, it in enumerate(self.items):
            cx = i * slot + slot / 2
            h = (top - base) * it["value"] / vmax
            if h > 0:
                c.setFillColor(self.color)
                c.roundRect(cx - bw / 2, base, bw, max(h, 3), 3, fill=1, stroke=0)
            c.setFillColor(INK)
            c.setFont("Helvetica-Bold", 8.5)
            c.drawCentredString(cx, base + max(h, 3) + 3, str(it["value"]))
            c.setFillColor(MUTED)
            c.setFont("Helvetica", 7.5)
            c.drawCentredString(cx, 8, _t(it["label"]))


class _Donut(Flowable):
    """Donut with a legend on the right (colour, label, count, share)."""

    def __init__(self, items: List[Dict[str, Any]], width: float):
        super().__init__()
        self.items, self.width = items[:5], width
        self.height = 100

    def wrap(self, aw, ah):
        return self.width, self.height

    def draw(self):
        c = self.canv
        total = sum(i["value"] for i in self.items) or 1
        cx, cy, r = 52, self.height / 2, 46
        start = 90.0
        for i, it in enumerate(self.items):
            sweep = -360.0 * it["value"] / total
            if it["value"]:
                c.setFillColor(SERIES[i])
                c.setStrokeColor(PAPER)
                c.setLineWidth(2)
                c.wedge(cx - r, cy - r, cx + r, cy + r, start, sweep, fill=1, stroke=1)
            start += sweep
        c.setFillColor(PAPER)
        c.setStrokeColor(PAPER)
        c.circle(cx, cy, r * 0.58, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 17)
        c.drawCentredString(cx, cy - 3, str(sum(i["value"] for i in self.items)))
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 7)
        c.drawCentredString(cx, cy - 13, "total")
        lx = 130
        row = 18
        y0 = cy + (len(self.items) * row) / 2 - 12
        for i, it in enumerate(self.items):
            y = y0 - i * row
            c.setFillColor(SERIES[i])
            c.roundRect(lx, y, 9, 9, 2, fill=1, stroke=0)
            c.setFillColor(INK)
            c.setFont("Helvetica", 9)
            c.drawString(lx + 15, y + 1, _t(it["label"]))
            c.setFont("Helvetica-Bold", 9)
            c.drawRightString(self.width - 4, y + 1, f"{it['value']}  ({round(100 * it['value'] / total)}%)")


class _Pairs(Flowable):
    """Two thin bars per row (e.g. asking vs can help) with a legend."""

    ROW = 26

    def __init__(self, items: List[Dict[str, Any]], width: float, a: str, b: str):
        super().__init__()
        self.items, self.width, self.a, self.b = items, width, a, b
        self.height = self.ROW * max(len(items), 1) + 18

    def wrap(self, aw, ah):
        return self.width, self.height

    def draw(self):
        c = self.canv
        vmax = max([max(i["asks"], i["helpers"]) for i in self.items] + [1])
        label_w = self.width * 0.40
        track_x, track_w = label_w + 8, self.width - label_w - 8 - 30
        # legend
        for k, (name, col) in enumerate(((self.a, SERIES[0]), (self.b, SERIES[1]))):
            x = track_x + k * 90
            c.setFillColor(col)
            c.roundRect(x, self.height - 11, 9, 9, 2, fill=1, stroke=0)
            c.setFillColor(INK)
            c.setFont("Helvetica", 8.5)
            c.drawString(x + 14, self.height - 10, _t(name))
        for i, it in enumerate(self.items):
            y = self.height - 18 - (i + 1) * self.ROW + 8
            c.setFillColor(INK)
            c.setFont("Helvetica", 8.5)
            lab = _t(it["label"])
            while c.stringWidth(lab, "Helvetica", 8.5) > label_w and len(lab) > 4:
                lab = lab[:-2]
            c.drawString(0, y + 6, lab)
            for j, (val, col) in enumerate(((it["asks"], SERIES[0]), (it["helpers"], SERIES[1]))):
                yy = y + 10 - j * 11
                c.setFillColor(TRACK)
                c.roundRect(track_x, yy, track_w, 7, 3.5, fill=1, stroke=0)
                bw = max(track_w * val / vmax, 0 if val == 0 else 5)
                if bw:
                    c.setFillColor(col)
                    c.roundRect(track_x, yy, bw, 7, 3.5, fill=1, stroke=0)
                c.setFillColor(INK)
                c.setFont("Helvetica-Bold", 8)
                c.drawString(track_x + track_w + 6, yy, str(val))


def _chart(ch: Dict[str, Any], width: float):
    items = ch.get("items") or []
    t = ch["type"]
    if t == "table":
        rows = ch.get("rows") or []
        if not rows:
            return None
        data = [[Paragraph(f"<b>{escape(_t(c))}</b>", ParagraphStyle("th", parent=S_MUTED, fontSize=8))for c in ch["columns"]]]
        cell = ParagraphStyle("td", parent=S_BODY, fontSize=8.5, leading=11)
        data += [[Paragraph(escape(_t(c)), cell) for c in r] for r in rows]
        n = len(ch["columns"])
        widths = [width * 0.22, width * 0.46, width * 0.32] if n == 3 else [width * 0.18, width * 0.44, width * 0.22, width * 0.16] if n == 4 else [width * 0.3, width * 0.7]
        tb = Table(data, colWidths=widths, repeatRows=1)
        tb.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, 0), 0.8, INK), ("LINEBELOW", (0, 1), (-1, -1), 0.4, FAINT), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                                ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4), ("LEFTPADDING", (0, 0), (-1, -1), 2)]))
        return tb
    if not items or (t != "pairs" and sum(i.get("value", 0) for i in items) == 0):
        return Paragraph("Nothing to chart yet. This fills in as members join and complete their profiles.", S_MUTED)
    if t == "hbar":
        return _HBar(items, width, ch.get("unit", ""), ch.get("max"))
    if t == "columns":
        return _Columns(items, width)
    if t == "donut":
        return _Donut(items, width)
    if t == "pairs":
        return _Pairs(items, width, ch.get("a", "A"), ch.get("b", "B"))
    return None


def _Cards(cards: List[Dict[str, Any]], brand: Any) -> Any:
    """What we offer / ask for: a title and a sentence or two each, two to a row."""
    cell = lambda c: [Paragraph(f"<b>{escape(_t(c['title']))}</b>", S_H3), Paragraph(escape(_t(c.get("text", ""))), S_BODY)]  # noqa: E731
    rows = [[cell(cards[i]), cell(cards[i + 1]) if i + 1 < len(cards) else ""] for i in range(0, len(cards), 2)]
    t = Table(rows, colWidths=[CONTENT_W / 2, CONTENT_W / 2])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOX", (0, 0), (-1, -1), 0.6, FAINT), ("INNERGRID", (0, 0), (-1, -1), 0.6, FAINT),
                           ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    return t


def build_pdf(report: Dict[str, Any], config: Dict[str, Any], ai_text: Optional[str] = None, only_kind: Optional[str] = None, label: Optional[str] = None) -> bytes:
    """`label` swaps the "Community audit" wording for another document name (the sponsor/funder/board reports reuse this)."""
    brand = _brand(config)
    community = _t(report.get("community") or "Community")
    try:
        gen = datetime.fromisoformat(report["generated_at"]).strftime("%B %-d, %Y")
    except Exception:  # noqa: BLE001
        gen = ""
    sections = report["sections"]
    buf = io.BytesIO()

    def on_page(canv, doc):
        canv.saveState()
        canv.setFont("Helvetica", 7.5)
        canv.setFillColor(MUTED)
        canv.drawString(MARGIN, 0.45 * inch, _t(f"{community}  |  {label or 'Community audit'}  |  {gen}"))
        canv.drawRightString(W - MARGIN, 0.45 * inch, f"Pathwai  |  Page {doc.page}")
        canv.restoreState()

    doc = BaseDocTemplate(buf, pagesize=letter, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=0.7 * inch, bottomMargin=0.8 * inch,
                          title=_t(f"{community} {(label or 'community audit').lower()}"), author="Pathwai")
    doc.addPageTemplates([PageTemplate(id="p", frames=[Frame(MARGIN, 0.8 * inch, CONTENT_W, H - 1.5 * inch, id="f", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=on_page)])
    st: List[Any] = []

    # --- cover / summary ---
    class _Band(Flowable):
        def wrap(self, aw, ah):
            return CONTENT_W, 92

        def draw(self):
            c = self.canv
            c.setFillColor(brand)
            c.roundRect(0, 0, CONTENT_W, 92, 8, fill=1, stroke=0)
            c.setFillColor(colors.white)
            c.setFont("Helvetica-Bold", 8)
            c.drawString(18, 70, (label or ("COMMUNITY AUDIT REPORT" if not only_kind else "COMMUNITY AUDIT")).upper())
            c.setFont("Helvetica-Bold", 24)
            c.drawString(18, 40, community[:42])
            c.setFont("Helvetica", 9.5)
            c.drawString(18, 20, f"Generated {gen}" + (f"  |  {report['period_label']}" if report.get("period_label") else ""))

    st += [_Band(), Spacer(1, 16)]
    if not only_kind:
        st += [_Tiles([{"label": h["label"], "value": h["value"]} for h in report["headline"]], CONTENT_W, brand), Spacer(1, 18)]
        st.append(Paragraph("Key takeaways" if not label else "At a glance", S_H3))
        for s in sections:
            if s["insights"]:
                st.append(Paragraph(f"<b>{escape(_t(s['title']))}.</b> {escape(_t(s['insights'][0]))}", S_BUL, bulletText="•"))
        if ai_text:
            st += [Spacer(1, 10), Paragraph("Summary", S_H3), Paragraph(escape(_t(ai_text)), S_BODY)]
        st += [Spacer(1, 12), Paragraph("Every figure in this report is counted from the community's own records at the time it was generated. Nothing is estimated.", S_MUTED)]
        st.append(PageBreak())

    # --- one page-ish per audit ---
    for idx, s in enumerate(sections):
        st += [Paragraph(f"{idx + 1:02d}" if not only_kind else "AUDIT", S_EYE), Paragraph(escape(_t(s["title"])), S_H2), Spacer(1, 2), Paragraph(escape(_t(s["subtitle"])), S_MUTED), Spacer(1, 12)]
        if s["tiles"]:
            st += [_Tiles(s["tiles"], CONTENT_W, brand), Spacer(1, 16)]
        if s.get("cards"):
            st += [_Cards(s["cards"], brand), Spacer(1, 10)]
        for ch in s["charts"]:
            fl = _chart(ch, CONTENT_W)
            if fl is None:
                continue
            st.append(KeepTogether([Paragraph(escape(_t(ch["title"])), S_H3), fl, Spacer(1, 10)]))
        if s["insights"]:
            box = Table([[Paragraph("What this means", S_H3)]] + [[Paragraph(escape(_t(i)), S_BUL, bulletText="•")] for i in s["insights"]], colWidths=[CONTENT_W])
            box.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F7F6F2")), ("BOX", (0, 0), (-1, -1), 0.6, FAINT), ("LEFTPADDING", (0, 0), (-1, -1), 12),
                                     ("RIGHTPADDING", (0, 0), (-1, -1), 12), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
            st.append(KeepTogether([box]))
        if idx < len(sections) - 1:
            st.append(PageBreak())

    doc.build(st)
    return buf.getvalue()
