import React, { useState } from "react";
import { Check, ChevronDown, MapPin } from "lucide-react";
import { STATUS_LABEL } from "../lib/navigator";
import { TypeTile } from "./ProgramCards";
import { cx } from "./ui";

// "Your trajectory": the five stages of a company laid out as a route. Behind you (done, muted), you are here (lit),
// ahead (dashed, with the programs that open up next). Wide screens read left to right; narrow ones read top to bottom.

const STATE_TEXT = { past: "Behind you", current: "Right now", future: "Ahead" };
const DOT = { open: "#34D399", rolling: "#34D399", check: "#FBBF24", closed: "#94A3B8", paused: "#94A3B8" };
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const ink = (a) => `rgb(var(--c-ink) / ${a})`;

function Node({ state, n }) {
  if (state === "current") {
    return <span className="pw-pulse relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }} data-testid="traj-here"><MapPin className="h-[18px] w-[18px]" aria-hidden /></span>;
  }
  if (state === "past") {
    return <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: ink(0.78), color: "rgb(var(--c-surface))" }}><Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /></span>;
  }
  return <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-dashed text-xs font-bold text-muted" style={{ borderColor: ink(0.35), background: "rgb(var(--c-surface))" }}>{n}</span>;
}

function HereTag() {
  return <span className="relative z-10 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: "var(--accent)", color: "var(--on-accent)", letterSpacing: "0.1em" }}>You are here</span>;
}

function Mini({ r, state, onPick }) {
  return (
    <button type="button" onClick={() => onPick && onPick(r)} data-testid={`traj-prog-${r.id}`}
      className={cx("flex w-full items-start gap-2 rounded-xl border p-2 text-left transition hover:border-ink/40", state === "past" && "opacity-70 hover:opacity-100", state === "future" ? "border-dashed border-line" : "border-line bg-surface")}>
      <TypeTile type={r.type} size={28} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-[13px] font-semibold leading-snug">{r.name}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted"><span className="h-1.5 w-1.5 rounded-full" style={{ background: DOT[r.status] || DOT.check }} aria-hidden />{STATUS_LABEL[r.status] || r.status}</span>
      </span>
    </button>
  );
}

function Programs({ c, onPick, cols }) {
  if (!c.programs.length) return <p className="text-xs text-muted">Nothing listed for this stage yet.</p>;
  const extra = c.available - c.programs.length;
  return (
    <>
      <ul className={cx("space-y-2", cols && "sm:grid sm:space-y-0 sm:gap-2 sm:grid-cols-2 lg:grid-cols-3")}>{c.programs.map((r) => <li key={r.id}><Mini r={r} state={c.state} onPick={onPick} /></li>)}</ul>
      {extra > 0 && <p className="mt-2 text-[11px] text-muted">+{extra} more at this stage</p>}
    </>
  );
}

// Horizontal route for wide screens.
function Wide({ stages, onPick }) {
  return (
    <ol className="hidden grid-cols-5 gap-3 xl:grid" data-testid="traj-wide">
      {stages.map((c, i) => (
        <li key={c.stage} className="relative rounded-2xl border p-3" style={c.state === "current" ? { borderColor: "var(--accent)", background: ink(0.035) } : { borderColor: "transparent" }} data-testid={`traj-stage-${c.stage}`}>
          <div className="relative flex h-10 items-center gap-2">
            <Node state={c.state} n={i + 1} />
            {c.state === "current" && <HereTag />}
            {i < stages.length - 1 && <span className="absolute left-9 top-1/2 h-0 border-t-2" style={{ right: -16, borderTopStyle: c.state === "past" ? "solid" : "dashed", borderColor: c.state === "past" ? ink(0.55) : ink(0.28) }} aria-hidden />}
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>{STATE_TEXT[c.state]}</p>
          <p className="mt-0.5 text-lg font-bold leading-tight">{cap(c.label)}</p>
          <p className="mt-0.5 text-xs text-muted">{c.hint}</p>
          <p className="mb-3 mt-1 text-xs font-medium text-ink/70">{c.available} programs</p>
          <Programs c={c} onPick={onPick} />
        </li>
      ))}
    </ol>
  );
}

// Vertical route for narrow screens (and the compact Home card).
function Tall({ stages, index, onPick, compact }) {
  const [open, setOpen] = useState(() => ({ [index]: true, [index + 1]: true }));
  const toggle = (i) => setOpen((o) => ({ ...o, [i]: !o[i] }));
  return (
    <ol className={cx(!compact && "xl:hidden")} data-testid={compact ? "traj-compact" : "traj-tall"}>
      {stages.map((c, i) => {
        const isOpen = compact ? i === index || i === index + 1 : !!open[i];
        const names = c.programs.map((r) => r.name).join(" · ");
        const Head = compact ? "div" : "button";
        return (
          <li key={c.stage} className="relative pb-5 pl-12 last:pb-0" data-testid={`traj-stage-${c.stage}`}>
            {i < stages.length - 1 && <span className="absolute bottom-0 left-[19px] top-9 border-l-2" style={{ borderLeftStyle: c.state === "past" ? "solid" : "dashed", borderColor: c.state === "past" ? ink(0.55) : ink(0.28) }} aria-hidden />}
            <span className="absolute left-0 top-0 flex w-10 justify-center"><Node state={c.state} n={i + 1} /></span>
            <Head {...(compact ? {} : { type: "button", onClick: () => toggle(i), "aria-expanded": isOpen })} className="flex min-h-[40px] w-full items-center gap-2 text-left">
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>{STATE_TEXT[c.state]}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-base font-bold leading-tight">{cap(c.label)}</span>{c.state === "current" && <HereTag />}</span>
              </span>
              {!compact && <><span className="shrink-0 text-xs text-muted">{c.available}</span><ChevronDown className={cx("h-4 w-4 shrink-0 text-muted transition", isOpen && "rotate-180")} aria-hidden /></>}
            </Head>
            {isOpen ? (
              <div className="mt-2">
                {!compact && <p className="mb-2 text-xs text-muted">{c.hint}</p>}
                {compact ? <ul className="space-y-2">{c.programs.slice(0, 2).map((r) => <li key={r.id}><Mini r={r} state={c.state} onPick={onPick} /></li>)}</ul> : <Programs c={c} onPick={onPick} cols />}
              </div>
            ) : (
              <p className="mt-0.5 truncate text-xs text-muted">{compact ? `${c.available} programs` : names || "Nothing listed yet"}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function Trajectory({ data, onPick, compact }) {
  if (!data || !data.stages || !data.stages.length) return null;
  if (compact) return <Tall stages={data.stages} index={data.index} onPick={onPick} compact />;
  return (
    <div data-testid="trajectory">
      <Wide stages={data.stages} onPick={onPick} />
      <Tall stages={data.stages} index={data.index} onPick={onPick} />
    </div>
  );
}
