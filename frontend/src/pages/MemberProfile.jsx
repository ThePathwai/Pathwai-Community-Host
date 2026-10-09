import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { EditMemberButton } from "../components/EditKit";
import { ReachOutModal } from "../components/ReachOutModal";
import { useAuth } from "../lib/auth";
import { fieldLabel, fieldOn, typeLabel } from "../lib/profile";
import { Bookmark, Globe, Instagram, Linkedin, Mail, MessageCircle, Phone } from "lucide-react";
import { Avatar, Button, Card, Chip, Spinner } from "../components/ui";
import { WhyReasons, reasonsOf } from "../components/WhyMatch";

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
  const [why, setWhy] = useState(null); // why this person was suggested to the viewer

  const load = () => api.get(`/users/${id}`).then((r) => setU(r.data));
  useEffect(() => { setU(null); setMissing(false); load().catch(() => setMissing(true)); }, [id]); // eslint-disable-line
  useEffect(() => { setWhy(null); if (id && id !== user.id) api.get(`/matches/why/${id}`, { params: { role: user.role } }).then((r) => setWhy(r.data)).catch(() => {}); }, [id]); // eslint-disable-line
  if (missing) return <div className="py-20 text-center"><p className="font-display text-xl">This profile is not available.</p><p className="mt-2 text-sm text-muted">This player may have hidden their card.</p></div>;
  if (!u) return <Spinner />;
  // Bookmarking a member, same on/off toggle as a perk's save button (Resources.jsx) and an event's
  // (EventDetail.jsx) -- feeds the Saved section of /profile.
  const toggleSave = async () => { try { await api.post(`/users/${id}/save`); load(); } catch (e) { toast.error(errMsg(e)); } };

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
                <EditMemberButton member={u} onChanged={load} />
                {user.id !== u.id && <button className="btn-ghost" onClick={toggleSave} aria-label="Save" data-testid="member-save"><Bookmark className={`h-4 w-4 ${u.is_saved ? "fill-current" : ""}`} />{u.is_saved ? "Saved" : "Save"}</button>}
                {/* Bridges this community-scoped card to the platform-wide People panel (Hub.jsx/
                    HubPeople.jsx) -- same person, same email, but People is where follow, cross-
                    community visibility and platform messaging actually live, and there was
                    previously no way to get from one to the other. Uses u.contact.email (the same
                    field ContactCard already shows) rather than a bare u.email, which the backend
                    strips for anyone who hasn't turned on "show my email" -- so this link appears
                    exactly when this member's email is already visible on the page. */}
                {user.id !== u.id && u.contact?.email && <Link to={`/hub?person=${encodeURIComponent(u.contact.email)}`} className="btn-ghost" data-testid="view-on-people">View on People</Link>}
                {user.id !== u.id ? <Button onClick={() => setOpen(true)} data-testid="connect-btn">Reach out</Button> : <Link to="/profile" className="btn-ghost" data-testid="edit-my-profile">Edit my card</Link>}
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
      {why?.reasons?.length > 0 && (
        <Card data-testid="why-suggested" style={{ borderColor: "var(--accent)" }}>
          <div className="mb-3 flex flex-wrap items-center gap-2"><Chip accent>Suggested for you</Chip><h3 className="text-base font-semibold">Why we suggested {u.name.split(" ")[0]}</h3></div>
          <WhyReasons reasons={reasonsOf(why)} className="sm:grid sm:grid-cols-2 sm:gap-x-6 sm:gap-y-3 sm:space-y-0" />
        </Card>)}
      <ContactCard u={u} self={user.id === u.id} />
      {/* Same personal photo grid as the platform-wide People profile panel (HubPeople.jsx) --
          the account-level gallery (routes/hub.py's AccountProfileIn.photos) wasn't reaching this
          community member card before, so it only ever showed up for someone browsing cross-
          community People, never for a fellow member of this specific community. */}
      {u.photos?.length > 0 && (
        <Card data-testid="member-photos">
          <h3 className="label">Photos</h3>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6">
            {u.photos.map((src, i) => <img key={i} src={src} alt="" className="aspect-square w-full rounded-lg object-cover" data-testid="member-photo" />)}
          </div>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {fieldOn(config, "skill_set") && <List title={fieldLabel(config, "skill_set")} items={u.skill_set} />}
        {fieldOn(config, "interests_hobbies") && <List title={fieldLabel(config, "interests_hobbies")} items={u.interests_hobbies} />}
        {fieldOn(config, "goals") && <List title={fieldLabel(config, "goals")} items={u.goals} />}
        {fieldOn(config, "support_needs") && <List title={fieldLabel(config, "support_needs")} items={u.support_needs} accent />}
      </div>
      <ReachOutModal open={open} onClose={() => setOpen(false)} member={u} communityName={config?.community_name} defaultTopic={why?.can_help_you?.[0] || ""} />
    </div>
  );
}
