import { Banknote, Building2, CalendarDays, Compass, FlaskConical, Handshake, Landmark, Percent, Plane, Rocket, Tag, TrendingUp, Trophy, Users } from "../components/icons";
import { daysUntil, isStageLine, todayIso } from "./navigator";

// Each kind of program gets its own colour and icon, so a list reads at a glance (grant vs loan vs accelerator) before a word is read.
// Colours are mid-tones that hold up on both the dark and the light themes; they only ever tint a tile or colour an icon.
export const TYPE_META = {
  grant: { color: "#34D399", Icon: Banknote },
  loan: { color: "#FBBF24", Icon: Landmark },
  tax_credit: { color: "#2DD4BF", Icon: Percent },
  accelerator: { color: "#A78BFA", Icon: Rocket },
  incubator: { color: "#818CF8", Icon: Building2 },
  mentorship: { color: "#38BDF8", Icon: Handshake },
  competition: { color: "#FB923C", Icon: Trophy },
  investor: { color: "#F472B6", Icon: TrendingUp },
  immigration: { color: "#94A3B8", Icon: Plane },
  research_partnership: { color: "#60A5FA", Icon: FlaskConical },
  perk: { color: "#E879F9", Icon: Tag },
  community: { color: "#2DD4BF", Icon: Users },
  resource: { color: "#94A3B8", Icon: Compass },
  events: { color: "#FB7185", Icon: CalendarDays },   // not a program type: an event is a resource too, so the catalog tiles count them
};
export const typeMeta = (t) => TYPE_META[t] || { color: "#94A3B8", Icon: Banknote };
export const tint = (hex, a = 0.16) => `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}`;

// How long is left on a program's deadline, if it has a real fixed one: {days, text, short, urgent}.
export function deadlineInfo(p) {
  const dl = (p && p.deadline) || {};
  if (dl.kind !== "fixed" || !dl.date) return null;
  const days = daysUntil(dl.date, todayIso());
  if (days == null || days < 0) return null;
  const date = new Date(dl.date + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return { days, date, text: days === 0 ? "Closes today" : days === 1 ? "Closes tomorrow" : `Closes in ${days} days`, short: days === 0 ? "Today" : `${days}d`, urgent: days <= 14, soon: days <= 45 };
}

// The most useful reason to lead with: "built for founders at your stage" is true of almost everything, so it goes last.
export const leadReason = (p) => [...(p.reasons || [])].sort((a, b) => isStageLine(a) - isStageLine(b))[0] || "";

// Timing filters, shared by For you, Everything else and Browse all. "Closing soon" is taking applications with a posted closing date within 45 days (the same cut-off as the amber "Closes in" chip).
export const SOON_DAYS = 45;
export const TIMING = [
  ["live", "Taking applications"], ["soon", "Closing soon"], ["rolling", "Apply anytime"], ["check", "Dates not posted"], ["closed", "Closed"],
];
export function timingMatch(key, p) {
  if (!key) return true;
  const st = p.status || "check";
  if (key === "live") return st === "open" || st === "rolling";
  if (key === "soon") { const d = deadlineInfo(p); return st === "open" && !!d && d.days <= SOON_DAYS; }
  if (key === "rolling") return st === "rolling";
  if (key === "check") return st === "check";
  if (key === "closed") return st === "closed" || st === "paused";
  return true;
}
