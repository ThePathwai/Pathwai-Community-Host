import React from "react";
import { Link } from "react-router-dom";
import { Check, Plus, RotateCcw } from "lucide-react";
import { Card, cx } from "./ui";
import { STAGE_LABEL } from "../lib/navigator";

// What has happened to the business since it started: the updates a founder logs (a customer, funding, a snag) and each pivot, newest first.
// It sits beside the startup story (the Your story step of My plan) and under the startup card on the profile, so the story and the profile show
// the same history. The data is the plan's log and chapters (lib/planner.js); a pivot row also says what the business was before it.
export function journeyItems(plan = {}) {
  const chapters = plan.chapters || [];
  let c = 0;
  return (plan.log || []).map((l) => (l.type === "reset" ? { ...l, from: chapters[c++] } : l));
}
const day = (iso) => { try { return new Date(String(iso).slice(0, 10) + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return ""; } };

export default function Journey({ plan, limit = 5, empty = false, testid = "journey", className = "" }) {
  const items = journeyItems(plan);
  if (!items.length && !empty) return null;
  return (
    <Card className={cx("space-y-3", className)} data-testid={testid}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold">Your progress</h3>
        <Link to="/plan?update=1" className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: "var(--accent)" }} data-testid={`${testid}-log`}><Plus className="h-3.5 w-3.5" aria-hidden />Log an update</Link>
      </div>
      {items.length === 0 ? <p className="text-sm text-muted">Nothing logged yet. When something happens (a customer, funding, a pivot), log it and your story keeps up.</p> : (
        <ol className="space-y-3">
          {items.slice(0, limit).map((l) => (
            <li key={l.id} className="flex gap-3 text-sm" data-testid={`${testid}-row`}>
              <span className={cx("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white", l.type === "blocked" ? "bg-amber-500" : l.type === "reset" ? "bg-indigo-500" : "bg-emerald-500")}>
                {l.type === "reset" ? <RotateCcw className="h-3 w-3" aria-hidden /> : <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-snug">{l.label}{l.note ? <span className="font-normal">: {l.note}</span> : null}</span>
                {l.from && <span className="block text-xs text-muted">Before: {l.from.one_liner || l.from.name}{l.from.stage ? ` (${STAGE_LABEL[l.from.stage] || l.from.stage})` : ""}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted">{day(l.at)}</span>
            </li>
          ))}
        </ol>
      )}
      {items.length > limit && <p className="text-xs text-muted">{items.length - limit} earlier update{items.length - limit === 1 ? "" : "s"} are in your plan.</p>}
    </Card>
  );
}
