import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildSlides, useAdaptedLogo, BODY_TOP, BODY_BOT, BODY_H, GAP, LEFT_W, INS_SIZE, INS_LEAD, INS_GAP, textLines, insLines, insH, valSize, natH, cardsLayout, cardLines } from "../lib/deck";
import { cx } from "./ui";

// The report as slides, in the community's own colours, logo, photos and story. This is what "Download slides" produces
// (backend/report_deck.py); it is drawn on a 960 x 540 canvas and scaled to fit, so what is previewed is what is downloaded.
const W = 960, H = 540, M = 56;
const caps = (color, size = 8.5, space = 1.6) => ({ color, fontSize: size, letterSpacing: space, textTransform: "uppercase", fontWeight: 700 });

function Rings({ cx: x, cy, color, opacity = 0.2, radii }) {
  return (
    <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }} aria-hidden>
      {radii.map((r) => <circle key={r} cx={x} cy={cy} r={r} fill="none" stroke={color} strokeOpacity={opacity} strokeWidth="1.3" />)}
    </svg>
  );
}

function Panel({ th, photo, side, rings }) {
  // a photo from the community, washed a little in its accent; without one, its accent with a quiet pattern
  const w = side === "right-wide" ? W * 0.4 : W * 0.38;
  return (
    <div style={{ position: "absolute", top: 0, right: 0, width: w, height: H, background: th.accent, overflow: "hidden" }}>
      {photo ? (
        <>
          <img src={photo} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: th.accent, opacity: 0.22 }} />
        </>
      ) : (
        <>
          <div style={{ position: "absolute", left: 20, top: -50, width: 240, height: 240, borderRadius: "50%", background: th.onAccent, opacity: 0.07 }} />
          <Rings cx={rings.cx} cy={rings.cy} color={th.onAccent} radii={[60, 110, 170, 240, 320, 410]} />
        </>
      )}
      <div style={{ position: "absolute", left: 0, top: 0, width: 5, height: H, background: th.accent }} />
    </div>
  );
}

function Brand({ th, logo, height, align = "left" }) {
  if (logo) return <img src={logo} alt={th.name} style={{ height, maxWidth: height * 5, objectFit: "contain", objectPosition: align === "right" ? "right" : "left", display: "block" }} />;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800, fontSize: height * 0.4, letterSpacing: 0.5, textTransform: "uppercase", color: th.text }}>
      <span style={{ width: height * 0.4, height: height * 0.4, borderRadius: height * 0.09, background: th.accent, display: "inline-block" }} />
      <span style={{ maxWidth: 440, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{th.name}</span>
    </div>
  );
}

function Header({ th, eyebrow, title, subtitle, mark }) {
  return (
    <>
      <span style={{ position: "absolute", left: M, top: 42, width: 34, height: 4, background: th.accent }} />
      <div style={{ position: "absolute", left: M + 46, top: 41, whiteSpace: "nowrap", ...caps(th.muted), lineHeight: "10px" }}>{eyebrow}</div>
      {mark
        ? <img src={mark} alt="" style={{ position: "absolute", right: M, top: 34, height: 26, maxWidth: 120, objectFit: "contain", objectPosition: "right" }} />
        : <span style={{ position: "absolute", right: M, top: 41, lineHeight: "10px", ...caps(th.muted, 9, 1), maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{th.name}</span>}
      <h2 style={{ position: "absolute", left: M, right: M, top: 58, margin: 0, fontSize: 30, lineHeight: "34px", fontWeight: 800, color: th.text, letterSpacing: 0, textTransform: "none", fontFamily: "inherit", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</h2>
      {subtitle && <p style={{ position: "absolute", left: M, right: M, top: 96, margin: 0, fontSize: 12.5, lineHeight: "17px", color: th.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</p>}
    </>
  );
}

function Footer({ th, report, n }) {
  return (
    <div style={{ position: "absolute", left: M, right: M, top: 500, borderTop: `1px solid ${th.border}`, paddingTop: 9, display: "flex", justifyContent: "space-between", fontSize: 8, lineHeight: "10px", color: th.muted }}>
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 520 }}>{th.name} · {report.period_label}{report.sample ? " · Sample data" : ""}</span><span>{n}</span>
    </div>
  );
}

const fv = (v) => (typeof v === "number" ? v.toLocaleString("en-US") : v);
const clamp = (n) => ({ display: "-webkit-box", WebkitLineClamp: n, WebkitBoxOrient: "vertical", overflow: "hidden" });

// A number tile: the figure at the top, what it means at the bottom, however tall the tile is.
function Tile({ th, t, big, h, w }) {
  const val = String(t.value ?? "");
  const pad = 20, labS = big ? 13.5 : 11.5, noteS = big ? 10.5 : 9.5, tw = w - pad - 14;
  const labN = textLines(t.label, labS, tw, 2, big ? 0.55 : 0.5), noteN = t.note ? textLines(t.note, noteS, tw, 2) : 0;
  const block = labN * (labS + 3) + (noteN ? noteN * (noteS + 3) + 3 : 0);
  const size = Math.min(valSize(val, w, h, big), Math.max(20, h - 16 - block - 14));
  return (
    <div style={{ position: "absolute", left: t.x, top: t.y, width: w, height: h, background: th.panel, borderRadius: 12, overflow: "hidden" }}>
      {t.accent && <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4.5, background: th.accent }} />}
      <div style={{ position: "absolute", left: pad, top: 16, width: tw + 2, fontSize: size, lineHeight: 1, fontWeight: 800, color: t.accent ? th.accentFg : th.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{val}</div>
      <div style={{ position: "absolute", left: pad, bottom: 14, width: tw }}>
        <div style={{ fontSize: labS, lineHeight: `${labS + 3}px`, fontWeight: big ? 700 : 400, color: th.text, ...clamp(2) }}>{t.label}</div>
        {t.note && <div style={{ marginTop: 3, fontSize: noteS, lineHeight: `${noteS + 3}px`, color: th.muted, ...clamp(2) }}>{t.note}</div>}
      </div>
    </div>
  );
}

function Insights({ th, items, x, y, width }) {
  let top = y;
  return items.map((t) => {
    const n = insLines(t, width), at = top;
    top += n * INS_LEAD + INS_GAP;
    return (
      <div key={t} style={{ position: "absolute", left: x, top: at, width, fontSize: INS_SIZE, lineHeight: `${INS_LEAD}px`, color: th.text }}>
        <span style={{ position: "absolute", left: 0, top: 4.5, width: 6, height: 6, borderRadius: 3, background: th.accent }} />
        <div style={{ marginLeft: 16, ...clamp(n) }}>{t}</div>
      </div>
    );
  });
}

const Empty = ({ th }) => <div style={{ fontSize: 11, lineHeight: "14px", color: th.muted }}>Nothing to chart yet. This fills in as members take part.</div>;

// A chart drawn inside a w x h box (the same sizes the download uses).
function Chart({ th, ch, w, h }) {
  const bodyH = h - 26;
  const items = (ch.items || []).slice(0, ch.type === "columns" ? 10 : ch.type === "donut" ? 5 : 7);
  const max = Math.max(1, ...items.map((i) => i.value || 0));
  let body = null;
  if (ch.type === "columns") {
    const n = items.length, slot = w / n, bw = Math.min(slot * 0.62, 48), base = 18, avail = bodyH - 18 - 20;
    body = (
      <div style={{ position: "relative", width: w, height: bodyH }}>
        <span style={{ position: "absolute", left: 0, right: 0, bottom: base, height: 1, background: th.border }} />
        {items.map((it, i) => {
          const bh = it.value ? Math.max(avail * (it.value / max), 3) : 0, cx = i * slot + slot / 2;
          return (
            <React.Fragment key={i}>
              {bh > 0 && <span style={{ position: "absolute", left: cx - bw / 2, bottom: base, width: bw, height: bh, borderRadius: `${Math.min(5, bw / 3)}px ${Math.min(5, bw / 3)}px 0 0`, background: i === n - 1 ? th.accentFg : th.accentFg + "73" }} />}
              <span style={{ position: "absolute", left: cx - 30, width: 60, textAlign: "center", bottom: base + bh + 4, fontSize: 11, lineHeight: "13px", fontWeight: 700, color: th.text }}>{fv(it.value)}</span>
              <span style={{ position: "absolute", left: cx - slot / 2 - 3, width: slot + 6, textAlign: "center", bottom: 2, fontSize: 8.5, lineHeight: "11px", color: th.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.label}</span>
            </React.Fragment>
          );
        })}
      </div>
    );
  } else if (ch.type === "hbar") {
    const row = Math.min(40, bodyH / Math.max(items.length, 1)), labW = w * 0.38, trackX = labW + 10, trackW = w - labW - 10 - 58;
    body = (
      <div style={{ position: "relative", width: w, height: bodyH }}>
        {items.map((it, i) => (
          <div key={i} style={{ position: "absolute", left: 0, top: i * row, width: w, height: row }}>
            <span style={{ position: "absolute", left: 0, top: row / 2 - 8, width: labW, fontSize: 11, lineHeight: "16px", color: th.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.label}</span>
            <span style={{ position: "absolute", left: trackX, top: row / 2 - 5, width: trackW, height: 10, borderRadius: 5, background: th.soft }} />
            {it.value > 0 && <span style={{ position: "absolute", left: trackX, top: row / 2 - 5, width: Math.max(trackW * (it.value / max), 7), height: 10, borderRadius: 5, background: th.accentFg, opacity: i === 0 ? 1 : 0.78 }} />}
            <span style={{ position: "absolute", left: trackX + trackW + 10, top: row / 2 - 8, fontSize: 11, lineHeight: "16px", fontWeight: 700, color: th.text, whiteSpace: "nowrap" }}>{ch.unit === "% full" ? `${it.value}%` : fv(it.value)}</span>
          </div>
        ))}
      </div>
    );
  } else if (ch.type === "table") {
    const cols = ch.columns || [], rows = (ch.rows || []).slice(0, 7);
    const fr = { 2: [0.65, 0.35], 3: [0.46, 0.3, 0.24], 4: [0.4, 0.24, 0.18, 0.18] }[cols.length] || cols.map(() => 1 / cols.length);
    const tpl = fr.map((f) => `${f * 100}%`).join(" "), rh = Math.min(46, (bodyH - 26) / Math.max(rows.length, 1));
    body = (
      <div style={{ width: w }}>
        <div style={{ display: "grid", gridTemplateColumns: tpl, height: 18, paddingTop: 4, boxSizing: "border-box", borderBottom: `1px solid ${th.text}`, ...caps(th.muted, 8, 1) }}>{cols.map((c) => <span key={c} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 6 }}>{c}</span>)}</div>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: tpl, height: rh, alignItems: "center", boxSizing: "border-box", borderBottom: `1px solid ${th.border}` }}>
            {r.slice(0, cols.length).map((cell, j) => <span key={j} style={{ color: j ? th.muted : th.text, fontWeight: j ? 400 : 700, fontSize: j ? 10.5 : 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 10 }}>{cell}</span>)}
          </div>
        ))}
      </div>
    );
  } else if (ch.type === "donut") {
    const total = items.reduce((a, i) => a + (i.value || 0), 0) || 1, r = Math.min(bodyH / 2 - 6, 88);
    let acc = 0;
    const stops = items.map((it, i) => { const a = (acc / total) * 360; acc += it.value || 0; return `${th.series[i]} ${a}deg ${(acc / total) * 360}deg`; }).join(", ");
    const lx = r * 2 + 8 + 26 - 4, row = 26;
    body = (
      <div style={{ position: "relative", width: w, height: bodyH }}>
        <span style={{ position: "absolute", left: 4, top: bodyH / 2 - r, width: r * 2, height: r * 2, borderRadius: "50%", background: `conic-gradient(${stops})`, WebkitMask: "radial-gradient(circle, transparent 57%, #000 58%)", mask: "radial-gradient(circle, transparent 57%, #000 58%)" }} />
        {items.map((it, i) => (
          <div key={i} style={{ position: "absolute", left: lx, width: w - lx, top: bodyH / 2 - (row * items.length) / 2 + i * row, height: row, display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: th.text }}>
            <span style={{ width: 11, height: 11, borderRadius: 2, background: th.series[i], flex: "none" }} />
            <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.label}</span><b>{Math.round((100 * it.value) / total)}%</b>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ width: w, height: h }}>
      <div style={{ height: 26, ...caps(th.muted, 8.5, 1.2), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ch.title}</div>
      {body}
    </div>
  );
}

function ChartPanel({ th, ch, x, y, w, h, inset = 18 }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, background: th.panel, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: inset, top: 12 }}><Chart th={th} ch={ch} w={w - inset * 2} h={h - 26} /></div>
    </div>
  );
}

// One slide on the 960 x 540 canvas.
function Slide({ th, report, slide, n, logos }) {
  const base = { position: "relative", width: W, height: H, background: th.bg, color: th.text, overflow: "hidden", fontFamily: "inherit", textAlign: "left" };
  if (slide.kind === "cover") {
    return (
      <div style={base}>
        <Panel th={th} photo={th.photos[0]} side="right-wide" rings={{ cx: W * 0.4 - 30, cy: H * 0.34 }} />
        <div style={{ position: "absolute", left: M, top: M }}><Brand th={th} logo={logos.bg} height={52} /></div>
        <div style={{ position: "absolute", left: M, right: W * 0.4 + 40, top: 160 }}>
          <div style={caps(th.muted, 9, 1.8)}>{report.title} · {report.period_label}</div>
          <h1 style={{ margin: "14px 0 0", fontSize: 44, lineHeight: "48px", fontWeight: 800, color: th.text, textTransform: "none", letterSpacing: 0, fontFamily: "inherit" }}>{th.name}</h1>
          <div style={{ width: 54, height: 5, background: th.accent, margin: "16px 0" }} />
          <p style={{ margin: 0, fontSize: 17, lineHeight: "23px", color: th.muted }}>{typeof report.headline === "string" ? report.headline : ""}</p>
        </div>
        <div style={{ position: "absolute", left: M, bottom: 52, fontSize: 9.5, color: th.muted }}>
          {report.label && <div style={{ fontSize: 11, fontWeight: 700, color: th.text, marginBottom: 12 }}>Prepared for {report.label}</div>}
          {new Date(report.generated_at).toLocaleDateString("en-US", { dateStyle: "long" })}{report.sample ? " · Sample data" : ""}
        </div>
      </div>
    );
  }
  if (slide.kind === "glance") {
    const k = slide.picks.length, gap = 18, w = (W - 2 * M - gap * (k - 1)) / k;
    const line = slide.line, band = line ? 78 : 0, extra = line ? band + 22 : 0;
    const ch = Math.min(BODY_H - extra, 300), top = BODY_TOP + (BODY_H - ch - extra) * 0.3;
    return (
      <div style={base}>
        <Header th={th} eyebrow="At a glance" title="The numbers that matter" subtitle={`${report.period_label}. Every figure is counted from ${th.name}'s own records.`} mark={logos.mark} />
        {slide.picks.map(({ section, tile }, i) => {
          const val = String(tile.value);
          let size = val.length <= 4 ? 66 : val.length <= 6 ? 54 : val.length <= 9 ? 40 : 30;
          while (size > 20 && val.length * size * 0.58 > w - 48) size -= 2;
          const tw = w - 48;
          return (
            <div key={section} style={{ position: "absolute", left: M + i * (w + gap), top, width: w, height: ch, background: th.panel, borderRadius: 14, overflow: "hidden" }}>
              <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5, background: th.accent }} />
              <div style={{ position: "absolute", left: 24, top: 22, width: tw, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: "12px", ...caps(th.muted, 8.5, 1.4) }}>{section}</div>
              <div style={{ position: "absolute", left: 24, top: 46, width: tw + 8, fontSize: size, lineHeight: 1, fontWeight: 800, color: th.accentFg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{val}</div>
              <div style={{ position: "absolute", left: 24, bottom: 22, width: tw }}>
                <div style={{ fontSize: 14, lineHeight: "18px", fontWeight: 700, color: th.text, ...clamp(2) }}>{tile.label}</div>
                {tile.note && <div style={{ marginTop: 4, fontSize: 10.5, lineHeight: "13.5px", color: th.muted, ...clamp(3) }}>{tile.note}</div>}
              </div>
            </div>
          );
        })}
        {line && (
          <div style={{ position: "absolute", left: M, top: top + ch + 22, width: W - 2 * M, height: band, background: th.soft, borderRadius: 12, overflow: "hidden", display: "flex", alignItems: "center" }}>
            <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5, background: th.accent }} />
            <p style={{ margin: 0, padding: "0 30px 0 26px", fontSize: 15, lineHeight: "20px", fontWeight: 700, color: th.text, ...clamp(3) }}>{line}</p>
          </div>
        )}
        <Footer th={th} report={report} n={n} />
      </div>
    );
  }
  if (slide.kind === "section") {
    const { s, charts } = slide;
    const tiles = (s.tiles || []).slice(0, 6), insights = (s.insights || []).slice(0, 3);
    const head = <Header th={th} eyebrow={report.title} title={s.title} subtitle={s.subtitle} mark={logos.mark} />;
    const foot = <Footer th={th} report={report} n={n} />;
    const T = (t, x, y, w, h, big) => <Tile key={t.label} th={th} t={{ ...t, x, y }} w={w} h={h} big={big} />;
    if (s.cards?.length) {
      const cards = s.cards.slice(0, 6), { cols, w, h, y0 } = cardsLayout(cards.length), iw = w - 44;
      const tsz = w > 300 ? 20 : 16;
      return (
        <div style={base}>
          {head}
          {cards.map((cd, i) => {
            const tl = textLines(cd.title, tsz, iw, 2, 0.56), room = h - 22 - 14 - tl * (tsz + 5) - 10 - 20;
            let size = w > 300 ? 16 : 13.5;
            while (size > 10.5 && cardLines(cd.text, size, iw) * size * 1.4 > room) size -= 0.5;
            const maxLines = Math.max(1, Math.floor(room / (size * 1.4)));
            return (
              <div key={cd.title} style={{ position: "absolute", left: M + (i % cols) * (w + GAP), top: y0 + Math.floor(i / cols) * (h + GAP), width: w, height: h, background: th.panel, borderRadius: 12, overflow: "hidden" }}>
                <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4.5, background: th.accent }} />
                <div style={{ position: "absolute", left: 22, top: 17, width: iw, fontSize: 10, lineHeight: "12px", fontWeight: 700, color: th.accentFg }}>{String(i + 1).padStart(2, "0")}</div>
                <div style={{ position: "absolute", left: 22, top: 36, width: iw, fontSize: tsz, lineHeight: `${tsz + 5}px`, fontWeight: 700, color: th.text, ...clamp(2) }}>{cd.title}</div>
                <div style={{ position: "absolute", left: 22, top: 36 + tl * (tsz + 5) + 5, width: iw, fontSize: size, lineHeight: `${size * 1.4}px`, color: th.muted, ...clamp(maxLines) }}>{cd.text}</div>
              </div>
            );
          })}
          {foot}
        </div>
      );
    }
    if (charts.length === 1 && charts[0].type === "table" && tiles.length) {
      const ts = tiles.slice(0, 4), tn = ts.length, width = W - 2 * M, tw = (width - GAP * (tn - 1)) / tn, th_ = 124;
      const py = BODY_TOP + th_ + GAP, ph = BODY_BOT - py;
      return (
        <div style={base}>
          {head}
          {ts.map((t, i) => T(t, M + i * (tw + GAP), BODY_TOP, tw, th_))}
          <ChartPanel th={th} ch={charts[0]} x={M} y={py} w={width} h={ph} inset={22} />
          {foot}
        </div>
      );
    }
    if (charts.length) {
      let px = M, tilesEl = null;
      if (tiles.length) {
        const ih = insH(insights, LEFT_W), rows = Math.ceil(tiles.length / 2), tw = (LEFT_W - GAP) / 2;
        const h = Math.max(88, Math.min(176, (BODY_H - (ih ? ih + 18 : 0) - (rows - 1) * GAP) / rows));
        tilesEl = (
          <>
            {tiles.map((t, i) => T(t, M + (i % 2) * (tw + GAP), BODY_TOP + Math.floor(i / 2) * (h + GAP), tw, h))}
            {insights.length > 0 && <Insights th={th} items={insights} x={M} y={BODY_TOP + rows * h + (rows - 1) * GAP + 18} width={LEFT_W} />}
          </>
        );
        px = M + LEFT_W + 30;
      }
      const pw = W - M - px, nat = charts.map(natH), sum = nat.reduce((a, b) => a + b, 0), total = BODY_H - (charts.length - 1) * GAP;
      let y = BODY_TOP;
      return (
        <div style={base}>
          {head}
          {tilesEl}
          {charts.map((ch, i) => { const h = (nat[i] / sum) * total, at = y; y += h + GAP; return <ChartPanel key={ch.title} th={th} ch={ch} x={px} y={at} w={pw} h={h} />; })}
          {foot}
        </div>
      );
    }
    const n_ = tiles.length, cols = { 1: 1, 2: 2, 3: 3, 4: 4 }[n_] || 3, rows = Math.max(1, Math.ceil(n_ / cols)), width = W - 2 * M;
    const ih = insH(insights, width), extra = ih ? ih + 28 : 0;
    const h = Math.min(210, (BODY_H - extra - (rows - 1) * GAP) / rows), group = n_ ? rows * h + (rows - 1) * GAP + extra : extra;
    const y0 = BODY_TOP + (BODY_H - group) * 0.35, tw = (width - GAP * (cols - 1)) / cols;
    return (
      <div style={base}>
        {head}
        {tiles.map((t, i) => T(t, M + (i % cols) * (tw + GAP), y0 + Math.floor(i / cols) * (h + GAP), tw, h, true))}
        {insights.length > 0 && <Insights th={th} items={insights} x={M} y={n_ ? y0 + rows * h + (rows - 1) * GAP + 28 : BODY_TOP + 20} width={width} />}
        {foot}
      </div>
    );
  }
  // closing
  return (
    <div style={base}>
      <Panel th={th} photo={th.photos[1]} side="right" rings={{ cx: 0, cy: H * 0.62 }} />
      <div style={{ position: "absolute", left: M, top: M }}><Brand th={th} logo={logos.bg} height={46} /></div>
      <div style={{ position: "absolute", left: M, top: 150, width: W * 0.62 - M - 56 }}>
        <h1 style={{ margin: 0, fontSize: report.type === "sponsor" ? 40 : 50, lineHeight: "54px", fontWeight: 800, color: th.text, textTransform: "none", letterSpacing: 0, fontFamily: "inherit" }}>{report.type === "sponsor" ? "Let's work together." : "Thank you."}</h1>
        <div style={{ width: 54, height: 5, background: th.accent, margin: "16px 0" }} />
        {th.about && <p style={{ margin: 0, fontSize: 13, lineHeight: "19px", color: th.muted, display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{th.about}</p>}
        <div style={{ marginTop: 14 }}>{[th.site, th.email].filter(Boolean).map((x) => <div key={x} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12, fontWeight: 700, color: th.text, height: 24 }}><span style={{ width: 6, height: 6, borderRadius: 3, background: th.accent }} />{x}</div>)}</div>
      </div>
      <div style={{ position: "absolute", left: M, bottom: 36, width: W * 0.62 - M - 56, fontSize: 8.5, lineHeight: "13px", color: th.muted }}>Every figure is counted from this community's own records, never estimated. Totals only: no member names or contact details.<br />Made with Pathwai</div>
    </div>
  );
}

/** A flip-through preview of the branded deck. `report` is a report from /admin/reports/{type}; `config` is the community's settings. */
export default function DeckPreview({ report, config, label = "" }) {
  const { th, slides } = useMemo(() => buildSlides(report, config), [report, config]);
  const logoBg = useAdaptedLogo(th.logo || th.mark, th.bgRgb, th.textRgb);
  const markBg = useAdaptedLogo(th.mark || th.logo, th.bgRgb, th.textRgb);
  const [i, setI] = useState(0);
  const [scale, setScale] = useState(0.5);
  const box = useRef(null);
  const rep = useMemo(() => ({ ...report, label: label.trim() }), [report, label]);
  useEffect(() => { setI((x) => Math.min(x, slides.length - 1)); }, [slides.length]);
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const fit = () => setScale(el.clientWidth / W);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const go = (d) => setI((x) => Math.max(0, Math.min(slides.length - 1, x + d)));
  const names = slides.map((s, k) => (s.kind === "section" ? s.s.title : { cover: "Cover", glance: "At a glance", closing: "Thank you" }[s.kind] || `Slide ${k + 1}`));
  return (
    <div data-testid="deck-preview" onKeyDown={(e) => { if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); }}>
      <div ref={box} className="relative w-full overflow-hidden rounded-xl border border-line shadow-card" style={{ aspectRatio: "16 / 9", background: th.bg }} data-testid="deck-frame">
        <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", left: 0, top: 0 }}>
          <Slide th={th} report={rep} slide={slides[i]} n={i + 1} logos={{ bg: logoBg, mark: markBg }} />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label="Slides">
          {slides.map((s, k) => (
            <button key={k} type="button" role="tab" aria-selected={k === i} aria-label={`Slide ${k + 1}: ${names[k]}`} title={names[k]} onClick={() => setI(k)} data-testid={`deck-dot-${k + 1}`}
              className={cx("h-2 shrink-0 rounded-full transition-all", k === i ? "w-6 bg-ink" : "w-2 bg-ink/25 hover:bg-ink/50")} />
          ))}
        </div>
        <span className="shrink-0 text-xs text-muted" data-testid="deck-count" aria-live="polite">{i + 1} of {slides.length} · {names[i]}</span>
        <div className="flex shrink-0 gap-1.5">
          <button type="button" className="btn-ghost !px-2.5 border border-line" onClick={() => go(-1)} disabled={i === 0} aria-label="Previous slide" data-testid="deck-prev"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" className="btn-ghost !px-2.5 border border-line" onClick={() => go(1)} disabled={i === slides.length - 1} aria-label="Next slide" data-testid="deck-next"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}
