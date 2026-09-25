import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bookmark, X } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fmtDate } from "../lib/api";
import { Avatar, Button, Card, Chip, Empty, Field, Modal, PageHeader, Spinner, Tabs, Textarea, Input } from "../components/ui";

export default function Matches() {
  const nav = useNavigate();
  const [tab, setTab] = useState("people");
  const [d, setD] = useState(null);
  const [intro, setIntro] = useState(null);
  const [topic, setTopic] = useState("");
  const [note, setNote] = useState("");
  const load = useCallback(() => api.get("/matches").then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);

  const act = async (kind, id, action) => { try { await api.post("/matches/action", { kind, target_id: id, action }); if (action === "dismiss") toast("Dismissed — we'll show fewer like this"); if (action === "save") toast.success("Saved"); load(); } catch (e) { toast.error(errMsg(e)); } };
  const sendIntro = async () => {
    try { await api.post("/connect-requests", { recipient_id: intro.user.id, topic, note }); await api.post("/matches/action", { kind: "person", target_id: intro.user.id, action: "intro" }); toast.success(`Intro request sent to ${intro.user.name.split(" ")[0]}`); setIntro(null); setTopic(""); setNote(""); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  const Actions = ({ kind, id, state, primary }) => (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {primary}
      <Button variant="ghost" className="!px-3" onClick={() => act(kind, id, state === "save" ? "undo" : "save")} aria-label="Save"><Bookmark className={`h-4 w-4 ${state === "save" ? "fill-current" : ""}`} /></Button>
      <Button variant="ghost" className="!px-3" onClick={() => act(kind, id, "dismiss")} aria-label="Dismiss"><X className="h-4 w-4" /></Button>
    </div>
  );
  const list = !d ? null : d[tab];
  return (
    <div>
      <PageHeader k="matches" title="Recommended connections" subtitle="Members, events and perks picked for what you need and what you offer." />
      <Tabs tabs={[{ value: "people", label: `People${d ? ` (${d.people.length})` : ""}` }, { value: "events", label: "Events" }, { value: "resources", label: "Resources" }]} value={tab} onChange={setTab} />
      {!d ? <Spinner /> : list.length === 0 ? <Empty title="No recommendations yet" hint={d.profile_hint || "Complete your profile to improve recommendations."} action={<Link className="btn-primary" to="/profile">Complete your profile</Link>} /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {tab === "people" && list.map((m) => (
            <Card key={m.user.id} data-testid="match-card" className={m.state === "intro" ? "!border-green-500/40" : ""}>
              <div className="mb-3 flex items-center justify-between"><span className="eyebrow">{m.match_type}</span></div>
              <div className="flex items-center gap-3"><Avatar src={m.user.avatar_url} name={m.user.name} size={44} />
                <div><Link to={`/members/${m.user.id}`} className="font-medium hover:underline">{m.user.name}</Link><p className="text-xs text-muted">{m.user.title}{m.user.company ? ` · ${m.user.company}` : ""}</p></div></div>
              <p className="mt-3 text-sm"><span className="text-muted">Why: </span>{m.why}</p>
              <div className="mt-3 flex flex-wrap gap-1">{(m.matched_on || []).slice(0, 5).map((t) => <Chip key={t}>{t}</Chip>)}</div>
              <Actions kind="person" id={m.user.id} state={m.state} primary={m.state === "intro" ? <Chip>Intro requested</Chip> : <Button onClick={() => { setIntro(m); setTopic(m.can_help_you?.[0] || ""); }} data-testid="request-intro">{m.next_action}</Button>} />
            </Card>))}
          {tab === "events" && list.map((e) => (
            <Card key={e.id}><span className="eyebrow">{e.match_type}</span><h3 className="mt-2 text-lg">{e.title}</h3><p className="text-sm text-muted">{fmtDate(e.starts_at)} · {e.location}</p>
              <p className="mt-2 text-sm"><span className="text-muted">Why: </span>{e.why}</p>
              <Actions kind="event" id={e.id} state={e.state} primary={<Button onClick={() => nav(`/events/${e.id}`)}>View & RSVP</Button>} /></Card>))}
          {tab === "resources" && list.map((r) => (
            <Card key={r.id}><span className="eyebrow">{r.match_type}</span><h3 className="mt-2 text-lg">{r.title}</h3><p className="mt-1 line-clamp-2 text-sm text-muted">{r.description}</p>
              <p className="mt-2 text-sm"><span className="text-muted">Why: </span>{r.why}</p>
              <Actions kind="resource" id={r.id} state={r.state} primary={<a className="btn-primary" href={r.url || r.external_url} target="_blank" rel="noreferrer" onClick={() => api.post(`/resources/${r.id}/open`).catch(() => {})}>Open resource</a>} /></Card>))}
        </div>)}
      <Modal open={!!intro} onClose={() => setIntro(null)} title={`Request an intro to ${intro?.user.name || ""}`}>
        <div className="space-y-4"><Field label="What would you like to talk about?"><Input value={topic} onChange={(e) => setTopic(e.target.value)} /></Field>
          <Field label="Add a note (optional)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <Button onClick={sendIntro} disabled={!topic.trim()} data-testid="send-intro">Send request</Button></div>
      </Modal>
    </div>
  );
}
