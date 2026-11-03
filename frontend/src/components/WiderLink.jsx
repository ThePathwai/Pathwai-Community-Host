import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useEcosystem } from "../lib/ecosystem";

// In a hub's ecosystem lens, a quiet card at the foot of Events / People: "this is the hub; here is the wider country". Renders nothing elsewhere.
export default function WiderLink({ kind }) {
  const eco = useEcosystem();
  if (!eco?.wider) return null;
  const copy = kind === "events"
    ? { to: "/founder-events", title: `More founder events across ${eco.wider}`, sub: "Demo days, pitch nights and conferences beyond the hub, ranked for your startup.", cta: "Browse events" }
    : { to: "/talent", title: `Looking beyond ${eco.hub}?`, sub: "Search the wider founder and talent pool: co-founders, first hires and advisors.", cta: "Search the talent pool" };
  return (
    <Link to={copy.to} className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-line p-4 hover:bg-ink/5" data-testid={`wider-${kind}`}>
      <span className="min-w-0"><span className="block font-semibold">{copy.title}</span><span className="block text-sm text-muted">{copy.sub}</span></span>
      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold">{copy.cta}<ArrowRight className="h-4 w-4" aria-hidden /></span>
    </Link>
  );
}
