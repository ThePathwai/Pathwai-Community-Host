// Pop-up notifications on desktop and phones.
//
// Two layers, both switched on by the one "Turn on" button:
//   1. Push (the real thing): the browser subscribes to its push service and the server pushes every
//      new notification (new event, new member, approval...) to it. It arrives on the lock screen or
//      desktop even when Pathwai isn't open. Needs the service worker in /sw.js.
//   2. A 30-second check while Pathwai is open, which also keeps the bell badge live. It shows the
//      same pop-up (same `tag`, so you never see two) if push isn't available, e.g. a browser that
//      doesn't support it.
//
// iPhone/iPad: Apple only allows web notifications for sites added to the Home Screen
// (Share -> Add to Home Screen) and opened from there. alertsState() reports "ios-install" for that.
import { api } from "./api";

const POLL_MS = 30000;

const ua = () => (typeof navigator !== "undefined" ? navigator.userAgent || "" : "");
export const isIos = () => /iPad|iPhone|iPod/.test(ua()) || (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isStandalone = () => {
  try { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; } catch { return false; }
};
export const notificationsSupported = () => typeof window !== "undefined" && "Notification" in window;
export const pushSupported = () => notificationsSupported() && "serviceWorker" in navigator && "PushManager" in window;

// "granted" | "denied" | "default" (not asked yet) | "ios-install" (add to Home Screen first) | "unsupported"
export function alertsState() {
  if (!notificationsSupported()) return isIos() && !isStandalone() ? "ios-install" : "unsupported";
  return Notification.permission;
}

const toKey = (b64) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

async function registration() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration("/")) || (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
  } catch { return null; }
}

// Subscribes this device to push and tells the server. Safe to call repeatedly (it's how a device is
// re-registered after signing in again). Returns true when the server has this device.
export async function syncPush() {
  try {
    if (!pushSupported() || Notification.permission !== "granted") return false;
    const reg = await registration();
    if (!reg) return false;
    await navigator.serviceWorker.ready;
    const { data } = await api.get("/push/public-key");
    if (!data?.key) return false;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(data.key) }));
    const j = sub.toJSON();
    await api.post("/push/subscribe", { endpoint: j.endpoint, keys: j.keys });
    return true;
  } catch { return false; }
}

// Called on sign-out so the next person on a shared device doesn't receive this person's alerts.
export async function forgetThisDevice() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration("/");
    const sub = await reg?.pushManager?.getSubscription();
    if (sub) { await api.post("/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
  } catch { /* nothing to forget */ }
}

// Must be called from a click: browsers ignore permission prompts that aren't triggered by the person.
export async function enableAlerts() {
  if (!notificationsSupported()) return alertsState();
  let perm = Notification.permission;
  try { if (perm === "default") perm = await Notification.requestPermission(); } catch { perm = Notification.permission; }
  if (perm === "granted") await syncPush();
  return perm;
}

async function show(n, onOpen) {
  try {
    const reg = await registration();  // phones only allow pop-ups through the service worker
    if (reg?.showNotification) {
      await reg.showNotification(n.title, { body: n.body || "", tag: n.id, icon: "/icon-192.png", badge: "/icon-192.png", data: { url: n.link || "/notifications" } });
      return;
    }
    const pop = new Notification(n.title, { body: n.body || "", tag: n.id, icon: "/icon-192.png" });
    pop.onclick = () => { try { window.focus(); } catch { /* ignore */ } onOpen(n); pop.close(); };
  } catch { /* the bell still updates */ }
}

// Starts the 30-second check. Returns a stop function. `onUnread(count)` keeps the bell badge live;
// `onOpen(notification)` runs when someone clicks an in-page pop-up (Layout navigates to its link).
export function startNotificationWatch({ onUnread, onOpen }) {
  const seen = new Set();
  let first = true;
  let stopped = false;
  syncPush();
  const tick = async () => {
    if (stopped) return;
    try {
      const { data } = await api.get("/notifications", { params: { unread_only: true, limit: 10, sync: false } });
      if (stopped) return;
      onUnread?.(data.unread);
      const fresh = (data.notifications || []).filter((n) => !seen.has(n.id));
      fresh.forEach((n) => seen.add(n.id));
      // The first check only records what was already waiting -- no flood of pop-ups on page load.
      if (!first && notificationsSupported() && Notification.permission === "granted") fresh.slice(0, 3).forEach((n) => show(n, onOpen));
      first = false;
    } catch { /* offline or signed out: try again next time */ }
  };
  tick();
  const timer = setInterval(tick, POLL_MS);
  const onVisible = () => { if (!document.hidden) tick(); };
  document.addEventListener("visibilitychange", onVisible);
  return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
}
