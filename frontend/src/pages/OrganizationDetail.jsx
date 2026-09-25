import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { Avatar, Button, Card, Chip, Field, Input, Modal, Select, Spinner, Textarea } from "../components/ui";

export default function OrganizationDetail() {
  const { slug } = useParams();
  const [org, setOrg] = useState(null);
  const [mem, setMem] = useState(null);
  const [members, setMembers] = useState(null);
  const [prog, setProg] = useState(null);
  const [answers, setAnswers] = useState({});
  const [pitch, setPitch] = useState("");
  const [missing, setMissing] = useState([]);

  const load = useCallback(() => {
    api.get(`/organizations/${slug}`).then((r) => setOrg(r.data));
    api.get(`/organizations/${slug}/membership`).then((r) => setMem(r.data)).catch(() => {});
    api.get(`/organizations/${slug}/members`).then((r) => setMembers(r.data));
  }, [slug]);
  useEffect(load, [load]);
  if (!org) return <Spinner />;

  const pid = (p) => (p.id || p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  const join = async () => { try { await api.post(`/organizations/${slug}/apply`, {}); toast.success("You're in!"); load(); } catch (e) { toast.error(errMsg(e)); } };
  const openProgram = async (p) => { const { data } = await api.get(`/organizations/${slug}/programs/${pid(p)}`); setProg(data.program); setAnswers({}); setMissing([]); setPitch(""); };
  const apply = async () => {
    try { await api.post(`/organizations/${slug}/programs/${prog.id}/apply`, { extra_answers: answers, pitch }); toast.success("Application submitted"); setProg(null); load(); }
    catch (e) { const d = e.response?.data?.detail; if (d?.missing) setMissing(d.missing); toast.error(errMsg(e)); }
  };
  const list = members?.members_full || members?.members || [];

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden !p-0">
        {org.cover_url && <img src={org.cover_url} alt="" className="h-40 w-full object-cover" />}
        <div className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div><h1 className="text-2xl font-semibold sm:text-3xl">{org.name}</h1><p className="text-muted">{org.tagline}</p>
            <div className="mt-2 flex gap-1"><Chip>{org.type}</Chip><Chip>{org.region}</Chip>{org.verified && <Chip>Verified</Chip>}</div></div>
          {mem?.is_member ? <Chip className="!bg-green-500/10 !text-green-400">Member ✓</Chip> : <Button onClick={join} data-testid="join-org">Join community</Button>}
        </div>
      </Card>
      <p className="max-w-3xl leading-relaxed">{org.overview}</p>
      {org.programs?.length > 0 && (
        <section><h2 className="mb-3 text-xl font-semibold">Programs</h2>
          <div className="grid gap-3 md:grid-cols-2">{org.programs.map((p) => (
            <Card key={p.name}><p className="font-medium">{p.name}</p><p className="mt-1 text-sm text-muted">{p.description}</p>
              <div className="mt-3 flex items-center justify-between"><Chip>{p.intake_status || "Rolling"}</Chip><Button onClick={() => openProgram(p)} data-testid="apply-program">Apply</Button></div></Card>))}</div></section>
      )}
      <section><h2 className="mb-3 text-xl font-semibold">Members {members && `(${members.total})`}</h2>
        {members?.gated && <p className="mb-3 text-sm text-muted">Join this community to see full member profiles.</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{list.slice(0, 12).map((m) => (
          <Card key={m.id} className="flex items-center gap-3"><Avatar src={m.avatar_url} name={m.name} /><div><p className="text-sm font-medium">{m.name}</p><p className="text-xs text-muted">{m.title} {m.company && `· ${m.company}`}</p></div></Card>))}</div></section>
      <Modal open={!!prog} onClose={() => setProg(null)} title={prog ? `Apply · ${prog.name}` : ""}>
        {prog && <div className="space-y-4">
          <p className="text-sm text-muted">Your profile is attached automatically.</p>
          <Field label="Pitch (optional)"><Textarea value={pitch} onChange={(e) => setPitch(e.target.value)} /></Field>
          {(prog.extra_questions || []).map((q) => (
            <Field key={q.key} label={`${q.label}${q.required ? " *" : ""}`} hint={q.help_text}>
              {q.type === "select" ? <Select value={answers[q.key] || ""} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })} options={["", ...(q.options || [])]} />
                : q.type === "textarea" ? <Textarea placeholder={q.placeholder} value={answers[q.key] || ""} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })} />
                : <Input placeholder={q.placeholder} value={answers[q.key] || ""} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })} />}
              {missing.includes(q.key) && <span className="text-xs text-red-400">Required</span>}
            </Field>))}
          <Button onClick={apply} data-testid="submit-application">Submit application</Button>
        </div>}
      </Modal>
    </div>
  );
}
