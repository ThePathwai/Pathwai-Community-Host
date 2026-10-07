import React, { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { Button } from "./ui";

const copy = async (text, what) => {
  try { await navigator.clipboard.writeText(text); toast.success(`${what} copied`); }
  catch { toast.message("Select the text and copy it."); }
};

// Shown under the Google Forms integration: how to make a request complete itself when someone submits
// the form. Needs a Google account you already have, no API keys. Backend: routes/form_hooks.py.
export default function GoogleFormsSetup() {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setOpen(!open);
    if (d || open) return;
    try { setD((await api.get("/admin/google-forms/setup")).data); } catch (e) { toast.error(errMsg(e)); }
  };
  const reset = async () => {
    setBusy(true);
    try { setD((await api.post("/admin/google-forms/reset")).data); toast.success("New script created. Paste it into your forms again."); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <div className="mt-4 border-t border-line pt-4" data-testid="google-forms-setup">
      <button className="text-sm font-medium underline" onClick={load} data-testid="google-forms-setup-toggle">{open ? "Hide auto-complete setup" : "Make requests complete themselves"}</button>
      {open && (!d ? <p className="mt-2 text-sm text-muted">One moment…</p> : (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-muted">Right now a member opens the form, fills it in, then taps "I've completed it". Do this once per form and it's ticked off the moment they submit. It takes about two minutes.</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Open your Google Form → <strong>Settings</strong> → <strong>Responses</strong> → turn on <strong>Collect email addresses</strong> (Verified or Responder input). This is how we know who submitted.</li>
            <li>Click the three dots (top right) → <strong>Apps Script</strong>. Delete what's there, paste the script below, and click Save.</li>
            <li>In Apps Script click the clock icon (<strong>Triggers</strong>) → <strong>Add Trigger</strong> → function <strong>onFormSubmit</strong>, event source <strong>From form</strong>, event type <strong>On form submit</strong> → Save, and allow the permissions Google asks for.</li>
          </ol>
          <div className="relative">
            <pre className="max-h-56 overflow-auto rounded-xl bg-ink/5 p-3 text-xs" data-testid="google-forms-script">{d.script}</pre>
            <Button variant="ghost" className="mt-2" onClick={() => copy(d.script, "Script")} data-testid="google-forms-copy"><Copy className="h-4 w-4" /> Copy script</Button>
          </div>
          <p className="text-xs text-muted">The script contains a private link: don't share it. Members only need to use the same email address here as in Pathwai. If it leaks, make a new one (you'll need to paste it into your forms again). <button className="underline" onClick={reset} disabled={busy} data-testid="google-forms-reset">Make a new script</button></p>
        </div>))}
    </div>
  );
}
