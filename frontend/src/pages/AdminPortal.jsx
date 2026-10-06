import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { api, errMsg, fmtDate, timeAgo } from "../lib/api";
import { useLive } from "../lib/live";
import { Avatar, Button, Card, Chip, cx, Empty, Field, Input, Select, Spinner, StatusBadge, Textarea } from "../components/ui";

// Search-and-pick list of members, for requests aimed at specific people rather than a whole
// community or role. Kept local to AdminRequests — nothing else needs a bare member picker yet.
function MemberPicker({ selected, onChange }) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState([]);
  useEffect(() => {
    const t = setTimeout(() => { api.get("/users", { params: { q: q || undefined } }).then((r) => setOpts(r.data)).catch(() => {}); }, 200);
    return () => clearTimeout(t);
  }, [q]);
  const toggle = (u) => onChange(selected.some((s) => s.id === u.id) ? selected.filter((s) => s.id !== u.id) : [...selected, u]);
  return (
    <div>
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5" data-testid="req-member-selected">
          {selected.map((u) => (
            <span key={u.id} className="chip">{u.name}<button type="button" className="ml-1.5 text-muted hover:text-ink" onClick={() => onChange(selected.filter((s) => s.id !== u.id))} aria-label={`Remove ${u.name}`}>×</button></span>
          ))}
        </div>
      )}
      <Input placeholder="Search members by name, role, company…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="req-member-search" />
      {q.trim() && (
        <div className="mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-line" data-testid="req-member-results">
          {opts.length === 0 ? <p className="p-3 text-sm text-muted">No matches.</p> : opts.slice(0, 8).map((u) => {
            const on = selected.some((s) => s.id === u.id);
            return (
              <button type="button" key={u.id} onClick={() => toggle(u)} className={cx("flex w-full items-center gap-2.5 border-b border-line px-3 py-2 text-left text-sm last:border-b-0 hover:bg-ink/5", on && "bg-ink/[.06]")}>
                <Avatar src={u.avatar_url} name={u.name} size={28} />
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{u.name}</span>{u.title && <span className="block truncate text-xs text-muted">{u.title}</span>}</span>
                {on && <Check className="h-4 w-4 shrink-0 text-muted" strokeWidth={2.5} aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AdminRequests() {
  const [d, setD] = useState(null);
  const [status, setStatus] = useState("all");
  const [kinds, setKinds] = useState({ kinds: [], providers: [] });
  const [f, setF] = useState({ audience: "all_members", kind: "availability", title: "", reason: "", due_date: "", external_url: "", external_provider: "Google Form" });
  const [members, setMembers] = useState([]);
  const load = useCallback(() => api.get("/admin/member-requests", { params: { status } }).then((r) => setD(r.data)), [status]);
  useEffect(() => { load(); }, [load]);
  useLive(["requests", "admin"], load);
  useEffect(() => { api.get("/member-requests/kinds").then((r) => setKinds(r.data)); }, []);
  const isWaiver = f.kind === "waiver";
  const create = async () => {
    if (f.audience === "individual" && members.length === 0) return toast.error("Choose at least one member.");
    const body = { kind: f.kind, title: f.title || undefined, reason: f.reason || undefined, due_date: f.due_date || null, external_url: f.external_url || null, external_provider: f.external_url ? f.external_provider : null };
    if (f.audience === "all_members") body.all_members = true;
    else if (f.audience === "individual") body.user_ids = members.map((m) => m.id);
    else body.member_type = f.audience;
    try {
      const { data } = await api.post("/admin/member-requests", body);
      toast.success(`Sent to ${data.created} member${data.created === 1 ? "" : "s"}`);
      setF({ ...f, title: "", reason: "" }); setMembers([]); load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const review = async (id, st) => { try { await api.post(`/admin/member-requests/${id}/review`, { status: st }); toast.success(st === "in_progress" ? "Sent back to the member" : "Updated"); load(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <p className="eyebrow">New request</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Send to"><Select data-testid="req-audience" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })} options={[{ value: "all_members", label: "Everyone" }, { value: "individual", label: "Specific members" }, { value: "founder", label: "Founders" }, { value: "mentor", label: "Mentors" }, { value: "alumni", label: "Alumni" }, { value: "partner", label: "Partners" }]} /></Field>
          <Field label="Type"><Select data-testid="req-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={kinds.kinds.map((k) => ({ value: k.kind, label: k.label }))} /></Field>
          <Field label="Due date"><Input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
        </div>
        {f.audience === "individual" && <Field label="Choose members"><MemberPicker selected={members} onChange={setMembers} /></Field>}
        <Field label="Title (optional)" hint={isWaiver ? "e.g. “2026 Liability Waiver”" : undefined}><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Why you're asking"><Textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Field label={isWaiver ? "Link to the document (optional)" : "External form link (optional)"} hint={isWaiver ? "A Google Doc, DocuSign envelope or hosted PDF members can open and review — we track who's clicked through and confirmed" : "Airtable, Google Form, Jotform, Typeform — we track completion"}>
            <Input type="url" value={f.external_url} onChange={(e) => setF({ ...f, external_url: e.target.value })} placeholder={isWaiver ? "https://…" : undefined} />
          </Field>
          <Field label="Provider"><Select value={f.external_provider} onChange={(e) => setF({ ...f, external_provider: e.target.value })} options={kinds.providers} /></Field>
        </div>
        <Button onClick={create} data-testid="send-request" disabled={f.audience === "individual" && members.length === 0}>Send request</Button>
      </Card>
      <div className="flex flex-wrap items-center gap-3"><Select className="max-w-[12rem]" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: "all", label: "All statuses" }, "not_started", "in_progress", "submitted", "overdue", "reviewed", "resolved"]} />
        {d && Object.entries(d.counts).map(([k, v]) => <Chip key={k}>{k.replace(/_/g, " ")} · {v}</Chip>)}</div>
      {!d ? <Spinner /> : d.requests.length === 0 ? <Empty title="No requests" /> : (
        <div className="space-y-2">{d.requests.map((r) => (
          <Card key={r.id} data-testid="admin-request">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="font-medium">{r.title}</p><p className="text-xs text-muted">{r.member?.name} · {r.kind_label}{r.due_date ? ` · due ${r.due_date}` : ""}{r.submitted_at ? ` · submitted ${timeAgo(r.submitted_at)}` : ""}</p></div>
              <StatusBadge status={r.effective_status} />
            </div>
            {r.response && <div className="mt-3 rounded-lg border border-line bg-ink/5 p-3 text-sm">{Object.entries(r.response).map(([k, v]) => <p key={k}><span className="text-muted">{k.replace(/_/g, " ")}: </span>{Array.isArray(v) ? v.join(", ") : String(v)}</p>)}{r.applied_fields?.length > 0 && <p className="mt-2 text-xs text-muted">Updated on profile: {r.applied_fields.join(", ")}</p>}</div>}
            {r.effective_status === "submitted" && <div className="mt-3 flex gap-2"><Button className="!py-1" onClick={() => review(r.id, "reviewed")}>Mark reviewed</Button><Button className="!py-1" variant="ghost" onClick={() => review(r.id, "resolved")}>Resolve</Button><Button className="!py-1" variant="ghost" onClick={() => review(r.id, "in_progress")}>Ask for changes</Button></div>}
          </Card>))}</div>)}
    </div>
  );
}

export function Moderation() {
  const [items, setItems] = useState(null);
  const [note, setNote] = useState({});
  const load = useCallback(() => api.get("/admin/moderation").then((r) => setItems(r.data.items)), []);
  useEffect(() => { load(); }, [load]);
  useLive(["admin"], load);
  const decide = async (it, decision) => { try { await api.post(`/admin/moderation/${it.kind}/${it.id}`, { decision, note: note[it.id] || null }); toast.success(decision === "approve" ? "Approved and published" : decision === "reject" ? "Rejected" : "Changes requested"); load(); } catch (e) { toast.error(errMsg(e)); } };
  if (!items) return <Spinner />;
  if (items.length === 0) return <Empty title="Nothing waiting for approval" hint="Member-submitted events, resources and updates will appear here." />;
  return <div className="space-y-3">{items.map((it) => (
    <Card key={it.id} data-testid="moderation-item">
      <div className="flex flex-wrap items-center gap-2"><Chip>{it.kind}</Chip><span className="eyebrow">from {it.submitted_by_name || "a member"}</span>{it.starts_at && <span className="eyebrow">{fmtDate(it.starts_at)}</span>}</div>
      <p className="mt-2 font-medium">{it.title}</p><p className="mt-1 text-sm text-muted">{it.summary}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2"><Input className="max-w-xs" placeholder="Note to the member (optional)" value={note[it.id] || ""} onChange={(e) => setNote({ ...note, [it.id]: e.target.value })} />
        <Button className="!py-1.5" onClick={() => decide(it, "approve")} data-testid="approve">Approve</Button><Button className="!py-1.5" variant="ghost" onClick={() => decide(it, "changes")}>Request changes</Button><Button className="!py-1.5" variant="ghost" onClick={() => decide(it, "reject")}>Reject</Button></div>
    </Card>))}</div>;
}

export function SupportQueue() {
  const [d, setD] = useState(null);
  const [resp, setResp] = useState({});
  const load = useCallback(() => api.get("/admin/team-support").then((r) => setD(r.data)), []);
  useEffect(() => { load(); }, [load]);
  useLive(["support", "admin"], load);
  const update = async (id, body) => { try { await api.post(`/admin/team-support/${id}`, body); toast.success("Member notified"); setResp({ ...resp, [id]: "" }); load(); } catch (e) { toast.error(errMsg(e)); } };
  if (!d) return <Spinner />;
  if (d.requests.length === 0) return <Empty title="No support requests" />;
  const STAT = ["submitted", "in_review", "assigned", "in_progress", "waiting_on_member", "resolved", "closed"];
  return <div className="space-y-3">{d.requests.map((r) => (
    <Card key={r.id} data-testid="support-item">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{r.title}</p><p className="text-xs text-muted">{r.user_snapshot?.name} · {r.category_label} · {r.urgency}{r.deadline ? ` · needed by ${r.deadline}` : ""}</p></div><StatusBadge status={r.status} /></div>
      {r.description && <p className="mt-2 text-sm text-ink/80">{r.description}</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
        <Select value={r.status} onChange={(e) => update(r.id, { status: e.target.value })} options={STAT.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))} />
        <Select value={r.assignee_id || ""} onChange={(e) => e.target.value && update(r.id, { assignee_id: e.target.value })} options={[{ value: "", label: "Assign to…" }, ...d.admins.map((a) => ({ value: a.id, label: a.name }))]} />
        <Input placeholder="Reply to the member" value={resp[r.id] || ""} onChange={(e) => setResp({ ...resp, [r.id]: e.target.value })} />
        <Button variant="ghost" disabled={!(resp[r.id] || "").trim()} onClick={() => update(r.id, { response: resp[r.id] })}>Send</Button>
      </div>
    </Card>))}</div>;
}
