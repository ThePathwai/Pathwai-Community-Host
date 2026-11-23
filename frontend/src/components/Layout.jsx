import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Building2, Compass, MessageCircle, Target, Calendar, Gift, Info, Home as HomeIcon, LogOut, Moon, Settings, Sparkles, Sun, Users, CircleUser, ChevronDown } from "lucide-react";
import { applyBrand, effectiveMode, setModePref } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { Avatar, BackButton, PoweredBy, Wordmark, cx } from "./ui";
import SpaceSwitcher from "./SpaceSwitcher";

const ROUTES = { assistant: "/assistant", plan: "/plan", programs: "/navigator", members: "/members", events: "/events", resources: "/resources" };
const DEFAULT_LABELS = { assistant: "Ask", plan: "My plan", programs: "Programs & grants", members: "People", events: "Events", resources: "Resources" };
// Each primary section gets a fixed glyph so the phone tab bar reads at a glance instead of by label text alone.
const TAB_ICONS = { "/": HomeIcon, assistant: MessageCircle, plan: Target, programs: Compass, members: Users, events: Calendar, resources: Gift };

// The account menu is grouped so it can be scanned: this community, you, communities and tools. One row per place.
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
  const sideRef = useRef(null);   // the account button at the bottom of the computer sidebar
  // The account menu used to stay open after you tapped a link on a phone (it only closed on mouse-leave), covering the
  // page. Close it on any tap outside it and whenever the page changes.
  // It also can't be taller than the room under the button: the menu lives in the sticky header, so on a short phone
  // anything past the bottom edge (Sign out) could never be scrolled to. Measure the room and scroll inside it.
  const [menuMax, setMenuMax] = useState(null);
  useEffect(() => {
    if (!menu) return undefined;
    const away = (e) => { if (!menuRef.current?.contains(e.target) && !sideRef.current?.contains(e.target)) setMenu(false); };
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
  // The computer sidebar lists every section (the same place Pathwai's own sidebar is), then the parts of your account.
  const sideItems = [["/", "Home", TAB_ICONS["/"]], ...[...mainItems, ...menuOnly].map((n) => [ROUTES[n.key], n.label, TAB_ICONS[n.key]])];
  const youItems = [["/journey", "Journey", Target], ["/me", "My profile", CircleUser], ["/communities", "Communities", Building2], ["/settings", "Settings", Settings]];
  const toggleMode = () => { const n = mode === "dark" ? "light" : "dark"; setModePref(n); applyBrand(config); setMode(n); };
  const SideLink = ({ to, label, Icon }) => (
    <NavLink to={to} end={to === "/"} data-testid={`side-${to === "/" ? "home" : to.slice(1)}`}
      className={({ isActive }) => cx("group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition", isActive ? "bg-ink/10 text-ink" : "text-muted hover:bg-ink/5 hover:text-ink")}>
      {Icon ? <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden /> : <span className="w-[18px]" />}<span className="min-w-0 flex-1 truncate">{label}</span>
    </NavLink>
  );
  // The account menu, used by the top bar on phones (opens down) and by the sidebar on a computer (opens up).
  const AccountPanel = ({ up }) => menu && (
    <div className={cx("absolute z-50 w-64 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-1.5 shadow-lg", up ? "bottom-full left-0 mb-2" : "right-0 mt-2")} style={{ maxHeight: up ? "70vh" : menuMax || "70vh", background: "rgb(var(--c-surface))" }} data-testid="user-menu">
      <div className="flex items-center gap-3 px-2.5 py-2.5">
        <Avatar src={user.avatar_url} name={user.name} size={40} />
        <div className="min-w-0"><p className="truncate text-sm font-semibold">{user.name}</p><p className="truncate text-xs text-muted">{user.email}</p>{config?.community_name && <p className="truncate text-xs font-semibold">{config.community_name}</p>}</div>
      </div>
      {/* On a phone: the sections that did not fit in the tab bar. A computer's sidebar already lists them all. */}
      {overflowNav.length > 0 && (
        <div className="lg:hidden">
          <MenuGroup label={config?.community_name ? `In ${config.community_name}` : "In this community"}>
            {overflowNav.map((n) => <MenuRow key={ROUTES[n.key]} to={ROUTES[n.key]} icon={TAB_ICONS[n.key]} testid={`user-menu-${n.key}`}>{n.label}</MenuRow>)}
          </MenuGroup>
        </div>
      )}
      <MenuGroup label="You">
        <MenuRow to="/navigator" icon={Compass} testid="user-menu-opportunities">Opportunities</MenuRow>
        <MenuRow to="/journey" icon={Target} testid="user-menu-journey">Journey</MenuRow>
        <MenuRow to="/me" icon={CircleUser} testid="user-menu-profile">My profile</MenuRow>
        <MenuRow to="/communities" icon={Building2} testid="user-menu-communities">Communities</MenuRow>
        <MenuRow to="/settings" icon={Settings} testid="user-menu-settings">Settings</MenuRow>
      </MenuGroup>
      <div className="mt-1 border-t border-line pt-1">
        <button className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-ink/5" data-testid="user-menu-logout" onClick={async () => { nav("/login", { replace: true }); await logout(); }}><LogOut className="h-4 w-4 text-muted" />Sign out</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      {/* computer: sidebar, the same frame Pathwai's own pages use, so moving between all of Pathwai and a community never moves the navigation */}
      <aside className="glass-bar sticky top-3 m-3 hidden h-[calc(100vh-1.5rem)] flex-col rounded-[1.75rem] px-3 py-5 lg:flex" aria-label="Main" data-testid="community-sidebar">
        <Link to="/" onClick={() => window.scrollTo({ top: 0 })} className="mb-4 block min-w-0 overflow-hidden px-3 text-xl" data-testid="brand-side"><Wordmark name={config?.community_name || "Pathwai"} /></Link>
        <div className="mb-3"><SpaceSwitcher variant="side" /></div>
        <nav className="min-h-0 flex-1 overflow-y-auto pb-3" aria-label="Sections">
          {sideItems.map(([to, label, Icon]) => <SideLink key={to} to={to} label={label} Icon={Icon} />)}
          {custom.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-ink/5 hover:text-ink"><span className="w-[18px]" /><span className="min-w-0 flex-1 truncate">{l.label} ↗</span></a>)}
          <p className="px-3 pb-1 pt-5 text-[10px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.18em" }}>You</p>
          {youItems.map(([to, label, Icon]) => <SideLink key={to} to={to} label={label} Icon={Icon} />)}
        </nav>
        <div className="relative flex items-center gap-1 border-t border-line pt-3" ref={sideRef}>
          <button type="button" onClick={() => setMenu((o) => !o)} aria-haspopup="menu" aria-expanded={menu} data-testid="user-menu-trigger" className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-ink/5">
            <Avatar src={user.avatar_url} name={user.name} size={32} />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{user.name}</span><span className="block truncate text-xs text-muted">{user.email}</span></span>
          </button>
          <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink" data-testid="mode-toggle" aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={mode === "dark" ? "Light mode" : "Dark mode"} onClick={toggleMode}>{mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
          <Link to="/about" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink" data-testid="top-about" title="About Pathwai" aria-label="About Pathwai"><Info className="h-4 w-4" /></Link>
          {AccountPanel({ up: true })}
        </div>
      </aside>

      <div className="min-w-0">
        {/* phone: top bar */}
        <header className="glass-bar app-topbar-phone sticky top-2 z-[45] mx-2 mt-2 rounded-[1.75rem] sm:top-3 sm:mx-4 sm:mt-3 lg:hidden">
          <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-3 py-2 sm:gap-4 sm:px-5">
            <Link to="/" className="hit min-w-0 shrink overflow-hidden text-lg sm:text-2xl" data-testid="brand"><Wordmark name={config?.community_name || "Pathwai"} /></Link>
            <SpaceSwitcher variant="chip" label={false} />
            <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-2">
              <Link to="/about" className="btn-ghost !px-2 sm:!px-3" title="About Pathwai"><Info className="h-4 w-4" /><span className="hidden sm:inline">About</span></Link>
              <button className="btn-ghost !px-2 sm:!px-3" aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={mode === "dark" ? "Light mode" : "Dark mode"} onClick={toggleMode}>{mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
              <div className="relative" ref={menuRef}>
                <button className="flex items-center gap-2" onClick={() => setMenu(!menu)} data-testid="user-menu-trigger">
                  <span className="relative"><Avatar src={user.avatar_url} name={user.name} size={32} /></span><ChevronDown className="h-3 w-3" />
                </button>
                {AccountPanel({ up: false })}
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] px-4 py-6 lg:px-10 lg:py-10 xl:py-8">{backTo && <BackButton fallback={backTo[0]} label={`Back to ${backTo[1]}`} />}{children}</main>
        <footer className="mx-auto flex max-w-[1600px] flex-col items-center gap-3 border-t border-line px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] text-center sm:flex-row sm:justify-between sm:text-left lg:pb-6"><PoweredBy /><span className="eyebrow">Find the right next step</span></footer>
      </div>

      {/* phone: tab bar */}
      <nav className="app-tabbar grid lg:hidden"
        style={{ gridTemplateColumns: `repeat(${Math.min(5, 1 + tabItems.length)}, minmax(0, 1fr))` }} data-testid="tabbar">
        {[["/", "Home", TAB_ICONS["/"]], ...tabItems.map((n) => [ROUTES[n.key], n.label, TAB_ICONS[n.key]])].map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end={to === "/"} className="app-tab">
            {({ isActive }) => (<><span className="app-tab-ico">{Icon && <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.3 : 1.7} aria-hidden />}</span><span>{label}</span></>)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
