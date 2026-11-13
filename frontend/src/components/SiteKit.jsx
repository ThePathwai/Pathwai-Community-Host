import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ArrowUpRight, Menu, Moon, Sun, X } from "lucide-react";
import { Wordmark, cx } from "./ui";
import { applyBrand, effectiveMode, setModePref } from "../lib/theme";

// Shared pieces of the public website (pages/Site.jsx, SiteAbout.jsx, SiteContact.jsx): the header, footer, theme switch and section blocks.
// The waitlist and contact buttons open an email to CONTACT because there is no waitlist service behind the site yet.
export const CONTACT = "info@thepathwai.com";
export const WAITLIST = `mailto:${CONTACT}?subject=${encodeURIComponent("Join the Pathwai waitlist")}&body=${encodeURIComponent("Hi Pathwai team,\n\nI'd like to join the waitlist.\n\nName:\nOrganization:\nRole:\n")}`;

// The site is always branded Pathwai (not whichever community was open last). Dark by default, with a light switch.
const SITE_BRAND = {
  preset: "pathwai", mode: "dark", font: "Inter", heading_font: "Inter", heading_style: "normal", radius: "soft", button_shape: "pill",
  colors: { accent: "#F4F4F5", on_accent: "#0A0A0A", background: "#0B0B0D", surface: "#141417", text: "#F4F4F6", muted: "#8E8E99", border: "#25252B" },
};

const NAV = [["Home", "/"], ["About", "/about"], ["Contact", "/contact"]];

export const Eyebrow = ({ children, className }) => <p className={cx("eyebrow", className)}>{children}</p>;
export const Num = ({ n }) => <span className="font-display text-sm font-bold text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>{String(n).padStart(2, "0")}</span>;
export const Pill = ({ children, tone = "green" }) => (
  <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", tone === "green" ? "bg-emerald-500/15 text-emerald-500" : tone === "blue" ? "bg-sky-500/15 text-sky-500" : "bg-ink/10 text-muted")}>{children}</span>
);

// A soft purple-blue light that sits between sections.
export const Glow = ({ className }) => <div aria-hidden className={cx("site-glow", className)} />;

// A section: a small label, a big light headline, one sentence, then the content. Centered, with a lot of room around it.
export function Section({ id, eyebrow, title, sub, children, className, align = "center" }) {
  const c = align === "center";
  return (
    <section id={id} className={cx("scroll-mt-28 py-20 sm:py-28", className)}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {(eyebrow || title || sub) && (
          <div className={cx("mx-auto max-w-3xl", c ? "text-center" : "mx-0 text-left")}>
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            {title && <h2 className="mt-4 text-4xl sm:text-5xl lg:text-6xl" style={{ textWrap: "balance" }}>{title}</h2>}
            {sub && <p className={cx("mt-5 text-base text-muted sm:text-lg", c && "mx-auto max-w-xl")}>{sub}</p>}
          </div>
        )}
        {children && <div className={title || sub ? "mt-14" : ""}>{children}</div>}
      </div>
    </section>
  );
}

// The top of an inner page (About, Contact): a small label, a big light line and one sentence.
export function PageTop({ eyebrow, title, sub }) {
  return (
    <section className="px-4 pb-6 pt-20 text-center sm:px-6 sm:pt-28">
      <div className="mx-auto max-w-4xl">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-5 text-5xl sm:text-6xl lg:text-7xl" style={{ textWrap: "balance" }}>{title}</h1>
        {sub && <p className="mx-auto mt-6 max-w-xl text-lg text-muted sm:text-xl">{sub}</p>}
      </div>
    </section>
  );
}

// Header + footer around a page. Every page of the website renders inside this.
export function SiteShell({ title, children }) {
  const loc = useLocation();
  const [mode, setMode] = useState(() => effectiveMode(SITE_BRAND));
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => { applyBrand({ community_name: "", brand: SITE_BRAND }); setMode(effectiveMode(SITE_BRAND)); }, []);
  useEffect(() => { document.title = title ? `${title} — Pathwai` : "Pathwai — Your personal venture planner"; }, [title]);
  // A new page starts at the top, and the phone menu closes.
  useEffect(() => { window.scrollTo(0, 0); setOpen(false); }, [loc.pathname]);
  useEffect(() => { const f = () => setScrolled(window.scrollY > 12); f(); window.addEventListener("scroll", f, { passive: true }); return () => window.removeEventListener("scroll", f); }, []);
  const flip = () => { const n = mode === "dark" ? "light" : "dark"; setModePref(n); applyBrand({ community_name: "", brand: SITE_BRAND }); setMode(n); };

  const link = ({ isActive }) => cx("rounded-full px-3.5 py-1.5 text-sm", isActive ? "text-ink" : "text-muted hover:text-ink");

  return (
    <div className="site relative w-full overflow-x-clip" data-testid="site">
      <header className={cx("sticky top-0 z-40 transition-colors", scrolled || open ? "border-b border-line/60 bg-paper/70 backdrop-blur-xl" : "border-b border-transparent")}>
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6 lg:px-8">
          <Link to="/" className="hit shrink-0 text-xl sm:text-2xl" aria-label="Pathwai home"><Wordmark name="Pathwai" brand={{}} /></Link>
          <nav className="mx-auto hidden items-center gap-1 md:flex" aria-label="Site">
            {NAV.map(([label, to]) => <NavLink key={to} to={to} end className={link} data-testid={`site-nav-${label.toLowerCase()}`}>{label}</NavLink>)}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
            <Link to="/login" className="hit rounded-full px-3 py-1.5 text-sm text-muted hover:text-ink" data-testid="site-signin">Sign in</Link>
            <a href={WAITLIST} className="btn-primary !px-4 !py-1.5 text-sm max-sm:hidden" data-testid="site-waitlist-top">Join waitlist</a>
            <button type="button" onClick={flip} className="flex h-9 w-9 items-center justify-center rounded-full bg-ink/10 text-muted hover:text-ink" aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"} data-testid="site-theme">{mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
            <button type="button" onClick={() => setOpen((o) => !o)} className="flex h-9 w-9 items-center justify-center rounded-full bg-ink/10 text-muted hover:text-ink md:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} data-testid="site-menu">{open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}</button>
          </div>
        </div>
        {open && (
          <nav className="mx-auto grid max-w-6xl gap-1 px-4 pb-4 md:hidden" aria-label="Site menu" data-testid="site-menu-panel">
            {NAV.map(([label, to]) => <NavLink key={to} to={to} end className={({ isActive }) => cx("rounded-2xl px-4 py-3 text-lg", isActive ? "bg-ink/10 text-ink" : "text-muted")}>{label}</NavLink>)}
            <a href={WAITLIST} className="btn-primary mt-2 !py-3 text-base">Join the waitlist</a>
          </nav>
        )}
      </header>

      <main>{children}</main>

      <footer className="border-t border-line/60 px-4 py-8 sm:px-6" data-testid="site-footer">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <span className="text-xl"><Wordmark name="Pathwai" brand={{}} /></span>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted" aria-label="Footer">
            {NAV.map(([label, to]) => <Link key={to} to={to} className="tap hover:text-ink">{label}</Link>)}
            <Link to="/navigator" className="tap hover:text-ink">Find programs</Link>
            <Link to="/login" className="tap hover:text-ink">Sign in</Link>
            <Link to="/terms" className="tap hover:text-ink">Terms</Link>
            <Link to="/privacy" className="tap hover:text-ink">Privacy</Link>
          </nav>
          <a href={`mailto:${CONTACT}`} className="hit inline-flex items-center gap-1 text-sm text-muted hover:text-ink">{CONTACT}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></a>
        </div>
      </footer>
    </div>
  );
}
