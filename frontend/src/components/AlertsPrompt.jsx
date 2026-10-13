import React, { useState } from "react";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { alertsState, enableAlerts, syncPush } from "../lib/webNotify";

// Alerts are opt-in per phone or computer (the browser insists the person taps the button), so without a
// prompt nobody finds them. On a phone it's a card above the tab bar; on a computer, a slim bar. "Not now"
// only hides it for a day, so it comes back until alerts are on.
const KEY = "pw_alerts_prompt_dismissed";
const DAY = 24 * 3600 * 1000;
const dismissedRecently = () => { try { return Date.now() - Number(localStorage.getItem(KEY) || 0) < DAY; } catch { return false; } };
const isPhone = () => { try { return window.matchMedia("(hover: none) and (pointer: coarse)").matches; } catch { return false; } };

export default function AlertsPrompt() {
  const [state, setState] = useState(alertsState());
  const [hidden, setHidden] = useState(dismissedRecently);
  const [busy, setBusy] = useState(false);
  if (hidden || (state !== "default" && state !== "ios-install")) return null;
  const dismiss = () => { setHidden(true); try { localStorage.setItem(KEY, String(Date.now())); } catch { /* fine */ } };
  const turnOn = async () => {
    setBusy(true);
    const perm = await enableAlerts();
    setState(perm);
    if (perm === "granted") {
      const r = await syncPush();
      if (r.ok) toast.success("Notifications are on for this device");
      else toast.error("Alerts are allowed, but this device couldn't finish setting up. Open Settings, then Notifications, then Check this device.");
    } else if (perm === "denied") toast.error("Your phone is blocking alerts for Pathwai. Allow them in your phone's settings.");
    setBusy(false);
  };
  const text = state === "ios-install"
    ? "To get alerts on iPhone, tap the Share button in Safari, then Add to Home Screen, and open Pathwai from the new icon."
    : "Get alerts for new events, messages, news and approvals, even when Pathwai is closed.";
  if (isPhone()) {
    return (
      <div className="fixed inset-x-3 bottom-20 z-50 rounded-2xl border border-line bg-surface p-4 shadow-2xl" data-testid="alerts-prompt">
        <button aria-label="Not now" className="absolute right-3 top-3 text-muted" onClick={dismiss}><X className="h-4 w-4" /></button>
        <div className="flex items-start gap-3 pr-5"><Bell className="mt-0.5 h-5 w-5 shrink-0" /><p className="text-sm font-medium leading-snug">{state === "ios-install" ? "Add Pathwai to your Home Screen" : "Turn on notifications"}</p></div>
        <p className="mt-1 pl-8 text-xs text-muted">{text}</p>
        {state === "default" && <button className="btn mt-3 w-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }} onClick={turnOn} disabled={busy} data-testid="alerts-prompt-enable">Turn on notifications</button>}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center gap-3 border-b border-line bg-ink/5 px-4 py-2 text-sm" data-testid="alerts-prompt">
      <Bell className="h-4 w-4 shrink-0" />
      <span>{text}</span>
      {state === "default" && <button className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-paper" onClick={turnOn} disabled={busy} data-testid="alerts-prompt-enable">Turn on</button>}
      <button aria-label="Not now" className="text-muted hover:text-ink" onClick={dismiss}><X className="h-4 w-4" /></button>
    </div>
  );
}
