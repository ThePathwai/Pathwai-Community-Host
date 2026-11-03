import React, { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Calendar, Check, CheckCircle2, ChevronDown, CircleAlert, Clock, Landmark, MinusCircle, Rocket, Search, Users, X } from "lucide-react";
import { VERDICT, VERDICTS } from "../../lib/explain";
import { api, fmtDate } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Avatar, cx } from "../ui";

// The pieces every page of a hub's ecosystem lens is built from, so Programs, Events, People and Resources look and behave the same way:
// a ranked list, a fit label, one line saying why it is for you, and one clear action. Data comes from GET /navigator/moves (lib/moves.js).

export const heading = { textTransform: "none", letterSpacing: "-0.02em", fontWeight: 700 };
export const KIND = {
  program: { label: "Program", Icon: Rocket, color: "#6D5BD0" },
  grant: { label: "Grant", Icon: Landmark, color: "#1B9C8E" },
  event: { label: "Event", Icon: Calendar, color: "var(--accent)" },
  person: { label: "Person", Icon: Users, color: "#E76F51" },
  resource: { label: "Resource", Icon: BookOpen, color: "#C98A12" },
};
export const NEED_CHIPS = { funding: "Funding", mentorship: "Mentors", customers: "First customers", network: "Network", training: "Learning", rd: "R&D", ip: "IP", talent: "Hiring" };
export const dayShort = (iso) => { try { return new Date(String(iso).slice(0, 10) + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return ""; } };
export const daysFromNow = (iso, today) => Math.round((new Date(String(iso).slice(0, 10) + "T12:00:00Z") - new Date(today + "T12:00:00Z")) / 86400000);

export function useHubData() {
  const { account } = useAuth();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  const load = () => api.get("/navigator/moves").then((r) => setD(r.data)).catch(() => setErr(true));
  useEffect(() => { load(); }, [account?.startup]); // eslint-disable-line react-hooks/exhaustive-deps
  return { d, err, reload: load };
}

export function KindTile({ kind, size = 44 }) {
  const { Icon, color } = KIND[kind];
  return <span className="flex shrink-0 items-center justify-center rounded-xl" style={{ width: size, height: size, background: `color-mix(in srgb, ${color} 14%, transparent)`, color }} aria-hidden><Icon className="h-5 w-5" strokeWidth={2.1} /></span>;
}

// ---- the verdict system: one look for "is this for me, right now?" on every kind of thing ----
export const V = {
  now: { Icon: CheckCircle2, text: "text-emerald-700 dark:text-emerald-300", tint: "bg-emerald-500/15", bar: "bg-emerald-500", ring: "border-emerald-500/40", label: "Next step" },
  close: { Icon: CircleAlert, text: "text-amber-700 dark:text-amber-300", tint: "bg-amber-500/15", bar: "bg-amber-500", ring: "border-amber-500/40", label: "What it takes" },
  later: { Icon: Clock, text: "text-indigo-700 dark:text-indigo-300", tint: "bg-indigo-500/15", bar: "bg-indigo-500", ring: "border-indigo-500/40", label: "What it takes" },
  no: { Icon: MinusCircle, text: "text-slate-600 dark:text-slate-300", tint: "bg-slate-500/15", bar: "bg-slate-400", ring: "border-slate-400/40", label: "What it would take" },
};
const CS = {
  yes: { Icon: Check, cls: "bg-ink/[.06] text-ink/75", icon: "text-emerald-600 dark:text-emerald-400" },
  maybe: { Icon: CircleAlert, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  later: { Icon: Clock, cls: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" },
  no: { Icon: X, cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
};

export function VerdictBadge({ verdict, short = false, size = "md" }) {
  const v = V[verdict], Icon = v.Icon;
  return <span className={cx("inline-flex items-center gap-1.5 rounded-full font-semibold", v.tint, v.text, size === "lg" ? "px-3.5 py-1.5 text-sm" : "px-2.5 py-1 text-xs")} data-testid={`verdict-${verdict}`}><Icon className={size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden />{short ? VERDICT[verdict].short : VERDICT[verdict].label}</span>;
}

// The checks we ran, as small coloured chips: green tick = fine, amber = check this, blue clock = not yet, red cross = doesn't line up.
export function CheckStrip({ checks }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="What we checked">
      {checks.map((c) => { const s = CS[c.state] || CS.maybe, Icon = s.Icon; return <li key={c.key} className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", s.cls)} data-state={c.state}><Icon className={cx("h-3 w-3", s.icon)} strokeWidth={3} aria-hidden />{c.label}</li>; })}
    </ul>
  );
}

function CheckList({ checks }) {
  return (
    <ul className="space-y-2" data-testid="check-list">
      {checks.map((c) => { const s = CS[c.state] || CS.maybe, Icon = s.Icon; return (
        <li key={c.key} className="flex items-start gap-2.5 text-sm">
          <span className={cx("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full", s.cls)}><Icon className={cx("h-3 w-3", s.icon)} strokeWidth={3} aria-hidden /></span>
          <span><span className="font-semibold">{c.label}.</span> <span className="text-ink/80">{c.text}</span></span>
        </li>); })}
    </ul>
  );
}

// The card every kind of thing uses: verdict first, then what it is, the checks, why, what it takes, and the action.
export function MatchCard({ m, lead, kicker, title, sub, actions, extra, testid }) {
  const [open, setOpen] = useState(false);
  const v = V[m.verdict];
  const calm = m.verdict === "no" || m.verdict === "later";
  return (
    <article className={cx("relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition hover:shadow-md", m.verdict === "no" && "bg-ink/[.025]")} data-testid={testid} data-verdict={m.verdict}>
      <span aria-hidden className={cx("absolute inset-y-0 left-0 w-1.5", v.bar)} />
      <div className="flex flex-1 flex-col gap-3.5 p-4 pl-5 sm:p-5 sm:pl-6">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <VerdictBadge verdict={m.verdict} />
          {kicker && <span className="text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>{kicker}</span>}
        </div>
        <div className="flex items-start gap-3.5">
          {lead}
          <div className="min-w-0 flex-1">
            <h3 className={cx("text-lg font-bold leading-snug", calm && "text-ink/85")} style={{ letterSpacing: "-0.015em" }}>{title}</h3>
            {sub && <div className="mt-0.5 text-[13px] text-muted">{sub}</div>}
          </div>
        </div>
        <CheckStrip checks={m.checks} />
        {m.why && <p className="text-sm leading-snug text-ink/85">{m.why}</p>}
        {m.gap && m.verdict === "now" && (
          <p className={cx("flex items-start gap-2 text-sm font-medium", v.text)} data-testid="gap"><ArrowRight className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{m.gap}</span></p>
        )}
        {m.gap && m.verdict !== "now" && (
          <div className={cx("rounded-xl border px-3.5 py-2.5 text-sm leading-snug", v.tint, v.ring)} data-testid="gap">
            <span className={cx("mr-1.5 text-[11px] font-bold uppercase", v.text)} style={{ letterSpacing: "0.1em" }}>{v.label}</span>
            <span className="text-ink/90">{m.gap}</span>
          </div>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {actions}
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="why-toggle" className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold text-muted hover:text-ink">
            {open ? "Hide" : "How we checked"}<ChevronDown className={cx("h-3.5 w-3.5 transition", open && "rotate-180")} aria-hidden />
          </button>
        </div>
        {open && (
          <div className="space-y-3 border-t border-line pt-3.5" data-testid="details">
            <CheckList checks={m.checks} />
            {extra}
          </div>
        )}
      </div>
    </article>
  );
}

// The at-a-glance bar at the top of a page: how many are good now, almost, not yet, not for you. Also the filter.
export function SummaryBar({ counts, value, onChange, children }) {
  const vs = VERDICTS.filter((v) => counts[v] > 0);
  const total = vs.reduce((n, v) => n + counts[v], 0);
  return (
    <div className="mb-6 space-y-3" data-testid="summary">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={vs.map((v) => `${counts[v]} ${VERDICT[v].short}`).join(", ")}>
        {vs.map((v) => <span key={v} style={{ flexGrow: counts[v] }} className={cx("min-w-[10px]", V[v].bar)} />)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onChange("all")} aria-pressed={value === "all"} data-testid="sum-all" className={cx("rounded-full border px-3.5 py-1.5 text-sm transition", value === "all" ? "border-transparent font-semibold" : "border-line text-muted hover:text-ink")} style={value === "all" ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>All {total}</button>
        {vs.map((v) => {
          const on = value === v, Icon = V[v].Icon;
          return (
            <button key={v} type="button" onClick={() => onChange(on ? "all" : v)} aria-pressed={on} data-testid={`sum-${v}`}
              className={cx("inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition", on ? cx("font-semibold", V[v].tint, V[v].text, V[v].ring) : "border-line text-muted hover:text-ink")}>
              <Icon className={cx("h-4 w-4", V[v].text)} aria-hidden /><span className="tabular-nums">{counts[v]}</span> {VERDICT[v].short}
            </button>
          );
        })}
        {children}
      </div>
    </div>
  );
}

// Items grouped by verdict, each group with a plain heading saying what the colour means.
export function VerdictSections({ items, filter, render, perGroup = 6 }) {
  const [openMore, setOpenMore] = useState({});
  return (
    <div className="space-y-9">
      {VERDICTS.filter((v) => (filter === "all" || filter === v) && items.some((m) => m.verdict === v)).map((v) => {
        const list = items.filter((m) => m.verdict === v);
        const shown = openMore[v] || filter === v ? list : list.slice(0, perGroup);
        const Icon = V[v].Icon;
        return (
          <section key={v} data-testid={`group-${v}`} aria-label={VERDICT[v].group}>
            <div className="mb-3.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <h2 className="inline-flex items-center gap-2 text-xl font-bold" style={{ ...heading, letterSpacing: "-0.02em" }}><Icon className={cx("h-5 w-5 self-center", V[v].text)} aria-hidden />{VERDICT[v].group}<span className="text-base font-semibold text-muted tabular-nums">{list.length}</span></h2>
              <p className="text-sm text-muted">{VERDICT[v].blurb}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{shown.map(render)}</div>
            {list.length > shown.length && <button type="button" onClick={() => setOpenMore({ ...openMore, [v]: true })} className="btn-ghost mx-auto mt-4 flex !py-2 text-sm" data-testid={`more-${v}`}>Show {list.length - shown.length} more</button>}
          </section>
        );
      })}
    </div>
  );
}

export function PageHead({ eyebrow, title, sub, right }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-2 text-3xl sm:text-4xl" style={{ ...heading, letterSpacing: "-0.03em", textWrap: "balance" }}>{title}</h1>
        {sub && <p className="mt-2 max-w-2xl text-sm text-muted">{sub}</p>}
      </div>
      {right}
    </header>
  );
}

// One row of pills that filters a list. items = [[key, label, count?]].
export function Chips({ items, value, onChange, label = "Filter", testid = "hub-chips" }) {
  return (
    <div className="pw-rail -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" role="group" aria-label={label} data-testid={testid}>
      {items.map(([k, text, n]) => {
        const on = value === k;
        return (
          <button key={k} type="button" onClick={() => onChange(k)} aria-pressed={on} data-testid={`${testid}-${k}`}
            className={cx("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition", on ? "border-transparent font-semibold" : "border-line text-muted hover:text-ink")}
            style={on ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>{text}{n != null && <span className="text-xs opacity-70">{n}</span>}</button>
        );
      })}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder, testid = "hub-search" }) {
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-sm">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <input className="input !rounded-full !py-2.5 !pl-10" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} data-testid={testid} />
    </div>
  );
}

export function Empty({ children }) {
  return <p className="rounded-2xl bg-ink/[.04] p-5 text-sm text-muted" data-testid="hub-empty">{children}</p>;
}

// The list wrapper: a bordered card of rows separated by hairlines.
export function RowList({ children, testid = "hub-rows" }) {
  return <ul className="card divide-y divide-line !p-0" data-testid={testid}>{children}</ul>;
}

// The need filters worth showing for a list: only the ones at least one item speaks to, with how many.
export function needChips(list) {
  const n = {};
  for (const m of list) for (const k of m.needs || []) if (NEED_CHIPS[k]) n[k] = (n[k] || 0) + 1;
  return [["all", "All", list.length], ...Object.entries(n).sort((a, b) => b[1] - a[1]).map(([k, c]) => [k, NEED_CHIPS[k], c])];
}

export function PersonAvatar({ m, size = 48 }) { return <Avatar src={m.avatar} name={m.title} size={size} />; }

export { ArrowRight, fmtDate };
