import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check, Copy, Laptop, ShieldCheck, Smartphone, Users } from "lucide-react";
import { toast } from "sonner";
import { Wordmark, PoweredBy, cx } from "../components/ui";
import { demoCommunity, demoLink, startDemo } from "../lib/demo";

// /demo/humber (and /demo/<any practice community>) -- the page to send someone so they can try a practice community.
// Two big choices (what members see, what the team runs), the same on a phone and a desktop. Sample data only.
const PREVIEW = process.env.REACT_APP_PREVIEW === "true";

function Side({ role, Icon, title, chips, slug, accent }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(demoLink(role, slug)); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { toast.message(demoLink(role, slug)); }
  };
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-surface p-5 sm:p-6" data-testid={`demo-side-${role}`}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: accent, color: "#fff" }}><Icon className="h-6 w-6" /></span>
      <h2 className="mt-4 text-2xl" style={{ textTransform: "none", letterSpacing: 0 }}>{title}</h2>
      <div className="mt-3 flex flex-wrap gap-1.5">{chips.map((c) => <span key={c} className="chip">{c}</span>)}</div>
      <div className="mt-auto" />
      <button type="button" onClick={() => startDemo(role, slug)} className="mt-6 w-full rounded-lg px-4 py-3 text-base font-semibold" style={{ background: accent, color: "#fff" }} data-testid={`demo-open-${role}`}>Open</button>
      {!PREVIEW && (
        <button type="button" onClick={copy} className="mt-2 inline-flex items-center justify-center gap-2 text-sm text-muted hover:text-ink" data-testid={`demo-copy-${role}`}>
          {copied ? <><Check className="h-4 w-4" /> Link copied</> : <><Copy className="h-4 w-4" /> Copy link</>}
        </button>
      )}
    </div>
  );
}

export default function DemoLanding() {
  const { short } = useParams();
  const c = demoCommunity(short);
  useEffect(() => { document.title = c ? `${c.name} demo · Pathwai` : "Pathwai demo"; window.scrollTo(0, 0); }, [c]);
  if (!c) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-lg font-semibold">We don't have that demo.</p>
        <Link to="/login" className="btn-primary mt-5 inline-flex">See the demos</Link>
      </div>
    );
  }
  const accent = c.accent || "rgb(var(--c-ink))";
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col px-4 py-6 sm:py-10" data-testid="demo-landing">
      <header className="flex items-center justify-between gap-3">
        <Link to="/about" className="text-xl"><Wordmark name="Pathwai" brand={{}} /></Link>
        <span className="chip">Practice community · sample data</span>
      </header>

      <main className="flex flex-1 flex-col justify-center py-10 sm:py-14">
        <p className="eyebrow">Try the demo</p>
        <h1 className="mt-3 text-4xl sm:text-6xl" style={{ textWrap: "balance" }}>{c.name}</h1>
        {c.tagline && <p className="mt-3 text-lg text-muted sm:text-xl">{c.tagline}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5"><Smartphone className="h-4 w-4" /> Phone</span>
          <span className="inline-flex items-center gap-1.5"><Laptop className="h-4 w-4" /> Desktop</span>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Side role="member" Icon={Users} title="As a member" chips={c.member || ["Directory", "Events", "Perks", "Intros"]} slug={c.slug} accent={accent} />
          <Side role="admin" Icon={ShieldCheck} title="As the admin" chips={c.admin || ["Members", "Events", "Reports"]} slug={c.slug} accent={accent} />
        </div>
        <p className="mt-5 text-xs text-muted">Made-up people and events. Nothing you do is saved. Switch sides any time from the bar at the top.</p>
      </main>
      <PoweredBy className="pb-2 text-center" />
    </div>
  );
}
