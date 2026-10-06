import axios from "axios";

const base = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
export const API_BASE = base;
// Identifies this browser tab, so live refresh doesn't bounce my own change back at me (lib/live.js).
export const CLIENT_ID = (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36);
export const api = axios.create({ baseURL: `${base}/api`, withCredentials: true, headers: { "X-Client-Id": CLIENT_ID } });

if (process.env.REACT_APP_PREVIEW === "true") {
  // static preview build: answer from recorded fixtures instead of a server
  require("../preview/mock").install(api);
}

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
