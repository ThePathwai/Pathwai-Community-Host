import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, BadgeCheck, Check, Circle, Clock, Info, MessageCircle, TriangleAlert, X } from "lucide-react";
import { Status } from "./NavBits";
import ScrollLock from "./ScrollLock";
import { useShell } from "./AccountShell";
import { STAGES, STATUS_HELP, TYPE_LABEL } from "../lib/navigator";
import { deadlineInfo, leadReason, tint, typeMeta } from "../lib/programStyle";
import { cx } from "./ui";

// The program pieces shared by Home, Programs and the Navigator: a card for scanning, a drawer for the detail, and the three-step path.

const FIT = { strong: { n: 3, label: "Strong fit" }, possible: { n: 2, label: "Possible fit" }, later: { n: 1, label: "Later" } };
const VERIFIED = { official: "Official page", third_party: "Third-party source", unconfirmed: "Not confirmed" };
const isExternal = (u) => /^https?:\/\//.test(u || "");
const dayLabel = (iso) => { try { return new Date(iso + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); } catch { return iso || ""; } };

// Three bars, like a signal meter: more bars, better fit. Says it in a glance and avoids a made-up percentage.
export function FitMeter({ fit, showLabel = true }) {
  const f = FIT[fit];
  if (!f) return null;
  return (
    <span className="inline-flex items-center gap-1.5" title={f.label}>
      <span className="flex items-end gap-[3px]" aria-hidden>{[1, 2, 3].map((i) => <span key={i} className="w-[4px] rounded-sm" style={{ height: 6 + i * 3, background: i <= f.n ? "#34D399" : "rgb(var(--c-ink) / 0.18)" }} />)}</span>
      {showLabel && <span className="text-xs font-semibold text-muted">{f.label}</span>}
    </span>
  );
}

export function TypeTile({ type, size = 40 }) {
  const { color, Icon } = typeMeta(type);
  return <span className="flex shrink-0 items-center justify-center rounded-xl" style={{ width: size, height: size, background: tint(color, 0.16), color }}><Icon style={{ width: size * 0.5, height: size * 0.5 }} aria-hidden /></span>;
}

export function DeadlineChip({ p, className }) {
  const d = deadlineInfo(p);
  if (!d) return null;
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", d.urgent ? "bg-red-500/15 text-red-500" : d.soon ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-ink/10 text-muted", className)}><Clock className="h-3 w-3" aria-hidden />{d.text}</span>;
}

// A program as a card to scan. Tapping it opens the drawer.
export function ProgramCard({ p, onOpen }) {
  const { color } = typeMeta(p.type);
  const lead = leadReason(p);
  const unmatched = p.fit === "skip" ? (p.cautions || [])[0] : "";
  return (
    <button type="button" onClick={() => onOpen(p)} data-testid={`program-${p.id}`}
      className="group flex h-full w-full flex-col rounded-2xl border border-line p-4 text-left transition hover:-translate-y-0.5 hover:border-ink/30 hover:shadow-lg"
      style={{ background: `linear-gradient(140deg, ${tint(color, 0.1)} 0%, transparent 52%), rgb(var(--c-surface))` }}>
      <span className="flex items-center gap-3">
        <TypeTile type={p.type} />
        <span className="min-w-0 flex-1"><span className="block text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>{TYPE_LABEL[p.type] || p.type}</span>
          {p.community ? <span className="block truncate text-xs font-medium" style={{ color }}>From {p.community.name}</span> : <span className="block truncate text-xs text-muted">{p.org}</span>}</span>
        <FitMeter fit={p.fit} showLabel={false} />
      </span>
      <span className="mt-3 block text-[17px] font-semibold leading-snug" style={{ textWrap: "balance" }}>{p.name}</span>
      {p.community && <span className="mt-0.5 block truncate text-xs text-muted">{p.org}</span>}
      {unmatched ? <span className="mt-2 flex gap-2 text-sm text-muted" data-testid="card-unmatched"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span className="line-clamp-2">Not matched to you: {unmatched.charAt(0).toLowerCase() + unmatched.slice(1)}</span></span>
        : lead ? <span className="mt-2 flex gap-2 text-sm text-ink/80"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden /><span className="line-clamp-2">{lead}</span></span>
        : p.summary && <span className="mt-2 line-clamp-2 text-sm text-muted">{p.summary}</span>}
      <span className="mt-auto flex items-center gap-2 pt-4">
        <Status status={p.status} />
        <DeadlineChip p={p} />
        <ArrowRight className="ml-auto h-4 w-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden />
      </span>
    </button>
  );
}

function Section({ title, children }) {
  return <div><p className="eyebrow">{title}</p><div className="mt-3">{children}</div></div>;
}

// The detail: a right-hand panel on a computer, a bottom sheet on a phone. Everything about one program, with the way to apply pinned at the bottom.
export function ProgramDrawer({ p, onClose, meta, tracked, onTrack, stage }) {
  const shell = useShell();
  useEffect(() => {
    if (!p) return undefined;
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [p, onClose]);
  if (!p) return null;
  const { color } = typeMeta(p.type);
  const dl = deadlineInfo(p);
  const reasons = [...(p.reasons || [])].sort((a, b) => /^Built for founders at your stage/.test(a) - /^Built for founders at your stage/.test(b));
  const cautions = (p.cautions || []).filter(Boolean);
  const unmatched = p.fit === "skip";
  const mineRow = (tracked || []).find((t) => t.id === p.id);
  // "Done" is filed under the latest stage the program serves that you have reached, so it lands in the right place in your history.
  const doneStage = (() => {
    const at = Math.max(0, STAGES.indexOf(stage));
    const hit = (p.stages || []).map((x) => STAGES.indexOf(x)).filter((i) => i >= 0 && i <= at);
    return STAGES[hit.length ? Math.max(...hit) : at];
  })();
  const mark = (state) => onTrack && onTrack({ id: p.id, name: p.name, org: p.org, type: p.type, state, stage: state === "done" ? doneStage : stage });
  const cta = isExternal(p.apply_url)
    ? <a href={p.apply_url} target="_blank" rel="noreferrer" className="btn-primary flex-1 !py-3" data-testid={`apply-${p.id}`}>{p.community ? "See it" : "Open official page"}<ArrowUpRight className="h-4 w-4" /></a>
    : <Link to={p.apply_url || "/"} className="btn-primary flex-1 !py-3" data-testid={`apply-${p.id}`}>{p.community ? "See it" : "Open page"}<ArrowRight className="h-4 w-4" /></Link>;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={p.name} data-testid="program-drawer">
      <ScrollLock />
      <button type="button" aria-label="Close" onClick={onClose} className="pw-fade absolute inset-0 cursor-default bg-black/60 backdrop-blur-[2px]" />
      <div className="pw-drawer absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-2xl sm:inset-x-auto sm:bottom-0 sm:right-0 sm:top-0 sm:max-h-none sm:w-[500px] sm:rounded-none sm:rounded-l-3xl sm:border-y-0 sm:border-r-0">
        <div className="relative shrink-0 px-5 pb-5 pt-5 sm:px-7 sm:pt-7" style={{ background: `linear-gradient(160deg, ${tint(color, 0.22)} 0%, transparent 75%)` }}>
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/20 sm:hidden" aria-hidden />
          <button type="button" onClick={onClose} aria-label="Close" data-testid="drawer-close" className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-ink/10 hover:bg-ink/20 sm:right-5 sm:top-5"><X className="h-4 w-4" /></button>
          <div className="flex items-center gap-3 pr-10"><TypeTile type={p.type} size={48} /><div className="min-w-0"><p className="text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>{TYPE_LABEL[p.type] || p.type}{p.level ? ` · ${p.level}` : ""}</p><p className="truncate text-sm text-muted">{p.org}</p></div></div>
          <h2 className="mt-4 text-2xl leading-tight sm:text-[28px]" style={{ textTransform: "none", letterSpacing: "-0.02em", fontWeight: 800, textWrap: "balance" }}>{p.name}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2"><Status status={p.status} /><DeadlineChip p={p} />{p.community && <Link to={`/c/${p.community.slug}`} className="chip chip-accent">From {p.community.name}</Link>}</div>
          {STATUS_HELP[p.status] && <p className="mt-2 text-xs text-muted">{STATUS_HELP[p.status]}</p>}
        </div>

        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto overscroll-contain px-5 pb-6 pt-2 sm:px-7">
          {(p.fit || dl || p.amount) && (
            <div className="grid grid-cols-2 gap-2">
              {p.fit && <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>For you</p><div className="mt-2">{unmatched ? <span className="text-sm font-semibold text-muted">Not matched</span> : <FitMeter fit={p.fit} />}</div></div>}
              <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>Deadline</p>
                <p className="mt-1.5 text-sm font-semibold">{dl ? `${dl.date} · ${dl.days}d left` : p.deadline?.kind === "rolling" ? "No deadline" : p.deadline?.kind === "annual" ? "Yearly" : "Not published"}</p></div>
            </div>
          )}
          {p.amount && <div className="rounded-2xl p-4" style={{ background: tint(color, 0.12), border: `1px solid ${tint(color, 0.3)}` }}><p className="text-[11px] font-semibold uppercase" style={{ letterSpacing: "0.12em", color }}>What you get</p><p className="mt-1.5 text-[15px] leading-snug">{p.amount}</p></div>}
          {p.summary && <p className="text-[15px] leading-relaxed text-ink/90">{p.summary}</p>}

          {reasons.length > 0 && <Section title="Why it fits you"><ul className="space-y-2.5">{reasons.map((r) => <li key={r} className="flex gap-2.5 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden /><span>{r}</span></li>)}</ul></Section>}
          {cautions.length > 0 && <Section title={unmatched ? "Why it is not matched to you" : "Watch out for"}><ul className="space-y-2.5">{cautions.map((r) => <li key={r} className="flex gap-2.5 text-sm text-ink/80"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden /><span>{r}</span></li>)}</ul></Section>}
          {(p.requirements || []).length > 0 && <Section title="What they ask for"><ul className="space-y-2.5">{p.requirements.map((r) => <li key={r} className="flex gap-2.5 text-sm text-ink/80"><Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden /><span>{r}</span></li>)}</ul></Section>}

          {onTrack && (
            <Section title="Your journey">
              <div className="flex flex-wrap gap-2" data-testid="drawer-journey">
                <button type="button" onClick={() => mark("in")} aria-pressed={mineRow?.state === "in"} data-testid="track-in"
                  className={cx("rounded-full border px-3.5 py-2 text-sm font-semibold transition", mineRow?.state === "in" ? "border-transparent" : "border-line hover:border-ink/40")} style={mineRow?.state === "in" ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>I'm in this now</button>
                <button type="button" onClick={() => mark("done")} aria-pressed={mineRow?.state === "done"} data-testid="track-done"
                  className={cx("rounded-full border px-3.5 py-2 text-sm font-semibold transition", mineRow?.state === "done" ? "border-transparent" : "border-line hover:border-ink/40")} style={mineRow?.state === "done" ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>I've done this</button>
                {mineRow && <button type="button" onClick={() => onTrack({ id: p.id, state: "none" })} className="rounded-full px-3 py-2 text-sm text-muted hover:text-ink" data-testid="track-remove">Remove</button>}
              </div>
              <p className="mt-2 text-xs text-muted">Kept on your profile. Programs you've done are filed under the stage you were at, out of the way.</p>
            </Section>
          )}

          <p className="flex items-center gap-1.5 text-xs text-muted" title={meta?.notes || ""}><BadgeCheck className={cx("h-4 w-4", p.verified === "official" ? "text-emerald-500" : "")} aria-hidden />{VERIFIED[p.verified] || ""}{p.last_checked ? ` · checked ${dayLabel(p.last_checked)}` : ""}. Details change, so confirm on the official page.</p>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-line bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-7">
          {cta}
          {shell && <button type="button" onClick={() => { onClose(); shell.openGuide(`Tell me about ${p.name}`); }} className="btn-ghost !px-4 !py-3" aria-label="Ask the guide about this" data-testid="drawer-ask"><MessageCircle className="h-4 w-4" /><span className="hidden sm:inline">Ask</span></button>}
        </div>
      </div>
    </div>
  );
}

// The three-step plan: a horizontal timeline on a computer, a vertical one on a phone. Tapping a step opens that program.
export function PathTimeline({ path, onPick, vertical }) {
  return (
    <ol className={cx("grid gap-5", !vertical && "md:grid-cols-3 md:gap-4")} data-testid="nav-path">
      {path.map((s, i) => (
        <li key={s.phase} className="relative">
          {i < path.length - 1 && <><span className={cx("absolute left-[13px] top-9 bottom-[-1.25rem] w-px bg-line", !vertical && "md:hidden")} aria-hidden />{!vertical && <span className="absolute left-12 right-[-0.5rem] top-[13px] hidden h-px bg-line md:block" aria-hidden />}</>}
          <button type="button" onClick={() => onPick(s.program_id)} data-testid={`path-${s.phase}`} className={cx("group flex w-full gap-3 text-left", !vertical && "md:flex-col")}>
            <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={i === 0 ? { background: "var(--accent)", color: "var(--on-accent)" } : { background: "rgb(var(--c-surface))", border: "1px solid rgb(var(--c-ink) / 0.3)" }}>{i + 1}</span>
            <span className="min-w-0 pb-1">
              <span className="block text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>{s.label}</span>
              <span className="mt-0.5 block text-base font-semibold leading-snug group-hover:underline">{s.name}</span>
              <span className="mt-0.5 block text-sm text-muted">{s.why}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
