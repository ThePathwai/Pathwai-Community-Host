import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fmtDate } from "../lib/api";
import { useLive } from "../lib/live";
import { Avatar, PageHeader, SectionCard, Spinner } from "../components/ui";

// Everything bookmarked across the app -- the Bookmark button on an event, a member's card and a
// perk (EventDetail/Events.jsx, MemberProfile/Members.jsx, Resources.jsx) -- gathered here and split
// into a subsection per save type (see routes/saved.py's /me/saved). Reached from the account menu
// (Layout.jsx), not the profile page: this is a separate place to browse what you've saved, distinct
// from /profile which is about your own card. Unsaving here is the same toggle as the bookmark
// button where it was saved, so the item just drops out of its list.
function SavedRow({ to, title, subtitle, onUnsave }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <Link to={to} className="min-w-0 truncate hover:underline">{title}</Link>
      <div className="flex shrink-0 items-center gap-2">
        {subtitle && <span className="text-xs text-muted">{subtitle}</span>}
        <button onClick={onUnsave} aria-label="Remove from saved" className="text-muted hover:text-ink"><Bookmark className="h-4 w-4 fill-current" /></button>
      </div>
    </li>
  );
}

export default function Saved() {
  const [saved, setSaved] = useState(null);
  const load = useCallback(() => api.get("/me/saved").then((r) => setSaved(r.data)).catch((e) => toast.error(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);
  useLive(["saved", "events", "resources"], load);
  const unsave = async (kind, id) => { try { await api.post(`/${kind}/${id}/save`); load(); } catch (e) { toast.error(errMsg(e)); } };

  return (
    <div className="space-y-5">
      <PageHeader title="Saved" subtitle="Events, members and perks you've bookmarked, all in one place." />
      {!saved ? <Spinner /> : (
        <div className="grid gap-5 lg:grid-cols-2">
          <SectionCard title="Events">
            {saved.events.length === 0 ? <p className="text-sm text-muted">Bookmark an event and it shows up here.</p> : (
              <ul className="space-y-2.5 text-sm" data-testid="saved-events">
                {saved.events.map((e) => <SavedRow key={e.id} to={`/events/${e.id}`} title={e.title} subtitle={fmtDate(e.starts_at)} onUnsave={() => unsave("events", e.id)} />)}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="Members">
            {saved.members.length === 0 ? <p className="text-sm text-muted">Bookmark a member's profile and it shows up here.</p> : (
              <ul className="space-y-2.5 text-sm" data-testid="saved-members">
                {saved.members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3">
                    <Link to={`/members/${m.id}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
                      <Avatar src={m.avatar_url} name={m.name} size={28} /><span className="min-w-0 truncate">{m.name}</span>
                    </Link>
                    <button onClick={() => unsave("users", m.id)} aria-label="Remove from saved" className="shrink-0 text-muted hover:text-ink"><Bookmark className="h-4 w-4 fill-current" /></button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="Perks" className="lg:col-span-2">
            {saved.resources.length === 0 ? <p className="text-sm text-muted">Bookmark a perk and it shows up here.</p> : (
              <ul className="space-y-2.5 text-sm" data-testid="saved-resources">
                {saved.resources.map((r) => <SavedRow key={r.id} to="/resources" title={r.title} subtitle={r.perk_value || r.category} onUnsave={() => unsave("resources", r.id)} />)}
              </ul>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
