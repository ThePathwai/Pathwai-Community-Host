import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { Button, Card, Field, Input, PoweredBy, Wordmark } from "../components/ui";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return setErr("Password needs 10+ characters with a letter and a number.");
    if (password !== confirm) return setErr("Passwords don't match.");
    setBusy(true); setErr("");
    try {
      await api.post("/auth/reset-password", { token, password });
      toast.success("Password updated. Sign in with your new password.");
      nav("/login", { replace: true });
    } catch (ex) { setErr(errMsg(ex)); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <span className="mb-6 text-2xl"><Wordmark name="Pathwai" brand={{}} /></span>
      <h1 className="mb-1 text-2xl font-bold sm:text-3xl">Choose a new password</h1>
      <p className="mb-6 text-sm text-muted">10+ characters, with a letter and a number.</p>
      <Card>
        {!token ? (
          <p className="text-sm text-red-400" data-testid="reset-password-missing-token">This link is missing its reset token. Request a new one from the <Link className="underline" to="/forgot-password">forgot password</Link> page.</p>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <Field label="New password"><Input data-testid="reset-password-new" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} /></Field>
            <Field label="Confirm new password"><Input data-testid="reset-password-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={10} /></Field>
            {err && <p className="text-sm text-red-400" data-testid="reset-password-error">{err}</p>}
            <Button type="submit" loading={busy} className="w-full" data-testid="reset-password-submit">Update password</Button>
          </form>
        )}
        <p className="mt-4 text-center text-sm text-muted"><Link className="underline" to="/login">Back to sign in</Link></p>
      </Card>
      <PoweredBy className="mt-10 text-center" />
    </div>
  );
}
