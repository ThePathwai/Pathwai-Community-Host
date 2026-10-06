import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Link2, Ticket } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fmtDate } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Card, Chip, Empty, Field, Input, PageHeader, Select, Spinner, Tabs, TagInput } from "../components/ui";
import Branding from "./AdminBrand";
import Integrations from "./AdminIntegrations";
import MembershipRequests from "./AdminMembers";
import { AdminRequests, Moderation, SupportQueue } from "./AdminPortal";

function Overview() {
  const [o, setO] = useState(null);
  const [kinds, setKinds] = useState([]);
  const [run, setRun] = useState({});
  useEffect(() => { api.get("/admin/overview").then((r) => setO(r.data)); api.get("/admin/audits").then((r) => setKinds(r.data.audits || [])); }, []);
  if (!o) return <Spinner />;
  const runAudit = async (kind) => { setRun((x) => ({ ...x, [kind]: { loading: true } })); try { const { data } = await api.post(`/admin/audits/${kind}`, {}); setRun((x) => ({ ...x, [kind]: data })); } catch (e) { setRun((x) => ({ ...x, [kind]: { error: errMsg(e) } })); } };
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{Object.entries(o).map(([k, v]) => <Card key={k}><p className="stat font-display text-2xl">{v}</p><p className="text-xs capitalize text-muted">{k.replace(/_/g, " ")}</p></Card>)}</div>
      <h2 className="text-xl font-semibold">AI audits</h2>
      <div className="grid gap-3 md:grid-cols-2">{kinds.map((a) => (
        <Card key={a.kind}><p className="font-medium">{a.title}</p><p className="text-sm text-muted">{a.description}</p>
          <Button className="mt-3" variant="ghost" onClick={() => runAudit(a.kind)} loading={run[a.kind]?.loading}>{a.user_label || "Run"}</Button>
          {run[a.kind]?.error && <p className="mt-2 text-sm text-red-400">{run[a.kind].error}</p>}
          {(run[a.kind]?.reply || run[a.kind]?.summary) && <p className="mt-3 whitespace-pre-wrap text-sm">{run[a.kind].reply || run[a.kind].summary}</p>}</Card>))}</div>
    </div>
  );
}

function Config() {
  const [c, setC] = useState(null);
  useEffect(() => { api.get("/community/config").then((r) => setC(r.data)); }, []);
  if (!c) return <Spinner />;
  const save = async () => { try { await api.patch("/community/config", c); toast.success("Saved"); } catch (e) { toast.error(errMsg(e)); } };
  const setField = (i, k, v) => setC({ ...c, signup_fields: c.signup_fields.map((f, j) => (j === i ? { ...f, [k]: v } : f)) });
  return (
    <Card className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Community name"><Input value={c.community_name} onChange={(e) => setC({ ...c, community_name: e.target.value })} /></Field>
        <Field label="Tagline"><Input value={c.tagline} onChange={(e) => setC({ ...c, tagline: e.target.value })} /></Field>
      </div>
      <Field label="Event types"><TagInput value={c.event_types} onChange={(v) => setC({ ...c, event_types: v })} /></Field>
      <Field label="Support categories"><TagInput value={c.support_categories} onChange={(v) => setC({ ...c, support_categories: v })} /></Field>
      <div><span className="label">Signup fields</span>{c.signup_fields.map((f, i) => (
        <div key={f.key} className="mb-2 flex items-center gap-3"><Input value={f.label} onChange={(e) => setField(i, "label", e.target.value)} />
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={!!f.required} onChange={(e) => setField(i, "required", e.target.checked)} data-testid={`req-${f.key}`} />Required</label></div>))}</div>
      <div className="flex gap-2"><Button onClick={save}>Save changes</Button><Link className="btn-ghost" to="/setup" data-testid="open-setup">Run setup wizard</Link></div>
    </Card>
  );
}

function Invites() {
  const { config } = useAuth();
  const [items, setItems] = useState(null);
  const [email, setEmail] = useState("");
  const load = useCallback(() => api.get("/invites").then((r) => setItems(r.data)), []);
  useEffect(() => { load(); }, [load]);
  const create = async () => { try { await api.post("/invites", { email: email || null }); setEmail(""); load(); } catch (e) { toast.error(errMsg(e)); } };
  // The public, no-login landing page for this community (CommunityLanding.jsx at /c/:slug) --
  // one link anyone can be sent, on or off Pathwai, that shows this community's own branding and
  // a "Request to join"/"Join" button. Unlike the invite links below, it's not single-use and
  // doesn't track who it was sent to -- it's the "post this on social / put it in a newsletter" link.
  const shareUrl = config?.slug ? `${window.location.origin}/c/${config.slug}` : "";
  return (
    <div className="space-y-4">
      {shareUrl && (
        <Card className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/5"><Link2 className="h-4 w-4 text-muted" /></span>
            <div>
              <p className="flex flex-wrap items-center gap-2 font-medium">Share your community <Chip accent>Reusable · never expires</Chip></p>
              <p className="break-all text-sm text-muted">{shareUrl}</p>
              <p className="mt-0.5 text-xs text-muted">Anyone who opens this can ask to join. Post it anywhere — it doesn't track who used it.</p>
            </div>
          </div>
          <Button variant="ghost" onClick={() => { navigator.clipboard?.writeText(shareUrl); toast.success("Copied"); }} data-testid="copy-share-link">Copy link</Button>
        </Card>
      )}
      <Card className="flex gap-2"><Input placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} /><Button onClick={create} data-testid="create-invite">Create invite link</Button></Card>
      {!items ? <Spinner /> : items.length === 0 ? <Empty title="No invites yet" /> : items.map((i) => {
        const url = `${window.location.origin}/join/${i.code}`;
        return <Card key={i.id} className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/5"><Ticket className="h-4 w-4 text-muted" /></span>
            <div>
              <p className="flex flex-wrap items-center gap-2 font-medium">Invite link <Chip>One-time use</Chip></p>
              <p className="break-all text-sm text-muted">{url}</p>
              <p className="mt-0.5 text-xs text-muted">{i.email || "Anyone with the link"} · dies after first use · {fmtDate(i.created_at)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2"><Chip>{i.status}</Chip><Button variant="ghost" onClick={() => { navigator.clipboard?.writeText(url); toast.success("Copied"); }}>Copy</Button></div>
        </Card>;
      })}
    </div>
  );
}

function AuditLog() {
  const [data, setData] = useState(null);
  const [action, setAction] = useState("all");
  const [actions, setActions] = useState([]);
  useEffect(() => { api.get("/admin/audit-log/actions").then((r) => setActions(r.data.actions)); }, []);
  useEffect(() => { setData(null); api.get("/admin/audit-log", { params: { action, limit: 100 } }).then((r) => setData(r.data)); }, [action]);
  return (
    <div>
      <div className="mb-4 max-w-xs"><Select value={action} onChange={(e) => setAction(e.target.value)} options={[{ value: "all", label: "All actions" }, ...actions]} /></div>
      {!data ? <Spinner /> : data.entries.length === 0 ? <Empty title="No entries" /> : (
        <div className="overflow-x-auto rounded-xl2 border border-line bg-surface"><table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase text-muted"><tr><th className="p-3">When</th><th className="p-3">Actor</th><th className="p-3">Action</th><th className="p-3">Target</th><th className="p-3">Details</th></tr></thead>
          {/* "Details" surfaces a reported message's reason (and who sent it) right in the log --
              see routes/messages.py's report_message, which is what writes a "message.reported"
              entry with that in its meta -- so a conduct report is reviewable here without a
              separate moderation queue. Any other action with a meta.reason shows the same way. */}
          <tbody>{data.entries.map((e, i) => <tr key={i} className="border-b border-line last:border-0"><td className="p-3 text-xs">{fmtDate(e.created_at)}</td><td className="p-3">{data.actors[e.actor_id]?.name || e.actor_id || "—"}</td><td className="p-3"><Chip>{e.action}</Chip></td><td className="p-3 text-xs text-muted">{e.target_type} {e.target_id}</td><td className="p-3 text-xs text-muted">{e.meta?.reason ? <>“{e.meta.reason}”{e.meta.reported_user_name ? <> · about {e.meta.reported_user_name}</> : ""}</> : "—"}</td></tr>)}</tbody></table></div>)}
    </div>
  );
}

export default function Admin() {
  // The old Action center tab (a dashboard of pending-item tiles that just linked into these other
  // tabs) was redundant with them and with Overview below -- removed; the one thing it added, an
  // at-a-glance "does anything need me" signal, now lives as a badge on the Admin link in the
  // account menu instead (see Layout.jsx). Overview is the landing tab now.
  const [tab, setTab] = useState(() => { try { const t = sessionStorage.getItem("pathwai.admintab"); sessionStorage.removeItem("pathwai.admintab"); return t || "overview"; } catch { return "overview"; } });
  return (
    <div>
      <PageHeader title="Admin" subtitle="Configure your community and keep an eye on what's happening." />
      <Tabs tabs={[{ value: "overview", label: "Overview" }, { value: "members", label: "Members" }, { value: "requests", label: "Requests" }, { value: "moderation", label: "Approvals" }, { value: "support", label: "Support" }, { value: "brand", label: "Branding" }, { value: "integrations", label: "Integrations" }, { value: "config", label: "Community" }, { value: "invites", label: "Invites" }, { value: "audit", label: "Audit log" }]} value={tab} onChange={setTab} />
      {tab === "members" && <MembershipRequests />}{tab === "requests" && <AdminRequests />}{tab === "moderation" && <Moderation />}{tab === "support" && <SupportQueue />}{tab === "overview" && <Overview />}{tab === "brand" && <Branding />}{tab === "integrations" && <Integrations />}{tab === "config" && <Config />}{tab === "invites" && <Invites />}{tab === "audit" && <AuditLog />}
    </div>
  );
}
