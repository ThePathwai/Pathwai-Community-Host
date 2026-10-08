// "Playr League team", "C3 team", "Yvettabetta Pilates team": the community's own name for its staff, so no
// page hardcodes one community's name (used as "the {teamOf(config)}" / "The {teamOf(config)}").
export const teamOf = (config) => {
  const n = (config?.community_name || "").trim().replace(/^the\s+/i, "");
  return n ? `${n} team` : "community team";
};
