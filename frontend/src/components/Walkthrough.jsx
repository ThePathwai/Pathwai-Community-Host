import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cx } from "./ui";

// First-visit tour of the signed-in app. Every step points at a real control through a data-tour attribute, so what it explains is what the person can see. A step whose control is not on this page is left out, so the same tour works from any page, on a phone (tab bar) and on a computer (sidebar).

const STEPS = [
  { id: "welcome", title: "Welcome to Pathwai", body: "Pathwai matches your startup to Canadian grants, loans, accelerators, mentors and events, then shows you what to do next. This tour takes about a minute." },
  { id: "programs", target: "nav-programs", title: "Opportunities", body: "Every resource we track, with its source: grants, loans, tax credits, accelerators, incubators, mentors, founder communities and upcoming events. This is where you spend most of your time." },
  { id: "profile-bar", target: "profile-bar", title: "It all starts with your profile", body: "Your stage, province, sector and what you need decide which programs show up and in what order. Change them any time and this page follows." },
  { id: "matches", target: "matches", title: "Your best matches first", body: "Each program says why it fits you and whether you can apply now: open, apply anytime, or dates not posted. Tap one to see the requirements and go to the official page." },
  { id: "tabs", target: "tabs", title: "Ways to look", body: "For you shows your matches. Browse searches and filters everything. Your shortlist sits next to it, and the guide answers questions in plain words." },
  { id: "journey", target: "nav-journey", title: "Journey", body: "Four steps from where you are now to what to do next, based on your stage." },
  { id: "events", target: "nav-events", title: "Events picked for you", body: "Networking, pitch, mentor and learning events for your stage and province. Each one links to the organizer's own page." },
  { id: "people", target: "nav-people", title: "People", body: "Browse founders, skilled people and startups. Follow them or send a message." },
  { id: "ask", target: "ask", title: "Ask the guide", body: "Stuck? Ask in your own words, like \"what can I apply for this month?\". It is one tap away from every page." },
  { id: "profile", target: "nav-profile", title: "Your profile", body: "Keep this current, because it powers your matches. To see this tour again, open your account menu and choose Take the tour." },
];

export function findTarget(key) {
  if (typeof document === "undefined") return null;
  for (const el of document.querySelectorAll(`[data-tour="${key}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

// True once the page the person landed on has drawn what the tour points at.
export function tourReady() {
  if (!findTarget("nav-programs")) return false;
  return window.location.pathname.startsWith("/navigator") ? !!findTarget("matches") : true;
}

const pinned = (el) => { for (let n = el; n && n !== document.body; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === "fixed" || p === "sticky") return true; } return false; };
const same = (a, b) => a && b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
const PAD = 6;
const CARD_W = 340;

export default function Walkthrough({ open, onClose }) {
  const [list, setList] = useState([]);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const [vp, setVp] = useState({ w: 1024, h: 768 });
  const [ch, setCh] = useState(210);
  const card = useRef(null);
  const step = list[i];

  useEffect(() => { if (open) { setList(STEPS.filter((s) => !s.target || findTarget(s.target))); setI(0); setRect(null); } }, [open]);

  // Keep the spotlight on its control while the page scrolls, resizes or redraws.
  useEffect(() => {
    if (!open || !step) return undefined;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const first = step.target ? findTarget(step.target) : null;
    if (first && !pinned(first)) {
      const r = first.getBoundingClientRect();
      if (r.top < 90 || r.bottom > window.innerHeight - 150) first.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    }
    const measure = () => {
      const el = step.target ? findTarget(step.target) : null;
      setVp((v) => (v.w === window.innerWidth && v.h === window.innerHeight ? v : { w: window.innerWidth, h: window.innerHeight }));
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      const next = { top: r.top, left: r.left, width: r.width, height: r.height };
      setRect((prev) => (same(prev, next) ? prev : next));
    };
    measure();
    const t = setInterval(measure, 150);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { clearInterval(t); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [open, step]);

  // The card's height decides where it can sit; re-read it when the step or the screen width changes.
  useLayoutEffect(() => { if (card.current) { const h = card.current.offsetHeight; if (h) setCh(h); } }, [i, list, vp.w, open]);
  useEffect(() => { if (open && step) card.current?.focus({ preventScroll: true }); }, [open, step]);

  const last = i >= list.length - 1;
  const next = () => (last ? onClose() : setI(i + 1));
  const back = () => setI(Math.max(0, i - 1));
  useEffect(() => {
    if (!open) return undefined;
    const key = (e) => { if (e.key === "Escape") onClose(); else if (e.key === "ArrowRight") next(); else if (e.key === "ArrowLeft") back(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !step || typeof document === "undefined") return null;

  const phone = vp.w < 640;
  const tall = rect && rect.height > vp.h * 0.5;
  const hole = rect && !tall ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 } : null;
  let pos;
  if (!rect) pos = { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "min(92vw, 400px)" };
  else if (phone || tall) {
    // On a phone the card sits just above the tab bar (so every tab stays visible), or at the top when what it points at is low on the screen.
    const bar = document.querySelector(".app-tabbar");
    const barH = phone && bar && bar.offsetHeight > 0 ? bar.offsetHeight : 0;
    const inBar = barH > 0 && rect.top >= vp.h - barH - 4;
    const low = !inBar && rect.top + rect.height / 2 > vp.h * 0.5;
    pos = { left: 12, right: 12, ...(low && !tall ? { top: "calc(env(safe-area-inset-top, 0px) + 12px)" } : { bottom: `calc(env(safe-area-inset-bottom, 0px) + ${barH ? barH + 10 : 12}px)` }) };
  } else {
    const clampTop = (t) => Math.min(Math.max(t, 12), vp.h - ch - 12);
    const clampLeft = (l) => Math.min(Math.max(l, 12), vp.w - CARD_W - 12);
    if (rect.left + rect.width + PAD + 16 + CARD_W <= vp.w - 12 && rect.width < vp.w * 0.5) pos = { top: clampTop(rect.top + rect.height / 2 - ch / 2), left: rect.left + rect.width + PAD + 16, width: CARD_W };
    else if (rect.top + rect.height + PAD + 14 + ch <= vp.h - 12) pos = { top: rect.top + rect.height + PAD + 14, left: clampLeft(rect.left), width: CARD_W };
    else if (rect.top - PAD - 14 - ch >= 12) pos = { top: rect.top - PAD - 14 - ch, left: clampLeft(rect.left), width: CARD_W };
    else pos = { bottom: 16, right: 16, width: CARD_W };
  }

  return createPortal(
    <div className="fixed inset-0 z-[120]" data-testid="tour">
      {/* the dark veil, with a window cut around the control being explained; it also keeps taps from reaching the page underneath */}
      <div className="absolute inset-0" style={hole ? undefined : { background: "rgba(8,10,20,0.62)" }} aria-hidden />
      {hole && <div className="pointer-events-none absolute rounded-2xl motion-safe:transition-all motion-safe:duration-200" style={{ ...hole, boxShadow: "0 0 0 9999px rgba(8,10,20,0.62), 0 0 0 2px var(--accent, #fff)" }} aria-hidden data-testid="tour-spot" />}
      <div ref={card} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body" data-testid="tour-card"
        className="absolute rounded-2xl border border-line bg-surface p-3.5 text-ink shadow-2xl sm:p-5" style={{ ...pos, outline: "none" }}>
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">{i === 0 ? "Quick tour" : `${i} of ${list.length - 1}`}</p>
          <button type="button" onClick={onClose} className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-muted hover:text-ink" data-testid="tour-skip">{last ? "Close" : "Skip tour"}</button>
        </div>
        <h2 id="tour-title" className="mt-1.5 text-base font-semibold leading-snug sm:mt-2 sm:text-lg" style={{ textTransform: "none", letterSpacing: "-0.01em", textWrap: "balance" }}>{step.title}</h2>
        <p id="tour-body" className="mt-1 text-[13px] leading-snug text-ink/80 sm:mt-1.5 sm:text-sm sm:leading-relaxed">{step.body}</p>
        <div className="mt-3 flex items-center justify-between gap-3 sm:mt-4">
          <div className="hidden items-center gap-1 sm:flex" aria-hidden>
            {list.map((s, k) => <span key={s.id} className={cx("h-1.5 rounded-full transition-all", k === i ? "w-4 bg-ink" : "w-1.5 bg-ink/25")} />)}
          </div>
          <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
            {i > 0 && <button type="button" onClick={back} className="btn-ghost !px-3 !py-1.5 text-sm" data-testid="tour-back"><ArrowLeft className="h-4 w-4" aria-hidden />Back</button>}
            <button type="button" onClick={next} className="btn-primary !px-4 !py-1.5 text-sm" data-testid="tour-next">{i === 0 ? "Show me" : last ? "Got it" : "Next"}{!last && <ArrowRight className="h-4 w-4" aria-hidden />}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
