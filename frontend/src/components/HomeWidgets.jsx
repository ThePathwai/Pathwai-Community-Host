import React, { useState } from "react";
import { LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Modal } from "./ui";

// The blocks on a home screen an admin can switch on or off, one list for what members see and one for the admin's own
// home. Mirrors HOME_WIDGETS in backend/routes/community_config.py. `adminOnly` blocks only exist on the admin's home.
export const HOME_WIDGETS = [
  { key: "profile", label: "Your profile", hint: "Photo, name and how complete the profile is" },
  { key: "next_event", label: "Next event", hint: "The big card for the next thing on the schedule" },
  { key: "photos", label: "Photos", hint: "The photo carousel" },
  { key: "events", label: "Upcoming events", hint: "The short list of what's coming up" },
  { key: "todo", label: "To-do", hint: "Forms and updates the team has asked for" },
  { key: "connections", label: "Recommended connections", hint: "People picked for each person" },
  { key: "reliability", label: "Community scorecard", hint: "How dependable the community is: show-up rate, events held, introductions, help answered", memberOnly: true },
  { key: "perks", label: "Perks", hint: "Offers and perks from the community" },
  { key: "learning", label: "Learning", hint: "Programs from a connected academy (when one is connected)" },
  { key: "news", label: "News", hint: "Latest announcements" },
  { key: "new_members", label: "New members", hint: "Who just joined" },
  { key: "join_requests", label: "Admin shortcut", hint: "What needs the admin (people waiting to join, replies, approvals) with a link into Admin", adminOnly: true },
];

/** The set of blocks hidden on this person's home screen. Admins use their own list; everyone else uses the members' list. */
export const hiddenFor = (config, user) => new Set(((config?.home_hidden || {})[user?.role === "admin" ? "admin" : "member"]) || []);

function Switch({ on, onChange, label, testid }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} data-testid={testid} onClick={() => onChange(!on)}
      className="relative h-6 w-10 shrink-0 rounded-full transition-colors" style={{ background: on ? "var(--accent)" : "rgb(var(--c-ink) / 0.18)" }}>
      <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: on ? "1.15rem" : "0.125rem" }} />
    </button>
  );
}

/** Two columns of switches: what members see, and what the admin sees. Saves on every flip. */
export function HomeWidgetsPanel() {
  const { config, loadConfig } = useAuth();
  const [busy, setBusy] = useState(false);
  const hidden = { member: new Set(config?.home_hidden?.member || []), admin: new Set(config?.home_hidden?.admin || []) };
  const flip = async (aud, key, on) => {
    const next = { member: [...hidden.member], admin: [...hidden.admin] };
    const set = new Set(next[aud]);
    on ? set.delete(key) : set.add(key);
    next[aud] = [...set];
    setBusy(true);
    try { await api.patch("/community/config", { home_hidden: next }); await loadConfig(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <div data-testid="home-widgets-panel" aria-busy={busy}>
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-5 gap-y-3">
        <span />
        <span className="eyebrow w-14 text-center">Members</span>
        <span className="eyebrow w-14 text-center">Admins</span>
        {HOME_WIDGETS.map((w) => (
          <React.Fragment key={w.key}>
            <div className="min-w-0"><p className="text-sm font-medium">{w.label}</p><p className="text-xs text-muted">{w.hint}</p></div>
            <div className="flex w-14 justify-center">{w.adminOnly ? <span className="text-xs text-muted">n/a</span> : <Switch on={!hidden.member.has(w.key)} onChange={(v) => flip("member", w.key, v)} label={`${w.label} on the members' home`} testid={`hw-member-${w.key}`} />}</div>
            <div className="flex w-14 justify-center">{w.memberOnly ? <span className="text-xs text-muted">n/a</span> : <Switch on={!hidden.admin.has(w.key)} onChange={(v) => flip("admin", w.key, v)} label={`${w.label} on the admin home`} testid={`hw-admin-${w.key}`} />}</div>
          </React.Fragment>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">Changes save as you flip them. Hidden blocks are only hidden from the home screen; the pages behind them stay in the menu.</p>
    </div>
  );
}

/** Admin-only button for the home screen header. */
export function CustomizeHome() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-ghost" data-testid="customize-home" onClick={() => setOpen(true)}><LayoutGrid className="mr-1.5 h-4 w-4" aria-hidden />Customize home</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Home screen"><HomeWidgetsPanel /></Modal>
    </>
  );
}
