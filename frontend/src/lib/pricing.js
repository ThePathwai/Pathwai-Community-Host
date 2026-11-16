// EDIT ME: Pathwai pricing, in one place. PLACEHOLDER numbers: nothing here charges anyone or blocks anything yet.
// Change the tiers below and everything that reads this file (a pricing page, an admin usage card) follows.
//
// The model: one flat MONTHLY SUBSCRIPTION per tier. Each tier includes a number of RESOURCES the community can host,
// a founder allowance, admin seats, AI guide usage and a set of features. No per-founder metering.
//
// How the numbers are counted (keep these definitions when you edit, so they mean the same thing everywhere):
//   resources  = published catalogue items a community hosts: programs, grants, resources, perks and guides
//              (events are not counted; people and mentors are not resources)
//   founders   = ACTIVE founders: anyone who signed in during the last 90 days (not everyone ever registered)
//   admins     = people with admin access to the community
//   aiGuide    = how much the AI guide can be used per month (it has a real cost per use, so it is capped by plan)
// Limits are SOFT: warn at WARN_AT of the limit, allow GRACE over it, then ask the community to move up a tier.
// A limit of null means unlimited.

export const CURRENCY = "CAD";
export const ANNUAL_MONTHS_BILLED = 10;   // billed annually = pay 10 months, get 12
export const WARN_AT = 0.9;               // show a nudge at 90% of a limit
export const GRACE = 0.1;                 // allow 10% over a limit before asking for an upgrade

// Every feature a tier can have, in the order a comparison table shows them. A tier lists the ids it includes.
export const FEATURES = [
  { id: "directions", label: "Founder directions and decision plan" },
  { id: "matching", label: "Programs, people and resources matched to each founder" },
  { id: "aiGuide", label: "AI guide for founders" },
  { id: "brand", label: "Your own logo and colours" },
  { id: "whitelabel", label: "Fully white-label (no Pathwai branding)" },
  { id: "imports", label: "Founder and resource imports" },
  { id: "events", label: "Events and RSVPs" },
  { id: "reports", label: "Impact reports for your funders" },
  { id: "integrations", label: "Integrations" },
  { id: "domain", label: "Custom domain" },
  { id: "sso", label: "Single sign-on" },
  { id: "multi", label: "Multiple communities under one account" },
  { id: "support", label: "Support" },
];

export const TIERS = [
  {
    id: "starter", name: "Starter", monthly: 0, forWho: "Small hubs and communities trying Pathwai",
    limits: { resources: 25, founders: 25, admins: 1, aiGuide: "Light" },
    features: { directions: true, matching: true, aiGuide: true, events: true, support: "Help centre" },
    note: "Shown as \"Powered by Pathwai\"",
  },
  {
    id: "community", name: "Community", monthly: 249, forWho: "A single program or small innovation community",
    limits: { resources: 100, founders: 150, admins: 3, aiGuide: "Standard" },
    features: { directions: true, matching: true, aiGuide: true, brand: true, events: true, imports: true, support: "Email" },
  },
  {
    id: "hub", name: "Hub", monthly: 749, forWho: "An established incubator, accelerator or innovation hub", popular: true,
    limits: { resources: 400, founders: 750, admins: 10, aiGuide: "High" },
    features: { directions: true, matching: true, aiGuide: true, brand: true, whitelabel: true, events: true, imports: true, reports: true, integrations: true, support: "Priority email" },
  },
  {
    id: "network", name: "Network", monthly: 1999, from: true, forWho: "Large hubs, universities and multi-site networks",
    limits: { resources: null, founders: null, admins: null, aiGuide: "Custom" },
    features: { directions: true, matching: true, aiGuide: true, brand: true, whitelabel: true, events: true, imports: true, reports: true, integrations: true, domain: true, sso: true, multi: true, support: "Named contact" },
  },
];

export const tierById = (id) => TIERS.find((t) => t.id === id) || TIERS[0];

export const money = (n) => `$${Number(Math.round(n)).toLocaleString("en-CA")}`;

// The smallest tier whose limits fit this usage (resources, founders and admins all have to fit, grace included).
export function tierFor({ resources = 0, founders = 0, admins = 1 } = {}) {
  const fits = (v, cap) => cap == null || v <= cap * (1 + GRACE);
  return TIERS.find((t) => fits(resources, t.limits.resources) && fits(founders, t.limits.founders) && fits(admins, t.limits.admins)) || TIERS[TIERS.length - 1];
}

// What a community pays: its tier, monthly price, annual price (10 months billed) and what that works out to per resource.
// Network is "from" pricing: a real quote is custom.
export function quote(usage = {}, tier = tierFor(usage)) {
  const resources = Math.max(0, usage.resources || 0);
  return {
    tier, resources,
    monthly: tier.monthly,
    annual: tier.monthly * ANNUAL_MONTHS_BILLED,
    perResource: resources ? tier.monthly / resources : 0,
    custom: !!tier.from,
  };
}

export const priceLabel = (tier) => (tier.monthly ? `${tier.from ? "From " : ""}${money(tier.monthly)}/mo` : "Free");

// One row per feature or limit, with each tier's value, for a comparison table. Values: true, false, a string or a number (null = unlimited).
export function comparison() {
  const limitRows = [
    ["Resources hosted", "resources"], ["Active founders", "founders"], ["Admin seats", "admins"], ["AI guide usage", "aiGuide"],
  ].map(([label, k]) => ({ label, values: TIERS.map((t) => t.limits[k]) }));
  const featureRows = FEATURES.map((f) => ({ label: f.label, values: TIERS.map((t) => t.features[f.id] || false) }));
  return [...limitRows, ...featureRows];
}

// How full a community is against one limit: { used, limit, ratio, state } where state is
// "ok" | "warn" (at WARN_AT) | "over" (past the limit, still inside the grace) | "upgrade" (past the grace).
export function limitState(used, limit) {
  if (limit == null) return { used, limit, ratio: 0, state: "ok" };
  const ratio = limit ? used / limit : 1;
  const state = ratio > 1 + GRACE ? "upgrade" : ratio > 1 ? "over" : ratio >= WARN_AT ? "warn" : "ok";
  return { used, limit, ratio, state };
}
