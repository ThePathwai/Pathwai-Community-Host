import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Compass, MessageCircle, Rocket, ShieldCheck, Target, Bell, Bookmark, Calendar, CheckSquare, ChevronDown, Dumbbell, GraduationCap, Gift, Info, Home as HomeIcon, Layers, LifeBuoy, LogOut, Megaphone, MessageSquare, Moon, Settings, Sparkles, Sun, User, UserPlus, Users, UsersRound, CircleUser, FileText, Handshake, Search } from "lucide-react";
import { applyBrand, effectiveMode, setModePref } from "../lib/theme";
import { AI_CHAT_ENABLED } from "../lib/features";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { startNotificationWatch } from "../lib/webNotify";
import { startLive, useLive } from "../lib/live";
import AlertsPrompt from "./AlertsPrompt";
import DemoGuide from "./DemoGuide";
import { Avatar, BackButton, PoweredBy, Wordmark, cx } from "./ui";
import { BrandDrawer, EditBar, Inline, useEdit } from "./EditKit";

const ROUTES = { assistant: "/assistant", plan: "/plan", programs: "/navigator", members: "/members", matches: "/matches", events: "/events", classes: "/classes", learning: "/learning", teams: "/teams", resources: "/resources", updates: "/updates", requests: "/requests", support: "/support", inbox: "/inbox" };
const DEFAULT_LABELS = { assistant: "Ask", plan: "My plan", programs: "Programs & grants", members: "Members", matches: "Connections", events: "Events", classes: "Classes", learning: "Learning", teams: "Teams", resources: "Perks", updates: "News", requests: "To-do", support: "Help board", inbox: "Messages" };
// Icon-forward tab bar (mirrors Instagram / Strava / ClassPass-style bottom nav) — each primary
// section gets a fixed glyph so the bar reads at a glance instead of by label text alone.
const TAB_ICONS = { "/": HomeIcon, assistant: MessageCircle, plan: Target, programs: Compass, members: Users, matches: UserPlus, events: Calendar, classes: Dumbbell, learning: GraduationCap, teams: UsersRound, resources: Gift, updates: Megaphone, requests: CheckSquare, support: LifeBuoy, inbox: MessageSquare };

// The account menu is grouped so it can be scanned: this community, you, communities and tools, then admin. One row per place.
function MenuGroup({ label, children }) {
  return (
    <div className="border-t border-line pb-1 pt-1.5" role="group" aria-label={label}>
      <p className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>{label}</p>
      {children}
    </div>
  );
}
function MenuRow({ to, icon: Icon, children, badge = 0, badgeText, testid, className = "" }) {
  return (
    <Link to={to} data-testid={testid} className={cx("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-ink/5", className)}>
      {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden /> : <span className="w-4" />}{children}
      {badge > 0 && <span className="ml-auto rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-[16px] text-white">{badgeText || badge}</span>}
    </Link>
  );
}

export default function Layout({ children }) {
  const { user, config, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [unread, setUnread] = useState(0);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);
  // The account menu used to stay open after you tapped a link on a phone (it only closed on mouse-leave), covering the
  // page. Close it on any tap outside it and whenever the page changes.
  // It also can't be taller than the room under the button: the menu lives in the sticky header, so on a short phone
  // anything past the bottom edge (Admin, Sign out) could never be scrolled to. Measure the room and scroll inside it.
  const [menuMax, setMenuMax] = useState(null);
  useEffect(() => {
    if (!menu) return undefined;
    const away = (e) => { if (!menuRef.current?.contains(e.target)) setMenu(false); };
    const fit = () => {
      const r = menuRef.current?.getBoundingClientRect();
      const h = window.visualViewport?.height || window.innerHeight;
      if (r) setMenuMax(Math.max(160, Math.floor(h - r.bottom - 72)));  // 72 = menu gap + the bottom tab bar
    };
    fit();
    document.addEventListener("pointerdown", away);
    window.addEventListener("resize", fit); window.addEventListener("scroll", fit, { passive: true });
    return () => { document.removeEventListener("pointerdown", away); window.removeEventListener("resize", fit); window.removeEventListener("scroll", fit); };
  }, [menu]);
  useEffect(() => { setMenu(false); }, [loc.pathname]);
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
  const isAdmin = user?.role === "admin";
  const refreshBadges = useCallback(() => {
    if (isAdmin) api.get("/admin/action-center").then((r) => setAdminAttn(["pending_memberships", "awaiting_review", "overdue_requests", "support_needing_action", "pending_moderation", "open_requests"].reduce((sum, k) => sum + (r.data[k] || 0), 0))).catch(() => {});
    api.get("/notifications", { params: { limit: 1, sync: false } }).then((r) => setUnread(r.data.unread)).catch(() => {});
    api.get("/me/requests", { params: { status: "open" } }).then((r) => setOpenReqs(r.data.open)).catch(() => {});
    api.get("/messages/threads").then((r) => setInboxUnread(r.data.unread || 0)).catch(() => {});
  }, [isAdmin]);
  useEffect(() => { refreshBadges(); }, [loc.pathname, refreshBadges]);

  // Keeps the bell count live and shows a browser pop-up for each new notification (new event, new
  // member, approval...) once the person has turned desktop alerts on. See lib/webNotify.js.
  useEffect(() => startNotificationWatch({ onUnread: setUnread, onOpen: (n) => nav(n.link || "/notifications") }), [nav]);

  // Live refresh (lib/live.js): the server pings when something changes in the community, so the badges
  // update straight away and a new notification pops up without waiting for the 30-second check.
  useEffect(() => startLive(), []);
  useLive(["notifications", "messages", "requests", "members", "support", "admin"], () => {
    refreshBadges();
    window.dispatchEvent(new Event("pw:check-notifications"));
  });

  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  const detail = /^\/(members|events|organizations)\/[^/]+/.exec(loc.pathname);
  const backTo = detail ? { members: ["/members", "members"], events: ["/events", "events"], organizations: ["/organizations", "event series"] }[detail[1]] : null;

  // Programs & grants, My plan and Ask are opt-in per community (config.nav), so the default nav leaves them out.
  const items = (config?.nav?.length ? config.nav : Object.keys(ROUTES).filter((k) => k !== "programs" && k !== "plan" && k !== "assistant").map((k) => ({ key: k, label: DEFAULT_LABELS[k], enabled: true })))
    .filter((n) => n.enabled !== false && ROUTES[n.key] && !((n.key === "plan" || n.key === "assistant") && isAdmin)); // the planner is a founder's own page, and opt-in per community (config.nav)
  // `menu: true` keeps a section out of the main bar and the phone tab bar and lists it in the account menu instead, so a hub can show its four or five main pages and nothing else.
  const menuOnly = items.filter((n) => n.menu);
  const mainItems = items.filter((n) => !n.menu);
  const NAV = [["/", "Home"], ...mainItems.map((n) => [ROUTES[n.key], n.label])];
  const custom = config?.custom_links || [];
  // The bottom tab bar (below `xl`) only has room for Home + 4 sections, so anything past that --
  // by default News, To-do, Help board and Messages -- has no icon in the tab bar. Without this,
  // those sections would only be one click away on a wide desktop window (the full top nav) and
  // unreachable from a phone. Surfacing the same overflow list in the account menu keeps every
  // section reachable everywhere, matching what the desktop top nav already shows in full.
  // An admin's tab bar gives the fifth slot to Admin (their main toolkit), so the last section moves into the account menu.
  // Messages always gets a tab on a phone (it takes the spot Connections/Intros would have had, and Connections moves into the menu).
  const tabOrder = (() => {
    const inbox = mainItems.find((n) => n.key === "inbox");
    if (!inbox) return mainItems;
    const rest = mainItems.filter((n) => n.key !== "inbox");
    const mi = rest.findIndex((n) => n.key === "matches");
    if (mi >= 0) { const m = rest[mi]; rest.splice(mi, 1); rest.splice(Math.min(mi, rest.length), 0, inbox); return [...rest, m]; }
    rest.splice(Math.min(1, rest.length), 0, inbox);
    return rest;
  })();
  const tabItems = isAdmin ? tabOrder.slice(0, 3) : tabOrder.slice(0, 4);
  const overflowNav = [...tabOrder.slice(tabItems.length), ...menuOnly];

  return (
    <div className="min-h-screen">
      <AlertsPrompt />
      <header className="sticky top-0 z-[45] border-b border-line/60 bg-paper/70 backdrop-blur-xl backdrop-saturate-150">
        <EditBar />
        <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-4 py-2 sm:gap-4 lg:px-10">
          <Link to="/" className={"min-w-0 shrink overflow-hidden text-lg sm:text-2xl 2xl:max-w-[26rem] 2xl:text-2xl " + ((config?.community_name || "").length > 20 ? "xl:max-w-[17rem] xl:text-[1.05rem]" : "xl:max-w-[15rem] xl:text-xl")} data-testid="brand"><Wordmark name={config?.community_name || "Pathwai"} /></Link>
          {editing && <button className="hidden whitespace-nowrap rounded-full border border-dashed border-ink/40 px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted hover:text-ink sm:inline" onClick={() => setDrawer(true)} data-testid="edit-logo">Edit logo</button>}
          <nav className="ml-2 hidden min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] xl:flex">
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => cx("whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm 2xl:px-3", isActive ? "bg-ink text-paper font-semibold" : "text-muted hover:bg-ink/5 hover:text-ink")}>{label}{editing && <span role="button" className="ml-1.5 text-[10px] opacity-60 hover:opacity-100" title="Rename in Branding & menu" onClick={(e) => { e.preventDefault(); setDrawer(true); }}>✎</span>}{to === "/requests" && openReqs > 0 && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white" data-testid="badge-requests">{openReqs}</span>}{to === "/inbox" && inboxUnread > 0 && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white" data-testid="badge-inbox">{inboxUnread}</span>}</NavLink>
            ))}
            {custom.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-ink/5">{l.label} ↗</a>)}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-2">
            {isAdmin && (
              <NavLink to="/admin" data-testid="top-admin" aria-label="Admin" title="Admin" className={({ isActive }) => cx("btn-ghost relative hidden !px-2.5 xl:inline-flex", isActive && "!bg-ink !text-paper")}>
                <ShieldCheck className="h-4 w-4" aria-hidden /><span className="hidden 2xl:inline">Admin</span>
                {adminAttn > 0 && <span className="ml-0.5 rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-[16px] text-white" data-testid="top-admin-badge">{adminAttn}</span>}
              </NavLink>
            )}
            <Link to="/about" className="btn-ghost !px-2 sm:!px-3" data-testid="top-about" title="About Pathwai"><Info className="h-4 w-4" /><span className="hidden sm:inline xl:hidden 2xl:inline">About</span></Link>
            <button className="btn-ghost !px-2 sm:!px-3" data-testid="mode-toggle" aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={mode === "dark" ? "Light mode" : "Dark mode"} onClick={() => { const n = mode === "dark" ? "light" : "dark"; setModePref(n); applyBrand(config); setMode(n); }}>{mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
            {AI_CHAT_ENABLED && <Link to="/ask" className="btn-ghost !px-2 sm:!px-3" title="Ask the League"><Sparkles className="h-4 w-4" /><span className="hidden sm:inline">Ask</span></Link>}
            <Link to="/notifications" className="relative btn-ghost !px-2 sm:!px-3" data-testid="bell" aria-label="Notifications">
              <Bell className={cx("h-4 w-4", unread > 0 && "text-red-500")} fill={unread > 0 ? "currentColor" : "none"} />
              {unread > 0 && <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-red-600 px-1.5 text-center text-[10px] font-bold leading-[18px] text-white" data-testid="badge-bell">{unread > 99 ? "99+" : unread}</span>}
            </Link>
            <div className="relative" ref={menuRef}>
              <button className="flex items-center gap-2" onClick={() => setMenu(!menu)} data-testid="user-menu-trigger">
                <span className="relative"><Avatar src={user.avatar_url} name={user.name} size={32} />{adminAttn > 0 && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[rgb(var(--c-bg))] bg-red-600" data-testid="join-dot" />}</span><ChevronDown className="h-3 w-3" />
              </button>
              {menu && (
                <div className="absolute right-0 z-50 mt-2 w-64 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-1.5 shadow-lg" style={{ maxHeight: menuMax || "70vh" }} data-testid="user-menu">
                  <div className="flex items-center gap-3 px-2.5 py-2.5">
                    <Avatar src={user.avatar_url} name={user.name} size={40} />
                    <div className="min-w-0"><p className="truncate text-sm font-semibold">{user.name}</p><p className="truncate text-xs text-muted">{user.email}</p>{config?.community_name && <p className="truncate text-xs font-semibold">{config.community_name}</p>}</div>
                  </div>
                  {/* In this community: the sections that did not fit in the tab bar. On a wide screen the top bar already has them, so only the menu-only ones show. */}
                  {overflowNav.length > 0 && (
                    <MenuGroup label={config?.community_name ? `In ${config.community_name}` : "In this community"}>
                      {overflowNav.map((n) => {
                        const to = ROUTES[n.key];
                        const Icon = TAB_ICONS[n.key];
                        const badge = to === "/requests" ? openReqs : to === "/inbox" ? inboxUnread : 0;
                        return <MenuRow key={to} to={to} icon={Icon} badge={badge} testid={`user-menu-${n.key}`} className={menuOnly.includes(n) ? "" : "xl:hidden"}>{n.label}</MenuRow>;
                      })}
                    </MenuGroup>
                  )}
                  <MenuGroup label="You">
                    <MenuRow to={config?.ecosystem ? "/me" : "/profile"} icon={CircleUser} testid="user-menu-profile">My profile</MenuRow>
                    <MenuRow to="/saved" icon={Bookmark} testid="user-menu-saved">Saved</MenuRow>
                    <MenuRow to="/applications" icon={FileText}>My applications</MenuRow>
                    <MenuRow to="/settings" icon={Settings} testid="user-menu-settings">Settings</MenuRow>
                  </MenuGroup>
                  <MenuGroup label="Communities and tools">
                    <MenuRow to="/hub" icon={Layers} testid="user-menu-communities">Switch community</MenuRow>
                    <MenuRow to="/discover" icon={Search}>Find a community</MenuRow>
                    <MenuRow to="/navigator" icon={Compass} testid="user-menu-navigator">Navigator</MenuRow>
                    <MenuRow to="/organizations" icon={Handshake}>Event series &amp; partners</MenuRow>
                  </MenuGroup>
                  {isAdmin && (
                    <MenuGroup label="Manage">
                      <MenuRow to="/admin" icon={ShieldCheck} testid="user-menu-admin" badge={adminAttn} badgeText={`${adminAttn} new`}>Admin</MenuRow>
                    </MenuGroup>
                  )}
                  <div className="mt-1 border-t border-line pt-1">
                    <button className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-ink/5" data-testid="user-menu-logout" onClick={async () => { nav("/login", { replace: true }); await logout(); }}><LogOut className="h-4 w-4 text-muted" />Sign out</button>
                  </div>
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
      <main className="mx-auto max-w-[1600px] px-4 py-6 lg:px-10 lg:py-10"><DemoGuide />{backTo && <BackButton fallback={backTo[0]} label={`Back to ${backTo[1]}`} />}{children}</main>
      {AI_CHAT_ENABLED && loc.pathname !== "/ask" && <Link to="/ask" data-testid="ask-fab" className="btn-primary fixed bottom-5 right-5 z-40 hidden !px-4 shadow-card xl:inline-flex"><Sparkles className="h-4 w-4" />Ask</Link>}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid border-t border-line bg-paper/90 backdrop-blur-xl backdrop-saturate-150 xl:hidden"
        style={{ gridTemplateColumns: `repeat(${Math.min(5, 1 + tabItems.length + (isAdmin ? 1 : 0))}, minmax(0, 1fr))`, paddingBottom: "env(safe-area-inset-bottom, 0px)" }} data-testid="tabbar">
        {[["/", "Home", TAB_ICONS["/"]], ...tabItems.map((n) => [ROUTES[n.key], n.label, TAB_ICONS[n.key]]), ...(isAdmin ? [["/admin", "Admin", ShieldCheck]] : [])].map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => cx("relative flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden py-1.5 text-[10px] font-semibold", isActive ? "text-ink" : "text-muted")}>
            {/* Same counts as the desktop top nav's badges just above (`openReqs`/`inboxUnread` on
                the "/requests"/"/inbox" NavLinks) -- shown as numbers here too, not just a bare dot,
                so a phone and a desktop browser tell you the same thing at a glance. */}
            {({ isActive }) => (<>{Icon && <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} aria-hidden />}<span className="max-w-full truncate px-0.5">{label}</span>
              {to === "/requests" && openReqs > 0 && <span className="absolute right-[calc(50%-22px)] top-0.5 min-w-[15px] rounded-full bg-red-600 px-[3px] text-center text-[9px] font-bold leading-[15px] text-white" aria-hidden>{openReqs}</span>}
              {to === "/inbox" && inboxUnread > 0 && <span className="absolute right-[calc(50%-22px)] top-0.5 min-w-[15px] rounded-full bg-red-600 px-[3px] text-center text-[9px] font-bold leading-[15px] text-white" aria-hidden>{inboxUnread}</span>}
              {to === "/admin" && adminAttn > 0 && <span className="absolute right-[calc(50%-22px)] top-0.5 min-w-[15px] rounded-full bg-red-600 px-[3px] text-center text-[9px] font-bold leading-[15px] text-white" aria-hidden data-testid="tab-admin-badge">{adminAttn}</span>}
              {isActive && <span className="absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 rounded-full" style={{ background: "var(--accent)" }} aria-hidden />}</>)}
          </NavLink>
        ))}
      </nav>
      <BrandDrawer />
      <footer className="mx-auto flex max-w-[1600px] flex-col items-center gap-3 border-t border-line px-4 pt-6 pb-28 text-center sm:flex-row sm:justify-between sm:text-left xl:pb-6"><PoweredBy /><Inline as="span" field="brand.footer_text" fallback="Discoverable · Connected · Measurable" className="eyebrow" /></footer>
    </div>
  );
}
