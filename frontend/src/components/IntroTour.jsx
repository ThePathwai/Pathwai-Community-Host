import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeftRight, CalendarDays, Check, ChevronLeft, ChevronRight, CreditCard, FileText, Handshake, Mail, MapPin, MessageCircle, Sparkles, Table2, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { isDemo, startDemo } from "../lib/demo";
import markWhite from "../assets/mark-white.png";

// A short, skippable click-through that explains what Pathwai is before someone signs in or creates a
// community. Opens by itself once per browser on /login and /signup, and any "How Pathwai works" link
// can reopen it (HowItWorks below fires the pw:open-intro event).
const SEEN = "pw_intro_seen";
const seen = () => { try { return window.localStorage.getItem(SEEN) === "1"; } catch { return false; } };
const markSeen = () => { try { window.localStorage.setItem(SEEN, "1"); } catch { /* storage blocked: it may show again, which is harmless */ } };
export const openIntro = () => window.dispatchEvent(new Event("pw:open-intro"));

export function HowItWorks({ className = "" }) {
  if (isDemo()) return null;
  return (
    <button type="button" onClick={openIntro} data-testid="how-it-works" className={"inline-flex items-center gap-1.5 text-xs font-medium text-muted underline underline-offset-2 hover:text-ink " + className}>
      <Sparkles className="h-3.5 w-3.5" /> How Pathwai works
    </button>
  );
}

// ---- small visual pieces --------------------------------------------------------------------------
const TOOLS = [
  { k: "Forms", Icon: FileText, x: 17, y: 20, r: "-4deg", d: "0s" },
  { k: "Spreadsheets", Icon: Table2, x: 50, y: 10, r: "3deg", d: ".6s" },
  { k: "Calendar", Icon: CalendarDays, x: 83, y: 20, r: "-2deg", d: "1.1s" },
  { k: "Email lists", Icon: Mail, x: 17, y: 80, r: "4deg", d: ".3s" },
  { k: "Group chats", Icon: MessageCircle, x: 50, y: 90, r: "-3deg", d: ".9s" },
  { k: "Payments", Icon: CreditCard, x: 83, y: 80, r: "2deg", d: "1.4s" },
];

const Tile = ({ t, still }) => (
  <div className={"absolute flex w-[5.6rem] flex-col items-center gap-1 rounded-xl border border-line bg-surface px-2 py-2 text-center shadow-md " + (still ? "" : "pw-float")}
    style={{ left: `${t.x}%`, top: `${t.y}%`, "--r": t.r, animationDelay: t.d, transform: "translate(-50%, -50%)" }}>
    <t.Icon className="h-4 w-4 text-muted" />
    <span className="text-[10px] font-medium leading-tight text-ink">{t.k}</span>
  </div>
);

function ScatterVisual() {
  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-sm" aria-hidden>
      {/* broken, dashed links that never quite meet */}
      <svg viewBox="0 0 100 75" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        {[[26, 17, 42, 10], [58, 10, 74, 17], [26, 60, 42, 66], [58, 66, 74, 60], [17, 28, 17, 47], [83, 28, 83, 47]].map(([a, b, c, d], i) => (
          <line key={i} x1={a} y1={b} x2={c} y2={d} stroke="rgb(var(--c-muted))" strokeOpacity=".35" strokeWidth=".5" strokeDasharray="1.2 2" vectorEffect="non-scaling-stroke" />))}
      </svg>
      {TOOLS.map((t) => <Tile key={t.k} t={t} />)}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-line px-3 py-1 text-[10px] uppercase tracking-widest text-muted">Not connected</div>
    </div>
  );
}

function HubVisual() {
  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-sm" aria-hidden>
      <svg viewBox="0 0 100 75" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        {TOOLS.map((t) => (
          <line key={t.k} x1={t.x} y1={t.y * 0.75} x2="50" y2="37.5" stroke="var(--accent)" strokeOpacity=".7" strokeWidth="1" vectorEffect="non-scaling-stroke" className="pw-flow" />))}
      </svg>
      {TOOLS.map((t) => <Tile key={t.k} t={t} still />)}
      <div className="pw-pulse absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line" style={{ background: "rgb(var(--c-surface))" }}>
        <img src={markWhite} alt="" className="h-7 w-auto" style={{ filter: "var(--mark-filter, none)" }} />
      </div>
    </div>
  );
}

const Chip = ({ children, on }) => (
  <span className={"rounded-full border px-2 py-0.5 text-[10px] font-medium " + (on ? "border-transparent text-on-accent" : "border-line text-ink")} style={on ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}>{children}</span>
);
const Avatar = ({ initials, tone }) => (
  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold" style={{ background: tone, color: "#0D0D0D" }}>{initials}</span>
);

function ProfileVisual() {
  const row = (label, chips, on) => (
    <div className="space-y-1"><p className="text-[9px] font-semibold uppercase tracking-widest text-muted">{label}</p><div className="flex flex-wrap gap-1">{chips.map((c) => <Chip key={c} on={on}>{c}</Chip>)}</div></div>
  );
  return (
    <div className="mx-auto w-full max-w-xs space-y-3" aria-hidden>
      <div className="pw-pop rounded-2xl border border-line bg-surface p-4 shadow-lg">
        <div className="mb-3 flex items-center gap-3">
          <Avatar initials="AO" tone="#E9C46A" />
          <div className="min-w-0"><p className="truncate text-sm font-semibold">Amara Okoye</p><p className="flex items-center gap-1 truncate text-xs text-muted"><MapPin className="h-3 w-3" />Brand strategist · Toronto</p></div>
        </div>
        <div className="space-y-3">
          {row("Skills", ["Branding", "Storytelling", "Fundraising"])}
          {row("Can offer", ["Intros to designers", "Mentoring"], true)}
          {row("Looking for", ["A technical co-founder"])}
        </div>
      </div>
      <p className="text-center text-xs text-muted">Value that goes well beyond the event they signed up for.</p>
    </div>
  );
}

function ExchangeVisual() {
  const card = (initials, tone, name, gives, wants) => (
    <div className="min-w-0 flex-1 rounded-2xl border border-line bg-surface p-3 shadow-md">
      <div className="mb-2 flex items-center gap-2"><Avatar initials={initials} tone={tone} /><p className="truncate text-xs font-semibold">{name}</p></div>
      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted">Offers</p><div className="mb-1.5 mt-1"><Chip on>{gives}</Chip></div>
      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted">Needs</p><div className="mt-1"><Chip>{wants}</Chip></div>
    </div>
  );
  return (
    <div className="mx-auto w-full max-w-sm space-y-4" aria-hidden>
      <div className="flex items-center gap-2">
        {card("AO", "#E9C46A", "Amara", "Branding help", "A CTO intro")}
        <div className="pw-slide-x flex shrink-0 flex-col items-center gap-1 text-muted"><ArrowLeftRight className="h-5 w-5" style={{ color: "var(--accent)" }} /></div>
        {card("JM", "#8ECAE6", "Jordan", "CTO intro", "Branding help")}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs"><CalendarDays className="h-3.5 w-3.5" />At events</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs"><MessageCircle className="h-3.5 w-3.5" />Between events</span>
      </div>
    </div>
  );
}

function NetworkVisual() {
  const pts = [[50, 12], [86, 34], [86, 66], [50, 88], [14, 66], [14, 34]];
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[15rem]" aria-hidden>
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

const SLIDES = [
  { eyebrow: "The problem", title: "Running a community means juggling a dozen tools.", body: "Sign-up forms, spreadsheets, calendars, email lists, group chats, payments. Each one holds a piece of your community, and none of them talk to each other.", Visual: ScatterVisual },
  { eyebrow: "One place", title: "Pathwai brings it all together.", body: "Connect the tools you already use, like Google Forms and Calendar, Stripe, Airtable and Luma. Your members get one home for events, requests, updates and each other.", Visual: HubVisual },
  { eyebrow: "Every member", title: "Everyone brings something to the table.", body: "Skills, expertise, connections, resources and goals that reach far beyond your events. Pathwai makes each person's value visible on their profile.", Visual: ProfileVisual },
  { eyebrow: "Exchange value", title: "Members find each other and trade value.", body: "Pathwai shows who can help whom, in the room and after it. Ask for support, offer your skills, make introductions and keep the conversation going.", Visual: ExchangeVisual },
  { eyebrow: "The result", title: "A community worth more than its events.", body: "When value moves between members, connections get stronger, members get more from belonging, and your community keeps growing on its own.", Visual: NetworkVisual },
];

// ---- the tour ---------------------------------------------------------------------------------------
export default function IntroTour() {
  const { account, loading } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const dialog = useRef(null);
  const touch = useRef(null);
  const last = SLIDES.length - 1;

  // First visit, signed out, on the sign-in or sign-up page (not on a community's own join link, not in the demo).
  const eligible = !loading && !account && !isDemo() && ["/login", "/signup"].includes(loc.pathname) && !params.get("join") && params.get("intro") !== "0";
  useEffect(() => { if (eligible && !seen()) { setI(0); setOpen(true); } }, [eligible]);
  useEffect(() => { const on = () => { setI(0); setDir(1); setLeaving(false); setOpen(true); }; window.addEventListener("pw:open-intro", on); return () => window.removeEventListener("pw:open-intro", on); }, []);

  const close = useCallback((then) => {
    markSeen(); setLeaving(true);
    setTimeout(() => { setOpen(false); setLeaving(false); if (typeof then === "function") then(); }, 260);
  }, []);
  const go = useCallback((n) => { if (n < 0 || n > last) return; setDir(n > i ? 1 : -1); setI(n); }, [i, last]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") close(); else if (e.key === "ArrowRight") go(i + 1); else if (e.key === "ArrowLeft") go(i - 1); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, i, go, close]);
  useEffect(() => { if (open) dialog.current?.focus({ preventScroll: true }); }, [open]);  // keyboard users start inside the tour

  if (!open) return null;
  const s = SLIDES[i];
  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current; touch.current = null;
    if (Math.abs(dx) > 50) go(dx < 0 ? i + 1 : i - 1);
  };

  return (
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="How Pathwai works" data-testid="intro-tour"
      className="fixed inset-0 z-[90] flex flex-col overflow-y-auto outline-none"
      style={{ background: "rgb(var(--c-bg))", opacity: leaving ? 0 : 1, transform: leaving ? "scale(1.02)" : "none", transition: "opacity .26s ease, transform .26s ease" }}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }} onTouchEnd={onTouchEnd}>
      <div aria-hidden className="pointer-events-none fixed inset-0" style={{ background: "radial-gradient(60% 45% at 50% 28%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%)" }} />

      <div className="relative mx-auto flex w-full max-w-md items-center justify-between px-5 pb-2 pt-5">
        <img src={markWhite} alt="Pathwai" className="h-6 w-auto" style={{ filter: "var(--mark-filter, none)" }} />
        <button type="button" onClick={() => close()} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:bg-ink/5 hover:text-ink" data-testid="intro-skip">
          Skip <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-6">
        <div key={i} className={"flex flex-1 flex-col justify-center gap-6 py-4 " + (dir > 0 ? "pw-in-right" : "pw-in-left")}>
          <div className="flex min-h-[15rem] items-center justify-center">{<s.Visual />}</div>
          <div className="space-y-2.5 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted" data-testid="intro-eyebrow">{s.eyebrow}</p>
            <h2 className="text-balance text-[1.7rem] font-bold leading-tight sm:text-3xl" style={{ textTransform: "none", letterSpacing: "-0.02em", fontWeight: 700 }} data-testid="intro-title">{s.title}</h2>
            <p className="mx-auto max-w-sm text-[15px] leading-relaxed text-muted">{s.body}</p>
          </div>
        </div>

        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-center gap-2" role="tablist" aria-label="Steps">
            {SLIDES.map((_, n) => (
              <button key={n} type="button" role="tab" aria-selected={n === i} aria-label={`Step ${n + 1} of ${SLIDES.length}`} onClick={() => go(n)}
                className="h-1.5 rounded-full" style={{ width: n === i ? 22 : 7, background: n === i ? "var(--accent)" : "rgb(var(--c-line))", transition: "width .25s ease, background .25s ease" }} />))}
          </div>

          {i < last ? (
            <div className="flex items-center gap-3">
              {i > 0 && <button type="button" onClick={() => go(i - 1)} aria-label="Back" className="btn-ghost !px-3"><ChevronLeft className="h-4 w-4" /></button>}
              <button type="button" onClick={() => go(i + 1)} className="btn-primary flex-1" data-testid="intro-next">Next <ChevronRight className="h-4 w-4" /></button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <button type="button" className="btn-primary w-full" data-testid="intro-start" onClick={() => close(() => nav("/signup"))}><Check className="h-4 w-4" /> Get started</button>
              <div className="flex gap-2.5">
                {!isDemo() && <button type="button" className="btn-ghost flex-1" data-testid="intro-demo" onClick={() => { markSeen(); startDemo("member"); }}>Try the demo</button>}
                <button type="button" className="btn-ghost flex-1" data-testid="intro-signin" onClick={() => close(() => nav("/login"))}>Sign in</button>
              </div>
              <button type="button" onClick={() => go(i - 1)} className="mx-auto block text-xs text-muted underline underline-offset-2">Back</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
