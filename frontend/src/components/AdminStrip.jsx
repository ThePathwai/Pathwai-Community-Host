import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { useLive } from "../lib/live";

// Slim admin shortcut at the top of an admin's home: what needs them, one tap into the right place, and a way into the full Admin.
// The tools themselves (members, reports, branding...) live in Admin, not on the community home.
const ROWS = [
  ["pending_memberships", (n) => (n === 1 ? "1 person waiting to join" : `${n} people waiting to join`), "members"],
  ["awaiting_review", (n) => `${n} to review`, "requests"],
  ["overdue_requests", (n) => `${n} overdue`, "requests"],
  ["support_needing_action", (n) => `${n} support ${n === 1 ? "question" : "questions"}`, "support"],
  ["pending_moderation", (n) => `${n} to approve`, "moderation"],
];

export default function AdminStrip() {
  const [a, setA] = useState(null);
  const load = useCallback(() => { api.get("/admin/action-center").then((r) => setA(r.data)).catch(() => setA({})); }, []);
  useEffect(() => { load(); }, [load]);
  useLive(["members", "requests", "support", "admin"], load);
  const items = ROWS.map(([k, text, tab]) => [k, a?.[k] || 0, text, tab]).filter(([, n]) => n > 0);
  const total = items.reduce((s, [, n]) => s + n, 0);
  return (
    <section className="card flex flex-wrap items-center gap-x-4 gap-y-3 !p-3.5" style={{ borderLeft: "3px solid var(--accent)" }} data-testid="dash-admin-strip">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink/[.06]"><ShieldCheck className="h-4 w-4 text-muted" strokeWidth={2.25} aria-hidden /></span>
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm font-semibold">Admin{total > 0 && <span className="ml-2 rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white" data-testid="dash-admin-count">{total}</span>}</p>
        {a && items.length === 0 && <p className="mt-0.5 text-xs text-muted">Nothing needs you right now.</p>}
        {items.length > 0 && (
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {items.map(([k, n, text, tab]) => <Link key={k} to={`/admin?tab=${tab}`} className="font-medium underline underline-offset-2 hover:text-muted" data-testid={`dash-admin-${k}`}>{text(n)}</Link>)}
          </p>
        )}
      </div>
      <Link to="/admin" className="btn-primary shrink-0" data-testid="dash-admin-open">Open admin<ChevronRight className="h-4 w-4" aria-hidden /></Link>
    </section>
  );
}
