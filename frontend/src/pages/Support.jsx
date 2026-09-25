import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errMsg, timeAgo } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Avatar, Button, Card, Chip, Empty, Field, Input, Modal, PageHeader, PhotoField, Select, Spinner, StatusBadge, TagInput, Tabs, Textarea } from "../components/ui";

export default function Support() {
  const { user, config } = useAuth();
  const [tab, setTab] = useState("team");
  const [team, setTeam] = useState(null);
  const [teamOpen, setTeamOpen] = useState(false);
  const [cats, setCats] = useState({ categories: [], statuses: [] });
  const [tf, setTf] = useState({ category: "Career advice", title: "", description: "", urgency: "normal", deadline: "", attachment_url: "" });
  const [items, setItems] = useState(null);
  const [conn, setConn] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", description: "", category: config?.support_categories?.[0] || "Career advice", tags: [], urgency: "normal", image_url: "" });

  const loadTeam = useCallback(() => api.get("/me/team-support").then((r) => setTeam(r.data.requests)), []);
  useEffect(() => { loadTeam(); api.get("/support-categories").then((r) => { setCats(r.data); }); }, [loadTeam]);
  const submitTeam = async () => {
    try { await api.post("/team-support", { ...tf, deadline: tf.deadline || null, attachment_url: tf.attachment_url || null }); toast.success("Sent to the Playr League team"); setTeamOpen(false); setTf({ ...tf, title: "", description: "" }); loadTeam(); } catch (e) { toast.error(errMsg(e)); }
  };
  const load = useCallback(async () => {
    if (tab === "team") return;
    const params = tab === "mine" ? { mine: true, status: "all" } : { status: tab };
    setItems((await api.get("/support-requests", { params })).data);
  }, [tab]);
  useEffect(() => { setItems(null); load(); }, [load]);
  useEffect(() => { api.get("/connect-requests", { params: { scope: "received" } }).then((r) => setConn(r.data.requests)).catch(() => {}); }, []);

  const create = async () => {
    try { await api.post("/support-requests", f); toast.success("Request posted"); setOpen(false); setF({ ...f, title: "", description: "", tags: [], image_url: "" }); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  const offer = async (id) => { try { await api.post(`/support-requests/${id}/offer-help`); toast.success("They'll be notified"); load(); } catch (e) { toast.error(errMsg(e)); } };
  const resolve = async (id) => { await api.patch(`/support-requests/${id}`, { status: "resolved" }); load(); };
  const respond = async (id, status) => { await api.post(`/connect-requests/${id}/respond`, { status }); setConn(conn.map((c) => c.id === id ? { ...c, status } : c)); };

  return (
    <div>
      <PageHeader k="support" title="Help board" subtitle="Ask the Playr League team for help, or trade help with other members." actions={<Button onClick={() => (tab === "team" ? setTeamOpen(true) : setOpen(true))} data-testid="new-request">{tab === "team" ? "Ask the team" : "Post to the board"}</Button>} />
      {conn.filter((c) => c.status === "pending").length > 0 && (
        <Card className="mb-6 !bg-ink/5">
          <h3 className="mb-3 font-medium">Connection requests for you</h3>
          {conn.filter((c) => c.status === "pending").map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-3 first:border-0">
              <p className="text-sm"><b>{c.sender_name}</b> {c.kind_label?.toLowerCase()} — {c.topic}</p>
              <div className="flex gap-2"><Button onClick={() => respond(c.id, "accepted")}>Accept</Button><Button variant="ghost" onClick={() => respond(c.id, "declined")}>Decline</Button></div>
            </div>
          ))}
        </Card>
      )}
      <Tabs tabs={[{ value: "team", label: "Ask the team" }, { value: "open", label: "Member board" }, { value: "mine", label: "My posts" }, { value: "resolved", label: "Resolved" }]} value={tab} onChange={setTab} />
      {tab === "team" ? (
        !team ? <Spinner /> : team.length === 0 ? <Empty title="No support requests yet" hint="Need career advice, a business intro or help with scheduling? Ask the Playr League team." action={<Button onClick={() => setTeamOpen(true)}>Ask the team</Button>} /> : (
          <div className="space-y-3">{team.map((r) => (
            <Card key={r.id} data-testid="team-request">
              <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{r.title}</p><p className="text-xs text-muted">{r.category_label} · {timeAgo(r.created_at)}{r.deadline ? ` · needed by ${r.deadline}` : ""}</p></div><StatusBadge status={r.status} /></div>
              {r.description && <p className="mt-2 text-sm text-ink/80">{r.description}</p>}
              {r.last_response && <p className="mt-3 rounded-lg border border-line bg-ink/5 p-3 text-sm"><span className="eyebrow mr-2">Team</span>{r.last_response}</p>}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">{(r.timeline || []).map((t, i) => <span key={i}>{t.status.replace(/_/g, " ")} · {timeAgo(t.at)}</span>)}</div>
            </Card>))}</div>)
      ) : !items ? <Spinner /> : items.length === 0 ? <Empty title="Nothing on the board yet" hint="Post what you need, or check back to see who you can help." /> : (
        <div className="space-y-3">
          {items.map((r) => (
            <Card key={r.id} data-testid="request-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex gap-3">
                  <Avatar src={r.user_snapshot?.avatar_url} name={r.user_snapshot?.name} />
                  <div>
                    <p className="font-medium">{r.title}</p>
                    <p className="text-xs text-muted">{r.user_snapshot?.name} · {timeAgo(r.created_at)}{r.urgency === "urgent" ? " · 🔥 urgent" : ""}</p>
                    {r.description && <p className="mt-2 text-sm">{r.description}</p>}
                    {r.image_url && <img src={r.image_url} alt="" className="mt-3 max-h-64 w-full rounded-xl border border-line object-cover" />}
                    <div className="mt-2 flex flex-wrap gap-1"><Chip>{r.category}</Chip>{(r.tags || []).map((t) => <Chip key={t}>{t}</Chip>)}</div>
                  </div>
                </div>
                <div className="text-right">
                  {r.user_id === user.id ? (r.status === "open" && <Button variant="ghost" onClick={() => resolve(r.id)}>Mark resolved</Button>)
                    : r.status === "open" && <Button variant={r.i_offered ? "ghost" : "primary"} onClick={() => offer(r.id)} data-testid="offer-help">{r.i_offered ? "Offered ✓" : "I can help"}</Button>}
                  <p className="mt-1 text-xs text-muted">{r.helper_count} offered</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={teamOpen} onClose={() => setTeamOpen(false)} title="Ask the Playr League team">
        <div className="space-y-4">
          <Field label="Category"><Select data-testid="team-category" value={tf.category} onChange={(e) => setTf({ ...tf, category: e.target.value })} options={cats.categories} /></Field>
          <Field label="What do you need?"><Input data-testid="team-title" value={tf.title} onChange={(e) => setTf({ ...tf, title: e.target.value })} /></Field>
          <Field label="Details"><Textarea value={tf.description} onChange={(e) => setTf({ ...tf, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Urgency"><Select value={tf.urgency} onChange={(e) => setTf({ ...tf, urgency: e.target.value })} options={["low", "normal", "high"]} /></Field>
            <Field label="Needed by"><Input type="date" value={tf.deadline} onChange={(e) => setTf({ ...tf, deadline: e.target.value })} /></Field>
          </div>
          <Field label="Link to a file (optional)"><Input type="url" placeholder="https://" value={tf.attachment_url} onChange={(e) => setTf({ ...tf, attachment_url: e.target.value })} /></Field>
          <Button onClick={submitTeam} disabled={!tf.title.trim()} data-testid="team-submit">Send request</Button>
        </div>
      </Modal>
      <Modal open={open} onClose={() => setOpen(false)} title="New request">
        <div className="space-y-4">
          <Field label="What do you need?"><Input data-testid="req-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Details"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <PhotoField value={f.image_url} onChange={(v) => setF({ ...f, image_url: v })} />
          <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={config?.support_categories || ["Advice"]} /></Field>
          <Field label="Tags (used to match helpers)"><TagInput value={f.tags} onChange={(tags) => setF({ ...f, tags })} /></Field>
          <Field label="Urgency"><Select value={f.urgency} onChange={(e) => setF({ ...f, urgency: e.target.value })} options={["normal", "urgent"]} /></Field>
          <Button onClick={create} disabled={!f.title.trim()} data-testid="req-submit">Post request</Button>
        </div>
      </Modal>
    </div>
  );
}
