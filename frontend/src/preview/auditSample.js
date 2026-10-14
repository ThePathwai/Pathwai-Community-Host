// Sample audit results for the in-browser demo (the real ones are computed by backend/audit_report.py).
const t = (label, value, note = "", accent = false) => ({ label, value: String(value), note, accent });
export const AUDIT_SAMPLES = {
  community_pulse: { tiles: [t("Members", 48), t("Joined in 30 days", 9, "19% of members", true), t("Joined in 7 days", 3), t("Applications waiting", 2), t("Avg profile complete", "78%")],
    charts: [{ type: "columns", title: "New members per week (last 8 weeks)", items: [["Aug 26", 1], ["Sep 2", 2], ["Sep 9", 0], ["Sep 16", 3], ["Sep 23", 2], ["Sep 30", 4], ["Oct 7", 2], ["Oct 14", 3]].map(([label, value]) => ({ label, value })) },
      { type: "donut", title: "Members by type", items: [{ label: "Member", value: 38 }, { label: "Host", value: 8 }, { label: "Admin", value: 2 }] }],
    insights: ["48 people belong to this community; 9 joined in the last 30 days (19% of the total).", "2 applications are waiting for a decision."] },
  cohort_progress: { tiles: [t("Members", 48), t("Shared goals", 39, "81% of members", true), t("Naming a hurdle", 6), t("Recent wins logged", 11)],
    charts: [{ type: "hbar", title: "Profiles by how complete they are", unit: "members", items: [{ label: "76 to 100%", value: 31 }, { label: "51 to 75%", value: 12 }, { label: "26 to 50%", value: 4 }, { label: "0 to 25%", value: 1 }] }],
    insights: ["81% of members have shared goals (39 of 48).", "5 profiles are under half complete. A reminder is worth sending."] },
  founder_needs: { tiles: [t("Members asking for help", 33), t("Open requests", 7, "help board", true), t("Resolved in 30 days", 12), t("Members who can help", 8)],
    charts: [{ type: "hbar", title: "What members are asking for", unit: "members", items: [{ label: "Marketing", value: 14 }, { label: "Legal advice", value: 11 }, { label: "Fundraising", value: 9 }, { label: "Accounting", value: 8 }] },
      { type: "pairs", title: "Asks versus members who can help", a: "Asking", b: "Can help", items: [{ label: "Marketing", asks: 14, helpers: 3 }, { label: "Legal advice", asks: 11, helpers: 1 }, { label: "Fundraising", asks: 9, helpers: 4 }, { label: "Accounting", asks: 8, helpers: 2 }] }],
    insights: ["The most common ask is Marketing, from 14 members.", "Biggest gap: Legal advice has 11 asks but only 1 member who can help."] },
  hiring_signals: { tiles: [t("Members hiring", 7, "", true), t("Signals found", 9)],
    charts: [{ type: "hbar", title: "Hiring signals by function", unit: "members", items: [{ label: "Engineering", value: 3 }, { label: "Sales", value: 2 }, { label: "Marketing", value: 2 }, { label: "Design", value: 1 }] }],
    insights: ["7 members show signs of hiring. Engineering comes up most, with 3."] },
  upcoming_moments: { tiles: [t("Upcoming events", 6), t("Average fill", "42%", "of events with a seat limit", true), t("People going", 74), t("Open seats", 98)],
    charts: [{ type: "hbar", title: "How full the next events are", unit: "% full", max: 100, items: [{ label: "Founders mixer", value: 78, note: "39/50" }, { label: "Pitch practice", value: 45, note: "9/20" }, { label: "Legal clinic", value: 20, note: "4/20" }] }],
    insights: ["6 events on the calendar, with 74 people going so far.", "Fullest: Founders mixer (78%). Emptiest: Legal clinic (20%). Promote the emptiest one this week."] },
  directory_snapshot: { tiles: [t("Hosts and mentors", 8), t("Active in 30 days", 41, "85% of members", true), t("Members", 48), t("Hidden from directory", 3)],
    charts: [{ type: "hbar", title: "Skills members offer", unit: "members", items: [{ label: "Leadership", value: 12 }, { label: "Public speaking", value: 9 }, { label: "Operations", value: 7 }] }],
    insights: ["41 of 48 members (85%) updated their profile or were active in the last 30 days."] },
};
