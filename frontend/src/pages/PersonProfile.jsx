import React, { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Check, MapPin, Rocket, Send } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import AccountShell from "../components/AccountShell";
import MessageRequestModal from "../components/MessageRequestModal";
import { Cover } from "../components/ProfileRail";
import { Spinner, cx } from "../components/ui";

// A person's full profile, in the same widgets a community member card uses: a hero with their photo and the numbers that matter, then a widget
// each for what they do, their startup, the communities they are in, and their photos. Only what they chose to share is here.

const heading = { textTransform: "none", letterSpacing: "-0.01em", fontWeight: 700 };
const errMsg = (e) => e?.response?.data?.detail || "Something went wrong. Please try again.";
const STAGE = { idea: "Idea", prototype: "Prototype", launched: "Just launched", revenue: "Earning revenue", growth: "Growing" };
const L = {
  open_to: { full_time: "Full-time", part_time: "Part-time", contract: "Contract or freelance", co_founder: "Co-founding", advising: "Advising", internship: "Internship" },
  availability: { now: "Available now", soon: "Within a month", exploring: "Just exploring" },
  work_mode: { remote: "Remote", hybrid: "Hybrid", onsite: "On site" },
  experience: { junior: "0 to 2 years", mid: "3 to 5 years", senior: "6 to 10 years", lead: "10+ years" },
};
const Chip = ({ children, tone = "" }) => <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", tone || "bg-ink/[.07] text-muted")}>{children}</span>;
const Widget = ({ title, children, className = "", ...rest }) => (
  <section className={cx("rounded-3xl border border-line bg-surface p-5", className)} {...rest}>{title && <h2 className="mb-3 text-lg" style={heading}>{title}</h2>}{children}</section>
);
const Label = ({ children }) => <p className="mb-1.5 text-[11px] font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>{children}</p>;

export default function PersonProfile({ embedded }) {
  const { key } = useParams();
  const { account, loading } = useAuth();
  const [p, setP] = useState(null);
  const [opt, setOpt] = useState(null);
  const [missing, setMissing] = useState(false);
  const [to, setTo] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!account) return;
    setP(null); setMissing(false);
    api.get(`/hub/people/${key}`).then((r) => { setP(r.data); document.title = `${r.data.name} · Pathwai`; }).catch(() => setMissing(true));
    api.get("/talent/options").then((r) => setOpt(r.data)).catch(() => {});
  }, [key, account]);

  if (loading) return <Spinner />;
  if (!account) return <Navigate to="/login" replace />;
  const shell = (body) => (embedded ? body : <AccountShell active="people">{body}</AccountShell>);
  if (missing) return shell(<div className="py-20 text-center" data-testid="pp-missing"><p className="text-xl font-semibold">This profile is not available.</p><Link to="/people" className="btn-ghost mt-4 inline-flex !py-2 text-sm">Back to People</Link></div>);
  if (!p || !opt) return shell(<Spinner />);

  const t = p.talent; const st = p.startup;
  const cat = (k) => opt.categories.find((c) => c.key === k)?.label || k;
  const canMessage = !p.is_self && (p.id || p.email);
  const follow = async () => {
    setBusy(true);
    try {
      const r = p.is_following ? await api.delete(`/hub/people/${key}/follow`) : await api.post(`/hub/people/${key}/follow`);
      setP((x) => ({ ...x, is_following: r.data.is_following, followers: x.followers + (r.data.is_following ? 1 : -1) }));
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const subtitle = [t?.headline || p.title, p.company && !t?.headline ? p.company : ""].filter(Boolean).join(" at ");
  const where = p.location || [t?.city, t?.province].filter(Boolean).join(", ");
  const stats = [["Followers", p.followers], ["Following", p.following], ["Communities", (p.communities || []).length]];

  return shell(
    <div className="mx-auto w-full max-w-5xl space-y-4" data-testid="pp-page">
      <Link to="/people" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" aria-hidden />People</Link>

      <section className="overflow-hidden rounded-3xl border border-line bg-surface" data-testid="pp-hero">
        <div className="grid md:grid-cols-[280px_1fr]">
          <div className="relative min-h-[240px] bg-ink/5 md:min-h-[300px]"><div className="absolute inset-0"><Cover p={p} textSize="text-7xl" /></div></div>
          <div className="flex flex-col gap-4 p-6">
            <div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {t?.availability === "now" && <Chip tone="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Available now</Chip>}
                {t && <Chip tone="bg-sky-500/15 text-sky-600 dark:text-sky-400">In the talent pool</Chip>}
                {st && <Chip tone="bg-violet-500/15 text-violet-600 dark:text-violet-400">Founder</Chip>}
                {p.is_followed_by && !p.is_self && <Chip>Follows you</Chip>}
              </div>
              <h1 className="text-3xl sm:text-4xl" style={{ textTransform: "none", letterSpacing: "-0.03em", fontWeight: 800, textWrap: "balance" }}>{p.name}</h1>
              {subtitle && <p className="mt-1 text-[15px] text-ink/85">{subtitle}</p>}
              {where && <p className="mt-1 flex items-center gap-1 text-sm text-muted"><MapPin className="h-4 w-4" aria-hidden />{where}</p>}
            </div>
            <dl className="grid grid-cols-[1fr_1fr_1.5fr] sm:grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line">
              {stats.map(([k, v]) => <div key={k} className="bg-surface min-w-0 px-3 py-3 sm:px-4"><dt className="text-[10px] font-semibold uppercase text-muted sm:text-[11px]" style={{ letterSpacing: "0.08em" }}>{k}</dt><dd className="mt-1 text-2xl font-bold tabular-nums">{v}</dd></div>)}
            </dl>
            {p.bio && <p className="whitespace-pre-line text-sm leading-relaxed text-ink/90">{p.bio}</p>}
            <div className="mt-auto flex flex-wrap gap-2">
              {p.is_self ? <Link to="/talent/me" className="btn-ghost !px-5 !py-2.5 text-sm" data-testid="pp-edit">Edit your talent profile</Link> : (
                <>
                  <button type="button" onClick={() => setTo({ id: p.id, email: p.email, name: p.name, request: !!(t || st) })} disabled={!canMessage} className="btn-primary !px-5 !py-2.5 text-sm" data-testid="pp-message"><Send className="h-4 w-4" aria-hidden />Message</button>
                  <button type="button" onClick={follow} disabled={busy} className="btn-ghost !px-5 !py-2.5 text-sm" data-testid="pp-follow">{p.is_following ? "Following" : "Follow"}</button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        {t && (
          <Widget title="What they do" data-testid="pp-talent">
            <p className="text-[15px] font-medium leading-snug">{t.headline}</p>
            {t.about && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{t.about}</p>}
            <div className="mt-4 space-y-4">
              {t.categories?.length > 0 && <div><Label>Areas</Label><div className="flex flex-wrap gap-1.5">{t.categories.map((k) => <Chip key={k}>{cat(k)}</Chip>)}</div></div>}
              {t.skills?.length > 0 && <div><Label>Skills</Label><div className="flex flex-wrap gap-1.5">{t.skills.map((s) => <Chip key={s}>{s}</Chip>)}</div></div>}
            </div>
          </Widget>
        )}
        {t && (
          <Widget title="Open to" data-testid="pp-open">
            <div className="flex flex-wrap gap-1.5">{(t.open_to || []).map((o) => <Chip key={o} tone="bg-sky-500/15 text-sky-600 dark:text-sky-400">{L.open_to[o] || o}</Chip>)}</div>
            <ul className="mt-4 space-y-2.5 text-sm">
              {t.availability && <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden /><span>{L.availability[t.availability]}</span></li>}
              {t.work_mode?.length > 0 && <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden /><span>{t.work_mode.map((m) => L.work_mode[m]).join(" or ")}</span></li>}
              {t.experience && <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden /><span>{L.experience[t.experience]} of experience</span></li>}
              {(t.city || t.province) && <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden /><span>Based in {[t.city, t.province].filter(Boolean).join(", ")}</span></li>}
            </ul>
          </Widget>
        )}
        {st && (
          <Widget title="Their startup" data-testid="pp-startup" className={t ? "" : "md:col-span-2"}>
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-ink/[.06]" aria-hidden><Rocket className="h-5 w-5 text-muted" /></span>
              <div className="min-w-0"><p className="text-lg font-semibold leading-tight">{st.name}</p><p className="mt-0.5 text-sm text-ink/85">{st.one_liner}</p>
                <p className="mt-1 text-xs text-muted">{[STAGE[st.stage], [st.city, st.province].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</p></div>
            </div>
            {st.hiring_for?.length > 0 && <div className="mt-4"><Label>Looking for</Label><div className="flex flex-wrap gap-1.5">{st.hiring_for.map((k) => <Chip key={k} tone="bg-sky-500/15 text-sky-600 dark:text-sky-400">{cat(k)}</Chip>)}</div></div>}
            {st.hiring_note && <p className="mt-3 text-sm leading-relaxed text-muted">{st.hiring_note}</p>}
          </Widget>
        )}
        {(p.communities || []).length > 0 && (
          <Widget title="Communities" data-testid="pp-communities">
            <ul className="divide-y divide-line">
              {p.communities.map((c) => (
                <li key={c.slug}><Link to={`/c/${c.slug}`} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 hover:opacity-80">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line/60 text-sm font-bold" style={{ background: c.colors?.background || "rgb(var(--c-ink) / 0.08)", color: c.colors?.accent || "inherit" }}>
                    {c.logo_url ? <img src={c.logo_url} alt="" className="max-h-[72%] max-w-[78%] object-contain" /> : (c.name || "?")[0]}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.name}</span></Link></li>
              ))}
            </ul>
          </Widget>
        )}
        {p.photos?.length > 0 && (
          <Widget title="Photos" data-testid="pp-photos" className={cx(!t && !st && !(p.communities || []).length ? "md:col-span-2" : "")}>
            <div className="grid grid-cols-3 gap-1.5">{p.photos.map((src, i) => <img key={i} src={src} alt="" className="aspect-square w-full rounded-xl object-cover" />)}</div>
          </Widget>
        )}
      </div>
      {!t && !st && !p.bio && !(p.communities || []).length && !p.photos?.length && <Widget><p className="text-sm text-muted">{p.name.split(" ")[0]} has not added more to their profile yet.</p></Widget>}
      <MessageRequestModal to={to} onClose={() => setTo(null)} />
    </div>
  );
}
