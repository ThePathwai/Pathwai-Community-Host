import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, List as ListIcon, MapPin, Search, Video } from "lucide-react";
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

function EventCard({ e, other }) {
  const where = e.online ? "Online" : [e.venue, e.city].filter(Boolean).join(", ") || e.province || "Location on the event page";
  const lines = other ? e.cautions : [...e.reasons].slice(0, 2);
  return (
    <li className="rounded-2xl border border-line bg-surface p-4 sm:p-5" data-testid={`event-${e.id}`} data-fit={e.fit}>
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-ink/[.06] leading-none" aria-hidden>
          <span className="text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.08em" }}>{MONTH(e.date)}</span>
          <span className="mt-1 text-xl font-bold tabular-nums">{DAY(e.date)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted" data-testid="event-when">{when(e)}</p>
          <h3 className="mt-0.5 text-[17px] font-semibold leading-snug" style={{ textWrap: "balance" }}>{e.title}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
            <span className="font-medium text-ink/80">{e.org}</span><span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">{e.online ? <Video className="h-3.5 w-3.5" aria-hidden /> : <MapPin className="h-3.5 w-3.5" aria-hidden />}{where}</span>
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {e.price === "free" && <Chip tone="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Free</Chip>}
            {e.price === "paid" && <Chip>Paid</Chip>}
            {e.topic_labels.map((t) => <Chip key={t}>{t}</Chip>)}
            {e.audiences.length > 0 && <Chip tone="bg-sky-500/15 text-sky-600 dark:text-sky-400">For {e.audiences.join(", ")} founders</Chip>}
          </div>
          {e.summary && <p className="mt-2.5 line-clamp-2 text-sm leading-snug text-ink/80">{e.summary}</p>}
          {lines.length > 0 && (
            <ul className="mt-2.5 space-y-1" data-testid="event-why">
              {lines.map((l) => <li key={l} className="flex gap-1.5 text-[13px] leading-snug">{other ? <span className="pl-5 text-muted">{l}</span> : <><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden /><span>{l}</span></>}</li>)}
            </ul>
          )}
          <div className="mt-3.5 flex flex-wrap items-center gap-3">
            <a href={e.url} target="_blank" rel="noreferrer" className="btn-primary !px-4 !py-2.5 text-sm" data-testid={`event-go-${e.id}`}>See the event page<ArrowUpRight className="h-4 w-4" aria-hidden /></a>
            <span className="text-xs text-muted">{hostOf(e.url)}</span>
          </div>
        </div>
      </div>
    </li>
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

// ---- Calendar view: widgets (month grid, the selected day, what is coming up, this month in numbers) over the same ranked list ----
const pad2 = (n) => String(n).padStart(2, "0");
const isoOf = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
const monthTitle = (y, m) => new Date(Date.UTC(y, m, 1, 12)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
const longDay = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const shortDay = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const WEEK = ["S", "M", "T", "W", "T", "F", "S"];
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const whereOf = (e) => (e.online ? "Online" : [e.venue, e.city].filter(Boolean).join(", ") || e.province || "See the event page");

const CalWidget = ({ children, className = "", ...rest }) => <section className={cx("flex flex-col rounded-3xl border border-line bg-surface p-4 sm:p-5", className)} {...rest}>{children}</section>;
const CalLabel = ({ children }) => <p className="text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>{children}</p>;

function EventRow({ e, other }) {
  const why = other ? e.cautions?.[0] : e.reasons?.[0];
  return (
    <li className="rounded-2xl border border-line p-4" data-testid={`event-${e.id}`} data-fit={e.fit}>
      <p className="text-xs font-semibold text-muted">{e.time ? clock(e.time) : "Time on the event page"}</p>
      <h4 className="mt-0.5 text-base font-semibold leading-snug" style={{ textWrap: "balance" }}>{e.title}</h4>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
        <span className="font-medium text-ink/80">{e.org}</span><span aria-hidden>·</span>
        <span className="inline-flex items-center gap-1">{e.online ? <Video className="h-3.5 w-3.5" aria-hidden /> : <MapPin className="h-3.5 w-3.5" aria-hidden />}{whereOf(e)}</span>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {e.price === "free" && <Chip tone="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Free</Chip>}
        {e.price === "paid" && <Chip>Paid</Chip>}
        {e.topic_labels.map((t) => <Chip key={t}>{t}</Chip>)}
        {e.audiences.length > 0 && <Chip tone="bg-sky-500/15 text-sky-600 dark:text-sky-400">For {e.audiences.join(", ")} founders</Chip>}
      </div>
      {e.summary && <p className="mt-2 line-clamp-2 text-sm leading-snug text-ink/80">{e.summary}</p>}
      {why && <p className={cx("mt-2 flex gap-1.5 text-[13px] leading-snug", other && "text-muted")}>{!other && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />}<span>{why}</span></p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <a href={e.url} target="_blank" rel="noreferrer" className="btn-primary !px-4 !py-2 text-sm" data-testid={`event-go-${e.id}`}>See the event page<ArrowUpRight className="h-4 w-4" aria-hidden /></a>
        <span className="text-xs text-muted">{hostOf(e.url)}</span>
      </div>
    </li>
  );
}

function CalendarView({ list, other, today }) {
  const byDate = useMemo(() => { const m = {}; for (const e of list) (m[e.date] = m[e.date] || []).push(e); return m; }, [list]);
  const upcoming = useMemo(() => list.filter((e) => e.date >= today), [list, today]);
  const first = (upcoming[0] || list[0])?.date || today;
  const [sel, setSel] = useState(first);
  const [cur, setCur] = useState({ y: +first.slice(0, 4), m: +first.slice(5, 7) - 1 });
  const dayRef = React.useRef(null);
  const pick = (iso, scroll) => {
    setSel(iso); setCur({ y: +iso.slice(0, 4), m: +iso.slice(5, 7) - 1 });
    if (scroll) try { dayRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch { /* older browsers */ }
  };
  const go = (d) => setCur((c) => { const n = new Date(Date.UTC(c.y, c.m + d, 1)); return { y: n.getUTCFullYear(), m: n.getUTCMonth() }; });

  const lead = new Date(Date.UTC(cur.y, cur.m, 1)).getUTCDay();
  const days = new Date(Date.UTC(cur.y, cur.m + 1, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const inMonth = list.filter((e) => e.date.startsWith(`${cur.y}-${pad2(cur.m + 1)}`));
  const dayEvents = byDate[sel] || [];
  const next = upcoming.find((e) => e.date > sel);
  const soon = upcoming.slice(0, 5);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start" data-testid="cal-view">
      <div className="space-y-4">
        <CalWidget data-testid="cal-month">
          <div className="flex items-center justify-between gap-2">
            <div><CalLabel>Calendar</CalLabel><h2 className="mt-1 text-xl" style={heading} data-testid="cal-title">{monthTitle(cur.y, cur.m)}</h2></div>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => pick(today, false)} className="rounded-full border border-line px-3 py-1.5 text-[13px] font-semibold hover:border-ink/40" data-testid="cal-today">Today</button>
              <button type="button" onClick={() => go(-1)} aria-label="Previous month" className="grid h-8 w-8 place-items-center rounded-full border border-line hover:border-ink/40" data-testid="cal-prev"><ChevronLeft className="h-4 w-4" aria-hidden /></button>
              <button type="button" onClick={() => go(1)} aria-label="Next month" className="grid h-8 w-8 place-items-center rounded-full border border-line hover:border-ink/40" data-testid="cal-next"><ChevronRight className="h-4 w-4" aria-hidden /></button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1 text-center" role="grid" aria-label={monthTitle(cur.y, cur.m)}>
            {WEEK.map((w, i) => <span key={i} className="pb-1 text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.08em" }} aria-hidden>{w}</span>)}
            {cells.map((d, i) => {
              if (!d) return <span key={`b${i}`} />;
              const iso = isoOf(cur.y, cur.m, d); const ev = byDate[iso] || []; const on = iso === sel; const isToday = iso === today; const past = iso < today;
              return (
                <button key={iso} type="button" role="gridcell" onClick={() => pick(iso, true)} aria-pressed={on} aria-label={`${longDay(iso)}${ev.length ? `, ${plural(ev.length, "event")}` : ""}`} data-testid={`cal-day-${iso}`} data-events={ev.length}
                  className={cx("flex h-12 flex-col items-center justify-center gap-1 rounded-2xl text-sm tabular-nums transition sm:h-14", on ? "font-bold" : ev.length ? "font-semibold hover:bg-ink/[.06]" : "text-muted hover:bg-ink/[.04]", past && !on && "opacity-50", isToday && !on && "ring-1 ring-ink/40")}
                  style={on ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>
                  <span className="leading-none">{d}</span>
                  <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
                    {ev.slice(0, 3).map((e) => <span key={e.id} className="h-1.5 w-1.5 rounded-full" style={{ background: on ? "var(--on-accent)" : other ? "currentColor" : "var(--accent)", opacity: on ? 0.9 : other ? 0.5 : 1 }} />)}
                    {ev.length > 3 && <span className="text-[9px] leading-none">+</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted">{inMonth.length ? `${plural(inMonth.length, "event")} this month. Pick a day to see them.` : "No events this month. Try the next one."}</p>
        </CalWidget>

        <div ref={dayRef}><CalWidget data-testid="cal-selected">
          <CalLabel>{sel === today ? "Today" : sel < today ? "Earlier" : "Selected day"}</CalLabel>
          <h2 className="mt-1 text-xl" style={heading}>{longDay(sel)}</h2>
          <p className="mt-0.5 text-sm text-muted">{dayEvents.length ? plural(dayEvents.length, "event") : "Nothing listed"}</p>
          {dayEvents.length > 0 ? <ul className="mt-4 space-y-3">{dayEvents.map((e) => <EventRow key={e.id} e={e} other={other} />)}</ul> : (
            <div className="mt-4 rounded-2xl border border-dashed border-line p-5 text-center" data-testid="cal-empty-day">
              <p className="text-sm text-muted">No events on this day.</p>
              {next && <button type="button" onClick={() => pick(next.date, false)} className="btn-ghost mt-3 !py-2 text-sm" data-testid="cal-jump">Next event: {shortDay(next.date)}<ArrowRight className="h-4 w-4" aria-hidden /></button>}
            </div>
          )}
        </CalWidget></div>
      </div>

      <div className="space-y-4">
        <CalWidget data-testid="cal-coming">
          <CalLabel>Coming up</CalLabel>
          {soon.length ? (
            <ul className="mt-3 divide-y divide-line">
              {soon.map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => pick(e.date, true)} className="flex w-full items-center gap-3 py-3 text-left first:pt-1 last:pb-0" data-testid={`cal-coming-${e.id}`}>
                    <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-ink/[.06] leading-none" aria-hidden>
                      <span className="text-[10px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.08em" }}>{MONTH(e.date)}</span>
                      <span className="mt-0.5 text-base font-bold tabular-nums">{DAY(e.date)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.06em" }}>{e.days_away === 0 ? "Today" : e.days_away === 1 ? "Tomorrow" : WEEKDAY(e.date)}{e.time ? ` · ${clock(e.time)}` : ""}</span>
                      <span className="block truncate text-sm font-semibold">{e.title}</span>
                      <span className="block truncate text-xs text-muted">{e.org} · {whereOf(e)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-muted">Nothing upcoming with these filters.</p>}
        </CalWidget>

        <CalWidget data-testid="cal-month-stats">
          <CalLabel>{new Date(Date.UTC(cur.y, cur.m, 1, 12)).toLocaleDateString(undefined, { month: "long", timeZone: "UTC" })} in numbers</CalLabel>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[["Events", inMonth.length], ["Online", inMonth.filter((e) => e.online).length], ["Free", inMonth.filter((e) => e.price === "free").length]].map(([k, n]) => (
              <div key={k} className="rounded-2xl bg-ink/[.04] px-2 py-3"><p className="text-2xl font-bold tabular-nums" style={{ letterSpacing: "-0.02em" }}>{n}</p><p className="text-xs text-muted">{k}</p></div>
            ))}
          </div>
        </CalWidget>
      </div>
    </div>
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
  const [mode, setModeRaw] = useState(() => { try { return localStorage.getItem("pw_events_view") === "list" ? "list" : "calendar"; } catch { return "calendar"; } });
  const setMode = (m) => { setModeRaw(m); try { localStorage.setItem("pw_events_view", m); } catch { /* private window */ } };
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
    <div className={cx("mx-auto w-full", mode === "calendar" ? "max-w-6xl" : "max-w-4xl")} data-testid="events-page" data-view={mode}>
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
        <div className="flex w-full items-center gap-2 sm:w-auto">
        <div className="inline-flex rounded-full border border-line p-1" role="group" aria-label="View">
          {[["calendar", "Calendar", CalendarDays], ["list", "List", ListIcon]].map(([k, label, Icon]) => (
            <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)} data-testid={`events-view-${k}`}
              className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition", mode === k ? "" : "text-muted hover:text-ink")} style={mode === k ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}><Icon className="h-4 w-4" aria-hidden />{label}</button>
          ))}
        </div>
        <label className="relative block min-w-0 flex-1 sm:w-56 sm:flex-none"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setLimit(12); }} placeholder="Search events" aria-label="Search events" data-testid="events-search" className="w-full rounded-full border border-line bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:border-ink/50" /></label>
        </div>
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
          {mode === "calendar" && list.length > 0 && <CalendarView key={`${view}|${topic}|${free}|${online}|${q}`} list={list} other={view === "other"} today={data.as_of} />}
          {mode === "list" && groups.map((g) => (
            <section key={g.week} data-testid={`events-week-${g.week.toLowerCase().replace(/\s+/g, "-")}`}>
              <h2 className="mb-3 text-base" style={heading}>{g.week}</h2>
              <ul className="space-y-3">{g.items.map((e) => <EventCard key={e.id} e={e} other={view === "other"} />)}</ul>
            </section>
          ))}
          {!list.length && (
            <div className="rounded-2xl border border-dashed border-line p-8 text-center" data-testid="events-empty">
              <CalendarDays className="mx-auto h-6 w-6 text-muted" aria-hidden />
              <p className="mt-3 font-semibold">{filtersOn ? "No events match those filters" : view === "fit" ? "No upcoming events yet" : "Nothing else to show"}</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">{filtersOn ? "Clear a filter or two to see more." : "We read event pages twice a day, so new ones appear as organizers post them. Check back soon."}</p>
              {filtersOn && <button type="button" className="btn-ghost mt-4 !py-2 text-sm" onClick={() => { setQ(""); setTopic(""); setFree(false); setOnline(false); }}>Clear filters</button>}
            </div>
          )}
          {mode === "list" && list.length > limit && <button type="button" onClick={() => setLimit((l) => l + 12)} className="btn-ghost w-full !py-3 text-sm" data-testid="events-more">Show {Math.min(12, list.length - limit)} more</button>}
          <p className="text-xs text-muted" data-testid="events-note">Gathered from public event pages{data.updated_at ? `, last updated ${dayLabel(data.updated_at)}` : ""}. Details change, so confirm date, price and place on the event page.</p>
          <SourcesPanel />
        </div>
      )}
    </div>
  );
  return embedded ? page : <AccountShell active="events">{page}</AccountShell>;
}
