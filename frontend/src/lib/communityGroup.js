// Pathwai holds two kinds of community that have nothing to do with each other: innovation and business ones (founders, mentors,
// programs) and leisure and lifestyle ones (fitness, faith, dinners, clubs). They are kept in separate spaces everywhere they are listed.
// The server sends `group` on every community; this mirrors its rule (backend/community_group.py) for older data and the demo.
export const GROUPS = [
  { key: "innovation", label: "Innovation & business", short: "Innovation", hint: "Founders, mentors, programs and professional networks" },
  { key: "leisure", label: "Leisure & lifestyle", short: "Leisure", hint: "Fitness, faith, food, clubs and social groups" },
];
const KIND = /innovation|entrepreneur|startup|founder|incubator|accelerator|tech|professional network|alumni/i;
const TAGS = ["entrepreneurship", "startups", "innovation", "tech"];
export function groupOf(c) {
  if (!c) return "leisure";
  if (c.group === "innovation" || c.group === "leisure") return c.group;
  if (KIND.test(c.kind || "")) return "innovation";
  if ((c.interest_tags || []).some((t) => TAGS.includes(String(t).toLowerCase()))) return "innovation";
  return "leisure";
}
