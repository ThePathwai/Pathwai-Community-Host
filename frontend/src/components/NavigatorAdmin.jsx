import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Compass, ExternalLink, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { Button, Card, Field, Input, Select, Spinner, Textarea, cx } from "./ui";
import { AUDIENCES, AUDIENCE_LABEL, NEEDS, NEED_LABEL, SECTORS, STAGES, STAGE_LABEL, STATUSES, STATUS_LABEL, TYPES, TYPE_LABEL } from "../lib/navigator";

// Admin -> Programs. A community feeds the Navigator two ways: its profile (who it serves and what it offers, which is how
// someone is pointed here before they join) and the programs it runs. Both are optional, and nothing is public until
// the admin switches it on. Backend: routes/navigator.py.

function Pick({ options, value, onChange, label, testId }) {
  const toggle = (k) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  return (
    <div>
      <p className="label">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map(([k, l]) => {
          const on = value.includes(k);
          return <button key={k} type="button" onClick={() => toggle(k)} aria-pressed={on} data-testid={`${testId}-${k}`}
            className={cx("rounded-full border px-3 py-1 text-sm transition", on ? "border-transparent font-semibold" : "border-line text-muted hover:text-ink")}
            style={on ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>{l}</button>;
        })}
      </div>
    </div>
  );
}

const BLANK = { name: "", type: "mentorship", summary: "", amount: "", stages: [], needs: [], audiences: [], status: "open", deadline_date: "", apply_url: "" };

function ProgramForm({ initial, onSaved, onCancel }) {
  const [f, setF] = useState({ ...BLANK, ...initial, deadline_date: initial?.deadline?.date || "" });
  const [busy, setBusy] = useState(false);
  const set = (p) => setF((o) => ({ ...o, ...p }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const body = { ...f, deadline_kind: f.deadline_date ? "fixed" : "rolling" };
      const r = initial?.id ? await api.patch(`/navigator/admin/programs/${initial.id}`, body) : await api.post("/navigator/admin/programs", body);
      toast.success(initial?.id ? "Program updated" : "Program added");
      onSaved(r.data);
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-surface p-4" data-testid="nav-program-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Founder office hours" required maxLength={120} data-testid="np-name" /></Field>
        <Field label="Kind"><Select value={f.type} onChange={(e) => set({ type: e.target.value })} options={TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))} data-testid="np-type" /></Field>
      </div>
      <Field label="One line about it"><Textarea rows={2} value={f.summary} onChange={(e) => set({ summary: e.target.value })} maxLength={240} placeholder="Weekly 1:1 time with a mentor who has built a company." data-testid="np-summary" /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Amount (optional)"><Input value={f.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="Free, or $5,000" maxLength={160} /></Field>
        <Field label="Status"><Select value={f.status} onChange={(e) => set({ status: e.target.value })} options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} /></Field>
        <Field label="Deadline (optional)"><Input type="date" value={f.deadline_date} onChange={(e) => set({ deadline_date: e.target.value })} data-testid="np-deadline" /></Field>
      </div>
      <Pick label="Who is it for, by stage?" options={STAGES.map((s) => [s, STAGE_LABEL[s]])} value={f.stages} onChange={(v) => set({ stages: v })} testId="np-stage" />
      <Pick label="What does it give people?" options={NEEDS.map((n) => [n, NEED_LABEL[n]])} value={f.needs} onChange={(v) => set({ needs: v })} testId="np-need" />
      <Pick label="Made for a group? (optional)" options={AUDIENCES.map((a) => [a, AUDIENCE_LABEL[a]])} value={f.audiences} onChange={(v) => set({ audiences: v })} testId="np-aud" />
      <Field label="Link to apply or learn more" hint="Leave blank to point people to your community page."><Input value={f.apply_url} onChange={(e) => set({ apply_url: e.target.value })} placeholder="https://" maxLength={300} data-testid="np-url" /></Field>
      <div className="flex gap-2"><Button type="submit" loading={busy} data-testid="np-save">{initial?.id ? "Save changes" : "Add program"}</Button><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}

export default function NavigatorAdmin() {
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(null); // null | {} (new) | program
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => api.get("/navigator/admin").then((r) => { setData(r.data); setProfile(r.data.profile); }).catch((e) => toast.error(errMsg(e, "Could not load."))), []);
  useEffect(() => { load(); }, [load]);
  if (!data || !profile) return <Spinner />;
  const set = (p) => setProfile((o) => ({ ...o, ...p }));
  const saveProfile = async () => {
    setSaving(true);
    try { const r = await api.put("/navigator/admin/profile", profile); setProfile(r.data); toast.success(r.data.public ? "Your community is in the Navigator" : "Your community is hidden from the Navigator"); }
    catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  };
  const remove = async (p) => { try { await api.delete(`/navigator/admin/programs/${p.id}`); toast.success("Removed"); load(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="space-y-6" data-testid="nav-admin">
      <Card className="!p-5">
        <div className="flex flex-wrap items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><Compass className="h-5 w-5" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold" style={{ textTransform: "none", letterSpacing: 0 }}>Show up in the Navigator</h2>
            <p className="mt-1 text-sm text-muted">Founders who use the Navigator get pointed to communities that fit them, before they join anything. Tell it who you serve.</p>
          </div>
          <button type="button" role="switch" aria-checked={!!profile.public} onClick={() => set({ public: !profile.public })} data-testid="nav-public"
            className={cx("relative h-7 w-12 shrink-0 rounded-full transition", profile.public ? "" : "bg-ink/20")} style={profile.public ? { background: "var(--accent)" } : undefined}>
            <span className={cx("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all", profile.public ? "left-[22px]" : "left-0.5")} />
            <span className="sr-only">{profile.public ? "Visible in the Navigator" : "Hidden from the Navigator"}</span>
          </button>
        </div>
        <div className={cx("mt-5 space-y-4", !profile.public && "opacity-60")}>
          <Pick label="Stages your members are at" options={STAGES.map((s) => [s, STAGE_LABEL[s]])} value={profile.stages || []} onChange={(v) => set({ stages: v })} testId="np-pstage" />
          <Pick label="What you give founders" options={NEEDS.map((n) => [n, NEED_LABEL[n]])} value={profile.provides || []} onChange={(v) => set({ provides: v })} testId="np-pprov" />
          <Pick label="Groups you are built for (optional)" options={AUDIENCES.map((a) => [a, AUDIENCE_LABEL[a]])} value={profile.audiences || []} onChange={(v) => set({ audiences: v })} testId="np-paud" />
          <Pick label="Sectors" options={SECTORS.map((s) => [s, s])} value={profile.sectors || []} onChange={(v) => set({ sectors: v })} testId="np-psec" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="City"><Input value={profile.city || ""} onChange={(e) => set({ city: e.target.value })} maxLength={80} placeholder="Toronto" /></Field>
            <Field label="One line for founders"><Input value={profile.blurb || ""} onChange={(e) => set({ blurb: e.target.value })} maxLength={300} placeholder="Where student founders meet capital and mentors." data-testid="np-blurb" /></Field>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={saveProfile} loading={saving} data-testid="np-save-profile">Save</Button>
          <Link to="/navigator" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">See it in the Navigator <ExternalLink className="h-4 w-4" aria-hidden /></Link>
        </div>
      </Card>

      {data.member_needs.length > 0 && (
        <Card className="!p-5" data-testid="nav-member-needs">
          <p className="eyebrow flex items-center gap-2"><Users className="h-4 w-4" aria-hidden />What your members asked for</p>
          <div className="mt-3 flex flex-wrap gap-2">{data.member_needs.map((n) => <span key={n.key} className="chip !px-3 !py-1 !text-sm">{n.label}<span className="ml-2 font-bold">{n.members}</span></span>)}</div>
          <p className="mt-3 text-xs text-muted">Counted from member profiles. Programs you list that give these get shown first to founders who ask for them.</p>
        </Card>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold" style={{ textTransform: "none", letterSpacing: 0 }}>Programs you run <span className="text-sm font-normal text-muted">({data.programs.length}/{data.limit})</span></h2>
          {!editing && <Button onClick={() => setEditing({})} data-testid="np-add"><Plus className="h-4 w-4" />Add a program</Button>}
        </div>
        {editing && <div className="mb-4"><ProgramForm initial={editing.id ? editing : undefined} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} /></div>}
        {data.programs.length === 0 && !editing && <p className="rounded-2xl border border-dashed border-line p-8 text-center text-muted">No programs yet. Add pitch days, office hours or anything else you run.</p>}
        <ul className="space-y-3">
          {data.programs.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4" data-testid={`np-row-${p.id}`}>
              <div className="min-w-0 flex-1"><p className="font-semibold">{p.name}</p><p className="text-sm text-muted">{TYPE_LABEL[p.type]} · {STATUS_LABEL[p.status]}{p.deadline?.date ? ` · by ${p.deadline.date}` : ""}</p></div>
              <button type="button" className="btn-ghost !px-3 !py-1.5 text-sm" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}><Pencil className="h-4 w-4" /></button>
              <button type="button" className="btn-ghost !px-3 !py-1.5 text-sm" onClick={() => remove(p)} aria-label={`Remove ${p.name}`} data-testid={`np-del-${p.id}`}><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
