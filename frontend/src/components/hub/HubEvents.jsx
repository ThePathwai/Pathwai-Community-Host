import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, MapPin, Users } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fmtDate } from "../../lib/api";
import { countBy } from "../../lib/explain";
import { Spinner, cx } from "../ui";
import { useEcosystem } from "../../lib/ecosystem";
import { Empty, MatchCard, PageHead, SummaryBar, VerdictSections, useHubData } from "./HubKit";

// Events in a hub's ecosystem lens: grouped by whether they are worth your time right now, soonest first, with the checks (topic, timing, spot)
// and what it takes when one isn't a match. One-tap RSVP.
function Card({ m, onRsvp }) {
  const dt = new Date(m.at);
  const going = m.rsvp === "yes";
  const full = m.capacity && m.going >= m.capacity && !going;
  return (
    <MatchCard m={m} testid={`event-${m.id}`} kicker={m.category}
      lead={<Link to={`/events/${m.id}`} className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-ink/[.07] text-center" aria-label={`${m.title}, details`}>
        <span className="text-[10px] font-bold uppercase leading-none text-red-600" style={{ letterSpacing: "0.08em" }}>{dt.toLocaleString("en", { month: "short" })}</span>
        <span className="mt-0.5 text-xl font-bold leading-none">{dt.getDate()}</span></Link>}
      title={<Link to={`/events/${m.id}`} className="hover:underline">{m.title}</Link>}
      sub={<span className="flex flex-wrap items-center gap-x-3 gap-y-0.5"><span>{fmtDate(m.at, { weekday: "short", hour: "numeric", minute: "2-digit" })}</span>
        {m.place && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden />{m.place}</span>}
        <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" aria-hidden />{m.going}{m.capacity ? ` of ${m.capacity}` : ""} going</span></span>}
      actions={<>
        {m.paid && !going ? <Link to={`/events/${m.id}`} className="btn-primary !py-2 text-sm">Get ticket</Link>
          : <button type="button" disabled={full} onClick={() => onRsvp(m.id, going ? null : "yes")} data-testid={`rsvp-${m.id}`}
              className={cx("inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-50", going ? "border border-emerald-500/50 text-emerald-700 dark:text-emerald-300" : "")}
              style={going ? undefined : { background: "var(--accent)", color: "var(--on-accent)" }}>{going ? <><Check className="h-4 w-4" aria-hidden />You're going</> : full ? "Full" : "I'm going"}</button>}
        <Link to={`/events/${m.id}`} className="btn-ghost !py-2 text-sm">Details</Link>
      </>} />
  );
}

export default function HubEvents() {
  const eco = useEcosystem();
  const { d, err, reload } = useHubData();
  const [filter, setFilter] = useState("all");
  const [going, setGoing] = useState(false);
  const all = useMemo(() => [...(d?.lists.event || [])].sort((a, b) => String(a.at).localeCompare(String(b.at))), [d]);   // soonest first inside each group
  const items = going ? all.filter((m) => m.rsvp === "yes") : all;
  const rsvp = async (id, status) => {
    try { await api.post(`/events/${id}/rsvp`, { status }); toast.success(status === "yes" ? "You're in" : "RSVP removed"); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  if (err) return <p className="card text-sm text-muted">Events could not load. Please try again in a moment.</p>;
  if (!d) return <Spinner />;
  return (
    <div className="mx-auto w-full max-w-5xl" data-testid="hub-events">
      <PageHead eyebrow="Events" title={`What's on at ${eco.hub}`} sub="Every event, checked against what you asked for. The ones worth your time right now come first, soonest at the top." />
      <SummaryBar counts={countBy(all)} value={filter} onChange={setFilter}>
        <button type="button" onClick={() => setGoing(!going)} aria-pressed={going} data-testid="ev-going" className={cx("ml-auto rounded-full border px-3.5 py-1.5 text-sm", going ? "border-transparent bg-ink/10 font-semibold" : "border-line text-muted hover:text-ink")}>Only my RSVPs</button>
      </SummaryBar>
      {items.length ? <VerdictSections items={items} filter={filter} render={(m) => <Card key={m.id} m={m} onRsvp={rsvp} />} /> : <Empty>You haven't said yes to anything yet.</Empty>}
    </div>
  );
}
