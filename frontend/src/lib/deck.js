// The branded slide deck, on screen. Mirrors backend/report_deck.py (the PDF the admin downloads): the same slides in the same
// order, in the community's own colours, logo, photos and story, with the same contrast rules so text always reads.
import { useEffect, useState } from "react";

const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
export function parseHex(v, fallback) {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(v || "").trim());
  let h = m ? m[1] : fallback.replace("#", "");
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const toHex = ([r, g, b]) => "#" + [r, g, b].map((x) => clamp(x).toString(16).padStart(2, "0")).join("");
export const lum = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export const contrast = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const BLACK = [11, 11, 12], WHITE = [255, 255, 255];
const readableOn = (bg, prefer) => (contrast(prefer, bg) >= 4.5 ? prefer : contrast(BLACK, bg) >= contrast(WHITE, bg) ? BLACK : WHITE);

/** Every colour the slides use, derived from the community's brand settings. */
export function deckTheme(config) {
  const brand = config?.brand || {};
  const c = brand.colors || {};
  const bg = parseHex(c.background, "#0D0D0D");
  const text = readableOn(bg, parseHex(c.text, "#EBEBEB"));
  let muted = parseHex(c.muted, "#A1A1A1");
  if (contrast(muted, bg) < 3.2) muted = mix(text, bg, 0.35);
  const surface = parseHex(c.surface, "#171717");
  const accent = parseHex(c.accent, "#EBEBEB");
  const onAccent = readableOn(accent, parseHex(c.on_accent, lum(accent) < 0.4 ? "#FFFFFF" : "#0B0B0C"));
  const accentFg = contrast(accent, bg) >= 3 ? accent : text; // the accent for numbers and bars, unless it would not stand out from the background
  const panel = contrast(surface, bg) >= 1.04 ? surface : mix(bg, text, 0.07);
  const photos = (config?.gallery_photos || []).filter((p) => typeof p === "string");
  const cover = config?.dashboard_cover_url;
  if (cover && !photos.includes(cover)) photos.push(cover);
  return {
    name: config?.community_name || "Community",
    bg: toHex(bg), text: toHex(text), muted: toHex(muted), border: toHex(parseHex(c.border, "#2E2E2E")), panel: toHex(panel),
    accent: toHex(accent), onAccent: toHex(onAccent), accentFg: toHex(accentFg), soft: toHex(mix(bg, accentFg, 0.14)),
    bgRgb: bg, textRgb: text, accentRgb: accent, onAccentRgb: onAccent,
    series: [accentFg, mix(accentFg, text, 0.5), mix(accentFg, bg, 0.55), mix(muted, bg, 0.2), mix(accentFg, text, 0.8)].map(toHex),
    logo: brand.logo_url || null, mark: brand.logo_mark_url || null,
    photos, about: (config?.about || "").trim(), site: (config?.about_url || "").replace(/^https?:\/\//, "").replace(/\/$/, ""), email: (brand.support_email || "").trim(),
  };
}

/** A logo that would disappear into `bg` (one flat colour, too close to it) is recoloured to `fg`, as the downloaded deck does. */
export function useAdaptedLogo(src, bgRgb, fgRgb) {
  const [out, setOut] = useState(src || null);
  const key = `${src}|${bgRgb}|${fgRgb}`;
  useEffect(() => {
    setOut(src || null);
    if (!src) return undefined;
    let dead = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const w = Math.min(img.naturalWidth, 400), h = Math.round(w * (img.naturalHeight / img.naturalWidth)) || 1;
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        const g = cv.getContext("2d", { willReadFrequently: true });
        g.drawImage(img, 0, 0, w, h);
        const d = g.getImageData(0, 0, w, h);
        let n = 0, sr = 0, sg = 0, sb = 0;
        for (let i = 0; i < d.data.length; i += 4) if (d.data[i + 3] > 40) { n++; sr += d.data[i]; sg += d.data[i + 1]; sb += d.data[i + 2]; }
        if (!n) return;
        const mean = [sr / n, sg / n, sb / n];
        let v = 0;
        for (let i = 0; i < d.data.length; i += 4) if (d.data[i + 3] > 40) v += (d.data[i] - mean[0]) ** 2 + (d.data[i + 1] - mean[1]) ** 2 + (d.data[i + 2] - mean[2]) ** 2;
        if (v / n < 900 && contrast(mean, bgRgb) < 3) {
          for (let i = 0; i < d.data.length; i += 4) { d.data[i] = fgRgb[0]; d.data[i + 1] = fgRgb[1]; d.data[i + 2] = fgRgb[2]; }
          g.putImageData(d, 0, 0);
          if (!dead) setOut(cv.toDataURL("image/png"));
        }
      } catch { /* a cross-origin image cannot be read: show it as it is */ }
    };
    img.src = src;
    return () => { dead = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return out;
}

const hasData = (ch) => (ch.type === "table" ? (ch.rows || []).length > 0 : ["columns", "hbar", "donut"].includes(ch.type) && (ch.items || []).some((i) => i.value > 0));

/** The slides, in order: cover, at a glance, one per section, closing. */
export function buildSlides(report, config) {
  const th = deckTheme(config);
  const slides = [{ kind: "cover" }];
  const picks = [];
  for (const s of report.sections || []) {
    const tiles = s.tiles || [];
    if (tiles.length) picks.push({ section: s.title, tile: tiles.find((t) => t.accent) || tiles[0] });
  }
  if (picks.length) {
    const line = (report.sections || []).flatMap((s) => s.insights || [])[0] || "";
    slides.push({ kind: "glance", picks: picks.slice(0, 4), line });
  }
  for (const s of report.sections || []) slides.push({ kind: "section", s, charts: (s.charts || []).filter(hasData).slice(0, 2) });
  slides.push({ kind: "closing" });
  return { th, slides };
}
