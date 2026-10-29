// Upcoming founder events inside the in-browser demo (no server): invented sample events with dates counted from today, ranked the same way
// the real site ranks them (province or online, what you asked for, the group you belong to). Organizers here are fictional.
import * as nav from "../lib/navigator";

const TOPIC_LABEL = { network: "Meet people", pitch: "Pitch", mentorship: "Mentors", funding: "Funding", workshop: "Learn", customers: "Customers" };
const TOPIC_NEED = { network: "network", pitch: "funding", mentorship: "mentorship", funding: "funding", workshop: "training", customers: "customers" };
const NEED_REASON = {
  network: "Good for meeting people, and you asked for a network.", mentorship: "Has mentors or advisors, and you asked for mentors.", funding: "Covers funding or investors, and you asked for funding.",
  customers: "Covers sales or customers, and you asked for first customers.", training: "A workshop or class, and you asked for training.",
};
const AUD = { black: "Black", women: "women", indigenous: "Indigenous", newcomer: "newcomer", youth: "young", student: "student" };

const SAMPLES = [
  { n: "Harbourfront Founders Night", d: 1, t: "18:30", org: "Harbourfront Founders Club", city: "Toronto", prov: "ON", topics: ["network"], price: "free", s: "A relaxed evening for early-stage founders to swap introductions and what is working right now." },
  { n: "Seed Investor Fireside: What Funds Read First", d: 3, t: "17:00", org: "Northline Ventures", city: "Toronto", prov: "ON", topics: ["funding", "mentorship"], price: "free", s: "Two seed investors walk through the first five minutes of a deck and take questions." },
  { n: "Customer Discovery Workshop for First Sales", d: 5, t: "09:30", org: "Lakeshore Startup Network", city: "Toronto", prov: "ON", topics: ["customers", "workshop"], price: "paid", s: "A hands-on half day on finding and closing your first ten customers." },
  { n: "Black Founders Mixer", d: 6, t: "19:00", org: "Maple Mentor Collective", city: "Toronto", prov: "ON", topics: ["network"], price: "free", aud: ["black"], s: "An evening for Black founders and operators to meet peers and mentors." },
  { n: "Founder Office Hours: Pricing and Packaging", d: 8, t: "12:00", org: "Maple Mentor Collective", city: "", prov: "", online: true, topics: ["mentorship"], price: "free", s: "Book 20 minutes with an operator who has priced a marketplace product." },
  { n: "Startup Pitch Night", d: 9, t: "18:00", org: "Northline Ventures", city: "Mississauga", prov: "ON", topics: ["pitch", "funding"], price: "paid", s: "Five startups pitch to a room of angels. Tickets include a drink." },
  { n: "Women in Startups Breakfast", d: 11, t: "08:00", org: "Lakeshore Startup Network", city: "Toronto", prov: "ON", topics: ["network"], price: "free", aud: ["women"], s: "Breakfast and a panel on raising your first round." },
  { n: "Calgary Founders Pitch Showcase", d: 12, t: "18:00", org: "Prairie Startup Alliance", city: "Calgary", prov: "AB", topics: ["pitch"], price: "free", s: "Local founders pitch to a mixed panel of operators and investors." },
  { n: "Selling to Government: A Founder Webinar", d: 14, t: "13:00", org: "Harbourfront Founders Club", city: "", prov: "", online: true, topics: ["customers", "workshop"], price: "free", s: "How to find tenders and what buyers look for from small suppliers." },
  { n: "Cleantech Founders Roundtable", d: 18, t: "17:30", org: "Lakeshore Startup Network", city: "Toronto", prov: "ON", topics: ["network", "mentorship"], price: "free", s: "A small, closed-door roundtable for founders building in cleantech." },
  { n: "Newcomer Founders Meetup", d: 21, t: "18:00", org: "Maple Mentor Collective", city: "Toronto", prov: "ON", topics: ["network"], price: "free", aud: ["newcomer"], s: "Meet other founders who started their company after moving to Canada." },
  { n: "Vancouver Seed Stage Mixer", d: 23, t: "18:30", org: "Pacific Founders Circle", city: "Vancouver", prov: "BC", topics: ["network", "funding"], price: "paid", s: "An evening with seed-stage founders and local angels." },
  { n: "Intro to IP for Founders", d: 27, t: "12:00", org: "Northline Ventures", city: "", prov: "", online: true, topics: ["workshop"], price: "free", s: "What to protect, when, and what it costs, in 45 minutes." },
];

function weekLabel(iso, today) {
  const t = new Date(today + "T12:00:00Z"); const d = new Date(iso + "T12:00:00Z");
  const start = new Date(t); start.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  const delta = Math.floor((d - start) / 86400000);
  return delta < 7 ? "This week" : delta < 14 ? "Next week" : d.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

function build(today) {
  const base = new Date(today + "T12:00:00Z");
  return SAMPLES.map((x, i) => {
    const d = new Date(base); d.setUTCDate(d.getUTCDate() + x.d);
    const date = d.toISOString().slice(0, 10);
    return { id: "sample-" + i, title: x.n, date, time: x.t, start: `${date}T${x.t}:00-04:00`, end: `${date}T${x.t}:00-04:00`, url: "https://example.com/sample-event/" + (i + 1), summary: x.s, image: "",
      venue: x.online ? "" : "", city: x.city, province: x.prov, online: !!x.online, price: x.price, org: x.org, source_id: "sample", source_name: "Sample", priority: 3,
      topics: x.topics, audiences: x.aud || [], days_away: x.d, week: weekLabel(date, today), topic_labels: x.topics.map((t) => TOPIC_LABEL[t]) };
  });
}

function rank(events, raw, f) {
  const profile = nav.normalizeProfile(raw);
  const needs = profile.needs || [];
  const q = (f.q || "").toLowerCase();
  const fits = []; const others = [];
  for (const e of events) {
    if (q && !`${e.title} ${e.org} ${e.city} ${e.summary}`.toLowerCase().includes(q)) continue;
    if (f.online === "true" && !e.online) continue;
    if (f.free === "true" && e.price !== "free") continue;
    if (f.topic && !e.topics.includes(f.topic)) continue;
    const reasons = []; const cautions = [];
    const whereOk = e.online || e.province === profile.province || !e.province;
    if (e.online) reasons.push("Online, so you can join from anywhere.");
    else if (e.province === profile.province) reasons.push(`In ${e.city || e.province}, in your province (${profile.province}).`);
    const hit = e.audiences.filter((a) => profile.audiences.includes(a)); const miss = e.audiences.filter((a) => !profile.audiences.includes(a));
    const tailored = hit.length ? [`Made for ${hit.map((a) => nav.AUDIENCE_LABEL[a]).join(", ")} founders, which you are.`] : [];
    const needHits = [...new Set(e.topics.map((t) => TOPIC_NEED[t]).filter((n) => needs.includes(n)))];
    needHits.forEach((n) => reasons.push(NEED_REASON[n]));
    const row = { ...e, reasons: [...tailored, ...reasons], cautions, fit: hit.length || needHits.length ? "strong" : "possible" };
    if (!whereOk) others.push({ ...row, fit: "skip", reasons: [], cautions: [`In ${e.city || e.province}, outside your province (${profile.province}). Online events and events near you show first.`] });
    else if (miss.length && !hit.length) others.push({ ...row, fit: "skip", reasons: [], cautions: [`Made for ${miss.map((a) => nav.AUDIENCE_LABEL[a]).join(", ")} founders. Add your group in your profile if it applies.`] });
    else fits.push(row);
  }
  return { fits, others, profile };
}

export function eventsCall(method, path, params, ctx) {
  const { ok, fail, config } = ctx;
  const today = nav.todayIso();
  const a = ctx.account;
  if (path === "/founder-events" && method === "get") {
    if (!a) return fail(config, 401, "Not authenticated");
    const raw = (a.startup && Object.keys(a.startup).length) ? { ...a.startup, age: a.age ?? null } : {};
    const { fits, others, profile } = rank(build(today), raw, params || {});
    return ok(config, { profile: { province: profile.province, needs: profile.needs, audiences: profile.audiences }, events: fits, others, totals: { fit: fits.length, others: others.length, all: fits.length + others.length },
      as_of: today, signed_in: true, has_profile: !!(a.startup || {}).stage, updated_at: new Date().toISOString(), topics: Object.entries(TOPIC_LABEL).map(([key, label]) => ({ key, label })) });
  }
  if (path.startsWith("/founder-events/")) return fail(config, 403, "Only Pathwai administrators can see this.");
  return fail(config, 404, "Not found");
}
