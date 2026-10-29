import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronDown, MapPin, Search, Video } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import AccountShell from "../components/AccountShell";
import { Spinner, cx } from "../components/ui";

// Events: upcoming networking, pitch, mentor and learning events for founders, read from public event pages and ranked for your startup
// profile (province, what you asked for, the groups you belong to). Every card says why it is here and links to the organizer's own page.

const heading = { textTransform: "none", letterSpacing: "-0.01em", fontWeight: 700 };
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const MONTH = (iso) => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { month: "short" });
const DAY = (iso) => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { day: "numeric" });
const WEEKDAY = (iso) => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" });
const clock = (t) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
const when = (e) => (e.days_away === 0 ? "Today" : e.days_away === 1 ? "Tomorrow" : `${WEEKDAY(e.date)}, ${MONTH(e.date)} ${DAY(e.date)}`) + (e.time ? ` · ${clock(e.time)}` : "");
const dayLabel = (iso) => { try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return ""; } };

function Pill({ on, onClick, children, testId }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} data-testid={testId}
      className={cx("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition", on ? "border-transparent font-semibold" : "border-line text-muted hover:text-ink")}
      style={on ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>{children}</button>
  );
}

function Chip({ children, tone = "" }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", tone || "bg-ink/[.06] text-muted")}>{children}</span>;
}

const Widget = ({ children, className = "", ...rest }) => <section className={cx("flex flex-col rounded-3xl border border-line bg-surface p-5", className)} {...rest}>{children}</section>;
const Label = ({ children }) => <p className="text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>{children}</p>;
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// One event inside a week widget: date tile, what and where, why it is on your list, and the link to the organizer's own page.
function EventItem({ e, other, next }) {
  const where = e.online ? "Online" : [e.venue, e.city].filter(Boolean).join(", ") || e.province || "See the event page";
  const lines = other ? (e.cautions || []).slice(0, 1) : [...e.reasons].slice(0, 2);
  return (
    <li className="py-4 first:pt-1 last:pb-0" data-testid={`event-${e.id}`} data-fit={e.fit}>
      <div className="flex items-start gap-3.5">
        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-ink/[.06] leading-none" aria-hidden>
          <span className="text-[10px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.08em" }}>{MONTH(e.date)}</span>
          <span className="mt-0.5 text-lg font-bold tabular-nums">{DAY(e.date)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted" data-testid="event-when">{when(e)}{next && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: "var(--accent)", color: "var(--on-accent)", letterSpacing: "0.08em" }} data-testid="event-next">Next up</span>}</p>
          <h3 className="mt-0.5 text-[16px] font-semibold leading-snug" style={{ textWrap: "balance" }}>{e.title}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
            <span className="font-medium text-ink/80">{e.org}</span><span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">{e.online ? <Video className="h-3.5 w-3.5" aria-hidden /> : <MapPin className="h-3.5 w-3.5" aria-hidden />}{where}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {e.price === "free" && <Chip tone="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Free</Chip>}
            {e.price === "paid" && <Chip>Paid</Chip>}
            {e.topic_labels.map((t) => <Chip key={t}>{t}</Chip>)}
            {e.audiences.length > 0 && <Chip tone="bg-sky-500/15 text-sky-600 dark:text-sky-400">For {e.audiences.join(", ")} founders</Chip>}
          </div>
          {lines.length > 0 && (
            <ul className="mt-2 space-y-1" data-testid="event-why">
              {lines.map((l) => <li key={l} className="flex gap-1.5 text-[13px] leading-snug">{other ? <span className="text-muted">{l}</span> : <><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden /><span>{l}</span></>}</li>)}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <a href={e.url} target="_blank" rel="noreferrer" className="btn-primary !px-4 !py-2 text-sm" data-testid={`event-go-${e.id}`}>See the event page<ArrowUpRight className="h-4 w-4" aria-hidden /></a>
            <span className="text-xs text-muted">{hostOf(e.url)}</span>
          </div>
        </div>
      </div>
    </li>
  );
}

// A widget per stretch of time (this week, next week, a month), each holding its events.
function WeekWidget({ g, other, first, later }) {
  const a = g.items[0].date; const z = g.items[g.items.length - 1].date;
  const span = a === z ? `${MONTH(a)} ${DAY(a)}` : `${MONTH(a)} ${DAY(a)} to ${MONTH(z)} ${DAY(z)}`;
  return (
    <Widget data-testid={`events-week-${g.week.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-lg" style={heading}>{later ? `Later in ${new Date(g.items[0].date + "T12:00:00").toLocaleDateString(undefined, { month: "long" })}` : g.week}</h2>
        <Label>{span} · {plural(g.items.length, "event")}</Label>
      </div>
      <ul className="mt-3 divide-y divide-line">{g.items.map((e, i) => <EventItem key={e.id} e={e} other={other} next={first && i === 0 && !other} />)}</ul>
    </Widget>
  );
}

// For the platform admin only: which sources were read, how many events each gave, and a button to read them now.
function SourcesPanel() {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get("/founder-events/status").then((r) => setS(r.data)).catch(() => setS(false)), []);
  useEffect(() => { load(); }, [load]);
  if (!s) return null;
  const run = async () => {
    setBusy(true);
    try { const r = await api.post("/founder-events/refresh"); toast.success(r.data.message); setTimeout(load, 15000); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not start it."); }
    finally { setBusy(false); }
  };
  return (
    <details className="group rounded-2xl border border-dashed border-line" data-testid="events-admin">
      <summary className="flex cursor-pointer items-center justify-between gap-2 p-4 text-sm font-semibold">Event sources (admin) · {s.total_events} events stored<ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden /></summary>
      <div className="space-y-3 border-t border-dashed border-line p-4">
        <p className="text-xs text-muted">{s.enabled ? "The reader runs by itself about twice a day." : "The reader is switched off (EVENTS_SCRAPER). You can still run it by hand."} Last run: {s.last_run ? dayLabel(s.last_run) : "never"}.</p>
        <button type="button" onClick={run} disabled={busy || s.running} className="btn-ghost !py-2 text-sm" data-testid="events-run">{s.running ? "Running now" : "Run the reader now"}</button>
        <ul className="divide-y divide-line">
          {s.sources.map((r) => (
            <li key={r.id} className="py-2.5 text-sm" data-testid={`source-${r.id}`}>
              <p className="flex flex-wrap items-center gap-2"><span className="font-semibold">{r.name}</span><Chip>{r.group}</Chip>
                {r.ok === true && <Chip tone="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">{r.kept} kept of {r.found}</Chip>}
                {r.ok === false && <Chip tone="bg-red-500/15 text-red-600 dark:text-red-400">Did not work</Chip>}
                {r.ok === null && <Chip>Not run yet</Chip>}
                {r.confirmed === false && <Chip tone="bg-amber-500/15 text-amber-700 dark:text-amber-400">Address is a guess</Chip>}</p>
              <p className="mt-0.5 truncate text-xs text-muted">{r.url}</p>
              {r.error && <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">{r.error}</p>}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

export default function FounderEvents({ embedded }) {
  const { account, loading } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [view, setView] = useState("fit");
  const [topic, setTopic] = useState("");
  const [free, setFree] = useState(false);
  const [online, setOnline] = useState(false);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(12);
  useEffect(() => { document.title = "Events · Pathwai"; }, []);

  useEffect(() => {
    if (!account) return undefined;
    const t = setTimeout(() => {
      api.get("/founder-events", { params: { q: q.trim() || undefined, topic: topic || undefined, free: free || undefined, online: online || undefined } })
        .then((r) => { setData(r.data); setError(""); })
        .catch((e) => setError(e?.response?.data?.detail || "Could not load events. Please try again."));
    }, 200);
    return () => clearTimeout(t);
  }, [account, q, topic, free, online]);

  const list = useMemo(() => (data ? (view === "fit" ? data.events : data.others) : []), [data, view]);
  const groups = useMemo(() => {
    const out = [];
    for (const e of list.slice(0, limit)) { const g = out[out.length - 1]; if (g && g.week === e.week) g.items.push(e); else out.push({ week: e.week, items: [e] }); }
    return out;
  }, [list, limit]);

  if (loading) return <Spinner />;
  if (!account) return <Navigate to="/login" replace />;
  const prov = data?.profile?.province;
  const filtersOn = !!(q || topic || free || online);

  const page = (
    <div className="mx-auto w-full max-w-3xl" data-testid="events-page">
      <p className="eyebrow">Events</p>
      <h1 className="mt-2 text-3xl sm:text-4xl" style={{ textTransform: "none", letterSpacing: "-0.03em", fontWeight: 800, textWrap: "balance" }}>Events for founders</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">Upcoming networking, pitch, mentor and learning events{prov ? ` in ${prov} and online` : ""}, picked for what you asked for. Each one links to the organizer's own page.</p>

      {data && !data.has_profile && (
        <Link to="/me?edit=startup" className="mt-5 flex items-center gap-3 rounded-2xl border border-dashed border-line p-4 text-sm transition hover:border-ink/40" data-testid="events-no-profile">
          <CalendarDays className="h-5 w-5 shrink-0 text-muted" aria-hidden />
          <span className="min-w-0 flex-1"><span className="block font-semibold">Add your startup to see events that fit you</span><span className="block text-muted">These are examples for Ontario. Your province, what you need and your group sharpen the list.</span></span>
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        </Link>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-line p-1" role="tablist">
          {[["fit", `For you · ${data?.totals?.fit ?? 0}`], ["other", `Everything else · ${data?.totals?.others ?? 0}`]].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => { setView(k); setLimit(12); }} data-testid={`events-tab-${k}`}
              className={cx("rounded-full px-4 py-1.5 text-sm font-medium transition", view === k ? "" : "text-muted hover:text-ink")} style={view === k ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>{label}</button>
          ))}
        </div>
        <label className="relative block w-full sm:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setLimit(12); }} placeholder="Search events" aria-label="Search events" data-testid="events-search" className="w-full rounded-full border border-line bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:border-ink/50" /></label>
      </div>

      <div className="pw-rail -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label="Filter events">
        <Pill on={!topic} onClick={() => setTopic("")} testId="events-topic-all">All</Pill>
        {(data?.topics || []).map((t) => <Pill key={t.key} on={topic === t.key} onClick={() => setTopic(topic === t.key ? "" : t.key)} testId={`events-topic-${t.key}`}>{t.label}</Pill>)}
        <span className="mx-1 w-px shrink-0 bg-line" aria-hidden />
        <Pill on={free} onClick={() => setFree(!free)} testId="events-free">Free</Pill>
        <Pill on={online} onClick={() => setOnline(!online)} testId="events-online">Online</Pill>
      </div>

      {error && <p className="mt-4 rounded-xl border border-red-500/40 p-3 text-sm text-red-500" role="alert">{error}</p>}
      {!data && !error ? <div className="mt-10"><Spinner /></div> : data && (
        <div className="mt-6 space-y-8">
          {view === "other" && <p className="text-sm text-muted">Real events too. They are outside your province or made for a group you have not said you belong to. Each card says why.</p>}
          {groups.length > 0 && <div className="space-y-4" data-testid="events-timeline">{groups.map((g, gi) => <WeekWidget key={g.week} g={g} other={view === "other"} first={gi === 0} later={gi > 0 && groups[gi - 1].items[0].date.slice(0, 7) === g.items[0].date.slice(0, 7)} />)}</div>}
          {!list.length && (
            <div className="rounded-2xl border border-dashed border-line p-8 text-center" data-testid="events-empty">
              <CalendarDays className="mx-auto h-6 w-6 text-muted" aria-hidden />
              <p className="mt-3 font-semibold">{filtersOn ? "No events match those filters" : view === "fit" ? "No upcoming events yet" : "Nothing else to show"}</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">{filtersOn ? "Clear a filter or two to see more." : "We read event pages twice a day, so new ones appear as organizers post them. Check back soon."}</p>
              {filtersOn && <button type="button" className="btn-ghost mt-4 !py-2 text-sm" onClick={() => { setQ(""); setTopic(""); setFree(false); setOnline(false); }}>Clear filters</button>}
            </div>
          )}
          {list.length > limit && <button type="button" onClick={() => setLimit((l) => l + 12)} className="btn-ghost w-full !py-3 text-sm" data-testid="events-more">Show {Math.min(12, list.length - limit)} more</button>}
          <p className="text-xs text-muted" data-testid="events-note">Gathered from public event pages{data.updated_at ? `, last updated ${dayLabel(data.updated_at)}` : ""}. Details change, so confirm date, price and place on the event page.</p>
          <SourcesPanel />
        </div>
      )}
    </div>
  );
  return embedded ? page : <AccountShell active="events">{page}</AccountShell>;
}
