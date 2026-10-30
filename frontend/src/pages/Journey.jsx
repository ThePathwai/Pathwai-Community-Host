import React, { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, ArrowUpRight, Check, CheckCircle2, Flag, HelpCircle, ListChecks, MapPin, MousePointerClick, Pencil, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTracked } from "../lib/useTracked";
import { useInterest } from "../lib/useInterest";
import { isStageLine, STAGE_LABEL } from "../lib/navigator";
import AccountShell from "../components/AccountShell";
import { Status } from "../components/NavBits";
import { DeadlineChip, ProgramDrawer, TypeTile, linkVerb } from "../components/ProgramCards";
import { Spinner, cx } from "../components/ui";

// Journey: your path. Not a to-do list. You say what you want next (funding, mentors, first customers...) and for each one this page
// shows the few resources worth using, best first, each with why it is for you and the exact page to go to. Below that, what opens up
// at the next stage. Everything is read from your one startup profile (GET /navigator/route), so changing your profile changes the path.

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const heading = { textTransform: "none", letterSpacing: "-0.01em", fontWeight: 700 };

// The two short lines that say why a resource is on your path: the ones that are about you, not the stage line.
const whyLines = (r) => (r.reasons || []).filter((x) => !isStageLine(x) && !/^(Taking applications|Apply anytime|Open now|Closes in)/.test(x)).slice(0, 2);

const Widget = ({ children, className = "", ...rest }) => <section className={cx("flex flex-col rounded-3xl border border-line bg-surface p-5", className)} {...rest}>{children}</section>;
const Label = ({ children }) => <p className="text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>{children}</p>;
const smallBtn = "rounded-full border border-line px-3 py-1.5 text-[13px] font-semibold hover:border-ink/40";

function Why({ lines, caution }) {
  if (!lines.length && !caution) return null;
  return (
    <ul className="mt-2 space-y-1" data-testid="path-why">
      {lines.map((l) => <li key={l} className="flex gap-1.5 text-[13px] leading-snug"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden /><span>{l}</span></li>)}
      {caution && <li className="pl-5 text-xs text-muted">{caution}</li>}
    </ul>
  );
}

function Resource({ r, onOpen, onTrack, start }) {
  const mine = r.mine;
  const waiting = r.status === "closed" || r.status === "paused";
  const url = /^https?:\/\//.test(r.apply_url || "") ? r.apply_url : "";
  return (
    <li className="py-4 first:pt-0 last:pb-0" data-testid={`path-res-${r.id}`} data-mine={mine || undefined}>
      <div className="flex items-start gap-3">
        <TypeTile type={r.type} size={36} />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => onOpen(r)} className="block w-full text-left" data-testid={`path-open-${r.id}`}>
            <span className="block text-[15px] font-semibold leading-snug">{r.name}</span>
            <span className="block truncate text-xs text-muted">{r.org}</span>
          </button>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5"><Status status={r.status} /><DeadlineChip p={r} />{start && !mine && <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: "var(--accent)", color: "var(--on-accent)" }} data-testid="path-start-tag">Start here</span>}{mine === "in" && <span className="inline-flex rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">You are doing this</span>}</div>
          <Why lines={whyLines(r)} caution={waiting ? "Not taking applications now. Read the page and plan for the next round." : ""} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {url && <a href={url} target="_blank" rel="noreferrer" className="btn-primary !px-3.5 !py-2 text-[13px]" data-testid={`path-go-${r.id}`}>{r.link_exact === false ? "Open the closest page" : linkVerb(r)}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></a>}
            {mine === "in"
              ? <button type="button" onClick={() => onTrack(r, "done")} className={smallBtn} data-testid={`path-done-${r.id}`}title="Move it off your list and into what you have used">Mark as done</button>
              : <button type="button" onClick={() => onTrack(r, "in")} className={smallBtn} data-testid={`path-in-${r.id}`}title="Tell us you are working on this. It stays pinned at the top of its list.">I am doing this</button>}
            {mine === "in" && <button type="button" onClick={() => onTrack(r, "none")} className="px-1.5 py-1 text-[13px] text-muted hover:text-ink">Not for me</button>}
          </div>
          {url && <p className="mt-2 line-clamp-2 text-xs leading-snug text-muted" data-testid="path-link">{r.link_note} <span className="whitespace-nowrap">({hostOf(url)})</span></p>}
        </div>
      </div>
    </li>
  );
}

function Step({ n, step, onOpen, onTrack, startId }) {
  return (
    <Widget data-testid={`path-step-${step.need}`}>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold" style={{ background: "var(--accent)", color: "var(--on-accent)" }} aria-hidden>{n}</span>
        <h2 className="min-w-0 flex-1 text-lg" style={heading}>{step.title}</h2>
        {step.resources.length > 0 && <span className="shrink-0 rounded-full bg-ink/5 px-2.5 py-0.5 text-xs font-semibold text-muted tabular-nums">{step.resources.length}</span>}
      </div>
      {step.resources.length ? (
        <ul className="divide-y divide-line">{step.resources.map((r) => <Resource key={r.id} r={r} onOpen={onOpen} onTrack={onTrack} start={r.id === startId} />)}</ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted" data-testid="path-step-empty">Nothing matches {step.label} right now. Adding details to your profile (province, size, who you are) can open more up.</p>
      )}
      {step.more > 0 && <Link to="/navigator" className="mt-auto inline-flex items-center gap-1 pt-4 text-[13px] font-semibold text-muted hover:text-ink">{step.more} more for {step.label} in Programs<ArrowRight className="h-4 w-4" aria-hidden /></Link>}
    </Widget>
  );
}


// Two columns from the lg breakpoint so widgets of different heights pack without gaps; one column (in order) below it.
function useWide() {
  const q = "(min-width: 1024px)";
  const [w, setW] = useState(() => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(q).matches : false));
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const m = window.matchMedia(q); const f = () => setW(m.matches);
    f(); m.addEventListener ? m.addEventListener("change", f) : m.addListener(f);
    return () => { m.removeEventListener ? m.removeEventListener("change", f) : m.removeListener(f); };
  }, []);
  return w;
}

// First visit shows a three-step "how this works"; dismissing it is remembered on this device (per-viewer convenience only).
function useIntro() {
  const key = "pw_path_intro_seen";
  const [show, setShow] = useState(() => { try { return localStorage.getItem(key) !== "1"; } catch { return true; } });
  const set = (v) => { setShow(v); if (!v) { try { localStorage.setItem(key, "1"); } catch { /* storage is optional */ } } };
  return [show, set];
}

const HOW = [
  { Icon: ListChecks, t: "Pick what you need", d: "Funding, mentors, first customers. Choose the one or two that matter most right now." },
  { Icon: MousePointerClick, t: "Open the exact page", d: "Every resource says why it fits you and takes you straight to the right page, not a home page." },
  { Icon: CheckCircle2, t: "Mark what you do", d: "Tell us when you are doing it or done. It leaves your list and the next best one moves up." },
];

function HowItWorks({ onClose }) {
  return (
    <Widget className="mb-4" data-testid="path-how">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div><Label>New here?</Label><h2 className="mt-1 text-lg" style={heading}>How this page works</h2></div>
        <button type="button" onClick={onClose} className={smallBtn} data-testid="path-how-close">Got it</button>
      </div>
      <ol className="grid gap-4 sm:grid-cols-3">
        {HOW.map(({ Icon, t, d }, i) => (
          <li key={t} className="flex gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }} aria-hidden><Icon className="h-4 w-4" /></span>
            <div><p className="text-sm font-semibold"><span className="tabular-nums text-muted">{i + 1}. </span>{t}</p><p className="mt-0.5 text-[13px] leading-snug text-muted">{d}</p></div>
          </li>
        ))}
      </ol>
    </Widget>
  );
}

// The one thing to do now: the best resource for the first thing you asked for, with the page to open and the reason.
function NextMove({ r, step, then, onOpen, onTrack }) {
  const mine = r.mine;
  const url = /^https?:\/\//.test(r.apply_url || "") ? r.apply_url : "";
  const waiting = r.status === "closed" || r.status === "paused";
  return (
    <section className="mb-4 rounded-3xl border-2 p-5 sm:p-6" style={{ borderColor: "var(--accent)", background: "var(--surface)" }} data-testid="path-next-move">
      <div className="flex items-center gap-2"><Sparkles className="h-4 w-4" aria-hidden /><Label>{mine === "in" ? "Keep going" : "Your next move"}</Label><span className="text-xs text-muted">· {step.title.toLowerCase()}</span></div>
      <div className="mt-3 flex items-start gap-4">
        <TypeTile type={r.type} size={48} />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => onOpen(r)} className="block text-left" data-testid="path-next-open"><h2 className="text-2xl leading-tight" style={{ ...heading, letterSpacing: "-0.02em" }}>{r.name}</h2><span className="block text-sm text-muted">{r.org}</span></button>
          <div className="mt-2 flex flex-wrap items-center gap-1.5"><Status status={r.status} /><DeadlineChip p={r} /></div>
          <Why lines={whyLines(r)} caution={waiting ? "Not taking applications now. Read the page and plan for the next round." : ""} />
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            {url && <a href={url} target="_blank" rel="noreferrer" className="btn-primary" data-testid="path-next-go">{r.link_exact === false ? "Open the closest page" : linkVerb(r)}<ArrowUpRight className="h-4 w-4" aria-hidden /></a>}
            {mine === "in"
              ? <button type="button" onClick={() => onTrack(r, "done")} className="btn-ghost !py-2.5 text-sm" data-testid="path-next-done">Mark as done</button>
              : <button type="button" onClick={() => onTrack(r, "in")} className="btn-ghost !py-2.5 text-sm" data-testid="path-next-in">I am doing this</button>}
          </div>
          {url && <p className="mt-2.5 text-xs leading-snug text-muted">{r.link_note} <span className="whitespace-nowrap">({hostOf(url)})</span></p>}
        </div>
      </div>
      {then.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4 text-sm" data-testid="path-then">
          <span className="text-muted">After that</span>
          {then.map((t) => <button key={t.r.id} type="button" onClick={() => onOpen(t.r)} className="inline-flex items-center gap-1.5 font-semibold hover:underline"><span className="text-xs font-medium text-muted">{cap(t.label)}</span>{t.r.name}<ArrowRight className="h-3.5 w-3.5" aria-hidden /></button>)}
        </div>
      )}
    </section>
  );
}

export default function Journey({ embedded }) {
  const { account, loading, refresh } = useAuth();
  const { tracked, setTracked, track } = useTracked();
  const itc = useInterest();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(null);
  const wide = useWide();
  const [intro, setIntro] = useIntro();
  useEffect(() => { document.title = "Your path · Pathwai"; }, []);

  const load = useCallback(async () => {
    try { const r = await api.get("/navigator/route"); setData(r.data); setTracked(r.data.tracked || []); itc.setInterest(r.data.interest || []); setError(""); }
    catch (e) { setError(e?.response?.data?.detail || "Could not load your path. Please try again."); }
  }, [setTracked]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (account) load(); }, [account, load, itc.sig]);

  if (loading) return <Spinner />;
  if (!account) return <Navigate to="/login" replace />;

  const saveStartup = async (patch, okText) => {
    setSaving(true);
    try { await api.patch("/hub/profile", { startup: { ...(account.startup || {}), ...patch } }); await refresh(); await load(); if (okText) toast.success(okText); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not save that. Please try again."); }
    finally { setSaving(false); }
  };
  const toggleNeed = (key) => saveStartup({ needs: data.needs.includes(key) ? data.needs.filter((k) => k !== key) : [...data.needs, key] });
  const mark = async (r, state) => { await track({ id: r.id, name: r.name, org: r.org, type: r.type, state, stage: data.stage }); await load(); };
  const onTrack = async (b) => { await track(b); await load(); };

  let body;
  if (!data) body = error ? <p className="rounded-xl border border-red-500/40 p-3 text-sm text-red-500" role="alert">{error}</p> : <Spinner />;
  else if (!data.has_profile) {
    body = (
      <div className="mx-auto max-w-2xl rounded-3xl border border-dashed border-line p-8 text-center" data-testid="journey-no-profile">
        <Flag className="mx-auto h-6 w-6 text-muted" aria-hidden />
        <p className="mt-3 text-lg font-semibold">Tell us where your startup is first</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">Your path is built from your stage and what you want next. It takes a minute in your profile.</p>
        <Link to="/me?edit=startup" className="btn-primary mt-5 inline-flex">Add your startup<ArrowRight className="h-4 w-4" aria-hidden /></Link>
      </div>
    );
  } else {
    const chosen = data.options.filter((o) => data.needs.includes(o.key)).sort((a, b) => data.needs.indexOf(a.key) - data.needs.indexOf(b.key));
    const rest = data.options.filter((o) => !data.needs.includes(o.key)).sort((a, b) => (b.common ? 1 : 0) - (a.common ? 1 : 0));
    const used = tracked.filter((t) => t.state === "done" || t.state === "in");
    const items = [];
    items.push(<Widget key="where" data-testid="path-where">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }} aria-hidden><MapPin className="h-5 w-5" /></span>
              <div><Label>You are</Label><p className="text-base font-semibold">{cap(data.label)}</p></div>
            </div>
            {data.next && (
              <div className="flex items-center gap-3 text-muted"><ArrowRight className="h-4 w-4" aria-hidden />
                <div><Label>Next</Label><p className="text-base font-semibold text-ink">{cap(STAGE_LABEL[data.next])}</p></div>
              </div>
            )}
          </div>
          <div className="mt-4 border-t border-line pt-4">
            {data.goal
              ? <p className="text-sm"><span className="text-muted">What you are aiming for: </span><span className="font-medium">{data.goal}</span> <Link to="/me?edit=startup" className="ml-1 inline-flex items-center gap-1 text-xs font-semibold text-muted underline hover:text-ink"><Pencil className="h-3 w-3" aria-hidden />Change</Link></p>
              : <p className="text-sm text-muted">Say what you are trying to do next and it will show here. <Link to="/me?edit=startup" className="font-semibold underline hover:text-ink">Add it</Link></p>}
          </div>
          {data.next && <button type="button" onClick={() => saveStartup({ stage: data.next }, `You are now at the ${STAGE_LABEL[data.next]} stage`)} disabled={saving} className="btn-ghost mt-4 self-start !py-2 text-sm" data-testid="path-advance">I have reached {STAGE_LABEL[data.next]}</button>}
          {data.next && <p className="mt-1.5 text-xs text-muted">Tap it when this is true. Your whole path updates to the new stage.</p>}
        </Widget>);

    const chips = (
          <div className="flex flex-wrap gap-2">
            {chosen.map((o, i) => <button key={o.key} type="button" disabled={saving} onClick={() => toggleNeed(o.key)} aria-pressed="true" data-testid={`want-${o.key}`} className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><span className="tabular-nums opacity-80">{i + 1}</span>{cap(o.label)}</button>)}
            {rest.map((o) => <button key={o.key} type="button" disabled={saving} onClick={() => toggleNeed(o.key)} aria-pressed="false" data-testid={`want-${o.key}`} className={cx("inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition hover:border-ink/50", o.common ? "border-ink/40" : "border-line text-muted")}>+ {cap(o.label)}<span className="text-xs tabular-nums text-muted" title={`${o.count} resources for you`}>{o.count}</span></button>)}
          </div>
    );
    const moveStep = data.steps.find((st) => st.resources.length);
    const move = moveStep ? (moveStep.resources.find((r) => r.mine === "in") || moveStep.resources[0]) : null;
    const then = data.steps.filter((st) => st !== moveStep && st.resources.length).slice(0, 2).map((st) => ({ label: st.label, r: st.resources.find((r) => r.mine === "in") || st.resources[0] }));
    if (chosen.length) items.push(<Widget key="wants" data-testid="path-wants">
          <h2 className="text-lg" style={heading}>Add or change what you want</h2>
          <p className="mb-3 mt-1 text-sm text-muted">Tap to add or remove. The number is how many resources fit you. The numbered ones get a widget below, in this order.</p>
          {chips}
        </Widget>);

    data.steps.forEach((s, i) => items.push(<Step key={s.need} n={i + 1} step={s} onOpen={setOpen} onTrack={mark} startId={move && !move.mine ? move.id : ""} />));

    if (data.coming_up) items.push(
          <Widget key="coming" data-testid="path-coming">
            <Label>Coming up</Label>
            <h2 className="mt-1 text-lg" style={heading}>At {STAGE_LABEL[data.coming_up.stage]}</h2>
            <p className="mb-3 mt-1 text-sm text-muted">{data.coming_up.programs.length ? "These open up when you get there. Worth knowing now so you can prepare." : "Nothing new opens up there, so the resources above are what to lean on."}</p>
            {data.coming_up.programs.length > 0 && (
              <ul className="grid gap-2">
                {data.coming_up.programs.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setOpen(r)} className="flex h-full w-full items-start gap-3 rounded-2xl border border-line p-3 text-left transition hover:border-ink/40" data-testid={`path-soon-${r.id}`}>
                      <TypeTile type={r.type} size={32} />
                      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{r.name}</span><span className="mt-0.5 line-clamp-2 block text-xs text-muted">{r.note}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Widget>);

    if (used.length > 0) items.push(
          <Widget key="used" data-testid="path-used">
            <Label>Progress</Label>
            <h2 className="mt-1 text-lg" style={heading}>What you have used · {used.length}</h2>
            <ul className="mt-3 space-y-2">
              {used.map((t) => (
                <li key={t.id} className="flex items-center gap-2.5 text-sm">
                  <Check className={cx("h-4 w-4 shrink-0", t.state === "done" ? "text-emerald-500" : "text-amber-500")} aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                  <span className="shrink-0 text-xs text-muted">{t.state === "in" ? "In progress" : `Done at ${STAGE_LABEL[t.stage] || t.stage}`}</span>
                  {t.state === "in" && <button type="button" onClick={() => onTrack({ ...t, state: "done" })} className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold hover:border-ink/40">Done</button>}
                </li>
              ))}
            </ul>
          </Widget>);

    body = (
      <div>
        {error && <p className="mb-4 rounded-xl border border-red-500/40 p-3 text-sm text-red-500" role="alert">{error}</p>}
        {intro && <HowItWorks onClose={() => setIntro(false)} />}
        {!chosen.length && (
          <Widget className="mb-4 sm:p-6" data-testid="path-pickhero">
            <Label>Step 1 · Start here</Label>
            <h2 className="mt-1 text-2xl" style={{ ...heading, letterSpacing: "-0.02em" }}>What do you need most right now?</h2>
            <p className="mb-4 mt-1 max-w-xl text-sm text-muted" data-testid="path-pick">Pick one to three. We will show the best resources for each, why they fit you, and the exact page to open. The outlined ones are common at your stage, and the number is how many fit you.</p>
            {chips}
          </Widget>
        )}
        {move && <NextMove r={move} step={moveStep} then={then} onOpen={setOpen} onTrack={mark} />}
        {wide
          ? <div className="grid grid-cols-2 items-start gap-4"><div className="flex flex-col gap-4">{items.filter((_, i) => i % 2 === 0)}</div><div className="flex flex-col gap-4">{items.filter((_, i) => i % 2 === 1)}</div></div>
          : <div className="flex flex-col gap-4">{items}</div>}
        <ProgramDrawer p={open} onClose={() => setOpen(null)} tracked={tracked} onTrack={onTrack} interest={itc} stage={data.stage} />
      </div>
    );
  }

  const page = (
    <div className="mx-auto w-full max-w-6xl" data-testid="journey-page">
      <div className="mb-6 max-w-3xl">
        <p className="eyebrow">Journey</p>
        <h1 className="mt-2 text-3xl sm:text-4xl" style={{ textTransform: "none", letterSpacing: "-0.03em", fontWeight: 800, textWrap: "balance" }}>{account.startup?.name ? `${account.startup.name}'s path` : "Your path"}</h1>
        <p className="mt-2 text-sm text-muted">Pick what you need next. We show the best resources for it, why each one fits you, and the exact page to open. {!intro && data?.has_profile && <button type="button" onClick={() => setIntro(true)} className="ml-1 inline-flex items-center gap-1 font-semibold underline hover:text-ink" data-testid="path-how-open"><HelpCircle className="h-3.5 w-3.5" aria-hidden />How this works</button>}</p>
      </div>
      {body}
    </div>
  );
  return embedded ? page : <AccountShell active="journey">{page}</AccountShell>;
}
