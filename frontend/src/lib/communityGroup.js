// Pathwai keeps two kinds of community apart: innovation (founders, hubs, accelerators, professional networks) and leisure (fitness, faith, food, clubs).
// The server says which one in `group`; when it does not (older data), work it out the same way backend/community_group.py does.
const KIND = /innovation|entrepreneur|startup|founder|incubator|accelerator|tech|professional network|alumni/i;
const TAG = /startup|innovation|entrepreneur|tech/i;
export const isInnovation = (c) => (c.group ? c.group === "innovation" : KIND.test(c.kind || "") || (c.interest_tags || []).some((t) => TAG.test(t)));
