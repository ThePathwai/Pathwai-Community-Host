import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fieldLabel, fieldOn, typeLabel } from "../lib/profile";
import { Chip, Empty, Input, PageHeader, Select, Spinner, hueFromName } from "../components/ui";

export default function Members() {
  const { config } = useAuth();
  const [users, setUsers] = useState(null);
  const [filters, setFilters] = useState({ offers: [], looking_for: [], interests: [], industries: [] });
  const [q, setQ] = useState("");
  const [offer, setOffer] = useState("all");
  const [seeking, setSeeking] = useState("all");
  const [interest, setInterest] = useState("all");
    const [kind, setKind] = useState("all");
  const [more, setMore] = useState(false);

  useEffect(() => { api.get("/users/filters").then((r) => setFilters(r.data)); }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      api.get("/users", { params: { q: q || undefined, offer, looking_for: seeking, interest, member_kind: kind } }).then((r) => setUsers(r.data));
    }, 200);
    return () => clearTimeout(t);
  }, [q, offer, seeking, interest, kind]);

  const opt = (label, arr) => [{ value: "all", label }, ...arr.map((x) => ({ value: x, label: x }))];
  const active = [offer, seeking, interest, kind].filter((x) => x !== "all").length;
  const reset = () => { setQ(""); setOffer("all"); setSeeking("all"); setInterest("all"); setKind("all"); };
  return (
    <div>
      <PageHeader k="members" title={config?.member_label_plural || "Members"} subtitle="Everyone in the community: their work, skills, goals and what they need help with." />
      <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Input data-testid="member-search" placeholder="Search name, profession, skill, interest…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={kind} onChange={(e) => setKind(e.target.value)} options={[{ value: "all", label: "Everyone" }, ...["founder", "mentor", "partner"].map((t) => ({ value: t, label: typeLabel(config, t) + "s" }))]} />
        <button className="btn-ghost" onClick={() => setMore(!more)} data-testid="more-filters">{more ? "Fewer filters" : "More filters"}{active ? ` (${active})` : ""}</button>
      </div>
      {more && (
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
                    <Select value={offer} onChange={(e) => setOffer(e.target.value)} options={opt("Can help with…", filters.offers)} />
          <Select value={seeking} onChange={(e) => setSeeking(e.target.value)} options={opt(`${fieldLabel(config, "support_needs")}…`, filters.looking_for)} />
          <Select value={interest} onChange={(e) => setInterest(e.target.value)} options={opt(`${fieldLabel(config, "interests_hobbies")}…`, filters.interests)} />
        </div>
      )}
      <p className="mb-4 text-xs text-muted">{users ? `${users.length} ${users.length === 1 ? "person" : "people"}` : ""}{active || q ? <button className="ml-3 underline" onClick={reset}>Clear</button> : null}</p>
      {!users ? <Spinner /> : users.length === 0 ? <Empty title="No one matches those filters." hint="Try removing a filter or searching by skill." /> : (
        <>
          {/* Mobile: a dense portrait grid (same treatment as the Hub community grid) instead of one
              tall image card per row — browsing many members means scrolling far less this way. */}
          <div className="grid grid-cols-3 gap-2 lg:hidden">
            {users.map((u) => (
              <Link key={u.id} to={`/members/${u.id}`} data-testid="member-tile" className="group relative aspect-[4/5] overflow-hidden rounded-xl border border-line">
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt={u.name} className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center font-display text-2xl font-bold" style={{ background: `hsl(${hueFromName(u.name || "?")} 30% 22%)`, color: `hsl(${hueFromName(u.name || "?")} 45% 85%)` }}>
                    {(u.name || "?").split(" ").map((x) => x[0]).slice(0, 2).join("")}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                {u.member_type && u.member_type !== "founder" && <span className="absolute right-1.5 top-1.5"><Chip accent className="!px-1.5 !py-0.5 !text-[9px]">{typeLabel(config, u.member_type)}</Chip></span>}
                <div className="absolute inset-x-0 bottom-0 p-2 text-white">
                  <p className="truncate text-[12px] font-bold leading-tight">{u.name}</p>
                  {fieldOn(config, "title") && u.title && <p className="truncate text-[10px] text-white/75">{u.title}</p>}
                </div>
              </Link>
            ))}
          </div>

          <div className="hidden lg:grid lg:grid-cols-3 lg:gap-4 xl:grid-cols-4">
            {users.map((u) => (
              <Link key={u.id} to={`/members/${u.id}`} data-testid="member-card" className="card group overflow-hidden !p-0">
                <div className="relative aspect-[4/3] overflow-hidden">
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt={u.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center font-display text-4xl font-bold transition duration-500 group-hover:scale-105" style={{ background: `hsl(${hueFromName(u.name || "?")} 30% 22%)`, color: `hsl(${hueFromName(u.name || "?")} 45% 85%)` }}>
                      {(u.name || "?").split(" ").map((x) => x[0]).slice(0, 2).join("")}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-4 right-4 text-white">
                    <p className="font-display text-lg font-bold leading-tight">{u.name}</p>
                    {fieldOn(config, "title") && <p className="truncate text-xs text-white/80">{u.title}</p>}
                  </div>
                  {u.member_type && u.member_type !== "founder" && <span className="absolute right-3 top-3"><Chip accent>{typeLabel(config, u.member_type)}</Chip></span>}
                </div>
                <div className="space-y-1.5 px-4 py-3">
                  {fieldOn(config, "skill_set") && (u.skill_set || []).length > 0 && <p className="truncate text-xs"><span className="eyebrow mr-2">{fieldLabel(config, "skill_set")}</span>{u.skill_set.slice(0, 3).join(" · ")}</p>}
                  {fieldOn(config, "support_needs") && (u.support_needs || []).length > 0 && <p className="truncate text-xs"><span className="eyebrow mr-2" style={{ color: "var(--accent)" }}>{fieldLabel(config, "support_needs")}</span>{u.support_needs.slice(0, 2).join(" · ")}</p>}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
