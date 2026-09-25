import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api, errMsg } from "../lib/api";
import { Button, Card, Field, Input, PoweredBy, Wordmark } from "../components/ui";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [demoLink, setDemoLink] = useState(null);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { const { data } = await api.post("/auth/forgot-password", { email }); setSent(true); setDemoLink(data.demo_reset_link || null); }
    catch (ex) { setErr(errMsg(ex)); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <span className="mb-6 text-2xl"><Wordmark name="Pathwai" brand={{}} /></span>
      <h1 className="mb-1 text-2xl font-bold sm:text-3xl">Reset your password</h1>
      <p className="mb-6 text-sm text-muted">Enter the email on your account and we'll send a link to reset it.</p>
      <Card>
        {sent ? (
          <div className="space-y-2 text-sm" data-testid="forgot-password-sent">
            <p className="font-medium">Check your email</p>
            <p className="text-muted">If an account exists for {email}, a reset link is on its way. It's valid for 30 minutes.</p>
            {demoLink && (
              <p className="rounded-xl border border-dashed border-line bg-ink/5 p-3 text-xs text-muted">
                This is a demo, so there's no real inbox — use this link instead: <Link className="underline" to={demoLink.replace(/^#/, "")} data-testid="forgot-password-demo-link">open reset link</Link>
              </p>
            )}
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <Field label="Email"><Input data-testid="forgot-password-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            {err && <p className="text-sm text-red-400" data-testid="forgot-password-error">{err}</p>}
            <Button type="submit" loading={busy} className="w-full" data-testid="forgot-password-submit">Send reset link</Button>
          </form>
        )}
        <p className="mt-4 text-center text-sm text-muted"><Link className="underline" to="/login">Back to sign in</Link></p>
      </Card>
      <PoweredBy className="mt-10 text-center" />
    </div>
  );
}
