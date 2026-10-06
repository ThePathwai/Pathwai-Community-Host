import React, { useState } from "react";
import { Bell, X } from "lucide-react";
import { alertsState, enableAlerts } from "../lib/webNotify";

// A slim bar at the top of the app for anyone who hasn't turned alerts on yet. Alerts are opt-in per
// phone or computer (the browser insists the person taps the button), so without this nobody finds them.
const KEY = "pw_alerts_prompt_dismissed";

export default function AlertsPrompt() {
  const [state, setState] = useState(alertsState());
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } });
  if (hidden || (state !== "default" && state !== "ios-install")) return null;
  const dismiss = () => { setHidden(true); try { localStorage.setItem(KEY, "1"); } catch { /* fine */ } };
  return (
    <div className="flex items-center justify-center gap-3 border-b border-line bg-ink/5 px-4 py-2 text-sm" data-testid="alerts-prompt">
      <Bell className="h-4 w-4 shrink-0" />
      <span>{state === "ios-install" ? "Add Pathwai to your Home Screen (Share, then Add to Home Screen) to get alerts for new events and members." : "Get an alert on this device for new events, new members and approvals."}</span>
      {state === "default" && <button className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-paper" onClick={async () => setState(await enableAlerts())} data-testid="alerts-prompt-enable">Turn on</button>}
      <button aria-label="Dismiss" className="text-muted hover:text-ink" onClick={dismiss}><X className="h-4 w-4" /></button>
    </div>
  );
}
