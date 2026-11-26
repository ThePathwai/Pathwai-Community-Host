import { isDemo } from "./demo";

// Product analytics with PostHog: clicks, page views and the key moments (sign up, saving a profile, opening or saving a program).
// It is OFF until REACT_APP_POSTHOG_KEY is set at build time, so nothing leaves the browser by accident.
//
// Privacy choices (also described on the Privacy page):
//  - the person is known only by their Pathwai account id (never name or email); visitors who have not signed up stay anonymous;
//  - the identifier lives in localStorage, not a cookie;
//  - the address is sent without its query or hash, so a reset-password link or a campaign code is never stored in the click trail;
//  - nothing is recorded on /admin or /reset-password, in the demo, for platform admins, or when the browser sends Do Not Track;
//  - only clicks on links and buttons are captured (no typing, no form values); session replay is OFF unless REACT_APP_POSTHOG_REPLAY=true,
//    and even then every input is masked. Add data-ph-no-capture to any element that must never be captured.
//
// posthog-js is loaded from PostHog's own script URL rather than added as a package, so there is nothing new to install.

const KEY = process.env.REACT_APP_POSTHOG_KEY || "";
const HOST = (process.env.REACT_APP_POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
const ASSETS = (process.env.REACT_APP_POSTHOG_ASSETS_HOST || HOST.replace(".i.posthog.com", "-assets.i.posthog.com")).replace(/\/$/, "");
const REPLAY = process.env.REACT_APP_POSTHOG_REPLAY === "true";

// Pages that are never captured, whatever the setting.
const SKIP_PATH = /^\/(admin|reset-password)(\/|$)/;

const dnt = () => { try { return navigator.doNotTrack === "1" || window.doNotTrack === "1"; } catch { return false; } };
export const analyticsEnabled = () => !!KEY && !isDemo() && !dnt() && typeof window !== "undefined";

// Calls PostHog's own methods before its script has finished loading are queued here and replayed by the library when it arrives.
const QUEUED = ["capture", "identify", "reset", "register", "opt_in_capturing", "opt_out_capturing", "set_config", "startSessionRecording", "stopSessionRecording"];

let started = false;
const ph = () => window.posthog;

const clean = (u) => { try { return typeof u === "string" ? u.split("#")[0].split("?")[0] : u; } catch { return u; } };

export function initAnalytics() {
  if (started || !analyticsEnabled()) return;
  started = true;
  try {
    const q = (window.posthog = window.posthog || []);
    q._i = [];
    q.init = (key, cfg, name) => {
      q._i.push([key, cfg, name]);
      const s = document.createElement("script");
      s.async = true; s.crossOrigin = "anonymous"; s.src = ASSETS + "/static/array.js";
      document.head.appendChild(s);
    };
    q.people = q.people || [];
    QUEUED.forEach((m) => { q[m] = (...a) => q.push([m, ...a]); });
    q.__SV = 1;
    q.init(KEY, {
      api_host: HOST,
      person_profiles: "identified_only",   // anonymous visitors are counted but get no profile until they sign up
      persistence: "localStorage",
      capture_pageview: false,               // we send one per screen ourselves (analyticsPage), since the app never reloads
      capture_pageleave: true,
      respect_dnt: true,
      autocapture: { dom_event_allowlist: ["click"], element_allowlist: ["a", "button", "summary"], capture_copied_text: false, url_ignorelist: [/^\/admin/, /^\/reset-password/] },
      rageclick: true,
      enable_heatmaps: true,
      capture_heatmaps: true,
      disable_surveys: true,
      disable_session_recording: !REPLAY,
      session_recording: { maskAllInputs: true, blockSelector: "[data-ph-no-capture]" },
      sanitize_properties: (props) => {
        for (const k of ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer", "$pathname"]) if (props && props[k]) props[k] = clean(props[k]);
        return props;
      },
      before_send: (event) => (event && SKIP_PATH.test(window.location.pathname) ? null : event),
    });
  } catch { /* analytics must never get in the way of the app */ }
}

// One page view per screen: the address without its query.
export function analyticsPage(path) {
  try {
    if (!analyticsEnabled()) return;
    initAnalytics();
    ph().capture("$pageview", { $current_url: window.location.origin + path });
  } catch { /* ignore */ }
}

// A named moment worth counting. Properties must be small, non-personal facts (an id, a kind), never a name, email or typed text.
export function captureEvent(name, props) {
  try { if (analyticsEnabled()) { initAnalytics(); ph().capture(name, props || {}); } } catch { /* ignore */ }
}

let adminOptedOut = false;
// Called when the signed-in account changes. Signed in: link the clicks to the account id. Signed out: start a fresh anonymous identity.
// Platform admins are not tracked at all, so the team's own testing never pollutes the numbers.
export function syncAnalyticsAccount(account) {
  try {
    if (!analyticsEnabled()) return;
    initAnalytics();
    if (!account) { if (adminOptedOut) { ph().opt_in_capturing(); adminOptedOut = false; } ph().reset(); return; }
    if (account.platform_admin) { ph().opt_out_capturing(); adminOptedOut = true; return; }
    if (adminOptedOut) { ph().opt_in_capturing(); adminOptedOut = false; }
    const st = account.startup || {};
    ph().identify(String(account.id), { has_startup: !!(st.name || st.stage), stage: st.stage || null, province: st.province || null });
  } catch { /* ignore */ }
}
