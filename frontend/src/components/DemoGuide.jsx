import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, EyeOff, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { isDemo } from "../lib/demo";
import { cx } from "./ui";

// Demo only. A slim strip that says where a new founder is in the walkthrough (1 of 5), what this screen is for, and lets the presenter step back and
// forward or reset to a blank founder between takes. It only appears in the Humber demo, for the founder side. "Hide" removes it completely so it
// never shows up in a recording; press G to bring it back.
const HUMBER = "humber-innovation-network";
const STEPS = [
  { key: "home", to: "/", title: "Arrive", say: "A new founder lands on the hub's home page. The first thing it asks for is their story." },
  { key: "story", to: "/plan?step=story", title: "Tell your story", say: "Where they are and what they want, in a minute. It is saved to their profile." },
  { key: "directions", to: "/plan?step=directions", title: "Pick a direction", say: "Routes the business could take, and why each fits. Or say the decision in your own words." },
  { key: "plan", to: "/plan?step=plan", title: "Build your plan", say: "Steps for 2 weeks, 30 days and 90 days, using this hub's programs, events and people. Drag to reorder." },
  { key: "brief", to: "/plan?step=brief", title: "Decision plan", say: "The decision, the plan and the questions. Start it alone, or share it with a team or an advisor." },
];
const KEY = "pw_guide_hidden";
const readHidden = () => { try { return window.sessionStorage.getItem(KEY) === "1"; } catch { return false; } };
const writeHidden = (v) => { try { v ? window.sessionStorage.setItem(KEY, "1") : window.sessionStorage.removeItem(KEY); } catch { /* ignore */ } };

export default function DemoGuide() {
  const { user, config, refresh } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [hidden, setHidden] = useState(readHidden);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key !== "g" && e.key !== "G") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(input|textarea|select)$/i.test((e.target && e.target.tagName) || "") || (e.target && e.target.isContentEditable)) return;
      setHidden((h) => { writeHidden(!h); return !h; });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const on = isDemo() && !!user && user.role !== "admin" && config?.slug === HUMBER;
  const q = new URLSearchParams(loc.search);
  const idx = !on ? -1 : loc.pathname === "/" ? 0 : loc.pathname === "/plan" ? Math.max(1, STEPS.findIndex((s) => s.key === (q.get("step") || "story"))) : -1;
  const shown = idx >= 0 && !hidden;
  // Tells the Home page the strip is taking room, so it can drop its least important rows a little sooner (index.css).
  useEffect(() => {
    if (!shown) return undefined;
    document.body.dataset.guide = "1";
    return () => { delete document.body.dataset.guide; };
  }, [shown]);
  if (!shown) return null;
  const cur = STEPS[idx];
  const reset = async () => {
    setBusy(true);
    try { await api.post("/navigator/demo-reset", {}); await refresh(); nav("/", { replace: true }); window.scrollTo(0, 0); toast.success("Reset to a new founder"); }
    catch { toast.error("Could not reset the demo"); } finally { setBusy(false); }
  };
  const hide = () => { writeHidden(true); setHidden(true); };
  const btn = "inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-muted transition hover:text-ink disabled:opacity-40";
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-dashed border-line bg-surface px-3 py-2 text-sm lg:mb-4" data-testid="demo-guide" role="region" aria-label="Demo walkthrough">
      <span className="inline-flex shrink-0 items-center gap-2 font-semibold" data-testid="demo-guide-step">
        <span className="flex gap-1" aria-hidden>{STEPS.map((s, i) => <span key={s.key} className={cx("h-1.5 w-4 rounded-full", i <= idx ? "bg-accent" : "bg-ink/15")} style={i <= idx ? { background: "var(--accent)" } : undefined} />)}</span>
        {idx + 1} of {STEPS.length} · {cur.title}
      </span>
      <span className="hidden min-w-0 flex-1 text-xs text-muted lg:block" data-testid="demo-guide-say">{cur.say}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        <button type="button" className={btn} onClick={() => nav(STEPS[Math.max(0, idx - 1)].to)} disabled={idx === 0} data-testid="demo-guide-back" aria-label="Previous step"><ArrowLeft className="h-3.5 w-3.5" aria-hidden />Back</button>
        <button type="button" className={btn} onClick={() => nav(STEPS[Math.min(STEPS.length - 1, idx + 1)].to)} disabled={idx === STEPS.length - 1} data-testid="demo-guide-next" aria-label="Next step">Next<ArrowRight className="h-3.5 w-3.5" aria-hidden /></button>
        <button type="button" className={btn} onClick={reset} disabled={busy} data-testid="demo-guide-reset"><RotateCcw className="h-3.5 w-3.5" aria-hidden />Reset</button>
        <button type="button" className={btn} onClick={hide} title="Hide (press G to bring it back)" data-testid="demo-guide-hide"><EyeOff className="h-3.5 w-3.5" aria-hidden /><span className="max-sm:hidden">Hide</span></button>
      </span>
    </div>
  );
}
