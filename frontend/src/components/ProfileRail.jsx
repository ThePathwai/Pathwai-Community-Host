import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, MapPin, Rocket } from "lucide-react";
import { cx } from "./ui";

// The zoomed-out way to see people: photo-first cards in a row you swipe sideways (like a story or photo feed). Tapping a card opens the full
// profile at /people/:key. Used on the People page and the Talent page.

const heading = { textTransform: "none", letterSpacing: "-0.01em", fontWeight: 700 };
export const personKey = (p) => p.id || encodeURIComponent(p.email || "");
const hue = (s) => { let h = 0; for (const ch of String(s || "?")) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
const initials = (n) => (n || "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// A person's picture area: their first photo, else their profile picture, else a colour field with their initials.
export function Cover({ p, className = "", textSize = "text-5xl" }) {
  const src = (p.photos && p.photos[0]) || p.avatar_url;
  const h = hue(p.name);
  const [bad, setBad] = useState(false);
  if (src && !bad) return <img src={src} alt="" onError={() => setBad(true)} className={cx("h-full w-full object-cover", className)} />;
  return (
    <div className={cx("flex h-full w-full items-center justify-center", className)} style={{ background: `linear-gradient(145deg, hsl(${h} 38% 30%), hsl(${(h + 48) % 360} 42% 18%))` }} aria-hidden>
      <span className={cx("font-bold text-white/80", textSize)} style={{ letterSpacing: "-0.03em" }}>{initials(p.name)}</span>
    </div>
  );
}

const Chip = ({ children, tone = "" }) => <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", tone || "bg-ink/[.07] text-muted")}>{children}</span>;
const OPEN = { full_time: "Full-time", part_time: "Part-time", contract: "Contract", co_founder: "Co-founding", advising: "Advising", internship: "Internship" };

// One person, zoomed out. Works for a talent result ({headline, city, province, ...}) and a platform person ({title, company, location, talent}).
export function ProfileCard({ p, wide }) {
  const t = p.talent || (p.categories ? p : null);
  const headline = (t && t.headline) || p.headline || [p.title, p.company].filter(Boolean).join(" at ");
  const where = p.location || [t?.city || p.city, t?.province || p.province].filter(Boolean).join(", ");
  const avail = t?.availability === "now" ? "Available now" : t?.availability === "soon" ? "Within a month" : "";
  const open = (t?.open_to || []).slice(0, 2);
  return (
    <Link to={`/people/${personKey(p)}`} data-testid={`profile-card-${p.id || p.email}`}
      className={cx("group flex shrink-0 snap-start flex-col overflow-hidden rounded-3xl border border-line bg-surface transition hover:border-ink/30", wide ? "w-full" : "w-[212px] sm:w-[228px]")}>
      <div className="relative aspect-[5/4] w-full overflow-hidden bg-ink/5">
        <Cover p={p} className="transition duration-300 group-hover:scale-[1.03]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" aria-hidden />
        <div className="absolute inset-x-3 bottom-2.5 text-white">
          <p className="truncate text-[15px] font-semibold leading-tight drop-shadow">{p.name}</p>
          {where && <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-white/85"><MapPin className="h-3 w-3 shrink-0" aria-hidden />{where}</p>}
        </div>
        {avail && <span className="absolute left-2.5 top-2.5 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold uppercase text-white" style={{ letterSpacing: "0.06em" }}>{avail}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        {headline ? <p className="line-clamp-2 text-[13px] leading-snug text-ink/85">{headline}</p> : <p className="text-[13px] text-muted">On Pathwai</p>}
        <div className="mt-auto flex flex-wrap gap-1">
          {p.startup && <Chip tone="bg-violet-500/15 text-violet-600 dark:text-violet-400">Founder</Chip>}
          {open.map((o) => <Chip key={o} tone="bg-sky-500/15 text-sky-600 dark:text-sky-400">{OPEN[o] || o}</Chip>)}
          {!open.length && (t?.skills || []).slice(0, 2).map((s) => <Chip key={s}>{s}</Chip>)}
        </div>
        {p.reasons?.[0] && <p className="line-clamp-2 text-[11px] leading-snug text-muted">{p.reasons[0]}</p>}
      </div>
    </Link>
  );
}

export function StartupMini({ s, wide }) {
  return (
    <Link to={`/people/${s.id}`} data-testid={`startup-card-${s.id}`}
      className={cx("group flex shrink-0 snap-start flex-col overflow-hidden rounded-3xl border border-line bg-surface transition hover:border-ink/30", wide ? "w-full" : "w-[212px] sm:w-[228px]")}>
      <div className="relative flex aspect-[5/4] w-full items-end overflow-hidden p-3" style={{ background: `linear-gradient(145deg, hsl(${hue(s.name)} 40% 28%), hsl(${(hue(s.name) + 55) % 360} 45% 16%))` }}>
        <Rocket className="absolute right-3 top-3 h-5 w-5 text-white/60" aria-hidden />
        <div className="text-white"><p className="text-[17px] font-bold leading-tight">{s.name}</p>{(s.city || s.province) && <p className="mt-0.5 flex items-center gap-1 text-[11px] text-white/85"><MapPin className="h-3 w-3" aria-hidden />{[s.city, s.province].filter(Boolean).join(", ")}</p>}</div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <p className="line-clamp-2 text-[13px] leading-snug text-ink/85">{s.one_liner}</p>
        <div className="mt-auto flex flex-wrap gap-1">{(s.hiring_labels || s.hiring_for || []).slice(0, 3).map((k) => <Chip key={k} tone="bg-sky-500/15 text-sky-600 dark:text-sky-400">{k.replace(/_/g, " ")}</Chip>)}</div>
        {s.reasons?.[0] && <p className="line-clamp-2 text-[11px] leading-snug text-muted">{s.reasons[0]}</p>}
      </div>
    </Link>
  );
}

// A titled row of cards that scrolls sideways. "See all" turns it into a grid.
export function Rail({ title, sub, count, children, testId, onSeeAll, expanded }) {
  const ref = useRef(null);
  const [edge, setEdge] = useState({ l: false, r: false });
  const measure = () => {
    const el = ref.current; if (!el) return;
    const l = el.scrollLeft > 8; const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 8;
    setEdge((e) => (e.l === l && e.r === r ? e : { l, r })); // same answer, same object: no extra render
  };
  const n = React.Children.count(children);
  useEffect(() => { measure(); window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); }, [n, expanded]); // eslint-disable-line react-hooks/exhaustive-deps
  const by = (dir) => ref.current?.scrollBy({ left: dir * Math.round(ref.current.clientWidth * 0.8), behavior: "smooth" });
  return (
    <section data-testid={testId}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0"><h2 className="text-lg" style={heading}>{title}{count != null && <span className="ml-2 text-sm font-medium text-muted">{count}</span>}</h2>{sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}</div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onSeeAll && <button type="button" onClick={onSeeAll} className="rounded-full border border-line px-3 py-1.5 text-[13px] font-semibold hover:border-ink/40" data-testid={`${testId}-all`}>{expanded ? "Show less" : "See all"}</button>}
          {!expanded && <>
            <button type="button" onClick={() => by(-1)} disabled={!edge.l} aria-label="Scroll left" className="hidden h-8 w-8 place-items-center rounded-full border border-line enabled:hover:border-ink/40 disabled:opacity-30 md:grid"><ChevronLeft className="h-4 w-4" aria-hidden /></button>
            <button type="button" onClick={() => by(1)} disabled={!edge.r} aria-label="Scroll right" className="hidden h-8 w-8 place-items-center rounded-full border border-line enabled:hover:border-ink/40 disabled:opacity-30 md:grid"><ChevronRight className="h-4 w-4" aria-hidden /></button>
          </>}
        </div>
      </div>
      {expanded
        ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
        : <div ref={ref} onScroll={measure} className="pw-rail -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-pl-4 px-4 pb-2 sm:mx-0 sm:scroll-pl-0 sm:px-0" data-testid={`${testId}-row`}>{children}</div>}
    </section>
  );
}
