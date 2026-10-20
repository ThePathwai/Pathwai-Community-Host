// The in-browser demo's stand-in for backend/routes/impact.py: the Impact numbers, sponsor / funder / board reports,
// read-only share links and the "going quiet" list. Every figure is sample data (and labelled that way on screen),
// made from the demo community's own member, event and perk lists so it looks like that community.
import { sampleMetrics, impactCards, buildReport, REPORT_TYPES, PERIODS } from "../lib/sampleReport";

const hash = (s) => String(s || "x").split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const err = (status, detail) => ({ status, data: { detail } });
const DAY = 86400000;

export function impactHandler({ method, path, body, params, store, users, events, resources, community, communityName }) {
  const days = PERIODS.some((p) => p.days === Number(params?.days)) ? Number(params.days) : 90;
  const people = (users || []).filter((u) => u.role !== "admin");
  const metrics = (d = days) => sampleMetrics({
    members: people.length || 40, seed: community || "demo", days: d,
    eventTitles: (events || []).map((e) => e.title).filter(Boolean), perkTitles: (resources || []).map((r) => r.title).filter(Boolean),
  });
  const quietRows = () => {
    const n = metrics(90).quiet;
    const pick = [...people].sort((a, b) => hash(a.id + community) - hash(b.id + community)).slice(0, n);
    return pick.map((u, i) => {
      const gone = 31 + (hash(u.id) % 55);
      const nudgedAt = store.nudged[u.id];
      const never = i % 4 === 3;
      return { id: u.id, name: u.name, title: u.title || null, avatar_url: u.avatar_url || null,
        last_active_at: never ? null : new Date(Date.now() - gone * DAY).toISOString(), days_quiet: gone,
        reason: never ? "Hasn't done anything since joining" : `Last active ${gone} days ago${i % 3 === 0 ? " · last RSVP: " + ((events || [])[0]?.title || "an event") : ""}`,
        nudged_at: nudgedAt || null, nudged_recently: !!nudgedAt };
    }).sort((a, b) => Number(a.nudged_recently) - Number(b.nudged_recently) || b.days_quiet - a.days_quiet);
  };

  if (path === "/admin/impact" && method === "get") return { status: 200, data: { ...impactCards(metrics()), quiet: quietRows().length } };
  if (path === "/admin/report-types" && method === "get") return { status: 200, data: { types: REPORT_TYPES, periods: PERIODS } };
  const rep = path.match(/^\/admin\/reports\/([a-z]+)(\.pdf)?$/);
  if (rep && method === "get") {
    if (!REPORT_TYPES.some((t) => t.kind === rep[1])) return err(400, "Unknown report type");
    if (rep[2]) return err(400, "PDF files are made by a live community. In this practice copy, use Print / save as PDF on the report page.");
    return { status: 200, data: buildReport(rep[1], metrics(), communityName) };
  }
  if (path === "/admin/report-shares" && method === "get") return { status: 200, data: { shares: store.shares.filter((s) => !s.revoked) } };
  if (path === "/admin/report-shares" && method === "post") {
    if (!REPORT_TYPES.some((t) => t.kind === body.kind)) return err(400, "Unknown report type");
    const s = { id: "sh-" + Math.random().toString(36).slice(2, 8), token: "demo-" + Math.random().toString(36).slice(2, 14), kind: body.kind, days: PERIODS.some((p) => p.days === body.days) ? body.days : 90,
      label: (body.label || "").trim().slice(0, 80) || null, created_at: new Date().toISOString(), views: 0, last_viewed_at: null, revoked: false };
    store.shares.unshift(s);
    return { status: 201, data: s };
  }
  const del = path.match(/^\/admin\/report-shares\/([^/]+)$/);
  if (del && method === "delete") {
    const s = store.shares.find((x) => x.id === del[1]);
    if (!s) return err(404, "Link not found");
    s.revoked = true;
    return { status: 200, data: { ok: true } };
  }
  if (path === "/admin/quiet" && method === "get") {
    const rows = quietRows();
    return { status: 200, data: { members: rows, total: rows.length, days: 30, nudged_30d: Object.keys(store.nudged).length, came_back_30d: 0 } };
  }
  if (path === "/admin/quiet/nudge" && method === "post") {
    const ids = [...new Set(body.user_ids || [])];
    if (!ids.length) return err(400, "Pick at least one person");
    let sent = 0, skipped = 0;
    for (const id of ids) { if (store.nudged[id]) skipped += 1; else { store.nudged[id] = new Date().toISOString(); sent += 1; } }
    return { status: 200, data: { ok: true, sent, skipped, skipped_ids: [] } };
  }
  const pub = path.match(/^\/public\/report\/([^/]+)$/);
  if (pub && method === "get") {
    const s = store.shares.find((x) => x.token === pub[1] && !x.revoked) || (pub[1] === "sample" ? { kind: "sponsor", days: 90, label: null } : null);
    if (!s) return err(404, "This link is no longer active.");
    s.views = (s.views || 0) + 1;
    return { status: 200, data: { ...buildReport(s.kind, metrics(s.days), communityName), label: s.label, read_only: true, live: true, brand: {} } };
  }
  return null;
}
