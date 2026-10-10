// A small builder for hand-made demo communities (Hyrox, Humber, ...). It does what yvetta.js does for the
// Yvettabetta Pilates demo, but takes the people, events, perks, news and help-board posts as plain data so a new
// community is just a spec file. It registers into the in-browser demo's recorded data (see mock.js) and builds on
// the same blank-community skeleton that "Create a community" uses, so every page keeps working.
// Everyone in a roster is made up. Dates are generated relative to today so the demo never looks stale.

export const MEMBER_EMAIL = "demo@yourcommunity.app";
export const ADMIN_EMAIL = "admin@yourcommunity.app";

// A soft blurred-circles cover, in the same style as the recorded communities' covers.
export const cover = (bg, a, b) => "data:image/svg+xml;base64," + btoa(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240"><defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="38"/></filter></defs><rect width="400" height="240" fill="${bg}"/><circle cx="110" cy="80" r="90" fill="${a}" filter="url(#b)"/><circle cx="310" cy="170" r="100" fill="${b}" filter="url(#b)"/></svg>`);

// ---- time helpers (Toronto wall-clock → real instants, whatever time zone the viewer's browser is in) ----
const TZ = "America/Toronto";
const wallOffsetMin = (d) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(d.getTime() / 1000) * 1000) / 60000);
};
/** dayOffset days from today, at hour:min Toronto time */
export function at(dayOffset, hour, min = 0) {
  const base = new Date(Date.now() + dayOffset * 86400000);
  const [y, m, d] = base.toLocaleDateString("en-CA", { timeZone: TZ }).split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, hour, min);
  return new Date(wall - wallOffsetMin(new Date(wall)) * 60000);
}
/** days until the next given weekday (0=Sun … 6=Sat) in Toronto, never today */
export function until(dow) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ }).split("-").map(Number);
  const cur = new Date(Date.UTC(today[0], today[1] - 1, today[2])).getUTCDay();
  const n = (dow - cur + 7) % 7;
  return n === 0 ? 7 : n;
}
export const iso = (d) => d.toISOString().replace(/\.\d+Z$/, "+00:00");
export const ago = (days) => iso(new Date(Date.now() - days * 86400000));

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * spec: {
 *   slug, prefix, name, tagline, hubKind, hubCover, covers: {name: dataUri}, brand, emailDomain, memberId, adminId,
 *   people: [[id, name, type, title, company, location, bio, offers, interests, goals, needs, openTo, extra?]],
 *   events: ({ at, until }) => [[id, title, description, hostId, hostName, start, mins, location, category, capacity, attendeeIds, tags, agenda, prep, coverKey, past]],
 *   resources: [[id, title, description, type, category, author, authorId, value, claim, tags, featured, coverKey]],
 *   announcements: [[id, title, body, priority, daysAgo, cta]], authorName,
 *   help: [[id, userId, title, description, category, tags, urgency, helperIds, daysAgo]],
 *   apps: [[id, name, email, title, company, joinReason, skills]],
 *   config: {...overrides}, matches: { member: [[id, can, you]], admin: [[id, can, you]] }, completion,
 * }
 */
export function buildDemo(fixtures, { blank, clone, DEFAULT_CONFIG, REFERENCE_PUBLIC_KEYS }, spec) {
  const { slug: SLUG, prefix, name: NAME, covers: COVERS, brand: BRAND } = spec;
  const ME = spec.memberId, HOST = spec.adminId;
  const tmplPublic = fixtures.communities.grace.public;
  const tmplMember = fixtures.communities.grace.logins[MEMBER_EMAIL];
  const tmplAdmin = fixtures.communities.grace.logins[ADMIN_EMAIL];
  const pm = fixtures.communities.playr.logins[MEMBER_EMAIL];
  const tUser = pm["/users"][3], tEvent = pm["/events"][0], tRes = pm["/resources"][0], tAnn = pm["/announcements"][0], tHelp = pm["/support-requests"][0];
  const now = new Date().toISOString();
  const byId = {};

  // ----- members -----
  const users = spec.people.map(([id, name, type, title, company, location, bio, offers, interests, goals, needs, openTo, extra], i) => {
    const handle = name.toLowerCase().replace(/[^a-z]+/g, "");
    const u = {
      ...clone(tUser), id, name, role: id === HOST ? "admin" : type, member_type: type, age: null, height: null, avatar_url: null,
      title, company, location, bio, industry: null, stage: null, position: null, cohort: null,
      skill_set: offers, expertise: offers, interests_hobbies: interests, interests, goals, support_needs: needs, needs_seeking: needs, open_to: openTo,
      contact: { email: `${handle}@${spec.emailDomain}`, ...(spec.instagram === false ? {} : { instagram: "@" + handle }) },
      contact_visibility: "members", preferred_contact: "in-app messages",
      created_at: ago(140 - i * 5), updated_at: ago((i % 9) + 1), memberships_space_slugs: [SLUG], active_space_slug: null, header_stats: [], is_saved: false, save_count: 0,
      ...(extra || {}),
    };
    if (extra?.contact) u.contact = { ...u.contact, ...extra.contact };
    byId[id] = u; return u;
  });
  const nameOf = (id) => byId[id]?.name || "Member";

  // ----- events -----
  const events = spec.events({ at, until }).map(([id, title, description, host_id, host, start, mins, location, category, capacity, ids, tags, agenda, prep, art, past]) => {
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
  events.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const upcoming = events.filter((e) => !e.is_past).sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  // ----- perks & guides -----
  const resources = spec.resources.map(([id, title, description, type, category, author, authorId, value, claim, tags, featured, art], i) => ({
    ...clone(tRes), id, title, description, source: "community", type, category, format: type === "perk" ? "Perk" : type === "guide" ? "Guide" : cap(type), author,
    shared_by: { id: authorId, name: author, avatar_url: null, title: byId[authorId]?.title || null }, perk_value: value, how_to_claim: claim, duration_min: null, cover_url: COVERS[art],
    tags, is_featured: featured, saved_by: [], published_at: ago(3 + i * 4), url: `https://example.com/${SLUG}/${id}`, slug: id, external_url: `https://example.com/${SLUG}/${id}`,
    cta_label: type === "perk" ? "Claim" : type === "guide" ? "Read" : "Open", difficulty: null, lesson_count: null, format_summary: value || category,
    learning_outcomes: [], prerequisites: [], last_updated: ago(2 + i), space_slug: null, status: "approved", submitted_by: null, submitted_by_name: null, is_saved: false, save_count: 0,
  }));

  // ----- news -----
  const announcements = spec.announcements.map(([id, title, body, priority, d, ctaLabel]) => ({ ...clone(tAnn), id, title, body, source: "community", priority, author: spec.authorName, author_profile: { id: HOST, name: spec.authorName, avatar_url: null, title: byId[HOST]?.title || null }, published_at: ago(d), cta_label: ctaLabel, cta_url: ctaLabel ? "#" : null, space_slug: null, status: "approved", image_url: null }));

  // ----- help board -----
  const help = spec.help.map(([id, uid, title, description, category, tags, urgency, helpers, d]) => ({
    ...clone(tHelp), id, user_id: uid, user_snapshot: { id: uid, name: byId[uid].name, avatar_url: null, title: byId[uid].title, company: byId[uid].company }, space_slug: null,
    title, description, category, tags, urgency, image_url: null, status: "open", is_featured: false, helpers, created_at: ago(d), updated_at: ago(d), resolved_at: null, helper_count: helpers.length, i_offered: false,
  }));

  // ----- applications (admin) -----
  const apps = spec.apps.map(([id, name, email, title, company, join_reason, skills], i) => ({
    id, name, email, title, company, bio: join_reason, tagline: null, join_reason, avatar_url: null, location: "Toronto", age: null, status: "pending", requested_at: ago(i + 1),
    decided_at: null, decided_by_name: null, note: null, skill_set: skills, interests_hobbies: [], goals: [], support_needs: [], linkedin: null, phone: null, instagram: null, website: null,
  }));

  // ----- config -----
  const cfg = {
    ...clone(DEFAULT_CONFIG), community_name: NAME, tagline: spec.tagline, country: "Canada",
    member_label_singular: "Member", member_label_plural: "Members",
    gallery_photos: Object.values(COVERS).slice(0, 4), theme: { preset: "custom", accent: BRAND.colors.accent }, brand: clone(BRAND), setup_completed: true, updated_at: now,
    ...clone(spec.config),
  };

  // ----- people-matching copy -----
  const match = (viewerId, id, can, you) => {
    const u = byId[id], me = byId[viewerId];
    const mine = new Set((me.interests_hobbies || []).map((x) => x.toLowerCase()));
    const shared = (u.interests_hobbies || []).filter((x) => mine.has(x.toLowerCase()));
    const reasons = [];
    if (can.length) reasons.push({ kind: "helps_you", label: "Can help you with", items: can.slice(0, 4).map(cap) });
    if (you.length) reasons.push({ kind: "you_help", label: "You can help them with", items: you.slice(0, 4).map(cap) });
    if (shared.length) reasons.push({ kind: "shared", label: "You both like", items: shared.slice(0, 4) });
    const headline = reasons.slice(0, 2).map((x) => `${x.kind === "you_help" ? "You can help with" : x.label} ${x.items.slice(0, 2).join(" and ")}`).join(" · ");
    return {
      why: headline, headline, reasons, shared_interests: shared, match_type: "Recommended connection", next_action: "Say hi",
      user: { id: u.id, name: u.name, avatar_url: null, role: u.role, title: u.title, company: u.company, industry: null, location: u.location, member_type: u.member_type },
      score: 6 + can.length + you.length, matched_on: can.map((x) => x.toLowerCase()), can_help_you: can, you_can_help: you,
    };
  };
  const peopleForMe = spec.matches.member.map(([id, can, you]) => match(ME, id, can, you));
  const peopleForHost = spec.matches.admin.map(([id, can, you]) => match(HOST, id, can, you));
  const evMatch = (e) => ({ ...clone(e), score: 5, matched_on: e.tags.slice(0, 2), why: `Matches what you're into: ${e.tags.slice(0, 2).join(", ")}`, match_type: "Recommended event", next_action: "RSVP", state: null });
  const resMatch = (r) => ({ ...clone(r), score: 4, matched_on: r.tags.slice(0, 2), why: `Relevant to: ${r.tags.slice(0, 2).join(", ")}`, match_type: "Member-to-perk", next_action: "View perk", state: null });

  // ----- per-login views -----
  const completion = spec.completion || { percent: 89, missing: ["Photo"], missing_keys: ["avatar_url"], sections: { "About you": { done: 4, total: 5 }, "Skills & interests": { done: 2, total: 2 }, "Goals & support": { done: 2, total: 2 } } };
  const mk = (tmpl, meId, email, role, extra) => {
    const login = blank(tmpl);
    const me = { ...clone(byId[meId]), email, role, settings: { notifications: {} } };
    login["/auth/me"] = me;
    login["/me/profile-completion"] = clone(completion);
    login["/me/settings"] = { ...login["/me/settings"], account: { name: me.name, email, member_type: me.member_type } };
    login["/dashboard"] = {
      ...login["/dashboard"], me, community_name: NAME, member_type: me.member_type,
      upcoming_events: clone(upcoming.slice(0, 4)), announcements: clone(announcements.slice(0, 3)), featured_resources: clone(resources.filter((r) => r.is_featured).slice(0, 4)),
      stats: { members: users.length, events: upcoming.length, open_requests: help.length }, profile_completion: clone(completion),
      widgets: ["upcoming_events", "support_requests", "smart_matches", "announcements", "resources"], support_requests_open: clone(help),
      new_members: [], membership_requests: [], membership_requests_total: 0, open_requests: [], my_rsvps: [], team_support: [], milestones: [], slack_signals: [], email_updates: [],
      unread_notifications: 0, pending_profile_requests: 0, ...extra.dash,
    };
    const evs = events.map((e) => { const mine = e.attendee_ids.includes(meId); return { ...clone(e), my_rsvp: mine ? "yes" : null, is_attending: mine }; });
    login["/events"] = evs; login["/users"] = clone(users); login["/resources"] = clone(resources); login["/announcements"] = clone(announcements); login["/support-requests"] = clone(help);
    for (const e of evs) login[`/events/${e.id}`] = clone(e);
    for (const u of users) login[`/users/${u.id}`] = clone(u);
    login["/matches"] = { people: extra.people, events: clone(upcoming.slice(0, 3).map(evMatch)), resources: clone(resources.slice(0, 3).map(resMatch)), profile_hint: null };
    login["/me/memberships"] = { memberships: [] };
    return login;
  };
  const rsvpEvents = upcoming.filter((e) => e.attendee_ids.includes(ME));
  const newest = clone(users.slice(-3).map((u) => ({ id: u.id, name: u.name, title: u.title, avatar_url: null, created_at: u.created_at })));
  const memberLogin = mk(tmplMember, ME, MEMBER_EMAIL, byId[ME].member_type, {
    people: peopleForMe,
    dash: {
      recommended_people: clone(peopleForMe), smart_matches: clone(peopleForMe), new_members: clone(newest),
      my_rsvps: rsvpEvents.slice(0, 4).map((e) => ({ id: e.id, title: e.title, starts_at: e.starts_at, rsvp: "yes", prep: e.prep, cover_url: e.cover_url })),
      milestones: [{ id: upcoming[0].id, title: upcoming[0].title, starts_at: upcoming[0].starts_at }],
    },
  });
  const adminLogin = mk(tmplAdmin, HOST, ADMIN_EMAIL, "admin", {
    people: peopleForHost,
    dash: {
      recommended_people: clone(peopleForHost), smart_matches: clone(peopleForHost),
      my_rsvps: upcoming.slice(0, 4).map((e) => ({ id: e.id, title: e.title, starts_at: e.starts_at, rsvp: "yes", prep: e.prep, cover_url: e.cover_url })),
      milestones: [{ id: upcoming[0].id, title: upcoming[0].title, starts_at: upcoming[0].starts_at }], membership_requests: clone(apps), membership_requests_total: apps.length, new_members: clone(newest),
    },
  });
  adminLogin["/admin/overview"] = { members: users.length, events: events.length, resources: resources.length, open_support_requests: help.length, pending_applications: apps.length, invites: 0 };
  adminLogin["/admin/membership-requests"] = { requests: clone(apps), counts: { pending: apps.length, approved: 0, rejected: 0 } };
  adminLogin["/admin/action-center"] = { ...adminLogin["/admin/action-center"], pending_memberships: apps.length };

  // ----- the book -----
  const pub = blank(tmplPublic);
  for (const k of REFERENCE_PUBLIC_KEYS) pub[k] = clone(tmplPublic[k]);
  pub["/community/config"] = cfg;
  const book = { public: pub, logins: { [MEMBER_EMAIL]: memberLogin, [ADMIN_EMAIL]: adminLogin } };

  // ----- the hub card -----
  const hub = {
    ...clone(fixtures.hub.find((c) => c.slug === "playr")), slug: SLUG, name: NAME, tagline: cfg.tagline, kind: spec.hubKind, about: cfg.about,
    cover: spec.hubCover, apply_questions: cfg.apply_questions, require_approval: true, members: users.length, upcoming_events: upcoming.length,
    country: "Canada", interest_tags: cfg.interest_tags, brand: clone(BRAND),
  };
  delete hub.my;
  return { book, hub };
}
