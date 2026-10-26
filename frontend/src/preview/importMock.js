// Demo-only stand-ins for backend/routes/data_import.py: a rough read of a pasted/uploaded spreadsheet or calendar so
// the "Import your data" screens can be tried end to end in the preview. Same answer shapes as the real endpoints.

export function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  const s = String(text || "").replace(/^﻿/, "");
  const first = s.split(/\r?\n/)[0] || "";
  const delim = [",", ";", "\t"].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((x) => x.trim())) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const norm = (h) => String(h || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const EVENT_ALIASES = {
  title: ["title", "name", "event", "event name", "event title", "summary", "subject"],
  start: ["start", "starts", "starts at", "start at", "datetime", "date time", "begins", "when"],
  date: ["date", "start date", "event date", "day"], time: ["time", "start time"],
  end: ["end", "ends", "ends at", "end at"], end_time: ["end time"],
  location: ["location", "venue", "address", "where", "place"], description: ["description", "details", "about", "notes"],
  category: ["category", "type", "event type"], capacity: ["capacity", "max", "limit", "spots"], price: ["price", "ticket price", "cost", "fee"], url: ["url", "link", "registration link", "ticket link"],
};
const GUEST_ALIASES = { email: ["email", "e mail", "email address", "mail"], name: ["name", "full name", "guest name"], status: ["status", "approval status", "rsvp", "registration status"] };

function table(text, aliases) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("That file is empty.");
  const look = {}; Object.entries(aliases).forEach(([f, names]) => names.forEach((n) => { look[n] = f; }));
  const fields = rows[0].map((h) => look[norm(h)]);
  if (!fields.some(Boolean)) throw new Error("I couldn't recognise any columns. Add a header row (the template shows the names).");
  const used = rows[0].filter((_, i) => fields[i]).map((h) => h.trim()), ignored = rows[0].filter((h, i) => !fields[i] && h.trim()).map((h) => h.trim());
  const out = rows.slice(1).map((r, i) => { const o = { _line: i + 2 }; fields.forEach((f, j) => { if (f && (r[j] || "").trim() && !o[f]) o[f] = r[j].trim(); }); return o; });
  return { rows: out, used, ignored };
}

function when(text) {
  if (!text) return null;
  const t = String(text).replace(/(\d)(st|nd|rd|th)\b/gi, "$1").replace(/\s+(at|@)\s+/i, " ").replace(/([ap])\.m\./gi, "$1m");
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : { d, hasTime: /\d{1,2}:\d{2}|\d\s?[ap]m/i.test(t) };
}

const ics = (text) => {
  const lines = String(text).replace(/\r\n?/g, "\n").split("\n").reduce((a, l) => { if (/^[ \t]/.test(l) && a.length) a[a.length - 1] += l.slice(1); else a.push(l); return a; }, []);
  const evs = []; let cur = null;
  lines.forEach((l, i) => {
    if (/^BEGIN:VEVENT/i.test(l)) cur = { _line: i + 1 };
    else if (/^END:VEVENT/i.test(l)) { if (cur) evs.push(cur); cur = null; }
    else if (cur && l.includes(":")) { const [head, ...rest] = l.split(":"); const k = head.split(";")[0].toUpperCase(); if (!(k in cur)) cur[k] = rest.join(":"); }
  });
  const stamp = (v) => { const m = /^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)(Z)?)?/.exec(v || ""); if (!m) return null; const z = m[7] ? "Z" : ""; const hh = m[4] ? `${m[4]}:${m[5]}:${m[6]}` : "18:00:00"; return { d: new Date(`${m[1]}-${m[2]}-${m[3]}T${hh}${z}`), hasTime: !!m[4] }; };
  return evs.map((e) => ({ _line: e._line, title: (e.SUMMARY || "").replace(/\\,/g, ","), _w: stamp(e.DTSTART), location: (e.LOCATION || "").replace(/\\,/g, ","), description: (e.DESCRIPTION || "").replace(/\\n/g, "\n"), url: e.URL || "", cancelled: /CANCELLED/i.test(e.STATUS || ""), repeats: !!e.RRULE }));
};

const SAMPLE_LINK = `title,date,time,location,description\nPortfolio Review Night,${future(12)},18:30,MaRS Discovery District,Bring one project for live feedback\nFounders Brunch,${future(19)},10:30,Café Pathway,Casual weekend brunch\nDemo Day Rehearsal,${future(26)},17:00,Online,Run through your pitch`;
function future(days) { const d = new Date(Date.now() + days * 864e5); return d.toISOString().slice(0, 10); }

/** -> { result, docs }: the preview/answer the real endpoint returns, plus the new events to add on a real run. */
export function eventsImport(body, existing) {
  let text = body.ics || body.csv || "", kind = body.ics ? "calendar" : "spreadsheet";
  if (!text.trim() && body.url) {
    if (/airtable\.com/i.test(body.url)) throw new Error("Airtable doesn't let other apps read a shared view. In Airtable open the view, choose Download CSV, then upload that file here.");
    text = SAMPLE_LINK; kind = "spreadsheet";   // the preview can't fetch a real link; show what a sheet would bring in
  }
  if (!text.trim()) throw new Error("Choose a file or paste a link.");
  let rows, used = [], ignored = [];
  if (kind === "calendar" || /BEGIN:VCALENDAR/i.test(text.slice(0, 2000))) { kind = "calendar"; rows = ics(text); used = ["Title", "Start", "End", "Location", "Description", "Link"]; if (!rows.length) throw new Error("I couldn't find any events in that calendar."); }
  else {
    const t = table(text, EVENT_ALIASES); used = t.used; ignored = t.ignored;
    rows = t.rows.map((r) => {
      const start = r.start || [r.date, r.time].filter(Boolean).join(" ");
      return { ...r, _w: when(start), _start_text: start };
    });
  }
  const have = new Set(existing.map((e) => `${(e.title || "").toLowerCase()}|${(e.starts_at || "").slice(0, 10)}`));
  const seen = new Set(); const now = Date.now(); const results = []; const docs = [];
  rows.forEach((r) => {
    const title = (r.title || "").trim(); const w = r._w;
    const res = { line: r._line, title, starts_at: w ? w.d.toISOString() : null, notes: [] }; results.push(res);
    if (!title) return Object.assign(res, { status: "skipped", reason: "no title" });
    if (!w) return Object.assign(res, { status: "skipped", reason: "couldn't read the date" });
    if (r.cancelled) return Object.assign(res, { status: "skipped", reason: "cancelled" });
    if (w.d.getTime() < now - 6 * 36e5 && !body.include_past) return Object.assign(res, { status: "skipped", reason: "already happened" });
    const key = `${title.toLowerCase()}|${w.d.toISOString().slice(0, 10)}`;
    if (seen.has(key)) return Object.assign(res, { status: "skipped", reason: "appears twice" });
    seen.add(key);
    if (have.has(key)) return Object.assign(res, { status: "skipped", reason: "already in your events" });
    if (!w.hasTime) res.notes.push("no time given, set to 6:00 PM");
    if (r.repeats) res.notes.push("repeats: only the first date was brought in");
    res.status = body.dry_run ? "will_create" : "created";
    const priceM = /\d+(?:\.\d+)?/.exec((r.price || "").replace(/,/g, ""));
    docs.push({ id: "imp-" + Date.now() + "-" + docs.length, title, starts_at: w.d.toISOString(), ends_at: null, location: r.location || null, description: r.description || null, url: r.url || null, category: r.category || "Meetup",
      capacity: r.capacity ? parseInt(r.capacity, 10) : null, price_cents: priceM ? Math.round(parseFloat(priceM[0]) * 100) || null : null, source: "import", status: "approved" });
  });
  const n = (...s) => results.filter((x) => s.includes(x.status)).length;
  return { result: { dry_run: !!body.dry_run, source: kind, total: results.length, created: n("created", "will_create"), updated: 0, skipped: n("skipped"), columns_used: used, columns_ignored: ignored, rows: results }, docs };
}

const YES = new Set(["", "approved", "going", "yes", "y", "registered", "confirmed", "attending", "checked in", "attended", "paid", "accepted", "true", "1"]);
/** -> { result, add: [member] } */
export function guestsImport(body, event, members, alreadyGoing) {
  let text = body.csv || "";
  if (!text.trim() && body.url) text = "name,email,status\n" + members.slice(0, 6).map((m) => `${m.name},${m.email},approved`).join("\n") + "\nSomeone New,someone.new@example.com,approved";
  if (!text.trim()) throw new Error("Choose a file or paste a link.");
  const t = table(text, GUEST_ALIASES);
  if (!t.rows.some((r) => r.email)) throw new Error("I couldn't find an email column. Guests are matched to members by email.");
  const byEmail = new Map(members.filter((m) => m.email).map((m) => [m.email.toLowerCase(), m]));
  const seen = new Set(); const add = []; const results = [];
  t.rows.forEach((r) => {
    const email = (r.email || "").trim().toLowerCase(); const res = { line: r._line, email, name: r.name || "" }; results.push(res);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Object.assign(res, { status: "skipped", reason: "no valid email" });
    if (seen.has(email)) return Object.assign(res, { status: "skipped", reason: "appears twice" });
    seen.add(email);
    if (!YES.has(norm(r.status))) return Object.assign(res, { status: "skipped", reason: `status is “${(r.status || "").slice(0, 30)}”` });
    const m = byEmail.get(email);
    if (!m) return Object.assign(res, { status: "not_member", reason: "not a member yet" });
    res.name = res.name || m.name || "";
    if (alreadyGoing.has(m.id)) return Object.assign(res, { status: "skipped", reason: "already going" });
    res.status = body.dry_run ? "will_add" : "added"; add.push(m);
  });
  const n = (...s) => results.filter((x) => s.includes(x.status)).length;
  return { result: { dry_run: !!body.dry_run, event_title: event?.title, total: results.length, added: n("added", "will_add"), not_members: n("not_member"), skipped: n("skipped"), columns_used: t.used, columns_ignored: t.ignored, rows: results }, add };
}
