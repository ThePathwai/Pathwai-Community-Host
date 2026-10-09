// The in-browser demo's stand-in for the Classes backend (backend/routes/classes.py): instructors, a class schedule,
// booking with a waitlist, and star ratings and reviews. State lives in the demo session; Unity Fitness starts with a
// real-looking timetable (this week ahead, plus classes from the last days to review), every other community starts empty.

const DAY = 864e5;
const uid = (p) => p + Math.random().toString(36).slice(2, 9);
const ME = "__me__"; // seeded bookings/reviews that belong to whoever is signed in to the demo
const iso = (d) => new Date(d).toISOString();

const PEOPLE = [["Aaliyah G.", null], ["Jordan P.", null], ["Sofia R.", null], ["Marcus T.", null], ["Elena V.", null], ["Natasha K.", null], ["Priya S.", null], ["Devon L.", null], ["Chidi O.", null], ["Hana M.", null]];

const INSTRUCTORS = [
  { name: "Marcus Reid", bio: "Head strength coach. Ten years coaching barbells, kettlebells and the stuff in between. Big on technique, bigger on high fives.", specialties: ["Strength", "Kettlebells"] },
  { name: "Dana Cole", bio: "Mobility and yoga teacher who runs the slowest, hardest stretch class in Harbourfront.", specialties: ["Yoga", "Mobility"] },
  { name: "Priya Nair", bio: "Former sprinter. Her HIIT classes are short, loud and always end with a playlist-worthy finisher.", specialties: ["HIIT", "Cardio"] },
  { name: "Tomás Rivera", bio: "Train United coach. Small-group programming for people who like to train with a plan.", specialties: ["Train United", "Strength"] },
  { name: "Keisha Brown", bio: "Boxing and conditioning. Come for the bag work, stay for the community.", specialties: ["Boxing", "Conditioning"] },
];

// [instructor index, title, category, level, weekday(0=Sun), hour, minute, minutes, spots, where, about]
const TIMETABLE = [
  [0, "Strength 45", "Strength", "All levels", 1, 6, 30, 45, 14, "Main floor", "A full-body strength session built around one big lift. Coaching cues all the way through, so it works whether it's your first week or your fiftieth."],
  [2, "Lunch Break HIIT", "HIIT", "Intermediate", 1, 12, 15, 30, 16, "Studio B", "Thirty minutes, all of it work. Intervals, a finisher and a cool-down you'll need."],
  [1, "Slow Flow", "Yoga", "All levels", 2, 18, 30, 60, 18, "Studio A", "A long, quiet flow with plenty of time in each shape. Bring a mat if you prefer your own."],
  [3, "Train United: Lower", "Train United", "Intermediate", 2, 19, 0, 60, 8, "Main floor", "Small-group programming focused on legs and hips. Spots are limited so everyone gets real coaching."],
  [4, "Boxing Fundamentals", "Boxing", "Beginner", 3, 18, 0, 45, 12, "Studio B", "Stance, footwork and combinations on the bag. No experience or gloves needed."],
  [2, "Sprint Club", "HIIT", "Advanced", 4, 6, 15, 45, 10, "Track + main floor", "Hill-style repeats and speed work. Come warm."],
  [0, "Kettlebell Flow", "Strength", "All levels", 4, 18, 30, 45, 14, "Main floor", "Swings, cleans and carries linked into flowing circuits."],
  [1, "Mobility Reset", "Mobility", "All levels", 5, 12, 0, 40, 20, "Studio A", "Unwind your hips, shoulders and spine. Perfect midweek recovery."],
  [4, "Saturday Conditioning", "Conditioning", "All levels", 6, 9, 30, 50, 16, "Main floor", "Partner circuits and a community warm-up. Bring a friend."],
  [3, "Train United: Upper", "Train United", "Intermediate", 6, 11, 0, 60, 8, "Main floor", "Upper-body strength in a small group with a coach on the floor."],
  [1, "Sunday Stretch", "Yoga", "Beginner", 0, 10, 0, 60, 18, "Studio A", "Gentle, unhurried, and the best way to start a Sunday."],
];

const REVIEW_TEXT = [
  [5, 5, "Best class I've done here. Marcus explains everything and nobody gets left behind."],
  [5, 5, "Left feeling strong and not wrecked. The coaching is the whole reason I come."],
  [4, 5, "Great pace, a little crowded on the main floor but the energy is worth it."],
  [5, 4, "Love the playlist and the crew. Finisher was brutal in the best way."],
  [4, 4, "Really well programmed. I could feel it in my legs for two days."],
  [5, 5, "Friendly room, great cueing. Brought a friend and she's hooked."],
];

function at(base, dayOffset, h, m) { const d = new Date(base); d.setDate(d.getDate() + dayOffset); d.setHours(h, m, 0, 0); return d; }

function seed() {
  const now = new Date();
  const instructors = INSTRUCTORS.map((i) => ({ id: uid("inst-"), ...i, avatar_url: null, created_at: iso(now) }));
  const classes = [], bookings = [], reviews = [];
  const series = {};
  let n = 0;
  for (let off = -9; off < 14; off += 1) {
    const day = new Date(now.getTime() + off * DAY);
    for (const [ii, title, category, level, dow, h, m, mins, spots, where, about] of TIMETABLE) {
      if (day.getDay() !== dow) continue;
      const key = title;
      series[key] = series[key] || uid("series-");
      const c = { id: uid("cls-"), series_id: series[key], title, description: about, instructor_id: instructors[ii].id, starts_at: iso(at(day, 0, h, m)), duration_min: mins, location: where,
        capacity: spots, level, category, status: "scheduled", created_at: iso(now) };
      classes.push(c);
      const filled = Math.min(spots, 3 + ((n * 5) % (spots + 2)));          // some classes nearly full, one or two full with a waitlist
      for (let k = 0; k < filled; k += 1) { const p = PEOPLE[(n + k) % PEOPLE.length]; bookings.push({ id: uid("bk-"), class_id: c.id, series_id: c.series_id, user_id: "demo-" + ((n + k) % PEOPLE.length), user_name: p[0], status: "booked", created_at: iso(now) }); }
      if (n % 7 === 3) { for (let k = 0; k < 2; k += 1) bookings.push({ id: uid("bk-"), class_id: c.id, series_id: c.series_id, user_id: "demo-w" + k, user_name: PEOPLE[(n + k + 3) % PEOPLE.length][0], status: "waitlist", created_at: iso(now) }); }
      n += 1;
    }
  }
  // Reviews from other members on the classes that already happened.
  const past = classes.filter((c) => new Date(c.starts_at) < now);
  past.forEach((c, i) => {
    const count = 1 + (i % 3);
    for (let k = 0; k < count; k += 1) {
      const [r, ir, text] = REVIEW_TEXT[(i + k) % REVIEW_TEXT.length]; const p = PEOPLE[(i + k + 2) % PEOPLE.length];
      reviews.push({ id: uid("rv-"), class_id: c.id, series_id: c.series_id, instructor_id: c.instructor_id, user_id: "demo-" + ((i + k + 2) % PEOPLE.length), user_name: p[0], avatar_url: null, rating: r, instructor_rating: ir, text, created_at: iso(new Date(new Date(c.starts_at).getTime() + 3 * 3600e3)) });
    }
  });
  // You went to the last three classes: the first is already reviewed, the other two are waiting for your review.
  past.slice(-3).forEach((c, i) => {
    bookings.push({ id: uid("bk-"), class_id: c.id, series_id: c.series_id, user_id: ME, user_name: "You", status: "booked", created_at: iso(now) });
    if (i === 0) reviews.push({ id: uid("rv-"), class_id: c.id, series_id: c.series_id, instructor_id: c.instructor_id, user_id: ME, user_name: "You", avatar_url: null, rating: 5, instructor_rating: 5, text: "Brilliant class. Will be back next week.", created_at: iso(new Date(new Date(c.starts_at).getTime() + 2 * 3600e3)) });
  });
  return { instructors, classes, bookings, reviews };
}

const ok = (data, status = 200) => ({ status, data });
const err = (status, detail) => ({ status, data: { detail } });

export function newClassesState(slug) {
  return slug === "unity" ? seed() : { instructors: [], classes: [], bookings: [], reviews: [] };
}

function stars(rows, key) {
  const acc = {};
  for (const r of rows) { const k = r[key === "series_id" ? "series_id" : "instructor_id"]; const v = key === "series_id" ? r.rating : r.instructor_rating; if (k && v) (acc[k] = acc[k] || []).push(v); }
  return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, { avg: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10, count: v.length }]));
}

export function classesHandler({ method, path, body = {}, params = {}, state, me }) {
  if (!path.startsWith("/classes")) return null;
  const now = new Date();
  const mineB = (b) => b.user_id === ME || b.user_id === me.id;
  const ends = (c) => new Date(new Date(c.starts_at).getTime() + c.duration_min * 60000);
  const isAdmin = me.role === "admin";
  const instOf = (id) => state.instructors.find((i) => i.id === id);
  const find = (id) => state.classes.find((c) => c.id === id);
  const decorate = (c) => {
    const rows = state.bookings.filter((b) => b.class_id === c.id);
    const booked = rows.filter((b) => b.status === "booked"), wait = rows.filter((b) => b.status === "waitlist");
    const mine = rows.find(mineB); const inst = instOf(c.instructor_id);
    const rating = stars(state.reviews.filter((r) => r.series_id === c.series_id), "series_id")[c.series_id] || { avg: null, count: 0 };
    return { ...c, ends_at: iso(ends(c)), instructor: inst ? { id: inst.id, name: inst.name, avatar_url: inst.avatar_url } : null,
      booked_count: booked.length, waitlist_count: wait.length, spots_left: c.capacity == null ? null : Math.max(0, c.capacity - booked.length),
      is_full: c.capacity != null && booked.length >= c.capacity, my_status: mine ? mine.status : null, my_waitlist_position: mine && mine.status === "waitlist" ? wait.indexOf(mine) + 1 : null,
      rating, attendee_preview: booked.filter((b) => b.user_id !== ME).slice(0, 4).map((b) => ({ id: b.user_id, name: b.user_name, avatar_url: null })), is_past: ends(c) <= now, has_started: new Date(c.starts_at) <= now };
  };
  const promote = (c) => {
    for (;;) {
      const booked = state.bookings.filter((b) => b.class_id === c.id && b.status === "booked").length;
      if (c.capacity != null && booked >= c.capacity) return;
      const next = state.bookings.filter((b) => b.class_id === c.id && b.status === "waitlist")[0];
      if (!next) return;
      next.status = "booked";
    }
  };
  const seg = path.split("/").filter(Boolean); // ["classes", ...]

  if (method === "get") {
    if (path === "/classes") {
      const start = params.start ? new Date(params.start) : new Date(now.getTime() - 30 * 60000);
      const until = new Date(start.getTime() + (Number(params.days) || 14) * DAY);
      let rows = state.classes.filter((c) => c.status !== "cancelled" && new Date(c.starts_at) >= start && new Date(c.starts_at) < until);
      if (params.instructor) rows = rows.filter((c) => c.instructor_id === params.instructor);
      rows.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      return ok({ classes: rows.map(decorate), categories: [...new Set(state.classes.map((c) => c.category).filter(Boolean))].sort(), levels: ["All levels", "Beginner", "Intermediate", "Advanced"] });
    }
    if (path === "/classes/instructors") {
      const r = stars(state.reviews, "instructor_id");
      return ok({ instructors: [...state.instructors].sort((a, b) => a.name.localeCompare(b.name)).map((i) => ({ ...i, rating: r[i.id] || { avg: null, count: 0 }, upcoming_classes: state.classes.filter((c) => c.instructor_id === i.id && c.status !== "cancelled" && new Date(c.starts_at) >= now).length })) });
    }
    if (path === "/classes/mine") {
      const mineRows = state.bookings.filter(mineB); const upcoming = [], past = [];
      for (const b of mineRows) {
        const c = find(b.class_id); if (!c || c.status === "cancelled") continue;
        const d = decorate(c);
        if (d.is_past) { if (b.status === "booked") past.push({ ...d, my_review: state.reviews.find((r) => r.class_id === c.id && (r.user_id === ME || r.user_id === me.id)) || null }); }
        else upcoming.push(d);
      }
      upcoming.sort((a, b) => a.starts_at.localeCompare(b.starts_at)); past.sort((a, b) => b.starts_at.localeCompare(a.starts_at));
      return ok({ upcoming, past });
    }
    if (path === "/classes/reviews") {
      if (!isAdmin) return err(403, "Only admins can do that.");
      const rows = [...state.reviews].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30).map((r) => { const c = find(r.class_id); const i = instOf(r.instructor_id); return { ...r, class_title: c ? c.title : "A class", class_starts_at: c?.starts_at, instructor_name: i?.name || null }; });
      return ok({ reviews: rows });
    }
    if (seg.length === 2) {
      const c = find(seg[1]); if (!c) return err(404, "Class not found.");
      const d = decorate(c);
      const reviews = state.reviews.filter((r) => r.series_id === c.series_id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20)
        .map((r) => ({ id: r.id, rating: r.rating, instructor_rating: r.instructor_rating, text: r.text, created_at: r.created_at, mine: r.user_id === ME || r.user_id === me.id, name: r.user_id === ME ? me.name : r.user_name, avatar_url: r.avatar_url }));
      const booked = state.bookings.find((b) => b.class_id === c.id && mineB(b) && b.status === "booked");
      const out = { ...d, reviews, my_review: state.reviews.find((r) => r.class_id === c.id && (r.user_id === ME || r.user_id === me.id)) || null, can_review: !!(booked && d.is_past && c.status !== "cancelled") };
      if (isAdmin) out.roster = state.bookings.filter((b) => b.class_id === c.id).map((b) => ({ user_id: b.user_id, status: b.status, name: mineB(b) ? me.name : b.user_name, avatar_url: null }));
      return ok(out);
    }
    return null;
  }

  // ---- writes
  if (path === "/classes/instructors" && method === "post") {
    if (!isAdmin) return err(403, "Only admins can do that.");
    if ((body.name || "").trim().length < 2) return err(400, "Give the instructor a name.");
    const i = { id: uid("inst-"), name: body.name.trim(), bio: body.bio || "", avatar_url: body.avatar_url || null, specialties: body.specialties || [], created_at: iso(now) };
    state.instructors.push(i); return ok(i, 201);
  }
  const im = path.match(/^\/classes\/instructors\/([^/]+)$/);
  if (im) {
    if (!isAdmin) return err(403, "Only admins can do that.");
    const i = instOf(im[1]); if (!i) return err(404, "Instructor not found.");
    if (method === "patch") { Object.assign(i, { name: body.name.trim(), bio: body.bio || "", avatar_url: body.avatar_url || null, specialties: body.specialties || [] }); return ok(i); }
    if (method === "delete") { state.instructors = state.instructors.filter((x) => x.id !== i.id); state.classes.forEach((c) => { if (c.instructor_id === i.id) c.instructor_id = null; }); return ok({ ok: true }); }
  }
  if (path === "/classes" && method === "post") {
    if (!isAdmin) return err(403, "Only admins can do that.");
    if ((body.title || "").trim().length < 2) return err(400, "Give the class a name.");
    if (Number.isNaN(new Date(body.starts_at).getTime())) return err(400, "That date and time isn't valid.");
    const series = uid("series-"); const weeks = Math.min(26, Math.max(0, body.repeat_weeks || 0)); const first = new Date(body.starts_at);
    const made = [];
    for (let w = 0; w <= weeks; w += 1) {
      const d = new Date(first); d.setDate(d.getDate() + 7 * w);   // same clock time each week, even across a daylight-saving change
      made.push({ id: uid("cls-"), series_id: series, title: body.title.trim(), description: body.description || "", instructor_id: body.instructor_id || null, starts_at: iso(d), duration_min: body.duration_min || 45,
        location: body.location || "", capacity: body.capacity ?? null, level: body.level || "All levels", category: body.category || null, status: "scheduled", created_at: iso(now) });
    }
    state.classes.push(...made); return ok({ ok: true, created: made.length, class: made[0] }, 201);
  }
  const cm = path.match(/^\/classes\/([^/]+)$/);
  if (cm && method === "patch") {
    if (!isAdmin) return err(403, "Only admins can do that.");
    const c = find(cm[1]); if (!c) return err(404, "Class not found.");
    const booked = state.bookings.filter((b) => b.class_id === c.id && b.status === "booked").length;
    if (body.capacity != null && body.capacity < booked) return err(409, `${booked} people are already booked, so it can't go below ${booked} spots.`);
    Object.assign(c, { title: body.title.trim(), description: body.description || "", instructor_id: body.instructor_id || null, starts_at: iso(new Date(body.starts_at)), duration_min: body.duration_min, location: body.location || "", capacity: body.capacity ?? null, level: body.level, category: body.category || null });
    promote(c); return ok(c);
  }
  if (cm && method === "delete") {
    if (!isAdmin) return err(403, "Only admins can do that.");
    const c = find(cm[1]); if (!c) return err(404, "Class not found.");
    const targets = String(params.series) === "true" ? state.classes.filter((x) => x.series_id === c.series_id && x.starts_at >= c.starts_at && x.status !== "cancelled") : [c];
    targets.forEach((t) => { t.status = "cancelled"; state.bookings = state.bookings.filter((b) => b.class_id !== t.id); });
    return ok({ ok: true, cancelled: targets.length });
  }
  const bm = path.match(/^\/classes\/([^/]+)\/book$/);
  if (bm) {
    const c = find(bm[1]); if (!c) return err(404, "Class not found.");
    const mine = state.bookings.find((b) => b.class_id === c.id && mineB(b));
    if (method === "post") {
      if (c.status === "cancelled") return err(409, "This class was cancelled.");
      if (new Date(c.starts_at) <= now) return err(409, "This class has already started.");
      if (mine) return ok({ ok: true, status: mine.status });
      const booked = state.bookings.filter((b) => b.class_id === c.id && b.status === "booked").length;
      const status = c.capacity != null && booked >= c.capacity ? "waitlist" : "booked";
      state.bookings.push({ id: uid("bk-"), class_id: c.id, series_id: c.series_id, user_id: me.id, user_name: me.name, status, created_at: iso(now) });
      return ok({ ok: true, status });
    }
    if (method === "delete") {
      if (!mine) return ok({ ok: true });
      if (new Date(c.starts_at) <= now) return err(409, "This class has already started, so it can't be cancelled.");
      state.bookings = state.bookings.filter((b) => b !== mine); if (mine.status === "booked") promote(c);
      return ok({ ok: true });
    }
  }
  const rm = path.match(/^\/classes\/([^/]+)\/review$/);
  if (rm) {
    const c = find(rm[1]); if (!c) return err(404, "Class not found.");
    if (method === "delete") { state.reviews = state.reviews.filter((r) => !(r.class_id === c.id && (r.user_id === ME || r.user_id === me.id))); return ok({ ok: true }); }
    if (c.status === "cancelled" || ends(c) > now) return err(409, "You can review a class once it has finished.");
    if (!state.bookings.find((b) => b.class_id === c.id && mineB(b) && b.status === "booked")) return err(403, "Only people who booked this class can review it.");
    if (!(body.rating >= 1 && body.rating <= 5)) return err(400, "Ratings are 1 to 5 stars.");
    const have = state.reviews.find((r) => r.class_id === c.id && (r.user_id === ME || r.user_id === me.id));
    const fields = { rating: body.rating, instructor_rating: c.instructor_id ? (body.instructor_rating || null) : null, text: (body.text || "").trim() || null };
    if (have) Object.assign(have, fields, { user_id: have.user_id });
    else state.reviews.push({ id: uid("rv-"), class_id: c.id, series_id: c.series_id, instructor_id: c.instructor_id, user_id: me.id, user_name: me.name, avatar_url: me.avatar_url || null, ...fields, created_at: iso(now) });
    return ok({ ok: true, updated: !!have });
  }
  const dm = path.match(/^\/classes\/([^/]+)\/reviews\/([^/]+)$/);
  if (dm && method === "delete") { if (!isAdmin) return err(403, "Only admins can do that."); state.reviews = state.reviews.filter((r) => r.id !== dm[2]); return ok({ ok: true }); }
  return null;
}
