import React from "react";
import { Link } from "react-router-dom";
import { Check, Plus } from "lucide-react";

// The "finish your profile" card: says exactly which things are still needed (each one is a button that
// jumps straight to the right box on the profile page), and says plainly that links and documents
// are optional and never hold the percentage back.
export const OPTIONAL_NOTE = "LinkedIn, Instagram, website and documents are optional. They never count against you.";

export function Ring({ value, size = 56 }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 44 44" className="-rotate-90" width={size} height={size}><circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeOpacity=".14" strokeWidth="5" /><circle cx="22" cy="22" r="18" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(value / 100) * 113} 113`} /></svg>
      <span className="stat absolute inset-0 flex items-center justify-center text-xs">{value}%</span>
    </span>
  );
}

export default function ProfileNudge({ pc, className = "", showOptional = true }) {
  if (!pc) return null;
  const keys = pc.missing_keys || [];
  const items = keys.map((k, i) => ({ key: k, label: (pc.missing || [])[i] || k }));
  if (items.length === 0) {
    return (
      <div className={"flex items-center gap-3 rounded-xl border border-line bg-ink/5 p-3 " + className} data-testid="dash-completion">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><Check className="h-5 w-5" strokeWidth={3} /></span>
        <div className="min-w-0 text-sm"><p className="font-medium">Your profile is complete</p><p className="text-xs text-muted">Nice. Everyone in the community can see the full picture.</p></div>
      </div>
    );
  }
  return (
    <div className={"rounded-xl border border-line bg-ink/5 p-3.5 " + className} style={{ borderLeft: "3px solid var(--accent)" }} data-testid="dash-completion">
      <div className="flex items-center gap-3">
        <Ring value={pc.percent} />
        <div className="min-w-0 text-sm">
          <p className="font-semibold">Finish your profile</p>
          <p className="text-xs text-muted">{items.length} {items.length === 1 ? "thing" : "things"} left to reach 100%. Tap one to fill it in.</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5" data-testid="missing-list">
        {items.map((m) => (
          <Link key={m.key} to={`/profile?focus=${m.key}`} data-testid={`missing-${m.key}`}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium hover:border-ink/40">
            <Plus className="h-3 w-3" style={{ color: "var(--accent)" }} strokeWidth={3} />{m.label}
          </Link>))}
      </div>
      {showOptional && <p className="mt-2.5 text-[11px] leading-snug text-muted">{OPTIONAL_NOTE}</p>}
    </div>
  );
}
