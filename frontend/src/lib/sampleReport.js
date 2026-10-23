// Sample impact figures and report builder, used in three places that all show SAMPLE data and say so:
// the About page, the demo entry on the login screen, and the in-browser demo's admin screens.
// The real reports are computed on the server from the community's own records (backend/impact.py);
// buildReport() below mirrors its section layout so the same ReportView draws either one.

export const REPORT_TYPES = [
  { kind: "sponsor", title: "Partnership proposal", audience: "For brands and sponsors", headline: "Why partner with us, and what we do for you", blurb: "Who you would reach, how they show up, what we do to promote your brand, and what we ask in return." },
  { kind: "funder", title: "Funder or investor report", audience: "For funders and investors", headline: "Who this community serves, and the traction behind it", blurb: "People served, connections made, participation and the help given: the traction a funder or investor asks about." },
  { kind: "board", title: "Board report", audience: "For the board or leadership team", headline: "How the community is doing", blurb: "Health of the membership: who is active, who is drifting, and what is coming up." },
];
export const PERIODS = [{ days: 30, label: "Last 30 days" }, { days: 90, label: "Last 90 days" }, { days: 365, label: "Last 12 months" }];

const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const hash = (s) => String(s || "x").split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;
const tile = (label, value, note = "", accent = false) => ({ label, value: String(value), note, accent });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DEFAULT_EVENTS = ["Founders mixer", "Pitch practice", "Legal clinic", "Monthly meetup", "Skills workshop", "Welcome night"];
const DEFAULT_PERKS = ["Design software discount", "Co-working day pass", "Legal consult", "Accounting starter pack", "Cloud credits"];

/** Believable numbers for a community of `members` people. Same input, same output, so the demo never shuffles. */
export function sampleMetrics({ members = 64, seed = "sample", days = 90, eventTitles = [], perkTitles = [] } = {}) {
  const r = rng(hash(seed));
  const scale = days / 90;
  const n = Math.max(8, members);
  const active = Math.round(n * (0.62 + r() * 0.16));
  const quiet = Math.max(2, Math.round(n * (0.1 + r() * 0.08)));
  const events_held = Math.max(2, Math.round((3 + r() * 3) * scale));
  const rsvps = Math.round(events_held * Math.max(6, n * (0.22 + r() * 0.12)));
  const attended = Math.round(rsvps * (0.66 + r() * 0.14));
  const intros_sent = Math.round(n * (0.5 + r() * 0.25) * scale);
  const intros_made = Math.round(intros_sent * (0.55 + r() * 0.2));
  const perk_opens = Math.round(n * (1.4 + r() * 0.9) * scale);
  const evTitles = (eventTitles.length ? eventTitles : DEFAULT_EVENTS).slice(0, 6);
  const pkTitles = (perkTitles.length ? perkTitles : DEFAULT_PERKS).slice(0, 5);
  const event_rows = evTitles.slice(0, Math.min(events_held, 6)).map((t, i) => {
    const going = Math.max(5, Math.round((rsvps / events_held) * (0.8 + r() * 0.4)));
    const d = new Date(Date.now() - (i * 11 + 4) * 86400000);
    return [t.length > 38 ? t.slice(0, 37) + "…" : t, `${MONTHS[d.getMonth()]} ${d.getDate()}`, String(going), String(Math.round(going * (0.6 + r() * 0.25)))];
  });
  let left = perk_opens;
  const top_perks = pkTitles.map((t, i) => { const v = Math.max(1, Math.round(left * (i === pkTitles.length - 1 ? 1 : 0.34 - i * 0.04))); left -= v; return { label: t.length > 30 ? t.slice(0, 29) + "…" : t, value: Math.max(1, v) }; }).sort((a, b) => b.value - a.value);
  const now = new Date();
  const weekly = Array.from({ length: 8 }, (_, i) => { const d = new Date(now.getTime() - (7 - i) * 7 * 86400000); return { label: `${MONTHS[d.getMonth()]} ${d.getDate()}`, value: Math.round(active * (0.7 + 0.04 * i + r() * 0.12)) }; });
  const joins = Array.from({ length: 6 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1); return { label: MONTHS[d.getMonth()], value: Math.round(n * (0.03 + r() * 0.06)) }; });
  const new_members = Math.max(1, Math.round(joins.slice(-Math.max(1, Math.round(days / 30))).reduce((a, j) => a + j.value, 0)));
  return {
    days, sample: true, members: n, new_members, active, active_pct: pct(active, n), quiet,
    intros_made, intros_sent, people_connected: Math.min(n, intros_made * 2 - Math.round(intros_made * 0.2)),
    events_held, upcoming: 2 + Math.round(r() * 3), rsvps, attended, checkin_events: events_held, turnout_pct: pct(attended, rsvps), avg_rsvp: Math.round((rsvps / events_held) * 10) / 10,
    event_rows, event_goers: Math.round(n * (0.4 + r() * 0.2)), perk_opens, perk_users: Math.round(Math.min(n * 0.7, perk_opens * 0.6)), perks_offered: Math.max(pkTitles.length, 5), top_perks,
    weekly, joins, sup_resolved: Math.round(n * 0.14 * scale) + 1, sup_open: 2 + Math.round(r() * 4), completeness: 70 + Math.round(r() * 18), pending_apps: Math.round(r() * 4),
    nudged: 0, came_back: 0,
    // how the community looked in the window before this one (drawn last so every figure above stays exactly as it was)
    prev: { active: Math.round(active * (0.78 + r() * 0.1)), intros_made: Math.max(0, Math.round(intros_made * (0.68 + r() * 0.15))), events_held: Math.max(1, events_held - (r() > 0.5 ? 1 : 0)), perk_opens: Math.round(perk_opens * (0.74 + r() * 0.16)) },
  };
}

export function impactCards(m) {
  const turnout = m.turnout_pct != null ? `${m.turnout_pct}% showed up` : `${m.rsvps} RSVPs`;
  const label = m.days === 365 ? "vs the 12 months before" : `vs previous ${m.days} days`;
  const mv = (cur, before) => (m.prev ? { delta: { value: cur - before, label } } : {});
  return {
    weekly: m.weekly,
    period_days: m.days, period_label: (PERIODS.find((p) => p.days === m.days) || {}).label || `Last ${m.days} days`, quiet: m.quiet, sample: !!m.sample,
    cards: [
      { key: "active", label: "Active members", value: String(m.active), of: `of ${m.members}`, note: `${m.active_pct}% did something in the last 30 days`, to: null, ...mv(m.active, m.prev?.active) },
      { key: "intros", label: "Introductions made", value: String(m.intros_made), note: `${m.intros_sent} asked for · ${m.people_connected} people connected`, to: "/requests", ...mv(m.intros_made, m.prev?.intros_made) },
      { key: "turnout", label: "Event turnout", value: String(m.events_held), unit: m.events_held === 1 ? "event" : "events", note: `${m.rsvps} RSVPs · ${turnout}`, to: "/events", ...mv(m.events_held, m.prev?.events_held) },
      { key: "perks", label: "Perk results", value: String(m.perk_opens), unit: "opens", note: `${m.perk_users} members used a perk · ${m.perks_offered} offered`, to: "/resources", ...mv(m.perk_opens, m.prev?.perk_opens) },
    ],
  };
}

/** What members see about how dependable their community is (mirrors reliability_summary in backend/impact.py). */
export function reliabilityCards(m) {
  const t = m.turnout_pct;
  return {
    sample: !!m.sample, period_days: m.days, period_label: (PERIODS.find((p) => p.days === m.days) || {}).label || `Last ${m.days} days`,
    tiles: [
      { key: "show", label: "Members who show up", value: t != null ? `${t}%` : "n/a", note: t != null ? "of RSVPs came along" : "Shown once events use check-in" },
      { key: "events", label: "Events held", value: String(m.events_held), note: `${m.upcoming} coming up` },
      { key: "intros", label: "Introductions made", value: String(m.intros_made), note: `${m.people_connected} people connected` },
      { key: "help", label: "Help requests answered", value: String(m.sup_resolved), note: `${m.sup_open} still open` },
    ],
  };
}

function insights(m) {
  const out = [];
  if (m.members) out.push(`${m.active} of ${m.members} members (${m.active_pct}%) were active in the last 30 days.`);
  if (m.new_members) out.push(`${plural(m.new_members, "person", "people")} joined in this period.`);
  if (m.intros_made) out.push(`${plural(m.intros_made, "introduction")} led to a conversation, connecting ${m.people_connected} members.`);
  if (m.events_held) out.push(`${plural(m.events_held, "event")} drew ${m.rsvps} RSVPs (${m.avg_rsvp} on average)` + (m.turnout_pct != null ? `, and ${m.turnout_pct}% of those who signed up came.` : "."));
  if (m.perk_opens) out.push(`Members opened perks ${m.perk_opens} times` + (m.top_perks[0] ? `; the most used was ${m.top_perks[0].label}.` : "."));
  return out;
}

// What a community offers a brand and asks in return (mirrors backend/impact.py DEFAULT_OFFER and clean_offer).
export const DEFAULT_OFFER = {
  give: [
    { title: "Promotion to our community", text: "Your brand featured to our members across our social media, event announcements and member updates." },
    { title: "A perk members can use", text: "Your offer listed in our member perks, with the number of members who open it counted for you." },
    { title: "A presence at our events", text: "Your name and product in front of guests at our events, with a thank-you from the host." },
    { title: "Results after", text: "A short report after the partnership: reach, attendance and perk opens, counted from our own records." },
  ],
  ask: [
    { title: "Product samples", text: "Samples for our members and guests to try, so they experience your brand first-hand." },
    { title: "In-person activations", text: "A table, tasting, demo or pop-up at our events, so guests can meet your brand face to face." },
  ],
};
export function cleanOffer(raw) {
  const out = {};
  for (const side of ["give", "ask"]) {
    out[side] = (Array.isArray(raw?.[side]) ? raw[side] : []).slice(0, 6).map((c) => ({ title: String(c?.title || "").trim().slice(0, 60), text: String(c?.text || "").trim().slice(0, 240) })).filter((c) => c.title);
  }
  return out;
}

export function buildReport(kind, m, community = "Your community", offer = null) {
  const meta = REPORT_TYPES.find((t) => t.kind === kind) || REPORT_TYPES[0];
  const period = (PERIODS.find((p) => p.days === m.days) || {}).label || `Last ${m.days} days`;
  const turnout = m.turnout_pct != null ? `${m.turnout_pct}%` : "n/a";
  const reach = { kind: "reach", title: "Reach", subtitle: `Who is in the community and who is taking part. ${period}.`,
    tiles: [tile("Members", m.members, "", true), tile("Active members", m.active, `${m.active_pct}% in last 30 days`), tile("New members", m.new_members, period.toLowerCase()), tile("Introductions made", m.intros_made, `${m.people_connected} people connected`)],
    charts: [{ type: "columns", title: "Active members per week", items: m.weekly }, { type: "columns", title: "New members per month", items: m.joins }], insights: insights(m).slice(0, 3) };
  const events = { kind: "events", title: "Events and turnout", subtitle: `What was held and who came. ${period}.`,
    tiles: [tile("Events held", m.events_held), tile("RSVPs", m.rsvps, `${m.avg_rsvp} per event`), tile("Checked in", m.checkin_events ? m.attended : "n/a", `${m.checkin_events} events with check-in`), tile("Turnout", turnout, "of those who signed up", true)],
    charts: [{ type: "table", title: "Recent events", columns: ["Event", "Date", "RSVPs", "Came"], rows: m.event_rows }], insights: [] };
  const perks = { kind: "perks", title: "Perks and offers", subtitle: `How members used what the community offers. ${period}.`,
    tiles: [tile("Perk opens", m.perk_opens, "", true), tile("Members who used a perk", m.perk_users), tile("Perks offered", m.perks_offered)],
    charts: [{ type: "hbar", title: "Most used perks", items: m.top_perks }], insights: [] };
  const connections = { kind: "connections", title: "Connections", subtitle: `Introductions and help between members. ${period}.`,
    tiles: [tile("Introductions asked for", m.intros_sent), tile("Led to a conversation", m.intros_made, "", true), tile("People connected", m.people_connected), tile("Help requests answered", m.sup_resolved)], charts: [], insights: [] };
  const health = { kind: "health", title: "Community health", subtitle: "Who is active, who is drifting, and what is next.",
    tiles: [tile("Active in 30 days", `${m.active_pct}%`, `${m.active} of ${m.members}`, true), tile("Going quiet", m.quiet, "nothing in 30+ days"), tile("Waiting to join", m.pending_apps, "applications"), tile("Upcoming events", m.upcoming)],
    charts: [{ type: "columns", title: "Active members per week", items: m.weekly }],
    insights: m.quiet ? [`${plural(m.quiet, "member")} ${m.quiet === 1 ? "has" : "have"} gone quiet. A short nudge from the team is the quickest way to bring people back.`] : ["Nobody has gone quiet."] };
  const served = { kind: "served", title: "People served", subtitle: `Reach and growth. ${period}.`,
    tiles: [tile("Members served", m.members, "", true), tile("Joined", m.new_members, period.toLowerCase()), tile("Took part in an event", m.event_goers), tile("Profiles complete", `${m.completeness}%`, "on average")],
    charts: [{ type: "columns", title: "New members per month", items: m.joins }], insights: insights(m).slice(0, 2) };
  const support = { kind: "support", title: "Help given", subtitle: `Requests members raised and how many were answered. ${period}.`,
    tiles: [tile("Help requests answered", m.sup_resolved, "", true), tile("Still open", m.sup_open), tile("Introductions made", m.intros_made)], charts: [], insights: [] };
  let sections;
  if (kind === "sponsor") {
    // a pitch, not a results report: who you would reach, proof they show up and act, what we do for you, what we ask in return
    Object.assign(reach, { title: "Who you would reach", subtitle: `The people in our community and how often they take part. ${period}.`, insights: insights(m) });
    Object.assign(events, { title: "People who show up", subtitle: `Events held and how many came. ${period}.` });
    Object.assign(perks, { title: "Members who act on offers", subtitle: `How members used what partners offered them. ${period}.` });
    const of = cleanOffer(offer || DEFAULT_OFFER);
    sections = [reach, events, perks];
    [["give", "What we do for you", "How we promote your brand."], ["ask", "What we ask in return", "Product samples and in-person activations for our guests."]].forEach(([k, title, subtitle]) => {
      if (of[k].length) sections.push({ kind: `offer_${k}`, title, subtitle, tiles: [], charts: [], insights: [], cards: of[k] });
    });
  }
  else if (kind === "funder") sections = [served, connections, events, support];
  else { const r2 = { ...reach, charts: [reach.charts[1]] }; sections = [health, r2, events, perks]; }
  return { type: kind, title: meta.title, audience: meta.audience, headline: meta.headline, community, generated_at: new Date().toISOString(), period_days: m.days, period_label: period, sections, sample: !!m.sample };
}


// ---- Instagram reach (the optional report section; real numbers come from backend/instagram.py) ----
export function sampleInstagram(seed = "sample") {
  const r = rng(hash("ig" + seed));
  const followers = 2400 + Math.round(r() * 7400);
  const reach = Math.round(followers * (2.2 + r() * 2.3));
  const split = (labels, weights) => labels.map((label, i) => ({ label, value: Math.round(followers * weights[i]) }));
  const caps = ["Founders mixer recap", "Meet our newest members", "Behind the scenes at Demo Day", "Perk spotlight: cloud credits", "Pitch night highlights"];
  const posts = caps.map((caption, i) => { const pr = Math.round(reach * (0.06 + r() * 0.14)); return { caption, kind: i % 2 ? "Post" : "Reel", reach: pr, likes: Math.round(pr * (0.04 + r() * 0.06)) }; }).sort((a, b) => b.reach - a.reach);
  return {
    sample: true, account: { username: "yourcommunity", followers },
    totals: { reach, views: Math.round(reach * (1.6 + r() * 0.8)), accounts_engaged: Math.round(reach * (0.04 + r() * 0.05)), profile_links_taps: Math.round(reach * (0.004 + r() * 0.008)) },
    audience: { country: split(["Canada", "United States", "United Kingdom", "Nigeria", "Jamaica"], [0.62, 0.17, 0.06, 0.05, 0.03]), city: split(["Toronto", "Mississauga", "Brampton", "Ottawa", "New York"], [0.34, 0.1, 0.06, 0.05, 0.04]),
      age: split(["18-24", "25-34", "35-44", "45-54", "55-64"], [0.22, 0.43, 0.2, 0.08, 0.03]), gender: split(["Women", "Men", "Not specified"], [0.57, 0.41, 0.02]) },
    top_posts: posts,
  };
}

const fmt = (v) => (typeof v === "number" ? v.toLocaleString("en-US") : "n/a");
export function instagramSection(snap) {
  const a = snap.account, t = snap.totals || {}, aud = snap.audience || {};
  const charts = [];
  if (aud.country?.length) charts.push({ type: "hbar", title: "Where the audience is", items: aud.country });
  if (aud.city?.length) charts.push({ type: "hbar", title: "Top cities", items: aud.city });
  if (aud.age?.length) charts.push({ type: "hbar", title: "Audience by age", items: aud.age });
  if (aud.gender?.length) charts.push({ type: "donut", title: "Audience by gender", items: aud.gender });
  if (snap.top_posts?.length) charts.push({ type: "table", title: "Best recent posts", columns: ["Post", "Type", "Reach", "Likes"], rows: snap.top_posts.map((p) => [p.caption, p.kind, fmt(p.reach), fmt(p.likes)]) });
  const insights = [];
  if (t.reach != null && a.followers) insights.push(`Content reached ${t.reach.toLocaleString("en-US")} accounts in the last 30 days, ${(t.reach / a.followers).toFixed(1)} times the follower count.`);
  if (t.reach && t.accounts_engaged != null) insights.push(`${t.accounts_engaged.toLocaleString("en-US")} accounts engaged with it (${pct(t.accounts_engaged, t.reach)}% of those reached).`);
  return { kind: "instagram", title: "Instagram reach", subtitle: `@${a.username}. Last 30 days. Reach counts accounts, not followers, and includes people who don't follow.`,
    tiles: [tile("Followers", fmt(a.followers), "", true), tile("Accounts reached", fmt(t.reach), "last 30 days"), tile("Views", fmt(t.views), "last 30 days"), tile("Accounts engaged", fmt(t.accounts_engaged)), tile("Profile link taps", fmt(t.profile_links_taps))],
    charts, insights };
}
/** Adds the Instagram section to a built report: straight after the headline numbers for a sponsor, at the end otherwise. */
export function withInstagram(report, snap) {
  if (!snap) return report;
  const secs = [...report.sections];
  secs.splice(report.type === "sponsor" ? 1 : secs.length, 0, instagramSection(snap));
  return { ...report, sections: secs };
}
