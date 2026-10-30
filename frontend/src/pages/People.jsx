import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import AccountShell from "../components/AccountShell";
import { ProfileCard, Rail, StartupMini } from "../components/ProfileRail";
import { Spinner } from "../components/ui";

// People: everyone on Pathwai in one place. Zoomed out, each group is a row of photo cards you swipe sideways (people open to work with startups,
// startups looking for people, the people you follow, and everyone else). Tap a card for the full profile at /people/:key.

const get = (url, params) => api.get(url, { params }).then((r) => r.data).catch(() => null);

export default function People({ embedded }) {
  const { account, loading } = useAuth();
  const [q, setQ] = useState("");
  const [talent, setTalent] = useState(null);
  const [startups, setStartups] = useState(null);
  const [following, setFollowing] = useState(null);
  const [everyone, setEveryone] = useState(null);
  const [opt, setOpt] = useState(null);
  const [open, setOpen] = useState("");
  useEffect(() => { document.title = "People · Pathwai"; }, []);
  useEffect(() => {
    if (!account) return;
    get("/talent", { kind: "people" }).then(setTalent);
    get("/talent", { kind: "startups" }).then(setStartups);
    get("/hub/following").then(setFollowing);
    get("/talent/options").then(setOpt);
  }, [account]);
  useEffect(() => {
    if (!account) return undefined;
    const t = setTimeout(() => get("/hub/people", { q: q.trim() }).then(setEveryone), 200);
    return () => clearTimeout(t);
  }, [account, q]);

  const ready = talent !== null || everyone !== null;
  const labelOf = useMemo(() => Object.fromEntries((opt?.categories || []).map((c) => [c.key, c.label])), [opt]);
  const startupRows = useMemo(() => (startups?.results || []).map((s) => ({ ...s, hiring_labels: (s.hiring_for || []).map((k) => labelOf[k] || k) })), [startups, labelOf]);
  const people = talent?.results || [];
  const follows = following?.people || [];
  const all = (everyone?.people || []).filter((p) => !follows.some((f) => (f.id && f.id === p.id) || (f.email && f.email === p.email)));
  const searching = q.trim().length > 0;

  if (loading) return <Spinner />;
  if (!account) return <Navigate to="/login" replace />;

  const row = (key, title, sub, items, render) => items.length > 0 && (
    <Rail key={key} testId={`people-${key}`} title={title} sub={sub} count={items.length} expanded={open === key} onSeeAll={items.length > 4 ? () => setOpen(open === key ? "" : key) : null}>
      {items.map((x) => render(x, open === key))}
    </Rail>
  );

  const page = (
    <div className="mx-auto w-full max-w-6xl" data-testid="people-page">
      <p className="eyebrow">People</p>
      <h1 className="mt-2 text-3xl sm:text-4xl" style={{ textTransform: "none", letterSpacing: "-0.03em", fontWeight: 800, textWrap: "balance" }}>People on Pathwai</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">Swipe through founders, skilled people and startups. Tap anyone to see their full profile, follow them, or send a message.</p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="relative block w-full sm:w-80"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, title or company" aria-label="Search people" data-testid="people-search" className="w-full rounded-full border border-line bg-transparent py-2.5 pl-9 pr-3 text-sm outline-none focus:border-ink/50" /></label>
        <Link to="/talent" className="inline-flex items-center gap-1 text-sm font-semibold hover:underline" data-testid="people-to-talent">Search talent by skill<ArrowRight className="h-4 w-4" aria-hidden /></Link>
      </div>

      {!ready ? <div className="mt-10"><Spinner /></div> : searching ? (
        <div className="mt-6" data-testid="people-results">
          {all.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{all.map((p) => <ProfileCard key={p.id || p.email} p={p} wide />)}</div>
            : <div className="rounded-3xl border border-dashed border-line p-8 text-center" data-testid="people-empty"><p className="font-semibold">No one matches that search</p><p className="mt-1 text-sm text-muted">Try a first name, a title, or a company.</p></div>}
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {talent?.viewer && !talent.viewer.listed && (
            <Link to="/talent/me" className="flex items-center gap-3 rounded-3xl border border-dashed border-line p-4 text-sm transition hover:border-ink/40" data-testid="people-join">
              <span className="min-w-0 flex-1"><span className="block font-semibold">Want to show up here?</span><span className="block text-muted">Add your skills and what you are open to, and founders and startups can find you.</span></span><ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
            </Link>
          )}
          {row("talent", "Open to work with startups", "Skilled people who chose to be found, best fit first.", people, (p, wide) => <ProfileCard key={p.id} p={p} wide={wide} />)}
          {row("startups", "Startups looking for people", "Founders who said who they need.", startupRows, (s, wide) => <StartupMini key={s.id} s={s} wide={wide} />)}
          {row("following", "Following", "People you follow.", follows, (p, wide) => <ProfileCard key={p.id || p.email} p={p} wide={wide} />)}
          {row("everyone", "Everyone on Pathwai", "Members of every community.", all, (p, wide) => <ProfileCard key={p.id || p.email} p={p} wide={wide} />)}
          {!people.length && !startupRows.length && !follows.length && !all.length && (
            <div className="rounded-3xl border border-dashed border-line p-8 text-center" data-testid="people-empty"><p className="font-semibold">No one here yet</p><p className="mt-1 text-sm text-muted">As people join and list themselves, they show up in these rows.</p></div>
          )}
        </div>
      )}
    </div>
  );
  return embedded ? page : <AccountShell active="people">{page}</AccountShell>;
}
