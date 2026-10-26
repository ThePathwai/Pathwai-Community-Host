// The built-in demo: a practice copy of Pathwai that runs entirely inside the visitor's browser, with
// made-up members and events (preview/mock.js + its recorded sample data). It never talks to the real
// server, so nothing a visitor does in it can touch real members or data. It lasts for this browser tab.
const KEY = "pw_demo";
const get = () => { try { return window.sessionStorage.getItem(KEY); } catch { return null; } };
const ROLE = "pw_demo_role";  // which demo you're in, so a page refresh signs you back in (cleared by Sign out)
export const demoRole = () => { try { return window.sessionStorage.getItem(ROLE); } catch { return null; } };
export const setDemoRole = (r) => { try { r ? window.sessionStorage.setItem(ROLE, r) : window.sessionStorage.removeItem(ROLE); } catch { /* ignore */ } };
const set = (v) => { try { v ? window.sessionStorage.setItem(KEY, v) : window.sessionStorage.removeItem(KEY); } catch { /* storage blocked: the ?demo= link still works */ } };

export const isDemo = () => process.env.REACT_APP_PREVIEW === "true" || get() === "1";

// A link like /login?demo=admin starts the demo too (so it can be shared, e.g. from a website button).
export const demoFromUrl = () => {
  try { const d = new URLSearchParams(window.location.search).get("demo"); return ["member", "admin", "host"].includes(d) ? d : null; } catch { return null; }
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

// The practice community the "admin demo" buttons open straight into: sponsors, funders and mentors make the Impact view and the reports easy to picture.
export const startAdminDemo = () => startDemo("admin", "humber-innovation-network");

// Practice communities worth walking through, each open from both the member side and the admin side.
// `featured` ones are shown first and big. Each opens at /demo/<short> (a page with a Member button and an Admin button that
// works the same on a phone and a desktop), so a link can be sent to someone as it is.
export const DEMO_COMMUNITIES = [
  { slug: "humber-innovation-network", short: "humber", featured: true, name: "Humber Innovation Network", accent: "#0B4EA2", blurb: "Founders, investors and mentors, with pitch days.",
    tagline: "Where founders meet capital, mentors and customers.",
    member: ["People with pitches", "Intros with a reason", "Pitch days", "Perks", "Academy"], admin: ["Applications", "Texts and email", "Impact reports", "Import your data", "Disco academy"] },
  { slug: "grace", short: "c3", name: "C3 Film Team", blurb: "A church's creative team: skills, shoots, onboarding and project teams anyone can start." },
  { slug: "club-pto", short: "club-pto", name: "Club PTO", blurb: "A padel club: Skill Lab coaching, sponsors and a member skill exchange." },
  { slug: "the-village", short: "the-village", name: "The Village", blurb: "A private dinner club: guests, long-table dinners and the host's guest list." },
  { slug: "toronto-hyrox-crew", short: "hyrox", name: "Toronto Hyrox Crew", blurb: "A fitness racing crew: training sessions, race prep and perks." },
];
// The community a /demo/<short> link (or the older /humber style) points at.
export const demoCommunity = (key) => DEMO_COMMUNITIES.find((c) => c.short === key || c.slug === key) || null;
// The link that drops someone straight into one side of a practice community (the same on phone and desktop).
export const demoLink = (role, slug) => `${window.location.origin}/login?demo=${role}&c=${encodeURIComponent(slug)}`;
