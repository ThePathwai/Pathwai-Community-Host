import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, MessageCircle, Rocket, Sparkles, User, Users } from "lucide-react";
import { api } from "../lib/api";
import { Button } from "./ui";
import { Ring, Status } from "./NavBits";

// The Hub's "Your next steps" card. There is nothing to fill in here: it reads the one startup profile on your account and the
// programs every community currently lists, so it changes the moment either changes (GET /navigator/home, worked out fresh each time).
// `version` is bumped by the Hub after a profile save so this reloads straight away.

export default function NextSteps({ version, onEditProfile, onAsk, profileLink }) {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/navigator/home").then((r) => setD(r.data)).catch(() => setD({ has_profile: false, completeness: { percent: 0, missing: [] } })); }, [version]);
  if (!d) return null;

  if (!d.has_profile) {
    return (
      <section className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-5" data-testid="next-steps-empty">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><Rocket className="h-6 w-6" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold" style={{ textTransform: "none", letterSpacing: 0 }}>Where is your startup at?</p>
          <p className="mt-0.5 text-sm text-muted">Tell Pathwai once. Programs, deadlines and communities that fit you show up here and stay up to date.</p>
        </div>
        <Button onClick={() => onEditProfile(true)} data-testid="next-steps-add">Add your startup</Button>
      </section>
    );
  }
  const { startup, top, closing_soon: soon, communities, completeness: comp, new_count: fresh } = d;
  return (
    <section className="mt-6 rounded-2xl border border-line bg-surface p-4 sm:p-5" data-testid="next-steps">
      <div className="flex items-center gap-3">
        <Ring percent={comp.percent} />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Your next steps</p>
          <p className="truncate text-lg font-semibold" style={{ textTransform: "none", letterSpacing: 0 }}>{startup.name || "Your startup"} <span className="ml-1 text-sm font-normal capitalize text-muted">{startup.stage_label}</span></p>
        </div>
        {fresh > 0 && <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "var(--accent)", color: "var(--on-accent)" }} data-testid="next-steps-new">{fresh} new</span>}
      </div>

      {soon.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2" data-testid="next-steps-soon">
          {soon.slice(0, 3).map((m) => <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-sm font-medium text-amber-700 dark:text-amber-400"><Clock className="h-3.5 w-3.5" aria-hidden />{m.name} · {m.days_left} day{m.days_left === 1 ? "" : "s"}</span>)}
        </div>
      )}

      <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-3">
        {top.map((m) => (
          <li key={m.id} className="min-w-0 rounded-xl border border-line p-3" data-testid={`next-${m.id}`}>
            <div className="flex items-center gap-2"><p className="min-w-0 flex-1 truncate text-sm font-semibold">{m.name}</p><Status status={m.status} /></div>
            <p className="mt-1 line-clamp-2 text-xs text-muted">{(m.reasons || []).find((r) => !r.startsWith("Built for founders at your stage")) || m.reasons?.[0] || m.summary}</p>
          </li>
        ))}
      </ul>

      {communities.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm"><span className="inline-flex items-center gap-1.5 text-muted"><Users className="h-4 w-4" aria-hidden />Communities that fit</span>
          {communities.map((c) => <Link key={c.slug} to={`/c/${c.slug}`} className="chip !px-3 !py-1">{c.name}</Link>)}</div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button onClick={onAsk} data-testid="next-steps-ask"><MessageCircle className="h-4 w-4" />Ask the guide</Button>
        <Link to="/navigator" className="btn-ghost !py-2 text-sm" data-testid="next-steps-open">All programs <ArrowRight className="h-4 w-4" /></Link>
        {profileLink && <Link to="/me" className="btn-ghost !py-2 text-sm" data-testid="next-steps-profile"><User className="h-4 w-4" />Your profile</Link>}
        {comp.missing.length > 0 && <button type="button" onClick={() => onEditProfile(false)} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink" data-testid="next-steps-improve"><Sparkles className="h-4 w-4" aria-hidden />Add {comp.missing[0].label} for sharper matches</button>}
      </div>
    </section>
  );
}
