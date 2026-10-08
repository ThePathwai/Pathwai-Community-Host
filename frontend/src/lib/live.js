// Live refresh: keeps one open connection to the server (GET /api/live). When someone else changes
// something in the community -- a new event, an approval, a message -- the server pings with a topic
// and the page that's showing that kind of data reloads it IN PLACE (so a half-typed message or a
// search box is left alone). The ping carries no data; pages re-fetch through the normal API.
import { useEffect, useRef } from "react";
import { API_BASE, CLIENT_ID } from "./api";
import { isDemo } from "./demo";

const listeners = new Set();
let source = null;
let users = 0;
let retry = 0;
let timer = null;
let opened = false;

const emit = (topic) => listeners.forEach((fn) => { try { fn(topic); } catch { /* one bad listener mustn't stop the rest */ } });

function open() {
  if (typeof EventSource === "undefined" || source) return;
  source = new EventSource(`${API_BASE}/api/live?cid=${CLIENT_ID}`, { withCredentials: true });
  source.addEventListener("hello", () => { retry = 0; if (opened) emit("*"); opened = true; });  // reconnected: catch up on anything missed
  source.addEventListener("change", (e) => {
    try {
      const d = JSON.parse(e.data);
      if (d.origin && d.origin === CLIENT_ID) return;  // I made this change myself; my page already shows it
      emit(d.topic || "*");
    } catch { /* ignore a malformed ping */ }
  });
  source.onerror = () => {
    // The browser retries by itself while the connection is merely dropped; if it gave up (signed out,
    // server restarting) start a fresh one a little later, backing off to once a minute.
    if (source && source.readyState === 2) {
      source.close(); source = null;
      retry = Math.min(retry + 1, 6);
      clearTimeout(timer);
      if (users > 0) timer = setTimeout(open, Math.min(60000, 2000 * 2 ** retry));
    }
  };
}

// Call once while the signed-in app is on screen (Layout does). Returns a stop function.
export function startLive() {
  if (isDemo()) return () => {};  // the demo has no server to listen to
  users += 1;
  open();
  return () => {
    users -= 1;
    if (users <= 0) { users = 0; clearTimeout(timer); if (source) { source.close(); source = null; } opened = false; }
  };
}

// useLive(["events"], reload): call `reload` (debounced) when one of those topics changes, and when
// the tab comes back into view or the connection returns. `topics` omitted = any change.
export function useLive(topics, reload) {
  const fn = useRef(reload);
  fn.current = reload;
  const key = Array.isArray(topics) ? topics.join(",") : "*";
  useEffect(() => {
    let t = null;
    const run = () => { clearTimeout(t); t = setTimeout(() => { try { const p = fn.current?.(); if (p?.catch) p.catch(() => {}); } catch { /* the page's own loader reports errors */ } }, 700); };
    const listener = (topic) => { if (topic === "*" || key === "*" || key.split(",").includes(topic)) run(); };
    listeners.add(listener);
    const onVisible = () => { if (!document.hidden) run(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearTimeout(t); listeners.delete(listener); document.removeEventListener("visibilitychange", onVisible); };
  }, [key]);
}
