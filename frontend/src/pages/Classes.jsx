import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarPlus, Clock, MapPin, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLive } from "../lib/live";
import Stars, { RatingChip } from "../components/Stars";
import { Avatar, AvatarUpload, Button, Card, Chip, Empty, Field, Input, Modal, PageHeader, Select, Spinner, Tabs, TagInput, Textarea, cx } from "../components/ui";

const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const dateOf = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const sameDay = (a, b) => a.toDateString() === b.toDateString();
function dayLabel(iso) {
  const d = new Date(iso), now = new Date(), tom = new Date(now.getTime() + 864e5);
  if (sameDay(d, now)) return "Today";
  if (sameDay(d, tom)) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
const toLocalInput = (iso) => { const d = new Date(iso); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } })();

function spotsText(c) {
  if (c.my_status === "booked") return "You're booked";
  if (c.my_status === "waitlist") return `Waitlist #${c.my_waitlist_position}`;
  if (c.is_full) return "Full";
  if (c.spots_left == null) return "Open";
  return c.spots_left <= 3 ? `${c.spots_left} spot${c.spots_left === 1 ? "" : "s"} left` : `${c.spots_left} spots`;
}

function BookButton({ c, onChange, size }) {
  const [busy, setBusy] = useState(false);
  const act = async (e) => {
    e?.stopPropagation();
    setBusy(true);
    try {
      if (c.my_status) { await api.delete(`/classes/${c.id}/book`); toast.success(c.my_status === "waitlist" ? "Left the waitlist" : "Booking cancelled"); }
      else { const { data } = await api.post(`/classes/${c.id}/book`); toast.success(data.status === "waitlist" ? "You're on the waitlist. We'll tell you if a spot opens." : "You're booked in"); }
      await onChange?.();
    } catch (er) { toast.error(errMsg(er)); } finally { setBusy(false); }
  };
  if (c.is_past || c.has_started) return null;
  const label = c.my_status ? (c.my_status === "waitlist" ? "Leave waitlist" : "Cancel") : c.is_full ? "Join waitlist" : "Book";
  return <Button variant={c.my_status || c.is_full ? "ghost" : "primary"} onClick={act} loading={busy} data-testid={c.my_status ? "class-cancel" : "class-book"} className={size === "sm" ? "!px-3 !py-1.5 text-sm" : ""}>{label}</Button>;
}

function ClassRow({ c, onOpen, onChange }) {
  return (
    <div role="button" tabIndex={0} onClick={() => onOpen(c.id)} onKeyDown={(e) => e.key === "Enter" && onOpen(c.id)} data-testid="class-row"
      className="card card-hover flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-3 !p-4">
      <div className="w-20 shrink-0">
        <p className="stat text-lg leading-none">{timeOf(c.starts_at)}</p>
        <p className="mt-1 flex items-center gap-1 text-xs text-muted"><Clock className="h-3 w-3" aria-hidden />{c.duration_min} min</p>
      </div>
      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate font-semibold">{c.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          {c.instructor ? <span className="inline-flex items-center gap-1.5"><Avatar src={c.instructor.avatar_url} name={c.instructor.name} size={20} />{c.instructor.name}</span> : <span>Instructor to be announced</span>}
          <RatingChip rating={c.rating} />
          {c.level && c.level !== "All levels" && <span>{c.level}</span>}
          {c.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden />{c.location}</span>}
        </div>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <span className={cx("text-xs font-medium", c.my_status === "booked" ? "" : "text-muted")} style={c.my_status === "booked" ? { color: "var(--accent)" } : undefined} data-testid="class-spots">{spotsText(c)}</span>
        <BookButton c={c} onChange={onChange} size="sm" />
      </div>
    </div>
  );
}

function ReviewModal({ cls, existing, onClose, onDone }) {
  const [rating, setRating] = useState(existing?.rating || 0);
  const [irating, setIrating] = useState(existing?.instructor_rating || 0);
  const [text, setText] = useState(existing?.text || "");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!rating) return toast.error("Tap the stars to rate the class.");
    setBusy(true);
    try {
      await api.post(`/classes/${cls.id}/review`, { rating, instructor_rating: irating || null, text });
      toast.success(existing ? "Review updated" : "Thanks for your review");
      onDone(); onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={existing ? "Edit your review" : "Rate this class"}>
      <div className="space-y-4" data-testid="review-modal">
        <div><p className="font-semibold">{cls.title}</p><p className="text-sm text-muted">{dateOf(cls.starts_at)} · {timeOf(cls.starts_at)}{cls.instructor ? ` · ${cls.instructor.name}` : ""}</p></div>
        <div><p className="label">The class</p><Stars value={rating} onChange={setRating} size={28} label="Class rating" /></div>
        {cls.instructor && <div><p className="label">{cls.instructor.name} <span className="text-muted">(optional)</span></p><Stars value={irating} onChange={setIrating} size={28} label="Instructor rating" /></div>}
        <Field label="Your review (optional)"><Textarea rows={4} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="What was it like? Who is it good for?" data-testid="review-text" /></Field>
        <div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={send} loading={busy} data-testid="review-send">{existing ? "Save" : "Post review"}</Button></div>
      </div>
    </Modal>
  );
}

function ClassDetail({ id, onClose, onChange, onEdit }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [d, setD] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const load = useCallback(() => api.get(`/classes/${id}`).then((r) => setD(r.data)).catch((e) => { toast.error(errMsg(e)); onClose(); }), [id, onClose]);
  useEffect(() => { load(); }, [load]);
  const refresh = async () => { await load(); await onChange?.(); };
  const cancelClass = async (series) => {
    try { const { data } = await api.delete(`/classes/${id}`, { params: { series } }); toast.success(data.cancelled > 1 ? `${data.cancelled} classes cancelled` : "Class cancelled"); await onChange?.(); onClose(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const removeReview = async (rid) => { try { await api.delete(`/classes/${id}/reviews/${rid}`); toast.success("Review removed"); refresh(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Modal open onClose={onClose} title={d?.title || "Class"}>
      {!d ? <Spinner /> : (
        <div className="space-y-4" data-testid="class-detail">
          <div className="space-y-1 text-sm">
            <p className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted" aria-hidden />{dateOf(d.starts_at)} · {timeOf(d.starts_at)} to {timeOf(d.ends_at)}</p>
            {d.location && <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted" aria-hidden />{d.location}</p>}
            <p className="flex items-center gap-2"><Users className="h-4 w-4 text-muted" aria-hidden />{d.booked_count}{d.capacity ? ` of ${d.capacity}` : ""} booked{d.waitlist_count ? ` · ${d.waitlist_count} on the waitlist` : ""}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RatingChip rating={d.rating} />{d.level && <Chip>{d.level}</Chip>}{d.category && <Chip>{d.category}</Chip>}{d.status === "cancelled" && <Chip>Cancelled</Chip>}
          </div>
          {d.instructor && <div className="flex items-center gap-3 rounded-xl border border-line p-3"><Avatar src={d.instructor.avatar_url} name={d.instructor.name} size={40} /><div><p className="text-xs text-muted">Instructor</p><p className="font-medium">{d.instructor.name}</p></div></div>}
          {d.description && <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{d.description}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <BookButton c={d} onChange={refresh} />
            {!d.is_past && <a className="btn-ghost" href={`${api.defaults.baseURL}/classes/${d.id}/ics`} data-testid="class-ics"><CalendarPlus className="h-4 w-4" aria-hidden />Add to calendar</a>}
            {d.can_review && <Button variant={d.my_review ? "ghost" : "primary"} onClick={() => setReviewing(true)} data-testid="class-review-open">{d.my_review ? "Edit your review" : "Rate this class"}</Button>}
          </div>
          {d.is_past && !d.can_review && d.my_status !== "booked" && <p className="text-xs text-muted">Only people who booked a class can review it.</p>}

          <div>
            <p className="eyebrow mb-2">Reviews{d.rating.count ? ` · ${d.rating.count}` : ""}</p>
            {d.reviews.length === 0 ? <p className="text-sm text-muted">No reviews yet. People who book and attend can leave one after class.</p> : (
              <ul className="space-y-3">
                {d.reviews.map((r) => (
                  <li key={r.id} className="rounded-xl border border-line p-3" data-testid="review-item">
                    <div className="flex items-center gap-2"><Avatar src={r.avatar_url} name={r.name} size={24} /><span className="text-sm font-medium">{r.name}{r.mine ? " (you)" : ""}</span><Stars value={r.rating} size={13} /><span className="ml-auto text-xs text-muted">{dateOf(r.created_at)}</span></div>
                    {r.text && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{r.text}</p>}
                    {isAdmin && !r.mine && <button className="mt-1 text-xs text-muted underline" onClick={() => removeReview(r.id)}>Remove review</button>}
                  </li>))}
              </ul>)}
          </div>

          {isAdmin && (
            <div className="space-y-3 border-t border-line pt-4" data-testid="class-admin">
              <p className="eyebrow">Admin</p>
              {d.roster?.length > 0 && <ul className="max-h-40 space-y-1 overflow-y-auto overscroll-contain text-sm">{d.roster.map((p) => <li key={p.user_id} className="flex items-center gap-2"><Avatar src={p.avatar_url} name={p.name} size={20} />{p.name}{p.status === "waitlist" && <Chip>Waitlist</Chip>}</li>)}</ul>}
              {d.status !== "cancelled" && !confirm && (
                <div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={() => onEdit(d)} data-testid="class-edit"><Pencil className="h-4 w-4" aria-hidden />Edit</Button><Button variant="ghost" onClick={() => setConfirm(true)} data-testid="class-cancel-class"><Trash2 className="h-4 w-4" aria-hidden />Cancel class</Button></div>)}
              {confirm && (
                <div className="space-y-2 rounded-xl border border-line p-3 text-sm">
                  <p>Cancel this class? Everyone booked is told and their booking is removed.</p>
                  <div className="flex flex-wrap gap-2"><Button onClick={() => cancelClass(false)} data-testid="class-cancel-one">Cancel this class</Button><Button variant="ghost" onClick={() => cancelClass(true)} data-testid="class-cancel-series">This and all later weeks</Button><Button variant="ghost" onClick={() => setConfirm(false)}>Keep it</Button></div>
                </div>)}
            </div>)}
          {reviewing && <ReviewModal cls={d} existing={d.my_review} onClose={() => setReviewing(false)} onDone={refresh} />}
        </div>)}
    </Modal>
  );
}

function ClassForm({ initial, instructors, levels, onClose, onSaved }) {
  const editing = !!initial?.id;
  const [f, setF] = useState(() => ({
    title: initial?.title || "", description: initial?.description || "", instructor_id: initial?.instructor_id || "",
    starts_at: initial?.starts_at ? toLocalInput(initial.starts_at) : toLocalInput(new Date(Date.now() + 864e5).setHours(18, 0, 0, 0)),
    duration_min: initial?.duration_min || 45, capacity: initial?.capacity ?? 20, unlimited: editing && initial.capacity == null,
    location: initial?.location || "", level: initial?.level || "All levels", category: initial?.category || "", repeat_weeks: 0,
  }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    const body = { title: f.title, description: f.description, instructor_id: f.instructor_id || null, starts_at: new Date(f.starts_at).toISOString(), duration_min: Number(f.duration_min),
      capacity: f.unlimited ? null : Number(f.capacity), location: f.location, level: f.level, category: f.category || null, repeat_weeks: Number(f.repeat_weeks) || 0, tz: TZ };
    try {
      if (editing) await api.patch(`/classes/${initial.id}`, body); else await api.post("/classes", body);
      toast.success(editing ? "Class updated" : body.repeat_weeks ? `Added ${body.repeat_weeks + 1} weekly classes` : "Class added");
      onSaved(); onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={editing ? "Edit class" : "Add a class"}>
      <div className="space-y-4" data-testid="class-form">
        <Field label="Class name"><Input data-testid="cf-title" value={f.title} onChange={set("title")} placeholder="e.g. Strength 45" maxLength={80} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts"><Input data-testid="cf-start" type="datetime-local" value={f.starts_at} onChange={set("starts_at")} /></Field>
          <Field label="Length (minutes)"><Input type="number" min={10} max={240} value={f.duration_min} onChange={set("duration_min")} /></Field>
        </div>
        <Field label="Instructor"><Select data-testid="cf-instructor" value={f.instructor_id} onChange={set("instructor_id")} options={[{ value: "", label: "To be announced" }, ...instructors.map((i) => ({ value: i.id, label: i.name }))]} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Spots"><Input type="number" min={1} max={500} disabled={f.unlimited} value={f.unlimited ? "" : f.capacity} onChange={set("capacity")} data-testid="cf-capacity" /></Field>
          <Field label="Level"><Select value={f.level} onChange={set("level")} options={levels} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.unlimited} onChange={(e) => setF({ ...f, unlimited: e.target.checked })} />No limit on spots</label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Where"><Input value={f.location} onChange={set("location")} placeholder="Studio A" maxLength={120} /></Field>
          <Field label="Type (optional)"><Input value={f.category} onChange={set("category")} placeholder="Strength, Yoga, HIIT..." maxLength={40} /></Field>
        </div>
        <Field label="About the class"><Textarea rows={3} value={f.description} onChange={set("description")} maxLength={2000} placeholder="What to expect and what to bring." /></Field>
        {!editing && <Field label="Repeat weekly" hint="Adds this class at the same time on each of the next weeks."><Select data-testid="cf-repeat" value={f.repeat_weeks} onChange={set("repeat_weeks")} options={[{ value: 0, label: "Just this once" }, ...[1, 2, 3, 4, 8, 12, 26].map((n) => ({ value: n, label: `For ${n} more week${n > 1 ? "s" : ""}` }))]} /></Field>}
        <div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={f.title.trim().length < 2 || !f.starts_at} data-testid="cf-save">{editing ? "Save" : "Add class"}</Button></div>
      </div>
    </Modal>
  );
}

function InstructorForm({ initial, onClose, onSaved }) {
  const editing = !!initial?.id;
  const [f, setF] = useState({ name: initial?.name || "", bio: initial?.bio || "", avatar_url: initial?.avatar_url || "", specialties: initial?.specialties || [] });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { if (editing) await api.patch(`/classes/instructors/${initial.id}`, f); else await api.post("/classes/instructors", f); toast.success(editing ? "Instructor updated" : "Instructor added"); onSaved(); onClose(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const remove = async () => { try { await api.delete(`/classes/instructors/${initial.id}`); toast.success("Instructor removed"); onSaved(); onClose(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Modal open onClose={onClose} title={editing ? "Edit instructor" : "Add an instructor"}>
      <div className="space-y-4" data-testid="instructor-form">
        <AvatarUpload photo={f.avatar_url} onChange={(v) => setF({ ...f, avatar_url: v })} name={f.name} testId="instructor-photo" />
        <Field label="Name"><Input data-testid="if-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} /></Field>
        <Field label="About them"><Textarea rows={3} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} maxLength={800} /></Field>
        <Field label="Specialities"><TagInput value={f.specialties} onChange={(v) => setF({ ...f, specialties: v })} placeholder="Strength, Mobility..." /></Field>
        <div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={f.name.trim().length < 2} data-testid="if-save">Save</Button>{editing && <Button variant="ghost" onClick={remove} data-testid="if-delete">Remove</Button>}</div>
      </div>
    </Modal>
  );
}

export default function Classes() {
  const { user, config } = useAuth();
  const isAdmin = user?.role === "admin";
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState("schedule");
  const [sched, setSched] = useState(null);
  const [mine, setMine] = useState(null);
  const [insts, setInsts] = useState(null);
  const [reviews, setReviews] = useState(null);
  const [filterInst, setFilterInst] = useState("all");
  const [openId, setOpenId] = useState(params.get("open"));
  const [reviewing, setReviewing] = useState(null);
  const [form, setForm] = useState(null);       // null | {} (new) | class (edit)
  const [instForm, setInstForm] = useState(null);

  const loadSched = useCallback(() => api.get("/classes", { params: { days: 21 } }).then((r) => setSched(r.data)).catch((e) => toast.error(errMsg(e))), []);
  const loadMine = useCallback(() => api.get("/classes/mine").then((r) => setMine(r.data)).catch(() => {}), []);
  const loadInsts = useCallback(() => api.get("/classes/instructors").then((r) => setInsts(r.data.instructors)).catch(() => {}), []);
  const loadReviews = useCallback(() => (isAdmin ? api.get("/classes/reviews").then((r) => setReviews(r.data.reviews)).catch(() => {}) : null), [isAdmin]);
  const reload = useCallback(() => { loadSched(); loadMine(); loadInsts(); loadReviews(); }, [loadSched, loadMine, loadInsts, loadReviews]);
  useEffect(() => { reload(); }, [reload]);
  useLive(["classes"], reload);
  const closeOpen = useCallback(() => { setOpenId(null); if (params.get("open")) { params.delete("open"); setParams(params, { replace: true }); } }, [params, setParams]);

  const label = (config?.nav || []).find((n) => n.key === "classes")?.label || "Classes";
  const days = useMemo(() => {
    const rows = (sched?.classes || []).filter((c) => filterInst === "all" || c.instructor?.id === filterInst);
    const out = [];
    for (const c of rows) {
      const key = new Date(c.starts_at).toDateString();
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(c); else out.push({ key, label: dayLabel(c.starts_at), items: [c] });
    }
    return out;
  }, [sched, filterInst]);

  const tabs = [{ value: "schedule", label: "Schedule" }, { value: "mine", label: `My ${label.toLowerCase()}${mine?.upcoming?.length ? ` · ${mine.upcoming.length}` : ""}` }, { value: "instructors", label: "Instructors" }, ...(isAdmin ? [{ value: "reviews", label: "Reviews" }] : [])];
  const instOptions = [{ value: "all", label: "All instructors" }, ...(insts || []).map((i) => ({ value: i.id, label: i.name }))];

  return (
    <div data-testid="classes-page">
      <PageHeader title={label} subtitle="Book your spot, bring a friend, and tell us how it went."
        actions={isAdmin && <><Button variant="ghost" onClick={() => setInstForm({})} data-testid="add-instructor"><Plus className="h-4 w-4" aria-hidden />Instructor</Button><Button onClick={() => setForm({})} data-testid="add-class"><Plus className="h-4 w-4" aria-hidden />Add class</Button></>} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "schedule" && (
        !sched ? <Spinner /> : (
          <div className="space-y-6">
            {(insts || []).length > 0 && <Select className="!w-auto" value={filterInst} onChange={(e) => setFilterInst(e.target.value)} options={instOptions} data-testid="class-filter-instructor" />}
            {days.length === 0 ? <Empty title="Nothing on the schedule yet" hint={isAdmin ? "Add your first class to get started." : "New classes will show up here."} action={isAdmin && <Button onClick={() => setForm({})}>Add a class</Button>} /> : days.map((day) => (
              <section key={day.key} data-testid="class-day">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{day.label}</h2>
                <div className="space-y-2">{day.items.map((c) => <ClassRow key={c.id} c={c} onOpen={setOpenId} onChange={reload} />)}</div>
              </section>))}
          </div>))}

      {tab === "mine" && (
        !mine ? <Spinner /> : (
          <div className="space-y-8">
            <section><h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Coming up</h2>
              {mine.upcoming.length === 0 ? <Empty title="No classes booked" hint="Pick one from the schedule." action={<Button onClick={() => setTab("schedule")}>See the schedule</Button>} /> :
                <div className="space-y-2" data-testid="mine-upcoming">{mine.upcoming.map((c) => (
                  <div key={c.id} className="card flex flex-wrap items-center gap-3 !p-4"><div className="min-w-0 flex-1 basis-48"><button className="truncate text-left font-semibold hover:underline" onClick={() => setOpenId(c.id)}>{c.title}</button><p className="text-sm text-muted">{dayLabel(c.starts_at)} · {timeOf(c.starts_at)}{c.instructor ? ` · ${c.instructor.name}` : ""}</p></div>
                    <Chip accent={c.my_status === "booked"}>{c.my_status === "booked" ? "Booked" : `Waitlist #${c.my_waitlist_position}`}</Chip><BookButton c={c} onChange={reload} size="sm" /></div>))}</div>}
            </section>
            <section><h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Classes you've done</h2>
              {mine.past.length === 0 ? <p className="text-sm text-muted">Once you've been to a class, you can rate and review it here.</p> :
                <div className="space-y-2" data-testid="mine-past">{mine.past.map((c) => (
                  <div key={c.id} className="card flex flex-wrap items-center gap-3 !p-4"><div className="min-w-0 flex-1 basis-48"><button className="truncate text-left font-semibold hover:underline" onClick={() => setOpenId(c.id)}>{c.title}</button><p className="text-sm text-muted">{dateOf(c.starts_at)} · {timeOf(c.starts_at)}{c.instructor ? ` · ${c.instructor.name}` : ""}</p></div>
                    {c.my_review ? <span className="flex items-center gap-2"><Stars value={c.my_review.rating} size={14} /><button className="text-xs text-muted underline" onClick={() => setReviewing(c)}>Edit</button></span> : <Button onClick={() => setReviewing(c)} data-testid="rate-class" className="!px-3 !py-1.5 text-sm">Rate &amp; review</Button>}</div>))}</div>}
            </section>
          </div>))}

      {tab === "instructors" && (
        !insts ? <Spinner /> : insts.length === 0 ? <Empty title="No instructors yet" hint={isAdmin ? "Add the people who teach your classes." : undefined} action={isAdmin && <Button onClick={() => setInstForm({})}>Add an instructor</Button>} /> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {insts.map((i) => (
              <Card key={i.id} className="flex flex-col gap-3" data-testid="instructor-card">
                <div className="flex items-center gap-3"><Avatar src={i.avatar_url} name={i.name} size={56} /><div className="min-w-0"><p className="truncate font-semibold">{i.name}</p><div className="flex items-center gap-2"><Stars value={i.rating?.avg || 0} size={13} /><span className="text-xs text-muted">{i.rating?.count ? `${i.rating.avg.toFixed(1)} (${i.rating.count})` : "No ratings yet"}</span></div></div></div>
                {i.bio && <p className="line-clamp-3 text-sm text-muted">{i.bio}</p>}
                {i.specialties?.length > 0 && <div className="flex flex-wrap gap-1.5">{i.specialties.map((s) => <Chip key={s}>{s}</Chip>)}</div>}
                <div className="mt-auto flex flex-wrap gap-2"><Button variant="ghost" className="!px-3 !py-1.5 text-sm" onClick={() => { setFilterInst(i.id); setTab("schedule"); }}>{i.upcoming_classes} upcoming</Button>{isAdmin && <Button variant="ghost" className="!px-3 !py-1.5 text-sm" onClick={() => setInstForm(i)} data-testid="edit-instructor">Edit</Button>}</div>
              </Card>))}
          </div>))}

      {tab === "reviews" && isAdmin && (
        !reviews ? <Spinner /> : reviews.length === 0 ? <Empty title="No reviews yet" hint="Reviews from members show up here after their classes." /> : (
          <div className="space-y-2" data-testid="admin-reviews">{reviews.map((r) => (
            <Card key={r.id} className="space-y-1 !p-4"><div className="flex flex-wrap items-center gap-2"><Stars value={r.rating} size={14} /><button className="font-medium hover:underline" onClick={() => setOpenId(r.class_id)}>{r.class_title}</button>{r.instructor_name && <span className="text-sm text-muted">with {r.instructor_name}{r.instructor_rating ? ` · ${r.instructor_rating}★` : ""}</span>}</div>{r.text && <p className="text-sm text-muted">{r.text}</p>}</Card>))}</div>))}

      {openId && <ClassDetail id={openId} onClose={closeOpen} onChange={reload} onEdit={(c) => { closeOpen(); setForm(c); }} />}
      {reviewing && <ReviewModal cls={reviewing} existing={reviewing.my_review} onClose={() => setReviewing(null)} onDone={reload} />}
      {form && <ClassForm initial={form} instructors={insts || []} levels={sched?.levels || ["All levels", "Beginner", "Intermediate", "Advanced"]} onClose={() => setForm(null)} onSaved={reload} />}
      {instForm && <InstructorForm initial={instForm} onClose={() => setInstForm(null)} onSaved={reload} />}
    </div>
  );
}
