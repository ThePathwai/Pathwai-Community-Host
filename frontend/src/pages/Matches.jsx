import React, { useCallback, useEffect, useState } from "react";
import { WhyLine, WhyReasons, reasonsOf } from "../components/WhyMatch";
import { Link, useNavigate } from "react-router-dom";
import { Bookmark, X } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fmtDate } from "../lib/api";
import { useLive } from "../lib/live";
import { useAuth } from "../lib/auth";
import { ReachOutModal } from "../components/ReachOutModal";
import { Avatar, Button, Card, Chip, Empty, PageHeader, Spinner, Tabs } from "../components/ui";

export default function Matches() {
  const nav = useNavigate();
  const { config } = useAuth();
  const [tab, setTab] = useState("people");
  const [d, setD] = useState(null);
  const [intro, setIntro] = useState(null); // the match row the reach-out modal is open for
  const [introMember, setIntroMember] = useState(null); // that person's full profile (has contact info)
  const load = useCallback(() => api.get("/matches").then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);
  useLive(["matches", "members"], load);

  const act = async (kind, id, action) => { try { await api.post("/matches/action", { kind, target_id: id, action }); if (action === "dismiss") toast("Dismissed — we'll show fewer like this"); if (action === "save") toast.success("Saved"); load(); } catch (e) { toast.error(errMsg(e)); } };
  // Fetch the full profile (not just the trimmed match-result fields) so the modal can offer their
  // actual phone/email, then open it.
  const openIntro = (m) => { setIntro(m); setIntroMember(null); api.get(`/users/${m.user.id}`).then((r) => setIntroMember(r.data)).catch(() => setIntroMember(m.user)); };
  const introDone = () => act("person", intro.user.id, "intro");
  const Actions = ({ kind, id, state, primary }) => (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {primary}
      <Button variant="ghost" className="!px-3" onClick={() => act(kind, id, state === "save" ? "undo" : "save")} aria-label="Save"><Bookmark className={`h-4 w-4 ${state === "save" ? "fill-current" : ""}`} /></Button>
      <Button variant="ghost" className="!px-3" onClick={() => act(kind, id, "dismiss")} aria-label="Dismiss"><X className="h-4 w-4" /></Button>
    </div>
  );
  // Compact action row for the mobile 2-up tiles below: the primary action fills the tile's width,
  // save/dismiss shrink to icon-only buttons so a whole recommendation still fits in a tile half the
  // width of a phone screen.
  const ActionsCompact = ({ kind, id, state, primary }) => (
    <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1">{primary}</div>
      <button className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-ink/5" onClick={() => act(kind, id, state === "save" ? "undo" : "save")} aria-label="Save"><Bookmark className={`h-3.5 w-3.5 ${state === "save" ? "fill-current" : ""}`} /></button>
      <button className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-ink/5" onClick={() => act(kind, id, "dismiss")} aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
  const list = !d ? null : d[tab];
  return (
    <div>
      <PageHeader k="matches" title="Recommended connections" subtitle="Members, events and perks picked for what you need and what you offer." />
      <Tabs tabs={[{ value: "people", label: `People${d ? ` (${d.people.length})` : ""}` }, { value: "events", label: "Events" }, { value: "resources", label: "Resources" }]} value={tab} onChange={setTab} />
      {!d ? <Spinner /> : list.length === 0 ? <Empty title="No recommendations yet" hint={d.profile_hint || "Complete your profile to improve recommendations."} action={<Link className="btn-primary" to="/profile">Complete your profile</Link>} /> : (
        <>
          {/* Mobile: 2-up tiles, same density step as Members — but each tab keeps the one line that
              actually explains its own value (why this person/event/perk was picked for you), so the
              tabs stay legible as distinct sections rather than collapsing into identical grids.
              Desktop keeps the full card below (`hidden lg:grid`). */}
          <div className="grid grid-cols-2 gap-2 lg:hidden">
            {tab === "people" && list.map((m) => (
              <div key={m.user.id} data-testid="match-tile" className={"card card-hover !p-2 flex flex-col gap-1 " + (m.state === "intro" ? "!border-green-500/40" : "")}>
                <div className="flex items-center gap-1.5">
                  <Avatar src={m.user.avatar_url} name={m.user.name} size={26} />
                  <div className="min-w-0 flex-1">
                    <Link to={`/members/${m.user.id}`} className="block truncate text-[11px] font-semibold hover:underline">{m.user.name}</Link>
                    <p className="truncate text-[9px] text-muted">{m.user.title}</p>
                  </div>
                </div>
                <WhyLine m={m} lines={3} className="text-[10px] text-ink/80" />
                <ActionsCompact kind="person" id={m.user.id} state={m.state} primary={m.state === "intro" ? <Chip className="!px-1.5 !py-0.5 !text-[9px]">Reached out</Chip> : <Button className="!flex !w-full !min-w-0 !px-1.5 !py-1 !text-[9px]" onClick={() => openIntro(m)} data-testid="request-intro-mobile"><span className="truncate">{m.next_action}</span></Button>} />
              </div>))}
            {tab === "events" && list.map((e) => (
              <div key={e.id} data-testid="match-tile" className="card card-hover !p-2 flex flex-col gap-1">
                <span className="eyebrow text-[8px]">{e.match_type}</span>
                <h3 className="-mt-0.5 truncate text-[11px] font-semibold">{e.title}</h3>
                <p className="truncate text-[9px] text-muted">{fmtDate(e.starts_at)}</p>
                <p className="line-clamp-1 text-[9px] leading-tight text-muted"><span className="text-ink/50">Why · </span>{e.why}</p>
                <ActionsCompact kind="event" id={e.id} state={e.state} primary={<Button className="!w-full !px-1.5 !py-1 !text-[9px]" onClick={() => nav(`/events/${e.id}`)}>View & RSVP</Button>} />
              </div>))}
            {tab === "resources" && list.map((r) => (
              <div key={r.id} data-testid="match-tile" className="card card-hover !p-2 flex flex-col gap-1">
                <span className="eyebrow text-[8px]">{r.match_type}</span>
                <h3 className="-mt-0.5 truncate text-[11px] font-semibold">{r.title}</h3>
                <p className="line-clamp-1 text-[9px] leading-tight text-muted"><span className="text-ink/50">Why · </span>{r.why}</p>
                <ActionsCompact kind="resource" id={r.id} state={r.state} primary={<a className="btn-primary !flex !w-full !items-center !justify-center !px-1.5 !py-1 !text-[9px]" href={r.url || r.external_url} target="_blank" rel="noreferrer" onClick={() => api.post(`/resources/${r.id}/open`).catch(() => {})}>Open</a>} />
              </div>))}
          </div>

          <div className="hidden gap-4 lg:grid lg:grid-cols-2">
            {tab === "people" && list.map((m) => (
              <Card key={m.user.id} data-testid="match-card" className={m.state === "intro" ? "!border-green-500/40" : ""}>
                <div className="mb-3 flex items-center justify-between"><span className="eyebrow">{m.match_type}</span></div>
                <div className="flex items-center gap-3"><Avatar src={m.user.avatar_url} name={m.user.name} size={44} />
                  <div><Link to={`/members/${m.user.id}`} className="font-medium hover:underline">{m.user.name}</Link><p className="text-xs text-muted">{m.user.title}{m.user.company ? ` · ${m.user.company}` : ""}</p></div></div>
                <div className="mt-4 rounded-xl bg-ink/5 p-3.5" data-testid="match-why">
                  <p className="eyebrow mb-2.5">Why we suggested {m.user.name.split(" ")[0]}</p>
                  {reasonsOf(m).length ? <WhyReasons reasons={reasonsOf(m)} /> : <p className="text-sm">{m.why}</p>}
                </div>
                <Actions kind="person" id={m.user.id} state={m.state} primary={m.state === "intro" ? <Chip>Reached out</Chip> : <Button onClick={() => openIntro(m)} data-testid="request-intro">{m.next_action}</Button>} />
              </Card>))}
            {tab === "events" && list.map((e) => (
              <Card key={e.id}><span className="eyebrow">{e.match_type}</span><h3 className="mt-2 text-lg">{e.title}</h3><p className="text-sm text-muted">{fmtDate(e.starts_at)} · {e.location}</p>
                <p className="mt-2 text-sm"><span className="text-muted">Why: </span>{e.why}</p>
                <Actions kind="event" id={e.id} state={e.state} primary={<Button onClick={() => nav(`/events/${e.id}`)}>View & RSVP</Button>} /></Card>))}
            {tab === "resources" && list.map((r) => (
              <Card key={r.id}><span className="eyebrow">{r.match_type}</span><h3 className="mt-2 text-lg">{r.title}</h3><p className="mt-1 line-clamp-2 text-sm text-muted">{r.description}</p>
                <p className="mt-2 text-sm"><span className="text-muted">Why: </span>{r.why}</p>
                <Actions kind="resource" id={r.id} state={r.state} primary={<a className="btn-primary" href={r.url || r.external_url} target="_blank" rel="noreferrer" onClick={() => api.post(`/resources/${r.id}/open`).catch(() => {})}>Open resource</a>} /></Card>))}
          </div>
        </>)}
      <ReachOutModal open={!!intro} onClose={() => setIntro(null)} member={introMember} communityName={config?.community_name}
        defaultTopic={intro?.can_help_you?.[0] || ""} onSent={introDone} />
    </div>
  );
}
