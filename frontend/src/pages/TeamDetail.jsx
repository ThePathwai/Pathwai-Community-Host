import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { useLive } from "../lib/live";
import { useAuth } from "../lib/auth";
import { Avatar, Button, Card, Chip, Field, Input, Modal, Select, Spinner, TagInput, Textarea } from "../components/ui";

export default function TeamDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [t, setT] = useState(null);
  const [people, setPeople] = useState([]);
  const [edit, setEdit] = useState(null);
  const [adding, setAdding] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const load = useCallback(() => api.get(`/teams/${id}`).then((r) => setT(r.data)).catch((e) => { toast.error(errMsg(e)); nav("/teams", { replace: true }); }), [id, nav]);
  useEffect(() => { load(); }, [load]);
  useLive(null, load);
  useEffect(() => { if (t?.can_manage) api.get("/users").then((r) => setPeople(r.data || [])).catch(() => {}); }, [t?.can_manage]);
  if (!t) return <Spinner />;
  const act = async (fn, ok) => { try { const r = await fn(); if (r?.data?.deleted) { nav("/teams"); return; } setT(r?.data?.id ? r.data : t); if (ok) toast.success(ok); } catch (e) { toast.error(errMsg(e)); } };
  const mine = new Set((user?.skill_set || []).map((s) => s.toLowerCase()));
  const fits = (t.looking_for || []).filter((s) => mine.has(s.toLowerCase()));
  const addable = people.filter((p) => !(t.members || []).some((m) => m.id === p.id));
  const save = async (e) => { e.preventDefault(); await act(() => api.patch(`/teams/${id}`, edit), "Saved"); setEdit(null); };
  return (
    <div data-testid="team-detail">
      <Link to="/teams" className="text-sm text-muted hover:text-ink">← Back to teams</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold sm:text-3xl" data-testid="team-title">{t.name}</h1>{t.status === "done" && <Chip>Finished</Chip>}</div>
          {t.lead && <p className="mt-1 text-sm text-muted">Led by <Link className="underline" to={`/members/${t.lead.id}`}>{t.lead.name}</Link></p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {t.is_member
            ? <Button variant="ghost" onClick={() => act(() => api.post(`/teams/${id}/leave`), "You left the team")} data-testid="team-leave">Leave team</Button>
            : <Button onClick={() => act(() => api.post(`/teams/${id}/join`), "You're on the team")} disabled={t.status === "done"} data-testid="team-join">Join team</Button>}
          {t.can_manage && <Button variant="ghost" onClick={() => setEdit({ name: t.name, description: t.description || "", looking_for: t.looking_for || [], status: t.status })} data-testid="team-edit">Edit</Button>}
        </div>
      </div>

      {fits.length > 0 && !t.is_member && (
        <div className="mt-4 rounded-xl border border-line bg-ink/[.04] p-3 text-sm" data-testid="team-fit">Your skills fit: <b>{fits.join(", ")}</b>. This team could use you.</div>)}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="space-y-4 lg:col-span-2">
          <div><p className="eyebrow">About this team</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{t.description || "No description yet."}</p></div>
          <div><p className="eyebrow">Skills it's looking for</p>
            <div className="mt-2 flex flex-wrap gap-1.5">{(t.looking_for || []).length ? t.looking_for.map((s) => <Chip key={s} accent={mine.has(s.toLowerCase())}>{s}</Chip>) : <span className="text-sm text-muted">Nothing listed.</span>}</div></div>
        </Card>
        <Card>
          <p className="eyebrow">{t.member_count} {t.member_count === 1 ? "person" : "people"}</p>
          <ul className="mt-3 space-y-3" data-testid="team-members">
            {(t.members || []).map((m) => (
              <li key={m.id} className="flex items-center gap-3">
                <Avatar src={m.avatar_url} name={m.name} size={36} />
                <div className="min-w-0 flex-1">
                  <Link to={`/members/${m.id}`} className="block truncate text-sm font-medium hover:underline">{m.name}{m.id === t.lead?.id && <span className="ml-1.5 text-xs text-muted">lead</span>}</Link>
                  <span className="block truncate text-xs text-muted">{(m.skill_set || []).slice(0, 3).join(" · ") || m.title}</span>
                </div>
                {t.can_manage && m.id !== t.lead?.id && <button type="button" className="text-xs text-muted hover:text-red-600" onClick={() => act(() => api.delete(`/teams/${id}/members/${m.id}`), "Removed")} aria-label={`Remove ${m.name}`}>Remove</button>}
              </li>))}
          </ul>
          {t.can_manage && addable.length > 0 && (
            <div className="mt-4 flex gap-2" data-testid="team-add">
              <Select value={adding} onChange={(e) => setAdding(e.target.value)} options={[{ value: "", label: "Add someone…" }, ...addable.map((p) => ({ value: p.id, label: p.name }))]} />
              <Button variant="ghost" disabled={!adding} onClick={() => { act(() => api.post(`/teams/${id}/members`, { user_id: adding }), "Added"); setAdding(""); }}>Add</Button>
            </div>)}
        </Card>
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title="Edit team">
        {edit && (
          <form onSubmit={save} className="space-y-4">
            <Field label="Team name"><Input value={edit.name} maxLength={80} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required /></Field>
            <Field label="What is it for?"><Textarea rows={4} value={edit.description} maxLength={1500} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Skills you're looking for"><TagInput value={edit.looking_for} onChange={(looking_for) => setEdit({ ...edit, looking_for })} /></Field>
            <Field label="Status"><Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })} options={[{ value: "active", label: "Active: open to new people" }, { value: "done", label: "Finished" }]} /></Field>
            <div className="flex items-center justify-between gap-2">
              {confirmDel
                ? <span className="flex items-center gap-1"><Button variant="ghost" type="button" className="!text-red-600" onClick={() => act(() => api.delete(`/teams/${id}`).then(() => ({ data: { deleted: true } })))} data-testid="team-delete-confirm">Delete team?</Button><Button variant="ghost" type="button" onClick={() => setConfirmDel(false)}>Keep</Button></span>
                : <Button variant="ghost" type="button" className="!text-red-600" onClick={() => setConfirmDel(true)} data-testid="team-delete">Delete team</Button>}
              <div className="flex gap-2"><Button variant="ghost" type="button" onClick={() => setEdit(null)}>Cancel</Button><Button type="submit">Save</Button></div>
            </div>
          </form>)}
      </Modal>
    </div>
  );
}
