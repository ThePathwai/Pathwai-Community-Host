import { api } from "./api";
import { isDemo } from "./demo";

// Counts one page view for the admin numbers. It sends the page, where the visitor came from, their time zone and language, and any
// campaign tags in the link (?utm_source=...), nothing else: no cookie and no name (the server adds an anonymous code that changes every day). It is skipped in the demo and for anyone whose browser says Do Not Track.
let last = "";
export function trackView(path) {
  try {
    if (isDemo() || navigator.doNotTrack === "1" || window.doNotTrack === "1") return;
    if (path === last) return;
    last = path;
    const q = new URLSearchParams(window.location.search);
    const utm = { source: q.get("utm_source") || q.get("ref") || q.get("source") || "", medium: q.get("utm_medium") || "", campaign: q.get("utm_campaign") || "" };
    let tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* no time zone: the visit just has no place */ }
    api.post("/hub/track", { path, ref: document.referrer || "", tz, lang: navigator.language || "", utm }).catch(() => {});
  } catch { /* counting a visit must never get in the way */ }
}
