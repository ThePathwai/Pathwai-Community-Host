import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";
import { sampleMetrics } from "../lib/sampleReport";
import { DEMO_COMMUNITIES, demoRole, inDemoTab, isDemo, leaveDemo, startAdminDemo, startDemo } from "../lib/demo";
import { HowItWorks } from "../components/IntroTour";
import { applyBrand } from "../lib/theme";
import crowd from "../assets/crowd.jpg";
import { Button, Card, Field, Input, MembershipStatusCard, PoweredBy, Wordmark } from "../components/ui";
import SocialAuthButtons from "../components/SocialAuthButtons";

// Four sample figures for the demo entry (the same sample the About page and the admin demo use).
const SAMPLE_TILES = (() => { const m = sampleMetrics({ members: 64, seed: "pathwai-sample" }); return [
  { label: "Members active", value: `${m.active_pct}%` }, { label: "Introductions made", value: m.intros_made },
  { label: "Event turnout", value: `${m.turnout_pct}%` }, { label: "Perk opens", value: m.perk_opens }]; })();

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState({ accounts: [], password: "" });
  const inDemo = isDemo();

  useEffect(() => { api.get("/auth/demo-accounts").then((r) => setDemo(r.data)).catch(() => {}); }, []);
  // /login?demo=member|admin|host (what the "Try the demo" buttons open) signs straight in to the in-browser demo.
  const autoDemo = params.get("demo") || (inDemo ? demoRole() : null);
  const autoDone = React.useRef(false);
  // A login screen with no demo role to sign in to means the demo is over: switch to the real site.
  const demoOver = inDemoTab() && !autoDemo;
  useEffect(() => { if (demoOver) leaveDemo("/login" + window.location.search); }, [demoOver]);
  useEffect(() => {
    if (!autoDemo || autoDone.current || !demo.accounts.length) return;
    const a = autoDemo === "host" ? { email: "host@thevillage.example" } : demo.accounts.find((x) => x.demo_role === autoDemo);
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
      if (joinSlug) {
        try {
          const { data } = await api.post(`/hub/communities/${joinSlug}/apply`, {});
          await refresh();
          if (data.status === "approved") { nav("/", { replace: true }); return; }
          toast.success(`Request sent — you'll see ${joinInfo?.name || "the community"} once an admin approves you.`);
          nav("/hub", { replace: true });
          return;
        } catch { /* already a member, or the apply failed -- fall through to the usual landing */ }
      }
      // A demo link can name a community to open straight into (/login?demo=member&c=yvettabetta-pilates).
      if (isDemo() && params.get("c")) { try { await enter(params.get("c")); nav("/", { replace: true }); return; } catch { /* not a member there: fall through to the Hub */ } }
      nav(loc.state?.from && loc.state.from !== "/login" ? "/hub" : "/hub", { replace: true });
    } catch (ex) { setStatus(ex?.response?.status === 403 && /membership request/i.test(errMsg(ex)) ? (/not approved/i.test(errMsg(ex)) ? "rejected" : "pending") : ""); setErr(errMsg(ex)); if (ex?.response?.status !== 403) toast.error(errMsg(ex)); } finally { setBusy(false); }
  };

  const onSocialSignedIn = async (data) => {
    applySession(data);
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
    if (data.new_account) toast.success("You're in. Apply to a community to get started.");
    nav("/hub", { replace: true });
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-end gap-2 px-4 py-4 lg:px-8">
        <Link to="/install" className="btn-ghost pointer-events-auto border border-line bg-paper/70 backdrop-blur" data-testid="login-install">Get the app</Link>
        <Link to="/about" className="btn-ghost pointer-events-auto border border-line bg-paper/70 backdrop-blur" data-testid="login-about">About Pathwai <span aria-hidden>→</span></Link>
      </div>
      <div className="relative hidden overflow-hidden lg:block" style={{ background: "#08080B" }}>
        <img src={crowd} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(8,8,11,.55) 0%, rgba(8,8,11,.25) 45%, rgba(8,8,11,.92) 100%)" }} />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <span className="text-4xl"><Wordmark name="Pathwai" brand={{}} /></span>
          <div>
            <p className="font-display text-5xl font-bold leading-[1.08]">One login.<br />Every community you belong to.</p>
          </div>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-10">
        <span className="mb-6 text-2xl lg:hidden"><Wordmark name={joinInfo?.name || "Pathwai"} brand={joinInfo?.brand || {}} /></span>
        <h1 className="mb-1 text-2xl font-bold sm:text-3xl">Sign in to Pathwai</h1>
        <p className="mb-6 text-sm text-muted">
          {/* Every community requires admin approval now -- no community can auto-approve a join request. */}
          {joinInfo ? <>Sign in to join <strong>{joinInfo.name}</strong> — an admin will need to approve you.</> : "One account for all your communities."}
        </p>
        <Card>
          <SocialAuthButtons onSignedIn={onSocialSignedIn} disabled={busy} joinSlug={joinSlug} />
          <div className="my-5 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" /> or continue with email <span className="h-px flex-1 bg-line" />
          </div>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); go(email, password); }}>
            <Field label="Email"><Input data-testid="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label={<span className="flex items-center justify-between">Password <Link className="text-xs font-normal normal-case text-muted underline" to="/forgot-password" data-testid="forgot-password-link">Forgot password?</Link></span>}>
              <Input data-testid="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {status ? (
              <MembershipStatusCard status={status} communityName={joinInfo?.name} testId="login-status" />
            ) : err && <p className="text-sm text-red-400" data-testid="login-error">{err}</p>}
            <Button type="submit" loading={busy} className="w-full" data-testid="login-submit">Sign in</Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted">New to Pathwai? <Link className="underline" to="/signup">Create your account</Link></p>
        </Card>
        <p className="mt-4 text-center"><HowItWorks /></p>
        {demo.accounts.length > 0 && (
          <div className="mt-6 space-y-2">
            <p className="eyebrow">Try the demo</p>
            {[...demo.accounts, ...(demo.accounts.length ? [{ demo_role: "host", email: "host@thevillage.example", label: "Community host demo", description: "Sign in as the host of The Village, a private dinner club, and review who has asked to join." }] : [])].map((a) => (
              <button key={a.demo_role} data-testid={`demo-login-${a.demo_role}`} onClick={() => go(a.email, demo.password)}
                className="w-full rounded-xl border border-line bg-surface p-4 text-left hover:bg-ink/5">
                <p className="font-medium">{a.label}</p><p className="text-xs text-muted">{a.description}</p>
              </button>
            ))}
          </div>
        )}
        {!inDemo && (
          <div className="mt-6 space-y-2" data-testid="demo-links">
            <p className="eyebrow">Try the demo</p>
            <h2 className="text-xl" style={{ textWrap: "balance" }}>Keep your members. Prove your impact.</h2>
            <p className="text-xs text-muted">A practice copy with made-up members and events. Nothing you do there is saved or touches a real community.</p>
            <div className="rounded-xl border border-ink/40 bg-surface p-4" data-testid="demo-admin-card">
              <p className="font-medium">See it as the person running a community</p>
              <p className="mt-1 text-xs text-muted">Opens on the Impact view: active members, introductions made, event turnout and perk results, plus who is going quiet and a sponsor report you can open.</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="demo-sample-tiles" aria-label="Sample figures">
                {SAMPLE_TILES.map((t) => (
                  <div key={t.label} className="rounded-lg bg-ink/[.05] p-2.5"><p className="stat text-lg leading-none">{t.value}</p><p className="mt-1 text-[11px] leading-tight text-muted">{t.label}</p></div>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted">Sample data. <Link to="/about#sample" className="underline" data-testid="demo-see-report">See a full sample report</Link></p>
              <button type="button" data-testid="demo-link-admin" onClick={() => startAdminDemo()} className="btn-primary mt-3 w-full">Open the admin demo</button>
            </div>
            <button type="button" data-testid="demo-link-member" onClick={() => startDemo("member")}
              className="block w-full rounded-xl border border-line bg-surface p-4 text-left hover:bg-ink/5">
              <p className="font-medium">Or see what your members see</p><p className="text-xs text-muted">Profiles, events, perks and recommended connections, each with a reason.</p>
            </button>
            <p className="eyebrow pt-3">Or walk through a community, from either side</p>
            {DEMO_COMMUNITIES.map((c) => (
              <div key={c.slug} className="rounded-xl border border-line bg-surface p-4" data-testid={`demo-community-${c.slug}`}>
                <p className="font-medium">{c.name}</p><p className="text-xs text-muted">{c.blurb}</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" className="btn-ghost flex-1" data-testid={`demo-${c.slug}-member`} onClick={() => startDemo("member", c.slug)}>As a member</button>
                  <button type="button" className="btn-ghost flex-1" data-testid={`demo-${c.slug}-admin`} onClick={() => startDemo("admin", c.slug)}>As the admin</button>
                </div>
              </div>))}
          </div>
        )}
        <PoweredBy className="mt-10 text-center" />
      </div>
    </div>
  );
}
