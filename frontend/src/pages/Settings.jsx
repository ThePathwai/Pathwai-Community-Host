import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { Button, Card, Chip, StatusBadge, Field, Input, PageHeader, SectionCard, Spinner } from "../components/ui";

const Toggle = ({ label, hint, checked, onChange, testid }) => (
  <label className="flex cursor-pointer items-center justify-between gap-4 border-t border-line py-3 first:border-0">
    <span><span className="block text-sm">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
    <input type="checkbox" data-testid={testid} checked={!!checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-accent" />
  </label>
);

export default function SettingsPage() {
  const [d, setD] = useState(null);
  const [bill, setBill] = useState(null);
  const loadBill = () => api.get("/me/billing").then((r) => setBill(r.data)).catch(() => {});
  useEffect(() => { loadBill(); }, []);
  const pay = async (key) => { try { const { data } = await api.post("/me/billing/checkout", { plan_key: key }); if (data.url) window.location.href = data.url; else { toast.success(data.message); loadBill(); } } catch (e) { toast.error(errMsg(e)); } };
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [del, setDel] = useState({ open: false, confirm: "", password: "", email: "" });
  useEffect(() => { api.get("/me/settings").then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e))); }, []);
  if (!d) return <Spinner />;
  const s = d.settings;
  const patch = async (body) => {
    const next = { ...s, ...Object.fromEntries(Object.entries(body).map(([k, v]) => [k, typeof v === "object" && v ? { ...s[k], ...v } : v])) };
    setD({ ...d, settings: next });
    try { await api.patch("/me/settings", body); toast.success("Saved"); } catch (e) { toast.error(errMsg(e)); }
  };
  const changePw = async () => { try { await api.post("/me/change-password", pw); toast.success("Password updated"); setPw({ current_password: "", new_password: "" }); } catch (e) { toast.error(errMsg(e)); } };
  const n = s.notifications;
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
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Settings" subtitle="Your account, notifications and privacy." />
      <SectionCard title="Account">
        <div className="grid gap-4 sm:grid-cols-3"><div><p className="label">Name</p><p className="text-sm">{d.account.name}</p></div><div><p className="label">Email</p><p className="text-sm">{d.account.email}</p></div><div><p className="label">Member type</p><Chip>{d.account.member_type}</Chip></div></div>
      </SectionCard>
      {bill?.enabled && (
        <SectionCard title="Membership and billing" action={bill.status && <StatusBadge status={bill.status === "active" ? "approved" : bill.status === "past_due" ? "overdue" : "closed"} />}>
          {bill.status === "active" && <p className="mb-3 text-sm">Your membership is <b>active</b>{bill.plan ? ` (${bill.plan})` : ""}.</p>}
          {bill.status && bill.status !== "active" && <p className="mb-3 text-sm text-muted">Your membership is {bill.status.replace(/_/g, " ")}. Choose a plan to reactivate.</p>}
          <div className="grid gap-3 sm:grid-cols-2">{bill.plans.map((pl) => (
            <div key={pl.key} className="flex items-center justify-between rounded-lg border border-line p-3" data-testid={`plan-${pl.key}`}>
              <div><p className="text-sm font-medium">{pl.label}</p><p className="text-xs text-muted">{pl.amount_cents ? `${(bill.currency || "cad").toUpperCase()} $${(pl.amount_cents / 100).toFixed(2)}` : ""}{pl.interval === "once" ? "" : ` / ${pl.interval}`}</p></div>
              <Button variant={bill.status === "active" && bill.plan === pl.label ? "ghost" : "primary"} className="!py-1.5" onClick={() => pay(pl.key)} data-testid={`pay-${pl.key}`}>{bill.status === "active" && bill.plan === pl.label ? "Current" : "Choose"}</Button>
            </div>))}</div>
          {bill.payments.length > 0 && <div className="mt-4 space-y-1 text-xs text-muted">{bill.payments.map((x) => <p key={x.id}>{x.kind} · {x.amount ? `$${(x.amount / 100).toFixed(2)}` : ""} · {new Date(x.at).toLocaleDateString()}</p>)}</div>}
        </SectionCard>)}
      <SectionCard title="Password">
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Current password"><Input type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
          <Field label="New password"><Input type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field></div>
        <Button className="mt-3" variant="ghost" onClick={changePw} disabled={!pw.current_password || pw.new_password.length < 10 || !/[A-Za-z]/.test(pw.new_password) || !/\d/.test(pw.new_password)}>Update password</Button>
        <p className="mt-2 text-xs text-muted">10+ characters with a letter and a number. Changing it signs you out of your other devices.</p>
      </SectionCard>
      <SectionCard title="Notifications">
        <Toggle label="In-app notifications" checked={n.in_app} onChange={(v) => patch({ notifications: { in_app: v } })} />
        <Toggle label="Email" checked={n.email} onChange={(v) => patch({ notifications: { email: v } })} />
        <Toggle label="Slack" hint="Available when your community connects Slack" checked={n.slack} onChange={(v) => patch({ notifications: { slack: v } })} />
        <Toggle label="Text messages (SMS)" hint="Event reminders and news from your community. Uses the phone number on your profile. Reply STOP any time." checked={!!n.sms} onChange={(v) => patch({ notifications: { sms: v } })} />
        <p className="label mt-4">What to notify me about</p>
        {["requests", "events", "matches", "announcements", "support"].map((k) => <Toggle key={k} label={k[0].toUpperCase() + k.slice(1)} checked={n.kinds?.[k]} onChange={(v) => patch({ notifications: { kinds: { [k]: v } } })} />)}
      </SectionCard>
      <SectionCard title="Privacy">
        <Toggle label="Show me in the directory" hint="Other members can find your profile" checked={s.privacy.visible_in_directory} onChange={(v) => patch({ privacy: { visible_in_directory: v } })} testid="privacy-directory" />
        <Toggle label="Show my email to members" checked={s.privacy.show_email} onChange={(v) => patch({ privacy: { show_email: v } })} />
        <Toggle label="Show my phone number to members" checked={s.privacy.show_phone} onChange={(v) => patch({ privacy: { show_phone: v } })} />
      </SectionCard>
      <SectionCard title="Your data and security">
        <p className="mb-3 text-sm text-muted">Download everything Pathwai holds about you, sign out of every device, or delete your account. See our <a className="underline" href="/privacy">Privacy Policy</a>.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={downloadData} data-testid="export-data">Download my data</Button>
          <Button variant="ghost" onClick={signOutEverywhere} data-testid="sign-out-everywhere">Sign out everywhere</Button>
          <Button variant="ghost" onClick={() => setDel({ ...del, open: !del.open })} data-testid="delete-account-open">Delete my account…</Button>
        </div>
        {del.open && (
          <div className="mt-4 space-y-3 rounded-lg border border-line p-4" data-testid="delete-account-form">
            <p className="text-sm">This permanently deletes your account and your profile and activity in every community. It can't be undone. If you're the only admin of a community, make someone else an admin first.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Your password"><Input type="password" autoComplete="current-password" value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} data-testid="delete-password" /></Field>
              <Field label="Type DELETE to confirm"><Input value={del.confirm} onChange={(e) => setDel({ ...del, confirm: e.target.value })} data-testid="delete-confirm" /></Field>
            </div>
            <Field label="Account email (only if you have no password)"><Input type="email" value={del.email} onChange={(e) => setDel({ ...del, email: e.target.value })} data-testid="delete-email" /></Field>
            <Button onClick={deleteAccount} disabled={del.confirm.trim().toUpperCase() !== "DELETE"} data-testid="delete-account-confirm">Permanently delete my account</Button>
          </div>)}
      </SectionCard>
      <SectionCard title="Calendar and connected accounts">
        <Field label="Your booking link"><Input type="url" placeholder="https://cal.com/you" value={s.calendar_link || ""} onChange={(e) => setD({ ...d, settings: { ...s, calendar_link: e.target.value } })} onBlur={(e) => patch({ calendar_link: e.target.value })} /></Field>
        <div className="mt-4 flex flex-wrap gap-2">{d.connected_accounts.length === 0 ? <p className="text-sm text-muted">Your community hasn't connected any tools yet.</p> : d.connected_accounts.map((c) => <Chip key={c.provider}>{c.label || c.provider} · connected</Chip>)}</div>
      </SectionCard>
    </div>
  );
}
