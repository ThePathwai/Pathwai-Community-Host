import React, { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, timeAgo } from "../lib/api";
import { isDemo } from "../lib/demo";
import { alertsState, diagnosePush, enableAlerts } from "../lib/webNotify";
import { Button } from "./ui";

// "Turn on pop-up alerts" -- asks the browser for permission and registers this device for push, so
// new events, new members and approvals pop up on desktop and phone. `compact` hides the card once
// it's on (used as a banner on the Notifications page).
const pushService = (host = "") => (/apple/.test(host) ? "iPhone / Safari" : /googleapis|google/.test(host) ? "Android / Chrome" : /mozilla/.test(host) ? "Firefox" : /windows/.test(host) ? "Edge / Windows" : host || "Device");

export default function DesktopAlerts({ compact = false }) {
  const [state, setState] = useState(alertsState());
  const [check, setCheck] = useState(null); // { busy } | { ok, message }
  const [devices, setDevices] = useState(null); // what the server knows about this person's registered phones/computers
  useEffect(() => {
    if (state !== "granted" || isDemo() || (check && check.busy)) return undefined;
    const load = () => api.get("/push/status").then((r) => setDevices(r.data.devices || [])).catch(() => {});
    load();
    const onShow = () => { if (!document.hidden) load(); };  // reopening the app after the closed-app test shows how it went
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [state, check]);
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
  // The real test: schedule an alert for 20 seconds from now so the app can be closed and the phone locked first.
  const closedTest = async () => {
    try {
      const { data } = await api.post("/push/test-later", { seconds: 20 });
      if (!data.ok) { setCheck({ ok: false, message: data.message }); return; }
      setCheck({ ok: true, message: "Test scheduled for 20 seconds from now. Fully close Pathwai (swipe it away from the app switcher) and lock your phone. An alert should arrive within about 30 seconds. If it doesn't, open Pathwai again and read the status line below." });
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
          <Button variant="ghost" onClick={closedTest} data-testid="closed-test-alert">Test with app closed</Button>
        </div>)}
      {state === "granted" && devices && !compact && (
        <ul className="w-full space-y-0.5 text-xs text-muted" data-testid="push-devices">
          {devices.length === 0 && <li>This device isn't registered for alerts while the app is closed yet. Tap "Check this device".</li>}
          {devices.map((d, i) => (
            <li key={i}>{pushService(d.host)}: {d.last_status == null ? "no alert sent yet" : d.last_status >= 200 && d.last_status < 300 ? `the push service accepted the last alert ${timeAgo(d.last_at)}. If it never appeared on the phone, check Settings > Notifications > Pathwai and that Focus is off` : `last alert was refused (code ${d.last_status}${d.last_detail ? `: ${String(d.last_detail).slice(0, 80)}` : ""})`}</li>
          ))}
        </ul>)}
      {check && !check.busy && <p className={`w-full text-xs ${check.ok ? "text-green-600" : "text-red-600"}`} data-testid="check-push-result">{check.message}</p>}
    </div>
  );
}
