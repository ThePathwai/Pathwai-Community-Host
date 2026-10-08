import React from "react";
import { exitDemo, isDemo } from "../lib/demo";

// Shown across the top while someone is in the practice copy of Pathwai.
export default function DemoBanner() {
  if (!isDemo() || process.env.REACT_APP_PREVIEW === "true") return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-accent px-3 py-1.5 text-center text-xs font-medium text-on-accent" style={{ background: "var(--accent, #F00F21)", color: "var(--on-accent, #fff)" }} data-testid="demo-banner">
      <span>You're in the demo: made-up members and events. Nothing here is saved or shared.</span>
      <button type="button" onClick={exitDemo} className="underline underline-offset-2" data-testid="demo-exit">Exit demo</button>
    </div>
  );
}
