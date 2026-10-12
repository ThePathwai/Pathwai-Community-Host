import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Award, CalendarClock, ExternalLink, GraduationCap } from "lucide-react";
import { api } from "../lib/api";
import { Avatar, Chip, ProgressBar, cx } from "./ui";

export const when = (iso) => { try { return new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return ""; } };
const day = (iso) => { try { return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }); } catch { return ""; } };

export function useMyLearning(enabled = true) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    api.get("/learning/mine").then((r) => alive && setData(r.data)).catch(() => alive && setData({ programs: [], summary: {} }));
    return () => { alive = false; };
  }, [enabled]);
  return data;
}

export function ProgramCard({ p }) {
  const my = p.my;
  const done = my?.status === "completed";
  return (
    <article className="card flex flex-col gap-3 !p-0 overflow-hidden" data-testid={`program-${p.id}`}>
      {p.cover_url && <img src={p.cover_url} alt="" className="h-28 w-full object-cover" />}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold leading-snug">{p.name}</h3>
            {done && <Chip accent><Award className="mr-1 inline h-3 w-3" aria-hidden />Completed</Chip>}
          </div>
          {p.description && <p className="mt-1 text-sm text-muted">{p.description}</p>}
          {(p.tags || []).length > 0 && <div className="mt-2 flex flex-wrap gap-1">{p.tags.map((t) => <Chip key={t}>{t}</Chip>)}</div>}
        </div>
        {my ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted"><span>{done ? (my.completed_at ? `Finished ${day(my.completed_at)}` : "Finished") : my.current_module || "In progress"}</span><span className="stat">{my.progress_pct}%</span></div>
            <ProgressBar value={my.progress_pct} />
            {!done && my.next_session_at && <p className="flex items-center gap-1.5 text-xs"><CalendarClock className="h-3.5 w-3.5 text-muted" aria-hidden />Next live session · {when(my.next_session_at)}</p>}
          </div>
        ) : (p.starts_at || p.ends_at) && <p className="text-xs text-muted">{p.starts_at ? `Starts ${day(p.starts_at)}` : ""}{p.starts_at && p.ends_at ? " · " : ""}{p.ends_at ? `Runs to ${day(p.ends_at)}` : ""}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <div className="flex min-w-0 items-center gap-2">
            {(p.cohort_preview || []).length > 0 && <div className="flex -space-x-2">{p.cohort_preview.map((u) => <Link key={u.id} to={`/members/${u.id}`} title={u.name} className="rounded-full ring-2 ring-[rgb(var(--c-surface))]"><Avatar src={u.avatar_url} name={u.name} size={24} /></Link>)}</div>}
            <span className="truncate text-xs text-muted">{p.enrolled_count} in this program{p.completed_count ? ` · ${p.completed_count} finished` : ""}</span>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs">
            {done && my.certificate_url && <a className="underline" href={my.certificate_url} target="_blank" rel="noreferrer">Certificate</a>}
            {p.url && <a className="inline-flex items-center gap-1 font-medium underline" href={p.url} target="_blank" rel="noreferrer" data-testid={`open-${p.id}`}>{my && !done ? "Continue" : "Open"}<ExternalLink className="h-3 w-3" aria-hidden /></a>}
          </div>
        </div>
      </div>
    </article>
  );
}

/** Dashboard widget body: the member's programs, one line each. */
export function LearningList({ data, limit = 3, className }) {
  const items = (data?.programs || []).filter((p) => p.my?.status !== "dropped").slice(0, limit);
  return (
    <ul className={cx("space-y-3", className)} data-testid="learning-list">
      {items.map((p) => (
        <li key={p.id}>
          <Link to="/learning" className="block">
            <div className="flex items-center justify-between gap-2 text-sm"><span className="truncate font-medium">{p.name}</span><span className="stat shrink-0 text-xs text-muted">{p.my.progress_pct}%</span></div>
            <div className="mt-1.5"><ProgressBar value={p.my.progress_pct} /></div>
            <p className="mt-1 truncate text-xs text-muted">{p.my.status === "completed" ? "Completed" : p.my.next_session_at ? `Next session · ${when(p.my.next_session_at)}` : p.my.current_module || "In progress"}</p>
          </Link>
        </li>))}
    </ul>
  );
}

/** Profile card: what a member is studying. Hidden when there is nothing to show. */
export function ProfileLearning({ userId }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { let alive = true; api.get(`/learning/people/${userId}`).then((r) => alive && setRows(r.data.programs)).catch(() => alive && setRows([])); return () => { alive = false; }; }, [userId]);
  if (!rows || rows.length === 0) return null;
  return (
    <section className="card" data-testid="profile-learning">
      <p className="eyebrow mb-3 flex items-center gap-2"><GraduationCap className="h-4 w-4" aria-hidden />Programs</p>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.program_id}>
            <div className="flex items-center justify-between gap-2 text-sm"><span className="truncate font-medium">{r.name}</span><span className="shrink-0 text-xs text-muted">{r.status === "completed" ? "Completed" : `${r.progress_pct}%`}</span></div>
            <div className="mt-1.5"><ProgressBar value={r.status === "completed" ? 100 : r.progress_pct} /></div>
          </li>))}
      </ul>
    </section>
  );
}
