import React from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Check, ChevronRight } from "lucide-react";
import { fmtDate } from "../lib/api";

// The home page's "come to something" card. Filled with the community's own accent colour (and
// readable text from its on-accent colour) so it's the first thing the eye lands on; each event is a
// big tappable row with a date tile, and one clear button leads to the full list.
const soft = (pct) => `color-mix(in srgb, var(--on-accent) ${pct}%, transparent)`;

export default function UpcomingEvents({ events = [], total, max = 3, className = "" }) {
  const shown = [...events].sort((a, b) => (a.starts_at || "").localeCompare(b.starts_at || "")).slice(0, max);
  const n = total ?? events.length;
  return (
    <section data-testid="dash-events" className={"relative flex flex-col overflow-hidden rounded-2xl p-4 lg:p-5 " + className}
      style={{ background: "var(--accent)", backgroundImage: "var(--accent-grad, none)", color: "var(--on-accent)", boxShadow: "0 14px 36px -18px var(--accent)" }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 whitespace-nowrap text-base"><CalendarDays className="h-4 w-4" strokeWidth={2.25} aria-hidden />Upcoming events</h2>
        {n > 0 && <span className="stat whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px]" style={{ background: soft(18) }}>{n} coming up</span>}
      </div>
      {shown.length === 0 ? (
        <p className="py-3 text-sm opacity-90">Nothing on the calendar yet. Check back soon.</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((e) => {
            const d = new Date(e.starts_at);
            return (
              <li key={e.id}>
                <Link to={`/events/${e.id}`} data-testid="dash-event" className="flex items-center gap-3 rounded-xl p-2 transition hover:brightness-110" style={{ background: soft(14) }}>
                  <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg leading-none" style={{ background: "var(--on-accent)", color: "var(--accent)" }}>
                    <span className="text-[9px] font-bold uppercase tracking-wide">{isNaN(d) ? "" : d.toLocaleString(undefined, { month: "short" })}</span>
                    <span className="stat text-lg">{isNaN(d) ? "" : d.getDate()}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{e.title}</span>
                    <span className="block truncate text-xs opacity-80">{fmtDate(e.starts_at, { weekday: "short", hour: "numeric", minute: "2-digit" })}{e.location ? ` · ${e.location}` : ""}</span>
                  </span>
                  {e.going ? <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" title="You're going" aria-label="You're going" style={{ background: "var(--on-accent)", color: "var(--accent)" }}><Check className="h-3.5 w-3.5" strokeWidth={3.5} /></span>
                    : <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />}
                </Link>
              </li>);
          })}
        </ul>)}
      <Link to="/events" data-testid="dash-events-all" className="mt-3 flex items-center justify-center gap-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition hover:brightness-95" style={{ background: "var(--on-accent)", color: "var(--accent)" }}>
        {shown.length === 0 ? "Browse events" : "See all events"} <ChevronRight className="h-4 w-4" />
      </Link>
    </section>
  );
}
