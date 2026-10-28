import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Compass, Home, Inbox, LogOut, MessageCircle, Route, Search, Sparkles, User, UserRound, Users, Info } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { groupOf } from "../lib/communityGroup";
import { Avatar, Modal, PoweredBy, Wordmark, cx } from "./ui";
import GuideChat from "./GuideChat";

// The frame around everything that belongs to YOU rather than to one community: Home, Programs, your communities (innovation and leisure
// kept apart), messages, people and your profile. A sidebar on a computer, tabs along the bottom on a phone, and the guide one tap away on both.

const ShellCtx = createContext(null);
export const useShell = () => useContext(ShellCtx);

function NavItem({ to, icon: Icon, label, active, badge, testId }) {
  return (
    <Link to={to} data-testid={testId} aria-current={active ? "page" : undefined}
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
  const [counts, setCounts] = useState({ innovation: 0, leisure: 0 });
  const [unread, setUnread] = useState(0);

  useEffect(() => { showHubTheme(); }, [showHubTheme]);
  useEffect(() => {
    if (!account) return;
    api.get("/hub/communities").then((r) => {
      const mine = (r.data.communities || []).filter((c) => c.my?.status === "approved");
      setCounts({ innovation: mine.filter((c) => groupOf(c) === "innovation").length, leisure: mine.filter((c) => groupOf(c) === "leisure").length });
    }).catch(() => {});
    api.get("/hub/messages").then((r) => setUnread(r.data?.unread || 0)).catch(() => {});
  }, [account?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx = useMemo(() => ({ openGuide: (q) => setGuide({ q: q || "", n: Date.now() }) }), []);
  if (!account) return null;
  const go = async (fn) => { setMenu(false); await fn(); };
  const signOut = () => go(async () => { await logout(); nav("/login", { replace: true }); });

  const Items = () => (
    <>
      <NavItem to="/hub" icon={Home} label="Home" active={active === "home"} testId="shell-home" />
      <NavItem to="/navigator" icon={Compass} label="Programs" active={active === "programs"} testId="shell-programs" />
      <NavItem to="/journey" icon={Route} label="Journey" active={active === "journey"} testId="shell-journey" />
      <GroupLabel>Communities</GroupLabel>
      <NavItem to="/hub?v=innovation" icon={Sparkles} label="Innovation" active={active === "innovation"} badge={counts.innovation || null} testId="shell-innovation" />
      <NavItem to="/hub?v=leisure" icon={Users} label="Leisure" active={active === "leisure"} badge={counts.leisure || null} testId="shell-leisure" />
      <GroupLabel>You</GroupLabel>
      <NavItem to="/hub?open=inbox" icon={Inbox} label="Messages" active={active === "messages"} badge={unread || null} testId="shell-messages" />
      <NavItem to="/hub?open=people" icon={UserRound} label="People" active={active === "people"} testId="shell-people" />
      <NavItem to="/me" icon={User} label="Your profile" active={active === "profile"} testId="shell-profile" />
    </>
  );

  const UserMenu = ({ up }) => menu && (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} aria-hidden />
      <div role="menu" className={cx("absolute z-50 w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-xl", up ? "bottom-full left-0 mb-2" : "right-0 top-12")} data-testid="shell-menu-panel">
        <div className="border-b border-line px-4 py-3"><p className="truncate text-sm font-medium">{account.name}</p><p className="truncate text-xs text-muted">{account.email}</p></div>
        <Link role="menuitem" to="/me" onClick={() => setMenu(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-ink/5"><User className="h-4 w-4" />Your profile</Link>
        <Link role="menuitem" to="/about" onClick={() => setMenu(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-ink/5"><Info className="h-4 w-4" />About Pathwai</Link>
        <button role="menuitem" className="flex w-full items-center gap-2 border-t border-line px-4 py-2.5 text-left text-sm hover:bg-ink/5" data-testid="hub-logout" onClick={signOut}><LogOut className="h-4 w-4" />Sign out</button>
      </div>
    </>
  );

  return (
    <ShellCtx.Provider value={ctx}>
      <div className="min-h-screen lg:grid lg:grid-cols-[256px_minmax(0,1fr)]" data-testid="account-shell">
        {/* computer: sidebar */}
        <aside className="sticky top-0 hidden h-screen flex-col border-r border-line px-3 py-5 lg:flex" aria-label="Main">
          <Link to="/hub" className="mb-5 px-3 text-2xl" aria-label="Pathwai home"><Wordmark name="Pathwai" brand={{}} /></Link>
          <button type="button" onClick={() => ctx.openGuide()} data-testid="shell-ask" className="mb-2 flex w-full items-center gap-2.5 rounded-lg border border-line bg-ink/[.04] px-3 py-2 text-left text-sm text-muted transition hover:border-ink/30 hover:text-ink">
            <Search className="h-4 w-4" aria-hidden /><span className="flex-1">Ask the guide</span><kbd className="rounded border border-line px-1.5 text-[10px] font-medium">AI</kbd>
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
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] glass lg:hidden">
            <Link to="/hub" className="text-xl" aria-label="Pathwai home"><Wordmark name="Pathwai" brand={{}} /></Link>
            <div className="relative flex items-center gap-3">
              <button type="button" onClick={() => ctx.openGuide()} aria-label="Ask the guide" data-testid="shell-ask-fab" className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink/80"><MessageCircle className="h-[18px] w-[18px]" /></button>
              <button type="button" onClick={() => setMenu((o) => !o)} aria-haspopup="menu" aria-expanded={menu} title="Account"><Avatar src={account.avatar_url} name={account.name} size={34} /></button>
              {UserMenu({})}
            </div>
          </header>

          <main className="px-4 pb-32 pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">{children}<PoweredBy className="mt-16 flex justify-center" /></main>
        </div>

        {/* phone: guide button and tab bar */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line pb-[env(safe-area-inset-bottom)] glass lg:hidden" aria-label="Main" data-testid="shell-tabs">
          {[["home", "/hub", Home, "Home"], ["programs", "/navigator", Compass, "Programs"], [["innovation", "leisure"].includes(active) ? active : "innovation", "/hub?v=" + (active === "leisure" ? "leisure" : "innovation"), Users, "Communities"], ["profile", "/me", User, "Profile"]].map(([k, to, Icon, label]) => {
            const on = k === active || (label === "Communities" && ["innovation", "leisure"].includes(active));
            return (
              <Link key={label} to={to} aria-current={on ? "page" : undefined} className={cx("flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium", on ? "text-ink" : "text-muted")}>
                <Icon className="h-5 w-5" strokeWidth={on ? 2.4 : 1.8} aria-hidden />{label}
              </Link>
            );
          })}
        </nav>

        <Modal open={!!guide} onClose={() => setGuide(null)} title="Ask the guide">
          {guide && <GuideChat key={guide.n} className="h-[65dvh]" signedIn hasProfile={!!account.startup?.stage} startupName={account.startup?.name} initialMessage={guide.q} />}
        </Modal>
      </div>
    </ShellCtx.Provider>
  );
}
