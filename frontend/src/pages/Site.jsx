import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Building2, Check, Clock, Compass, Layers, Rocket, Search, Sparkles, Target, Users } from "lucide-react";
import { cx } from "../components/ui";
import { startHubDemo } from "../lib/demo";
import { Eyebrow, Num, Pill, Section, SiteShell, WAITLIST } from "../components/SiteKit";

// The website home page (shown at / to anyone who is signed out). About and Contact are their own pages (SiteAbout.jsx, SiteContact.jsx);
// header, footer and shared blocks live in components/SiteKit.jsx. Plain data arrays below, so copy edits are one-liners.
// Wording follows thepathwai.com.

const FLOW = [
  [Layers, "Business context", "Where the business is heading"],
  [Compass, "Opportunities", "Programs and funding that fit"],
  [Users, "People", "Mentors, funders and peers"],
  [BookOpen, "Resources", "Guides, templates and perks"],
  [Target, "Clarity", "Why it matters, what to do next"],
];

const TOUR = [
  ["Business context", "Start with the business trajectory, its goals, and current needs."],
  ["Relevant support", "Match that context with opportunities and people in the community."],
  ["Context & clarity", "Show founders why a match matters and what to explore next."],
  ["Advisor capacity", "Less routine discovery. More time for complex founder needs."],
];

const CHALLENGE = [
  [Search, "Founders", "Can't see what fits."],
  [Users, "Advisors", "Repeat the same answers."],
  [Building2, "Incubators", "Stretched thin."],
];

const SIDES = [
  { tag: "For founders", title: "Find your way.", sub: "Self-service, matched to you.", items: ["Opportunities matched to you", "The right people", "Why each match matters", "Sharper advisor questions"] },
  { tag: "For advisors", title: "Get time back.", sub: "Focus where it matters.", items: ["Less routine work", "Programs easy to find", "Time for complex needs", "More founders, same team"] },
];

const STEPS = [
  ["Discover directly", "Explore support directly."],
  ["Understand the fit", "See what fits the business."],
  ["Seek deeper help", "Bring focused questions."],
];

const TABS = [["problem", "The problem"], ["match", "The match"], ["profile", "The profile"], ["plan", "The plan"]];

/* ---------- the product story: four short, made-up screens ---------- */

function Problem() {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2" data-testid="story-problem">
      <div>
        <Eyebrow>The problem</Eyebrow>
        <h3 className="mt-3 text-3xl font-bold sm:text-4xl" style={{ textWrap: "balance" }}>Canada's ecosystem is unnavigable.</h3>
        <ul className="mt-5 space-y-2.5 text-base text-muted">
          {["Scattered across hundreds of portals", "No way to know what's relevant or timely", "1.07M SMBs. Zero shared map."].map((t) => (
            <li key={t} className="flex items-start gap-2.5"><Check className="mt-1 h-4 w-4 shrink-0 text-ink" aria-hidden />{t}</li>
          ))}
        </ul>
      </div>
      <div className="card text-center">
        <Eyebrow>The navigation tax</Eyebrow>
        <p className="stat mt-4 text-6xl sm:text-7xl">6.4M+</p>
        <p className="mt-2 text-sm font-semibold uppercase text-muted" style={{ letterSpacing: "0.14em" }}>Hours a year</p>
        <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-line px-4 py-1.5 text-sm"><Clock className="h-4 w-4" aria-hidden />About $320M lost to navigation, every year</p>
        <div className="mt-6 grid grid-cols-3 gap-2 text-xs text-muted" aria-hidden>
          {["Communities", "Startups", "Resources", "Funding", "Collaboration", "Investment"].map((t) => <span key={t} className="rounded-xl border border-dashed border-line px-2 py-2">{t}</span>)}
        </div>
      </div>
    </div>
  );
}

function Match() {
  const rows = [
    ["1", "Apply to the seed funding round", "Closes Dec 2 · Fits your stage and sector, and gives you the funding you asked for.", "Good match now"],
    ["2", "Meet the utility partnerships mentor", "Has sold to Canadian utilities. Covers first pilots, which you asked for.", "Good match now"],
    ["3", "Go to the founders and utilities mixer", "Thu, 6:00 PM · You will meet three buyers. Does not cover fundraising.", "Almost"],
  ];
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2" data-testid="story-match">
      <div>
        <Eyebrow>The match</Eyebrow>
        <h3 className="mt-3 text-3xl font-bold sm:text-4xl" style={{ textWrap: "balance" }}>Relevant support, explained.</h3>
        <p className="mt-4 max-w-md text-base text-muted">Every program, person and resource is checked against the founder's business. Each match says why it fits and what to confirm first.</p>
      </div>
      <div className="card">
        <Eyebrow>Do these next</Eyebrow>
        <ul className="mt-4 space-y-3">
          {rows.map(([n, t, d, tag]) => (
            <li key={n} className="flex items-start gap-3 rounded-2xl bg-ink/[.04] p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-paper">{n}</span>
              <span className="min-w-0"><span className="block text-sm font-semibold">{t}</span><span className="mt-0.5 block text-xs text-muted">{d}</span><span className="mt-2 inline-block"><Pill tone={tag === "Almost" ? "blue" : "green"}>{tag}</Pill></span></span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Profile() {
  const skills = [["Hardware", 95], ["Climate tech", 88], ["Fundraising", 80]];
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2" data-testid="story-profile">
      <div>
        <Eyebrow>The profile</Eyebrow>
        <h3 className="mt-3 text-3xl font-bold sm:text-4xl" style={{ textWrap: "balance" }}>One profile. Every program.</h3>
        <p className="mt-4 text-base text-muted">A living profile that follows you across every program.</p>
        <ul className="mt-5 space-y-2.5 text-base text-muted">
          {["Follows you across programs", "Discoverable to the ecosystem", "Always yours"].map((t) => <li key={t} className="flex items-start gap-2.5"><Check className="mt-1 h-4 w-4 shrink-0 text-ink" aria-hidden />{t}</li>)}
        </ul>
      </div>
      <div className="card">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-sm font-bold" style={{ color: "var(--on-accent)" }}>AJ</span>
          <span><span className="block font-semibold">Amara Johnson</span><span className="block text-xs text-muted">Founder · VoltGrid · Toronto</span></span>
          <span className="ml-auto hidden gap-1.5 sm:flex"><Pill tone="gray">Open to programs</Pill><Pill tone="gray">Funding</Pill></span>
        </div>
        <p className="mt-4 text-sm">Grid-scale battery storage helping Canadian utilities integrate renewables.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-2xl bg-ink/[.04] p-3"><p className="eyebrow">Stage</p><p className="mt-1 text-sm font-semibold">Seed</p></div>
          <div className="rounded-2xl bg-ink/[.04] p-3"><p className="eyebrow">Region</p><p className="mt-1 text-sm font-semibold">Ontario</p></div>
        </div>
        <div className="mt-4 space-y-2.5">
          {skills.map(([s, v]) => (
            <div key={s}><div className="flex justify-between text-xs"><span>{s}</span><span className="text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>{v}%</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-ink/10"><div className="h-full rounded-full bg-accent" style={{ width: `${v}%` }} /></div></div>
          ))}
        </div>
        <p className="mt-4 text-[11px] text-muted">Sample profile. Made up for illustration.</p>
      </div>
    </div>
  );
}

function Plan() {
  const cols = [["Next 2 weeks", ["Book the utility mentor", "Draft the one-page pilot offer"]], ["30 days", ["Apply to the seed funding round", "Run two utility discovery calls"]], ["90 days", ["Sign a pilot letter of intent", "Open the seed conversation"]]];
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2" data-testid="story-plan">
      <div>
        <Eyebrow>The plan</Eyebrow>
        <h3 className="mt-3 text-3xl font-bold sm:text-4xl" style={{ textWrap: "balance" }}>Leave with a decision.</h3>
        <p className="mt-4 max-w-md text-base text-muted">The founder picks a direction, in their own words. Pathwai turns it into a plan built from the programs, events and people in your community. They start it alone, or share it with an advisor.</p>
      </div>
      <div className="card">
        <Eyebrow>Decision</Eyebrow>
        <p className="mt-2 text-lg font-semibold leading-snug">Win a utility pilot first, then raise the seed round.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {cols.map(([h, items]) => (
            <div key={h} className="rounded-2xl bg-ink/[.04] p-3">
              <p className="text-xs font-semibold">{h}</p>
              <ul className="mt-2 space-y-1.5 text-xs text-muted">{items.map((i) => <li key={i}>{i}</li>)}</ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Story() {
  const [tab, setTab] = useState("problem");
  const View = { problem: Problem, match: Match, profile: Profile, plan: Plan }[tab];
  return (
    <div data-testid="story">
      <div role="tablist" aria-label="Product story" className="grid max-w-xl grid-cols-2 gap-1 rounded-[1.5rem] border border-line bg-ink/[.05] p-1 sm:grid-cols-4 sm:rounded-full">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} data-testid={`story-tab-${k}`} onClick={() => setTab(k)}
            className={cx("truncate rounded-full px-3 py-2 text-sm font-medium", tab === k ? "glass-active text-ink" : "text-muted hover:text-ink")}>{label}</button>
        ))}
      </div>
      <div className="mt-8"><View /></div>
    </div>
  );
}

/* ---------- the page ---------- */

export default function Site() {
  return (
    <SiteShell>
      {/* hero */}
      <section className="px-4 pb-10 pt-16 text-center sm:px-6 sm:pt-24">
        <div className="mx-auto max-w-5xl">
          <span className="chip mx-auto !px-4 !py-1.5 text-[11px] font-semibold uppercase" style={{ letterSpacing: "0.14em" }}>Founder self-service for incubators</span>
          <h1 className="mx-auto mt-6 text-5xl sm:text-6xl lg:text-7xl" style={{ textWrap: "balance" }}>
            Founders find support.<br /><span className="text-muted">Advisors get time back.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted sm:text-xl">Pathwai is a personal venture planner for every founder in your incubator. It matches their business to the programs, people and resources around them, and helps them leave with a decision plan.</p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <a href={WAITLIST} className="btn-primary !px-6 !py-3 text-base" data-testid="site-waitlist">Join the waitlist<ArrowRight className="h-4 w-4" aria-hidden /></a>
            <button type="button" onClick={startHubDemo} className="btn-ghost !px-6 !py-3 text-base" data-testid="site-demo">Try the demo</button>
            <Link to="/about" className="btn-ghost !px-6 !py-3 text-base" data-testid="site-incubators">For incubators</Link>
          </div>
        </div>
        <ol className="mx-auto mt-14 grid max-w-6xl grid-cols-2 gap-px overflow-hidden rounded-[1.5rem] border border-line bg-line/60 text-left sm:grid-cols-3 lg:grid-cols-5" data-testid="site-flow">
          {FLOW.map(([Icon, t, d], i) => (
            <li key={t} className={cx("bg-surface/80 p-4 backdrop-blur sm:p-5", i === 4 && "col-span-2 sm:col-span-1")}>
              <div className="flex items-center justify-between"><Num n={i + 1} /><Icon className="h-4 w-4 text-muted" aria-hidden /></div>
              <p className="mt-4 text-sm font-bold uppercase" style={{ letterSpacing: "0.04em" }}>{t}</p>
              <p className="mt-1 text-xs text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <Section id="see" eyebrow="See it in action" title="Watch the product come alive." sub="A four-part story, from the pain to the payoff.">
        <Story />
      </Section>

      <Section id="tour" eyebrow="Product tour" title="Relevant support, explained." sub="Built around where each founder's business is heading." className="border-t border-line/60">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="site-tour">
          {TOUR.map(([t, d], i) => (
            <li key={t} className="card flex flex-col gap-2"><Num n={i + 1} /><h3 className="text-lg font-bold">{t}</h3><p className="text-sm text-muted">{d}</p></li>
          ))}
        </ol>
      </Section>

      <Section id="challenge" eyebrow="The challenge" title="Support exists. Founders can't see it." className="border-t border-line/60">
        <div className="grid gap-4 sm:grid-cols-3" data-testid="site-challenge">
          {CHALLENGE.map(([Icon, who, line]) => (
            <div key={who} className="card"><Icon className="h-5 w-5 text-muted" aria-hidden /><p className="eyebrow mt-4">{who}</p><p className="mt-1 text-xl font-bold leading-snug">{line}</p></div>
          ))}
        </div>
        <p className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-lg font-semibold"><span>What is available?</span><span className="text-muted">Who can help?</span></p>
      </Section>

      <Section id="sides" eyebrow="Two sides" title="For founders. For advisors." className="border-t border-line/60">
        <div className="grid gap-4 lg:grid-cols-2" data-testid="site-sides">
          {SIDES.map((s) => (
            <div key={s.tag} className="card !p-6 sm:!p-8">
              <Eyebrow>{s.tag}</Eyebrow>
              <p className="mt-2 text-3xl font-bold sm:text-4xl">{s.title}</p>
              <p className="mt-1 text-muted">{s.sub}</p>
              <ul className="mt-6 space-y-2.5">{s.items.map((t) => <li key={t} className="flex items-start gap-2.5 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t}</li>)}</ul>
            </div>
          ))}
        </div>
      </Section>

      <Section id="selfservice" eyebrow="Founder self-service" title="Discover. Understand. Ask." className="border-t border-line/60">
        <ol className="grid gap-4 sm:grid-cols-3" data-testid="site-steps">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="card flex flex-col gap-2"><p className="eyebrow">Step {String(i + 1).padStart(2, "0")}</p><h3 className="text-xl font-bold">{t}</h3><p className="text-sm text-muted">{d}</p></li>
          ))}
        </ol>
      </Section>

      <section className="px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="card mx-auto flex max-w-6xl flex-col items-center gap-7 !p-8 text-center sm:!p-14">
          <Sparkles className="h-6 w-6 text-muted" aria-hidden />
          <h2 className="max-w-3xl text-3xl sm:text-5xl" style={{ textWrap: "balance" }}>Give every founder a way to find their next step.</h2>
          <div className="flex flex-wrap justify-center gap-3">
            <a href={WAITLIST} className="btn-primary !px-6 !py-3" data-testid="site-waitlist-end">Join the waitlist<ArrowRight className="h-4 w-4" aria-hidden /></a>
            <button type="button" onClick={startHubDemo} className="btn-ghost !px-6 !py-3" data-testid="site-demo-end"><Rocket className="h-4 w-4" aria-hidden />Try the demo</button>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
