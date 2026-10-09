import React from "react";
import { HandHelping, Lightbulb, Sparkles } from "lucide-react";

// "Why this person?" for recommended connections. One place builds the reasons and one place draws them,
// so the home page, the Connections page and a member's own profile all explain a suggestion the same way.
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const ICON = { helps_you: Lightbulb, you_help: HandHelping, shared: Sparkles };

// Works with the new `reasons` list, and falls back to the older fields so nothing breaks on older data.
export function reasonsOf(m) {
  if (m?.reasons?.length) return m.reasons;
  const out = [];
  if (m?.can_help_you?.length) out.push({ kind: "helps_you", label: "Can help you with", items: m.can_help_you.slice(0, 4).map(cap) });
  if (m?.you_can_help?.length) out.push({ kind: "you_help", label: "You can help them with", items: m.you_can_help.slice(0, 4).map(cap) });
  if (m?.shared_interests?.length) out.push({ kind: "shared", label: "You both like", items: m.shared_interests.slice(0, 4) });
  return out;
}

export function headlineOf(m) {
  if (m?.headline) return m.headline;
  const r = reasonsOf(m);
  if (r.length) return r.slice(0, 2).map((x) => `${x.kind === "you_help" ? "You can help with" : x.label} ${x.items.slice(0, 2).join(" and ")}`).join(" · ");
  return m?.why || "";
}

/** The full explanation: one labelled row per reason, each with its own chips. */
export function WhyReasons({ reasons = [], className = "" }) {
  if (!reasons.length) return null;
  return (
    <ul className={"space-y-2 " + className} data-testid="why-reasons">
      {reasons.map((r, i) => {
        const Icon = ICON[r.kind] || Sparkles;
        return (
          <li key={i} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--accent)" }}><Icon className="h-3.5 w-3.5" strokeWidth={2.5} /></span>
            <span className="min-w-0 text-sm">
              <span className="block text-xs font-semibold text-muted">{r.label}</span>
              <span className="mt-0.5 flex flex-wrap gap-1">{r.items.map((t) => <span key={t} className="rounded-full border border-line bg-ink/5 px-2 py-0.5 text-xs font-medium">{t}</span>)}</span>
            </span>
          </li>);
      })}
    </ul>
  );
}

/** A compact "why", in the community's accent colour so it reads as the reason, not as more profile text. */
export function WhyLine({ m, lines = 2, className = "" }) {
  const t = headlineOf(m);
  if (!t) return null;
  return (
    <p className={"leading-snug " + className} style={{ display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" }} data-testid="why-line">
      <Sparkles className="mr-1 inline h-3 w-3 -translate-y-px" style={{ color: "var(--accent)" }} strokeWidth={2.5} aria-hidden />
      <span className="font-medium" style={{ color: "var(--accent)" }}>Why · </span>{t}
    </p>
  );
}
