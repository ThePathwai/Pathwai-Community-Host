import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Minus, Plus, X } from "lucide-react";
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

// One full-width row, like the FAQ / "what we do" rows on a marketing site: big title, + that turns into x,
// hairline dividers, and a two-column body (short lede on the left, the detail on the right).
function Row({ id, n, title, summary, lede, open, onToggle, children }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line" data-testid={`about-${id}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={`about-panel-${id}`}
        className="group flex w-full items-center gap-4 py-6 text-left sm:gap-8 sm:py-9" data-testid={`about-toggle-${id}`}>
        <span className="stat w-8 flex-none text-sm text-muted sm:w-12">{String(n).padStart(2, "0")}</span>
        <span className="min-w-0 flex-1">
          <span className={cx("font-display block text-2xl transition-colors sm:text-5xl", open ? "text-ink" : "text-ink/75 group-hover:text-ink")}>{title}</span>
          <span className={cx("mt-2 hidden text-sm text-muted transition-opacity sm:block", open && "opacity-0")} aria-hidden={open}>{summary}</span>
        </span>
        <span className={cx("flex h-11 w-11 flex-none items-center justify-center rounded-full border transition-all duration-300 sm:h-14 sm:w-14", open ? "rotate-45 border-ink bg-ink text-paper" : "border-line text-ink group-hover:border-ink")}>
          <Plus className="h-5 w-5 sm:h-6 sm:w-6" />
        </span>
      </button>
      <div id={`about-panel-${id}`} className={cx("grid transition-[grid-template-rows,opacity] duration-500 ease-out", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden">
          <div className="grid gap-6 pb-10 sm:grid-cols-12 sm:gap-8 sm:pb-14" hidden={!open}>
            <p className="text-base leading-relaxed text-muted sm:col-span-4 sm:pl-20 sm:pr-4 lg:text-lg">{lede}</p>
            <div className="sm:col-span-8">{children}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

const NAV = [["what", "What it is"], ["who", "Who it's for"], ["how", "How it works"], ["market", "Competitors"], ["diff", "Why us"]];
const ALL = NAV.map(([k]) => k);

export default function About() {
  const [open, setOpen] = useState(["what"]);
  useEffect(() => {
    document.title = "About Pathwai";
    const h = window.location.hash.replace("#", "");
    if (ALL.includes(h)) { setOpen([h]); setTimeout(() => document.getElementById(h)?.scrollIntoView({ behavior: "smooth" }), 80); }
    else window.scrollTo(0, 0);
  }, []);
  const toggle = (k) => setOpen((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));
  const jump = (k) => { setOpen((o) => (o.includes(k) ? o : [...o, k])); setTimeout(() => document.getElementById(k)?.scrollIntoView({ behavior: "smooth" }), 60); };
  const allOpen = open.length === ALL.length;
  const R = (k) => ({ open: open.includes(k), onToggle: () => toggle(k) });

  return (
    <div className="w-full" data-testid="about">
      <header className="glass sticky top-0 z-30 border-b border-line/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 lg:px-8">
          <Link to="/" className="text-2xl"><Wordmark name="Pathwai" brand={{}} /></Link>
          <nav className="hidden items-center gap-6 text-sm md:flex" aria-label="About sections">
            {NAV.map(([k, label]) => <button key={k} type="button" onClick={() => jump(k)} className="text-muted hover:text-ink" data-testid={`about-nav-${k}`}>{label}</button>)}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="btn-ghost hidden sm:inline-flex" data-testid="about-signin">Sign in</Link>
            <Link to="/signup" className="btn-primary" data-testid="about-signup-top">Get started</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 lg:px-8">
        <div className="py-10 sm:py-14">
          <p className="eyebrow">About Pathwai</p>
          <h1 className="mt-4 max-w-4xl text-4xl sm:text-5xl lg:text-6xl" style={{ textWrap: "balance" }}>Built for networks where the point is who you meet.</h1>
          <p className="mt-6 max-w-xl text-base text-muted sm:text-lg">Not what you post. Pathwai gives accelerators, alumni groups and member organizations a branded home, and helps members find the right people inside it.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/signup" className="btn-primary" data-testid="about-signup">Get started</Link>
            <Link to="/hub" className="btn-ghost border border-line" data-testid="about-hub">Browse communities</Link>
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <p className="eyebrow">Explore</p>
          <button type="button" className="text-sm text-muted underline underline-offset-2 hover:text-ink" data-testid="about-toggle-all"
            onClick={() => setOpen(allOpen ? [] : ALL)}>{allOpen ? "Close all" : "Open all"}</button>
        </div>

        <div className="border-b border-line">
          <Row id="what" n={1} title="What it is" summary="A branded home for your network, with smart introductions built in."
            lede="A white-label platform for running a member community. Each community keeps its own members, events and look. Members keep one login." {...R("what")}>
            <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
              {[["Directory", "Searchable profiles with pitch cards, offers and asks."],
                ["Matching", "Suggested introductions, each with a reason."],
                ["Operations", "Events, news, perks, approvals and messages in one admin."]].map(([t, d]) => (
                <div key={t} className="bg-surface p-5">
                  <p className="font-display text-lg">{t}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
                </div>
              ))}
            </div>
          </Row>

          <Row id="who" n={2} title="Who it's for" summary="Gated networks of founders, professionals and members."
            lede="Networks that need members to find each other, not just find content. Less suited if your main goal is selling courses or growing a large public audience." {...R("who")}>
            <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
              {AUDIENCES.map(([t, d]) => (
                <div key={t} className="bg-surface p-5">
                  <p className="text-base font-semibold">{t}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
                </div>
              ))}
            </div>
          </Row>

          <Row id="how" n={3} title="How it works" summary="Profile, match, run. Three steps."
            lede="Members do a few minutes of setup. After that, introductions and community operations mostly run themselves." {...R("how")}>
            <ol className="divide-y divide-line border-y border-line">
              {STEPS.map(([t, d], i) => (
                <li key={t} className="flex gap-5 py-5">
                  <span className="stat flex h-9 w-9 flex-none items-center justify-center rounded-full border border-line text-sm">{i + 1}</span>
                  <span><span className="block text-base font-semibold">{t}</span><span className="mt-1 block text-sm leading-relaxed text-muted">{d}</span></span>
                </li>
              ))}
            </ol>
          </Row>

          <Row id="market" n={4} title="Competitors" summary="Community platforms, association software, learning tools and free chat apps."
            lede="Plenty of good tools exist. Here is who we get compared to, and how each one differs. Costs are relative, from $ to $$$$." {...R("market")}>
            <div className="space-y-8">
              {COMPETITORS.map((g) => (
                <div key={g.group}>
                  <h3 className="text-base font-semibold" style={{ textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-sans)", fontWeight: 600 }}>{g.group}</h3>
                  <p className="mt-1 text-sm text-muted">{g.blurb}</p>
                  <ul className="mt-3 divide-y divide-line border-y border-line">
                    {g.items.map(([name, forWho, price, how]) => (
                      <li key={name} className="grid gap-1 py-4 sm:grid-cols-12 sm:gap-6">
                        <div className="sm:col-span-4">
                          <p className="text-sm font-semibold">{name}</p>
                          <p className="text-xs text-muted">{forWho} · <span className="font-semibold text-ink/80" title="Relative cost">{price}</span></p>
                        </div>
                        <p className="text-sm leading-relaxed text-muted sm:col-span-8">{how}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-5 text-xs text-muted">{PRICE_NOTE}</p>
          </Row>

          <Row id="diff" n={5} title="Why Pathwai" summary="Introductions first, built for networks, branded per community."
            lede="We are not trying to be the biggest platform. We are trying to be the best one for networks that run on relationships." {...R("diff")}>
            <ul className="divide-y divide-line border-y border-line">
              {EDGES.map(([t, d]) => (
                <li key={t} className="flex gap-4 py-5">
                  <ArrowRight className="mt-1 h-4 w-4 flex-none" />
                  <span><span className="block text-base font-semibold">{t}</span><span className="mt-1 block text-sm leading-relaxed text-muted">{d}</span></span>
                </li>
              ))}
            </ul>

            <div className="mt-8 overflow-x-auto rounded-xl border border-line" data-testid="about-matrix">
              <table className="w-full min-w-[36rem] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="p-3 font-medium text-muted">At a glance</th>
                    {MATRIX.cols.map((c, i) => <th key={c} scope="col" className={cx("p-3 text-center font-semibold", i === 0 && "bg-ink/[.07]")}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {MATRIX.rows.map(([label, ...v]) => (
                    <tr key={label} className="border-b border-line/60 last:border-0">
                      <th scope="row" className="p-3 font-normal">{label}</th>
                      {v.map((x, i) => <td key={i} className={cx("p-3 text-center", i === 0 && "bg-ink/[.07]")}><Mark v={x} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted">Honest note: payments and courses are not our focus, so use Stripe or your learning platform alongside Pathwai. Pathwai installs on a phone as an app today; a store listing is on the roadmap. Comparisons use public information and may have changed.</p>
          </Row>
        </div>

        <div className="py-16 text-center sm:py-24">
          <h2 className="mx-auto max-w-2xl text-3xl sm:text-5xl" style={{ textWrap: "balance" }}>See it with your network.</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/signup" className="btn-primary" data-testid="about-cta">Get started</Link>
            <Link to="/login" className="btn-ghost border border-line">Sign in</Link>
          </div>
        </div>
        <PoweredBy className="pb-10 text-center" />
      </main>
    </div>
  );
}
