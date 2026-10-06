import React, { useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { alertsState, diagnosePush, enableAlerts } from "../lib/webNotify";
import { Button } from "./ui";

// "Turn on pop-up alerts" -- asks the browser for permission and registers this device for push, so
// new events, new members and approvals pop up on desktop and phone. `compact` hides the card once
// it's on (used as a banner on the Notifications page).
export default function DesktopAlerts({ compact = false }) {
  const [state, setState] = useState(alertsState());
  const [check, setCheck] = useState(null); // { busy } | { ok, message }
  if (state === "unsupported" || (compact && state === "granted")) return null;
  const turnOn = async () => setState(await enableAlerts());
  // Admins are never alerted about their own actions, so this is how they see a pop-up work.
  const sendTest = async () => {
    try {
      await api.post("/notifications/test");
      toast.success("Test sent. A pop-up should appear in a few seconds.");
      window.dispatchEvent(new Event("pw:check-notifications"));
    } catch (e) { toast.error(errMsg(e)); }
  };
  const runCheck = async () => { setCheck({ busy: true }); setCheck(await diagnosePush()); };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3" data-testid="desktop-alerts">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/5"><Bell className="h-4 w-4 text-muted" /></span>
        <div>
          <p className="text-sm font-medium">Pop-up alerts on this device</p>
          <p className="text-xs text-muted">
            {state === "granted" && "On. New events, new members and approvals will pop up on this device, even when Pathwai isn't open."}
            {state === "default" && "Get a pop-up on this phone or computer for a new event, a new member or an approval, even when Pathwai isn't open."}
            {state === "denied" && "Blocked. In your browser's settings (the lock icon next to the address), set Notifications to Allow, then reload this page."}
            {state === "ios-install" && "On iPhone and iPad, first tap Share, then Add to Home Screen. Open Pathwai from the new icon and come back here to turn alerts on."}
          </p>
        </div>
      </div>
      {state === "default" && <Button onClick={turnOn} data-testid="enable-desktop-alerts">Turn on</Button>}
      {state === "granted" && (
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={runCheck} loading={!!check?.busy} data-testid="check-push">Check this device</Button>
          <Button variant="ghost" onClick={sendTest} data-testid="send-test-alert">Send me a test</Button>
        </div>)}
      {check && !check.busy && <p className={`w-full text-xs ${check.ok ? "text-green-600" : "text-red-600"}`} data-testid="check-push-result">{check.message}</p>}
    </div>
  );
}
