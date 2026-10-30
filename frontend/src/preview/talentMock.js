// The talent pool inside the in-browser demo (no server). Every person and startup here is invented sample data; the real site shows only people
// who chose to be listed. Ranked the same way the real one ranks: what you are looking for, your province, who is free now.
const CATEGORIES = [
  { key: "engineering", label: "Engineering", skills: ["Frontend", "Backend", "Full-stack", "Mobile (iOS/Android)", "DevOps and cloud", "Security", "QA and testing", "Hardware and embedded"] },
  { key: "data_ai", label: "Data and AI", skills: ["Machine learning", "Data analysis", "Data engineering", "AI products and prompts", "Analytics and BI"] },
  { key: "design", label: "Design", skills: ["Product design", "UX research", "Brand and identity", "Graphic design", "Motion and video", "Web design"] },
  { key: "product", label: "Product", skills: ["Product management", "Project management", "Technical writing", "Business analysis"] },
  { key: "marketing", label: "Marketing", skills: ["Growth marketing", "SEO and content", "Paid ads", "Social media", "Email and CRM", "PR and comms", "Brand strategy"] },
  { key: "sales", label: "Sales", skills: ["Outbound sales", "Enterprise sales", "Account management", "Partnerships", "Sales operations", "Business development"] },
  { key: "finance", label: "Finance and accounting", skills: ["Accounting", "Bookkeeping", "Tax", "SR&ED claims", "Fractional CFO", "Fundraising support", "Financial modelling", "Payroll"] },
  { key: "operations", label: "Operations", skills: ["Operations", "Supply chain", "Procurement", "Customer support", "Customer success", "Office and admin"] },
  { key: "legal", label: "Legal and compliance", skills: ["Corporate law", "Intellectual property", "Contracts", "Privacy and compliance", "Immigration"] },
  { key: "people", label: "People and HR", skills: ["Recruiting", "HR", "Coaching", "Training and facilitation"] },
  { key: "other", label: "Something else", skills: [] },
];
const OPTIONS = {
  categories: CATEGORIES,
  open_to: [["full_time", "Full-time"], ["part_time", "Part-time"], ["contract", "Contract or freelance"], ["co_founder", "Co-founding"], ["advising", "Advising"], ["internship", "Internship"]].map(([key, label]) => ({ key, label })),
  availability: [["now", "Available now"], ["soon", "Within a month"], ["exploring", "Just exploring"]].map(([key, label]) => ({ key, label })),
  work_mode: [["remote", "Remote"], ["hybrid", "Hybrid"], ["onsite", "On site"]].map(([key, label]) => ({ key, label })),
  experience: [["junior", "0 to 2 years"], ["mid", "3 to 5 years"], ["senior", "6 to 10 years"], ["lead", "10+ years"]].map(([key, label]) => ({ key, label })),
  provinces: ["ON", "BC", "AB", "SK", "MB", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"],
};

// Sample people get a tiny set of photos-free profile numbers so the profile pages look lived in.
const COUNTS = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 97; return { followers: 12 + h, following: 8 + (h % 40) }; };
const P = (id, name, headline, cats, skills, open, avail, mode, exp, prov, city, about) => ({ id: "tp-" + id, name, avatar_url: null, headline, about, categories: cats, skills, open_to: open, availability: avail, work_mode: mode, experience: exp, province: prov, city, company: "" });
const PEOPLE = [
  P("amara", "Amara Osei", "Full-stack developer, React and Python", ["engineering"], ["Full-stack", "Frontend", "Backend", "React", "Python"], ["contract", "full_time"], "now", ["remote", "hybrid"], "senior", "ON", "Toronto", "Eight years shipping web products for early-stage teams. Happy to do a first MVP or join as the first engineer."),
  P("daniel", "Daniel Tremblay", "Mobile engineer, iOS and Android", ["engineering"], ["Mobile (iOS/Android)", "Swift", "Kotlin"], ["contract", "part_time"], "soon", ["remote"], "senior", "QC", "Montréal", "Built three consumer apps from zero to the app stores."),
  P("priya", "Priya Raman", "Machine learning engineer for startups", ["data_ai", "engineering"], ["Machine learning", "Data engineering", "AI products and prompts"], ["contract", "advising"], "now", ["remote"], "senior", "ON", "Waterloo", "I help teams turn an AI idea into something that works in production and does not cost a fortune."),
  P("mateo", "Mateo Alvarez", "Growth marketer: SEO, content and paid", ["marketing"], ["Growth marketing", "SEO and content", "Paid ads"], ["contract", "part_time"], "now", ["remote", "hybrid"], "mid", "ON", "Toronto", "Took two B2B startups from zero to their first thousand leads."),
  P("hannah", "Hannah Whitehorse", "Brand and social media for founders", ["marketing", "design"], ["Brand strategy", "Social media", "Brand and identity"], ["contract", "full_time"], "soon", ["remote"], "mid", "AB", "Calgary", "Brand, voice and a content calendar you can actually keep up with."),
  P("jonas", "Jonas Lindqvist", "Enterprise sales lead, SaaS and cleantech", ["sales"], ["Enterprise sales", "Outbound sales", "Business development"], ["full_time", "advising", "co_founder"], "exploring", ["hybrid", "onsite"], "lead", "BC", "Vancouver", "Closed my first million in enterprise contracts and want to do it again with a team I believe in."),
  P("fatima", "Fatima Rahman", "Startup accountant and SR&ED specialist", ["finance"], ["Accounting", "Bookkeeping", "SR&ED claims", "Tax"], ["part_time", "contract"], "now", ["remote"], "senior", "ON", "Ottawa", "Clean books, tax filings and SR&ED claims so founders can focus on the product."),
  P("liam", "Liam O'Connor", "Fractional CFO for seed-stage companies", ["finance"], ["Fractional CFO", "Financial modelling", "Fundraising support"], ["advising", "part_time"], "soon", ["remote", "hybrid"], "lead", "NS", "Halifax", "Models, board packs and investor-ready numbers, a few days a month."),
  P("noor", "Noor Haddad", "Product designer, mobile and web", ["design"], ["Product design", "UX research", "Web design"], ["contract", "full_time"], "now", ["remote"], "senior", "ON", "Toronto", "From research to polished screens. I work well with small engineering teams."),
  P("chen", "Chen Wei", "Product manager, marketplaces and fintech", ["product"], ["Product management", "Business analysis"], ["full_time", "co_founder"], "soon", ["hybrid"], "senior", "BC", "Vancouver", "I like turning a messy idea into a clear first version."),
  P("sofia", "Sofia Marchetti", "Customer success and operations", ["operations"], ["Customer success", "Customer support", "Operations"], ["full_time", "part_time"], "now", ["remote", "hybrid"], "mid", "ON", "Mississauga", "I build the support and onboarding that keeps the first customers happy."),
  P("kwame", "Kwame Mensah", "Startup lawyer: corporate, IP and contracts", ["legal"], ["Corporate law", "Intellectual property", "Contracts"], ["advising", "contract"], "now", ["hybrid"], "lead", "ON", "Toronto", "Incorporations, shareholder agreements and IP, in plain language and at startup prices."),
  P("elise", "Élise Gagnon", "Recruiter for early-stage engineering teams", ["people"], ["Recruiting", "HR"], ["contract", "part_time"], "now", ["remote"], "senior", "QC", "Québec City", "I find your first five hires."),
  P("owen", "Owen Park", "DevOps and cloud for small teams", ["engineering"], ["DevOps and cloud", "Security", "Backend"], ["contract", "advising"], "soon", ["remote"], "senior", "MB", "Winnipeg", "Reliable deploys, sane cloud bills and security basics."),
  P("tessa", "Tessa Nguyen", "Junior front-end developer, looking for a first startup role", ["engineering"], ["Frontend", "React", "Web design"], ["full_time", "internship"], "now", ["remote", "hybrid"], "junior", "ON", "Toronto", "Recent bootcamp grad with two shipped side projects."),
];
const S = (id, name, one, stage, prov, city, hiring, note, founder) => ({ id: "ts-" + id, name, one_liner: one, stage, sectors: [], province: prov, city, employees: null, hiring_for: hiring, hiring_note: note, founder: { name: founder, avatar_url: null } });
const STARTUPS = [
  S("tidal", "Tidal Freight", "Route planning for small trucking fleets", "launched", "ON", "Toronto", ["engineering", "sales"], "Looking for a first backend engineer and someone to sell to fleets.", "Rahul Mehta"),
  S("bluepine", "Blue Pine Health", "Remote monitoring for chronic care clinics", "revenue", "BC", "Vancouver", ["marketing", "operations"], "Need a marketer who understands healthcare and a customer success lead.", "Dr. Ana Costa"),
  S("northfold", "Northfold", "Modular furniture for small apartments", "prototype", "AB", "Calgary", ["design", "finance"], "A product designer and a part-time bookkeeper.", "Marcus Bell"),
  S("lumen", "Lumen Learning", "AI tutoring for high-school math", "launched", "ON", "Waterloo", ["data_ai", "engineering", "marketing"], "Machine learning engineer and a growth marketer.", "Sana Qureshi"),
  S("maplepay", "MaplePay", "Payroll for very small businesses", "growth", "QC", "Montréal", ["sales", "legal"], "Account executives and a privacy and compliance advisor.", "Étienne Roy"),
];

let mine = null;
const blank = () => ({ listed: false, headline: "", about: "", categories: [], skills: [], open_to: [], availability: "", work_mode: [], experience: "", province: "", city: "", startup_listed: false, hiring_for: [], hiring_note: "" });
const complete = (t) => !!(t.headline && t.categories.length && t.open_to.length);
const label = (k) => (CATEGORIES.find((c) => c.key === k) || {}).label || k;

function rankPeople(cards, v, f) {
  const q = (f.q || "").toLowerCase();
  const out = [];
  for (const c of cards) {
    if (f.category && !c.categories.includes(f.category)) continue;
    if (f.skill && !c.skills.some((s) => s.toLowerCase() === f.skill.toLowerCase())) continue;
    if (f.open_to && !c.open_to.includes(f.open_to)) continue;
    if (f.province && c.province !== f.province && !c.work_mode.includes("remote")) continue;
    if (f.remote && !c.work_mode.includes("remote")) continue;
    if (f.available && !["now", "soon"].includes(c.availability)) continue;
    if (q && !`${c.name} ${c.headline} ${c.about} ${c.city} ${c.skills.join(" ")} ${c.categories.map(label).join(" ")}`.toLowerCase().includes(q)) continue;
    let score = 0; const reasons = [];
    for (const k of v.hiring_for.filter((k) => c.categories.includes(k))) { score += 6; reasons.push(`${label(k)}, which you are looking for.`); }
    if (v.province && c.province === v.province) { score += 3; reasons.push(`In ${c.city ? c.city + ", " : ""}${c.province}, your province.`); }
    else if (c.work_mode.includes("remote")) { score += 1; reasons.push("Works remotely, so location is not a barrier."); }
    if (c.availability === "now") { score += 2; reasons.push("Available now."); } else if (c.availability === "soon") score += 1;
    out.push({ ...c, reasons: reasons.slice(0, 3), score });
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
function rankStartups(cards, v, f) {
  const q = (f.q || "").toLowerCase();
  const out = [];
  for (const c of cards) {
    if (f.category && !c.hiring_for.includes(f.category)) continue;
    if (f.province && c.province !== f.province) continue;
    if (q && !`${c.name} ${c.one_liner} ${c.city} ${c.hiring_note}`.toLowerCase().includes(q)) continue;
    let score = 0; const reasons = [];
    for (const k of v.categories.filter((k) => c.hiring_for.includes(k))) { score += 6; reasons.push(`Looking for ${label(k).toLowerCase()}, which is what you do.`); }
    if (v.province && c.province === v.province) { score += 3; reasons.push(`In ${c.province}, your province.`); }
    out.push({ ...c, reasons: reasons.slice(0, 3), score });
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export function talentCall(method, path, body, params, ctx) {
  const { ok, fail, config } = ctx;
  const a = ctx.account;
  if (path === "/talent/options") return ok(config, OPTIONS);
  if (!a) return fail(config, 401, "Not authenticated");
  const st = a.startup || {};
  if (!mine) mine = blank();
  const meOut = () => ({ talent: mine, complete: complete(mine), has_startup: !!st.name, startup_name: st.name || "", defaults: { province: mine.province || st.province || "", city: mine.city || "" } });
  if (path === "/talent/me" && method === "get") return ok(config, meOut());
  if (path === "/talent/me" && method === "put") {
    const next = { ...mine, ...Object.fromEntries(Object.entries(body || {}).filter(([, v]) => v !== null && v !== undefined)) };
    next.skills = (next.skills || []).slice(0, 12); next.categories = (next.categories || []).slice(0, 4); next.hiring_for = (next.hiring_for || []).slice(0, 6);
    if (next.listed && !complete(next)) return fail(config, 400, "To be listed, add a headline, pick at least one area, and say what you are open to.");
    if (next.startup_listed && !st.name) return fail(config, 400, "Add your startup to your profile first, then you can show it to talent.");
    mine = next;
    return ok(config, meOut());
  }
  if (path === "/talent" && method === "get") {
    const v = { province: mine.province || st.province || "", hiring_for: mine.hiring_for, categories: mine.categories };
    const f = { q: params.q || "", category: params.category || "", skill: params.skill || "", open_to: params.open_to || "", province: (params.province || "").toUpperCase(), remote: params.remote === true || params.remote === "true", available: params.available === true || params.available === "true" };
    const people = rankPeople(PEOPLE, v, f); const startups = rankStartups(STARTUPS, v, f);
    const shown = params.kind === "startups" ? startups : people;
    return ok(config, { kind: params.kind === "startups" ? "startups" : "people", results: shown, total: shown.length, counts: { people: people.length, startups: startups.length },
      viewer: { province: v.province, hiring_for: v.hiring_for, needs_talent: (st.needs || []).includes("talent"), listed: !!mine.listed, startup_listed: !!mine.startup_listed, has_startup: !!st.name, complete: complete(mine) } });
  }
  const m = path.match(/^\/talent\/([^/]+)\/message$/);
  if (m && method === "post") {
    if (!PEOPLE.concat(STARTUPS).some((x) => x.id === m[1])) return fail(config, 404, "That person is not in the talent pool.");
    if (((body || {}).message || "").trim().length < 10) return fail(config, 400, "Say a little about why you are reaching out (at least a sentence).");
    return ok(config, { ok: true, thread_id: "demo-request", request: { state: "pending", from_email: "you", you_are_recipient: false, kind: "talent" } }, 201);
  }
  return fail(config, 404, "Not found");
}

// The few people shown on Home, ranked for this viewer.
export const talentPreview = () => PEOPLE.slice(0, 3);

const TP_PHOTOS = [];
const cardFor = (id) => {
  if (id.startsWith("tp-")) {
    const x = PEOPLE.find((y) => y.id === id); if (!x) return null;
    return { id: x.id, email: null, name: x.name, avatar_url: null, title: "", company: "", bio: x.about, photos: TP_PHOTOS, location: [x.city, x.province].filter(Boolean).join(", "), startup: null,
      talent: { headline: x.headline, about: x.about, categories: x.categories, skills: x.skills, open_to: x.open_to, availability: x.availability, work_mode: x.work_mode, experience: x.experience, province: x.province, city: x.city }, communities: [] };
  }
  const st = STARTUPS.find((y) => y.id === id); if (!st) return null;
  return { id: st.id, email: null, name: st.founder.name, avatar_url: null, title: "Founder", company: st.name, bio: "", photos: TP_PHOTOS, location: [st.city, st.province].filter(Boolean).join(", "), talent: null, startup: st, communities: [] };
};
// GET /hub/people/<sample id>, plus the shape used in the Following list.
export function sampleProfile(id, following) {
  const c = cardFor(id); if (!c) return null;
  const n = COUNTS(id);
  return { ...c, is_self: false, is_following: !!following, is_followed_by: false, followers: n.followers + (following ? 1 : 0), following: n.following };
}
export const sampleListCard = (id) => { const c = cardFor(id); return c && { id: c.id, email: null, name: c.name, avatar_url: null, title: c.title, company: c.company, photos: c.photos, location: c.location, talent: c.talent, startup: c.startup }; };
