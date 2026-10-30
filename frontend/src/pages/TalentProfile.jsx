import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Plus, X } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import AccountShell from "../components/AccountShell";
import { Avatar, Spinner, cx } from "../components/ui";

// Your talent profile: what you do, what you are open to, where you are. Nothing is shown to anyone until you switch "Show me in Talent" on.

const heading = { textTransform: "none", letterSpacing: "-0.01em", fontWeight: 700 };
const errMsg = (e) => e?.response?.data?.detail || "Something went wrong. Please try again.";
const Widget = ({ children, className = "", ...rest }) => <section className={cx("rounded-3xl border border-line bg-surface p-5", className)} {...rest}>{children}</section>;
const Label = ({ children, hint }) => <div className="mb-2"><p className="text-sm font-semibold">{children}</p>{hint && <p className="text-xs text-muted">{hint}</p>}</div>;
const Chip = ({ children, tone = "" }) => <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", tone || "bg-ink/[.06] text-muted")}>{children}</span>;

function Pill({ on, onClick, children, testId }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} data-testid={testId}
      className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition", on ? "border-transparent font-semibold" : "border-line text-muted hover:text-ink")}
      style={on ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>{children}</button>
  );
}
const toggle = (list, k, max = 99) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k].slice(0, max));

function Switch({ on, onChange, label, hint, testId }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} data-testid={testId} className="flex w-full items-start gap-3 text-left">
      <span className={cx("mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition", on ? "" : "bg-ink/15")} style={on ? { background: "var(--accent)" } : undefined}>
        <span className={cx("h-5 w-5 rounded-full bg-white shadow transition", on ? "translate-x-5" : "")} />
      </span>
      <span className="min-w-0"><span className="block text-[15px] font-semibold">{label}</span><span className="block text-xs text-muted">{hint}</span></span>
    </button>
  );
}

// What other people will see, updating as you type.
function Preview({ t, name, avatar, opt }) {
  const label = (list, k) => list.find((x) => x.key === k)?.label || k;
  return (
    <div className="rounded-3xl border border-line bg-surface p-5" data-testid="tp-preview">
      <p className="mb-3 text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>How you will look</p>
      <div className="flex items-start gap-3.5">
        <Avatar src={avatar} name={name} size={52} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-semibold leading-snug">{name}</h3>
          <p className="mt-0.5 text-sm leading-snug text-ink/85">{t.headline || <span className="text-muted">Your headline appears here</span>}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            {(t.city || t.province) && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden />{[t.city, t.province].filter(Boolean).join(", ")}</span>}
            {t.work_mode.length > 0 && <span>{t.work_mode.map((m) => label(opt.work_mode, m)).join(" or ")}</span>}
            {t.experience && <span>{label(opt.experience, t.experience)}</span>}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {t.availability === "now" && <Chip tone="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Available now</Chip>}
        {t.availability === "soon" && <Chip tone="bg-amber-500/15 text-amber-700 dark:text-amber-400">Within a month</Chip>}
        {t.open_to.map((o) => <Chip key={o} tone="bg-sky-500/15 text-sky-600 dark:text-sky-400">{label(opt.open_to, o)}</Chip>)}
      </div>
      {t.skills.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{t.skills.slice(0, 8).map((s) => <Chip key={s}>{s}</Chip>)}</div>}
      {t.about && <p className="mt-3 text-sm leading-snug text-muted">{t.about}</p>}
    </div>
  );
}

export default function TalentProfile({ embedded }) {
  const { account, loading } = useAuth();
  const [opt, setOpt] = useState(null);
  const [me, setMe] = useState(null);
  const [t, setT] = useState(null);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(true);
  useEffect(() => { document.title = "Your talent profile · Pathwai"; }, []);
  useEffect(() => {
    if (!account) return;
    api.get("/talent/options").then((r) => setOpt(r.data)).catch(() => {});
    api.get("/talent/me").then((r) => { setMe(r.data); setT({ ...r.data.talent, province: r.data.talent.province || r.data.defaults.province }); }).catch((e) => toast.error(errMsg(e)));
  }, [account]);
  const set = (patch) => { setT((x) => ({ ...x, ...patch })); setSaved(false); };

  const suggested = useMemo(() => {
    if (!opt || !t) return [];
    const picked = new Set(t.skills.map((s) => s.toLowerCase()));
    return opt.categories.filter((c) => t.categories.includes(c.key)).flatMap((c) => c.skills).filter((s) => !picked.has(s.toLowerCase())).slice(0, 14);
  }, [opt, t]);

  if (loading) return <Spinner />;
  if (!account) return <Navigate to="/login" replace />;
  if (!opt || !t || !me) return embedded ? <Spinner /> : <AccountShell active="talent"><Spinner /></AccountShell>;

  const addSkill = (s) => { const v = s.trim(); if (!v || t.skills.some((x) => x.toLowerCase() === v.toLowerCase())) return; set({ skills: [...t.skills, v].slice(0, 12) }); setCustom(""); };
  const ready = !!(t.headline.trim() && t.categories.length && t.open_to.length);
  const save = async () => {
    setBusy(true);
    try { const r = await api.put("/talent/me", t); setMe(r.data); setT(r.data.talent); setSaved(true); toast.success(r.data.talent.listed ? "Saved. You are in the talent pool." : "Saved. You are not listed yet."); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const page = (
    <div className="mx-auto w-full max-w-6xl" data-testid="tp-page">
      <Link to="/talent" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" aria-hidden />Talent</Link>
      <p className="eyebrow mt-4">Talent</p>
      <h1 className="mt-2 text-3xl sm:text-4xl" style={{ textTransform: "none", letterSpacing: "-0.03em", fontWeight: 800 }}>Your talent profile</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">Tell founders and startups what you do and what you are open to. Nothing shows until you switch it on, and your email is never shown.</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="space-y-4">
          <Widget data-testid="tp-visibility">
            <Switch on={t.listed} onChange={(on) => set({ listed: on })} label="Show me in Talent" hint="Founders and startups can find you and send a message request. You choose whether to reply. Turn it off any time." testId="tp-listed" />
            {t.listed && !ready && <p className="mt-3 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400" data-testid="tp-incomplete">To be listed, add a headline, pick at least one area of work, and say what you are open to.</p>}
          </Widget>

          <Widget>
            <h2 className="text-lg" style={heading}>What you do</h2>
            <div className="mt-4 space-y-5">
              <div><Label hint="One line that says who you are and what you are good at.">Headline</Label>
                <input value={t.headline} onChange={(e) => set({ headline: e.target.value })} maxLength={90} placeholder="e.g. Full-stack developer, React and Python" data-testid="tp-headline" className="w-full rounded-xl border border-line bg-transparent px-3 py-2.5 text-sm outline-none focus:border-ink/50" /></div>
              <div><Label hint="Pick up to 4.">Areas of work</Label>
                <div className="flex flex-wrap gap-2">{opt.categories.map((c) => <Pill key={c.key} on={t.categories.includes(c.key)} onClick={() => set({ categories: toggle(t.categories, c.key, 4) })} testId={`tp-cat-${c.key}`}>{c.label}</Pill>)}</div></div>
              <div><Label hint="Up to 12. Tap a suggestion or type your own.">Skills</Label>
                {t.skills.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{t.skills.map((s) => <span key={s} className="inline-flex items-center gap-1 rounded-full bg-ink/[.08] py-1 pl-3 pr-1.5 text-sm">{s}<button type="button" onClick={() => set({ skills: t.skills.filter((x) => x !== s) })} aria-label={`Remove ${s}`} className="rounded-full p-0.5 text-muted hover:text-ink"><X className="h-3.5 w-3.5" aria-hidden /></button></span>)}</div>}
                {suggested.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{suggested.map((s) => <button key={s} type="button" onClick={() => addSkill(s)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-3 py-1 text-xs text-muted hover:text-ink"><Plus className="h-3 w-3" aria-hidden />{s}</button>)}</div>}
                <div className="flex gap-2"><input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(custom); } }} maxLength={40} placeholder="Add your own skill" data-testid="tp-skill-input" className="min-w-0 flex-1 rounded-xl border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-ink/50" /><button type="button" onClick={() => addSkill(custom)} className="btn-ghost !py-2 text-sm">Add</button></div></div>
              <div><Label hint="A few lines on what you have done and what you want to work on.">About</Label>
                <textarea value={t.about} onChange={(e) => set({ about: e.target.value })} maxLength={400} rows={4} data-testid="tp-about" className="w-full rounded-xl border border-line bg-transparent p-3 text-sm outline-none focus:border-ink/50" />
                <p className="mt-1 text-right text-xs tabular-nums text-muted">{t.about.length}/400</p></div>
            </div>
          </Widget>

          <Widget>
            <h2 className="text-lg" style={heading}>What you are open to</h2>
            <div className="mt-4 space-y-5">
              <div><Label>Kind of work</Label><div className="flex flex-wrap gap-2">{opt.open_to.map((o) => <Pill key={o.key} on={t.open_to.includes(o.key)} onClick={() => set({ open_to: toggle(t.open_to, o.key) })} testId={`tp-open-${o.key}`}>{o.label}</Pill>)}</div></div>
              <div><Label>When can you start</Label><div className="flex flex-wrap gap-2">{opt.availability.map((o) => <Pill key={o.key} on={t.availability === o.key} onClick={() => set({ availability: t.availability === o.key ? "" : o.key })} testId={`tp-avail-${o.key}`}>{o.label}</Pill>)}</div></div>
              <div><Label>How you like to work</Label><div className="flex flex-wrap gap-2">{opt.work_mode.map((o) => <Pill key={o.key} on={t.work_mode.includes(o.key)} onClick={() => set({ work_mode: toggle(t.work_mode, o.key) })} testId={`tp-mode-${o.key}`}>{o.label}</Pill>)}</div></div>
              <div><Label>Experience</Label><div className="flex flex-wrap gap-2">{opt.experience.map((o) => <Pill key={o.key} on={t.experience === o.key} onClick={() => set({ experience: t.experience === o.key ? "" : o.key })} testId={`tp-exp-${o.key}`}>{o.label}</Pill>)}</div></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>Province</Label><select value={t.province} onChange={(e) => set({ province: e.target.value })} data-testid="tp-province" className="w-full rounded-xl border border-line bg-transparent px-3 py-2.5 text-sm outline-none focus:border-ink/50"><option value="">Choose</option>{opt.provinces.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
                <div><Label>City</Label><input value={t.city} onChange={(e) => set({ city: e.target.value })} maxLength={60} data-testid="tp-city" className="w-full rounded-xl border border-line bg-transparent px-3 py-2.5 text-sm outline-none focus:border-ink/50" /></div>
              </div>
            </div>
          </Widget>

          <Widget data-testid="tp-startup">
            <h2 className="text-lg" style={heading}>Your startup</h2>
            {me.has_startup ? (
              <div className="mt-3 space-y-4">
                <Switch on={t.startup_listed} onChange={(on) => set({ startup_listed: on })} label={`Show ${me.startup_name} to talent`} hint="Skilled people can see what you are building and who you are looking for, and message you." testId="tp-startup-listed" />
                {t.startup_listed && (
                  <>
                    <div><Label hint="Pick up to 6. Matching people are shown your startup first.">Who are you looking for</Label><div className="flex flex-wrap gap-2">{opt.categories.filter((c) => c.key !== "other").map((c) => <Pill key={c.key} on={t.hiring_for.includes(c.key)} onClick={() => set({ hiring_for: toggle(t.hiring_for, c.key, 6) })} testId={`tp-hire-${c.key}`}>{c.label}</Pill>)}</div></div>
                    <div><Label hint="One or two lines about the role or help you need.">Note</Label><textarea value={t.hiring_note} onChange={(e) => set({ hiring_note: e.target.value })} maxLength={200} rows={2} data-testid="tp-hiring-note" className="w-full rounded-xl border border-line bg-transparent p-3 text-sm outline-none focus:border-ink/50" /></div>
                  </>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">Add your startup to your profile and you can show it here too, so talent can find you. <Link to="/me?edit=startup" className="font-semibold text-ink underline">Add your startup</Link></p>
            )}
          </Widget>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={save} disabled={busy || saved} className="btn-primary !px-6 !py-3" data-testid="tp-save">{busy ? "Saving…" : saved ? "Saved" : "Save changes"}</button>
            <Link to="/talent" className="btn-ghost !px-5 !py-3">Back to Talent</Link>
          </div>
        </div>
        <div className="lg:sticky lg:top-6"><Preview t={t} name={account.name} avatar={account.avatar_url} opt={opt} /></div>
      </div>
    </div>
  );
  return embedded ? page : <AccountShell active="talent">{page}</AccountShell>;
}
