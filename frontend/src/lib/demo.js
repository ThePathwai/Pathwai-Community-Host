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
export const startDemo = (role) => { set("1"); setDemoRole(role); window.location.assign(`/login?demo=${role}`); };
export const exitDemo = () => { set(null); setDemoRole(null); window.location.assign("/login"); };
