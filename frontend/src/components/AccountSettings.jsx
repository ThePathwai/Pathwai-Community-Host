import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { isDemo } from "../lib/demo";
import { Button, Field, Input } from "./ui";

// The Settings tab on "Your profile". It works for every account (no community needed): who you are signed in as, your password,
// what Pathwai holds about you and how to take it with you, signing out of every device, and deleting the account.
// It only offers what really works: sign-in details come from the account itself, and each button calls the account's own endpoint.

const Section = ({ title, hint, children, testId }) => (
  <section className="card space-y-4" data-testid={testId}>
    <div><h2 className="text-lg font-semibold" style={{ textTransform: "none", letterSpacing: "-0.01em" }}>{title}</h2>{hint && <p className="mt-1 text-sm text-muted">{hint}</p>}</div>
    {children}
  </section>
);

const when = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }); } catch { return ""; } };

export default function AccountSettings({ account, onEditProfile }) {
  const demo = isDemo();
  const [sec, setSec] = useState(null);
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const [del, setDel] = useState({ open: false, confirm: "", password: "", email: "" });
  useEffect(() => { api.get("/hub/account/security").then((r) => setSec(r.data)).catch(() => setSec({ has_password: true })); }, []);

  const strong = pw.new_password.length >= 10 && /[A-Za-z]/.test(pw.new_password) && /\d/.test(pw.new_password);
  const changePw = async () => {
    setPwBusy(true);
    try { await api.post("/hub/account/change-password", pw); toast.success("Password updated. Other devices were signed out."); setPw({ current_password: "", new_password: "" }); }
    catch (e) { toast.error(errMsg(e)); } finally { setPwBusy(false); }
  };
  const downloadData = async () => {
    try {
      const { data } = await api.get("/hub/account/export", { responseType: "blob" });
      const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = "pathwai-my-data.json"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast.success("Your data was downloaded");
    } catch (e) { toast.error(errMsg(e)); }
  };
  const signOutEverywhere = async () => { try { await api.post("/hub/account/sign-out-everywhere"); window.location.href = "/login"; } catch (e) { toast.error(errMsg(e)); } };
  const deleteAccount = async () => {
    try { await api.post("/hub/account/delete", { confirm: del.confirm, password: del.password || undefined, email: del.email || undefined }); window.location.href = "/"; }
    catch (e) { toast.error(errMsg(e)); }
  };

  const via = sec?.sign_in_with ? sec.sign_in_with[0].toUpperCase() + sec.sign_in_with.slice(1) : (sec?.has_password === false ? "Google or Apple" : "Email and password");
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5" data-testid="account-settings">
      <Section title="Your account" testId="settings-account">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="min-w-0"><dt className="eyebrow">Name</dt><dd className="mt-1 truncate text-sm">{account.name}</dd></div>
          <div className="min-w-0"><dt className="eyebrow">Email</dt><dd className="mt-1 truncate text-sm">{account.email}</dd></div>
          <div className="min-w-0"><dt className="eyebrow">Signs in with</dt><dd className="mt-1 text-sm">{sec ? via : "…"}</dd></div>
        </dl>
        {sec?.created_at && <p className="text-xs text-muted">Member since {when(sec.created_at)}.</p>}
        <div><button type="button" onClick={onEditProfile} className="btn-ghost !py-2 text-sm" data-testid="settings-edit-profile">Edit your name, photo and details</button></div>
      </Section>

      <Section title="Password" testId="settings-password"
        hint={sec && !sec.has_password ? "You sign in with Google or Apple, so there is no Pathwai password to change." : "10 or more characters with a letter and a number. Changing it signs you out of your other devices."}>
        {(!sec || sec.has_password) && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Current password"><Input type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} data-testid="settings-current-password" /></Field>
              <Field label="New password"><Input type="password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} data-testid="settings-new-password" /></Field>
            </div>
            <Button variant="ghost" onClick={changePw} loading={pwBusy} disabled={demo || !pw.current_password || !strong} data-testid="settings-change-password">Update password</Button>
            {demo && <p className="text-xs text-muted">Turned off in the demo.</p>}
          </>
        )}
      </Section>

      <Section title="Your data and privacy" testId="settings-data"
        hint="Your profile and startup details are private to you. Download everything Pathwai holds about you, or read how it is used.">
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={downloadData} disabled={demo} data-testid="export-data">Download my data</Button>
          <a className="btn-ghost" href="/privacy">Privacy policy</a>
          <a className="btn-ghost" href="/terms">Terms</a>
        </div>
      </Section>

      <Section title="Security and closing your account" testId="settings-security">
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={signOutEverywhere} disabled={demo} data-testid="sign-out-everywhere">Sign out everywhere</Button>
          <Button variant="ghost" onClick={() => setDel({ ...del, open: !del.open })} disabled={demo} data-testid="delete-account-open">Delete my account…</Button>
        </div>
        {del.open && (
          <div className="space-y-3 rounded-2xl border border-line p-4" data-testid="delete-account-form">
            <p className="text-sm">This permanently deletes your account, your profile and your plan. It can't be undone.</p>
            {sec?.has_password === false
              ? <Field label="Type your account email to confirm"><Input type="email" value={del.email} onChange={(e) => setDel({ ...del, email: e.target.value })} data-testid="delete-email" /></Field>
              : <Field label="Your password"><Input type="password" autoComplete="current-password" value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} data-testid="delete-password" /></Field>}
            <Field label="Type DELETE to confirm"><Input value={del.confirm} onChange={(e) => setDel({ ...del, confirm: e.target.value })} data-testid="delete-confirm" /></Field>
            <Button onClick={deleteAccount} disabled={del.confirm.trim().toUpperCase() !== "DELETE"} data-testid="delete-account-confirm">Permanently delete my account</Button>
          </div>
        )}
        {demo && <p className="text-xs text-muted">These are turned off in the demo.</p>}
      </Section>
    </div>
  );
}
