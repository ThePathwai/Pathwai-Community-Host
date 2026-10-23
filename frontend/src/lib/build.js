// The git commit this copy of the app was built from (stamped in by the Dockerfile on Railway; empty in local builds).
export const BUILD = (process.env.REACT_APP_BUILD_ID || "").slice(0, 7);

// If the server is running a newer build than the one this browser loaded, clear anything cached and reload once.
export async function refreshIfStale() {
  try {
    if (!BUILD || process.env.REACT_APP_PREVIEW === "true" || window.Capacitor?.isNativePlatform?.()) return;
    const r = await fetch("/api/version", { cache: "no-store", credentials: "same-origin" });
    if (!r.ok) return;
    const { build } = await r.json();
    if (!build || build === BUILD) return;
    if (sessionStorage.getItem("pw_build_reload") === build) return; // already tried once: never loop
    sessionStorage.setItem("pw_build_reload", build);
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(regs.map((g) => g.unregister().catch(() => {})));
    if (window.caches) { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); }
    window.location.reload();
  } catch { /* offline or no storage: carry on with what is loaded */ }
}
