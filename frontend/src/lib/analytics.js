import posthog, { posthogEnabled } from "./posthog";

// Helpers on top of lib/posthog.js (which starts PostHog and holds the privacy settings). Every one is a no-op when analytics is off.

export const analyticsEnabled = () => posthogEnabled;

// A named moment worth counting. Properties must be small, non-personal facts (an id, a kind), never a name, email or typed text.
export function captureEvent(name, props) {
  try { if (posthogEnabled) posthog.capture(name, props || {}); } catch { /* ignore */ }
}

let adminOptedOut = false;
// Called when the signed-in account changes. Signed in: link the clicks to the account id only. Signed out: start a fresh anonymous identity.
// Platform admins are not tracked at all, so the team's own testing never pollutes the numbers.
export function syncAnalyticsAccount(account) {
  try {
    if (!posthogEnabled) return;
    if (!account) { if (adminOptedOut) { posthog.opt_in_capturing(); adminOptedOut = false; } posthog.reset(); return; }
    if (account.platform_admin) { posthog.opt_out_capturing(); adminOptedOut = true; return; }
    if (adminOptedOut) { posthog.opt_in_capturing(); adminOptedOut = false; }
    const st = account.startup || {};
    posthog.identify(String(account.id), { has_startup: !!(st.name || st.stage), stage: st.stage || null, province: st.province || null });
  } catch { /* ignore */ }
}
