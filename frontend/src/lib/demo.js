// The built-in demo: a practice copy of Pathwai that runs entirely inside the visitor's browser, with
// made-up members and events (preview/mock.js + its recorded sample data). It never talks to the real
// server, so nothing a visitor does in it can touch real members or data. It lasts for this browser tab.
import { HUB } from "./demoHubConfig";
const KEY = "pw_demo";
const get = () => { try { return window.sessionStorage.getItem(KEY); } catch { return null; } };
const ROLE = "pw_demo_role";  // which demo you're in, so a page refresh signs you back in (cleared by Sign out)
export const demoRole = () => { try { return window.sessionStorage.getItem(ROLE); } catch { return null; } };
export const setDemoRole = (r) => { try { r ? window.sessionStorage.setItem(ROLE, r) : window.sessionStorage.removeItem(ROLE); } catch { /* ignore */ } };
const set = (v) => { try { v ? window.sessionStorage.setItem(KEY, v) : window.sessionStorage.removeItem(KEY); } catch { /* storage blocked: the ?demo= link still works */ } };

export const isDemo = () => process.env.REACT_APP_PREVIEW === "true" || get() === "1";

// A link like /login?demo=admin starts the demo too (so it can be shared, e.g. from a website button).
export const demoFromUrl = () => {
  try { const d = new URLSearchParams(window.location.search).get("demo"); return ["member", "admin", "host", "founder"].includes(d) ? d : null; } catch { return null; }
};

// Called once before the app starts. Returns true when this page load is a demo.
export const prepareDemo = () => { const d = demoFromUrl(); if (d) { set("1"); setDemoRole(d); } return isDemo() || !!d; };
// `slug` (optional) drops you straight into that community once signed in, e.g. /login?demo=admin&c=yvettabetta-pilates.
// The static preview build (REACT_APP_PREVIEW) lives inside a page it must not navigate away from, so it moves around
// with the in-page (#) router instead of loading a new address.
const PREVIEW = process.env.REACT_APP_PREVIEW === "true";
const goTo = (path) => { window.location.hash = "#" + path; };
export const startDemo = (role, slug) => {
  const q = `/login?demo=${role}${slug ? `&c=${encodeURIComponent(slug)}` : ""}`;
  if (PREVIEW) { setDemoRole(role); goTo(q); return; }
  set("1"); setDemoRole(role); window.location.assign(q);
};
// True only when this tab is in the in-browser demo (not the static preview build).
export const inDemoTab = () => get() === "1";
// Leaves the demo for good and reloads onto the real site, so the real server is used again (the demo's
// stand-in server only goes away on a fresh page load).
export const leaveDemo = (to = "/login") => { set(null); setDemoRole(null); if (PREVIEW) { goTo(to); return; } window.location.replace(to); };
export const exitDemo = () => leaveDemo("/login");

// The "Try the demo" buttons open the demo hub as an established founder. The demo is for founders only; there is no admin side to open.
// The hub's name, colours and link are set in lib/demoHubConfig.js.
export const startHubDemo = () => startDemo("member", HUB.slug);

// The demo hubs shown on the demo page. Each opens at /demo/<short> (a page that works the same on a phone and a desktop),
// so a link can be sent to someone as it is. Edit the hub itself in lib/demoHubConfig.js.
export const DEMO_COMMUNITIES = [
  { slug: HUB.slug, short: HUB.short, featured: true, noAdmin: true, name: HUB.name, accent: HUB.accent, blurb: HUB.blurb,
    eyebrow: HUB.eyebrow, tagline: HUB.tagline, memberTitle: HUB.memberTitle,
    member: ["Next moves", "Programs & grants", "Events", "People", "Resources"] },
];
// The community a /demo/<short> link points at.
export const demoCommunity = (key) => DEMO_COMMUNITIES.find((c) => c.short === key || c.slug === key) || null;
// The link that drops someone straight into one side of a practice community (the same on phone and desktop).
export const demoLink = (role, slug) => `${window.location.origin}/login?demo=${role}&c=${encodeURIComponent(slug)}`;
