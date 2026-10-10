import React from "react";
import { AlertCircle, ExternalLink, FileText, Lightbulb, Rocket, TrendingUp, Users2, Wallet } from "lucide-react";
import { Card, Chip } from "./ui";

// A founder's pitch, shown right under their profile card: the one-liner, then the same five "slides" an
// investor expects (problem, solution, traction, market, the ask) and a link to the full deck.
const SLIDES = [
  ["problem", "Problem", AlertCircle], ["solution", "Solution", Lightbulb], ["traction", "Traction", TrendingUp], ["market", "Market", Users2],
];
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

export function DocumentsCard({ docs = [], className = "" }) {
  if (!docs.length) return null;
  return (
    <ul className={"grid gap-2 sm:grid-cols-2 " + className} data-testid="profile-documents">
      {docs.map((d, i) => (
        <li key={i}>
          <a href={d.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 transition hover:bg-ink/5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}><FileText className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{d.title || host(d.url)}</span><span className="block truncate text-xs text-muted">{host(d.url)}</span></span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
          </a>
        </li>))}
    </ul>
  );
}

export default function PitchCard({ u }) {
  const p = u.pitch || {};
  const hasPitch = u.startup_name || u.startup_one_liner || Object.values(p).some(Boolean);
  const docs = (u.documents || []).filter((d) => d && d.url);
  if (!hasPitch && !docs.length) return null;
  if (!hasPitch) return <Card data-testid="documents-card"><h3 className="label">Documents & links</h3><DocumentsCard docs={docs} /></Card>;
  return (
    <Card data-testid="pitch-card" className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--accent-grad, var(--accent))", color: "var(--on-accent)" }}><Rocket className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold">{u.startup_name || u.company}</h3>
            {u.stage && <Chip accent>{u.stage}</Chip>}
            {u.industry && <Chip>{u.industry}</Chip>}
          </div>
          {u.startup_one_liner && <p className="mt-1 text-sm leading-relaxed text-ink/90" data-testid="pitch-oneliner">{u.startup_one_liner}</p>}
        </div>
      </div>
      {Object.values(p).some(Boolean) && (
        <ol className="grid gap-3 sm:grid-cols-2" data-testid="pitch-slides">
          {SLIDES.filter(([k]) => p[k]).map(([k, label, Icon], i) => (
            <li key={k} className="rounded-xl border border-line p-4">
              <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px]" style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--accent)" }}>{i + 1}</span>
                <Icon className="h-3.5 w-3.5" aria-hidden />{label}
              </div>
              <p className="text-sm leading-relaxed">{p[k]}</p>
            </li>))}
          {p.ask && (
            <li className="rounded-xl p-4 sm:col-span-2" style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)" }} data-testid="pitch-ask">
              <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}><Wallet className="h-3.5 w-3.5" aria-hidden />The ask</div>
              <p className="text-sm font-medium leading-relaxed">{p.ask}</p>
            </li>)}
        </ol>)}
      {docs.length > 0 && (<div><h4 className="label">Pitch deck & documents</h4><DocumentsCard docs={docs} /></div>)}
    </Card>
  );
}
