import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errMsg, fmtDate } from "../lib/api";
import { ItemTools } from "../components/EditKit";
import { useAuth } from "../lib/auth";
import { Button, Card, Chip, Empty, Field, Input, Modal, PageHeader, PhotoField, Select, Spinner, Textarea } from "../components/ui";

const TYPES = ["Program update", "Deadline reminder", "Event announcement", "Opportunity announcement", "Resource announcement", "Community news", "Partner update", "Alumni update"];

export default function Updates() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [sel, setSel] = useState(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", body: "", category: "Community news", cta_label: "", cta_url: "", image_url: "" });
  const load = () => api.get("/announcements").then((r) => setItems(r.data)).catch((e) => toast.error(errMsg(e)));
  useEffect(() => { load(); }, []);
  const submit = async () => {
    try { const { data } = await api.post("/announcements", { ...f, cta_label: f.cta_label || null, cta_url: f.cta_url || null }); toast.success(data.status === "pending" ? "Sent to the team for approval" : "Published"); setOpen(false); setF({ ...f, title: "", body: "", image_url: "" }); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div>
      <PageHeader k="updates" title="Community news" subtitle="Announcements and updates from the team." actions={<Button variant="ghost" onClick={() => setOpen(true)} data-testid="new-announcement">{user.role === "admin" ? "Post an update" : "Share an update"}</Button>} />
      {!items ? <Spinner /> : items.length === 0 ? <Empty title="No updates yet" hint="Check back soon, or share one with the community." /> : (
        <div className="space-y-3">{items.map((a) => (
          <Card key={a.id} className="cursor-pointer transition hover:border-ink/30" onClick={() => setSel(a)} data-testid="announcement">
            <div className="mb-2 flex flex-wrap items-center gap-2"><Chip>{a.category || "Community news"}</Chip>{a.priority === "high" && <Chip>Important</Chip>}<span className="eyebrow">{fmtDate(a.published_at, { month: "short", day: "numeric" })} · {a.author || "The Playr League team"}</span></div>
            <ItemTools kind="announcements" item={a} onChanged={load} className="mb-2" />{a.image_url && <img src={a.image_url} alt="" className="mb-3 h-44 w-full rounded-lg object-cover" />}<h3 className="text-lg">{a.title}</h3><p className="mt-1 line-clamp-2 text-sm text-muted">{a.body}</p>
          </Card>))}</div>)}
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel?.title}>
        {sel && <div className="space-y-3"><p className="eyebrow">{sel.category || "Community news"} · {fmtDate(sel.published_at)} · {sel.author || "The Playr League team"}</p>
          {sel.image_url && <img src={sel.image_url} alt="" className="max-h-80 w-full rounded-xl border border-line object-cover" />}
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{sel.body}</p>
          {sel.cta_url && <a className="btn-primary" href={sel.cta_url} target="_blank" rel="noreferrer">{sel.cta_label || "Learn more"}</a>}</div>}
      </Modal>
      <Modal open={open} onClose={() => setOpen(false)} title="Share an update">
        <div className="space-y-4">
          <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="ann-title" /></Field>
          <Field label="Type"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={TYPES} /></Field>
          <PhotoField value={f.image_url} onChange={(v) => setF({ ...f, image_url: v })} />
          <Field label="Message"><Textarea rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Button label"><Input value={f.cta_label} onChange={(e) => setF({ ...f, cta_label: e.target.value })} /></Field><Field label="Button link"><Input type="url" value={f.cta_url} onChange={(e) => setF({ ...f, cta_url: e.target.value })} /></Field></div>
          <p className="text-xs text-muted">{user.role === "admin" ? "Admins publish immediately." : "The Playr League team reviews updates before they're published."}</p>
          <Button onClick={submit} disabled={!f.title.trim() || !f.body.trim()} data-testid="ann-submit">Submit</Button>
        </div>
      </Modal>
    </div>
  );
}
