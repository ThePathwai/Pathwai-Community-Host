import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";
import crowd from "../assets/crowd.jpg";
import { Button, Card, Field, Input, PoweredBy, Wordmark } from "../components/ui";
import SocialAuthButtons from "../components/SocialAuthButtons";

const SAMPLE = [
  { n: "C3", k: "Church", bg: "#FAF5EA", fg: "#1F4D3A", ac: "#1F4D3A" },
  { n: "The Village", k: "Dinner club", bg: "#0F0C0A", fg: "#EFE6D6", ac: "#C8A15B" },
  { n: "The Playr League", k: "Wellness events", bg: "#09090B", fg: "#F5F5F4", ac: "#FF2E44" },
];

export default function Login() {
  const { login, applySession } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState({ accounts: [], password: "" });

  useEffect(() => { api.get("/auth/demo-accounts").then((r) => setDemo(r.data)).catch(() => {}); }, []);

  const go = async (e, p) => {
    setBusy(true); setErr(""); setStatus("");
    try {
      await login(e, p);
      nav(loc.state?.from && loc.state.from !== "/login" ? "/hub" : "/hub", { replace: true });
    } catch (ex) { setStatus(ex?.response?.status === 403 && /membership request/i.test(errMsg(ex)) ? (/not approved/i.test(errMsg(ex)) ? "rejected" : "pending") : ""); setErr(errMsg(ex)); if (ex?.response?.status !== 403) toast.error(errMsg(ex)); } finally { setBusy(false); }
  };

  const onSocialSignedIn = (data) => {
    applySession(data);
    if (data.new_account) toast.success("You're in. Apply to a community to get started.");
    nav("/hub", { replace: true });
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden lg:block" style={{ background: "#08080B" }}>
        <img src={crowd} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(8,8,11,.55) 0%, rgba(8,8,11,.25) 45%, rgba(8,8,11,.92) 100%)" }} />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <span className="text-4xl"><Wordmark name="Pathwai" brand={{}} /></span>
          <div>
            <p className="font-display text-5xl font-bold leading-[1.08]">One login.<br />Every community you belong to.</p>
            <p className="mt-4 max-w-md text-white/70">A church, a private dinner club, a wellness brand. Each has its own people, events and look. You keep one account.</p>
            <div className="mt-8 flex gap-3">
              {SAMPLE.map((s) => (
                <div key={s.n} className="w-44 rounded-xl border p-4" style={{ background: s.bg, color: s.fg, borderColor: s.ac + "66" }}>
                  <span className="block h-1.5 w-8 rounded-full" style={{ background: s.ac }} />
                  <p className="mt-3 text-sm font-bold leading-tight">{s.n}</p><p className="text-[11px] opacity-70">{s.k}</p>
                </div>))}
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-10">
        <span className="mb-6 text-2xl lg:hidden"><Wordmark name="Pathwai" brand={{}} /></span>
        <h1 className="mb-1 text-2xl font-bold sm:text-3xl">Sign in to Pathwai</h1>
        <p className="mb-6 text-sm text-muted">One account for all your communities.</p>
        <Card>
          <SocialAuthButtons onSignedIn={onSocialSignedIn} disabled={busy} />
          <div className="my-5 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" /> or continue with email <span className="h-px flex-1 bg-line" />
          </div>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); go(email, password); }}>
            <Field label="Email"><Input data-testid="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label={<span className="flex items-center justify-between">Password <Link className="text-xs font-normal normal-case text-muted underline" to="/forgot-password" data-testid="forgot-password-link">Forgot password?</Link></span>}>
              <Input data-testid="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {status ? (
              <div className="rounded-xl border border-line bg-ink/5 p-4 text-sm" data-testid="login-status">
                <p className="font-semibold">{status === "pending" ? "Your request is under review" : "Your request wasn't approved"}</p>
                <ol className="mt-3 space-y-2 text-xs text-muted">
                  <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />Request submitted</li>
                  <li className="flex items-center gap-2"><span className={"h-2 w-2 rounded-full " + (status === "pending" ? "animate-pulse" : "")} style={{ background: status === "pending" ? "#F5A524" : "#ef4444" }} />{status === "pending" ? "The team is reviewing it" : "Reviewed by the team"}</li>
                  <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-ink/20" />{status === "pending" ? "You'll get a notification and can sign in once approved" : "Contact the team if you think this is a mistake"}</li>
                </ol>
              </div>
            ) : err && <p className="text-sm text-red-400" data-testid="login-error">{err}</p>}
            <Button type="submit" loading={busy} className="w-full" data-testid="login-submit">Sign in</Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted">New to Pathwai? <Link className="underline" to="/signup">Create your account</Link></p>
        </Card>
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
        <PoweredBy className="mt-10 text-center" />
      </div>
    </div>
  );
}
