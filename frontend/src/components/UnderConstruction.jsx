import React from "react";
import { Link } from "react-router-dom";
import { Hammer } from "./icons";

// Shown in place of an area that is not ready yet (see lib/flags.js). No member information is loaded or shown here.
export default function UnderConstruction({ title = "People", note = "We are building this part of Pathwai. Members will show up here once it is ready." }) {
  return (
    <div className="mx-auto w-full max-w-2xl" data-testid="under-construction">
      <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><Hammer className="h-5 w-5" aria-hidden /></span>
        <p className="eyebrow">{title}</p>
        <h1 className="text-xl font-semibold sm:text-2xl" style={{ textWrap: "balance" }}>Under construction</h1>
        <p className="max-w-md text-sm text-muted">{note}</p>
        <Link to="/navigator" className="btn-primary mt-2" data-testid="under-construction-cta">Find programs and grants</Link>
      </div>
    </div>
  );
}
