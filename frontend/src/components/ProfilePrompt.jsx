import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Sparkles } from "lucide-react";

// The one loud call to action for people browsing without a startup profile. It is the main reason to sign up, so it is a solid,
// high-contrast block (inverted from the page in both light and dark mode) with a real button, not a faint dashed outline.
export default function ProfilePrompt({ to, title, body, cta, points = [], testId, tour, className = "" }) {
  return (
    <Link to={to} data-testid={testId} data-tour={tour}
      className={`group block overflow-hidden rounded-3xl p-5 shadow-lg transition hover:-translate-y-0.5 sm:p-6 ${className}`}
      style={{ background: "rgb(var(--c-ink))", color: "rgb(var(--c-bg))" }}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase" style={{ letterSpacing: "0.12em", background: "rgb(var(--c-bg) / 0.12)" }}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden />Free
          </span>
          <p className="mt-3 text-xl font-semibold leading-snug sm:text-2xl" style={{ letterSpacing: "-0.02em", textWrap: "balance" }}>{title}</p>
          {body && <p className="mt-1.5 text-sm leading-relaxed sm:text-base" style={{ opacity: 0.78 }}>{body}</p>}
          {points.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-sm">
              {points.map((t) => <li key={t} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{t}</span></li>)}
            </ul>
          )}
        </div>
        <span className="inline-flex min-h-[48px] w-full shrink-0 items-center justify-center gap-2 rounded-full px-6 text-base font-semibold transition group-hover:gap-3 sm:w-auto"
          style={{ background: "rgb(var(--c-bg))", color: "rgb(var(--c-ink))" }}>
          {cta}<ArrowRight className="h-4 w-4" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
