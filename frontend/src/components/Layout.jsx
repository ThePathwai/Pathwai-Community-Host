import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Bell, Bookmark, Calendar, CheckSquare, ChevronDown, Gift, Home as HomeIcon, Layers, LifeBuoy, LogOut, Megaphone, MessageSquare, Moon, Settings, Sparkles, Sun, User, UserPlus, Users } from "lucide-react";
import { applyBrand, effectiveMode, setModePref } from "../lib/theme";
import { AI_CHAT_ENABLED } from "../lib/features";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { startNotificationWatch } from "../lib/webNotify";
import { Avatar, BackButton, PoweredBy, Wordmark, cx } from "./ui";
import { BrandDrawer, EditBar, Inline, useEdit } from "./EditKit";

const ROUTES = { members: "/members", matches: "/matches", events: "/events", resources: "/resources", updates: "/updates", requests: "/requests", support: "/support", inbox: "/inbox" };
const DEFAULT_LABELS = { members: "Members", matches: "Connections", events: "Events", resources: "Perks", updates: "News", requests: "To-do", support: "Help board", inbox: "Messages" };
// Icon-forward tab bar (mirrors Instagram / Strava / ClassPass-style bottom nav) — each primary
// section gets a fixed glyph so the bar reads at a glance instead of by label text alone.
const TAB_ICONS = { "/": HomeIcon, members: Users, matches: UserPlus, events: Calendar, resources: Gift, updates: Megaphone, requests: CheckSquare, support: LifeBuoy, inbox: MessageSquare };

export default function Layout({ children }) {
  const { user, config, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [unread, setUnread] = useState(0);
  const [menu, setMenu] = useState(false);
  const [mode, setMode] = useState(() => effectiveMode(config?.brand));
  useEffect(() => { setMode(effectiveMode(config?.brand)); }, [config]);
  const [openReqs, setOpenReqs] = useState(0);
  const [adminAttn, setAdminAttn] = useState(0);
  const [inboxUnread, setInboxUnread] = useState(0);
  const { editing, setDrawer } = useEdit();
  // Everything the old Action center tab surfaced (new join requests, responses to review, overdue
  // requests, support needing a reply, pending approvals, open requests) as one badge on the Admin
  // link here instead -- an admin sees at a glance, from the account menu, whether anything needs
  // them, without a standalone dashboard tab for it.
  useEffect(() => { if (user?.role === "admin") api.get("/admin/action-center").then((r) => setAdminAttn(["pending_memberships", "awaiting_review", "overdue_requests", "support_needing_action", "pending_moderation", "open_requests"].reduce((sum, k) => sum + (r.data[k] || 0), 0))).catch(() => {}); }, [loc.pathname, user?.role]);

  // Keeps the bell count live and shows a browser pop-up for each new notification (new event, new
  // member, approval...) once the person has turned desktop alerts on. See lib/webNotify.js.
  useEffect(() => startNotificationWatch({ onUnread: setUnread, onOpen: (n) => nav(n.link || "/notifications") }), [nav]);
  useEffect(() => { api.get("/notifications", { params: { limit: 1, sync: false } }).then((r) => setUnread(r.data.unread)).catch(() => {}); }, [loc.pathname]);

  useEffect(() => { api.get("/me/requests", { params: { status: "open" } }).then((r) => setOpenReqs(r.data.open)).catch(() => {}); }, [loc.pathname]);
  useEffect(() => { api.get("/messages/threads").then((r) => setInboxUnread(r.data.unread || 0)).catch(() => {}); }, [loc.pathname]);

  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  const detail = /^\/(members|events|organizations)\/[^/]+/.exec(loc.pathname);
  const backTo = detail ? { members: ["/members", "members"], events: ["/events", "events"], organizations: ["/organizations", "event series"] }[detail[1]] : null;

  const items = (config?.nav?.length ? config.nav : Object.keys(ROUTES).map((k) => ({ key: k, label: DEFAULT_LABELS[k], enabled: true })))
    .filter((n) => n.enabled !== false && ROUTES[n.key]);
  const NAV = [["/", "Home"], ...items.map((n) => [ROUTES[n.key], n.label])];
  const custom = config?.custom_links || [];
  // The bottom tab bar (below `xl`) only has room for Home + 4 sections, so anything past that --
  // by default News, To-do, Help board and Messages -- has no icon in the tab bar. Without this,
  // those sections would only be one click away on a wide desktop window (the full top nav) and
  // unreachable from a phone. Surfacing the same overflow list in the account menu keeps every
  // section reachable everywhere, matching what the desktop top nav already shows in full.
  const overflowNav = items.slice(4);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line/60 bg-paper/70 backdrop-blur-xl backdrop-saturate-150">
        <EditBar />
        <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-4 py-2 sm:gap-4 lg:px-10">
          <Link to="/" className="min-w-0 shrink text-lg sm:text-2xl" data-testid="brand"><Wordmark name={config?.community_name || "Pathwai"} /></Link>
          {editing && <button className="hidden whitespace-nowrap rounded-full border border-dashed border-ink/40 px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted hover:text-ink sm:inline" onClick={() => setDrawer(true)} data-testid="edit-logo">Edit logo</button>}
          <nav className="ml-2 hidden min-w-0 flex-1 gap-1 xl:flex">
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => cx("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm", isActive ? "bg-ink text-paper font-semibold" : "text-muted hover:bg-ink/5 hover:text-ink")}>{label}{editing && <span role="button" className="ml-1.5 text-[10px] opacity-60 hover:opacity-100" title="Rename in Branding & menu" onClick={(e) => { e.preventDefault(); setDrawer(true); }}>✎</span>}{to === "/requests" && openReqs > 0 && <span className="ml-1.5 rounded-full bg-ink/15 px-1.5 text-[10px]">{openReqs}</span>}{to === "/inbox" && inboxUnread > 0 && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{inboxUnread}</span>}</NavLink>
            ))}
            {custom.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-ink/5">{l.label} ↗</a>)}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-2">
            <button className="btn-ghost !px-2 sm:!px-3" data-testid="mode-toggle" aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={mode === "dark" ? "Light mode" : "Dark mode"} onClick={() => { const n = mode === "dark" ? "light" : "dark"; setModePref(n); applyBrand(config); setMode(n); }}>{mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
            {AI_CHAT_ENABLED && <Link to="/ask" className="btn-ghost !px-2 sm:!px-3" title="Ask the League"><Sparkles className="h-4 w-4" /><span className="hidden sm:inline">Ask</span></Link>}
            <Link to="/notifications" className="relative btn-ghost !px-2 sm:!px-3" data-testid="bell" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              {unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{unread}</span>}
            </Link>
            <div className="relative">
              <button className="flex items-center gap-2" onClick={() => setMenu(!menu)} data-testid="user-menu-trigger">
                <span className="relative"><Avatar src={user.avatar_url} name={user.name} size={32} />{adminAttn > 0 && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[rgb(var(--c-bg))] bg-red-600" data-testid="join-dot" />}</span><ChevronDown className="h-3 w-3" />
              </button>
              {menu && (
                <div className="absolute right-0 mt-2 w-52 rounded-xl border border-line bg-surface p-1 shadow-lg" onMouseLeave={() => setMenu(false)}>
                  <p className="px-3 py-2 text-xs text-muted">{user.name}<br />{user.email}<br /><span className="font-semibold text-ink">{config?.community_name}</span></p>
                  {overflowNav.map((n) => {
                    const to = ROUTES[n.key];
                    const Icon = TAB_ICONS[n.key];
                    const badge = to === "/requests" ? openReqs : to === "/inbox" ? inboxUnread : 0;
                    return (
                      <Link key={to} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-ink/5" to={to} data-testid={`user-menu-${n.key}`}>
                        {Icon && <Icon className="h-4 w-4" />}{n.label}
                        {badge > 0 && <span className={cx("ml-auto rounded-full px-1.5 text-[10px]", to === "/inbox" ? "bg-red-600 text-white" : "bg-ink/15")}>{badge}</span>}
                      </Link>
                    );
                  })}
                  <Link className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-ink/5" to="/hub" data-testid="user-menu-communities"><Layers className="h-4 w-4" />Switch community</Link>
                  <Link className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-ink/5" to="/profile" data-testid="user-menu-profile"><User className="h-4 w-4" />My profile</Link>
                  <Link className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-ink/5" to="/saved" data-testid="user-menu-saved"><Bookmark className="h-4 w-4" />Saved</Link>
                  <Link className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-ink/5" to="/settings" data-testid="user-menu-settings"><Settings className="h-4 w-4" />Settings</Link>
                  <Link className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-ink/5" to="/applications">My applications</Link>
                  <Link className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-ink/5" to="/organizations">Event series &amp; partners</Link>
                  <Link className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-ink/5" to="/discover">Find a program</Link>
                  {user.role === "admin" && <Link className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-ink/5" to="/admin" data-testid="user-menu-admin">Admin{adminAttn > 0 && <span className="ml-auto rounded-md bg-red-600 px-1.5 text-[10px] text-white">{adminAttn} new</span>}</Link>}
                  <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-ink/5" data-testid="user-menu-logout" onClick={async () => { nav("/login", { replace: true }); await logout(); }}><LogOut className="h-4 w-4" />Sign out</button>
                </div>
              )}
            </div>
          </div>
        </div>
        <nav className="hidden">
          {NAV.map(([to, label]) => <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => cx("whitespace-nowrap rounded-full px-3 py-1 text-sm", isActive ? "bg-ink/10" : "text-muted")}>{label}</NavLink>)}
          {custom.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="whitespace-nowrap rounded-full px-3 py-1 text-sm text-muted">{l.label} ↗</a>)}
        </nav>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6 pb-28 lg:px-10 lg:py-10 xl:pb-10">{backTo && <BackButton fallback={backTo[0]} label={`Back to ${backTo[1]}`} />}{children}</main>
      {AI_CHAT_ENABLED && loc.pathname !== "/ask" && <Link to="/ask" data-testid="ask-fab" className="btn-primary fixed bottom-5 right-5 z-40 hidden !px-4 shadow-card xl:inline-flex"><Sparkles className="h-4 w-4" />Ask</Link>}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid border-t border-line bg-paper/90 backdrop-blur-xl backdrop-saturate-150 xl:hidden"
        style={{ gridTemplateColumns: `repeat(${Math.min(5, 1 + items.length)}, minmax(0, 1fr))`, paddingBottom: "env(safe-area-inset-bottom, 0px)" }} data-testid="tabbar">
        {[["/", "Home", TAB_ICONS["/"]], ...items.slice(0, 4).map((n) => [ROUTES[n.key], n.label, TAB_ICONS[n.key]])].map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => cx("relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold", isActive ? "text-ink" : "text-muted")}>
            {/* Same counts as the desktop top nav's badges just above (`openReqs`/`inboxUnread` on
                the "/requests"/"/inbox" NavLinks) -- shown as numbers here too, not just a bare dot,
                so a phone and a desktop browser tell you the same thing at a glance. */}
            {({ isActive }) => (<>{Icon && <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} aria-hidden />}<span className="truncate px-1">{label}</span>
              {to === "/requests" && openReqs > 0 && <span className="absolute right-[calc(50%-22px)] top-0.5 min-w-[15px] rounded-full bg-ink/15 px-[3px] text-center text-[9px] font-bold leading-[15px] text-ink" aria-hidden>{openReqs}</span>}
              {to === "/inbox" && inboxUnread > 0 && <span className="absolute right-[calc(50%-22px)] top-0.5 min-w-[15px] rounded-full bg-red-600 px-[3px] text-center text-[9px] font-bold leading-[15px] text-white" aria-hidden>{inboxUnread}</span>}
              {isActive && <span className="absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 rounded-full" style={{ background: "var(--accent)" }} aria-hidden />}</>)}
          </NavLink>
        ))}
      </nav>
      <BrandDrawer />
      <footer className="mx-auto flex max-w-[1600px] items-center justify-between border-t border-line px-4 pt-6 pb-28 xl:pb-6"><PoweredBy /><Inline as="span" field="brand.footer_text" fallback="Discoverable · Connected · Measurable" className="eyebrow" /></footer>
    </div>
  );
}
