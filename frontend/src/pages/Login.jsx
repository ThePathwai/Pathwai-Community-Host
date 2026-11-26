import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, BookOpen, CalendarDays, Compass, Gift, Users } from "../components/icons";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";
import posthog, { posthogEnabled, posthogLogger } from "../lib/posthog";
import { DEMO_COMMUNITIES, demoRole, inDemoTab, isDemo, leaveDemo, startDemo } from "../lib/demo";
import { applyBrand } from "../lib/theme";
import crowd from "../assets/crowd.jpg";
import { Button, Card, Field, Input, MembershipStatusCard, PoweredBy, Wordmark, cx } from "../components/ui";
import SocialAuthButtons from "../components/SocialAuthButtons";

// The shared preview build is always "in the demo", but its sign-in page still offers the demo hub.
const PREVIEW = process.env.REACT_APP_PREVIEW === "true";

// A row of tabs: only the chosen one is shown, so the page never needs scrolling to see everything it offers.
const Seg = ({ value, onChange, items, testPrefix, className = "" }) => (
  <div role="tablist" className={cx("grid gap-1 rounded-full border border-line bg-ink/[.05] p-1", className)} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
    {items.map(([k, label]) => (
      <button key={k} type="button" role="tab" aria-selected={value === k} data-testid={`${testPrefix}-${k}`} onClick={() => onChange(k)}
        className={cx("truncate rounded-full px-2 py-2 text-sm font-medium transition-colors", value === k ? "glass-active text-ink" : "text-muted hover:text-ink")}>{label}</button>
    ))}
  </div>
);

export default function Login() {
  const { login, applySession, refresh, enter } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [params] = useSearchParams();
  // Present when this login came from a community's own external share link (/c/:slug ->
  // "Already on Pathwai? Sign in") -- an existing member lands straight in that community
  // instead of the generic Hub, same spirit as the signup-time join_slug flow.
  const joinSlug = params.get("join") || null;
  const [joinInfo, setJoinInfo] = useState(null);
  const [resources, setResources] = useState(null);   // everything on Pathwai: programs plus upcoming events
  useEffect(() => { api.get("/navigator/meta").then((r) => setResources(r.data.resources ?? r.data.count ?? null)).catch(() => {}); }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState({ accounts: [], password: "" });
  const inDemo = isDemo();
  // Two tabs: sign in (the default) and try the demo. /login?tab=demo opens the demo tab directly.
  const [tab, setTab] = useState(params.get("tab") === "demo" ? "demo" : "signin");
  const [demoTab, setDemoTab] = useState("hub");

  useEffect(() => { api.get("/auth/demo-accounts").then((r) => setDemo(r.data)).catch(() => {}); }, []);
  // /login?demo=member|founder (what the "Try the demo" buttons open) signs straight in to the in-browser demo.
  // Opening the demo tab on purpose (/login?tab=demo) is a fresh choice, not a resume: ignore any demo already running in this tab.
  const autoDemo = params.get("demo") || (inDemo && params.get("tab") !== "demo" ? demoRole() : null);
  const autoDone = React.useRef(false);
  // A login screen with no demo role to sign in to means the demo is over: switch to the real site.
  const demoOver = inDemoTab() && !autoDemo;
  useEffect(() => { if (demoOver) leaveDemo("/login" + window.location.search); }, [demoOver]);
  useEffect(() => {
    if (!autoDemo || autoDone.current || !demo.accounts.length) return;
    const a = autoDemo === "founder" ? { email: "founder@yourcommunity.app" } : demo.accounts.find((x) => x.demo_role === autoDemo);
    if (a) { autoDone.current = true; go(a.email, demo.password); }
  }, [autoDemo, demo]); // eslint-disable-line

  useEffect(() => {
    if (!joinSlug) return;
    api.get(`/hub/communities/${joinSlug}/public`)
      .then((r) => { setJoinInfo(r.data); applyBrand({ community_name: r.data.name, brand: r.data.brand }); })
      .catch(() => {}); // bad/stale link -- fall back to the plain Pathwai sign-in, silently
  }, [joinSlug]);

  const go = async (e, p) => {
    setBusy(true); setErr(""); setStatus("");
    try {
      await login(e, p);
      const loginMethod = isDemo() ? "demo" : "password";
      if (posthogEnabled) posthog.capture("login_completed", { method: loginMethod });
      posthogLogger.info("login completed", { login_method: loginMethod });
      // Drop focus from the sign-in fields so the browser closes its saved-password popup before the home page appears.
      try { document.activeElement?.blur?.(); } catch { /* not a focusable element */ }
      if (joinSlug) {
        try {
          const { data } = await api.post(`/hub/communities/${joinSlug}/apply`, {});
          await refresh();
          if (data.status === "approved") { nav("/", { replace: true }); return; }
          toast.success(`Request sent — you'll see ${joinInfo?.name || "the community"} once we confirm you with them.`);
          nav("/", { replace: true });
          return;
        } catch { /* already a member, or the apply failed -- fall through to the usual landing */ }
      }
      // A demo link can name a community to open straight into (/login?demo=member&c=yvettabetta-pilates).
      if (isDemo() && params.get("c")) {
        try {
          await enter(params.get("c"));
          // Start from scratch = a blank founder who fills in their own story; otherwise the ready-made founder.
          const fresh = params.get("fresh") === "1";
          try { await api.post("/navigator/demo-reset", { fresh }); } catch { /* an older demo server: carry on with whatever is there */ }
          nav(fresh ? "/plan?step=story" : "/", { replace: true });
          return;
        } catch { /* not a member there: fall through to the Hub */ }
      }
      nav(params.get("next") === "navigator" ? "/navigator" : "/", { replace: true });
    } catch (ex) { setStatus(ex?.response?.status === 403 && /membership request/i.test(errMsg(ex)) ? (/not approved/i.test(errMsg(ex)) ? "rejected" : "pending") : ""); setErr(errMsg(ex)); if (ex?.response?.status !== 403) toast.error(errMsg(ex)); } finally { setBusy(false); }
  };

  const onSocialSignedIn = async (data) => {
    applySession(data);
    if (posthogEnabled) posthog.capture("login_completed", { method: "social" });
    posthogLogger.info("login completed", { login_method: "social" });
    // Mirrors go()'s post-login join handling -- /auth/oauth/{provider} now files the same join_slug
    // request when one was carried in from a share link, instead of silently dropping it. Same
    // persistent MembershipStatusCard as the email-login path below, rather than a toast that
    // vanishes -- a pending/rejected result stays on this page instead of redirecting to the Hub.
    if (data.joined) {
      await refresh();
      if (data.joined.status === "approved") { nav("/", { replace: true }); return; }
      setStatus(data.joined.status === "rejected" ? "rejected" : "pending");
      return;
    }
    if (data.new_account) toast.success("You're in. Add your startup to see programs that fit you.");
    nav(params.get("next") === "navigator" ? "/navigator" : "/", { replace: true });
  };

  const founderAcct = { demo_role: "founder", email: "founder@yourcommunity.app", label: "Sample founder", description: "A ready-made founder profile. See how one profile picks the programs, events and next steps. Nothing you do is saved." };
  const hostAcct = { demo_role: "host", email: "host@thevillage.example", label: "Community host demo", description: "Sign in as the host of The Village, a private dinner club, and review who has asked to join." };
  const demoItems = [...(inDemo && !PREVIEW ? [] : [["hub", "Demo hub"]]), ...(demo.accounts.length ? [["accounts", "Accounts"]] : [])];
  const demoShown = demoItems.some(([k]) => k === demoTab) ? demoTab : demoItems[0]?.[0];
  const showDemoTab = !inDemo || PREVIEW || demo.accounts.length > 0;
  // Never render an empty pane: if the demo tab can't show, fall back to sign in.
  const shownTab = tab === "demo" && !showDemoTab ? "signin" : tab;

  return (
    <div className="grid min-h-[100dvh] grid-cols-[minmax(0,1fr)] lg:grid-cols-2">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 hidden justify-end gap-2 px-4 py-4 lg:flex lg:px-8">
        <Link to="/install" className="btn-ghost pointer-events-auto border border-line bg-paper/70 backdrop-blur" data-testid="login-install">Get the app</Link>
        <Link to="/navigator" className="btn-ghost pointer-events-auto border border-line bg-paper/70 backdrop-blur" data-testid="login-navigator">Opportunities</Link>
        <Link to="/about" className="btn-ghost pointer-events-auto border border-line bg-paper/70 backdrop-blur" data-testid="login-about">About Pathwai <span aria-hidden>→</span></Link>
      </div>
      <div className="relative hidden overflow-hidden lg:block" style={{ background: "#08080B" }}>
        <img src={crowd} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(8,8,11,.55) 0%, rgba(8,8,11,.25) 45%, rgba(8,8,11,.92) 100%)" }} />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <span className="text-4xl"><Wordmark name="Pathwai" brand={{}} /></span>
          <div>
            <p className="font-display text-5xl font-bold leading-[1.08]">Your personal<br />venture planner.</p>
            <p className="mt-4 max-w-md text-lg text-white/80">Tell it what you are building. It finds the programs, people and next steps that fit, and plans them with you.</p>
            <div className="mt-6 flex max-w-md flex-wrap gap-2" aria-label="Built in">
              {[[Compass, "Opportunities"], [Gift, "Grants"], [CalendarDays, "Events"], [Users, "People"], [BookOpen, "Resources"]].map(([Icon, l]) => (
                <span key={l} className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-sm backdrop-blur"><Icon className="h-4 w-4" />{l}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto flex w-full min-w-0 max-w-md flex-col justify-center gap-3 px-4 py-4 lg:gap-4 lg:py-10">
        {/* phones and tablets: the logo and the two links share one row, so nothing floats over the form */}
        <div className="flex items-center justify-between gap-2 lg:hidden">
          <span className="min-w-0 text-xl"><Wordmark name={joinInfo?.name || "Pathwai"} brand={joinInfo?.brand || {}} /></span>
          <div className="flex shrink-0 items-center gap-1.5">
            <Link to="/install" className="btn-ghost border border-line !px-3 !py-1.5 text-xs" data-testid="login-install-mobile">Get the app</Link>
            <Link to="/about" className="btn-ghost border border-line !px-3 !py-1.5 text-xs" data-testid="login-about-mobile">About</Link>
          </div>
        </div>

        {showDemoTab && <Seg value={shownTab} onChange={setTab} testPrefix="login-tab" items={[["signin", "Sign in"], ["demo", "Try the demo"]]} />}

        {shownTab === "signin" && (
          <div data-testid="login-pane-signin">
            <p className="mb-3 text-sm text-muted">
              {/* Every community join request is confirmed by the Pathwai team -- no community can auto-approve one. */}
              {joinInfo ? <>Sign in to join <strong>{joinInfo.name}</strong> — we will confirm your request with them.</> : "Sign in to pick up your plan."}
            </p>
            <Card>
              <SocialAuthButtons onSignedIn={onSocialSignedIn} disabled={busy} joinSlug={joinSlug} />
              <div className="my-4 flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-line" /> or continue with email <span className="h-px flex-1 bg-line" />
              </div>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); go(email, password); }}>
                <Field label="Email"><Input data-testid="login-email" type="email" name="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
                <Field label={<span className="flex items-center justify-between">Password <Link className="tap text-xs font-normal normal-case text-muted underline" to="/forgot-password" data-testid="forgot-password-link">Forgot password?</Link></span>}>
                  <Input data-testid="login-password" type="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </Field>
                {status ? (
                  <MembershipStatusCard status={status} communityName={joinInfo?.name} testId="login-status" />
                ) : err && <p className="text-sm text-red-400" data-testid="login-error">{err}</p>}
                <Button type="submit" loading={busy} className="w-full" data-testid="login-submit">Sign in</Button>
              </form>
              <p className="mt-3 text-center text-sm text-muted">New to Pathwai? <Link className="tap underline" to="/signup">Create your account</Link></p>
            </Card>
          </div>
        )}

        {shownTab === "demo" && (
          <div className="space-y-3" data-testid="demo-links">
            <div>
              <h2 className="text-lg leading-snug" style={{ textWrap: "balance" }}>Look around a sample hub</h2>
              <p className="mt-1 text-xs text-muted">Sample data. Nothing is saved.</p>
            </div>
            {demoItems.length > 1 && <Seg value={demoShown} onChange={setDemoTab} testPrefix="demo-tab" items={demoItems} />}

            {demoShown === "hub" && DEMO_COMMUNITIES.filter((c) => c.featured).map((c) => (
              <div key={c.slug} className="rounded-xl border-2 bg-surface p-4" style={{ borderColor: c.accent }} data-testid={`demo-featured-${c.slug}`}>
                <p className="eyebrow">{c.eyebrow || "Featured demo"}</p>
                <p className="mt-1 text-lg font-semibold leading-tight">{c.name}</p>
                {c.tagline && <p className="mt-0.5 text-sm text-muted">{c.tagline}</p>}
                <div className="mt-4 grid gap-2">
                  <button type="button" className="flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold" style={{ background: c.accent, color: "#fff" }} data-testid="demo-start-fresh" onClick={() => startDemo("member", c.slug, { fresh: true })}>Start from scratch<ArrowRight className="h-4 w-4" aria-hidden /></button>
                  <p className="-mt-1 text-center text-xs text-muted">Enter your own business and get directions built around it.</p>
                  <button type="button" className="flex items-center justify-center gap-2 rounded-lg border border-line px-3 py-3 text-sm font-semibold hover:bg-ink/5" data-testid="demo-look-around" onClick={() => startDemo("member", c.slug)}>Look around<ArrowRight className="h-4 w-4" aria-hidden /></button>
                  <p className="-mt-1 text-center text-xs text-muted">Open a ready-made founder with a finished plan.</p>
                </div>
              </div>))}

            {demoShown === "accounts" && demo.accounts.length > 0 && (
              <div className="space-y-2">
                {[founderAcct, ...demo.accounts, hostAcct].map((a) => (
                  <button key={a.demo_role} data-testid={`demo-login-${a.demo_role}`} onClick={() => go(a.email, demo.password)}
                    className="w-full rounded-xl border border-line bg-surface p-3 text-left hover:bg-ink/5">
                    <p className="text-sm font-medium">{a.label}</p><p className="text-xs text-muted">{a.description}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {/* The way in for a founder who is not part of a community: no account, no invitation, straight to what fits. */}
        {!joinInfo && (
          <Link to="/navigator" className="group flex items-center gap-4 rounded-3xl border p-4 transition hover:-translate-y-0.5 hover:shadow-lg sm:p-5" data-testid="login-opportunities"
            style={{ borderColor: "color-mix(in srgb, var(--accent) 45%, transparent)", background: "color-mix(in srgb, var(--accent) 10%, transparent)" }}>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl" style={{ background: "var(--accent)", color: "var(--on-accent)" }}><Compass className="h-6 w-6" aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>Not part of a community?</span>
              <span className="mt-0.5 block text-base font-semibold leading-snug">Find funding, programs and events for your startup</span>
              <span className="mt-0.5 block text-sm text-muted">{resources ? `${resources.toLocaleString()} grants, loans, accelerators, mentors, founder communities and events` : "Grants, loans, accelerators, mentors, founder communities and events"} across Canada. No account needed.</span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0 transition group-hover:translate-x-0.5" aria-hidden />
          </Link>
        )}
        <PoweredBy className="mt-2 text-center" />
      </div>
    </div>
  );
}
