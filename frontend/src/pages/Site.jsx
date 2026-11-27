import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ArrowUp, Check, Rocket, Search } from "../components/icons";
import { cx } from "../components/ui";
import { DEMO_PATH } from "../lib/demo";
import { Eyebrow, Glow, Pill, Section, SiteShell, WAITLIST } from "../components/SiteKit";
import { GrowthStages, HubWindow, ReportMock, ScatterToMap } from "../components/SiteVisuals";

// The website home page (shown at / to anyone who is signed out). About and Contact are their own pages (SiteAbout.jsx, SiteContact.jsx);
// header, footer and shared blocks live in components/SiteKit.jsx. Plain data arrays below, so copy edits are one-liners.
// Wording follows thepathwai.com.

// What the box in the hero cycles through, and the chips under it. Both open the demo.
const PROMPTS = ["I need to find my first customers", "Which grant should I apply for?", "Which investors back companies like mine?", "Who can give me feedback on my pitch?", "What should I do in the next 90 days?"];
const STARTS = ["Funding", "Investors", "Mentors", "Events", "People", "Resources"];

const STEPS = [
  ["Load your hub", "Your programs, events and people go in once. We do the loading with you."],
  ["Founders arrive", "Each founder builds a profile and gets matched, your hub first."],
  ["Advisors focus", "Routine questions are answered. Your team takes the rest."],
];

const TABS = [["match", "The match"], ["profile", "The profile"], ["plan", "The plan"]];

/* ---------- the product story: three short, made-up screens ---------- */

function Match() {
  const rows = [
    ["1", "Apply to the seed funding round", "Closes Dec 2 · Fits your stage and sector, and gives you the funding you asked for.", "Good match now"],
    ["2", "Meet the utility partnerships mentor", "Has sold to Canadian utilities. Covers first pilots, which you asked for.", "Good match now"],
    ["3", "Meet an angel who backs early climate hardware", "Invests in Ontario pre-seed teams. Wants a clear ask and a pilot story first.", "Good match now"],
    ["4", "Go to the founders and utilities mixer", "Thu, 6:00 PM · You will meet three buyers. Does not cover fundraising.", "Almost"],
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
  const cols = [["Next 2 weeks", ["Book the utility mentor", "Draft the one-page pilot offer"]], ["30 days", ["Apply to the seed funding round", "Run two utility discovery calls"]], ["90 days", ["Sign a pilot letter of intent", "Open the seed conversation with an investor"]]];
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
  const [tab, setTab] = useState("match");
  const View = { match: Match, profile: Profile, plan: Plan }[tab];
  return (
    <div data-testid="story">
      <div role="tablist" aria-label="Product story" className="mx-auto grid max-w-md grid-cols-3 gap-1 rounded-full border border-line bg-ink/[.05] p-1">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} data-testid={`story-tab-${k}`} onClick={() => setTab(k)}
            className={cx("truncate rounded-full px-3 py-2 text-sm font-medium", tab === k ? "glass-active text-ink" : "text-muted hover:text-ink")}>{label}</button>
        ))}
      </div>
      <div className="mt-8"><View /></div>
    </div>
  );
}

function AskBox() {
  const nav = useNavigate();
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % PROMPTS.length), 3400); return () => clearInterval(t); }, []);
  return (
    <div className="mx-auto mt-12 max-w-2xl text-left" data-testid="site-ask">
      <form onSubmit={(e) => { e.preventDefault(); nav(DEMO_PATH); }} className="glass-bar rounded-[1.75rem] p-2.5">
        <div className="flex items-center gap-3 px-3 py-2">
          <Search className="h-5 w-5 shrink-0 text-muted" aria-hidden />
          <label htmlFor="site-ask-input" className="sr-only">Ask Pathwai</label>
          <input id="site-ask-input" readOnly onFocus={() => nav(DEMO_PATH)} placeholder={PROMPTS[i]} className="min-w-0 flex-1 cursor-pointer bg-transparent text-base outline-none placeholder:text-muted sm:text-lg" />
          <button type="submit" aria-label="Try it in the demo" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-paper"><ArrowUp className="h-4 w-4" aria-hidden /></button>
        </div>
      </form>
      <p className="mt-6 text-center text-xs text-muted">Or start here</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {STARTS.map((t) => <Link key={t} to={DEMO_PATH} className="chip hit !px-4 !py-2 text-sm hover:text-ink">{t}</Link>)}
      </div>
      <p className="mt-5 text-center text-xs text-muted">Opens the demo with sample data.</p>
    </div>
  );
}

/* ---------- the page ---------- */

export default function Site() {
  return (
    <SiteShell>
      {/* hero */}
      <section className="px-4 pb-8 pt-10 text-center sm:px-6 sm:pb-10 sm:pt-16">
        <div className="mx-auto max-w-5xl">
          <h1 className="mx-auto text-[2.6rem] leading-[1.05] sm:text-7xl lg:text-8xl" style={{ textWrap: "balance" }}>
            A venture advisor for every innovation hub.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted sm:mt-5 sm:text-xl">Pathwai gives every hub its own venture advisor, and links them into one national system.</p>
          <AskBox />
          <div className="mx-auto mt-7 grid max-w-sm grid-cols-2 gap-3 sm:flex sm:max-w-none sm:flex-wrap sm:items-center sm:justify-center">
            <Link to="/contact" className="btn-primary col-span-2 !px-6 !py-3 text-base sm:col-span-1" data-testid="site-incubators">Bring Pathwai to your hub<ArrowRight className="h-4 w-4" aria-hidden /></Link>
            <Link to={DEMO_PATH} className="btn-ghost !px-6 !py-3 text-base" data-testid="site-demo">Try the demo</Link>
            <Link to="/navigator" className="btn-ghost !px-6 !py-3 text-base" data-testid="site-founders">For founders</Link>
          </div>
        </div>
        <HubWindow />
      </section>

      <Glow />

      <Section id="problem" eyebrow="The problem" title="Support is everywhere. No one can see all of it.">
        <ScatterToMap />
      </Section>

      <Glow />

      <Section id="see" eyebrow="See it in action" title="Watch the product come alive." sub="From the match to the plan.">
        <Story />
      </Section>

      <Section id="proof" eyebrow="Proof for your funders" title="The numbers your funders ask for, ready to send." sub="Members active, introductions made, events held, perks used. Measured from your own hub, never guessed.">
        <ReportMock />
      </Section>

      <Section id="network" eyebrow="How it grows" title="One hub at a time. One national system in the end." sub="Each hub keeps its own advisor. Together they become one network.">
        <GrowthStages />
      </Section>

      <Section id="start" eyebrow="Starting a hub" title="Set up once. Advise all year.">
        <ol className="grid gap-4 sm:grid-cols-3" data-testid="site-steps">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="card flex flex-col gap-2 !p-7"><p className="eyebrow">Step {String(i + 1).padStart(2, "0")}</p><h3 className="mt-3 text-2xl">{t}</h3><p className="text-sm text-muted">{d}</p></li>
          ))}
        </ol>
      </Section>

      <Glow />

      <section className="px-4 pb-14 pt-4 text-center sm:px-6 sm:pb-20">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-9">
          <h2 className="text-4xl sm:text-6xl" style={{ textWrap: "balance" }}>Give every hub a venture advisor.</h2>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/contact" className="btn-primary !px-6 !py-3" data-testid="site-hubs-end">Bring Pathwai to your hub<ArrowRight className="h-4 w-4" aria-hidden /></Link>
            <a href={WAITLIST} className="btn-ghost !px-6 !py-3" data-testid="site-waitlist-end">Join the waitlist</a>
            <Link to={DEMO_PATH} className="btn-ghost !px-6 !py-3" data-testid="site-demo-end"><Rocket className="h-4 w-4" aria-hidden />Try the demo</Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
