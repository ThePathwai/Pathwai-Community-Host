// The in-browser demo's stand-in for the Teams backend (backend/routes/teams.py): small project teams that members start
// themselves. One list per community, shared by every demo login (so a team the member starts is visible to the admin).
// Mirrors the real API's shapes and rules so the same pages work against either.

const uid = () => "team-" + Math.random().toString(36).slice(2, 9);
const iso = () => new Date().toISOString();
const SNAP = ["id", "name", "avatar_url", "title", "company", "member_type"];

const tagsOf = (v) => { const out = []; for (const t of v || []) { const s = String(t).trim().slice(0, 40); if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s); } return out.slice(0, 12); };

export function teamsHandler({ method, path, body, store, me, users }) {
  const items = store.items;
  const person = (id) => { const u = users.find((x) => x.id === id); return u ? { ...Object.fromEntries(SNAP.map((k) => [k, u[k] ?? null])), skill_set: u.skill_set || [], goals: u.goals || [] } : null; };
  const shape = (t, detail) => {
    const ids = t.member_ids || [];
    const out = { ...JSON.parse(JSON.stringify(t)), member_count: ids.length, is_member: ids.includes(me.id), is_lead: t.lead_id === me.id };
    out.can_manage = out.is_lead || me.role === "admin"; out.lead = person(t.lead_id);
    out.member_preview = ids.slice(0, 5).map(person).filter(Boolean);
    if (detail) out.members = ids.map(person).filter(Boolean);
    return out;
  };
  const err = (status, detail) => ({ status, data: { detail } });
  const guard = (t) => (t.lead_id === me.id || me.role === "admin" ? null : err(403, "Only the team lead or an admin can do that."));
  const m = path.match(/^\/teams(?:\/([^/]+))?(?:\/(join|leave|members)(?:\/([^/]+))?)?$/);
  if (!m) return null;
  const [, id, sub, uidArg] = m;
  if (!id) {
    if (method === "get") {
      return { status: 200, data: [...items].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((t) => shape(t, false)) };
    }
    if (method === "post") {
      const name = String(body.name || "").trim();
      if (name.length < 2) return err(422, "Give the team a name.");
      const t = { id: uid(), name: name.slice(0, 80), description: String(body.description || "").trim().slice(0, 1500), looking_for: tagsOf(body.looking_for), status: "active", lead_id: me.id, member_ids: [me.id], created_by: me.id, created_at: iso(), updated_at: iso() };
      items.unshift(t);
      return { status: 201, data: shape(t, true) };
    }
    return null;
  }
  const t = items.find((x) => x.id === id);
  if (!t) return err(404, "That team doesn't exist.");
  if (!sub) {
    if (method === "get") return { status: 200, data: shape(t, true) };
    if (method === "delete") { const g = guard(t); if (g) return g; items.splice(items.indexOf(t), 1); return { status: 200, data: { ok: true } }; }
    if (method === "patch") {
      const g = guard(t); if (g) return g;
      if (body.name != null) t.name = String(body.name).trim().slice(0, 80);
      if (body.description != null) t.description = String(body.description).trim().slice(0, 1500);
      if (body.looking_for != null) t.looking_for = tagsOf(body.looking_for);
      if (body.status != null) { if (!["active", "done"].includes(body.status)) return err(400, "Status must be active or done."); t.status = body.status; }
      if (body.lead_id != null) { if (!t.member_ids.includes(body.lead_id)) return err(400, "The new lead has to be on the team first."); t.lead_id = body.lead_id; }
      t.updated_at = iso();
      return { status: 200, data: shape(t, true) };
    }
    return null;
  }
  if (sub === "join" && method === "post") {
    if (t.status === "done") return err(400, "This team has finished, so it isn't taking new people.");
    if (!t.member_ids.includes(me.id)) t.member_ids.push(me.id);
    return { status: 200, data: shape(t, true) };
  }
  if (sub === "leave" && method === "post") {
    t.member_ids = t.member_ids.filter((x) => x !== me.id);
    if (!t.member_ids.length) { items.splice(items.indexOf(t), 1); return { status: 200, data: { ok: true, deleted: true } }; }
    if (t.lead_id === me.id) t.lead_id = t.member_ids[0];
    return { status: 200, data: shape(t, true) };
  }
  if (sub === "members" && method === "post") {
    const g = guard(t); if (g) return g;
    if (!person(body.user_id)) return err(404, "That person isn't a member of this community.");
    if (!t.member_ids.includes(body.user_id)) t.member_ids.push(body.user_id);
    return { status: 200, data: shape(t, true) };
  }
  if (sub === "members" && method === "delete") {
    const g = guard(t); if (g) return g;
    if (uidArg === t.lead_id) return err(400, "Hand the lead to someone else first.");
    t.member_ids = t.member_ids.filter((x) => x !== uidArg);
    return { status: 200, data: shape(t, true) };
  }
  return null;
}
