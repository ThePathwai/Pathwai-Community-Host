import React, { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { useLive } from "../lib/live";
import { Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge, Tabs, TagInput, Textarea } from "../components/ui";

function FieldInput({ f, value, onChange }) {
  if (f.type === "longtext") return <Textarea placeholder={f.placeholder} value={value || ""} onChange={(e) => onChange(e.target.value)} />;
  if (f.type === "tags") return <TagInput value={Array.isArray(value) ? value : []} onChange={onChange} />;
  if (f.type === "select") return <Select value={value || ""} onChange={(e) => onChange(e.target.value)} options={[{ value: "", label: "Choose…" }, ...(f.options || [])]} />;
  return <Input type={f.type === "url" ? "url" : "text"} placeholder={f.placeholder} value={value || ""} onChange={(e) => onChange(e.target.value)} />;
}

function RequestModal({ id, onClose, onChanged }) {
  const [r, setR] = useState(null);
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get(`/member-requests/${id}`).then((x) => { setR(x.data); setVals(x.data.draft || x.data.response || {}); onChanged(); }).catch((e) => { toast.error("This request is not available."); onClose(); }); }, [id]); // eslint-disable-line
  if (!r) return <Modal open onClose={onClose} title="Request"><Spinner /></Modal>;
  const closed = ["reviewed", "resolved"].includes(r.status);
  const done = r.status === "submitted" || closed;
  const submit = async () => { setBusy(true); try { await api.post(`/member-requests/${id}/submit`, { response: vals }); toast.success("Sent — your profile and the team's records are updated"); onChanged(); onClose(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } };
  const draft = async () => { try { await api.post(`/member-requests/${id}/save`, { response: vals }); toast.success("Draft saved"); } catch (e) { toast.error(errMsg(e)); } };
  const openExt = async () => { await api.post(`/member-requests/${id}/external-open`); window.open(r.external_url, "_blank", "noopener"); onChanged(); };
  const confirmExt = async () => { try { await api.post(`/member-requests/${id}/external-complete`); toast.success("Thanks — marked as complete"); onChanged(); onClose(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Modal open onClose={onClose} title={r.title}>
      <div className="mb-4 flex flex-wrap items-center gap-2"><StatusBadge status={r.effective_status} />{r.due_date && <span className="eyebrow">Due {r.due_date}</span>}<span className="eyebrow">{r.kind_label}</span></div>
      {r.reason && <p className="mb-4 rounded-lg border border-line bg-ink/5 p-3 text-sm"><span className="eyebrow mr-2">Why we're asking</span>{r.reason}</p>}
      {r.review_note && <p className="mb-4 text-sm text-muted">Team note: {r.review_note}</p>}
      {r.external_url ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">This one is a {r.external_provider || "external"} form. Open it, fill it in, then come back and confirm.</p>
          <div className="flex flex-wrap gap-2"><Button onClick={openExt} variant="ghost"><ExternalLink className="h-4 w-4" />Open the form</Button>
            {!done && <Button onClick={confirmExt} data-testid="external-complete">I've completed it</Button>}</div>
        </div>
      ) : (
        <div className="space-y-4">
          {(r.fields || []).map((f) => <Field key={f.key} label={f.label + (f.required ? " *" : "")}><FieldInput f={f} value={vals[f.key]} onChange={(v) => setVals({ ...vals, [f.key]: v })} /></Field>)}
          {closed ? <p className="text-sm text-muted">This request is closed. Thanks!</p> : (
            <div className="flex gap-2"><Button onClick={submit} loading={busy} data-testid="request-submit">{done ? "Send an update" : "Submit"}</Button><Button variant="ghost" onClick={draft}>Save draft</Button></div>)}
        </div>
      )}
    </Modal>
  );
}

export default function Requests() {
  const [tab, setTab] = useState("open");
  const [d, setD] = useState(null);
  const [openId, setOpenId] = useState(null);
  const load = useCallback(() => api.get("/me/requests").then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);
  useLive(["requests", "admin"], load);
  const items = (d?.requests || []).filter((r) => (tab === "open" ? ["not_started", "in_progress", "overdue"].includes(r.effective_status) : tab === "done" ? ["submitted", "reviewed", "resolved"].includes(r.effective_status) : true));
  return (
    <div>
      <PageHeader k="requests" title="To-do" subtitle="Forms and updates the Playr League team has asked you for." />
      <Tabs tabs={[{ value: "open", label: `To do${d ? ` (${d.open})` : ""}` }, { value: "done", label: "Submitted" }, { value: "all", label: "All" }]} value={tab} onChange={setTab} />
      {!d ? <Spinner /> : items.length === 0 ? <Empty title={tab === "open" ? "You have no open requests right now." : "Nothing here yet."} hint={tab === "open" ? "When the team needs something from you, it will show up here and on your home page." : ""} /> : (
        <div className="space-y-3">{items.map((r) => (
          <Card key={r.id} className="cursor-pointer transition hover:border-ink/30" onClick={() => setOpenId(r.id)} data-testid="member-request">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="font-medium">{r.title}</p><p className="mt-1 text-sm text-muted">{r.reason}</p>
                <p className="mt-2 text-xs text-muted">{r.kind_label}{r.due_date ? ` · due ${r.due_date}` : ""}{r.external_provider ? ` · ${r.external_provider}` : ""}</p></div>
              <StatusBadge status={r.effective_status} />
            </div>
          </Card>))}</div>)}
      {openId && <RequestModal id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}
