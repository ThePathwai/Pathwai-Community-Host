import React, { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, ArrowUpRight, Check, Flag, MapPin, Pencil } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTracked } from "../lib/useTracked";
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

function Why({ lines, caution }) {
  if (!lines.length && !caution) return null;
  return (
    <ul className="mt-3 space-y-1.5" data-testid="path-why">
      {lines.map((l) => <li key={l} className="flex gap-2 text-sm leading-snug"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden /><span>{l}</span></li>)}
      {caution && <li className="pl-6 text-xs text-muted">{caution}</li>}
    </ul>
  );
}

function Resource({ r, onOpen, onTrack }) {
  const mine = r.mine;
  const waiting = r.status === "closed" || r.status === "paused";
  const url = /^https?:\/\//.test(r.apply_url || "") ? r.apply_url : "";
  return (
    <li className="rounded-2xl border border-line bg-surface p-4" data-testid={`path-res-${r.id}`} data-mine={mine || undefined}>
      <div className="flex items-start gap-3">
        <TypeTile type={r.type} size={40} />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => onOpen(r)} className="block w-full text-left" data-testid={`path-open-${r.id}`}>
            <span className="block text-[15px] font-semibold leading-snug">{r.name}</span>
            <span className="block truncate text-xs text-muted">{r.org}</span>
          </button>
          <div className="mt-2 flex flex-wrap items-center gap-2"><Status status={r.status} /><DeadlineChip p={r} />{mine === "in" && <span className="inline-flex rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">You are in this</span>}</div>
        </div>
      </div>
      <Why lines={whyLines(r)} caution={waiting ? "Not taking applications right now, so read the page and plan for the next round." : ""} />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {url && <a href={url} target="_blank" rel="noreferrer" className="btn-primary !px-4 !py-2.5 text-sm" data-testid={`path-go-${r.id}`}>{r.link_exact === false ? "Open the closest page" : linkVerb(r)}<ArrowUpRight className="h-4 w-4" aria-hidden /></a>}
        {mine === "in"
          ? <button type="button" onClick={() => onTrack(r, "done")} className="rounded-full border border-line px-3.5 py-2 text-sm font-semibold hover:border-ink/40" data-testid={`path-done-${r.id}`}>I have done this</button>
          : <button type="button" onClick={() => onTrack(r, "in")} className="rounded-full border border-line px-3.5 py-2 text-sm font-semibold hover:border-ink/40" data-testid={`path-in-${r.id}`}>I am using this</button>}
        {mine === "in" && <button type="button" onClick={() => onTrack(r, "none")} className="px-2 py-1.5 text-sm text-muted hover:text-ink">Not for me</button>}
      </div>
      {url && <p className="mt-2.5 text-xs leading-snug text-muted" data-testid="path-link">{r.link_note} <span className="whitespace-nowrap">({hostOf(url)})</span> <button type="button" onClick={() => onOpen(r)} className="font-semibold underline hover:text-ink">Full details</button></p>}
    </li>
  );
}

function Step({ n, step, onOpen, onTrack }) {
  return (
    <section data-testid={`path-step-${step.need}`}>
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold" style={{ background: "var(--accent)", color: "var(--on-accent)" }} aria-hidden>{n}</span>
        <h2 className="min-w-0 text-xl" style={heading}>{step.title}</h2>
      </div>
      {step.resources.length ? (
        <ul className="space-y-3">{step.resources.map((r) => <Resource key={r.id} r={r} onOpen={onOpen} onTrack={onTrack} />)}</ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted" data-testid="path-step-empty">Nothing matches {step.label} right now. Adding details to your profile (province, size, who you are) can open more up.</p>
      )}
      {step.more > 0 && <Link to="/navigator" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">{step.more} more for {step.label} in Programs<ArrowRight className="h-4 w-4" aria-hidden /></Link>}
    </section>
  );
}

export default function Journey({ embedded }) {
  const { account, loading, refresh } = useAuth();
  const { tracked, setTracked, track } = useTracked();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(null);
  useEffect(() => { document.title = "Your path · Pathwai"; }, []);

  const load = useCallback(async () => {
    try { const r = await api.get("/navigator/route"); setData(r.data); setTracked(r.data.tracked || []); setError(""); }
    catch (e) { setError(e?.response?.data?.detail || "Could not load your path. Please try again."); }
  }, [setTracked]);
  useEffect(() => { if (account) load(); }, [account, load]);

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
      <div className="rounded-3xl border border-dashed border-line p-8 text-center" data-testid="journey-no-profile">
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
    body = (
      <div className="mx-auto max-w-3xl space-y-8">
        {error && <p className="rounded-xl border border-red-500/40 p-3 text-sm text-red-500" role="alert">{error}</p>}

        <section className="rounded-3xl border border-line bg-surface p-5" data-testid="path-where">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }} aria-hidden><MapPin className="h-5 w-5" /></span>
              <div><p className="text-xs font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>You are</p><p className="text-base font-semibold">{cap(data.label)}</p></div>
            </div>
            {data.next && (
              <div className="flex items-center gap-3 text-muted"><ArrowRight className="h-4 w-4" aria-hidden />
                <div><p className="text-xs font-semibold uppercase" style={{ letterSpacing: "0.12em" }}>Next</p><p className="text-base font-semibold text-ink">{cap(STAGE_LABEL[data.next])}</p></div>
              </div>
            )}
            {data.next && <button type="button" onClick={() => saveStartup({ stage: data.next }, `You are now at the ${STAGE_LABEL[data.next]} stage`)} disabled={saving} className="btn-ghost ml-auto !py-2 text-sm" data-testid="path-advance">I have reached {STAGE_LABEL[data.next]}</button>}
          </div>
          <div className="mt-4 border-t border-line pt-4">
            {data.goal
              ? <p className="text-sm"><span className="text-muted">What you are aiming for: </span><span className="font-medium">{data.goal}</span> <Link to="/me?edit=startup" className="ml-1 inline-flex items-center gap-1 text-xs font-semibold text-muted underline hover:text-ink"><Pencil className="h-3 w-3" aria-hidden />Change</Link></p>
              : <p className="text-sm text-muted">Say what you are trying to do next and it will show here. <Link to="/me?edit=startup" className="font-semibold underline hover:text-ink">Add it</Link></p>}
          </div>
        </section>

        <section data-testid="path-wants">
          <h2 className="text-xl" style={heading}>What do you want next?</h2>
          <p className="mb-3 mt-1 text-sm text-muted">Pick what you need. Each one gets its own resources below, in the order you chose them.</p>
          <div className="flex flex-wrap gap-2">
            {chosen.map((o, i) => <button key={o.key} type="button" disabled={saving} onClick={() => toggleNeed(o.key)} aria-pressed="true" data-testid={`want-${o.key}`} className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><span className="tabular-nums opacity-80">{i + 1}</span>{cap(o.label)}</button>)}
            {rest.map((o) => <button key={o.key} type="button" disabled={saving} onClick={() => toggleNeed(o.key)} aria-pressed="false" data-testid={`want-${o.key}`} className={cx("rounded-full border px-3.5 py-2 text-sm font-medium transition hover:border-ink/50", o.common ? "border-ink/40" : "border-line text-muted")}>+ {cap(o.label)}</button>)}
          </div>
          {!chosen.length && <p className="mt-3 text-sm text-muted" data-testid="path-pick">Pick at least one and your path appears here. The outlined ones are common at your stage.</p>}
        </section>

        {data.steps.map((s, i) => <Step key={s.need} n={i + 1} step={s} onOpen={setOpen} onTrack={mark} />)}

        {data.coming_up && (
          <section data-testid="path-coming">
            <h2 className="text-xl" style={heading}>Coming up at {STAGE_LABEL[data.coming_up.stage]}</h2>
            <p className="mb-3 mt-1 text-sm text-muted">{data.coming_up.programs.length ? "These open up when you get there. Worth knowing now so you can prepare." : "Nothing new opens up there, so the resources above are what to lean on."}</p>
            {data.coming_up.programs.length > 0 && (
              <ul className="space-y-2.5">
                {data.coming_up.programs.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setOpen(r)} className="flex w-full items-start gap-3 rounded-2xl border border-line p-3.5 text-left transition hover:border-ink/40" data-testid={`path-soon-${r.id}`}>
                      <TypeTile type={r.type} size={36} />
                      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{r.name}</span><span className="mt-0.5 block text-xs text-muted">{r.note}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {used.length > 0 && (
          <details className="rounded-2xl border border-line p-4" data-testid="path-used">
            <summary className="cursor-pointer text-sm font-semibold">What you have used · {used.length}</summary>
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
          </details>
        )}
        <ProgramDrawer p={open} onClose={() => setOpen(null)} tracked={tracked} onTrack={onTrack} stage={data.stage} />
      </div>
    );
  }

  const page = (
    <div className="mx-auto w-full max-w-6xl" data-testid="journey-page">
      <div className="mx-auto mb-6 max-w-3xl">
        <p className="eyebrow">Journey</p>
        <h1 className="mt-2 text-3xl sm:text-4xl" style={{ textTransform: "none", letterSpacing: "-0.03em", fontWeight: 800, textWrap: "balance" }}>{account.startup?.name ? `${account.startup.name}'s path` : "Your path"}</h1>
        <p className="mt-2 text-sm text-muted">The resources worth your time for what you want next, why each one is for you, and the exact page to go to.</p>
      </div>
      {body}
    </div>
  );
  return embedded ? page : <AccountShell active="journey">{page}</AccountShell>;
}
