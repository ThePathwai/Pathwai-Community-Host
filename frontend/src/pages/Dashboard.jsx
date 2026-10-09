import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, errMsg, fmtDate, timeAgo } from "../lib/api";
import { useLive } from "../lib/live";
import { useAuth } from "../lib/auth";
import { Inline, useEdit } from "../components/EditKit";
import { Avatar, Spinner, StatusBadge } from "../components/ui";
import { PhotoCarousel } from "../components/PhotoCarousel";
import AboutBrand from "../components/AboutBrand";
import ProfileNudge from "../components/ProfileNudge";
import UpcomingEvents from "../components/UpcomingEvents";
import { WhyLine } from "../components/WhyMatch";
import { fieldLabel, fieldOn } from "../lib/profile";
import { AI_CHAT_ENABLED } from "../lib/features";
import { Dumbbell, Gift, ImagePlus, ListChecks, Megaphone, UserCheck2, UserPlus, Users } from "lucide-react";
import { teamOf } from "../lib/names";

// Below `lg` these become horizontally swipeable card rows instead of full vertical lists —
// everything stays on one continuous scroll (nothing hidden behind a tab), it just takes a
// swipe instead of a scroll to see the rest of a given row. `lg:` classes below restore the
// plain vertical list once there's room for the 12-col grid.
const ROW = "-mx-0.5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-0.5 pb-1 lg:mx-0 lg:flex-col lg:gap-2 lg:overflow-visible lg:px-0 lg:pb-0";
const CARD = "w-[13.5rem] shrink-0 snap-start lg:w-auto lg:shrink";

export default function Dashboard() {
  const { user, config } = useAuth();
  const { editing } = useEdit();
  const [d, setD] = useState(null);
  const nav = useNavigate();
  const goMembers = () => { try { sessionStorage.setItem("pathwai.admintab", "members"); } catch {} nav("/admin"); };
  const load = useCallback(() => api.get("/dashboard", { params: { role: user.role } }).then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e))), [user.role]);
  useEffect(() => { load(); }, [load]);
  useLive(null, load);
  if (!d) return <Spinner />;
  const pc = d.profile_completion;
  const me = d.me || user;
  const next = d.my_rsvps?.[0];
  const trackOpen = (id) => api.post(`/resources/${id}/open`).catch(() => {});
  const others = d.upcoming_events.filter((e) => !d.my_rsvps.some((m) => m.id === e.id));
  const events = [...d.my_rsvps.map((e) => ({ ...e, going: true })), ...others].slice(0, 4);
  const todo = d.open_requests.slice(0, 3);
  const classesNav = (config?.nav || []).find((n) => n.key === "classes");
  const classesOn = !!classesNav?.enabled;
  const classesLabel = classesNav?.label || "Classes";
  const Widget = ({ title, to, cta = "All", icon: Icon, className = "", quiet = false, children, ...p }) => (
    <section className={(quiet ? "flex min-h-0 flex-col rounded-2xl bg-ink/[.045] p-5 lg:p-6 " : "card flex min-h-0 flex-col ") + className} {...p}>
      <div className="mb-2.5 flex items-center lg:mb-3 justify-between">
        <h2 className="flex items-center gap-2 text-base lg:text-lg">{Icon && <Icon className="h-4 w-4 text-muted" strokeWidth={2.25} aria-hidden />}{title}</h2>
        {to && <Link className="text-xs text-muted hover:text-ink" to={to}>{cta} ›</Link>}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
  const Ring = ({ value }) => (
    <svg viewBox="0 0 44 44" className="h-16 w-16 shrink-0 -rotate-90"><circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeOpacity=".12" strokeWidth="5" /><circle cx="22" cy="22" r="18" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(value / 100) * 113} 113`} /></svg>
  );
  // Mobile dashboard, below, is a grid of small icon-forward "Tile"/"PeopleTile" widgets rather than
  // one full-width card per section — the goal is to cut how far a phone has to scroll to see
  // everything, by trading each section's full list preview for one line of the most useful context
  // (a count, the next item) that links through to the real page. Desktop is unaffected — it keeps
  // the original one-section-per-row layout further down (`hidden lg:grid`).
  const Tile = ({ to, icon: Icon, label, value, sub, className = "", testid }) => (
    <Link to={to} data-testid={testid} className={"card card-hover !p-3 flex flex-col gap-2.5 " + className}>
      <span className="flex items-center justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink/[.06]"><Icon className="h-4 w-4 text-muted" strokeWidth={2.25} aria-hidden /></span>
        {value != null && <span className="stat text-base leading-none">{value}</span>}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold leading-tight">{label}</span>
        <span className="mt-0.5 block truncate text-[11px] text-muted">{sub}</span>
      </span>
    </Link>
  );
  const AvatarStack = ({ people }) => (
    <span className="flex items-center">
      {people.slice(0, 3).map((p, i) => (<span key={p.id || p.user?.id || i} className="block rounded-full" style={{ marginLeft: i > 0 ? -10 : 0, zIndex: 3 - i }}><Avatar src={p.avatar_url || p.user?.avatar_url} name={p.name || p.user?.name} size={24} /></span>))}
    </span>
  );
  const PeopleTile = ({ to, icon: Icon, label, people, sub }) => (
    <Link to={to} className="card card-hover !p-3 flex flex-col gap-2.5">
      <span className="flex items-center justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink/[.06]"><Icon className="h-4 w-4 text-muted" strokeWidth={2.25} aria-hidden /></span>
        {people.length > 0 && <AvatarStack people={people} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold leading-tight">{label}</span>
        <span className="mt-0.5 block truncate text-[11px] text-muted">{sub}</span>
      </span>
    </Link>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl" data-testid="dash-greeting">Welcome back, {user.name?.split(" ")[0]}</h1>
          <p className="mt-2 text-sm text-muted"><Inline field="brand.welcome_message" placeholder="Add a welcome message for your members" />{(config?.brand?.welcome_message || editing) && (d.community_name || config?.community_name) ? " · " : ""}{d.community_name || config?.community_name}</p>
          <div className="mt-4 flex items-center gap-5 sm:gap-8">
            <div><p className="stat text-2xl sm:text-[1.75rem]" style={{ color: "var(--accent)" }} data-testid="dash-stat-members">{d.stats.members}</p><p className="eyebrow mt-1">{config?.member_label_plural || "Members"}</p></div>
            <div className="h-8 w-px shrink-0 bg-line" aria-hidden />
            <div><p className="stat text-2xl sm:text-[1.75rem]" data-testid="dash-stat-events">{d.stats.events}</p><p className="eyebrow mt-1">Upcoming events</p></div>
          </div>
        </div>
        {AI_CHAT_ENABLED && <Link to="/ask" className="btn-ghost">Ask anything</Link>}
      </div>

      {/* Just a heads-up on the home page — approving/declining happens in Admin, not inline here,
          so this is a single notification-style row rather than a list of actionable requests. */}
      {user.role === "admin" && (d.membership_requests_total || 0) > 0 && (
        <button
          type="button"
          onClick={goMembers}
          className="card card-hover flex w-full items-center gap-3 !p-3.5 text-left"
          style={{ borderLeft: "3px solid var(--accent)" }}
          data-testid="dash-join-requests"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink/[.06]"><UserCheck2 className="h-4 w-4 text-muted" strokeWidth={2.25} aria-hidden /></span>
          <span className="min-w-0 flex-1 text-sm font-medium">New membership requests</span>
          <span className="stat shrink-0 rounded-md bg-red-600 px-1.5 py-0.5 text-xs text-white">{d.membership_requests_total}</span>
          <span className="shrink-0 text-xs text-muted">Review ›</span>
        </button>)}

      <AboutBrand />

      <div className="grid grid-cols-2 gap-2.5 lg:hidden">
        <Link to={`/members/${user.id}`} data-testid="dash-hero-mobile" className="card card-hover !p-3.5 col-span-2 flex items-center gap-3">
          <div className="relative shrink-0">
            <Avatar src={user.avatar_url} name={user.name} size={52} />
            <span className="stat absolute -bottom-1 -right-1 flex h-5 min-w-[1.4rem] items-center justify-center rounded-full border-2 border-surface px-1 text-[9px]" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>{pc.percent}%</span>
          </div>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">{user.name}</span>
            <span className="block truncate text-xs text-muted">{[me.title, me.company].filter(Boolean).join(" · ") || "View your profile"}</span>
          </span>
        </Link>

        {pc.missing_keys?.length > 0 && <ProfileNudge pc={pc} className="col-span-2" />}

        <Link to={next ? `/events/${next.id}` : "/events"} data-testid="dash-next-mobile" className="card card-hover relative col-span-2 flex h-24 flex-col justify-end overflow-hidden !p-0">
          {next?.cover_url ? <img src={next.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            : config?.dashboard_cover_url ? <img src={config.dashboard_cover_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            : <div className="absolute inset-0" style={{ background: "var(--accent-grad)" }} />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
          <div className="relative p-3 text-white">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-white/70">{next ? "Your next event" : "Next up"}</span>
            <p className="truncate text-sm font-bold leading-tight">{next ? next.title : "Find your next event"}</p>
            {next && <p className="truncate text-[11px] text-white/75">{fmtDate(next.starts_at)}{next.location ? ` · ${next.location}` : ""}</p>}
          </div>
        </Link>

        {(config?.gallery_photos || []).length > 0 ? (
          <section className="col-span-2" data-testid="dash-gallery-mobile">
            <PhotoCarousel photos={config.gallery_photos} className="aspect-[4/5] w-full" />
          </section>
        ) : user.role === "admin" && (
          <Link to="/admin" onClick={() => { try { sessionStorage.setItem("pathwai.admintab", "brand"); } catch {} }}
            className="card card-hover col-span-2 flex items-center gap-3 !p-3.5" data-testid="dash-gallery-mobile-add">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent-grad, var(--accent))" }}><ImagePlus className="h-4 w-4" style={{ color: "var(--on-accent)" }} aria-hidden /></span>
            <span className="min-w-0"><span className="block text-sm font-semibold">Add community photos</span><span className="block text-xs text-muted">They slide through here for your members</span></span>
          </Link>
        )}

        <UpcomingEvents events={events} total={d.stats.events} className="col-span-2" />

        <section className="card col-span-2 !p-3.5" data-testid="dash-connections-mobile">
          <div className="mb-2 flex items-center justify-between"><h2 className="flex items-center gap-2 text-[15px]"><Users className="h-4 w-4 text-muted" strokeWidth={2.25} aria-hidden />Recommended connections</h2><Link to="/matches" className="text-xs text-muted">All ›</Link></div>
          {d.recommended_people.length === 0 ? <p className="text-sm text-muted">Complete your profile to get better recommendations.</p> : (
            <ul className="space-y-2">
              {d.recommended_people.slice(0, 3).map((m) => (
                <li key={m.user.id}><Link to={`/members/${m.user.id}`} className="flex items-start gap-3 rounded-xl border border-line px-3 py-2.5">
                  <Avatar src={m.user.avatar_url} name={m.user.name} size={40} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{m.user.name}</span><span className="block truncate text-xs text-muted">{m.user.title}</span><WhyLine m={m} lines={2} className="mt-1 text-xs text-ink/80" /></span></Link></li>))}
            </ul>)}
        </section>

        <Tile to="/requests" icon={ListChecks} label="To-do" value={d.open_requests.length || undefined}
          sub={d.pending_profile_requests > 0 ? `${d.pending_profile_requests} profile update requested` : (todo[0]?.title || "You're all caught up")} />
        <Tile to="/resources" icon={Gift} label="Perks" value={d.featured_resources.length || undefined}
          sub={d.featured_resources[0]?.title || "No perks yet"} />
        <PeopleTile to="/members" icon={UserPlus} label="New members" people={d.new_members || []}
          sub={(d.new_members || []).length ? `${d.new_members.length} joined recently` : "No new members yet"} />
        {classesOn && <Tile to="/classes" icon={Dumbbell} label={classesLabel} sub="Book your next one" />}
        <Tile to="/updates" icon={Megaphone} label="News" value={d.announcements.length || undefined} className={classesOn ? "col-span-2" : ""}
          sub={d.announcements[0]?.title || "Nothing posted yet"} />
      </div>

      <div className="hidden lg:grid lg:grid-cols-12 lg:gap-4 [&>*]:min-w-0" style={{ gridAutoFlow: "dense" }}>
        <Widget title="Your profile" to={`/members/${user.id}`} cta="View" quiet className="lg:col-span-3" data-testid="dash-hero">
          <div className="flex items-center gap-4">
            <Avatar src={user.avatar_url} name={user.name} size={96} />
            <div className="min-w-0">
              <p className="truncate text-xl font-semibold">{user.name}</p>
              <p className="truncate text-sm text-muted">{[me.title, me.company].filter(Boolean).join(" · ")}</p>
              <p className="mt-1 text-xs text-muted">{[fieldOn(config, "age") && me.age && `${fieldLabel(config, "age")} ${me.age}`, fieldOn(config, "height") && me.height?.split(" · ")[0]].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
          <ProfileNudge pc={pc} className="mt-3 lg:mt-4" />
        </Widget>

        <div className="card relative flex min-h-[220px] flex-col justify-end overflow-hidden !p-0 lg:col-span-5" data-testid="dash-next">
          {next?.cover_url ? (
            <img src={next.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : config?.dashboard_cover_url ? (
            <img src={config.dashboard_cover_url} alt="" className="absolute inset-0 h-full w-full object-cover" data-testid="dash-next-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: "var(--accent-grad)" }} data-testid="dash-next-logo-fallback">
              {config?.brand?.logo_url
                ? <img src={config.brand.logo_url} alt="" className="h-14 w-auto max-w-[45%] object-contain opacity-95" />
                : <span className="font-display text-4xl font-bold opacity-90" style={{ color: "var(--on-accent)" }}>{(d.community_name || config?.community_name || "?").slice(0, 1)}</span>}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
          <div className="relative p-5 text-white lg:p-6">
            <span className="rounded-md bg-white/15 px-2.5 py-1 text-[11px] font-semibold backdrop-blur">{next ? "Your next event" : "Next up"}</span>
            {next ? <div><Link to={`/events/${next.id}`} className="mt-3 block font-display text-xl font-bold leading-tight sm:text-2xl">{next.title}</Link><p className="mt-1 text-sm text-white/80">{fmtDate(next.starts_at)}{next.location ? ` · ${next.location}` : ""}</p></div>
              : <p className="mt-3 font-display text-2xl font-bold leading-tight sm:text-3xl">Find your next event</p>}
            <Link to={next ? `/events/${next.id}` : "/events"} className="mt-4 inline-flex rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black">{next ? "View details" : "Browse events"}</Link>
          </div>
        </div>

        <Widget title="Photos" className="lg:col-span-4" data-testid="dash-gallery">
          {(config?.gallery_photos || []).length > 0 ? (
            <PhotoCarousel photos={config.gallery_photos} className="aspect-[4/5] w-full" />
          ) : user.role === "admin" ? (
            <Link
              to="/admin"
              onClick={() => { try { sessionStorage.setItem("pathwai.admintab", "brand"); } catch {} }}
              className="group flex h-full min-h-[220px] w-full flex-col items-center justify-center gap-3 rounded-2xl bg-ink/[.03] text-center transition hover:bg-ink/[.06]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full transition group-hover:scale-105" style={{ background: "var(--accent-grad, var(--accent))" }}>
                <ImagePlus className="h-5 w-5" strokeWidth={2.25} style={{ color: "var(--on-accent)" }} aria-hidden />
              </span>
              <p className="text-sm font-medium">Add community photos</p>
              <p className="px-6 text-xs text-muted">Show off events and members here</p>
            </Link>
          ) : (
            <div className="relative flex h-full min-h-[220px] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl text-center" style={{ background: "var(--accent-grad, var(--accent))" }}>
              {config?.brand?.logo_url ? <img src={config.brand.logo_url} alt="" className="h-12 w-auto max-w-[60%] object-contain" /> : <p className="font-display text-3xl font-bold" style={{ color: "var(--on-accent)" }}>{(d.community_name || config?.community_name || "?").slice(0, 1)}</p>}
              <p className="px-6 text-sm font-medium" style={{ color: "var(--on-accent)" }}>{d.community_name || config?.community_name}</p>
            </div>
          )}
        </Widget>

        <UpcomingEvents events={events} total={d.stats.events} className="lg:col-span-3" />

        <Widget title={`To-do${d.open_requests.length ? ` · ${d.open_requests.length}` : ""}`} to="/requests" icon={ListChecks} className="lg:col-span-3">
          {todo.length === 0 && d.pending_profile_requests === 0 ? <p className="text-sm text-muted">You're all caught up.</p> : (
            <ul className="space-y-1.5">
              {todo.map((r) => (
                <li key={r.id}><Link to="/requests" data-testid="dash-request" className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 hover:border-ink/20 hover:bg-ink/5"><span className="min-w-0"><span className="block truncate text-sm font-medium lg:text-[15px]">{r.title}</span><span className="text-xs text-muted">{r.due_date ? `Due ${r.due_date}` : "No due date"}</span></span><StatusBadge status={r.status} /></Link></li>))}
              {d.pending_profile_requests > 0 && <li><Link to="/profile" className="flex items-center justify-between rounded-xl bg-amber-400/10 px-3 py-2 text-sm hover:bg-amber-400/[.15]">The {teamOf(config)} asked for {d.pending_profile_requests} profile update<span className="text-xs underline">Review</span></Link></li>}
            </ul>)}
        </Widget>

        <Widget title="Recommended connections" to="/matches" icon={Users} className="lg:col-span-3">
          {d.recommended_people.length === 0 ? <p className="text-sm text-muted">Complete your profile to get better recommendations.</p> : (
            <ul className={ROW}>
              {d.recommended_people.slice(0, 4).map((m) => (
                <li key={m.user.id} className={CARD}><Link to={`/members/${m.user.id}`} data-testid="dash-match" className="flex items-start gap-3 rounded-xl border border-line px-3 py-2.5 hover:border-ink/20 hover:bg-ink/5"><Avatar src={m.user.avatar_url} name={m.user.name} size={48} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium lg:text-[15px]">{m.user.name}</span><span className="block truncate text-xs text-muted">{m.user.title}</span><WhyLine m={m} lines={2} className="mt-1 text-xs text-ink/80" /></span></Link></li>))}
            </ul>)}
        </Widget>

        <Widget title="Community perks" to="/resources" icon={Gift} className="lg:col-span-3">
          <ul className={ROW}>
            {d.featured_resources.slice(0, 4).map((r) => (
              <li key={r.id} className={CARD}><a href={r.external_url || r.url} target="_blank" rel="noreferrer" onClick={() => trackOpen(r.id)} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2 hover:border-ink/20 hover:bg-ink/5">
                <span className="stat flex h-10 min-w-[3.5rem] items-center justify-center rounded-xl px-2 text-center text-xs leading-tight" style={{ background: "rgb(var(--c-ink) / 0.07)", color: "var(--accent)" }}>{r.perk_value || r.category}</span>
                <span className="min-w-0"><span className="block truncate text-sm font-medium lg:text-[15px]">{r.title}</span><span className="block truncate text-xs text-muted">{r.shared_by ? `Shared by ${r.shared_by.name}` : r.category}</span></span></a></li>))}
          </ul>
        </Widget>


        <Widget title="Community news" to="/updates" icon={Megaphone} className="lg:col-span-8">
          <div className="-mx-0.5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-0.5 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0">
            {d.announcements.slice(0, 3).map((a) => (
              <Link key={a.id} to="/updates" className="w-64 shrink-0 snap-start rounded-xl border border-line bg-ink/5 p-3 hover:border-ink/20 hover:bg-ink/10 sm:w-auto sm:shrink"><p className="line-clamp-1 text-sm font-medium lg:text-[15px]">{a.title}</p><p className="mt-1 line-clamp-2 text-xs text-muted">{a.body}</p><p className="mt-2 text-[11px] text-muted">{timeAgo(a.published_at)}</p></Link>))}
          </div>
        </Widget>

        <Widget title="New members" to="/members" icon={UserPlus} className="lg:col-span-4" data-testid="dash-new-members">
          {(d.new_members || []).length === 0 ? <p className="text-sm text-muted">No new members yet.</p> : (
            <ul className={ROW}>
              {d.new_members.map((m) => (
                <li key={m.id} className={CARD}><Link to={`/members/${m.id}`} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2 hover:border-ink/20 hover:bg-ink/5"><Avatar src={m.avatar_url} name={m.name} size={40} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{m.name}</span><span className="block truncate text-xs text-muted">{m.title}</span></span><span className="text-[11px] text-muted">Joined {timeAgo(m.joined_at)}</span></Link></li>))}
            </ul>)}
        </Widget>
      </div>
    </div>
  );
}
