import React from "react";
import { exitDemo, isDemo } from "../lib/demo";

// Shown across the top while someone is in the practice copy of Pathwai: made-up founders, programs and events that live
// only in this browser tab.
export default function DemoBanner() {
  if (!isDemo() || process.env.REACT_APP_PREVIEW === "true") return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-accent px-3 py-1.5 text-center text-[11px] font-medium text-on-accent sm:text-xs" style={{ background: "var(--accent, #F00F21)", color: "var(--on-accent, #fff)" }} data-testid="demo-banner">
      <span className="hidden sm:inline">You're in the demo: made-up founders, programs and events. Anything you type stays in this browser tab.</span>
      <span className="sm:hidden">Demo · sample data</span>
      <button type="button" onClick={() => window.location.reload()} className="underline underline-offset-2" data-testid="demo-restart">Restart<span className="max-sm:hidden"> demo</span></button>
      <button type="button" onClick={exitDemo} className="underline underline-offset-2" data-testid="demo-exit">Exit<span className="max-sm:hidden"> demo</span></button>
    </div>
  );
}
