import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeftRight, CalendarDays, Check, ChevronLeft, ChevronRight, CreditCard, FileText, Handshake, Mail, MapPin, MessageCircle, Pause, Play, RotateCcw, Sparkles, Table2, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { isDemo, startDemo } from "../lib/demo";
import markWhite from "../assets/mark-white.png";

// A ~9 second auto-playing story that explains what Pathwai is before someone signs in or creates a
// community. Nobody has to click anything: it plays itself, like a short video. Tap the right side to
// jump ahead, the left to go back, press and hold to pause, X (or Esc) to leave. It ends on a card
// with the three next steps. Plays once per browser on /login and /signup; any "How Pathwai works"
// link can replay it (HowItWorks below fires the pw:open-intro event).
const SEEN = "pw_intro_seen";
// "Already shown on this browser" is remembered in two places (browser storage, plus a one-year cookie in
// case storage is blocked or cleared on its own), and is recorded the moment the story starts, so a refresh
// or a closed tab never replays it. Only the "How Pathwai works" link plays it again.
const seen = () => {
  try { if (window.localStorage.getItem(SEEN) === "1") return true; } catch { /* storage blocked */ }
  try { return document.cookie.split("; ").some((c) => c === `${SEEN}=1`); } catch { return false; }
};
const markSeen = () => {
  try { window.localStorage.setItem(SEEN, "1"); } catch { /* storage blocked */ }
  try { document.cookie = `${SEEN}=1; max-age=31536000; path=/; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`; } catch { /* cookies blocked: it may play again, which is harmless */ }
};
export const openIntro = () => window.dispatchEvent(new Event("pw:open-intro"));
const reducedMotion = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

export function HowItWorks({ className = "" }) {
  if (isDemo()) return null;
  return (
    <button type="button" onClick={openIntro} data-testid="how-it-works" className={"inline-flex items-center gap-1.5 text-xs font-medium text-muted underline underline-offset-2 hover:text-ink " + className}>
      <Sparkles className="h-3.5 w-3.5" /> How Pathwai works
    </button>
  );
}

// ---- visuals --------------------------------------------------------------------------------------
// Each tool starts scattered ([x0,y0]) and, in the first beat, flies into a ring around Pathwai ([x,y]).
const TOOLS = [
  { k: "Forms", Icon: FileText, x: 17, y: 20, x0: 12, y0: 40, r: "-4deg" },
  { k: "Sheets", Icon: Table2, x: 50, y: 10, x0: 70, y0: 14, r: "3deg" },
  { k: "Calendar", Icon: CalendarDays, x: 83, y: 20, x0: 88, y0: 52, r: "-2deg" },
  { k: "Email", Icon: Mail, x: 17, y: 80, x0: 24, y0: 88, r: "4deg" },
  { k: "Chats", Icon: MessageCircle, x: 50, y: 90, x0: 46, y0: 58, r: "-3deg" },
  { k: "Payments", Icon: CreditCard, x: 83, y: 80, x0: 66, y0: 84, r: "2deg" },
];

function ConvergeVisual() {
  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-sm" aria-hidden>
      <svg viewBox="0 0 100 75" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        {TOOLS.map((t) => (
          <line key={t.k} x1={t.x} y1={t.y * 0.75} x2="50" y2="37.5" stroke="var(--accent)" strokeOpacity=".7" strokeWidth="1" vectorEffect="non-scaling-stroke" className="pw-line" style={{ "--dl": "2.2s" }} />))}
      </svg>
      {TOOLS.map((t, n) => (
        <div key={t.k} className="pw-join absolute flex w-[4.9rem] flex-col items-center gap-1 rounded-xl border border-line bg-surface px-2 py-2 text-center shadow-md"
          style={{ left: `${t.x}%`, top: `${t.y}%`, "--x0": `${t.x0}%`, "--y0": `${t.y0}%`, "--r": t.r, "--dl": `${1.45 + n * 0.04}s`, transform: "translate(-50%, -50%)" }}>
          <t.Icon className="h-4 w-4 text-muted" /><span className="text-[10px] font-medium leading-tight text-ink">{t.k}</span>
        </div>))}
      <div className="pw-appear absolute left-1/2 top-1/2 flex h-16 w-16 items-center justify-center rounded-full border border-line" style={{ background: "rgb(var(--c-surface))", transform: "translate(-50%, -50%)", "--dl": "1.9s" }}>
        <img src={markWhite} alt="" className="h-7 w-auto" style={{ filter: "var(--mark-filter, none)" }} />
      </div>
    </div>
  );
}

const Chip = ({ children, on }) => (
  <span className={"rounded-full border px-2 py-0.5 text-[10px] font-medium " + (on ? "border-transparent" : "border-line text-ink")} style={on ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>{children}</span>
);
const Avatar = ({ initials, tone }) => (
  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold" style={{ background: tone, color: "#0D0D0D" }}>{initials}</span>
);

function ProfileVisual() {
  const row = (label, chips, on, dl) => (
    <div className="pw-textin space-y-1" style={{ "--dl": `${dl}s` }}><p className="text-[9px] font-semibold uppercase tracking-widest text-muted">{label}</p><div className="flex flex-wrap gap-1">{chips.map((c) => <Chip key={c} on={on}>{c}</Chip>)}</div></div>
  );
  return (
    <div className="mx-auto w-full max-w-xs" aria-hidden>
      <div className="rounded-2xl border border-line bg-surface p-4 shadow-lg">
        <div className="mb-3 flex items-center gap-3">
          <Avatar initials="AO" tone="#E9C46A" />
          <div className="min-w-0"><p className="truncate text-sm font-semibold">Amara Okoye</p><p className="flex items-center gap-1 truncate text-xs text-muted"><MapPin className="h-3 w-3" />Brand strategist · Toronto</p></div>
        </div>
        <div className="space-y-3">
          {row("Skills", ["Branding", "Storytelling", "Fundraising"], false, 0.25)}
          {row("Can offer", ["Intros to designers", "Mentoring"], true, 0.8)}
          {row("Looking for", ["A technical co-founder"], false, 1.35)}
        </div>
      </div>
    </div>
  );
}

function ExchangeVisual() {
  const card = (cls, initials, tone, name, gives, wants) => (
    <div className={cls + " min-w-0 flex-1 rounded-2xl border border-line bg-surface p-3 shadow-md"}>
      <div className="mb-2 flex items-center gap-2"><Avatar initials={initials} tone={tone} /><p className="truncate text-xs font-semibold">{name}</p></div>
      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted">Offers</p><div className="mb-1.5 mt-1"><Chip on>{gives}</Chip></div>
      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted">Needs</p><div className="mt-1"><Chip>{wants}</Chip></div>
    </div>
  );
  return (
    <div className="mx-auto w-full max-w-sm space-y-4" aria-hidden>
      <div className="flex items-center gap-2">
        {card("pw-in-left", "AO", "#E9C46A", "Amara", "Branding help", "A CTO intro")}
        <div className="pw-slide-x shrink-0"><ArrowLeftRight className="h-5 w-5" style={{ color: "var(--accent)" }} /></div>
        {card("pw-in-right", "JM", "#8ECAE6", "Jordan", "CTO intro", "Branding help")}
      </div>
      <div className="pw-textin flex flex-wrap justify-center gap-2" style={{ "--dl": ".7s" }}>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs"><CalendarDays className="h-3.5 w-3.5" />At events</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs"><MessageCircle className="h-3.5 w-3.5" />Between events</span>
      </div>
    </div>
  );
}

function NetworkVisual() {
  const pts = [[50, 12], [86, 34], [86, 66], [50, 88], [14, 66], [14, 34]];
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[13rem]" aria-hidden>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        {pts.flatMap((a, i) => pts.slice(i + 1).map((b, j) => <line key={`${i}-${j}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="var(--accent)" strokeOpacity=".35" strokeWidth=".5" className="pw-flow" />))}
        {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="5" fill="rgb(var(--c-surface))" stroke="var(--accent)" strokeWidth="1" />)}
      </svg>
      <div className="pw-pulse absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line" style={{ background: "rgb(var(--c-surface))" }}>
        <Handshake className="h-6 w-6" style={{ color: "var(--accent)" }} />
      </div>
    </div>
  );
}

// Short on purpose: one line you can read in a glance, one line of support. `ms` is how long each plays.
const Headline = ({ children, small }) => (
  <h2 className="text-balance font-bold leading-[1.1]" style={{ textTransform: "none", letterSpacing: "-0.025em", fontWeight: 800, fontSize: small ? "1.5rem" : "2rem" }} data-testid="intro-title">{children}</h2>
);
const Sub = ({ children }) => <p className="mx-auto mt-2 max-w-xs text-[15px] leading-snug text-muted">{children}</p>;

const BEATS = [
  {
    ms: 3400, Visual: ConvergeVisual,
    text: (
      <div className="grid">
        <div className="pw-textout col-start-1 row-start-1" style={{ "--dur": "1.55s" }}><Headline>Your community lives in 12 different tools.</Headline><Sub>None of them talk to each other.</Sub></div>
        <div className="pw-textin col-start-1 row-start-1" style={{ "--dl": "1.6s" }}><Headline>Pathwai puts it all in one place.</Headline><Sub>Forms, calendars, payments, chat. Connected.</Sub></div>
      </div>),
  },
  { ms: 2900, Visual: ProfileVisual, text: <div><Headline>Every member brings value.</Headline><Sub>Skills, connections, resources. Way more than a ticket to your event.</Sub></div> },
  { ms: 2900, Visual: ExchangeVisual, text: <div><Headline>Members trade it.</Headline><Sub>Pathwai shows who can help whom, at events and between them.</Sub></div> },
];
const END = BEATS.length;

// ---- the story --------------------------------------------------------------------------------------
export default function IntroTour() {
  const { account, loading } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [i, setI] = useState(0);
  const [holding, setHolding] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [run, setRun] = useState(0);  // bumps on restart so every animation starts over, even from the first beat
  const dialog = useRef(null);
  const holdTimer = useRef(null);
  const held = useRef(false);
  const still = reducedMotion();  // asked for less motion: the animations are skipped, but it still moves on by itself (timer below)

  // First visit, signed out, on the sign-in or sign-up page (not on a community's own join link, not in the demo).
  const eligible = !loading && !account && !isDemo() && ["/login", "/signup"].includes(loc.pathname) && !params.get("join") && params.get("intro") !== "0";
  useEffect(() => { if (eligible && !seen()) { markSeen(); setI(0); setOpen(true); } }, [eligible]);
  useEffect(() => { const on = () => { setI(0); setRun((r) => r + 1); setLeaving(false); setHolding(false); setUserPaused(false); setOpen(true); }; window.addEventListener("pw:open-intro", on); return () => window.removeEventListener("pw:open-intro", on); }, []);
  useEffect(() => { const v = () => setHidden(document.hidden); document.addEventListener("visibilitychange", v); return () => document.removeEventListener("visibilitychange", v); }, []);

  const close = useCallback((then) => {
    markSeen(); setLeaving(true);
    setTimeout(() => { setOpen(false); setLeaving(false); if (typeof then === "function") then(); }, 260);
  }, []);
  const go = useCallback((n) => setI(Math.max(0, Math.min(END, n))), []);
  const restart = useCallback(() => { setI(0); setRun((r) => r + 1); setHolding(false); setUserPaused(false); }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") go(i + 1);
      else if (e.key === "ArrowLeft") go(i - 1);
      else if (e.key === "r" || e.key === "R") restart();
      else if (e.key === " " && !e.target.closest?.("button")) { e.preventDefault(); setUserPaused((h) => !h); }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, i, go, close, restart]);
  useEffect(() => { if (open) dialog.current?.focus({ preventScroll: true }); }, [open]);

  // Autoplay. Normally the progress bar's own animation moves things on (so pausing freezes both together).
  // With "reduce motion" on, that animation is switched off, so a plain timer does the same job instead.
  const waiting = holding || hidden || userPaused;
  useEffect(() => {
    if (!open || !still || waiting || i >= END) return undefined;
    const t = setTimeout(() => setI((n) => Math.min(END, n + 1)), BEATS[i].ms);
    return () => clearTimeout(t);
  }, [open, still, waiting, i, run]);

  if (!open) return null;

  // Tap right = next, tap left = back, press and hold = pause (the way stories work everywhere else).
  const down = (e) => {
    if (e.target.closest("button")) return;
    held.current = false; clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => { held.current = true; setHolding(true); }, 220);
  };
  const up = (e) => {
    if (e.target.closest("button")) return;
    clearTimeout(holdTimer.current);
    if (held.current) { held.current = false; setHolding(false); return; }
    if (i >= END) return;
    const r = e.currentTarget.getBoundingClientRect();
    go((e.clientX - r.left) / r.width < 0.3 ? i - 1 : i + 1);
  };
  const cancel = () => { clearTimeout(holdTimer.current); if (held.current) { held.current = false; setHolding(false); } };

  const beat = BEATS[i];
  const paused = holding || hidden || userPaused;

  return (
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="How Pathwai works" data-testid="intro-tour"
      className="pw-story fixed inset-0 z-[90] flex select-none flex-col overflow-hidden outline-none"
      style={{ background: "rgb(var(--c-bg))", opacity: leaving ? 0 : 1, transform: leaving ? "scale(1.02)" : "none", transition: "opacity .26s ease, transform .26s ease", "--ps": paused ? "paused" : "running", touchAction: "manipulation" }}
      onPointerDown={down} onPointerUp={up} onPointerCancel={cancel} onPointerLeave={cancel} onContextMenu={(e) => e.preventDefault()}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 45% at 50% 30%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%)" }} />

      {/* progress: one bar per beat, filling as it plays */}
      <div className="relative mx-auto flex w-full max-w-md items-center gap-1.5 px-4 pt-4" data-testid="intro-progress" aria-hidden>
        {BEATS.map((b, n) => (
          <div key={n} className="h-[3px] flex-1 overflow-hidden rounded-full" style={{ background: "rgb(var(--c-line))" }}>
            {n < i || i === END || (n === i && still)
              ? <div className="h-full w-full" style={{ background: "var(--accent)" }} />
              : n === i ? <div key={`${i}-${run}`} className="pw-fill h-full w-full" style={{ background: "var(--accent)", "--dur": `${b.ms}ms` }} onAnimationEnd={(e) => { if (e.target === e.currentTarget) go(i + 1); }} /> : null}
          </div>))}
      </div>
      <div className="relative mx-auto flex w-full max-w-md items-center justify-between px-5 pb-1 pt-3">
        <img src={markWhite} alt="Pathwai" className="h-6 w-auto" style={{ filter: "var(--mark-filter, none)" }} />
        <button type="button" onClick={() => close()} aria-label="Skip" className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:bg-ink/5 hover:text-ink" data-testid="intro-skip">
          Skip <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-6">
        {i < END ? (
          <div key={`${i}-${run}`} className="flex flex-1 flex-col items-center justify-center gap-7 py-3 text-center" data-testid={`intro-beat-${i}`}>
            <div className="flex min-h-[15rem] w-full items-center justify-center">{<beat.Visual />}</div>
            <div className="min-h-[7.5rem] w-full">{beat.text}</div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-7 py-3 text-center pw-pop" data-testid="intro-end">
            <NetworkVisual />
            <div><Headline>More value. Less juggling.</Headline><Sub>Join a community, or start your own.</Sub></div>
            <div className="w-full space-y-2.5">
              <button type="button" className="btn-primary w-full" data-testid="intro-start" onClick={() => close(() => nav("/signup"))}><Check className="h-4 w-4" /> Get started</button>
              <div className="flex gap-2.5">
                {!isDemo() && <button type="button" className="btn-ghost flex-1" data-testid="intro-demo" onClick={() => { markSeen(); startDemo("member"); }}>Try the demo</button>}
                <button type="button" className="btn-ghost flex-1" data-testid="intro-signin" onClick={() => close(() => nav("/login"))}>Sign in</button>
              </div>
            </div>
          </div>
        )}
        {i < END ? (
          <div className="flex items-center justify-center gap-2 pt-2" data-testid="intro-controls">
            <button type="button" onClick={restart} aria-label="Restart" title="Restart" className="ctl" data-testid="intro-restart"><RotateCcw className="h-4 w-4" /></button>
            <button type="button" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Back" title="Back" className="ctl" data-testid="intro-back"><ChevronLeft className="h-5 w-5" /></button>
            {<button type="button" onClick={() => setUserPaused((p) => !p)} aria-label={userPaused ? "Play" : "Pause"} title={userPaused ? "Play" : "Pause"} className="ctl" data-testid="intro-pause">{userPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button>}
            <button type="button" onClick={() => go(i + 1)} aria-label="Forward" title="Forward" className="ctl" data-testid="intro-forward"><ChevronRight className="h-5 w-5" /></button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 pt-1">
            <button type="button" onClick={() => go(END - 1)} aria-label="Back" title="Back" className="ctl" data-testid="intro-back"><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" onClick={restart} className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-xs font-medium text-ink hover:bg-ink/5" data-testid="intro-restart"><RotateCcw className="h-4 w-4" /> Watch again</button>
          </div>
        )}
      </div>
    </div>
  );
}
