import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowUpRight, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, MapPin, Search, TriangleAlert, Video } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import AccountShell from "../components/AccountShell";
import ProfilePrompt from "../components/ProfilePrompt";
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

function Chip({ children, tone = "", style }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", tone || "bg-ink/[.06] text-muted")} style={style}>{children}</span>;
}

const Widget = ({ children, className = "", ...rest }) => <section className={cx("flex flex-col rounded-3xl border border-line bg-surface p-5", className)} {...rest}>{children}</section>;
const Label = ({ children }) => <p className="text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>{children}</p>;
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// How well an event matches what this person is looking for. One scale drives the calendar chips, the legend, the badge and the date tile on every card.
//   best     the event fits your startup closely (your group, what you asked for, your sector)
//   match    it matches the topic or search you picked
//   possible it could fit, nothing says it does not
//   plain    we cannot tell yet (no startup profile and nothing picked)
//   other    it sits outside your list (other province, or a group you have not joined)
const MatchCtx = React.createContext({ other: false, filtersOn: false, label: "", topicLabel: "", hasProfile: false });
const LEVELS = { best: 0, match: 1, possible: 2, plain: 3, other: 4 };
function levelOf(e, m) {
  if (m.other) return "other";
  if (e.fit === "strong") return "best";
  if (m.filtersOn) return "match";
  return m.hasProfile ? "possible" : "plain";
}
const legendName = (lv, m) => (lv === "best" ? "Best match for your startup" : lv === "match" ? (m.label ? `Matches ${m.label}` : "Matches your search") : lv === "possible" ? "Possible match" : lv === "plain" ? "Not matched yet" : "Outside your list");
const TINT = "color-mix(in srgb, var(--accent) 16%, transparent)";
// Solid accent = best, accent outline on a tint = matches what you picked, plain grey = possible, dashed = outside your list.
const hiStyle = (lv) => (lv === "best" ? { background: "var(--accent)", color: "var(--on-accent)" } : lv === "match" ? { background: TINT, boxShadow: "inset 0 0 0 1.5px var(--accent)" } : undefined);
const hiClass = (lv) => (lv === "best" ? "font-semibold" : lv === "match" ? "font-semibold text-ink" : lv === "other" ? "border border-dashed border-ink/30 font-medium text-muted" : "bg-ink/[.08] font-medium text-ink/80");

function MatchBadge({ lv, m }) {
  if (lv === "other" || lv === "plain") return null;
  const text = lv === "best" ? "Best match" : lv === "match" ? (m.label ? `Matches ${m.label}` : "Matches your search") : "Possible match";
  return (
    <span className={cx("inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", lv === "possible" && "bg-ink/[.08] text-muted")} style={{ letterSpacing: "0.06em", ...hiStyle(lv) }} data-testid="event-match" data-level={lv}>
      {lv !== "possible" && <Check className="h-3 w-3 shrink-0" aria-hidden />}<span className="truncate">{text}</span>
    </span>
  );
}

// One event inside a week widget: date tile, what and where, why it is on your list, and the link to the organizer's own page.
function EventItem({ e, other, next }) {
  const where = e.online ? "Online" : [e.venue, e.city].filter(Boolean).join(", ") || e.province || "See the event page";
  const good = (e.reasons || []).slice(0, 3);
  const watch = (e.cautions || []).slice(0, other ? 3 : 2);
  const m = useContext(MatchCtx);
  const lv = levelOf(e, m);
  const hl = lv === "best" || lv === "match";
  return (
    <li className="py-4 first:pt-1 last:pb-0" data-testid={`event-${e.id}`} data-fit={e.fit} data-level={lv}>
      <div className="flex items-start gap-3.5">
        <div className={cx("flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl leading-none", !hl && "bg-ink/[.06]")} style={hiStyle(lv)} aria-hidden>
          <span className={cx("text-[10px] font-semibold uppercase", hl ? "opacity-80" : "text-muted")} style={{ letterSpacing: "0.08em" }}>{MONTH(e.date)}</span>
          <span className="mt-0.5 text-lg font-bold tabular-nums">{DAY(e.date)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted" data-testid="event-when">{when(e)}<MatchBadge lv={lv} m={m} />{next && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: "var(--accent)", color: "var(--on-accent)", letterSpacing: "0.08em" }} data-testid="event-next">Next up</span>}</p>
          <h3 className="mt-0.5 text-[16px] font-semibold leading-snug" style={{ textWrap: "balance" }}>{e.title}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
            <span className="font-medium text-ink/80">{e.org}</span><span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">{e.online ? <Video className="h-3.5 w-3.5" aria-hidden /> : <MapPin className="h-3.5 w-3.5" aria-hidden />}{where}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {e.price === "free" && <Chip tone="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Free</Chip>}
            {e.price === "paid" && <Chip>Paid</Chip>}
            {e.topic_labels.map((t) => (m.topicLabel && t === m.topicLabel ? <Chip key={t} tone="text-ink" style={{ background: TINT, boxShadow: "inset 0 0 0 1.5px var(--accent)" }}>{t}</Chip> : <Chip key={t}>{t}</Chip>))}
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
function CalendarView({ list }) {
  const today = todayIso();
  const mc = useContext(MatchCtx);
  const byDay = useMemo(() => {
    const m = {};
    for (const e of list) (m[e.date] = m[e.date] || []).push(e);
    // Best matches first within a day, then by start time.
    for (const d of Object.keys(m)) m[d].sort((a, b) => LEVELS[levelOf(a, mc)] - LEVELS[levelOf(b, mc)] || (a.time || "99").localeCompare(b.time || "99"));
    return m;
  }, [list, mc]);
  const counts = useMemo(() => { const c = {}; for (const e of list) { const l = levelOf(e, mc); c[l] = (c[l] || 0) + 1; } return c; }, [list, mc]);
  const present = Object.keys(LEVELS).filter((k) => counts[k] && k !== "plain").sort((a, b) => LEVELS[a] - LEVELS[b]);
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
                {evs.length > 0 && <span className="flex flex-wrap gap-0.5 px-0.5 sm:hidden">{evs.slice(0, 3).map((e) => { const lv = levelOf(e, mc); return <span key={e.id} className={cx("h-2.5 w-2.5 rounded-full", lv === "other" && "border border-dashed border-ink/50", (lv === "possible" || lv === "plain") && "bg-ink/30")} style={lv === "best" ? { background: "var(--accent)" } : lv === "match" ? { background: TINT, boxShadow: "inset 0 0 0 2px var(--accent)" } : undefined} />; })}{evs.length > 3 && <span className="text-[9px] leading-none text-muted">+{evs.length - 3}</span>}</span>}
                <span className="hidden min-w-0 flex-col gap-1 sm:flex">
                  {evs.slice(0, 2).map((e) => { const lv = levelOf(e, mc); return (
                    <span key={e.id} className={cx("block truncate rounded-md px-1.5 py-0.5 text-[11px] leading-snug", hiClass(lv))} style={hiStyle(lv)} data-level={lv}>
                      {lv === "best" && <Check className="mr-0.5 inline h-3 w-3 align-[-2px]" aria-hidden />}{e.time && <span className="mr-1 font-semibold tabular-nums">{shortTime(e.time)}</span>}{e.title}
                    </span>
                  ); })}
                  {evs.length > 2 && <span className="px-1.5 text-[11px] font-semibold text-muted">+{evs.length - 2} more</span>}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line px-4 py-2.5 text-[11px] text-muted sm:px-5" data-testid="cal-legend">
          {present.length === 0 && <span>Pick a topic above to highlight the events you are looking for.</span>}
          {present.map((lv) => (
            <span key={lv} className="inline-flex items-center gap-1.5" data-testid={`cal-legend-${lv}`}>
              <span className={cx("h-3 w-5 rounded-sm", lv === "other" && "border border-dashed border-ink/40", lv === "possible" && "bg-ink/[.08]")} style={hiStyle(lv)} aria-hidden />
              <span className="text-ink/80">{legendName(lv, mc)}</span> <span className="tabular-nums">({counts[lv]})</span>
            </span>
          ))}
        </div>
      </section>

      <section data-testid="cal-day-panel">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 className="text-lg" style={heading} data-testid="cal-day-title">{picked === today ? "Today · " : ""}{dayHeading(picked)}</h3>
          <Label>{dayList.length ? plural(dayList.length, "event") : "No events"}</Label>
        </div>
        {dayList.length > 0
          ? <Widget className="mt-3"><ul className="divide-y divide-line">{dayList.map((e) => <EventItem key={e.id} e={e} other={mc.other} next={false} />)}</ul></Widget>
          : <div className="mt-3 rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
              Nothing on this day.{nextAfter && <> <button type="button" className="font-semibold text-ink underline underline-offset-2" onClick={() => { setPicked(nextAfter); setMonth({ y: Number(nextAfter.slice(0, 4)), m: Number(nextAfter.slice(5, 7)) - 1 }); }} data-testid="cal-jump">Jump to the next event, {dayHeading(nextAfter)}</button>.</>}
            </div>}
      </section>
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

  const hasProfile = !!data?.has_profile;
  // No startup on the account yet: nothing is picked for anyone, so show every upcoming event in date order and no "for you" list.
  const list = useMemo(() => {
    if (!data) return [];
    if (!data.has_profile) return [...(data.events || []), ...(data.others || [])].sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
    return view === "fit" ? data.events : data.others;
  }, [data, view]);
  const topicLabel = (data?.topics || []).find((t) => t.key === topic)?.label || "";
  const label = [topicLabel, q.trim() && `\u201c${q.trim()}\u201d`].filter(Boolean).join(" + ");
  const mctx = useMemo(() => ({ other: view === "other", filtersOn: !!(topic || q.trim()), label, topicLabel, hasProfile }), [view, topic, q, label, topicLabel, hasProfile]);
  const nBest = useMemo(() => list.filter((e) => e.fit === "strong").length, [list]);
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
    <div className="mx-auto w-full max-w-5xl" data-testid="events-page">
      <p className="eyebrow">Events</p>
      <h1 className="mt-2 text-3xl sm:text-4xl" style={{ textTransform: "none", letterSpacing: "-0.03em", fontWeight: 800, textWrap: "balance" }}>Events for founders</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">Upcoming networking, pitch, mentor and learning events{prov ? ` in ${prov} and online` : ""}{hasProfile ? ", picked for your stage, sector, group and what you asked for" : ""}. Each one links to the organizer's own page.</p>

      {data && !data.has_profile && (
        <ProfilePrompt className="mt-5" to={account ? "/me?edit=startup" : "/signup?for=founder"} testId="events-no-profile"
          title={account ? "Add your startup to see events that fit you" : "Create a free profile to see events that fit you"}
          body="Every upcoming event is listed below. With a profile, your province, stage and what you need pick out the ones worth your time."
          cta={account ? "Add my startup" : "Create my free profile"} />
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2.5 sm:mt-6 sm:gap-3">
        {hasProfile ? <div className="flex w-full rounded-full border border-line p-1 sm:inline-flex sm:w-auto" role="tablist">
          {[["fit", `For you · ${data?.totals?.fit ?? 0}`], ["other", `Everything else · ${data?.totals?.others ?? 0}`]].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => { setView(k); setLimit(12); }} data-testid={`events-tab-${k}`}
              className={cx("flex-1 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition sm:flex-none sm:px-4 sm:py-1.5", view === k ? "" : "text-muted hover:text-ink")} style={view === k ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>{label}</button>
          ))}
        </div> : <p className="text-sm text-muted" data-testid="events-count">{data ? `${list.length} upcoming event${list.length === 1 ? "" : "s"}` : ""}</p>}
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
          {hasProfile && list.length > 0 && view === "fit" && (
            <p className="flex items-start gap-2.5 rounded-2xl border border-line px-4 py-3 text-sm" data-testid="events-match-summary" style={mctx.filtersOn || nBest ? { background: TINT, borderColor: "var(--accent)" } : undefined}>
              <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {mctx.filtersOn
                  ? <><b>{plural(list.length, "event")}</b> {list.length === 1 ? "matches" : "match"} {label}.{" "}{hasProfile ? (nBest ? `${nBest} also ${nBest === 1 ? "fits" : "fit"} your startup closely.` : "") : "Create a free account to also see which fit your startup."}</>
                  : hasProfile
                    ? (nBest ? <><b>{nBest} of {list.length}</b> events are a close match for your startup. They are in solid colour. The rest are possible matches.</> : <>None of these is a close match for your startup yet. Add what you need to your profile to sharpen the list.</>)
                    : <>These are examples, not matched to you yet. Pick a topic above to highlight the events you are looking for.</>}
              </span>
            </p>
          )}
          {list.length > 0 && <CalendarView list={list} />}
          {hasProfile && view === "fit" && best.length > 0 && <div className="max-w-3xl"><BestWidget items={best} /></div>}
          {groups.length > 0 && <div className="max-w-3xl space-y-4" data-testid="events-timeline"><h2 className="text-lg" style={heading}>All upcoming events, by date</h2>{groups.map((g, gi) => <WeekWidget key={g.week} g={g} other={view === "other"} first={gi === 0} later={gi > 0 && groups[gi - 1].items[0].date.slice(0, 7) === g.items[0].date.slice(0, 7)} />)}</div>}
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
        </div>
      )}
    </div>
  );
  const wrapped = <MatchCtx.Provider value={mctx}>{page}</MatchCtx.Provider>;
  return embedded ? wrapped : account ? <AccountShell active="events">{wrapped}</AccountShell> : <div className="px-4 py-10">{wrapped}</div>;
}
