import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, List, MapPin, Search, TriangleAlert, Video } from "lucide-react";
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
  const good = (e.reasons || []).slice(0, 3);
  const watch = (e.cautions || []).slice(0, other ? 3 : 2);
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
          {(good.length > 0 || watch.length > 0) && (
            <ul className="mt-2 space-y-1" data-testid="event-why">
              {good.map((l) => <li key={l} className="flex gap-1.5 text-[13px] leading-snug" data-testid="event-reason"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden /><span>{l}</span></li>)}
              {watch.map((l) => <li key={l} className="flex gap-1.5 text-[13px] leading-snug text-ink/80" data-testid="event-caution"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden /><span>{l}</span></li>)}
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

// The few events that fit this founder best, whatever their date: made for their group, or about what they asked for, their sector or their stage.
function BestWidget({ items }) {
  return (
    <Widget data-testid="events-best" className="border-2" style={{ borderColor: "var(--accent)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-lg" style={heading}>Best for you</h2>
        <Label>Matched to your startup · {plural(items.length, "event")}</Label>
      </div>
      <ul className="mt-3 divide-y divide-line">{items.map((e) => <EventItem key={e.id} e={e} other={false} />)}</ul>
    </Widget>
  );
}

// ---------------------------------------------------------------------------------------------------- calendar
const pad = (n) => String(n).padStart(2, "0");
const isoOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayIso = () => { const t = new Date(); return isoOf(t.getFullYear(), t.getMonth(), t.getDate()); };
const CELL = { background: "rgb(var(--c-surface))" };
const CELL_BLANK = { background: "rgb(var(--c-surface) / 0.55)" };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const shortTime = (t) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}${m ? ":" + pad(m) : ""}${h < 12 ? "a" : "p"}`; };
const dayHeading = (iso) => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

// A month grid with the events on their days. Tap a day to read its events underneath. Events keep their "why it fits / why it may not" notes there.
function CalendarView({ list, other }) {
  const today = todayIso();
  const byDay = useMemo(() => {
    const m = {};
    for (const e of list) (m[e.date] = m[e.date] || []).push(e);
    return m;
  }, [list]);
  const days = useMemo(() => Object.keys(byDay).sort(), [byDay]);
  const firstDay = days.find((d) => d >= today) || days[0] || today;
  const [month, setMonth] = useState(() => ({ y: Number(firstDay.slice(0, 4)), m: Number(firstDay.slice(5, 7)) - 1 }));
  const [picked, setPicked] = useState(firstDay);
  // When the list changes (a filter, the other tab), land on its first event.
  const sig = days.join(",");
  useEffect(() => { setPicked(firstDay); setMonth({ y: Number(firstDay.slice(0, 4)), m: Number(firstDay.slice(5, 7)) - 1 }); }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  const first = new Date(month.y, month.m, 1);
  const lead = (first.getDay() + 6) % 7;                       // Monday first
  const count = new Date(month.y, month.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= count; d++) cells.push(isoOf(month.y, month.m, d));
  while (cells.length % 7) cells.push(null);
  const inMonth = days.filter((d) => d.startsWith(`${month.y}-${pad(month.m + 1)}`));
  const total = inMonth.reduce((n, d) => n + byDay[d].length, 0);
  const title = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const hasPrev = days.some((d) => d < isoOf(month.y, month.m, 1)) || isoOf(month.y, month.m, 1) > today.slice(0, 8) + "01";
  const hasNext = days.some((d) => d > isoOf(month.y, month.m, count));
  const go = (delta) => setMonth((o) => { const x = new Date(o.y, o.m + delta, 1); return { y: x.getFullYear(), m: x.getMonth() }; });
  const dayList = byDay[picked] || [];
  const nextAfter = days.find((d) => d > picked);

  return (
    <div className="space-y-5" data-testid="events-calendar">
      <section className="overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-lg leading-tight sm:text-xl" style={heading} data-testid="cal-title">{title}</h2>
            <p className="text-xs text-muted" data-testid="cal-count">{total ? `${plural(total, "event")} this month` : "No events this month"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={() => { setMonth({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }); setPicked(today); }} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:text-ink" data-testid="cal-today">Today</button>
            <button type="button" onClick={() => go(-1)} disabled={!hasPrev} aria-label="Previous month" className="grid h-8 w-8 place-items-center rounded-full border border-line transition hover:border-ink/40 disabled:opacity-30" data-testid="cal-prev"><ChevronLeft className="h-4 w-4" aria-hidden /></button>
            <button type="button" onClick={() => go(1)} disabled={!hasNext} aria-label="Next month" className="grid h-8 w-8 place-items-center rounded-full border border-line transition hover:border-ink/40 disabled:opacity-30" data-testid="cal-next"><ChevronRight className="h-4 w-4" aria-hidden /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 border-t border-line text-center text-[10px] font-semibold uppercase text-muted sm:text-[11px]" style={{ letterSpacing: "0.1em" }}>
          {WEEKDAYS.map((w) => <div key={w} className="py-2"><span className="sm:hidden">{w[0]}</span><span className="hidden sm:inline">{w}</span></div>)}
        </div>
        <div className="grid grid-cols-7 gap-px border-t border-line" style={{ background: "rgb(var(--c-line))" }} role="grid" aria-label={title}>
          {cells.map((iso, i) => {
            if (!iso) return <div key={`b${i}`} className="min-h-[56px] sm:min-h-[104px]" style={CELL_BLANK} aria-hidden />;
            const evs = byDay[iso] || [];
            const past = iso < today; const isToday = iso === today; const sel = iso === picked;
            const label = `${dayHeading(iso)}, ${evs.length ? plural(evs.length, "event") : "no events"}`;
            return (
              <button key={iso} type="button" onClick={() => setPicked(iso)} aria-label={label} aria-pressed={sel} data-testid={`cal-day-${iso}`} data-events={evs.length}
                className={cx("group relative flex min-h-[56px] flex-col items-stretch gap-1 p-1 text-left transition sm:min-h-[104px] sm:p-1.5", past && "opacity-60", sel && "z-10")}
                style={{ ...CELL, ...(sel ? { boxShadow: "inset 0 0 0 2px var(--accent)" } : null) }}>
                <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums sm:h-7 sm:w-7 sm:text-[13px]", isToday ? "" : evs.length ? "" : "text-muted")}
                  style={isToday ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>{Number(iso.slice(8))}</span>
                {/* phones: dots. wider screens: the first events as little labels */}
                {evs.length > 0 && <span className="flex flex-wrap gap-0.5 px-0.5 sm:hidden">{evs.slice(0, 3).map((e) => <span key={e.id} className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />)}{evs.length > 3 && <span className="text-[9px] leading-none text-muted">+{evs.length - 3}</span>}</span>}
                <span className="hidden min-w-0 flex-col gap-1 sm:flex">
                  {evs.slice(0, 2).map((e) => (
                    <span key={e.id} className={cx("block truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-snug", other ? "bg-ink/[.06] text-muted" : e.fit === "strong" ? "" : "bg-ink/[.07]")}
                      style={!other && e.fit === "strong" ? { background: "color-mix(in srgb, var(--accent) 22%, transparent)" } : undefined}>
                      {e.time && <span className="mr-1 font-semibold tabular-nums">{shortTime(e.time)}</span>}{e.title}
                    </span>
                  ))}
                  {evs.length > 2 && <span className="px-1.5 text-[11px] font-semibold text-muted">+{evs.length - 2} more</span>}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-[11px] text-muted sm:px-5">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm" style={{ background: "color-mix(in srgb, var(--accent) 22%, transparent)" }} aria-hidden />Matches what you asked for</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-ink/[.1]" aria-hidden />Other events</span>
        </div>
      </section>

      <section data-testid="cal-day-panel">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 className="text-lg" style={heading} data-testid="cal-day-title">{picked === today ? "Today · " : ""}{dayHeading(picked)}</h3>
          <Label>{dayList.length ? plural(dayList.length, "event") : "No events"}</Label>
        </div>
        {dayList.length > 0
          ? <Widget className="mt-3"><ul className="divide-y divide-line">{dayList.map((e) => <EventItem key={e.id} e={e} other={other} next={false} />)}</ul></Widget>
          : <div className="mt-3 rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
              Nothing on this day.{nextAfter && <> <button type="button" className="font-semibold text-ink underline underline-offset-2" onClick={() => { setPicked(nextAfter); setMonth({ y: Number(nextAfter.slice(0, 4)), m: Number(nextAfter.slice(5, 7)) - 1 }); }} data-testid="cal-jump">Jump to the next event, {dayHeading(nextAfter)}</button>.</>}
            </div>}
      </section>
    </div>
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
  const [layout, setLayout] = useState("calendar");   // a month calendar first; the plain list is one tap away
  const [topic, setTopic] = useState("");
  const [free, setFree] = useState(false);
  const [online, setOnline] = useState(false);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(12);
  useEffect(() => { document.title = "Events · Pathwai"; }, []);

  useEffect(() => {
    if (loading) return undefined;
    const t = setTimeout(() => {
      api.get("/founder-events", { params: { q: q.trim() || undefined, topic: topic || undefined, free: free || undefined, online: online || undefined } })
        .then((r) => { setData(r.data); setError(""); })
        .catch((e) => setError(e?.response?.data?.detail || "Could not load events. Please try again."));
    }, 200);
    return () => clearTimeout(t);
  }, [account, loading, q, topic, free, online]);

  const list = useMemo(() => (data ? (view === "fit" ? data.events : data.others) : []), [data, view]);
  const best = useMemo(() => (data && view === "fit" && data.best ? data.best.map((id) => data.events.find((e) => e.id === id)).filter(Boolean) : []), [data, view]);
  const groups = useMemo(() => {
    const out = [];
    for (const e of list.slice(0, limit)) { const g = out[out.length - 1]; if (g && g.week === e.week) g.items.push(e); else out.push({ week: e.week, items: [e] }); }
    return out;
  }, [list, limit]);

  if (loading) return <Spinner />;
  const prov = data?.profile?.province;
  const filtersOn = !!(q || topic || free || online);

  const page = (
    <div className={cx("mx-auto w-full", layout === "calendar" ? "max-w-5xl" : "max-w-3xl")} data-testid="events-page">
      <p className="eyebrow">Events</p>
      <h1 className="mt-2 text-3xl sm:text-4xl" style={{ textTransform: "none", letterSpacing: "-0.03em", fontWeight: 800, textWrap: "balance" }}>Events for founders</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">Upcoming networking, pitch, mentor and learning events{prov ? ` in ${prov} and online` : ""}, picked for your stage, sector, group and what you asked for. Each one links to the organizer's own page.</p>

      {data && !data.has_profile && (
        <Link to={account ? "/me?edit=startup" : "/signup"} className="mt-5 flex items-center gap-3 rounded-2xl border border-dashed border-line p-4 text-sm transition hover:border-ink/40" data-testid="events-no-profile">
          <CalendarDays className="h-5 w-5 shrink-0 text-muted" aria-hidden />
          <span className="min-w-0 flex-1"><span className="block font-semibold">{account ? "Add your startup to see events that fit you" : "Create a free account to see events that fit you"}</span><span className="block text-muted">These are examples for Ontario. Your province, what you need and your group sharpen the list.</span></span>
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        </Link>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2.5 sm:mt-6 sm:gap-3">
        <div className="flex w-full rounded-full border border-line p-1 sm:inline-flex sm:w-auto" role="tablist">
          {[["fit", `For you · ${data?.totals?.fit ?? 0}`], ["other", `Everything else · ${data?.totals?.others ?? 0}`]].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => { setView(k); setLimit(12); }} data-testid={`events-tab-${k}`}
              className={cx("flex-1 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition sm:flex-none sm:px-4 sm:py-1.5", view === k ? "" : "text-muted hover:text-ink")} style={view === k ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>{label}</button>
          ))}
        </div>
        <div className="inline-flex rounded-full border border-line p-1" role="group" aria-label="Show events as">
          {[["calendar", "Calendar", CalendarDays], ["list", "List", List]].map(([k, label, Icon]) => (
            <button key={k} type="button" aria-pressed={layout === k} onClick={() => setLayout(k)} data-testid={`events-layout-${k}`}
              className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition sm:py-1.5", layout === k ? "" : "text-muted hover:text-ink")} style={layout === k ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}><Icon className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden /><span className="max-sm:sr-only">{label}</span></button>
          ))}
        </div>
        <label className="relative block min-w-0 flex-1 sm:w-64 sm:flex-none"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
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
          {view === "fit" && best.length > 0 && <BestWidget items={best} />}
          {layout === "calendar" && list.length > 0 && <CalendarView list={list} other={view === "other"} />}
          {layout === "list" && groups.length > 0 && <div className="space-y-4" data-testid="events-timeline">{groups.map((g, gi) => <WeekWidget key={g.week} g={g} other={view === "other"} first={gi === 0} later={gi > 0 && groups[gi - 1].items[0].date.slice(0, 7) === g.items[0].date.slice(0, 7)} />)}</div>}
          {!list.length && (
            <div className="rounded-2xl border border-dashed border-line p-8 text-center" data-testid="events-empty">
              <CalendarDays className="mx-auto h-6 w-6 text-muted" aria-hidden />
              <p className="mt-3 font-semibold">{filtersOn ? "No events match those filters" : view === "fit" ? "No upcoming events yet" : "Nothing else to show"}</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">{filtersOn ? "Clear a filter or two to see more." : "We read event pages twice a day, so new ones appear as organizers post them. Check back soon."}</p>
              {filtersOn && <button type="button" className="btn-ghost mt-4 !py-2 text-sm" onClick={() => { setQ(""); setTopic(""); setFree(false); setOnline(false); }}>Clear filters</button>}
            </div>
          )}
          {layout === "list" && list.length > limit && <button type="button" onClick={() => setLimit((l) => l + 12)} className="btn-ghost w-full !py-3 text-sm" data-testid="events-more">Show {Math.min(12, list.length - limit)} more</button>}
          <p className="text-xs text-muted" data-testid="events-note">Gathered from public event pages{data.updated_at ? `, last updated ${dayLabel(data.updated_at)}` : ""}. Details change, so confirm date, price and place on the event page.</p>
          {account && <SourcesPanel />}
        </div>
      )}
    </div>
  );
  return embedded ? page : account ? <AccountShell active="events">{page}</AccountShell> : <div className="px-4 py-10">{page}</div>;
}
