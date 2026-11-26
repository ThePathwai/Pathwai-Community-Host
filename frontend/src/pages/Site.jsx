import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ArrowUp, Briefcase, Building2, Check, Compass, Layers, Rocket, Search, Target, TrendingUp, Users } from "../components/icons";
import { cx } from "../components/ui";
import { DEMO_PATH } from "../lib/demo";
import { Eyebrow, Glow, Growth, Num, Pill, Section, SiteShell, WAITLIST } from "../components/SiteKit";

// The website home page (shown at / to anyone who is signed out). About and Contact are their own pages (SiteAbout.jsx, SiteContact.jsx);
// header, footer and shared blocks live in components/SiteKit.jsx. Plain data arrays below, so copy edits are one-liners.
// Wording follows thepathwai.com.

const FLOW = [
  [Building2, "Your hub", "Programs, events and people, loaded once"],
  [Layers, "Each founder", "Business, stage and what they need"],
  [Compass, "The match", "What fits, and why"],
  [Target, "The next move", "A plan with the first step marked"],
  [Users, "Your advisors", "Free for the hard conversations"],
];

const TOUR = [
  [Building2, "For hubs", "Your hub's own advisor", "Load your programs, events and people once. Pathwai answers the routine questions from your own catalogue."],
  [Layers, "For founders", "Business context", "Start with the business trajectory, its goals, and current needs."],
  [Compass, "For founders", "Relevant support", "Match that context with your hub's programs first, then the wider ecosystem."],
  [TrendingUp, "For founders", "Investor introductions", "Find the angels and venture funds that back this stage and sector, and arrive with a clear ask."],
  [Users, "For advisors", "Advisor capacity", "Less routine discovery. More time for complex founder needs."],
  [Briefcase, "For investors", "Founders worth meeting", "See who is building what, with a pitch and a plan on each profile, and meet the ones founders choose to introduce."],
];

// What the box in the hero cycles through, and the chips under it. Both open the demo.
const PROMPTS = ["I need to find my first customers", "Which grant should I apply for?", "Which investors back companies like mine?", "Who can give me feedback on my pitch?", "What should I do in the next 90 days?"];
const STARTS = ["Funding", "Investors", "Mentors", "Events", "People", "Resources"];

const SIDES = [
  { tag: "For hubs", title: "A venture advisor on call.", sub: "Your programs, events and people, put to work.", items: ["Answers the routine questions at intake", "Matches each founder to your programs first", "Plans the next steps with the founder", "Your team keeps the hard conversations"] },
  { tag: "For founders", title: "Know your next move.", sub: "Matched to you, and to the hub behind you.", items: ["Programs, grants and events that fit", "Mentors and investors who back your stage", "Why each match matters", "A plan, not a list"] },
  { tag: "For the ecosystem", title: "One system, hub to hub.", sub: "Stronger with every hub that joins.", items: ["Founders carry their profile between hubs, when they choose", "Hubs refer founders to each other", "Investors meet founders their hub already knows", "One national picture of innovation support"] },
];

const STEPS = [
  ["Load your hub", "Your programs, events and people go in once. We do the loading with you."],
  ["Founders arrive", "Each founder builds a profile and gets matched, your hub first."],
  ["Advisors focus", "Routine questions are answered. Your team takes the rest."],
];

// The two sides of the problem, in words (no figures). Edit the copy here.
const PROBLEM = [
  { tag: "The founder's side", title: "Searching, again and again.", body: "Grants, programs, mentors and events sit in hundreds of different places, each with its own rules and dates. Founders piece it together alone, in the gaps between building the business.",
    items: ["Eligibility is buried in the fine print", "Deadlines pass before anyone notices", "No way to tell what fits right now"] },
  { tag: "The innovation team's side", title: "Answering, again and again.", body: "Advisors field the same questions at every intake: what is out there, who qualifies, what to do first. Real expertise gets spent on directions a good map could give.",
    items: ["Intake calls cover the basics, not strategy", "Referrals depend on who remembers what", "Hard to show founders were pointed to the right help"] },
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
          {["Scattered across hundreds of portals", "No way to know what's relevant or timely", "Every program has its own rules, dates and forms"].map((t) => (
            <li key={t} className="flex items-start gap-2.5"><Check className="mt-1 h-4 w-4 shrink-0 text-ink" aria-hidden />{t}</li>
          ))}
        </ul>
      </div>
      <div className="card text-center">
        <Eyebrow>Where founders have to look</Eyebrow>
        <p className="mt-4 text-3xl font-light sm:text-4xl" style={{ letterSpacing: "-0.03em", textWrap: "balance" }}>Hundreds of places. <span className="text-muted">No single map.</span></p>
        <div className="mt-6 grid grid-cols-2 gap-2 text-xs text-muted sm:grid-cols-3" aria-hidden>
          {["Federal grants", "Provincial programs", "Local hubs", "Accelerators", "Tax credits", "Mentor lists"].map((t) => <span key={t} className="rounded-xl border border-dashed border-line px-2 py-2.5">{t}</span>)}
        </div>
        <p className="mx-auto mt-6 max-w-xs text-sm text-muted">Same questions. Different portals. Answers that rarely fit the business.</p>
      </div>
    </div>
  );
}

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

// The problem, told from both sides in plain words: the founder who keeps searching and the team that keeps answering.
function ProblemSection() {
  return (
    <Section id="problem" eyebrow="The problem" title="Entrepreneurs spend valuable time finding support. Innovation teams spend valuable resources delivering it.">
      <div className="grid gap-4 lg:grid-cols-2" data-testid="site-problem">
        {PROBLEM.map((p) => (
          <div key={p.tag} className="card !p-7 sm:!p-10">
            <Eyebrow>{p.tag}</Eyebrow>
            <p className="mt-3 text-3xl font-light sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>{p.title}</p>
            <p className="mt-3 text-muted">{p.body}</p>
            <ul className="mt-6 space-y-3">{p.items.map((t) => <li key={t} className="flex items-start gap-3 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />{t}</li>)}</ul>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-10 max-w-3xl text-center text-2xl font-light leading-snug text-muted sm:text-4xl" style={{ letterSpacing: "-0.03em", textWrap: "balance" }} data-testid="site-problem-bridge">
        Both sides are working hard. <span className="text-ink">What is missing is an advisor that knows your hub, and the business.</span>
      </p>
    </Section>
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
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted sm:mt-5 sm:text-xl">Pathwai gives each hub its own venture advisor. It knows the hub's programs, events and people, reads each founder's business, and points them to the right next step. Your team keeps the conversations that need a person. As more hubs join, it becomes one national system.</p>
          <AskBox />
          <div className="mx-auto mt-7 grid max-w-sm grid-cols-2 gap-3 sm:flex sm:max-w-none sm:flex-wrap sm:items-center sm:justify-center">
            <Link to="/contact" className="btn-primary col-span-2 !px-6 !py-3 text-base sm:col-span-1" data-testid="site-incubators">Bring Pathwai to your hub<ArrowRight className="h-4 w-4" aria-hidden /></Link>
            <Link to={DEMO_PATH} className="btn-ghost !px-6 !py-3 text-base" data-testid="site-demo">Try the demo</Link>
            <Link to="/navigator" className="btn-ghost !px-6 !py-3 text-base" data-testid="site-founders">For founders</Link>
          </div>
        </div>
        <ol className="mx-auto mt-12 grid max-w-6xl grid-cols-2 overflow-hidden rounded-[1.6rem] border border-line/60 text-left sm:grid-cols-3 lg:grid-cols-5" data-testid="site-flow">
          {FLOW.map(([Icon, t, d], i) => (
            <li key={t} className={cx("border-line/60 p-5 sm:p-6", i % 2 === 0 && "border-r max-sm:border-r", i < 4 && "border-b lg:border-b-0", i < FLOW.length - 1 && "lg:border-r", i === 4 && "col-span-2 border-t border-r-0 sm:col-span-1 sm:border-t-0")}>
              <div className="flex items-center justify-between"><Num n={i + 1} /><Icon className="h-4 w-4 text-muted" aria-hidden /></div>
              <p className="mt-6 text-sm font-medium">{t}</p>
              <p className="mt-1 text-xs text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <Glow />

      {/* the statement: one large light paragraph with the key phrase picked out */}
      <section className="px-4 py-12 text-center sm:px-6 sm:py-16" data-testid="site-statement">
        <div className="mx-auto grid max-w-md gap-3 text-left sm:hidden" data-testid="site-statement-cards">
          {[["The gap", "Every hub holds real support, scattered across hundreds of portals.", false], ["The cost", "Founders can't see what fits, and advisors keep repeating the same answers.", false], ["The fix", "Pathwai is the venture advisor inside your hub. It reads the business and shows what fits, and why.", true]].map(([tag, line, hot]) => (
            <div key={tag} className="card !p-5"><p className="eyebrow">{tag}</p><p className={cx("mt-2 text-xl font-light leading-snug", hot ? "text-ink" : "text-muted")} style={{ letterSpacing: "-0.02em" }}>{line}</p></div>
          ))}
        </div>
        <p className="mx-auto hidden max-w-4xl text-3xl font-light leading-[1.3] text-muted sm:block sm:text-[2.6rem] sm:leading-[1.25]" style={{ letterSpacing: "-0.03em", textWrap: "balance" }}>
          Every hub holds real support, and <span className="text-ink">no founder can see all of it</span>. Advisors keep repeating the same answers. Pathwai is the venture advisor that knows your hub and reads what a founder is building, so it can <span className="text-ink">show what fits, and why.</span>
        </p>
      </section>

      <ProblemSection />

      <Glow />

      <Section id="see" eyebrow="See it in action" title="Watch the product come alive." sub="A four-part story, from the pain to the payoff.">
        <Story />
      </Section>

      <Section id="tour" eyebrow="Product tour" title="Relevant support, explained." sub="Built around your hub, and where each founder's business is heading.">
        <ol className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3" data-testid="site-tour">
          {TOUR.map(([Icon, tag, t, d]) => (
            <li key={t} className="card flex flex-col gap-3 !p-4 sm:!p-6">
              <div className="flex items-center justify-between"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink/10"><Icon className="h-4 w-4" aria-hidden /></span><span className="chip !px-2.5 !py-0.5 text-[11px]">{tag}</span></div>
              <h3 className="mt-3 text-lg">{t}</h3><p className="text-sm text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="sides" eyebrow="Two sides" title="For hubs. For founders. For the ecosystem.">
        <div className="grid gap-4 lg:grid-cols-3" data-testid="site-sides">
          {SIDES.map((s) => (
            <div key={s.tag} className="card !p-7 sm:!p-10">
              <Eyebrow>{s.tag}</Eyebrow>
              <p className="mt-3 text-4xl font-light sm:text-5xl lg:text-3xl xl:text-4xl" style={{ letterSpacing: "-0.035em", textWrap: "balance" }}>{s.title}</p>
              <p className="mt-2 text-muted">{s.sub}</p>
              <ul className="mt-8 space-y-3">{s.items.map((t) => <li key={t} className="flex items-start gap-3 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />{t}</li>)}</ul>
            </div>
          ))}
        </div>
      </Section>

      <Section id="network" eyebrow="How it grows" title="One hub at a time. One national system in the end." sub="Each hub keeps its own advisor. Together they become one network.">
        <Growth />
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
