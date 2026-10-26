import React, { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BarChart3, ChevronLeft, ChevronRight, ClipboardList, Download, FileText, LifeBuoy, Link2, Palette, Plug, ScrollText, Settings2, ShieldCheck, Ticket, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fmtDate } from "../lib/api";
import { useLive } from "../lib/live";
import { useAuth } from "../lib/auth";
import { Button, Card, Chip, Empty, Field, Input, PageHeader, Select, Spinner, TagInput, cx } from "../components/ui";
import { ImpactPanel, QuietCard } from "../components/ImpactPanel";
import Reports from "./Reports";
import AuditView from "../components/AuditView";
import Branding from "./AdminBrand";
import Integrations from "./AdminIntegrations";
import ImportData from "./ImportData";
import MembershipRequests from "./AdminMembers";
import { AdminRequests, Moderation, SupportQueue } from "./AdminPortal";

// The PDF comes back as a file, so a failed request arrives as a Blob. Read the message out of it.
async function pdfError(e) {
  try { const d = e?.response?.data; if (d instanceof Blob) { const j = JSON.parse(await d.text()); if (typeof j.detail === "string") return j.detail; } } catch { /* fall through */ }
  return errMsg(e, "The PDF could not be created. Please try again.");
}

function Audits({ go }) {
  const [loaded, setLoaded] = useState(false);
  const [kinds, setKinds] = useState([]);
  const [run, setRun] = useState({});
  const [pdf, setPdf] = useState(null);
  const loadOverview = useCallback(() => { api.get("/admin/audits").then((r) => setKinds(r.data.audits || [])).catch(() => {}).finally(() => setLoaded(true)); }, []);
  useEffect(() => { loadOverview(); }, [loadOverview]);
  useLive(["members", "events", "admin", "requests"], loadOverview);
  if (!loaded) return <Spinner />;
  const runAudit = async (kind) => { setRun((x) => ({ ...x, [kind]: { ...x[kind], loading: true, error: null } })); try { const { data } = await api.post(`/admin/audits/${kind}`, {}); setRun((x) => ({ ...x, [kind]: data })); } catch (e) { setRun((x) => ({ ...x, [kind]: { error: errMsg(e) } })); } };
  const download = async (kind) => {
    setPdf(kind);
    try {
      const r = await api.get("/admin/audits-report.pdf", { params: { kind }, responseType: "blob" });
      const name = (/filename="?([^";]+)"?/.exec(r.headers?.["content-disposition"] || "") || [])[1] || "community-audit.pdf";
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success("PDF downloaded");
    } catch (e) { toast.error(await pdfError(e)); } finally { setPdf(null); }
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="max-w-2xl text-sm text-muted">Live numbers from your community. Run one to see it here, or download everything as a PDF report with charts. Need something for a sponsor, an investor or your board? <button type="button" onClick={() => go("reports")} className="underline" data-testid="audits-to-reports">Open Reports</button>.</p>
        </div>
        <Button onClick={() => download("all")} loading={pdf === "all"} data-testid="audit-pdf-all"><Download className="h-4 w-4" />Download full report (PDF)</Button>
      </div>
      {kinds.length === 0 && <Empty title="No audits to run yet" hint="They appear here once your community has members and activity." />}
      <div className="grid gap-3 md:grid-cols-2">{kinds.map((a) => {
        const r = run[a.kind] || {};
        const done = !!r.tiles;
        return (
          <Card key={a.kind} className={done ? "md:col-span-2" : ""} data-testid={`audit-card-${a.kind}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><p className="font-medium">{a.title}</p><p className="text-sm text-muted">{a.description}</p></div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => runAudit(a.kind)} loading={r.loading} data-testid={`audit-run-${a.kind}`}>{done ? "Refresh" : (a.user_label || "Run")}</Button>
                {done && <Button variant="ghost" onClick={() => download(a.kind)} loading={pdf === a.kind} data-testid={`audit-pdf-${a.kind}`}><Download className="h-4 w-4" />PDF</Button>}
              </div>
            </div>
            {r.error && <p className="mt-3 text-sm text-red-400">{r.error}</p>}
            {done && <AuditView audit={r} />}
          </Card>
        );
      })}</div>
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
  useLive(["admin"], load);
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

// Everything an admin runs the community with, grouped by what they are doing. One list drives the sidebar, the overview tiles and the badges.
const GROUPS = [
  { title: "Insights", items: [
    { key: "reports", label: "Reports", icon: FileText, blurb: "Sponsor, funder and board reports. Download slides or share a live link." },
    { key: "audits", label: "Audits", icon: BarChart3, blurb: "Live checks on members, events and perks, with a PDF." },
    { key: "audit", label: "Activity log", icon: ScrollText, blurb: "Who changed what, and when." },
  ] },
  { title: "People", items: [
    { key: "members", label: "Members", icon: Users, blurb: "People who asked to join, approved or declined here.", attn: ["pending_memberships"] },
    { key: "requests", label: "Requests", icon: ClipboardList, blurb: "Forms and info you have asked members for.", attn: ["awaiting_review", "overdue_requests"] },
    { key: "moderation", label: "Approvals", icon: ShieldCheck, blurb: "Posts and offers waiting for your OK.", attn: ["pending_moderation"] },
    { key: "support", label: "Support", icon: LifeBuoy, blurb: "Questions members have sent you.", attn: ["support_needing_action"] },
    { key: "invites", label: "Invites", icon: Ticket, blurb: "Your public join link and one-time invites." },
  ] },
  { title: "Set up", items: [
    { key: "brand", label: "Branding", icon: Palette, blurb: "Logo, colours, fonts and the menu." },
    { key: "import", label: "Import your data", icon: Upload, blurb: "Bring in members, events and guest lists from a spreadsheet or a link." },
    { key: "integrations", label: "Connections", icon: Plug, blurb: "Stripe payments, Instagram, TikTok and form tools." },
    { key: "config", label: "Community", icon: Settings2, blurb: "Name, event types and signup questions." },
  ] },
];
const ITEMS = GROUPS.flatMap((g) => g.items);
const ATTN_ROWS = [
  ["pending_memberships", (n) => `${n} ${n === 1 ? "person is" : "people are"} waiting to join`, "members"],
  ["awaiting_review", (n) => `${n} ${n === 1 ? "response" : "responses"} to review`, "requests"],
  ["overdue_requests", (n) => `${n} overdue ${n === 1 ? "request" : "requests"}`, "requests"],
  ["support_needing_action", (n) => `${n} support ${n === 1 ? "question needs" : "questions need"} a reply`, "support"],
  ["pending_moderation", (n) => `${n} ${n === 1 ? "item is" : "items are"} waiting for approval`, "moderation"],
];
const countFor = (attn, item) => (item.attn || []).reduce((n, k) => n + (attn?.[k] || 0), 0);
const Dot = ({ n, className = "" }) => n > 0 ? <span className={cx("shrink-0 rounded-full bg-red-600 px-1.5 text-center text-[10px] font-bold leading-[18px] text-white", className)} aria-label={`${n} waiting`}>{n}</span> : null;

/** The landing view: what needs you now, every tool as a labelled tile, then the headline numbers. */
function Hub({ attn, go }) {
  const rows = ATTN_ROWS.map(([k, text, tab]) => [k, attn?.[k] || 0, text, tab]).filter(([, n]) => n > 0);
  return (
    <div className="space-y-8" data-testid="admin-overview">
      <section aria-label="Needs your attention" data-testid="admin-attention">
        <h2 className="eyebrow mb-3">Needs your attention</h2>
        {!attn ? <div className="h-16 animate-pulse rounded-xl bg-ink/[.06]" /> : rows.length === 0 ? (
          <div className="card flex items-center gap-3 !p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink/[.06]"><ShieldCheck className="h-4 w-4 text-muted" aria-hidden /></span><p className="text-sm"><span className="font-semibold">All caught up.</span> <span className="text-muted">Nothing is waiting on you right now.</span></p></div>
        ) : (
          <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map(([k, n, text, tab]) => (
              <li key={k}>
                <button type="button" onClick={() => go(tab)} data-testid={`attn-${k}`} className="card card-hover flex w-full items-center gap-3 !p-3.5 text-left" style={{ borderLeft: "3px solid var(--accent)" }}>
                  <span className="stat shrink-0 text-2xl leading-none" style={{ color: "var(--accent)" }}>{n}</span>
                  <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{text(n).replace(/^\d+ /, "")}</span>
                  <span className="flex shrink-0 items-center text-xs text-muted">Review<ChevronRight className="h-3.5 w-3.5" aria-hidden /></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {GROUPS.map((g) => (
        <section key={g.title} aria-label={g.title} data-testid={`admin-group-${g.title.toLowerCase().replace(/\s+/g, "-")}`}>
          <h2 className="eyebrow mb-3">{g.title}</h2>
          <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-3">
            {g.items.map((it) => {
              const Icon = it.icon; const n = countFor(attn, it);
              return (
                <button key={it.key} type="button" onClick={() => go(it.key)} data-testid={`tool-${it.key}`} className="card card-hover group flex flex-col items-start gap-2.5 !p-3.5 text-left sm:flex-row sm:gap-3.5 sm:!p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink/[.06]"><Icon className="h-[18px] w-[18px]" strokeWidth={2.1} aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[15px] font-semibold leading-tight">{it.label}<Dot n={n} /></span>
                    <span className="mt-1 block text-xs leading-snug text-muted">{it.blurb}</span>
                  </span>
                  <ChevronRight className="mt-1 hidden h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 sm:block" aria-hidden />
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <section aria-label="At a glance" className="space-y-3" data-testid="admin-glance">
        <h2 className="eyebrow">At a glance</h2>
        <ImpactPanel onOpenReports={() => go("reports")} />
        <QuietCard />
      </section>
    </div>
  );
}

function Sidebar({ tab, attn, go }) {
  const link = (active) => cx("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors", active ? "bg-ink text-paper font-semibold" : "text-muted hover:bg-ink/5 hover:text-ink");
  return (
    <nav aria-label="Admin sections" className="hidden lg:block" data-testid="admin-sidebar">
      <div className="sticky top-32 space-y-5">
        <button type="button" onClick={() => go("overview")} className={link(tab === "overview")} data-testid="side-overview"><ShieldCheck className="h-4 w-4" aria-hidden />Overview</button>
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="eyebrow mb-1.5 px-3">{g.title}</p>
            <ul className="space-y-0.5">
              {g.items.map((it) => { const Icon = it.icon; const n = countFor(attn, it); return (
                <li key={it.key}><button type="button" onClick={() => go(it.key)} className={link(tab === it.key)} aria-current={tab === it.key ? "page" : undefined} data-testid={`side-${it.key}`}>
                  <Icon className="h-4 w-4 shrink-0" aria-hidden /><span className="min-w-0 flex-1 truncate">{it.label}</span><Dot n={n} /></button></li>
              ); })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

export default function Admin() {
  // The hub is the landing view; every tool opens from it (or from the sidebar). The section lives in the address
  // (/admin?tab=members) so it can be linked to and survives a refresh; older links that stash it in sessionStorage still work.
  const [sp, setSp] = useSearchParams();
  const [stash] = useState(() => { try { const t = sessionStorage.getItem("pathwai.admintab"); sessionStorage.removeItem("pathwai.admintab"); return t || ""; } catch { return ""; } });
  const asked = sp.get("tab") || stash || "overview";
  const tab = asked === "overview" || ITEMS.some((i) => i.key === asked) ? asked : "overview";
  const go = (t) => { setSp(t === "overview" ? {} : { tab: t }); window.scrollTo({ top: 0 }); };
  const [attn, setAttn] = useState(null);
  const loadAttn = useCallback(() => { api.get("/admin/action-center").then((r) => setAttn(r.data)).catch(() => setAttn((a) => a || {})); }, []);
  useEffect(() => { loadAttn(); }, [loadAttn, tab]);
  useLive(["members", "requests", "support", "admin"], loadAttn);
  const meta = ITEMS.find((i) => i.key === tab);
  const sub = tab === "reports" ? "Proof of what your community is doing, ready for the people who ask. Every number is counted from your own records." : meta?.blurb;
  return (
    <div data-testid="admin-page">
      <div className="no-print">
        {tab !== "overview" && <button type="button" onClick={() => go("overview")} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink lg:hidden" data-testid="admin-back"><ChevronLeft className="h-4 w-4" aria-hidden />All admin tools</button>}
        <PageHeader title={meta ? meta.label : "Admin"} subtitle={meta ? sub : "Everything you run the community with, in one place."} />
      </div>
      <div className="lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-10">
        <Sidebar tab={tab} attn={attn} go={go} />
        <div className="min-w-0">
          {tab === "overview" && <Hub attn={attn} go={go} />}
          {tab === "reports" && <Reports embedded />}
          {tab === "audits" && <Audits go={go} />}
          {tab === "members" && <MembershipRequests />}{tab === "requests" && <AdminRequests />}{tab === "moderation" && <Moderation />}{tab === "support" && <SupportQueue />}
          {tab === "brand" && <Branding />}{tab === "integrations" && <Integrations go={go} />}{tab === "import" && <ImportData />}{tab === "config" && <Config />}{tab === "invites" && <Invites />}{tab === "audit" && <AuditLog />}
        </div>
      </div>
    </div>
  );
}
