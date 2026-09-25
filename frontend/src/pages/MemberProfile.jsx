import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { EditMemberButton } from "../components/EditKit";
import { useAuth } from "../lib/auth";
import { fieldLabel, fieldOn, typeLabel } from "../lib/profile";
import { Globe, Instagram, Linkedin, Mail, MessageCircle, Phone } from "lucide-react";
import { Avatar, Button, Card, Chip, Field, Modal, Select, Spinner, Textarea, Input } from "../components/ui";

const List = ({ title, items, accent }) => items?.length ? (
  <Card style={accent ? { borderColor: "var(--accent)" } : undefined}><h3 className="label" style={accent ? { color: "var(--accent)" } : undefined}>{title}</h3><div className="flex flex-wrap gap-1.5">{items.map((x) => { const t = typeof x === "string" ? x : x.name || x.label; return <Chip key={t} accent={accent}>{t}</Chip>; })}</div></Card>
) : null;

function ContactCard({ u, self }) {
  const c = u.contact || {};
  const digits = c.phone && c.phone.replace(/[^+\d]/g, "");
  const rows = [
    [Mail, "Email", c.email, c.email && `mailto:${c.email}`],
    [Phone, "Call", c.phone, digits && `tel:${digits}`],
    [MessageCircle, "Text", c.phone, digits && `sms:${digits}`],
    [Linkedin, "LinkedIn", c.linkedin && c.linkedin.replace(/^https?:\/\/(www\.)?/, ""), c.linkedin],
    [Instagram, "Instagram", c.instagram, c.instagram && `https://instagram.com/${c.instagram.replace(/^@/, "")}`],
    [Globe, "Website", c.website && c.website.replace(/^https?:\/\//, ""), c.website],
  ].filter((r) => r[2]);
  return (
    <Card data-testid="contact-card">
      <div className="mb-3 flex items-center justify-between"><h3 className="label !mb-0">Contact</h3>{self && <Link to="/profile" className="text-xs text-muted hover:text-ink">{u.contact_visibility === "hidden" ? "Hidden from members · edit" : "Visible to members · edit"}</Link>}</div>
      {rows.length === 0 ? <p className="text-sm text-muted">{u.contact_visibility === "hidden" ? "This member keeps contact details private." : "No contact details added yet."}</p> : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(([Icon, label, text, href]) => (
            <li key={label}><a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 hover:bg-ink/5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgb(var(--c-ink) / 0.07)", color: "var(--accent)" }}><Icon className="h-4 w-4" /></span>
              <span className="min-w-0"><span className="block text-[11px] uppercase tracking-wider text-muted">{label}</span><span className="block truncate text-sm">{text}</span></span></a></li>))}
        </ul>)}
    </Card>
  );
}

export default function MemberProfile() {
  const { id } = useParams();
  const { user, config } = useAuth();
  const [u, setU] = useState(null);
  const [missing, setMissing] = useState(false);
  const [open, setOpen] = useState(false);
  const [kinds, setKinds] = useState([]);
  const [f, setF] = useState({ kind: "20-min-chat", topic: "", note: "" });

  useEffect(() => { setU(null); setMissing(false); api.get(`/users/${id}`).then((r) => setU(r.data)).catch(() => setMissing(true)); api.get("/connect-requests/kinds").then((r) => setKinds(r.data.kinds)); }, [id]);
  if (missing) return <div className="py-20 text-center"><p className="font-display text-xl">This profile is not available.</p><p className="mt-2 text-sm text-muted">This player may have hidden their card.</p></div>;
  if (!u) return <Spinner />;

  const send = async () => {
    try { await api.post("/connect-requests", { recipient_id: u.id, ...f }); toast.success("Request sent"); setOpen(false); } catch (e) { toast.error(errMsg(e)); }
  };

  const stats = [["age", u.age && `${u.age}`], ["height", u.height], ["title", u.title]].filter(([k, v]) => v && fieldOn(config, k));
  return (
    <div className="space-y-5">
      <Card className="!p-0 overflow-hidden" data-testid="member-card">
        <div className="grid gap-0 md:grid-cols-[260px_1fr]">
          <div className="relative min-h-[260px] bg-ink/5">
            {u.avatar_url ? <img src={u.avatar_url} alt={u.name} className="absolute inset-0 h-full w-full object-cover" /> : <Avatar name={u.name} size={260} square />}
          </div>
          <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-2 flex flex-wrap gap-1.5">{u.member_type && u.member_type !== "founder" && <Chip accent>{typeLabel(config, u.member_type)}</Chip>}</div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl">{u.name}</h1>
                <p className="mt-1 text-sm text-muted">{[u.company, u.location].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="flex gap-2">
                <EditMemberButton member={u} onChanged={() => api.get(`/users/${id}`).then((r) => setU(r.data))} />
                {user.id !== u.id ? <Button onClick={() => setOpen(true)} data-testid="connect-btn">Say hi</Button> : <Link to="/profile" className="btn-ghost" data-testid="edit-my-profile">Edit my card</Link>}
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-px overflow-hidden border border-line bg-line" style={{ borderRadius: "var(--r-card)" }}>
              {stats.map(([k, v]) => (
                <div key={k} className="bg-surface px-4 py-3"><dt className="eyebrow">{fieldLabel(config, k)}</dt><dd className={"mt-1 " + (k === "title" ? "text-sm font-medium leading-snug" : "font-display text-2xl")}>{k === "height" ? v.split(" · ")[0] : v}{k === "height" && v.includes(" · ") && <span className="ml-1 text-xs text-muted">{v.split(" · ")[1]}</span>}</dd></div>
              ))}
            </dl>
            {u.bio && <p className="text-sm leading-relaxed text-ink/90">{u.bio}</p>}
            {u.company && <p className="text-xs text-muted">{u.title} at {u.company}</p>}
          </div>
        </div>
      </Card>
      <ContactCard u={u} self={user.id === u.id} />
      <div className="grid gap-4 md:grid-cols-2">
        {fieldOn(config, "skill_set") && <List title={fieldLabel(config, "skill_set")} items={u.skill_set} />}
        {fieldOn(config, "interests_hobbies") && <List title={fieldLabel(config, "interests_hobbies")} items={u.interests_hobbies} />}
        {fieldOn(config, "goals") && <List title={fieldLabel(config, "goals")} items={u.goals} />}
        {fieldOn(config, "support_needs") && <List title={fieldLabel(config, "support_needs")} items={u.support_needs} accent />}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={`Say hi to ${u.name.split(" ")[0]}`}>
        <div className="space-y-4">
          <Field label="What kind of connection?"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={kinds.map((k) => ({ value: k.kind, label: k.label }))} /></Field>
          <Field label="What do you want to talk about?"><Input data-testid="connect-topic" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} maxLength={240} /></Field>
          <Field label="Note (optional)"><Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          <Button onClick={send} disabled={!f.topic.trim()} data-testid="connect-send">Send</Button>
        </div>
      </Modal>
    </div>
  );
}
