import React, { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Wordmark, PoweredBy, cx } from "../components/ui";
import { LEGAL_EFFECTIVE, LEGAL_VERSION, PRIVACY, TERMS } from "../lib/legal";

// /terms and /privacy -- public (no login), reachable from the signup form, the login page and the
// footer of the app. One component, two documents.
export default function Legal({ doc }) {
  const { pathname } = useLocation();
  const d = doc === "privacy" ? PRIVACY : TERMS;
  useEffect(() => { window.scrollTo(0, 0); document.title = `${d.title} · Pathwai`; }, [d.title, pathname]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10" data-testid={`legal-${doc}`}>
      <Link to="/" className="mb-6 inline-block text-2xl"><Wordmark name="Pathwai" brand={{}} /></Link>
      <nav className="mb-6 flex gap-2 text-sm" aria-label="Legal documents">
        {[["terms", "Terms of Service", "/terms"], ["privacy", "Privacy Policy", "/privacy"]].map(([k, label, to]) => (
          <Link key={k} to={to} data-testid={`legal-tab-${k}`}
            className={cx("rounded-full border px-3 py-1.5", doc === k ? "border-ink bg-ink text-paper" : "border-line text-muted hover:text-ink")}>{label}</Link>
        ))}
      </nav>
      <h1 className="mb-1 text-3xl font-bold">{d.title}</h1>
      <p className="mb-6 text-xs text-muted" data-testid="legal-version">Effective {LEGAL_EFFECTIVE} · version {LEGAL_VERSION}</p>
      <p className="mb-8 text-sm leading-relaxed">{d.intro}</p>
      <div className="space-y-7">
        {d.sections.map(([heading, paras], i) => (
          <section key={heading}>
            <h2 className="mb-2 text-lg font-semibold">{i + 1}. {heading}</h2>
            <div className="space-y-2.5 text-sm leading-relaxed text-muted">
              {paras.map((p, j) => <p key={j}>{p}</p>)}
            </div>
          </section>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-sm">
        <Link className="underline" to="/signup">Back to sign up</Link>
        <Link className="underline" to={doc === "privacy" ? "/terms" : "/privacy"}>{doc === "privacy" ? "Terms of Service" : "Privacy Policy"}</Link>
      </div>
      <PoweredBy className="mt-8 text-center" />
    </div>
  );
}
