// The "Yvettabetta Pilates" demo community: a Toronto Pilates brand (rooftop Saturdays with a themed
// playlist, Sunset Tuesdays by the water, corporate wellness, events and hosting). Branding, class
// formats and tone come from the studio's public site. Everyone in the roster is made up, and so are
// the perks, requests and attendance. Dates are generated relative to today so the demo never looks stale.
//
// Registered into the in-browser demo's recorded data by mock.js (see registerYvetta): it adds a hub card
// plus a full community "book" shaped like the recorded ones, built on the same blank-community skeleton
// that "Create a community" uses, so every page keeps working.

export const YVETTA_SLUG = "yvettabetta-pilates";
const SLUG = YVETTA_SLUG;
const MEMBER_EMAIL = "demo@yourcommunity.app";
const ADMIN_EMAIL = "admin@yourcommunity.app";
const ME = "u-yb-me";        // the member-demo persona
const YVETTE = "u-yb-yvette"; // the admin-demo persona (the studio owner)

// Brand: the site's cream ground, espresso brown ink, blush-rose and sand accents; Instrument Serif over Jost.
const COLORS = { accent: "#4A2B20", on_accent: "#F4EDE3", background: "#F4EDE3", surface: "#FAF5EE", text: "#4A2B20", muted: "#8A6552", border: "#E3D3C2" };
const BRAND = {
  preset: "custom", mode: "light", colors: COLORS, font: "Jost", heading_font: "Instrument Serif", heading_style: "uppercase",
  radius: "round", button_shape: "pill", logo_url: null, logo_mark_url: null, logo_adapts: true, show_name_with_logo: true,
  login_headline: "Every class has a theme.", login_subhead: "Every theme has a soundtrack. Find your class, your people and your next collab.",
  welcome_message: "Welcome to the roof. Here's what's on this season and who's moving with you.", footer_text: "Yvettabetta Pilates · Toronto", support_email: "",
};

// A soft blurred-circles cover, in the same style as the recorded communities' covers.
const cover = (bg, a, b) => "data:image/svg+xml;base64," + btoa(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240"><defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="38"/></filter></defs><rect width="400" height="240" fill="${bg}"/><g filter="url(#b)"><circle cx="330" cy="50" r="120" fill="${a}"/><circle cx="90" cy="210" r="100" fill="${b}" fill-opacity=".85"/><circle cx="220" cy="130" r="60" fill="${a}" fill-opacity=".8"/></g></svg>`);
const COVERS = {
  gold: cover("#F1DFC6", "#E5A94F", "#C98A8E"), rose: cover("#F3E1DC", "#C98A8E", "#E8B58F"), sand: cover("#EFE3D3", "#B8967E", "#E3C4A0"),
  dusk: cover("#EBD6D0", "#A5644F", "#C98A8E"), sage: cover("#E9E6D6", "#9AA37A", "#E3C4A0"), cocoa: cover("#E3D2C3", "#6B4535", "#C98A8E"),
};

// ---- time helpers (Toronto wall-clock → real instants, whatever time zone the viewer's browser is in) ----
const TZ = "America/Toronto";
const wallOffsetMin = (d) => { // Toronto wall clock minus UTC, in minutes (−240 in summer, −300 in winter)
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(d.getTime() / 1000) * 1000) / 60000);
};
// dayOffset days from today, at hour:min Toronto time
function at(dayOffset, hour, min = 0) {
  const base = new Date(Date.now() + dayOffset * 86400000);
  const [y, m, d] = base.toLocaleDateString("en-CA", { timeZone: TZ }).split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, hour, min);                 // the wall-clock time, read as if it were UTC
  return new Date(wall - wallOffsetMin(new Date(wall)) * 60000);  // shift by Toronto's offset to get the real instant
}
// days until the next given weekday (0=Sun … 6=Sat) in Toronto, never today
function until(dow) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ }).split("-").map(Number);
  const cur = new Date(Date.UTC(today[0], today[1] - 1, today[2])).getUTCDay();
  const n = (dow - cur + 7) % 7;
  return n === 0 ? 7 : n;
}
const iso = (d) => d.toISOString().replace(/\.\d+Z$/, "+00:00");
const ago = (days) => iso(new Date(Date.now() - days * 86400000));

// ---- the roster (all made up, except Yvette as the studio's owner/host) ----
// [id, name, member_type, title, company, location, bio, offers, interests, goals, needs, open_to]
const PEOPLE = [
  [YVETTE, "Yvette", "mentor", "Pilates instructor & event host", "Yvettabetta Pilates", "Toronto",
    "Certified Pilates instructor and the founder of Yvettabetta. It started as one rooftop class with a speaker and a handful of friends. I teach, host, plan the themes and pack the mats myself.",
    ["Pilates instruction", "Event hosting & MC", "Theme & playlist design", "Corporate wellness classes"], ["Amapiano", "Gospel", "Caribana", "Rooftops"],
    ["Add a third Saturday class", "Bring Pilates into more Toronto offices", "Partner with local brands"], ["Photo & content", "Venues & partnerships", "Playlist & music"], ["Collabs", "Brand partnerships"]],
  [ME, "Fife Ashley-Dejo", "founder", "Founder, Toronto Player League", "Toronto Player League", "Toronto",
    "Runs a wellness events community in Toronto. Always up for a collab, a themed morning or a good playlist.",
    ["Event hosting", "Community building", "Brand partnerships"], ["Padel", "Afrobeats", "Brunch"],
    ["Co-host a Pilates × padel social", "Grow a members' perks network"], ["Photo & content", "Playlist & music"], ["Collabs", "Introductions"]],
  ["u-yb-jordan", "Jordan Mensah", "founder", "DJ & producer", "Low Tide Sound", "Queen West",
    "I build sets around a theme, so a Caribana Saturday or an amapiano morning is right up my street. Happy to trade playlists for classes.",
    ["Playlist curation", "Live DJ sets", "Sound for events"], ["Amapiano", "Afrobeats", "House", "Vinyl digging"],
    ["Score a full season of class playlists", "Play a sunset set"], ["Photo & content", "Brand partnerships"], ["Collabs", "Playlist swaps"]],
  ["u-yb-keisha", "Keisha Williams", "founder", "Photographer & content creator", "Keisha W. Studio", "Bloor West",
    "Event and lifestyle photographer. I shoot the energy of a room, not just the poses. Class photos, reels and brand content.",
    ["Event photography", "Reels & short video", "Brand content"], ["Gospel", "Film cameras", "Trail walks"],
    ["Shoot every themed Saturday this season", "Build a wellness portfolio"], ["Wellness advice", "Introductions"], ["Photo trades", "Collabs"]],
  ["u-yb-amara", "Amara Osei", "founder", "Product designer", "Northline", "Liberty Village",
    "Designer by day, Saturday regular by choice. Trying to hold a 90-second plank without crying.",
    ["UX design", "Brand feedback"], ["Caribana", "Amapiano", "Pottery"],
    ["Hold a 90-second plank", "Make Saturdays a habit"], ["Wellness advice", "Accountability partner"], ["Feedback on my work"]],
  ["u-yb-priya", "Priya Raman", "founder", "People & culture lead", "Brightwell Agency", "King West",
    "I look after wellbeing for a 60-person agency. Looking for a monthly class my team will actually show up to.",
    ["Corporate wellness intros", "Team event planning"], ["Afrobeats", "Hiking", "Board games"],
    ["Book a monthly office class", "Make Wednesdays less sedentary"], ["Wellness programming for my team"], ["Introductions"]],
  ["u-yb-noah", "Noah Campbell", "partner", "Physiotherapist", "Campbell Physio", "Leslieville",
    "Physio and a Saturday regular. I'm happy to talk through niggles, return-to-movement plans and how to modify a move for your body.",
    ["Injury-aware cues", "Mobility advice", "Return-to-movement plans"], ["Running", "Gospel", "Cooking"],
    ["Refer more active clients", "Run a posture clinic on the roof"], ["Content", "Introductions"], ["Referrals", "Workshops"]],
  ["u-yb-zainab", "Zainab Hassan", "founder", "Event producer", "Roofline Events", "Downtown Toronto",
    "I find rooftops, sort permits and run the logistics so the vibe can be the only thing anyone remembers.",
    ["Venue sourcing", "Permits & logistics", "Sponsor intros"], ["Soca", "R&B", "Travel"],
    ["Host a brand night on a rooftop", "Add a sunset series for autumn"], ["Playlist & music", "Photo & content"], ["Collabs", "Partnerships"]],
  ["u-yb-dani", "Dani Rossi", "partner", "Café owner", "Golden Hour Coffee", "Queen West",
    "Our café is two minutes from the roof. Show your class pass and the first oat latte is on us.",
    ["Post-class coffee perk", "Pop-up space"], ["Latte art", "Cycling", "Amapiano"],
    ["Fill the café on Saturday mornings", "Pop up on the roof"], ["Event partners", "Foot traffic"], ["Pop-ups", "Partnerships"]],
  ["u-yb-tolu", "Tolu Adeyemi", "alumni", "Registered nurse", "Downtown hospital", "Etobicoke",
    "Night-shift nurse working on her posture. I come for the Gospel Saturdays and stay for the stretch at the end.",
    ["Wellness advice", "Sleep & recovery tips"], ["Gospel", "Afrobeats", "Baking"],
    ["Fix my posture after night shifts", "Bring a friend each month"], ["Accountability partner"], ["Class buddies"]],
  ["u-yb-maya", "Maya Chen", "founder", "Marketing manager", "Fieldnote", "The Annex",
    "Marketing by day. Currently trying to be a person who goes to every themed class this season.",
    ["Social media strategy", "Copywriting"], ["Caribana", "Rooftops", "Thrifting"],
    ["Try every themed class", "Meet more people outside work"], ["Wellness advice"], ["Class buddies", "Feedback"]],
  ["u-yb-lea", "Léa Tremblay", "founder", "Graphic designer", "Léa T. Design", "Little Portugal",
    "I make the posters: one for every theme, built to be screenshotted and sent to the group chat.",
    ["Poster design", "Brand identity"], ["Print", "Soul", "Gospel"],
    ["Design a poster for every theme", "Work with more wellness brands"], ["Photo & content", "Introductions"], ["Collabs"]],
  ["u-yb-marcus", "Marcus Lee", "mentor", "Personal trainer", "Lee Strength", "East York",
    "Strength coach who swears by Pilates for his clients. I'd love to run a strength × Pilates morning.",
    ["Strength programming", "Cross-training tips"], ["Powerlifting", "Highlife", "Football"],
    ["Co-host a strength × Pilates morning"], ["Introductions", "Venues & partnerships"], ["Collabs", "Referrals"]],
  ["u-yb-chidi", "Chidi Okafor", "partner", "Founder", "Cedar & Sage Sparkling", "Distillery District",
    "We make a zero-sugar sparkling water. Cold cans on the roof after class, for anyone who has earned one.",
    ["Product for events", "Sponsorship"], ["Cooking", "Running", "Afrobeats"],
    ["Get cans into more wellness events"], ["Event partners", "Photo & content"], ["Sponsorship", "Partnerships"]],
  ["u-yb-ines", "Ines Duarte", "mentor", "Yoga teacher & sound-bath host", "Quiet Hour", "Roncesvalles",
    "Breathwork and sound baths. A slower, softer cousin of a Pilates class.",
    ["Breathwork", "Sound baths"], ["Ambient music", "Swimming", "Tea"],
    ["Run a sunset sound bath"], ["Venues & partnerships"], ["Collabs", "Workshops"]],
  ["u-yb-sam", "Sam Patel", "founder", "Software developer", "Remote", "Midtown",
    "Absolute beginner. Told my friends I'd try one class. That was six Saturdays ago.",
    ["Spreadsheet help", "Website fixes"], ["Board games", "Amapiano", "Coffee"],
    ["Survive my first class", "Stand up straighter at my desk"], ["Beginner-friendly cues", "Class buddies"], ["Introductions"]],
];

// ---- classes & events ----
// [id, title, description, host id, host name, start, mins, location, category, capacity, attendee ids, tags, agenda, prep, cover, past]
const ROOF = "Rooftop · downtown Toronto (exact spot sent when you RSVP)";
const WATER = "By the water · Toronto waterfront (meeting point sent when you RSVP)";
const WEATHER = "If the weather turns, class moves to an indoor space downtown. A text goes out by 8 pm the night before.";
const BRING = "Water, sunscreen and a towel. Mats, bands and balls are provided.";
const crowd = (...ids) => [YVETTE, ...ids];
function eventDefs() {
  const sat = until(6), tue = until(2), thu = until(4), sun = until(0);
  return [
    ["yb-e1", "Caribana Saturday", "Rooftop Pilates set to soca, calypso and carnival classics. 50 minutes, every level, mats provided. Every class has its own poster: screenshot it and send it to the group chat.", YVETTE, "Yvette", at(sat, 10), 50, ROOF, "Rooftop Class", 30,
      crowd(ME, "u-yb-jordan", "u-yb-amara", "u-yb-maya", "u-yb-keisha", "u-yb-sam", "u-yb-tolu", "u-yb-noah"), ["caribana", "soca", "rooftop"], ["Arrive and grab a mat (10 min before)", "Warm-up to the playlist", "The work, with modifications for everyone", "Stretch, breathe, cold drinks"], `${BRING} ${WEATHER}`, "gold"],
    ["yb-e2", "Caribana Saturday · 11:30 class", "The second Caribana class of the morning, same playlist and same poster. A 1:00 pm class is added when both fill.", YVETTE, "Yvette", at(sat, 11, 30), 50, ROOF, "Rooftop Class", 30,
      crowd("u-yb-priya", "u-yb-zainab", "u-yb-lea", "u-yb-marcus"), ["caribana", "soca", "rooftop"], ["Arrive and grab a mat", "Warm-up", "The work", "Stretch and breathe"], `${BRING} ${WEATHER}`, "gold"],
    ["yb-e3", "Sunset Pilates · by the water", "Lower light, slower tempo, same community. 6:30 pm by the water, 50 minutes on the mat. A short run, so grab your spot while the light is still gold.", YVETTE, "Yvette", at(tue, 18, 30), 50, WATER, "Sunset Class", 24,
      crowd(ME, "u-yb-ines", "u-yb-tolu", "u-yb-dani"), ["sunset", "waterfront", "slow"], ["Arrive and settle in", "Slow warm-up", "Long, low-tempo flow", "Stretch while the light goes gold"], `Bring a layer for after. ${WEATHER}`, "dusk"],
    ["yb-e4", "Amapiano Saturday", "Log drums, a slow build and a roof full of people finding their core. Jordan's amapiano edit plays start to finish.", YVETTE, "Yvette", at(sat + 7, 10), 50, ROOF, "Rooftop Class", 30,
      crowd(ME, "u-yb-jordan", "u-yb-amara", "u-yb-lea", "u-yb-priya", "u-yb-sam"), ["amapiano", "rooftop", "playlist"], ["Arrive and grab a mat", "Warm-up", "The work", "Stretch and breathe"], `${BRING} ${WEATHER}`, "sage"],
    ["yb-e5", "Amapiano Saturday · 11:30 class", "Second amapiano class of the morning. First-timers get their own cues, and nobody gets left in a plank alone.", YVETTE, "Yvette", at(sat + 7, 11, 30), 50, ROOF, "Rooftop Class", 30,
      crowd("u-yb-maya", "u-yb-zainab", "u-yb-keisha"), ["amapiano", "rooftop", "beginner-friendly"], ["Arrive and grab a mat", "Warm-up", "The work", "Stretch and breathe"], `${BRING} ${WEATHER}`, "sage"],
    ["yb-e6", "Padel × Pilates social", "A morning of Pilates on the roof, then padel and brunch for anyone who fancies it. Co-hosted with Toronto Player League.", YVETTE, "Yvette", at(sun + 7, 11), 150, "Rooftop, then a padel court nearby", "Social", 40,
      crowd(ME, "u-yb-marcus", "u-yb-chidi", "u-yb-dani", "u-yb-zainab"), ["social", "padel", "brunch"], ["Pilates on the roof (50 min)", "Walk to the courts", "Padel round-robin", "Brunch"], "Wear something you can play padel in. Rackets provided.", "rose"],
    ["yb-e7", "Gospel Saturday", "A slower, soulful morning. Gospel throughout, a longer stretch at the end, and a few minutes of quiet before we go.", YVETTE, "Yvette", at(sat + 14, 10), 50, ROOF, "Rooftop Class", 30,
      crowd("u-yb-tolu", "u-yb-keisha", "u-yb-lea", "u-yb-noah", "u-yb-ines"), ["gospel", "rooftop", "slow"], ["Arrive and grab a mat", "Warm-up", "The work", "Long stretch and a quiet minute"], `${BRING} ${WEATHER}`, "cocoa"],
    ["yb-e8", "The 45-minute reset: open team class", "A taster of the corporate session: on-site Pilates built for desk bodies. Hips, shoulders, lower back, with modifications for the whole room. People & culture leads welcome.", YVETTE, "Yvette", at(thu + 7, 12, 15), 45, "A Toronto office (host to be confirmed)", "Corporate", 20,
      crowd("u-yb-priya", "u-yb-zainab"), ["corporate", "wellness", "team"], ["Set-up while you finish your call", "Warm-up for desk bodies", "The work, with modifications", "Stretch and back to your desk"], "Wear what you'd wear to the office. Mats, bands and music are brought for you.", "sand"],
    ["yb-e9", "Drake Saturday", "A full class to the 6ix's finest. Yes, there is a Hotline Bling cool-down.", YVETTE, "Yvette", at(sat + 21, 10), 50, ROOF, "Rooftop Class", 30,
      crowd(ME, "u-yb-jordan", "u-yb-amara", "u-yb-maya", "u-yb-sam"), ["drake", "rooftop", "playlist"], ["Arrive and grab a mat", "Warm-up", "The work", "Stretch and breathe"], `${BRING} ${WEATHER}`, "cocoa"],
    // recently finished
    ["yb-p1", "Gospel Saturday · last season", "The class everyone asked to run again. Soul-stirring playlist, quiet finish.", YVETTE, "Yvette", at(-9, 10), 50, ROOF, "Rooftop Class", 30,
      crowd("u-yb-tolu", "u-yb-keisha", "u-yb-lea", "u-yb-noah"), ["gospel", "rooftop"], ["Arrive and grab a mat", "Warm-up", "The work", "Stretch and breathe"], BRING, "cocoa", true],
    ["yb-p2", "Brand night: rooftop activation", "A launch-night class built around a brand's product moments, with content coverage and a toast at the end. Hosted and run by Yvette.", YVETTE, "Yvette", at(-16, 18), 120, "Rooftop · downtown Toronto", "Private Event", 60,
      crowd("u-yb-chidi", "u-yb-keisha", "u-yb-zainab", "u-yb-jordan"), ["brand", "activation", "hosting"], ["Doors", "Class", "Toast & content moments", "Mingle"], "Invite only.", "rose", true],
    ["yb-p3", "Sunset Pilates · season finale", "The last Tuesday by the water. We stayed for the lights.", YVETTE, "Yvette", at(-21, 18, 30), 50, WATER, "Sunset Class", 24,
      crowd(ME, "u-yb-ines", "u-yb-tolu", "u-yb-dani", "u-yb-sam"), ["sunset", "waterfront"], ["Arrive and settle in", "Slow flow", "Stretch while the light goes gold"], "Bring a layer for after.", "dusk", true],
  ];
}

export function buildYvetta(fixtures, { blank, clone, DEFAULT_CONFIG, REFERENCE_PUBLIC_KEYS }) {
  const tmplPublic = fixtures.communities.grace.public;
  const tmplMember = fixtures.communities.grace.logins[MEMBER_EMAIL];
  const tmplAdmin = fixtures.communities.grace.logins[ADMIN_EMAIL];
  const pm = fixtures.communities.playr.logins[MEMBER_EMAIL];
  const tUser = pm["/users"][3], tEvent = pm["/events"][0], tRes = pm["/resources"][0], tAnn = pm["/announcements"][0], tHelp = pm["/support-requests"][0];
  const now = new Date().toISOString();
  const byId = {};

  // ----- members -----
  const users = PEOPLE.map(([id, name, type, title, company, location, bio, offers, interests, goals, needs, openTo], i) => {
    const handle = name.toLowerCase().replace(/[^a-z]+/g, "");
    const u = {
      ...clone(tUser), id, name, role: id === YVETTE ? "admin" : type, member_type: type, age: null, height: null, avatar_url: null,
      title, company, location, bio, industry: null, stage: null, position: null, cohort: null,
      skill_set: offers, expertise: offers, interests_hobbies: interests, interests, goals, support_needs: needs, needs_seeking: needs, open_to: openTo,
      contact: { email: `${handle}@yvettabetta.example`, instagram: "@" + handle, ...(id === YVETTE ? { website: "https://yvettabettapilates.com" } : {}) },
      contact_visibility: "members", preferred_contact: "in-app messages",
      created_at: ago(120 - i * 6), updated_at: ago(i + 1), memberships_space_slugs: [SLUG], active_space_slug: null, header_stats: [], is_saved: false, save_count: 0,
    };
    byId[id] = u; return u;
  });

  // ----- events -----
  const nameOf = (id) => byId[id]?.name || "Member";
  const events = eventDefs().map(([id, title, description, host_id, host, start, mins, location, category, capacity, ids, tags, agenda, prep, art, past]) => {
    const end = new Date(start.getTime() + mins * 60000);
    const attendee_ids = [...new Set(ids)];
    return {
      ...clone(tEvent), id, title, description, host, host_id, starts_at: iso(start), ends_at: iso(end), location, is_virtual: false, cover_url: COVERS[art],
      source: "native", category, capacity, attendee_ids, recommended_for_roles: [], post_resource_ids: [], tags,
      rsvps: Object.fromEntries(attendee_ids.map((x) => [x, "yes"])), agenda, prep, space_slug: null, status: "approved", created_at: ago(30),
      currency: "cad", price_cents: null, ticket_tiers: [], tier_summary: { has_tiers: false },
      attendee_preview: attendee_ids.slice(0, 4).map((x) => ({ id: x, name: nameOf(x), avatar_url: null })),
      my_rsvp: null, attendee_count: attendee_ids.length, is_attending: false, is_past: !!past, is_saved: false, save_count: 0,
      attendees: attendee_ids.map((x) => ({ id: x, name: nameOf(x), avatar_url: null, title: byId[x]?.title || null, status: "yes" })),
      maybe_count: 0, attended: false, feedback_given: false, related_resources: [],
    };
  });
  const upcoming = events.filter((e) => !e.is_past).sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  // ----- perks & guides -----
  const resDefs = [
    ["yb-r1", "Free oat latte after any Saturday class", "Golden Hour Coffee is two minutes from the roof. Show your class pass and the first oat latte is on us.", "perk", "Discount", "Dani Rossi", "u-yb-dani", "Free latte", "Show your class pass at the counter on a Saturday morning.", ["coffee", "saturday", "perk"], true, "sand"],
    ["yb-r2", "Cold cans on the roof, on the house", "Cedar & Sage Sparkling brings a cooler to every themed Saturday. One can per member, zero sugar.", "perk", "Free access", "Chidi Okafor", "u-yb-chidi", "1 free can", "Find the cooler after class. Mention you're a Yvettabetta member.", ["drinks", "sponsor"], true, "sage"],
    ["yb-r3", "Posture check with a physio", "Noah runs a 20-minute posture and mobility check for Saturday regulars. Handy if a move never quite feels right.", "perk", "Free access", "Noah Campbell", "u-yb-noah", "Free 20 min", "Message Noah with a good day. Bring what you'd wear to class.", ["physio", "mobility"], true, "rose"],
    ["yb-r4", "Class photos: three edited shots", "Keisha shoots select Saturdays. Message her after class and she'll send three edited shots from your session.", "perk", "Free access", "Keisha Williams", "u-yb-keisha", "3 edited shots", "Tag Keisha in your story or message her the class date.", ["photos", "content"], false, "gold"],
    ["yb-r5", "The tracklist: every Saturday playlist", "All of this season's themed playlists in one place: Caribana, amapiano, gospel and Drake. Take them to your own Pilates at home.", "guide", "Insight", "Yvette", YVETTE, null, "Open the playlists and save the ones you like.", ["playlist", "music"], true, "dusk"],
    ["yb-r6", "Your first class: what to bring and what to expect", "A one-page guide for first-timers: how the 50 minutes run, how modifications work and why nobody gets left in a plank alone.", "guide", "Insight", "Yvette", YVETTE, null, "Read it before your first class, or send it to a friend who is nervous.", ["beginner", "guide"], false, "sand"],
    ["yb-r7", "Poster template: share your class", "Léa's poster template for sharing the week's theme with your group chat. Drop in the date and send it.", "template", "Template", "Léa Tremblay", "u-yb-lea", null, "Download, edit the date and share.", ["poster", "design", "template"], false, "rose"],
    ["yb-r8", "Intro for your team: the 45-minute reset", "People & culture leads: members get first call on corporate dates. On-site Pilates built for desk bodies, with equipment and music provided.", "perk", "Intro", "Yvette", YVETTE, "First call", "Message Yvette with your team size and the best day of the week.", ["corporate", "wellness", "team"], false, "cocoa"],
  ];
  const resources = resDefs.map(([id, title, description, type, category, author, authorId, value, claim, tags, featured, art], i) => ({
    ...clone(tRes), id, title, description, source: "community", type, category, format: type === "perk" ? "Perk" : type === "guide" ? "Guide" : "Template", author,
    shared_by: { id: authorId, name: author, avatar_url: null, title: byId[authorId]?.title || null }, perk_value: value, how_to_claim: claim, duration_min: null, cover_url: COVERS[art],
    tags, is_featured: featured, saved_by: [], published_at: ago(3 + i * 4), url: "https://example.com/yvettabetta/" + id, slug: id, external_url: "https://example.com/yvettabetta/" + id,
    cta_label: type === "perk" ? "Claim" : type === "guide" ? "Read" : "Get the template", difficulty: null, lesson_count: null, format_summary: value || category,
    learning_outcomes: [], prerequisites: [], last_updated: ago(2 + i), space_slug: null, status: "approved", submitted_by: null, submitted_by_name: null, is_saved: false, save_count: 0,
  }));

  // ----- news -----
  const annDefs = [
    ["yb-a1", "New dates drop on Monday", "One message when new dates go up, and nothing else. Saturdays run at 10:00 and 11:30 am, with a 1:00 pm class added when those fill.", "high", 1, "Book a class"],
    ["yb-a2", "Rain plan", "If the weather turns, class moves to an indoor space downtown. A text goes out by 8 pm the night before, so check your messages before you leave.", "normal", 4, null],
    ["yb-a3", "Brands and sponsors welcome", "Want your product in the room? Past partners have done tastings, giveaways and full brand nights. Message Yvette with the idea.", "normal", 9, "Message Yvette"],
    ["yb-a4", "Teams: book the 45-minute reset", "Corporate sessions run as drop-ins or a standing monthly slot, with mats, bands and music provided. Members get first call on dates.", "normal", 14, "Enquire"],
  ];
  const announcements = annDefs.map(([id, title, body, priority, d, cta]) => ({ ...clone(tAnn), id, title, body, source: "community", priority, author: "Yvette", published_at: ago(d), cta_label: cta, cta_url: cta ? "#" : null, space_slug: null, status: "approved", image_url: null }));

  // ----- help board -----
  const helpDefs = [
    ["yb-h1", "u-yb-zainab", "Photographer for the Drake Saturday", "I'm producing a small brand moment after class and need someone to cover it. Paid, or happy to trade for a month of classes.", "Photo & content", ["photography", "events"], "high", ["u-yb-keisha"], 2],
    ["yb-h2", YVETTE, "A DJ for a sunset set next season", "Looking for someone to play a slow, golden-hour set by the water. Ambient, soul and a little amapiano.", "Playlist & music", ["dj", "sunset"], "normal", ["u-yb-jordan", "u-yb-ines"], 3],
    ["yb-h3", "u-yb-amara", "Saturday accountability buddy?", "I keep skipping the 11:30 and need someone to hold me to it. Same class, coffee after.", "Introductions", ["buddy", "saturday"], "normal", ["u-yb-maya", "u-yb-sam"], 5],
  ];
  const help = helpDefs.map(([id, uid, title, description, category, tags, urgency, helpers, d]) => ({
    ...clone(tHelp), id, user_id: uid, user_snapshot: { id: uid, name: byId[uid].name, avatar_url: null, title: byId[uid].title, company: byId[uid].company }, space_slug: null,
    title, description, category, tags, urgency, image_url: null, status: "open", is_featured: false, helpers, created_at: ago(d), updated_at: ago(d), resolved_at: null, helper_count: helpers.length, i_offered: false,
  }));

  // ----- applications (admin) -----
  const apps = [
    ["u-yb-app-1", "Rhea Kapoor", "rhea.app-1@example.com", "Dentist", "Smile on Dundas", "I took my first class with a coworker and I'm hooked. I'd love to bring our whole front-of-house team.", ["Healthcare", "Team wellness"]],
    ["u-yb-app-2", "Tyrell Brown", "tyrell.app-2@example.com", "Barber & host", "Fresh Cuts", "I MC barbershop events and I think a Pilates collab could be a great fit. Keen to meet other hosts and brand people.", ["Hosting", "Community building"]],
  ].map(([id, name, email, title, company, join_reason, skills], i) => ({
    id, name, email, title, company, bio: join_reason, tagline: null, join_reason, avatar_url: null, location: "Toronto", age: null, status: "pending", requested_at: ago(i + 1),
    decided_at: null, decided_by_name: null, note: null, skill_set: skills, interests_hobbies: [], goals: [], support_needs: [], linkedin: null, phone: null, instagram: null, website: null,
  }));

  // ----- config -----
  const cfg = {
    ...clone(DEFAULT_CONFIG), community_name: "Yvettabetta Pilates", tagline: "Pilates with a playlist. Every class has a theme.",
    community_kind: "Wellness & events community", community_type: "social", member_label_singular: "Member", member_label_plural: "Members",
    about_url: "https://yvettabettapilates.com", about_cta: "Visit yvettabettapilates.com",
    about: "Rooftop Pilates in Toronto with a theme and a soundtrack for every class. A community of people who came for the workout and stayed for each other: instructors, DJs, designers, photographers, partners and regulars who trade skills and perks.",
    country: "Canada", interest_tags: ["Wellness", "Music"],
    member_types: { founder: "Member", mentor: "Instructor & host", alumni: "Regular", partner: "Partner", guest: "Guest" },
    event_types: ["Rooftop Class", "Sunset Class", "Social", "Corporate", "Private Event"],
    support_categories: ["Playlist & music", "Photo & content", "Venues & partnerships", "Wellness advice", "Corporate intros", "Introductions", "Other"],
    profile: { fields: [
      { key: "title", label: "What you do", enabled: true }, { key: "skill_set", label: "What you can offer", enabled: true },
      { key: "interests_hobbies", label: "Music & interests", enabled: true }, { key: "goals", label: "Movement goals", enabled: true }, { key: "support_needs", label: "Looking for", enabled: true },
    ] },
    signup_fields: [
      { key: "title", label: "What do you do?", type: "text", required: false }, { key: "skill_set", label: "What can you offer?", type: "tags", required: false },
      { key: "interests_hobbies", label: "Music & interests", type: "tags", required: false },
    ],
    apply_questions: [
      { key: "experience", label: "Have you done Pilates before?", placeholder: "Never, a few classes, years of reformer..." },
      { key: "theme", label: "Which theme would you book first?", placeholder: "Caribana, amapiano, gospel, Drake..." },
    ],
    page_text: {
      members_title: "Meet the crew", members_subtitle: "Instructors, DJs, designers, partners and regulars: what they do, what they offer and what they're looking for.",
      events_title: "This season", events_subtitle: "Rooftop Saturdays, Sunset Tuesdays, socials and team classes.",
      resources_title: "Perks & playlists", resources_subtitle: "Free lattes, cold cans, posture checks, the tracklist and more, shared by the crew.",
      support_title: "Help board", support_subtitle: "Need a DJ, a photographer or a class buddy? Ask here. Offer a hand when you can.",
      requests_title: "Your to-do", requests_subtitle: "Forms and updates the Yvettabetta team has asked you for.",
      matches_title: "People to meet", matches_subtitle: "Members, classes and perks picked for what you offer and what you're looking for.",
      updates_title: "Studio news", updates_subtitle: "New dates, rain plans and partner news from Yvette.",
      ask_title: "Ask Yvettabetta", ask_subtitle: "Find a class, a collaborator or someone to bring along.",
    },
    nav: [
      { key: "members", label: "Crew", enabled: true }, { key: "matches", label: "Matches", enabled: true }, { key: "events", label: "This Season", enabled: true },
      { key: "resources", label: "Perks", enabled: true }, { key: "updates", label: "News", enabled: true }, { key: "requests", label: "To-do", enabled: false },
      { key: "support", label: "Help", enabled: true }, { key: "inbox", label: "Messages", enabled: true },
    ],
    custom_links: [{ label: "Book a class", url: "https://yvettabettapilates.as.me" }],
    gallery_photos: [COVERS.gold, COVERS.dusk, COVERS.rose], theme: { preset: "custom", accent: COLORS.accent }, brand: clone(BRAND), setup_completed: true, updated_at: now,
  };

  // ----- people-matching copy for the member demo -----
  const reasonFor = (u, you) => `You're looking for ${you.join(" and ").toLowerCase()}, and ${u.name.split(" ")[0]} offers that.`;
  const match = (id, can, you) => {
    const u = byId[id];
    return { why: reasonFor(u, can), match_type: "Recommended connection", next_action: "Say hi", user: { id: u.id, name: u.name, avatar_url: null, role: u.role, title: u.title, company: u.company, industry: null, location: u.location, member_type: u.member_type },
      score: 6 + can.length, matched_on: can.map((x) => x.toLowerCase()), can_help_you: can, you_can_help: you };
  };
  const peopleForMe = [match("u-yb-keisha", ["Photo & content"], ["Event hosting"]), match("u-yb-jordan", ["Playlist & music"], ["Brand partnerships"]), match("u-yb-chidi", ["Event partners"], ["Event hosting"]), match("u-yb-zainab", ["Venues & partnerships"], ["Community building"])];
  const peopleForYvette = [match("u-yb-keisha", ["Photo & content"], ["Pilates instruction"]), match("u-yb-zainab", ["Venues & partnerships"], ["Event hosting & MC"]), match("u-yb-jordan", ["Playlist & music"], ["Theme & playlist design"]), match("u-yb-priya", ["Corporate wellness intros"], ["Corporate wellness classes"])];
  const evMatch = (e) => ({ ...clone(e), score: 5, matched_on: e.tags.slice(0, 2), why: `Matches what you're into: ${e.tags.slice(0, 2).join(", ")}`, match_type: "Recommended event", next_action: "RSVP", state: null });
  const resMatch = (r) => ({ ...clone(r), score: 4, matched_on: r.tags.slice(0, 2), why: `Relevant to: ${r.tags.slice(0, 2).join(", ")}`, match_type: "Member-to-perk", next_action: "View perk", state: null });

  // ----- per-login views (recorded-style keys on the blank skeleton) -----
  const completion = { percent: 89, missing: ["Photo"], missing_keys: ["avatar_url"], sections: { "About you": { done: 4, total: 5 }, "Skills & interests": { done: 2, total: 2 }, "Goals & support": { done: 2, total: 2 } } };
  const mk = (tmpl, meId, email, role, extra) => {
    const login = blank(tmpl);
    const me = { ...clone(byId[meId]), email, role, settings: { notifications: {} } };
    login["/auth/me"] = me;
    login["/me/profile-completion"] = clone(completion);
    login["/me/settings"] = { ...login["/me/settings"], account: { name: me.name, email, member_type: me.member_type } };
    login["/dashboard"] = {
      ...login["/dashboard"], me, community_name: "Yvettabetta Pilates", member_type: me.member_type,
      upcoming_events: clone(upcoming.slice(0, 4)), announcements: clone(announcements.slice(0, 3)), featured_resources: clone(resources.filter((r) => r.is_featured).slice(0, 4)),
      stats: { members: users.length, events: upcoming.length, open_requests: help.length }, profile_completion: clone(completion),
      widgets: ["upcoming_events", "support_requests", "smart_matches", "announcements", "resources"], support_requests_open: clone(help),
      new_members: [], membership_requests: [], membership_requests_total: 0, open_requests: [], my_rsvps: [], team_support: [], milestones: [], slack_signals: [], email_updates: [],
      unread_notifications: 0, pending_profile_requests: 0, ...extra.dash,
    };
    // Recorded-style lists and detail pages for this login (same keys the recorded communities have).
    const evs = events.map((e) => { const mine = e.attendee_ids.includes(meId); return { ...clone(e), my_rsvp: mine ? "yes" : null, is_attending: mine }; });
    login["/events"] = evs; login["/users"] = clone(users); login["/resources"] = clone(resources); login["/announcements"] = clone(announcements); login["/support-requests"] = clone(help);
    for (const e of evs) login[`/events/${e.id}`] = clone(e);
    for (const u of users) login[`/users/${u.id}`] = clone(u);
    login["/matches"] = { people: extra.people, events: clone(upcoming.slice(0, 3).map(evMatch)), resources: clone(resources.slice(0, 3).map(resMatch)), profile_hint: null };
    login["/me/memberships"] = { memberships: [] };
    return login;
  };
  const rsvpEvents = upcoming.filter((e) => e.attendee_ids.includes(ME));
  // (RSVP state per login is baked into each login's own event list below.)
  const memberLogin = mk(tmplMember, ME, MEMBER_EMAIL, "founder", {
    people: peopleForMe,
    dash: {
      recommended_people: clone(peopleForMe), smart_matches: clone(peopleForMe),
      my_rsvps: rsvpEvents.slice(0, 4).map((e) => ({ id: e.id, title: e.title, starts_at: e.starts_at, rsvp: "yes", prep: e.prep, cover_url: e.cover_url })),
      milestones: [{ id: upcoming[0].id, title: upcoming[0].title, starts_at: upcoming[0].starts_at }],
    },
  });
  const adminLogin = mk(tmplAdmin, YVETTE, ADMIN_EMAIL, "admin", {
    people: peopleForYvette,
    dash: { recommended_people: clone(peopleForYvette), smart_matches: clone(peopleForYvette),
      my_rsvps: upcoming.slice(0, 4).map((e) => ({ id: e.id, title: e.title, starts_at: e.starts_at, rsvp: "yes", prep: e.prep, cover_url: e.cover_url })),
      milestones: [{ id: upcoming[0].id, title: upcoming[0].title, starts_at: upcoming[0].starts_at }], membership_requests: clone(apps), membership_requests_total: apps.length, new_members: clone(users.slice(-3).map((u) => ({ id: u.id, name: u.name, title: u.title, avatar_url: null, created_at: u.created_at }))) },
  });
  adminLogin["/admin/overview"] = { members: users.length, events: events.length, resources: resources.length, open_support_requests: help.length, pending_applications: apps.length, invites: 0 };
  adminLogin["/admin/membership-requests"] = { requests: clone(apps), counts: { pending: apps.length, approved: 0, rejected: 0 } };
  adminLogin["/admin/action-center"] = { ...adminLogin["/admin/action-center"], pending_memberships: apps.length };

  // ----- the book -----
  const pub = blank(tmplPublic);
  for (const k of REFERENCE_PUBLIC_KEYS) pub[k] = clone(tmplPublic[k]);
  pub["/community/config"] = cfg;

  const book = {
    public: pub,
    logins: { [MEMBER_EMAIL]: memberLogin, [ADMIN_EMAIL]: adminLogin },
  };

  // ----- the hub card -----
  const hub = {
    ...clone(fixtures.hub.find((c) => c.slug === "playr")), slug: SLUG, name: "Yvettabetta Pilates", tagline: cfg.tagline, kind: "Wellness & events", about: cfg.about,
    cover: cover("#EAD9C6", "#C98A8E", "#E5A94F"), apply_questions: cfg.apply_questions, require_approval: true, members: users.length, upcoming_events: upcoming.length,
    country: "Canada", interest_tags: cfg.interest_tags, brand: clone(BRAND),
  };
  delete hub.my;
  return { book, hub };
}
