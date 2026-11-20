// Upcoming founder events inside the in-browser demo (no server): real listings with real links, ranked the same way the live site ranks them
// (province or online, what you asked for, the group you belong to).
import * as nav from "../lib/navigator";

const TOPIC_LABEL = { network: "Meet people", pitch: "Pitch", mentorship: "Mentors", funding: "Funding", workshop: "Learn", customers: "Customers" };
const TOPIC_NEED = { network: "network", pitch: "funding", mentorship: "mentorship", funding: "funding", workshop: "training", customers: "customers" };
const NEED_REASON = {
  network: "Good for meeting people, and you asked for a network.", mentorship: "Has mentors or advisors, and you asked for mentors.", funding: "Covers funding or investors, and you asked for funding.",
  customers: "Covers sales or customers, and you asked for first customers.", training: "A workshop or class, and you asked for training.",
};
const AUD = { black: "Black", women: "women", indigenous: "Indigenous", newcomer: "newcomer", youth: "young", student: "student" };

// Real listings, read from the organizers' own public pages on 2026-10-29. Dates are fixed, so past ones drop off the list by themselves.
const SAMPLES = [
  { n: "Startup Grind Toronto: Founder & Investor Mixer", date: "2026-11-04", t: "18:00", org: "Startup Grind Toronto", city: "Toronto", prov: "ON", topics: ["network", "funding"], price: "", url: "https://www.startupgrind.com/events/details/startup-grind-toronto-presents-startup-grind-toronto-founder-amp-investor-mixer/", s: "An in-person evening for founders and investors at The Flatiron, with food included." },
  { n: "AI Power Hours: Hiring your first 5 AI employees", date: "2026-11-04", t: "17:30", org: "Communitech", city: "Kitchener", prov: "ON", topics: ["workshop"], price: "", url: "https://luma.com/aipowerhoursnov4", s: "A one-hour session at the Communitech Hub on putting AI to work as your first hires." },
  { n: "Startup Pitch: 5 Founders on Stage", date: "2026-11-10", t: "19:00", org: "Ascent Valley", city: "Toronto", prov: "ON", topics: ["pitch", "network"], price: "", url: "https://ascentvalley.com/events/networking-event-startup-toronto-nov10", s: "Five founders pitch for five minutes each at Blood Brothers Brewing, then themed networking tables." },
  { n: "Pitch Night", date: "2026-11-19", t: "19:00", org: "Startup Valley", city: "Toronto", prov: "ON", topics: ["pitch", "network"], price: "paid", url: "https://startupvalley.club/events/toronto-2026-11-19", s: "Startup pitches and networking with investors at 229 Niagara St. Doors at 7 PM." },
  { n: "Marketing Without a Team: Build an AI Video Engine for Your Startup", date: "2026-11-19", t: "", org: "Startup Grind Toronto", city: "", prov: "", online: true, topics: ["workshop", "customers"], price: "free", url: "https://www.startupgrind.com/events/details/startup-grind-toronto-presents-marketing-without-a-team-build-an-ai-video-engine-for-your-startup/cohost-toronto", s: "A free online masterclass on making marketing video with AI when you have no team." },
  { n: "Startup Pitch: 5 Founders on Stage", date: "2026-11-24", t: "19:00", org: "Ascent Valley", city: "Toronto", prov: "ON", topics: ["pitch", "network"], price: "", url: "https://ascentvalley.com/events/networking-event-startup-toronto-nov24", s: "Five founders pitch for five minutes each at Blood Brothers Brewing, then themed networking tables." },
  { n: "Pitch Night", date: "2026-12-10", t: "19:00", org: "Startup Valley", city: "Toronto", prov: "ON", topics: ["pitch", "network"], price: "paid", url: "https://startupvalley.club/events/toronto-2026-12-10", s: "Startup pitches and networking with investors at Alternity. Doors at 7 PM." },
];


// Same extra reading as the live ranking (events_feed.py): what else an event is about, from its title and summary.
const NEED_REASON_MORE = {
  export: "About selling abroad, and you asked for help exporting.", rd: "About R&D and innovation funding, and you asked for R&D support.", ip: "Covers patents and IP, and you asked for IP help.",
  talent: "Covers hiring and team building, and you asked for help with talent.", tax: "Covers tax and accounting, and you asked for tax help.", legal: "Covers legal basics, and you asked for legal help.",
  visa: "Covers immigration for founders, and you asked for visa help.", tools: "Covers tools and software, and you asked for tools and discounts.", space: "About workspace, and you asked for a place to work.",
};
const NEED_WORDS = {
  export: /export|international (?:trade|expansion|markets?)|global markets?|canexport|trade mission|cross-border|selling abroad/i,
  rd: /\br&d\b|research and development|sr&ed|sred|irap|commerciali[sz]ation|deep ?tech|university research|lab to market/i,
  ip: /intellectual property|patents?\b|trademarks?|copyright|\bip (?:strategy|protection|basics)/i,
  talent: /\bhiring\b|recruit|talent|team building|co-?op students?|interns?\b|first hire|building your team/i,
  tax: /\btax(?:es)?\b|accounting|bookkeeping|\bcra\b|\bgst\b|\bhst\b/i,
  legal: /\blegal\b|lawyer|law firm|contracts?\b|incorporat|compliance|privacy law|shareholder|terms of service/i,
  visa: /\bvisa\b|immigration|work permit|start-?up visa|permanent residen/i,
  tools: /software|\btools\b|ai tools|automation|no-?code|cloud credits|\baws\b|google cloud|microsoft for startups/i,
  space: /co-?working|workspace|office space|maker ?space|lab space|desk space/i,
};
const SECTOR_WORDS = {
  tech: /\bai\b|artificial intelligence|machine learning|saas|software|deep ?tech|cyber|developers?\b|\bapi\b|fintech|blockchain/i,
  hardware: /hardware|robotics|manufactur|\biot\b|semiconductor|electronics|3d print/i,
  health: /health|med ?tech|biotech|clinical|life sciences?|pharma|wellness|patient/i,
  cleantech: /clean ?tech|climate|energy|sustainab|net[- ]zero|carbon|renewable|green ?tech/i,
  mobility: /mobility|transport|automotive|electric vehicles?|\bev\b|logistics|supply chain/i,
  creative: /creative|media\b|film|music|design\b|gaming|games\b|fashion|content creators?/i,
  retail: /retail|e-?commerce|consumer|\bdtc\b|shopify|direct[- ]to[- ]consumer/i,
  food: /\bfood\b|agri|restaurant|beverage|farm|grocery|cpg\b/i,
  services: /consulting|agency|professional services|freelanc/i,
  social: /social enterprise|non-?profit|social impact|charit|community impact/i,
};
const EARLY_WORDS = /idea[- ]stage|pre-?seed|early[- ]stage|first-?time founders?|aspiring (?:founders?|entrepreneurs?)|ideation|zero to one|0 to 1|startup (?:basics|101)|getting started|validate your idea|from idea/i;
const LATE_WORDS = /scale-?ups?|scaling up|growth[- ]stage|series [a-c]\b|late[- ]stage|going global|international expansion|exit strategy/i;
const joinList = (a) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);

function weekLabel(iso, today) {
  const t = new Date(today + "T12:00:00Z"); const d = new Date(iso + "T12:00:00Z");
  const start = new Date(t); start.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  const delta = Math.floor((d - start) / 86400000);
  return delta < 7 ? "This week" : delta < 14 ? "Next week" : d.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

function build(today) {
  const t0 = new Date(today + "T12:00:00Z");
  return SAMPLES.filter((x) => x.date >= today).map((x, i) => {
    const days = Math.round((new Date(x.date + "T12:00:00Z") - t0) / 86400000);
    const tm = x.t || "00:00";
    return { id: "real-" + i, title: x.n, date: x.date, time: x.t, start: `${x.date}T${tm}:00-05:00`, end: `${x.date}T${tm}:00-05:00`, url: x.url, summary: x.s, image: "",
      venue: "", city: x.city, province: x.prov, online: !!x.online, price: x.price, org: x.org, source_id: "real", source_name: x.org, priority: 3,
      topics: x.topics, audiences: x.aud || [], days_away: days, week: weekLabel(x.date, today), topic_labels: x.topics.map((t) => TOPIC_LABEL[t]) };
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
    const hay = `${e.title} ${e.summary} ${e.org}`.toLowerCase();
    const needHits = [...new Set([...e.topics.map((t) => TOPIC_NEED[t]).filter((n) => needs.includes(n)), ...Object.keys(NEED_WORDS).filter((n) => needs.includes(n) && NEED_WORDS[n].test(hay))])];
    needHits.forEach((n) => reasons.push(NEED_REASON[n] || NEED_REASON_MORE[n]));
    const sectorHits = (profile.sectors || []).filter((sec) => SECTOR_WORDS[sec] && SECTOR_WORDS[sec].test(hay));
    if (sectorHits.length) reasons.push(`About ${joinList(sectorHits)}, your sector.`);
    const early = EARLY_WORDS.test(hay); const late = !early && LATE_WORDS.test(hay);
    const aimed = early ? "early" : late ? "late" : ""; let stageFit = 0;
    if (aimed && raw && raw.stage) {
      const mineEarly = ["idea", "prototype"].includes(profile.stage); const mineLate = ["revenue", "growth"].includes(profile.stage);
      if ((aimed === "early" && mineEarly) || (aimed === "late" && mineLate)) { stageFit = 1; reasons.push("Pitched at founders at your stage."); }
      else if ((aimed === "early" && mineLate) || (aimed === "late" && mineEarly)) stageFit = -1;
    }
    if (!needHits.length && !sectorHits.length && e.topics.length) reasons.push(`Covers ${e.topics.map((t) => TOPIC_LABEL[t]).filter(Boolean).slice(0, 2).join(" and ").toLowerCase()}.`);
    if (e.price === "free") reasons.push("Free to attend.");
    if (needs.length && !needHits.length) cautions.push(`Not about what you asked for (${needs.slice(0, 3).map((n) => nav.NEED_LABEL[n]).join(", ")}). Worth it mainly for the people you would meet.`);
    if (stageFit < 0) cautions.push(`Pitched at ${aimed === "early" ? "first-time and early-stage founders" : "scale-ups and later-stage founders"}, and you are at the ${nav.STAGE_LABEL[profile.stage]} stage.`);
    if (e.price === "paid") cautions.push("Paid. Check the price and what it includes on the event page.");
    if (!(raw && raw.stage)) cautions.push("We do not know your startup yet, so this is a general match. Add it to see how well this fits.");
    if (!cautions.length) cautions.push("Details can change. Confirm the date, price and place on the event page.");
    const score = (hit.length ? 100000 : 0) + 10000 * Math.min(3, needHits.length) + (sectorHits.length ? 6000 : 0) + 4000 * stageFit + (e.online ? 500 : e.province === profile.province ? 1000 : 0) + (e.price === "free" ? 200 : 0);
    const row = { ...e, reasons: [...tailored, ...reasons], cautions, score, fit: hit.length || needHits.length || sectorHits.length ? "strong" : "possible" };
    if (!whereOk) others.push({ ...row, fit: "skip", cautions: [`In ${e.city || e.province}, outside your province (${profile.province}). Online events and events near you show first.`, ...cautions] });
    else if (miss.length && !hit.length) others.push({ ...row, fit: "skip", cautions: [`Made for ${miss.map((a) => nav.AUDIENCE_LABEL[a]).join(", ")} founders. Add your group in your profile if it applies.`, ...cautions] });
    else fits.push(row);
  }
  return { fits, others, profile };
}

export function eventsCall(method, path, params, ctx) {
  const { ok, fail, config } = ctx;
  const today = nav.todayIso();
  const a = ctx.account;
  if (path === "/founder-events" && method === "get") {
    const raw = (a && a.startup && Object.keys(a.startup).length) ? { ...a.startup, age: a.age ?? null } : {};
    const { fits, others, profile } = rank(build(today), raw, params || {});
    const best = raw && raw.stage ? fits.filter((r) => r.score >= 10000).sort((x, y) => (y.score - x.score) || x.start.localeCompare(y.start)).slice(0, 5).map((r) => r.id) : [];
    return ok(config, { best, profile: { province: profile.province, needs: profile.needs, audiences: profile.audiences }, events: fits, others, totals: { fit: fits.length, others: others.length, all: fits.length + others.length },
      as_of: today, signed_in: !!a, has_profile: !!(a && a.startup || {}).stage, updated_at: new Date().toISOString(), topics: Object.entries(TOPIC_LABEL).map(([key, label]) => ({ key, label })) });
  }
  if (path.startsWith("/founder-events/")) return fail(config, 403, "Only Pathwai administrators can see this.");
  return fail(config, 404, "Not found");
}
