// White-label theme engine: turns the community's brand config into CSS variables.
// The same variables drive the live app (on <html>) and the Branding editor's preview (scoped to a div).
export const FONTS = ["Plus Jakarta Sans", "Inter", "Space Grotesk", "DM Sans", "Manrope", "Poppins", "Montserrat", "Work Sans", "IBM Plex Sans", "Playfair Display", "Lora", "Jost"];
export const HEADING_FONTS = ["Plus Jakarta Sans", "Playfair Display", "Lora", "Inter", "Montserrat", "Anton", "Bebas Neue", "Oswald", "Archivo Black", "Instrument Serif"];
const SINGLE_WEIGHT = new Set(["Anton", "Bebas Neue", "Archivo Black", "Instrument Serif"]);
export const SERIF = new Set(["Playfair Display", "Lora", "Instrument Serif"]);

const DEFAULT = {
  mode: "dark", font: "Inter", heading_style: "uppercase", radius: "soft", button_shape: "pill",
  colors: { accent: "#EBEBEB", background: "#0D0D0D", surface: "#171717", text: "#EBEBEB", muted: "#A1A1A1", border: "#2E2E2E" },
};

const trip = (hex) => {
  const n = parseInt((hex || "#000000").replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return `${n >> 16} ${(n >> 8) & 255} ${n & 255}`;
};
const lum = (hex) => {
  const n = parseInt((hex || "#000000").replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

// Light / dark: members can flip the mode for themselves (stored in this browser). The brand's own mode is the default.
const PALETTES = {
  light: { background: "#F6F5F2", surface: "#FFFFFF", text: "#0B0B0C", muted: "#6B6B70", border: "#E6E4DF" },
  dark: { background: "#09090B", surface: "#131316", text: "#F5F5F4", muted: "#8F8F98", border: "#26262B" },
};
let SCOPE = "";
export const setThemeScope = (s) => { SCOPE = s || ""; };
export const getModePref = () => { try { const v = localStorage.getItem("pathwai.mode:" + SCOPE); return v === "light" || v === "dark" ? v : null; } catch { return null; } };
export const effectiveMode = (brand = {}) => getModePref() || brand.mode || "dark";
export function setModePref(mode) { try { localStorage.setItem("pathwai.mode:" + SCOPE, mode); } catch { /* ignore */ } }
export function withMode(brand = {}) {
  const mode = effectiveMode(brand);
  if (mode === (brand.mode || "dark")) return brand;
  return { ...brand, mode, colors: { ...(brand.colors || {}), ...PALETTES[mode], on_accent: brand.colors?.on_accent } };
}

export function brandVars(brand = {}) {
  const b = { ...DEFAULT, ...brand, colors: { ...DEFAULT.colors, ...(brand.colors || {}) } };
  const c = b.colors;
  const radius = { sharp: ["2px", "2px"], soft: ["0.75rem", "0.5rem"], round: ["1.5rem", "1rem"] }[b.radius] || ["0.5rem", "0.5rem"];
  const btn = { pill: "9999px", rounded: "0.5rem", square: "2px" }[b.button_shape] || "9999px";
  const font = `"${b.font}", ${SERIF.has(b.font) ? "Georgia, serif" : "ui-sans-serif, system-ui, sans-serif"}`;
  return {
    "--c-bg": trip(c.background), "--c-surface": trip(c.surface), "--c-ink": trip(c.text), "--c-muted": trip(c.muted), "--c-line": trip(c.border),
    "--accent": c.accent, "--accent-grad": `linear-gradient(135deg, ${c.accent}, color-mix(in srgb, ${c.accent} 84%, white))`, "--on-accent": c.on_accent || (lum(c.accent) > 0.6 ? "#0D0D0D" : "#FFFFFF"),
    "--font-sans": font, "--r-card": radius[0], "--r-input": radius[1], "--r-btn": btn,
    "--font-heading": b.heading_font ? `"${b.heading_font}", ${font}` : font,
    "--heading-transform": b.heading_style === "normal" ? "none" : "uppercase",
    "--heading-weight": SINGLE_WEIGHT.has(b.heading_font) ? "400" : b.heading_style === "normal" ? "700" : "900",
    "--heading-ls": b.heading_font ? "0" : b.heading_style === "normal" ? "-0.01em" : "-0.025em",
    colorScheme: b.mode,
  };
}

export function loadFont(font, heading) {
  if (typeof document === "undefined") return;
  const fams = [font, heading].filter((f) => f && f !== "Inter");
  if (!fams.length) return;
  const id = "brand-font";
  let l = document.getElementById(id);
  if (!l) { l = document.createElement("link"); l.id = id; l.rel = "stylesheet"; document.head.appendChild(l); }
  l.href = "https://fonts.googleapis.com/css2?" + fams.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}${SINGLE_WEIGHT.has(f) ? "" : ":wght@300;400;500;600;700;800;900"}`).join("&") + "&display=swap";
}

export const HUB_BRAND = {
  preset: "pathwai", mode: "dark", font: "Plus Jakarta Sans", heading_font: "Plus Jakarta Sans", heading_style: "normal", radius: "soft", button_shape: "rounded",
  colors: { accent: "#F4F4F5", on_accent: "#0A0A0A", background: "#08080B", surface: "#111116", text: "#F4F4F6", muted: "#8C8C98", border: "#26262C" },
};
export function applyBrand(config) {
  setThemeScope(config?.community_name || "");
  const brand = withMode(config?.brand || { ...DEFAULT, colors: { ...DEFAULT.colors, accent: config?.theme?.accent || DEFAULT.colors.accent } });
  const root = document.documentElement;
  const v = brandVars(brand);
  Object.entries(v).forEach(([k, val]) => { if (k.startsWith("--")) root.style.setProperty(k, val); });
  root.style.colorScheme = brand.mode || "dark";
  root.setAttribute("data-mode", brand.mode || "dark");
  loadFont(brand.font, brand.heading_font);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", brand.colors?.background || "#0D0D0D");
  const icon = brand.logo_mark_url || brand.logo_url;
  const link = document.querySelector('link[rel="icon"]');
  if (link && icon) link.setAttribute("href", icon);
}
