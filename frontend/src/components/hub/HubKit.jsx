import React, { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Calendar, Check, Landmark, Rocket, Search, Users } from "lucide-react";
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

// "Strong match" / "Good match": the answer to "is this for me?" before reading anything. Weak matches stay quiet.
export function FitPill({ fit }) {
  if (fit !== "strong" && fit !== "good") return null;
  const strong = fit === "strong";
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", strong ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-ink/[.07] text-ink/80")}>{strong && <Check className="h-3 w-3" aria-hidden />}{strong ? "Strong match" : "Good match"}</span>;
}

export function Why({ text }) {
  if (!text) return null;
  return <p className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-snug text-ink/80"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden /><span>{text}</span></p>;
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
