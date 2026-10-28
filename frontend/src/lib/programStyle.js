import { Banknote, Building2, FlaskConical, Handshake, Landmark, Percent, Plane, Rocket, TrendingUp, Trophy } from "lucide-react";
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
