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
  colors: { accent: "#7BA4FF", on_accent: "#07111F", background: "#08090D", surface: "#12141B", text: "#F2F4F8", muted: "#8D95A6", border: "#252A36" },
};

const NAV = [["Home", "/"], ["About", "/about"], ["Contact", "/contact"]];

export const Eyebrow = ({ children, className }) => <p className={cx("eyebrow", className)}>{children}</p>;
export const Num = ({ n }) => <span className="font-display text-sm font-bold text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>{String(n).padStart(2, "0")}</span>;
export const Pill = ({ children, tone = "green" }) => (
  <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", tone === "green" ? "bg-emerald-500/15 text-emerald-500" : tone === "blue" ? "bg-sky-500/15 text-sky-500" : "bg-ink/10 text-muted")}>{children}</span>
);

export function Section({ id, eyebrow, title, sub, children, className }) {
  return (
    <section id={id} className={cx("scroll-mt-28 py-14 sm:py-20", className)}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        {title && <h2 className="mt-3 max-w-3xl text-3xl sm:text-5xl" style={{ textWrap: "balance" }}>{title}</h2>}
        {sub && <p className="mt-4 max-w-xl text-base text-muted sm:text-lg">{sub}</p>}
        {children && <div className={title || sub ? "mt-10" : ""}>{children}</div>}
      </div>
    </section>
  );
}

// The top of an inner page (About, Contact): a small label, a big line and one sentence.
export function PageTop({ eyebrow, title, sub }) {
  return (
    <section className="px-4 pb-6 pt-16 sm:px-6 sm:pt-24">
      <div className="mx-auto max-w-6xl lg:px-8">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-4 max-w-4xl text-5xl sm:text-6xl lg:text-7xl" style={{ textWrap: "balance" }}>{title}</h1>
        {sub && <p className="mt-5 max-w-xl text-lg text-muted sm:text-xl">{sub}</p>}
      </div>
    </section>
  );
}

// Header + footer around a page. Every page of the website renders inside this.
export function SiteShell({ title, children }) {
  const loc = useLocation();
  const [mode, setMode] = useState(() => effectiveMode(SITE_BRAND));
  const [open, setOpen] = useState(false);

  useEffect(() => { applyBrand({ community_name: "", brand: SITE_BRAND }); setMode(effectiveMode(SITE_BRAND)); }, []);
  useEffect(() => { document.title = title ? `${title} — Pathwai` : "Pathwai — Your personal venture planner"; }, [title]);
  // A new page starts at the top, and the phone menu closes.
  useEffect(() => { window.scrollTo(0, 0); setOpen(false); }, [loc.pathname]);
  const flip = () => { const n = mode === "dark" ? "light" : "dark"; setModePref(n); applyBrand({ community_name: "", brand: SITE_BRAND }); setMode(n); };

  const link = ({ isActive }) => cx("rounded-full px-3.5 py-1.5 text-sm", isActive ? "glass-active font-semibold text-ink" : "text-muted hover:bg-ink/5 hover:text-ink");

  return (
    <div className="site relative w-full" data-testid="site">
      <header className="sticky top-2 z-40 mx-2 mt-2 sm:top-3 sm:mx-4 sm:mt-3 lg:mx-auto lg:max-w-6xl">
        <div className="glass-bar rounded-[1.75rem] md:rounded-full">
          <div className="flex items-center gap-2 px-3 py-2 sm:gap-4 sm:px-5">
            <Link to="/" className="shrink-0 text-xl sm:text-2xl" aria-label="Pathwai home"><Wordmark name="Pathwai" brand={{}} /></Link>
            <nav className="mx-auto hidden items-center gap-1 md:flex" aria-label="Site">
              {NAV.map(([label, to]) => <NavLink key={to} to={to} end className={link} data-testid={`site-nav-${label.toLowerCase()}`}>{label}</NavLink>)}
            </nav>
            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2 md:ml-0">
              <Link to="/login" className="btn-ghost !px-3 !py-1.5 text-sm" data-testid="site-signin">Sign in</Link>
              <button type="button" onClick={flip} className="btn-ghost !px-2.5 !py-1.5" aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"} data-testid="site-theme">{mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
              <a href={WAITLIST} className="btn-primary !px-4 !py-1.5 text-sm max-md:hidden" data-testid="site-waitlist-top">Join waitlist</a>
              <button type="button" onClick={() => setOpen((o) => !o)} className="btn-ghost !px-2.5 !py-1.5 md:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} data-testid="site-menu">{open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}</button>
            </div>
          </div>
          {open && (
            <nav className="grid gap-1 border-t border-line/60 p-2 md:hidden" aria-label="Site menu" data-testid="site-menu-panel">
              {NAV.map(([label, to]) => <NavLink key={to} to={to} end className={({ isActive }) => cx("rounded-2xl px-4 py-3 text-base", isActive ? "glass-active font-semibold text-ink" : "text-muted")}>{label}</NavLink>)}
              <a href={WAITLIST} className="btn-primary mt-1 !py-3 text-base">Join the waitlist</a>
            </nav>
          )}
        </div>
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
