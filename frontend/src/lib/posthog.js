import posthog from "posthog-js";
import { isDemo } from "./demo";

// The one place PostHog is started. It is OFF until REACT_APP_POSTHOG_KEY is set at build time (REACT_APP_POSTHOG_HOST picks the
// US or EU cloud; the US cloud is the default). Other files import { posthogEnabled } and the default `posthog` from here.
//
// Privacy choices (also described on the Privacy page):
//  - a signed-in person is known only by their Pathwai account id, never name or email; visitors without an account stay anonymous;
//  - the identifier lives in localStorage, not a cookie;
//  - addresses are sent without their query or hash, so a reset-password link is never stored in the click trail;
//  - nothing is recorded on /admin or /reset-password, in the demo, for platform admins, or when the browser sends Do Not Track;
//  - only clicks on links and buttons are captured (no typing, no form values); session replay (a screen recording) masks every input and
//    the text of any area marked data-ph-mask (profile, settings, journey, guide chat). Add data-ph-no-capture to hide an element entirely.

const key = process.env.REACT_APP_POSTHOG_KEY || "";
const host = (process.env.REACT_APP_POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
// Session replay is on unless REACT_APP_POSTHOG_REPLAY is set to "false". It also has to be switched on in the PostHog project settings.
const replay = process.env.REACT_APP_POSTHOG_REPLAY !== "false";

// Pages that are never captured, whatever the setting.
const SKIP_PATH = /^\/(admin|reset-password)(\/|$)/;
const dnt = () => { try { return navigator.doNotTrack === "1" || window.doNotTrack === "1"; } catch { return false; } };
const clean = (u) => (typeof u === "string" ? u.split("#")[0].split("?")[0] : u);

export const posthogEnabled = typeof window !== "undefined" && Boolean(key) && !isDemo() && !dnt();

if (posthogEnabled) {
  try {
    posthog.init(key, {
      api_host: host,
      person_profiles: "identified_only",   // anonymous visitors are counted but get no profile until they sign up
      persistence: "localStorage",
      capture_pageview: "history_change",   // one per screen, including moves inside the app (the page never reloads)
      capture_pageleave: true,
      respect_dnt: true,
      autocapture: { dom_event_allowlist: ["click"], element_allowlist: ["a", "button", "summary"], capture_copied_text: false, url_ignorelist: [/^\/admin/, /^\/reset-password/] },
      rageclick: true,
      capture_heatmaps: true,
      enable_heatmaps: true,
      disable_surveys: true,
      disable_session_recording: !replay,
      session_recording: { maskAllInputs: true, maskTextSelector: "[data-ph-mask]", blockSelector: "[data-ph-no-capture]" },
      sanitize_properties: (props) => {
        for (const k of ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer", "$pathname"]) if (props && props[k]) props[k] = clean(props[k]);
        return props;
      },
      before_send: (event) => (event && SKIP_PATH.test(window.location.pathname) ? null : event),
    });
  } catch { /* analytics must never get in the way of the app */ }
}

// Kept so older call sites that log a line next to an event keep working; the log feature is not used.
export const posthogLogger = { info() {} };

export default posthog;
