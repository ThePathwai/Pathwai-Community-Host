// EDIT ME: Pathwai pricing, in one place. PLACEHOLDER numbers: nothing here charges anyone or blocks anything yet.
// Change the tiers below and everything that reads this file (a pricing page, an admin usage card) follows.
//
// How the numbers are counted (keep these definitions when you edit, so a "member" means the same thing everywhere):
//   members    = ACTIVE members: anyone who signed in during the last 90 days (not everyone ever registered)
//   resources  = published catalogue items a community hosts: programs, grants, resources, perks and guides
//              (events are not counted here; people and mentors count as members, not resources)
//   admins     = people with admin access to the community
//   aiGuide    = how much the AI guide can be used per month (it has a real cost per use, so it is capped by plan)
// Limits are SOFT: warn at WARN_AT of the limit, allow GRACE over it, then ask the community to move up a tier.
// A limit of null means unlimited.

export const CURRENCY = "CAD";
export const ANNUAL_MONTHS_BILLED = 10;   // billed annually = pay 10 months, get 12
export const WARN_AT = 0.9;               // show a nudge at 90% of a limit
export const GRACE = 0.1;                 // allow 10% over a limit before asking for an upgrade

export const TIERS = [
  {
    id: "starter", name: "Starter", monthly: 0, forWho: "Small hubs and communities trying Pathwai",
    limits: { members: 50, resources: 25, admins: 1, aiGuide: "light" },
    features: ["Founder directions and decision plan", "Programs, people and resources matched to each founder", "Shown as \"Powered by Pathwai\""],
  },
  {
    id: "community", name: "Community", monthly: 179, forWho: "A single program or small innovation community",
    limits: { members: 250, resources: 150, admins: 3, aiGuide: "standard" },
    features: ["Your own logo and colours", "Everything in Starter", "Email support"],
  },
  {
    id: "hub", name: "Hub", monthly: 499, forWho: "An established incubator, accelerator or innovation hub", popular: true,
    limits: { members: 1000, resources: 500, admins: 10, aiGuide: "high" },
    features: ["Fully white-label", "Member and resource imports", "Integrations", "Impact reports for your funders", "Everything in Community"],
  },
  {
    id: "network", name: "Network", monthly: 1500, from: true, forWho: "Large hubs, universities and multi-site networks",
    limits: { members: null, resources: null, admins: null, aiGuide: "custom" },
    features: ["Multiple communities under one account", "Custom domain and single sign-on", "Uptime commitment and a named contact", "Everything in Hub"],
  },
];

export const tierById = (id) => TIERS.find((t) => t.id === id) || TIERS[0];

// What you pay per year when billed annually (null for custom-priced tiers).
export const annualPrice = (tier) => (tier.monthly ? tier.monthly * ANNUAL_MONTHS_BILLED : 0);

export const money = (n) => `$${Number(n).toLocaleString("en-CA")}`;
export const priceLabel = (tier, billing = "monthly") => {
  if (!tier.monthly) return "Free";
  const n = billing === "annual" ? annualPrice(tier) : tier.monthly;
  return `${tier.from ? "From " : ""}${money(n)}${billing === "annual" ? "/yr" : "/mo"}`;
};

// How full a community is against one limit: { used, limit, ratio, state } where state is
// "ok" | "warn" (at WARN_AT) | "over" (past the limit, still inside the grace) | "upgrade" (past the grace).
export function limitState(used, limit) {
  if (limit == null) return { used, limit, ratio: 0, state: "ok" };
  const ratio = limit ? used / limit : 1;
  const state = ratio > 1 + GRACE ? "upgrade" : ratio > 1 ? "over" : ratio >= WARN_AT ? "warn" : "ok";
  return { used, limit, ratio, state };
}

// The smallest tier whose limits fit this usage (members and resources both have to fit, grace included).
export function tierFor({ members = 0, resources = 0, admins = 1 } = {}) {
  const fits = (v, cap) => cap == null || v <= cap * (1 + GRACE);
  return TIERS.find((t) => fits(members, t.limits.members) && fits(resources, t.limits.resources) && fits(admins, t.limits.admins)) || TIERS[TIERS.length - 1];
}
