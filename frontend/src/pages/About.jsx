import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ChevronDown, Compass, Minus, Sparkles, Swords, Target, Users, X } from "lucide-react";
import { Wordmark, PoweredBy, cx } from "../components/ui";

// /about -- public (no login). A click-down explainer: what Pathwai is, who it's for, how it works,
// who the alternatives are and where Pathwai is different. Plain data below so copy edits are one-liners.

const AUDIENCES = [
  ["Accelerators & incubators", "Cohorts need founders to find the right peer, mentor or customer fast. Pathwai introduces them and explains why."],
  ["Professional & alumni networks", "Keep a large, gated membership useful after the welcome email: directory, intros, events and perks in one place."],
  ["Community & cultural organizations", "Events, news and member benefits for people who share an identity, a mission or a neighbourhood."],
  ["Programs & learning cohorts", "Pair it with the learning tool you already use. Pathwai handles the people side: who is in your cohort and who to meet."],
];

const STEPS = [
  ["Members build a pitch-style profile", "Who they are, what they offer and what they are asking for. Not a bio nobody reads."],
  ["Pathwai suggests who to meet, and why", "Every match comes with a plain-language reason, so a cold intro becomes a warm one."],
  ["Organizers run it from one place", "Approve members, post events and news, add perks and message the community, all inside their own branded space."],
];

const COMPETITORS = [
  {
    group: "General community platforms",
    blurb: "Built around a feed, courses and paid memberships. Strong and proven, but the point is posting and content.",
    items: [
      ["Circle", "Creators and brands", "$$$", "Mature feed, courses, live events and payments. A branded mobile app costs extra, and introductions are left to members."],
      ["Mighty Networks", "Coaches and creators", "$$", "A polished native app plus courses. Built for audience growth more than for running a gated network."],
      ["Skool", "Paid courses with leaderboards", "$", "Simple, cheap and good at conversion. Branding is fixed, so it will always look like Skool."],
      ["Bettermode", "Customer and brand communities", "$$$", "Very customizable, aimed at companies and support. Not designed around member-to-member matching."],
    ],
  },
  {
    group: "Association & alumni software",
    blurb: "The closest in purpose. Deep tools for dues, fundraising and records.",
    items: [
      ["Hivebrite", "Alumni, associations, nonprofits", "$$$$", "Powerful, with dues, giving and CRM sync, but heavy to set up and priced for large institutions."],
    ],
  },
  {
    group: "Learning platforms",
    blurb: "Own the programs and content. Community is secondary.",
    items: [
      ["Disco", "Cohort and program-based learning", "$$$", "Strong at programs and completion. Pathwai sits next to it and shows learning progress on member profiles."],
    ],
  },
  {
    group: "What most networks use today",
    blurb: "Free and familiar. Also the real competition.",
    items: [
      ["Slack, Discord, WhatsApp", "Chat for everyone", "Free", "Great for talking, but there is no directory and nothing helps members find the right person."],
      ["Luma, Eventbrite", "Event pages", "Free–$", "Events only. No profiles, matching or perks behind them."],
      ["Spreadsheets & email", "Total control", "Free", "Works until the organizer becomes the bottleneck for every intro."],
    ],
  },
];

// Y = yes, P = partly, N = no
const MATRIX = {
  cols: ["Pathwai", "Circle", "Mighty", "Skool", "Hivebrite", "Chat apps"],
  rows: [
    ["Matches members and explains why", "Y", "N", "P", "N", "P", "N"],
    ["Pitch cards, offers and asks", "Y", "N", "N", "N", "N", "N"],
    ["Own look and feel per community", "Y", "Y", "P", "N", "Y", "N"],
    ["Several communities, one login", "Y", "P", "P", "N", "P", "N"],
    ["Approval and moderation for gated networks", "Y", "Y", "Y", "Y", "Y", "P"],
    ["Priced for small and mid-size networks", "Y", "P", "P", "Y", "N", "Y"],
    ["Paid courses and payments built in", "N", "Y", "Y", "Y", "Y", "N"],
    ["Native app in the app stores", "P", "P", "Y", "P", "Y", "Y"],
  ],
};

const EDGES = [
  ["Introductions, not just posts", "Most platforms give you a place to talk. Pathwai tells members who to talk to, and why."],
  ["Built for networks, not audiences", "Applications, approvals, gated directories and organizer tools come first, not course checkout."],
  ["Every community looks like itself", "Each community gets its own colours, logo, naming and navigation. Members keep one Pathwai login."],
  ["It works with your tools", "Keep your learning platform, forms and calendar. Pathwai layers the people side on top."],
  ["Priced for the rest of us", "Aimed at networks that cannot justify a four-figure monthly platform bill."],
];

const PRICE_NOTE = "$ signs show relative cost, from free ($) to enterprise ($$$$). Based on public information and may have changed.";

function Mark({ v }) {
  if (v === "Y") return <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink text-paper" role="img" aria-label="Yes"><Check className="h-3.5 w-3.5" /></span>;
  if (v === "P") return <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-line text-muted" role="img" aria-label="Partly"><Minus className="h-3.5 w-3.5" /></span>;
  return <span className="inline-flex h-6 w-6 items-center justify-center text-muted/50" role="img" aria-label="No"><X className="h-3.5 w-3.5" /></span>;
}

function Section({ id, n, icon: Icon, title, summary, open, onToggle, children }) {
  return (
    <section className={cx("overflow-hidden rounded-2xl border transition-colors", open ? "border-ink/30 bg-surface" : "border-line/70 bg-surface/60 hover:border-ink/20")} data-testid={`about-${id}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={`about-panel-${id}`}
        className="flex w-full items-center gap-4 p-5 text-left sm:p-6" data-testid={`about-toggle-${id}`}>
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-ink text-paper"><Icon className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="eyebrow block">{String(n).padStart(2, "0")}</span>
          <span className="mt-0.5 block text-lg font-bold sm:text-xl">{title}</span>
          {!open && <span className="mt-1 block text-sm text-muted">{summary}</span>}
        </span>
        <ChevronDown className={cx("h-5 w-5 flex-none text-muted transition-transform duration-300", open && "rotate-180 text-ink")} />
      </button>
      <div id={`about-panel-${id}`} className={cx("grid transition-[grid-template-rows] duration-300 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="px-5 pb-6 sm:px-6 sm:pl-[5.75rem]" hidden={!open}>{children}</div>
        </div>
      </div>
    </section>
  );
}

export default function About() {
  const [open, setOpen] = useState(["what"]);
  useEffect(() => { window.scrollTo(0, 0); document.title = "About Pathwai"; }, []);
  const toggle = (k) => setOpen((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));
  const allOpen = open.length === 5;
  const P = (k) => ({ open: open.includes(k), onToggle: () => toggle(k) });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12" data-testid="about">
      <header className="mb-10 flex items-center justify-between">
        <Link to="/" className="text-2xl"><Wordmark name="Pathwai" brand={{}} /></Link>
        <Link to="/login" className="btn-ghost" data-testid="about-signin">Sign in</Link>
      </header>

      <p className="eyebrow">About Pathwai</p>
      <h1 className="mt-3 text-3xl font-bold sm:text-5xl" style={{ textWrap: "balance" }}>The community platform for networks where the point is who you meet.</h1>
      <p className="mt-4 max-w-xl text-base text-muted">Not what you post. Pathwai gives accelerators, alumni groups and member organizations a branded home, and helps members find the right people inside it.</p>

      <div className="mt-8 mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">Tap a section to open it.</p>
        <button type="button" className="text-sm underline underline-offset-2" data-testid="about-toggle-all"
          onClick={() => setOpen(allOpen ? [] : ["what", "who", "how", "market", "diff"])}>{allOpen ? "Collapse all" : "Expand all"}</button>
      </div>

      <div className="space-y-3">
        <Section id="what" n={1} icon={Compass} title="What Pathwai is" summary="A branded home for your network, with smart introductions built in." {...P("what")}>
          <p className="text-sm leading-relaxed text-muted">Pathwai is a white-label platform for running a member community. Each community gets its own members, events, news, perks and look. Members get one Pathwai login that works across every community they belong to.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[["Directory", "Searchable profiles with pitch cards, offers and asks."],
              ["Matching", "Suggested introductions, each with a reason."],
              ["Operations", "Events, news, perks, approvals and messages in one admin."]].map(([t, d]) => (
              <div key={t} className="rounded-xl border border-line/70 p-4">
                <p className="text-sm font-semibold">{t}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{d}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="who" n={2} icon={Users} title="Who it's for" summary="Gated networks of founders, professionals and members." {...P("who")}>
          <div className="grid gap-3 sm:grid-cols-2">
            {AUDIENCES.map(([t, d]) => (
              <div key={t} className="rounded-xl border border-line/70 p-4">
                <p className="text-sm font-semibold">{t}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{d}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted">Not the best fit if your main goal is selling courses or growing a large public audience. Other tools do that better.</p>
        </Section>

        <Section id="how" n={3} icon={Sparkles} title="How it works" summary="Profile, match, run. Three steps." {...P("how")}>
          <ol className="space-y-4">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="stat flex h-8 w-8 flex-none items-center justify-center rounded-full border border-line text-sm">{i + 1}</span>
                <span><span className="block text-sm font-semibold">{t}</span><span className="mt-0.5 block text-sm text-muted">{d}</span></span>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="market" n={4} icon={Swords} title="Who else is out there" summary="Community platforms, association software, learning tools, and free chat apps." {...P("market")}>
          <div className="space-y-7">
            {COMPETITORS.map((g) => (
              <div key={g.group}>
                <h3 className="text-sm font-bold normal-case" style={{ textTransform: "none", letterSpacing: 0 }}>{g.group}</h3>
                <p className="mt-0.5 text-xs text-muted">{g.blurb}</p>
                <ul className="mt-3 divide-y divide-line/60 rounded-xl border border-line/70">
                  {g.items.map(([name, forWho, price, how]) => (
                    <li key={name} className="p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <p className="text-sm font-semibold">{name}</p>
                        <p className="text-xs text-muted"><span>{forWho}</span> · <span className="font-semibold text-ink/80" title="Relative cost">{price}</span></p>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted">{how}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-muted">{PRICE_NOTE}</p>
        </Section>

        <Section id="diff" n={5} icon={Target} title="How we're different" summary="Introductions first, built for networks, branded per community." {...P("diff")}>
          <ul className="space-y-4">
            {EDGES.map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <ArrowRight className="mt-0.5 h-4 w-4 flex-none" />
                <span><span className="block text-sm font-semibold">{t}</span><span className="mt-0.5 block text-sm text-muted">{d}</span></span>
              </li>
            ))}
          </ul>

          <div className="mt-6 overflow-x-auto rounded-xl border border-line/70" data-testid="about-matrix">
            <table className="w-full min-w-[34rem] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-line/70">
                  <th scope="col" className="p-3 font-medium text-muted">At a glance</th>
                  {MATRIX.cols.map((c, i) => <th key={c} scope="col" className={cx("p-3 text-center font-semibold", i === 0 && "bg-ink/[.07]")}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {MATRIX.rows.map(([label, ...v]) => (
                  <tr key={label} className="border-b border-line/50 last:border-0">
                    <th scope="row" className="p-3 font-normal">{label}</th>
                    {v.map((x, i) => <td key={i} className={cx("p-3 text-center", i === 0 && "bg-ink/[.07]")}><Mark v={x} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-muted">Honest note: payments and courses are not our focus, so we say so. Use Stripe or your learning platform alongside Pathwai. Pathwai installs on a phone as an app today; a store listing is on the roadmap. Comparisons use public information and may have changed.</p>
        </Section>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line/70 p-5">
        <p className="text-sm font-semibold">Ready to see it with your network?</p>
        <div className="flex gap-2">
          <Link to="/hub" className="btn-ghost" data-testid="about-hub">Browse communities</Link>
          <Link to="/signup" className="btn-primary" data-testid="about-signup">Get started</Link>
        </div>
      </div>
      <PoweredBy className="mt-8 text-center" />
    </div>
  );
}
