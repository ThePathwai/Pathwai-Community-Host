import React, { useState } from "react";
import { CalendarPlus, Copy } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { Button, Modal } from "./ui";

const copy = async (text, what = "Link") => {
  try { await navigator.clipboard.writeText(text); toast.success(`${what} copied`); }
  catch { toast.message("Select the link and copy it."); }
};

// "Add all events to my calendar": one personal link that Google Calendar (or Apple / Outlook)
// subscribes to, so every community event shows up and stays current. See backend routes/calendar_feed.py.
export default function CalendarSubscribe() {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const show = async () => {
    setOpen(true);
    if (d) return;
    try { setD((await api.get("/me/calendar")).data); } catch (e) { toast.error(errMsg(e)); setOpen(false); }
  };
  const reset = async () => {
    setBusy(true);
    try { setD((await api.post("/me/calendar/reset")).data); toast.success("New link created. The old one has stopped working."); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <Button variant="ghost" onClick={show} data-testid="calendar-subscribe-open"><CalendarPlus className="h-4 w-4" /> Add to calendar</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add all events to your calendar">
        {!d ? <p className="text-sm text-muted">One moment…</p> : (
          <div className="space-y-4" data-testid="calendar-subscribe-modal">
            <p className="text-sm text-muted">Every event you can see here will show up in your calendar and stay up to date, including new ones.</p>
            <a className="btn-primary !flex !w-full !items-center !justify-center" href={d.google_url} target="_blank" rel="noreferrer" data-testid="calendar-google">Add to Google Calendar</a>
            <a className="btn-ghost !flex !w-full !items-center !justify-center" href={d.webcal_url} data-testid="calendar-apple">Apple Calendar or Outlook</a>
            <div>
              <p className="label">Or paste this link into any calendar app</p>
              <div className="flex gap-2">
                <input readOnly className="input min-w-0 flex-1 text-xs" value={d.feed_url} onFocus={(e) => e.target.select()} data-testid="calendar-feed-url" />
                <Button variant="ghost" onClick={() => copy(d.feed_url)} aria-label="Copy link"><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
            <p className="text-xs text-muted">Google Calendar refreshes subscribed calendars on its own schedule, so a new event can take up to a day to appear there. This link is private to you: don't share it. If it leaks, make a new one.</p>
            <button className="text-xs text-muted underline" onClick={reset} disabled={busy} data-testid="calendar-reset">Make a new link (the old one stops working)</button>
          </div>)}
      </Modal>
    </>
  );
}
