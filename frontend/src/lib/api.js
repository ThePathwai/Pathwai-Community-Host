import axios from "axios";

const base = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
export const API_BASE = base;
// Identifies this browser tab, so live refresh doesn't bounce my own change back at me (lib/live.js).
export const CLIENT_ID = (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36);
export const api = axios.create({ baseURL: `${base}/api`, withCredentials: true, headers: { "X-Client-Id": CLIENT_ID } });

// The in-browser demo / static preview swaps the server for recorded sample data: see index.js and lib/demo.js.

// Staying signed in. The server hands out a short-lived access cookie (1 hour) and a long-lived refresh cookie
// (a year). When the short one has lapsed a request comes back 401: quietly renew it with the long one and
// repeat the request, so a person who signed in once is never sent back to the login screen until they sign
// out themselves. One renewal at a time, however many requests failed together.
const NO_RENEW = ["/auth/login", "/auth/refresh", "/auth/logout", "/hub/signup", "/auth/oauth", "/auth/forgot", "/auth/reset", "/auth/google", "/push/public-key"];
let renewing = null;
let signedOutAt = 0;
export const renewSession = () => {
  renewing = renewing || api.post("/auth/refresh").finally(() => { renewing = null; });
  return renewing;
};
api.interceptors.response.use(
  (r) => { if (/\/(auth\/login|auth\/oauth|hub\/signup|auth\/google)/.test(r.config?.url || "")) signedOutAt = 0; return r; },
  async (error) => {
    const cfg = error.config;
    if (error.response?.status !== 401 || !cfg || cfg._renewed || NO_RENEW.some((u) => (cfg.url || "").includes(u))) throw error;
    if (process.env.REACT_APP_PREVIEW === "true" || (typeof window !== "undefined" && window.sessionStorage?.getItem("pw_demo") === "1")) throw error; // the demo has no real session
    if (Date.now() - signedOutAt < 15000) throw error; // just confirmed there's no session: don't retry every request
    cfg._renewed = true;
    try { await renewSession(); } catch { signedOutAt = Date.now(); throw error; }
    return api(cfg);
  },
);

export const errMsg = (e, fallback = "Your update was not saved. Please try again.") => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (d?.error) return d.error + (d.missing ? `: ${d.missing.join(", ")}` : "");
  if (Array.isArray(d)) return d.map((x) => x.msg).join("; ");
  return e?.message || fallback;
};

export const fmtDate = (iso, opts = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) => {
  try { return new Date(iso).toLocaleString(undefined, opts); } catch { return iso || ""; }
};

export const timeAgo = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (isNaN(s)) return "";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
