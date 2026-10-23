import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildSlides, useAdaptedLogo } from "../lib/deck";
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
      <span style={{ maxWidth: 330, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{th.name}</span>
    </div>
  );
}

function Header({ th, eyebrow, title, subtitle, mark }) {
  return (
    <div style={{ position: "absolute", left: M, right: M, top: 40 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={{ width: 34, height: 4, background: th.accent }} /><span style={caps(th.muted)}>{eyebrow}</span></div>
        {mark ? <img src={mark} alt="" style={{ height: 26, maxWidth: 120, objectFit: "contain" }} /> : <span style={{ ...caps(th.muted, 9, 1), maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{th.name}</span>}
      </div>
      <h2 style={{ margin: "14px 0 0", fontSize: 32, lineHeight: "36px", fontWeight: 800, color: th.text, letterSpacing: 0, textTransform: "none", fontFamily: "inherit" }}>{title}</h2>
      {subtitle && <p style={{ margin: "6px 0 0", maxWidth: 640, fontSize: 12.5, lineHeight: "17px", color: th.muted }}>{subtitle}</p>}
    </div>
  );
}

function Footer({ th, report, n }) {
  return (
    <div style={{ position: "absolute", left: M, right: M, bottom: 20, borderTop: `1px solid ${th.border}`, paddingTop: 12, display: "flex", justifyContent: "space-between", fontSize: 8, color: th.muted }}>
      <span>{th.name} · {report.period_label}{report.sample ? " · Sample data" : ""}</span><span>{n}</span>
    </div>
  );
}

function Tile({ th, t, big, h, w }) {
  const val = String(t.value ?? "");
  const size = big ? ((h >= 180 ? 58 : 46) * (val.length <= 5 ? 1 : 0.66)) : (val.length <= 5 ? 34 : 25);
  return (
    <div style={{ position: "relative", width: w, height: h, background: th.panel, borderRadius: 12, padding: "14px 20px", boxSizing: "border-box", overflow: "hidden" }}>
      {t.accent && <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4.5, background: th.accent }} />}
      <div style={{ fontSize: size, lineHeight: 1.05, fontWeight: 800, color: t.accent ? th.accentFg : th.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{val}</div>
      <div style={{ marginTop: 8, fontSize: big ? 12 : 10.5, lineHeight: big ? "15px" : "13px", fontWeight: big ? 700 : 400, color: th.text }}>{t.label}</div>
      {t.note && <div style={{ marginTop: 3, fontSize: 9, lineHeight: "11.5px", color: th.muted }}>{t.note}</div>}
    </div>
  );
}

function Chart({ th, ch, h }) {
  const items = (ch.items || []).slice(0, ch.type === "columns" ? 10 : 7);
  const max = Math.max(1, ...items.map((i) => i.value || 0));
  let body = null;
  if (ch.type === "columns") {
    body = (
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: h - 30, borderBottom: `1px solid ${th.border}`, paddingBottom: 0 }}>
        {items.map((it, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: th.text, marginBottom: 3 }}>{it.value}</span>
            <span style={{ width: "58%", maxWidth: 40, height: `${Math.max((it.value / max) * 78, it.value ? 2 : 0)}%`, background: i === items.length - 1 ? th.accentFg : th.accentFg + "73", borderRadius: "4px 4px 0 0" }} />
          </div>
        ))}
      </div>
    );
  } else if (ch.type === "hbar") {
    body = items.map((it, i) => (
      <div key={i} style={{ display: "grid", gridTemplateColumns: "36% 1fr 30px", gap: 8, alignItems: "center", height: 30 }}>
        <span style={{ fontSize: 10, color: th.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
        <span style={{ height: 8, borderRadius: 4, background: th.soft, display: "block" }}><span style={{ display: "block", height: 8, borderRadius: 4, width: `${Math.max((it.value / max) * 100, it.value ? 4 : 0)}%`, background: th.accentFg, opacity: i === 0 ? 1 : 0.78 }} /></span>
        <span style={{ fontSize: 10, fontWeight: 700, color: th.text }}>{ch.unit === "% full" ? `${it.value}%` : it.value}</span>
      </div>
    ));
  } else if (ch.type === "table") {
    const cols = ch.columns || [];
    const tpl = { 2: "65% 35%", 3: "42% 34% 24%", 4: "40% 22% 19% 19%" }[cols.length] || `repeat(${cols.length}, 1fr)`;
    body = (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: tpl, paddingBottom: 6, borderBottom: `1px solid ${th.text}`, ...caps(th.muted, 7.5, 1) }}>{cols.map((c) => <span key={c}>{c}</span>)}</div>
        {(ch.rows || []).slice(0, 7).map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: tpl, height: 28, alignItems: "center", borderBottom: `1px solid ${th.border}`, fontSize: 9.5 }}>
            {r.slice(0, cols.length).map((cell, j) => <span key={j} style={{ color: j ? th.muted : th.text, fontWeight: j ? 400 : 700, fontSize: j ? 9.5 : 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>{cell}</span>)}
          </div>
        ))}
      </div>
    );
  } else if (ch.type === "donut") {
    const total = items.reduce((a, i) => a + (i.value || 0), 0) || 1;
    let acc = 0;
    const stops = items.map((it, i) => { const a = (acc / total) * 360; acc += it.value || 0; return `${th.series[i]} ${a}deg ${(acc / total) * 360}deg`; }).join(", ");
    body = (
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <span style={{ width: 120, height: 120, borderRadius: "50%", background: `conic-gradient(${stops})`, display: "inline-block", WebkitMask: "radial-gradient(circle, transparent 58%, #000 59%)", mask: "radial-gradient(circle, transparent 58%, #000 59%)" }} />
        <div style={{ flex: 1 }}>{items.map((it, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, height: 22, fontSize: 10, color: th.text }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: th.series[i] }} /><span style={{ flex: 1 }}>{it.label}</span><b>{Math.round((100 * it.value) / total)}%</b>
          </div>))}</div>
      </div>
    );
  }
  return (
    <div>
      <div style={{ ...caps(th.muted, 8.5, 1.2), marginBottom: 12 }}>{ch.title}</div>
      {body}
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
    return (
      <div style={base}>
        <Header th={th} eyebrow="At a glance" title="The numbers that matter" subtitle={`${report.period_label}. Every figure is counted from ${th.name}'s own records.`} mark={logos.mark} />
        <div style={{ position: "absolute", left: M, top: 188, display: "flex", gap }}>
          {slide.picks.map(({ section, tile }) => {
            const val = String(tile.value), size = val.length <= 5 ? 54 : val.length <= 8 ? 40 : 28;
            return (
              <div key={section} style={{ position: "relative", width: w, height: 176, background: th.panel, borderRadius: 14, padding: "22px 24px", boxSizing: "border-box" }}>
                <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5, background: th.accent }} />
                <div style={caps(th.muted, 8, 1.4)}>{section}</div>
                <div style={{ marginTop: 12, fontSize: size, lineHeight: 1, fontWeight: 800, color: th.accentFg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{val}</div>
                <div style={{ marginTop: 14, fontSize: 12.5, lineHeight: "16px", fontWeight: 700, color: th.text }}>{tile.label}</div>
                {tile.note && <div style={{ marginTop: 5, fontSize: 9.5, lineHeight: "12.5px", color: th.muted }}>{tile.note}</div>}
              </div>
            );
          })}
        </div>
        {slide.line && <div style={{ position: "absolute", left: M, right: M, top: 410, display: "flex", gap: 14 }}><span style={{ width: 4, background: th.accent, flex: "none" }} /><p style={{ margin: 0, fontSize: 14, lineHeight: "19px", color: th.text }}>{slide.line}</p></div>}
        <Footer th={th} report={report} n={n} />
      </div>
    );
  }
  if (slide.kind === "section") {
    const { s, charts } = slide;
    const tiles = (s.tiles || []).slice(0, 6);
    const insights = (s.insights || []).slice(0, 3);
    const top = 130, bottom = 62;
    if (charts.length) {
      const colW = 392, rows = Math.ceil(tiles.length / 2), tw = (colW - 14) / 2;
      const tilesH = rows * 104 + (rows - 1) * 14;
      const cx = M + colW + 44, cw = W - M - cx;
      const cap = (H - top - bottom - (charts.length - 1) * 18) / charts.length;
      const want = (ch) => (ch.type === "table" ? Math.min(cap, 56 + 28 * Math.min((ch.rows || []).length, 7)) : ch.type === "hbar" ? Math.min(cap, 44 + 30 * Math.min((ch.items || []).length, 7)) : cap);
      return (
        <div style={base}>
          <Header th={th} eyebrow={report.title} title={s.title} subtitle={s.subtitle} mark={logos.mark} />
          <div style={{ position: "absolute", left: M, top, width: colW, display: "grid", gridTemplateColumns: `repeat(2, ${tw}px)`, gap: 14 }}>
            {tiles.map((t) => <Tile key={t.label} th={th} t={t} h={104} w={tw} />)}
          </div>
          {insights.length > 0 && (
            <div style={{ position: "absolute", left: M, top: top + tilesH + 18, width: colW }}>
              {insights.map((t) => <div key={t} style={{ display: "flex", gap: 10, marginBottom: 8, fontSize: 11.5, lineHeight: "15px", color: th.text }}><span style={{ width: 6, height: 6, borderRadius: 3, background: th.accent, marginTop: 5, flex: "none" }} />{t}</div>)}
            </div>
          )}
          <div style={{ position: "absolute", left: cx - 16, top, width: cw + 32 }}>
            {charts.map((ch) => { const h = want(ch); return <div key={ch.title} style={{ background: th.panel, borderRadius: 12, padding: "16px", marginBottom: 18, height: h + 14, boxSizing: "border-box" }}><Chart th={th} ch={ch} h={h - 22} /></div>; })}
          </div>
          <Footer th={th} report={report} n={n} />
        </div>
      );
    }
    const cols = Math.min(Math.max(tiles.length, 1), 4), rows = Math.ceil(tiles.length / cols), h = rows === 1 ? 190 : 140;
    const tw = (W - 2 * M - 14 * (cols - 1)) / cols;
    const total = rows * h + (rows - 1) * 14 + (insights.length ? insights.length * 40 + 20 : 0);
    const y = top + Math.max(0, (H - top - bottom - total) * 0.38);
    return (
      <div style={base}>
        <Header th={th} eyebrow={report.title} title={s.title} subtitle={s.subtitle} mark={logos.mark} />
        <div style={{ position: "absolute", left: M, top: y, display: "grid", gridTemplateColumns: `repeat(${cols}, ${tw}px)`, gap: 14 }}>
          {tiles.map((t) => <Tile key={t.label} th={th} t={t} big h={h} w={tw} />)}
        </div>
        {insights.length > 0 && <div style={{ position: "absolute", left: M, right: M, top: y + rows * h + (rows - 1) * 14 + 22 }}>
          {insights.map((t) => <div key={t} style={{ display: "flex", gap: 10, marginBottom: 8, fontSize: 11.5, lineHeight: "15px", color: th.text }}><span style={{ width: 6, height: 6, borderRadius: 3, background: th.accent, marginTop: 5, flex: "none" }} />{t}</div>)}
        </div>}
        <Footer th={th} report={report} n={n} />
      </div>
    );
  }
  // closing
  return (
    <div style={base}>
      <Panel th={th} photo={th.photos[1]} side="right" rings={{ cx: 0, cy: H * 0.62 }} />
      <div style={{ position: "absolute", left: M, top: M }}><Brand th={th} logo={logos.bg} height={46} /></div>
      <div style={{ position: "absolute", left: M, top: 150, width: W * 0.62 - M - 56 }}>
        <h1 style={{ margin: 0, fontSize: 50, lineHeight: "54px", fontWeight: 800, color: th.text, textTransform: "none", letterSpacing: 0, fontFamily: "inherit" }}>Thank you.</h1>
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
