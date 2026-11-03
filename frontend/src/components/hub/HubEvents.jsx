import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, MapPin, Users } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fmtDate } from "../../lib/api";
import { Spinner, cx } from "../ui";
import { useEcosystem } from "../../lib/ecosystem";
import { Chips, Empty, FitPill, PageHead, RowList, Why, needChips, useHubData } from "./HubKit";

// Events in a hub's ecosystem lens: what is on, best fit first, with the reason and a one-tap RSVP. Same page shape as Programs, People, Resources.
function Row({ m, onRsvp }) {
  const dt = new Date(m.at);
  const going = m.rsvp === "yes";
  return (
    <li className="p-4 sm:p-5" data-testid={`event-${m.id}`}>
      <div className="flex gap-4">
        <Link to={`/events/${m.id}`} className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-ink/[.06] text-center" aria-label={`${m.title}, details`}>
          <span className="text-[10px] font-bold uppercase leading-none text-red-600" style={{ letterSpacing: "0.08em" }}>{dt.toLocaleString("en", { month: "short" })}</span>
          <span className="mt-0.5 text-xl font-bold leading-none">{dt.getDate()}</span>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {m.category && <span className="text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>{m.category}</span>}
            <FitPill fit={m.fit} />
          </div>
          <h3 className="mt-0.5 text-base font-semibold leading-snug"><Link to={`/events/${m.id}`} className="hover:underline">{m.title}</Link></h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            <span>{fmtDate(m.at, { weekday: "short", hour: "numeric", minute: "2-digit" })}</span>
            {m.place && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden />{m.place}</span>}
            <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" aria-hidden />{m.going}{m.capacity ? ` of ${m.capacity}` : ""} going</span>
          </p>
          <Why text={m.reason} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {m.paid && !going ? <Link to={`/events/${m.id}`} className="btn-primary !py-2 text-sm">Get ticket</Link>
              : <button type="button" onClick={() => onRsvp(m.id, going ? null : "yes")} data-testid={`rsvp-${m.id}`}
                  className={cx("inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition", going ? "border border-emerald-500/50 text-emerald-700 dark:text-emerald-300" : "")}
                  style={going ? undefined : { background: "var(--accent)", color: "var(--on-accent)" }}>{going ? <><Check className="h-4 w-4" aria-hidden />You're going</> : "I'm going"}</button>}
            <Link to={`/events/${m.id}`} className="btn-ghost !py-2 text-sm">Details</Link>
          </div>
        </div>
      </div>
    </li>
  );
}

export default function HubEvents() {
  const eco = useEcosystem();
  const { d, err, reload } = useHubData();
  const [need, setNeed] = useState("all");
  const [going, setGoing] = useState(false);
  const all = useMemo(() => [...(d?.lists.event || [])].sort((a, b) => String(a.at).localeCompare(String(b.at))), [d]);   // by date: that is how people read an events list
  const chips = useMemo(() => needChips(all), [all]);
  const rows = all.filter((m) => (need === "all" || (m.needs || []).includes(need)) && (!going || m.rsvp === "yes"));
  const rsvp = async (id, status) => {
    try { await api.post(`/events/${id}/rsvp`, { status }); toast.success(status === "yes" ? "You're in" : "RSVP removed"); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  if (err) return <p className="card text-sm text-muted">Events could not load. Please try again in a moment.</p>;
  if (!d) return <Spinner />;
  return (
    <div className="mx-auto w-full max-w-4xl" data-testid="hub-events">
      <PageHead eyebrow="Events" title={`What's on at ${eco.hub}`} sub="Pitch days, office hours, workshops and mixers, soonest first, with the ones that fit your startup marked." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1"><Chips items={chips} value={need} onChange={setNeed} label="What you need" testid="ev-need" /></div>
        <button type="button" onClick={() => setGoing(!going)} aria-pressed={going} data-testid="ev-going" className={cx("shrink-0 rounded-full border px-3.5 py-1.5 text-sm", going ? "border-transparent font-semibold" : "border-line text-muted hover:text-ink")} style={going ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>Only my RSVPs</button>
      </div>
      {rows.length ? <RowList testid="ev-rows">{rows.map((m) => <Row key={m.id} m={m} onRsvp={rsvp} />)}</RowList> : <Empty>{going ? "You haven't said yes to anything yet." : "Nothing matches that filter."}</Empty>}
    </div>
  );
}
