import { api } from "./api";
import { isDemo } from "./demo";

// Counts one page view for the admin numbers. It sends the page and where the visitor came from, nothing else: no cookie and no
// name (the server adds an anonymous code that changes every day). It is skipped in the demo and for anyone whose browser says Do Not Track.
let last = "";
export function trackView(path) {
  try {
    if (isDemo() || navigator.doNotTrack === "1" || window.doNotTrack === "1") return;
    if (path === last) return;
    last = path;
    api.post("/hub/track", { path, ref: document.referrer || "" }).catch(() => {});
  } catch { /* counting a visit must never get in the way */ }
}
