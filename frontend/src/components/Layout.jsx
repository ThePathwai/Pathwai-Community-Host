import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Compass, MessageCircle, Target, Calendar, Gift, Info, Home as HomeIcon, LogOut, Moon, Settings, Sparkles, Sun, Users, CircleUser, ChevronDown } from "lucide-react";
import { applyBrand, effectiveMode, setModePref } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { Avatar, BackButton, PoweredBy, Wordmark, cx } from "./ui";

const ROUTES = { assistant: "/assistant", plan: "/plan", programs: "/navigator", members: "/members", events: "/events", resources: "/resources" };
const DEFAULT_LABELS = { assistant: "Ask", plan: "My plan", programs: "Programs & grants", members: "People", events: "Events", resources: "Resources" };
// Each primary section gets a fixed glyph so the phone tab bar reads at a glance instead of by label text alone.
const TAB_ICONS = { "/": HomeIcon, assistant: MessageCircle, plan: Target, programs: Compass, members: Users, events: Calendar, resources: Gift };

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
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  const detail = /^\/(members|events)\/[^/]+/.exec(loc.pathname);
  const backTo = detail ? { members: ["/members", "people"], events: ["/events", "events"] }[detail[1]] : null;

  // The sections of the navigation system. A community can rename or hide them (config.nav); anything it lists that is not one of these is ignored.
  const items = (config?.nav?.length ? config.nav : ["assistant", "plan", "programs", "members", "resources", "events"].map((k) => ({ key: k, label: DEFAULT_LABELS[k], enabled: true })))
    .filter((n) => n.enabled !== false && ROUTES[n.key]);
  // `menu: true` keeps a section out of the main bar and the phone tab bar and lists it in the account menu instead.
  const menuOnly = items.filter((n) => n.menu);
  const mainItems = items.filter((n) => !n.menu);
  const NAV = [["/", "Home"], ...mainItems.map((n) => [ROUTES[n.key], n.label])];
  const custom = config?.custom_links || [];
  // The phone tab bar has room for Home plus four sections; anything past that is listed in the account menu so it stays reachable.
  const tabItems = mainItems.slice(0, 4);
  const overflowNav = [...mainItems.slice(tabItems.length), ...menuOnly];

  return (
    <div className="min-h-screen">
      <header className="glass-bar sticky top-2 z-[45] mx-2 mt-2 rounded-[1.75rem] sm:top-3 sm:mx-4 sm:mt-3 lg:mx-8">
        <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-3 py-2 sm:gap-4 sm:px-5 lg:px-6">
          <Link to="/" className={"min-w-0 shrink overflow-hidden text-lg sm:text-2xl 2xl:max-w-[26rem] 2xl:text-2xl " + ((config?.community_name || "").length > 20 ? "xl:max-w-[17rem] xl:text-[1.05rem]" : "xl:max-w-[15rem] xl:text-xl")} data-testid="brand"><Wordmark name={config?.community_name || "Pathwai"} /></Link>
          <nav className="ml-2 hidden min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] xl:flex">
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => cx("whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm 2xl:px-4", isActive ? "glass-active font-semibold text-ink" : "text-muted hover:bg-ink/5 hover:text-ink")}>{label}</NavLink>
            ))}
            {custom.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-ink/5">{l.label} ↗</a>)}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-2">
            <Link to="/about" className="btn-ghost !px-2 sm:!px-3" data-testid="top-about" title="About Pathwai"><Info className="h-4 w-4" /><span className="hidden sm:inline xl:hidden 2xl:inline">About</span></Link>
            <button className="btn-ghost !px-2 sm:!px-3" data-testid="mode-toggle" aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={mode === "dark" ? "Light mode" : "Dark mode"} onClick={() => { const n = mode === "dark" ? "light" : "dark"; setModePref(n); applyBrand(config); setMode(n); }}>{mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
            <div className="relative" ref={menuRef}>
              <button className="flex items-center gap-2" onClick={() => setMenu(!menu)} data-testid="user-menu-trigger">
                <span className="relative"><Avatar src={user.avatar_url} name={user.name} size={32} /></span><ChevronDown className="h-3 w-3" />
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
                        return <MenuRow key={to} to={to} icon={Icon} testid={`user-menu-${n.key}`} className={menuOnly.includes(n) ? "" : "xl:hidden"}>{n.label}</MenuRow>;
                      })}
                    </MenuGroup>
                  )}
                  <MenuGroup label="You">
                    <MenuRow to="/me" icon={CircleUser} testid="user-menu-profile">My profile</MenuRow>
                    <MenuRow to="/settings" icon={Settings} testid="user-menu-settings">Settings</MenuRow>
                  </MenuGroup>
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
      <main className="mx-auto max-w-[1600px] px-4 py-6 lg:px-10 lg:py-10 xl:py-8">{backTo && <BackButton fallback={backTo[0]} label={`Back to ${backTo[1]}`} />}{children}</main>
      <nav className="glass-bar fixed inset-x-3 z-40 grid overflow-hidden rounded-[1.75rem] sm:inset-x-6 xl:hidden"
        style={{ gridTemplateColumns: `repeat(${Math.min(5, 1 + tabItems.length + 0)}, minmax(0, 1fr))`, bottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }} data-testid="tabbar">
        {[["/", "Home", TAB_ICONS["/"]], ...tabItems.map((n) => [ROUTES[n.key], n.label, TAB_ICONS[n.key]])].map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => cx("relative m-1 flex min-h-[48px] min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[1.25rem] py-1.5 text-[10px] font-semibold", isActive ? "glass-active text-ink" : "text-muted")}>
            {({ isActive }) => (<>{Icon && <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} aria-hidden />}<span className="max-w-full truncate px-0.5">{label}</span>
              </>)}
          </NavLink>
        ))}
      </nav>
      <footer className="mx-auto flex max-w-[1600px] flex-col items-center gap-3 border-t border-line px-4 pt-6 pb-32 text-center sm:flex-row sm:justify-between sm:text-left xl:pb-6"><PoweredBy /><span className="eyebrow">Find the right next step</span></footer>
    </div>
  );
}
