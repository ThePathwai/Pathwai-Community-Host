import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { useLive } from "../lib/live";
import { useAuth } from "../lib/auth";
import { Avatar, Button, Card, Chip, Empty, Field, Input, Modal, PageHeader, Spinner, TagInput, Tabs, Textarea } from "../components/ui";

// Small project teams that members start themselves ("Spring shoot crew"): see what's running, join one, or start your own.
export const TeamAvatars = ({ people = [], size = 28 }) => (
  <span className="flex items-center">
    {people.slice(0, 5).map((p, i) => <span key={p.id} className="block rounded-full" style={{ marginLeft: i ? -8 : 0, zIndex: 5 - i }}><Avatar src={p.avatar_url} name={p.name} size={size} /></span>)}
  </span>
);

export function NewTeamModal({ open, onClose, onCreated }) {
  const [f, setF] = useState({ name: "", description: "", looking_for: [] });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const { data } = await api.post("/teams", f); setF({ name: "", description: "", looking_for: [] }); toast.success("Team started. You're the lead."); onCreated(data); }
    catch (ex) { toast.error(errMsg(ex)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Start a team">
      <form onSubmit={submit} className="space-y-4" data-testid="new-team-form">
        <Field label="Team name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} required placeholder="Easter weekend shoot" data-testid="team-name" /></Field>
        <Field label="What is it for?" hint="The goal, the timing, and what you'll make together."><Textarea rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={1500} data-testid="team-description" /></Field>
        <Field label="Skills you're looking for" hint="Press Enter after each one. People with these skills will see where they fit."><TagInput value={f.looking_for} onChange={(looking_for) => setF({ ...f, looking_for })} /></Field>
        <div className="flex justify-end gap-2"><Button variant="ghost" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy} data-testid="team-create">Start team</Button></div>
      </form>
    </Modal>
  );
}

export default function Teams() {
  const { config } = useAuth();
  const nav = useNavigate();
  const label = (config?.nav || []).find((n) => n.key === "teams")?.label || "Teams";
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState("active");
  const [open, setOpen] = useState(false);
  const load = useCallback(() => api.get("/teams").then((r) => setItems(r.data)).catch((e) => toast.error(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);
  useLive(null, load);
  if (!items) return <Spinner />;
  const list = items.filter((t) => (tab === "mine" ? t.is_member : tab === "done" ? t.status === "done" : t.status !== "done"));
  const mineCount = items.filter((t) => t.is_member).length;
  return (
    <div data-testid="teams-page">
      <PageHeader k="teams" title={label} subtitle="Small groups inside the community. Start one for a project you care about, or join one that needs your skills."
        actions={<Button onClick={() => setOpen(true)} data-testid="start-team"><Plus className="mr-1.5 h-4 w-4" aria-hidden />Start a team</Button>} />
      <Tabs tabs={[{ value: "active", label: "Active" }, { value: "mine", label: `My teams${mineCount ? ` · ${mineCount}` : ""}` }, { value: "done", label: "Finished" }]} value={tab} onChange={setTab} />
      {list.length === 0 ? <Empty title={tab === "mine" ? "You're not on a team yet" : tab === "done" ? "Nothing finished yet" : "No teams yet"} hint={tab === "mine" ? "Join one from the Active tab, or start your own." : "Start the first one: a shoot, a livestream crew, a short film."} />
        : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((t) => (
              <Link key={t.id} to={`/teams/${t.id}`} data-testid="team-card" className="block">
                <Card className="flex h-full flex-col gap-3 transition hover:border-ink/30">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-lg font-semibold leading-tight">{t.name}</h2>
                    {t.is_member && <Chip accent>{t.is_lead ? "You lead" : "You're in"}</Chip>}
                    {t.status === "done" && <Chip>Finished</Chip>}
                  </div>
                  {t.description && <p className="line-clamp-3 text-sm text-muted">{t.description}</p>}
                  {t.looking_for?.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5"><span className="eyebrow">Needs</span>{t.looking_for.slice(0, 4).map((s) => <Chip key={s}>{s}</Chip>)}</div>)}
                  <div className="mt-auto flex items-center justify-between pt-1">
                    <TeamAvatars people={t.member_preview} />
                    <span className="text-xs text-muted">{t.member_count} {t.member_count === 1 ? "person" : "people"}{t.lead ? ` · led by ${t.lead.name.split(" ")[0]}` : ""}</span>
                  </div>
                </Card>
              </Link>))}
          </div>)}
      <NewTeamModal open={open} onClose={() => setOpen(false)} onCreated={(t) => { setOpen(false); nav(`/teams/${t.id}`); }} />
    </div>
  );
}
