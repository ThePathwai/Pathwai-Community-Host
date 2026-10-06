/* Pathwai service worker: shows push notifications (new events, new members, approvals...) even when
   the app isn't open, and opens the right page when one is tapped. It does no caching on purpose. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: "Pathwai", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(d.title || "Pathwai", {
    body: d.body || "",
    tag: d.tag || undefined,          // same tag as the in-page alert, so you never get two
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: d.url || "/notifications" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/notifications", self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        try { await w.focus(); if ("navigate" in w) await w.navigate(url); return; } catch (e) { /* fall through */ }
      }
    }
    await self.clients.openWindow(url);
  })());
});
