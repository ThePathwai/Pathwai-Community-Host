import React, { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, timeAgo } from "../lib/api";
import { Button, Card, Chip, Field, Input, Select, Spinner } from "../components/ui";

const STATUS = { connected: "Connected", demo: "Demo mode", saved: "Saved, not tested", error: "Needs attention", disconnected: "Not connected" };

function PlanEditor({ plans = [], onChange }) {
  const set = (i, patch) => onChange(plans.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <div className="space-y-2">
      {plans.map((p, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <Input placeholder="Plan name" value={p.label || ""} onChange={(e) => set(i, { label: e.target.value })} />
          <Input placeholder="Price (cents)" type="number" value={p.amount_cents ?? ""} onChange={(e) => set(i, { amount_cents: e.target.value })} />
          <Select value={p.interval || "month"} onChange={(e) => set(i, { interval: e.target.value })} options={[{ value: "month", label: "Monthly" }, { value: "year", label: "Yearly" }, { value: "once", label: "One-time" }]} />
          <button className="p-2 text-muted hover:text-ink" onClick={() => onChange(plans.filter((_, j) => j !== i))} aria-label="Remove plan"><Trash2 className="h-4 w-4" /></button>
        </div>))}
      <Button variant="ghost" onClick={() => onChange([...plans, { label: "", amount_cents: 2500, interval: "month" }])}>Add a plan</Button>
      <p className="text-xs text-muted">Have a Stripe Price already? Leave this and set it in Stripe — plans here create Checkout prices on the fly.</p>
    </div>
  );
}

function Provider({ p, reload }) {
  const [open, setOpen] = useState(false);
  const [creds, setCreds] = useState({});
  const [settings, setSettings] = useState(p.settings);
  const [busy, setBusy] = useState("");
  useEffect(() => { setSettings(p.settings); }, [p.settings]);
  const run = async (name, fn, ok) => { setBusy(name); try { const r = await fn(); toast.success(ok ? ok(r.data) : "Done"); await reload(); } catch (e) { toast.error(errMsg(e)); await reload(); } finally { setBusy(""); } };
  const save = () => run("save", () => api.put(`/admin/integrations/${p.provider}`, { credentials: creds, settings }), () => "Saved");
  const connected = p.enabled && p.status !== "disconnected";
  return (
    <Card data-testid={`integration-${p.provider}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl"><div className="flex items-center gap-2"><h3 className="text-lg">{p.label}</h3><Chip>{STATUS[p.status] || p.status}</Chip></div>
          <p className="mt-1 text-sm text-muted">{p.description}</p>
          <div className="mt-2 flex flex-wrap gap-1">{p.capabilities.map((c) => <Chip key={c}>{c}</Chip>)}</div></div>
        <div className="flex gap-2">
          {p.kind === "link" ? <Button variant={p.enabled ? "ghost" : "primary"} onClick={() => run("save", () => (p.enabled ? api.delete(`/admin/integrations/${p.provider}`) : api.put(`/admin/integrations/${p.provider}`, {})), () => "Updated")}>{p.enabled ? "Disable" : "Enable"}</Button>
            : <Button variant={connected ? "ghost" : "primary"} onClick={() => setOpen(!open)} data-testid={`connect-${p.provider}`}>{connected ? "Settings" : "Connect"}</Button>}
        </div>
      </div>
      {p.last_error && <p className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-400">{p.last_error}</p>}
      {p.last_sync_at && !p.last_error && <p className="mt-3 text-xs text-muted">Last sync {timeAgo(p.last_sync_at)} · {Object.entries(p.last_result || {}).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ")}</p>}
      {p.kind === "api" && open && (
        <div className="mt-4 space-y-4 border-t border-line pt-4">
          {p.credential_fields.map((f) => (
            <Field key={f.key} label={f.label} hint={p.masked[f.key] ? `Saved (${p.masked[f.key]}) — leave blank to keep it` : undefined}>
              <Input type="password" autoComplete="off" data-testid={`cred-${p.provider}-${f.key}`} placeholder={f.placeholder} value={creds[f.key] || ""} onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value })} /></Field>))}
          <div className="grid gap-3 sm:grid-cols-2">{p.setting_fields.filter((f) => f.type !== "plans" && f.type !== "bool").map((f) => (
            <Field key={f.key} label={f.label}><Input placeholder={f.placeholder} value={settings[f.key] ?? ""} data-testid={`set-${p.provider}-${f.key}`} onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })} /></Field>))}</div>
          {p.setting_fields.filter((f) => f.type === "bool").map((f) => <label key={f.key} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-accent" checked={!!settings[f.key]} onChange={(e) => setSettings({ ...settings, [f.key]: e.target.checked })} />{f.label}</label>)}
          {p.setting_fields.some((f) => f.type === "plans") && <Field label="Membership plans"><PlanEditor plans={settings.plans} onChange={(plans) => setSettings({ ...settings, plans })} /></Field>}
          {p.webhook_path && <Field label="Webhook endpoint" hint={p.provider === "twilio" ? "Paste this into your Twilio number (or Messaging Service) → \"A message comes in\" → Webhook (HTTP POST). It lets STOP replies switch a member's texts off." : "Add this in Stripe → Developers → Webhooks. Events: checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.updated/deleted."}><Input readOnly data-testid={`webhook-url-${p.provider}`} value={p.webhook_url || `${process.env.REACT_APP_BACKEND_URL || window.location.origin}${p.webhook_path}`} onFocus={(e) => e.target.select()} /></Field>}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={save} loading={busy === "save"} data-testid={`save-${p.provider}`}>Save</Button>
            <Button variant="ghost" onClick={() => run("test", () => api.post(`/admin/integrations/${p.provider}/test`), (d) => d.message)} loading={busy === "test"} data-testid={`test-${p.provider}`}>Test connection</Button>
            <Button variant="ghost" onClick={() => run("sync", () => api.post(`/admin/integrations/${p.provider}/sync`), (d) => "Synced: " + Object.entries(d.result).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", "))} loading={busy === "sync"} data-testid={`sync-${p.provider}`}>Sync now</Button>
            {p.enabled && <Button variant="ghost" onClick={() => run("rm", () => api.delete(`/admin/integrations/${p.provider}`), () => "Disconnected")}>Disconnect</Button>}
            {p.docs && <a className="text-xs underline" href={p.docs} target="_blank" rel="noreferrer">Where do I find this?</a>}
          </div>
          <p className="text-xs text-muted">Keys are encrypted on the server and never shown again. Type <code>demo</code> as the key to try this integration with sample data.</p>
          {p.log.length > 0 && <div className="space-y-1 text-xs text-muted">{p.log.map((l, i) => <p key={i}><span className={l.level === "error" ? "text-red-400" : ""}>{timeAgo(l.at)}</span> · {l.msg}</p>)}</div>}
        </div>)}
    </Card>
  );
}

export default function Integrations() {
  const [items, setItems] = useState(null);
  const load = useCallback(() => api.get("/admin/integrations").then((r) => setItems(r.data.integrations)), []);
  useEffect(() => { load(); }, [load]);
  if (!items) return <Spinner />;
  return <div className="space-y-4"><p className="text-sm text-muted">Connect the tools your community already uses. Members keep working in Pathwai; data flows both ways.</p>{items.map((p) => <Provider key={p.provider} p={p} reload={load} />)}</div>;
}
