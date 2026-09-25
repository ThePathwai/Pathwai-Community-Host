import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errMsg, fmtDate } from "../lib/api";
import { Avatar, Button, Card, Chip, Empty, Modal, Spinner, Textarea } from "../components/ui";

const FILTERS = [["pending", "Pending"], ["approved", "Approved"], ["rejected", "Declined"]];

export default function MembershipRequests({ onChanged }) {
  const [status, setStatus] = useState("pending");
  const [d, setD] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [declining, setDeclining] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);
  const [previewing, setPreviewing] = useState(null); // the request whose full profile is open in the preview modal
  const load = useCallback(() => api.get("/admin/membership-requests", { params: { status } }).then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e))), [status]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/community/config").then((r) => setCfg(r.data)); }, []);

  const decide = async (id, decision) => {
    setBusy(id);
    try {
      await api.post(`/admin/membership-requests/${id}/decision`, { decision, note: decision === "reject" ? note : undefined });
      toast.success(decision === "approve" ? "Member approved" : "Request declined");
      setDeclining(null); setNote(""); await load(); onChanged?.();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  };
  const toggle = async (v) => { try { const { data } = await api.patch("/community/config", { require_approval: v }); setCfg(data); toast.success(v ? "New members now need approval" : "New members join automatically"); } catch (e) { toast.error(errMsg(e)); } };

  return (
    <div className="space-y-5" data-testid="membership-requests">
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div><p className="font-medium">Approve new members</p><p className="text-sm text-muted">When on, people who sign up wait for your approval before they can sign in or appear in the directory.</p></div>
        {cfg && <button role="switch" aria-checked={cfg.require_approval !== false} onClick={() => toggle(cfg.require_approval === false)} data-testid="require-approval"
          className="relative h-7 w-12 shrink-0 rounded-full transition" style={{ background: cfg.require_approval !== false ? "var(--accent)" : "rgb(var(--c-ink) / 0.2)" }}>
          <span className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all" style={{ left: cfg.require_approval !== false ? "1.35rem" : "0.15rem" }} /></button>}
      </Card>

      <div className="inline-flex rounded-full bg-ink/5 p-1">
        {FILTERS.map(([v, l]) => (
          <button key={v} onClick={() => { setStatus(v); setD(null); }} data-testid={`mr-${v}`} className={"rounded-full px-4 py-1.5 text-sm " + (status === v ? "bg-surface font-medium shadow-sm" : "text-muted")}>
            {l}{d?.counts ? ` · ${d.counts[v]}` : ""}</button>))}
      </div>

      {!d ? <Spinner /> : d.requests.length === 0 ? <Empty title={status === "pending" ? "No requests waiting" : "Nothing here yet"} hint={status === "pending" ? "New sign-ups will show up here for your review." : undefined} /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {d.requests.map((r) => (
            <Card key={r.id} data-testid="membership-request" className="flex flex-col gap-4">
              <div className="flex items-start gap-4">
                <Avatar src={r.avatar_url} name={r.name} size={56} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="text-lg font-semibold">{r.name}</p>{status !== "pending" && <Chip accent={r.status === "approved"}>{r.status === "approved" ? "Approved" : "Declined"}</Chip>}</div>
                  <p className="text-sm text-muted">{[r.title, r.company].filter(Boolean).join(" · ") || "No profession given"}</p>
                  <p className="text-xs text-muted">{r.email} · requested {fmtDate(r.requested_at)}</p>
                </div>
              </div>
              {r.join_reason && <div className="rounded-2xl bg-ink/5 p-4"><p className="eyebrow mb-1">Why they want to join</p><p className="text-sm">{r.join_reason}</p></div>}
              {(r.skill_set || []).length > 0 && <div className="flex flex-wrap gap-1.5">{r.skill_set.slice(0, 5).map((t) => <Chip key={t}>{t}</Chip>)}</div>}
              {r.status !== "pending" && r.decided_at && <p className="text-xs text-muted">{r.status === "approved" ? "Approved" : "Declined"} by {r.decided_by_name || "an admin"} on {fmtDate(r.decided_at)}{r.note ? ` · ${r.note}` : ""}</p>}
              {declining === r.id && <div className="space-y-2"><Textarea rows={2} placeholder="Optional note for your records" value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="flex gap-2"><Button variant="ghost" onClick={() => { setDeclining(null); setNote(""); }}>Cancel</Button><Button onClick={() => decide(r.id, "reject")} loading={busy === r.id} data-testid="confirm-decline">Confirm decline</Button></div></div>}
              {declining !== r.id && (
                <div className="mt-auto flex gap-2">
                  <Button variant="ghost" onClick={() => setPreviewing(r)} data-testid="preview-member">Preview profile</Button>
                  {r.status !== "approved" && <Button onClick={() => decide(r.id, "approve")} loading={busy === r.id} data-testid="approve-member">Approve</Button>}
                  {r.status !== "rejected" && <Button variant="ghost" onClick={() => setDeclining(r.id)} data-testid="decline-member">Decline</Button>}
                </div>)}
            </Card>))}
        </div>)}

      <Modal open={!!previewing} onClose={() => setPreviewing(null)} title="Applicant profile">
        {previewing && (
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <Avatar src={previewing.avatar_url} name={previewing.name} size={72} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xl font-semibold">{previewing.name}</p>
                  {previewing.status !== "pending" && <Chip accent={previewing.status === "approved"}>{previewing.status === "approved" ? "Approved" : "Declined"}</Chip>}
                </div>
                <p className="text-sm text-muted">{[previewing.title, previewing.company].filter(Boolean).join(" · ") || "No profession given"}</p>
                <p className="text-sm text-muted">{[previewing.location, previewing.age ? `${previewing.age} years old` : null].filter(Boolean).join(" · ")}</p>
                <p className="mt-1 text-xs text-muted">{previewing.email} · requested {fmtDate(previewing.requested_at)}</p>
              </div>
            </div>
            {(previewing.linkedin || previewing.phone || previewing.instagram || previewing.website) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {previewing.linkedin && <a className="underline" href={previewing.linkedin} target="_blank" rel="noreferrer">LinkedIn →</a>}
                {previewing.website && <a className="underline" href={previewing.website} target="_blank" rel="noreferrer">Website →</a>}
                {previewing.instagram && <span className="text-muted">Instagram: {previewing.instagram}</span>}
                {previewing.phone && <span className="text-muted">{previewing.phone}</span>}
              </div>)}
            {previewing.bio && <div><p className="eyebrow mb-1">About</p><p className="whitespace-pre-wrap text-sm">{previewing.bio}</p></div>}
            {previewing.join_reason && <div className="rounded-2xl bg-ink/5 p-4"><p className="eyebrow mb-1">Why they want to join</p><p className="whitespace-pre-wrap text-sm">{previewing.join_reason}</p></div>}
            {[["Skills", previewing.skill_set], ["Interests", previewing.interests_hobbies], ["Goals", previewing.goals], ["Support needed", previewing.support_needs]]
              .filter(([, v]) => (v || []).length > 0)
              .map(([label, tags]) => (
                <div key={label}><p className="eyebrow mb-1.5">{label}</p><div className="flex flex-wrap gap-1.5">{tags.map((t) => <Chip key={t}>{t}</Chip>)}</div></div>))}
            {previewing.status !== "pending" && previewing.decided_at && (
              <p className="text-xs text-muted">{previewing.status === "approved" ? "Approved" : "Declined"} by {previewing.decided_by_name || "an admin"} on {fmtDate(previewing.decided_at)}{previewing.note ? ` · ${previewing.note}` : ""}</p>)}
            <div className="flex gap-2 border-t border-line pt-4">
              {previewing.status !== "approved" && <Button onClick={() => { const id = previewing.id; setPreviewing(null); decide(id, "approve"); }} loading={busy === previewing.id} data-testid="approve-member-preview">Approve</Button>}
              {previewing.status !== "rejected" && <Button variant="ghost" onClick={() => { setDeclining(previewing.id); setPreviewing(null); }} data-testid="decline-member-preview">Decline</Button>}
            </div>
          </div>)}
      </Modal>
    </div>
  );
}
