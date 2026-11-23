import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, ChevronsUpDown, Clock, Compass } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";
import { isInnovation } from "../lib/communityGroup";
import { cx } from "./ui";

// Hop in and out of your communities from anywhere. Two kinds of place share one account and one profile:
//   Pathwai       the general page: all of Canada, your journey, your events and people (the account shell)
//   a community   one hub's own programs, events, people and resources (the community layout)
// Pick one and you are there. "Find communities" opens the page where you can apply to more.
// variant "side": a full-width button for the computer sidebar.  variant "chip": a small pill for a top bar (label optional).

function Mark({ c, size = 28 }) {
  return <span className="flex shrink-0 items-center justify-center rounded-lg text-xs font-bold" style={{ width: size, height: size, background: c?.brand?.colors?.accent || "var(--accent)", color: c?.brand?.colors?.on_accent || "#fff" }} aria-hidden>{(c?.name || "?").slice(0, 1)}</span>;
}

export default function SpaceSwitcher({ variant = "chip", label = true }) {
  const { account, user, config, enter, leave } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const load = useCallback(() => api.get("/hub/communities").then((r) => setData(r.data)).catch(() => setData((d) => d || { communities: [] })), []);
  // Read again whenever you hop, so the check mark and the list are always where you are now.
  useEffect(() => { if (account) load(); }, [account, user, load]);

  if (!account) return null;
  const list = (data?.communities || []).filter(isInnovation);
  const mine = list.filter((c) => c.my?.status === "approved");
  const waiting = list.filter((c) => c.my?.status === "pending");
  const isHere = (c) => !!user && (c.slug === data?.active || c.name === config?.community_name);
  const here = user ? (config?.community_name || "Your community") : "Pathwai";

  const toGeneral = async () => {
    setBusy("general");
    try { if (user) await leave(); setOpen(false); nav("/navigator"); } catch (e) { toast.error(errMsg(e, "Could not switch.")); } finally { setBusy(""); }
  };
  const toCommunity = async (c) => {
    setBusy(c.slug);
    try { if (!isHere(c)) await enter(c.slug); setOpen(false); nav("/"); } catch (e) { toast.error(errMsg(e, "Could not open this community.")); } finally { setBusy(""); }
  };

  const hereMark = user ? <Mark c={mine.find(isHere) || { name: here }} size={variant === "side" ? 32 : 22} /> : <span className={cx("flex shrink-0 items-center justify-center rounded-lg", variant === "side" ? "h-8 w-8" : "h-[22px] w-[22px]")} style={{ background: "var(--accent)", color: "var(--on-accent)" }} aria-hidden><Compass className={variant === "side" ? "h-4 w-4" : "h-3.5 w-3.5"} /></span>;

  const Row = ({ on, onClick, disabled, mark, title, sub, testId, trailing }) => (
    <button type="button" role="menuitem" onClick={onClick} disabled={disabled} data-testid={testId} aria-current={on ? "true" : undefined}
      className={cx("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition", on ? "bg-ink/10" : "hover:bg-ink/5", disabled && "opacity-60")}>
      {mark}
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{title}</span>{sub && <span className="block truncate text-xs text-muted">{sub}</span>}</span>
      {trailing || (on ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null)}
    </button>
  );

  return (
    <div className="relative" data-testid="space-switcher">
      {variant === "side" ? (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} data-testid="space-trigger" data-here={user ? "community" : "general"}
          className="flex w-full items-center gap-3 rounded-xl border border-line bg-ink/[.04] px-2.5 py-2 text-left transition hover:border-ink/30">
          {hereMark}
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold leading-tight">{here}</span><span className="block text-[11px] text-muted">{user ? "Your community" : "All of Canada"}</span></span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        </button>
      ) : (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={`Switch space. You are in ${here}`} data-testid="space-trigger" data-here={user ? "community" : "general"}
          className="flex h-9 items-center gap-1.5 rounded-full border border-line px-2 text-sm font-medium transition hover:border-ink/30">
          {hereMark}{label && <span className="max-w-[7rem] truncate">{here}</span>}<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
        </button>
      )}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div role="menu" aria-label="Switch space" style={{ background: "rgb(var(--c-surface))" }}
            className="z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-line p-1.5 shadow-xl max-sm:fixed max-sm:inset-x-3 max-sm:top-[4.5rem] sm:absolute sm:left-0 sm:w-72" data-testid="space-menu">
            <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.14em" }}>Switch space</p>
            <Row on={!user} onClick={toGeneral} disabled={busy === "general"} testId="space-general" title="Pathwai" sub="All of Canada · your journey, events and people"
              mark={<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--accent)", color: "var(--on-accent)" }} aria-hidden><Compass className="h-3.5 w-3.5" /></span>} />
            {(mine.length > 0 || waiting.length > 0) && <p className="px-2.5 pb-1 pt-2.5 text-[10px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.14em" }}>Your communities</p>}
            {mine.map((c) => <Row key={c.slug} on={isHere(c)} onClick={() => toCommunity(c)} disabled={busy === c.slug} testId={`space-${c.slug}`} title={c.name} sub={c.kind} mark={<Mark c={c} />} />)}
            {waiting.map((c) => <Row key={c.slug} disabled testId={`space-wait-${c.slug}`} title={c.name} sub="Waiting for confirmation" mark={<Mark c={c} />} trailing={<Clock className="h-4 w-4 shrink-0 text-muted" aria-hidden />} />)}
            {data && mine.length === 0 && waiting.length === 0 && <p className="px-2.5 py-2 text-xs text-muted" data-testid="space-empty">You have not joined a community yet. Your profile works in every one you join.</p>}
            <Link to="/communities" onClick={() => setOpen(false)} data-testid="space-find" className="mt-1 flex items-center gap-2 rounded-lg border-t border-line px-2.5 pb-2 pt-2.5 text-sm font-medium text-muted hover:text-ink">Find communities<ArrowRight className="ml-auto h-4 w-4" aria-hidden /></Link>
          </div>
        </>
      )}
    </div>
  );
}
