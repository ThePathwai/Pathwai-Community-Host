import { useAuth } from "./auth";

// Ecosystem lens. A community that works as a hub for founders (a university, an accelerator, a region) can describe itself in its config:
//   config.ecosystem = { hub: "Humber", wider: "All of Canada", city, home_title, home_sub, picks: { programId: "why the hub points founders to it" } }
// With it, Home becomes "your next moves", Programs & grants lists the hub's own programs and its picks first, and one tap widens to the whole
// catalog. Without it nothing changes: a community with no `ecosystem` behaves exactly as before.
// Every community is a hub now, so a community that has not described itself still gets the lens, with sensible defaults.
export function useEcosystem() {
  const { config } = useAuth();
  if (!config) return null;
  return config.ecosystem || { hub: config.community_name || "Your community", wider: "All of Canada" };
}
// Does this program belong to the hub's slice: one the hub runs, or one it points founders to?
export const inHub = (p, eco, slug) => !!eco && (!!(p.community && (!slug || p.community.slug === slug)) || !!(eco.picks && eco.picks[p.id]));
