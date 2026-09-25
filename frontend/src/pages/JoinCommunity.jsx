import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Card, Field, Input, Spinner, TagInput } from "../components/ui";

function AdaptiveField({ f, value, onChange }) {
  // NOTE: no native `required` attribute — the server validates and its message is shown in the error card.
  return (
    <Field label={`${f.label}${f.required ? " *" : ""}`}>
      {f.type === "tags" ? <TagInput value={value || []} onChange={onChange} /> : <Input data-testid={`join-field-${f.key}`} value={value || ""} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

export default function JoinCommunity() {
  const { code } = useParams();
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [inv, setInv] = useState(null);
  const [err, setErr] = useState("");
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get(`/invites/${code}`).then((r) => { setInv(r.data); if (r.data.email) setF((x) => ({ ...x, email: r.data.email })); }).catch((e) => setErr(errMsg(e))); }, [code]);
  if (!inv && !err) return <Spinner />;
  if (!inv) return <div className="mx-auto max-w-md px-4 py-24 text-center"><h1 className="text-2xl font-semibold sm:text-3xl">Invite unavailable</h1><p className="mt-2 text-muted" data-testid="join-error-msg">{err}</p></div>;
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { await api.post(`/invites/${code}/accept`, { ...f, fields }); await refresh(); nav("/", { replace: true }); } catch (ex) { setErr(errMsg(ex)); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-semibold sm:text-3xl lg:text-4xl">Join {inv.community_name}</h1>
      <p className="mb-6 text-sm text-muted">You've been invited as a {inv.member_label_singular?.toLowerCase()}.</p>
      <Card><form className="space-y-4" onSubmit={submit}>
        <Field label="Full name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="join-name" /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} data-testid="join-email" /></Field>
        <Field label="Password" hint="10+ characters"><Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} data-testid="join-password" /></Field>
        {inv.signup_fields.map((sf) => <AdaptiveField key={sf.key} f={sf} value={fields[sf.key]} onChange={(v) => setFields({ ...fields, [sf.key]: v })} />)}
        {err && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-400" data-testid="join-error-msg">{err}</p>}
        <Button type="submit" loading={busy} className="w-full" data-testid="join-submit">Join</Button>
      </form></Card>
    </div>
  );
}
