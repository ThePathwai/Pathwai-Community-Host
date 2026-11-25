import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BarChart3, Building2, CalendarDays, Compass, LogOut, MessageCircle, Route, Search, User, UserRound, Info, PlayCircle } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Avatar, Modal, PoweredBy, Wordmark, cx } from "./ui";
import GuideChat from "./GuideChat";
import Walkthrough, { tourReady } from "./Walkthrough";
import SpaceSwitcher from "./SpaceSwitcher";

// The frame around everything that belongs to YOU rather than to one hub: Programs, your journey, events, people and your profile. A sidebar on a computer, tabs along the bottom on a phone, and the guide one tap away on both.

const ShellCtx = createContext(null);
export const useShell = () => useContext(ShellCtx);

function NavItem({ to, icon: Icon, label, active, badge, testId, tour }) {
  return (
    <Link to={to} data-testid={testId} data-tour={tour} aria-current={active ? "page" : undefined}
      className={cx("group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition", active ? "bg-ink/10 text-ink" : "text-muted hover:bg-ink/5 hover:text-ink")}>
      <Icon className={cx("h-[18px] w-[18px] shrink-0", active && "text-ink")} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge ? <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-ink/80">{badge}</span> : null}
    </Link>
  );
}

function GroupLabel({ children }) { return <p className="px-3 pb-1 pt-5 text-[10px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.18em" }}>{children}</p>; }

export default function AccountShell({ active, children }) {
  const { account, logout, showHubTheme } = useAuth();
  const nav = useNavigate();
  const [guide, setGuide] = useState(null);       // null = closed, else {q, n}
  const [menu, setMenu] = useState(false);
  const [tour, setTour] = useState(false);
  const tourKey = account ? `pw-tour-v1:${account.id}` : null;
  const endTour = useCallback(() => { setTour(false); try { if (tourKey) localStorage.setItem(tourKey, "1"); } catch { /* storage unavailable: the menu can still replay it */ } }, [tourKey]);

  // First visit only: wait for the page to draw what the tour points at, then start. Not over the profile form a new person is filling in; the next page they open starts it.
  useEffect(() => {
    if (!tourKey || new URLSearchParams(window.location.search).has("edit")) return undefined;
    let seen = true;
    try { seen = localStorage.getItem(tourKey) === "1"; } catch { /* storage blocked: do not nag on every page */ }
    if (seen) return undefined;
    let tries = 0;
    const t = setInterval(() => { tries += 1; if (tourReady() || tries > 16) { clearInterval(t); if (tourReady()) setTour(true); } }, 300);
    return () => clearInterval(t);
  }, [tourKey]);

  useEffect(() => { showHubTheme(); }, [showHubTheme]);
  const ctx = useMemo(() => ({ openGuide: (q) => setGuide({ q: q || "", n: Date.now() }), startTour: () => setTour(true) }), []);
  if (!account) return null;
  const go = async (fn) => { setMenu(false); await fn(); };
  const signOut = () => go(async () => { await logout(); nav("/login", { replace: true }); });

  const Items = () => (
    <>
      <NavItem to="/navigator" icon={Compass} label="Opportunities" active={active === "programs"} testId="shell-programs" tour="nav-programs" />
      <NavItem to="/journey" icon={Route} label="Journey" active={active === "journey"} testId="shell-journey" tour="nav-journey" />
      <NavItem to="/founder-events" icon={CalendarDays} label="Events" active={active === "events"} testId="shell-events" tour="nav-events" />
      <NavItem to="/people" icon={UserRound} label="People" active={active === "people"} testId="shell-people" tour="nav-people" />
      <NavItem to="/me" icon={User} label="Your profile" active={active === "profile"} testId="shell-profile" tour="nav-profile" />
      <NavItem to="/communities" icon={Building2} label="Communities" active={active === "communities"} testId="shell-communities" />
      {account.platform_admin && <NavItem to="/admin" icon={BarChart3} label="Admin" active={active === "admin"} testId="shell-admin" />}
    </>
  );

  const UserMenu = ({ up }) => menu && (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} aria-hidden />
      <div role="menu" className={cx("absolute z-50 w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-xl", up ? "bottom-full left-0 mb-2" : "right-0 top-12")} data-testid="shell-menu-panel">
        <div className="border-b border-line px-4 py-3"><p className="truncate text-sm font-medium">{account.name}</p><p className="truncate text-xs text-muted">{account.email}</p></div>
        <Link role="menuitem" to="/me" onClick={() => setMenu(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-ink/5"><User className="h-4 w-4" />Your profile</Link>
        <Link role="menuitem" to="/communities" onClick={() => setMenu(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-ink/5" data-testid="shell-menu-communities"><Building2 className="h-4 w-4" />Communities</Link>
        {account.platform_admin && <Link role="menuitem" to="/admin" onClick={() => setMenu(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-ink/5" data-testid="shell-menu-admin"><BarChart3 className="h-4 w-4" />Admin</Link>}
        <button role="menuitem" className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-ink/5" data-testid="shell-tour" onClick={() => { setMenu(false); setTour(true); }}><PlayCircle className="h-4 w-4" />Take the tour</button>
        <Link role="menuitem" to="/about" onClick={() => setMenu(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-ink/5"><Info className="h-4 w-4" />About Pathwai</Link>
        <button role="menuitem" className="flex w-full items-center gap-2 border-t border-line px-4 py-2.5 text-left text-sm hover:bg-ink/5" data-testid="hub-logout" onClick={signOut}><LogOut className="h-4 w-4" />Sign out</button>
      </div>
    </>
  );

  return (
    <ShellCtx.Provider value={ctx}>
      <div className="min-h-screen lg:grid lg:grid-cols-[256px_minmax(0,1fr)]" data-testid="account-shell">
        {/* computer: sidebar */}
        <aside className="glass-bar sticky top-3 m-3 hidden h-[calc(100vh-1.5rem)] flex-col rounded-[1.75rem] px-3 py-5 lg:flex" aria-label="Main">
          <Link to="/" onClick={() => window.scrollTo({ top: 0 })} className="mb-5 px-3 text-2xl" aria-label="Pathwai home"><Wordmark name="Pathwai" brand={{}} /></Link>
          <div className="mb-3" data-tour="space"><SpaceSwitcher variant="side" /></div>
          <button type="button" onClick={() => ctx.openGuide()} data-testid="shell-ask" data-tour="ask" className="mb-2 flex w-full items-center gap-2.5 rounded-lg border border-line bg-ink/[.04] px-3 py-2 text-left text-sm text-muted transition hover:border-ink/30 hover:text-ink">
            <Search className="h-4 w-4" aria-hidden /><span className="flex-1">Ask the guide</span><kbd className="rounded border border-line px-1.5 text-[10px] font-medium">Soon</kbd>
          </button>
          <nav className="min-h-0 flex-1 overflow-y-auto pb-3" aria-label="Sections">{Items()}</nav>
          <div className="relative border-t border-line pt-3">
            <button type="button" onClick={() => setMenu((o) => !o)} aria-haspopup="menu" aria-expanded={menu} data-testid="hub-menu" className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-ink/5">
              <Avatar src={account.avatar_url} name={account.name} size={32} />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{account.name}</span><span className="block truncate text-xs text-muted">{account.email}</span></span>
            </button>
            {UserMenu({ up: true })}
          </div>
        </aside>

        <div className="min-w-0">
          {/* phone: top bar */}
          <header className="app-topbar flex lg:hidden">
            <Link to="/" onClick={() => window.scrollTo({ top: 0 })} className="text-lg" aria-label="Pathwai home"><Wordmark name="Pathwai" brand={{}} /></Link>
            <div className="relative flex items-center gap-1.5">
              <SpaceSwitcher variant="chip" />
              <button type="button" onClick={() => ctx.openGuide()} aria-label="Ask the guide" data-testid="shell-ask-fab" data-tour="ask" className="flex h-10 w-10 items-center justify-center rounded-full text-ink/85 active:bg-ink/10"><MessageCircle className="h-[22px] w-[22px]" strokeWidth={1.8} /></button>
              <button type="button" onClick={() => setMenu((o) => !o)} aria-haspopup="menu" aria-expanded={menu} title="Account" className="flex h-10 w-10 items-center justify-center rounded-full"><Avatar src={account.avatar_url} name={account.name} size={32} /></button>
              {UserMenu({})}
            </div>
          </header>

          <main className="px-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-5 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">{children}<PoweredBy className="mt-16 flex justify-center" /></main>
        </div>

        {/* phone: guide button and tab bar */}
        <nav className="app-tabbar grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] lg:hidden" aria-label="Main" data-testid="shell-tabs">
          {[["programs", "/navigator", Compass, "Opportunities"], ["journey", "/journey", Route, "Journey"], ["events", "/founder-events", CalendarDays, "Events"], ["people", "/people", UserRound, "People"], ["profile", "/me", User, "Profile"]].map(([k, to, Icon, label]) => {
            const on = k === active;
            return (
              <Link key={label} to={to} data-tour={`nav-${k}`} aria-current={on ? "page" : undefined} className="app-tab">
                <span className="app-tab-ico"><Icon className="h-[22px] w-[22px]" strokeWidth={on ? 2.3 : 1.7} aria-hidden /></span><span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <Walkthrough open={tour} onClose={endTour} />
        <Modal open={!!guide} onClose={() => setGuide(null)} title="Ask the guide">
          {guide && <GuideChat key={guide.n} className="h-[65dvh]" signedIn hasProfile={!!account.startup?.stage} startupName={account.startup?.name} initialMessage={guide.q} />}
        </Modal>
      </div>
    </ShellCtx.Provider>
  );
}
