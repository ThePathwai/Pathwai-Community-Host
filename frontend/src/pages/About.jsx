import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Minus, Plus, X } from "lucide-react";
import { Wordmark, PoweredBy, cx } from "../components/ui";
import ReportView from "../components/ReportView";
import { startAdminDemo } from "../lib/demo";
import { REPORT_TYPES, buildReport, sampleInstagram, sampleMetrics, withInstagram } from "../lib/sampleReport";

// /about -- public (no login). Written for the person who runs a community, because they are the buyer:
// three promises, a sample report you can read right here, then who it's for, how it works and how it compares.
// Plain data below so copy edits are one-liners.

const AUDIENCES = [
  ["Accelerators & incubators", "Cohorts need founders to find the right peer, mentor or customer fast. Pathwai introduces them and explains why."],
  ["Professional & alumni networks", "Keep a large, gated membership useful after the welcome email: directory, intros, events and perks in one place."],
  ["Community & cultural organizations", "Events, news and member benefits for people who share an identity, a mission or a neighbourhood."],
  ["Programs & learning cohorts", "Pair it with the learning tool you already use. Pathwai handles the people side: who is in your cohort and who to meet."],
];

const PROMISES = [
  ["Members stay", "Every introduction comes with a reason, so people meet the right person instead of scrolling. Welcome them properly, say goodbye properly, and see who is drifting while there is still time to act.",
    "Introductions with a reason · onboarding and off-boarding · a going-quiet list with a one-tap nudge"],
  ["Everything about your community, in one place", "Members, events and RSVPs, perks, news, applications, messages and project teams, all in your own branded space. It replaces the spreadsheet, the group chat, the event page and the mailing list.",
    "One directory · events and turnout · perks · news · applications · teams"],
  ["Proof in one click", "Sponsors, funders and your board ask the same questions: who is in it, who is active, who showed up, what did it do. Pathwai counts the answers from your own records and hands you a report. Share a PDF, or a live link that stays current.",
    "Sponsor, funder and board reports · PDF or read-only live link · every number counted, never estimated"],
];

const STEPS = [
  ["Set up your community in an afternoon", "Your name, colours and logo. Import your members or invite them. Decide who gets in and what they see."],
  ["Members build a profile and get introduced", "Who they are, what they offer and what they are asking for. Pathwai suggests who to meet and says why, so a cold intro becomes a warm one."],
  ["You run it from one place, and see what is working", "Approve members, post events and news, add perks and message the community. The Impact view shows who is active, who is drifting and what turned out."],
  ["Send the proof when someone asks", "Pick sponsor, funder or board, choose the period, and download the PDF or share a live link. No spreadsheet-wrangling the night before."],
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
    ["Impact reports for sponsors and funders, shareable as a live link", "Y", "P", "P", "N", "P", "N"],
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
  ["Proof is built in", "Reports for sponsors, funders and boards come from the same records you already run the community on. Nothing to export, merge or chase."],
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

const NAV = [["promises", "Why Pathwai"], ["sample", "Sample report"], ["who", "Who it's for"], ["how", "How it works"], ["market", "Competitors"], ["diff", "Compare"]];
const OPEN_ROWS = ["who", "how", "market", "diff"]; // the rest of NAV are plain sections that are always showing
const ALL = OPEN_ROWS;

export default function About() {
  const [kind, setKind] = useState("sponsor");
  const [open, setOpen] = useState([]);
  useEffect(() => {
    document.title = "Pathwai: keep your members, prove your impact";
    const h = window.location.hash.replace("#", "");
    if (NAV.some(([k]) => k === h)) { if (ALL.includes(h)) setOpen([h]); setTimeout(() => document.getElementById(h)?.scrollIntoView({ behavior: "smooth" }), 80); }
    else window.scrollTo(0, 0);
  }, []);
  const toggle = (k) => setOpen((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));
  const jump = (k) => { if (ALL.includes(k)) setOpen((o) => (o.includes(k) ? o : [...o, k])); setTimeout(() => document.getElementById(k)?.scrollIntoView({ behavior: "smooth" }), 60); };
  const allOpen = open.length === ALL.length;
  const sample = useMemo(() => withInstagram(buildReport(kind, sampleMetrics({ members: 64, seed: "pathwai-sample", days: 90 }), "Northside Founders Club"), sampleInstagram("pathwai-sample")), [kind]);
  const R = (k) => ({ open: open.includes(k), onToggle: () => toggle(k) });

  return (
    <div className="w-full" data-testid="about">
      <header className="glass sticky top-0 z-30 border-b border-line/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 lg:px-8">
          <Link to="/" className="text-2xl"><Wordmark name="Pathwai" brand={{}} /></Link>
          <nav className="hidden items-center gap-6 whitespace-nowrap text-sm lg:flex" aria-label="About sections">
            {NAV.map(([k, label]) => <button key={k} type="button" onClick={() => jump(k)} className="text-muted hover:text-ink" data-testid={`about-nav-${k}`}>{label}</button>)}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="btn-ghost hidden whitespace-nowrap sm:inline-flex" data-testid="about-signin">Sign in</Link>
            <button type="button" onClick={() => startAdminDemo()} className="btn-primary whitespace-nowrap" data-testid="about-demo-top">Try the demo</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 lg:px-8">
        <div className="py-10 sm:py-16">
          <p className="eyebrow">For the people who run communities</p>
          <h1 className="mt-4 max-w-4xl text-4xl sm:text-5xl lg:text-6xl" style={{ textWrap: "balance" }}>Keep your members. Prove your impact.</h1>
          <p className="mt-6 max-w-2xl text-base text-muted sm:text-lg">Pathwai is the home for your accelerator, alumni group, club or congregation: members, events, perks and introductions in one place, and a report your sponsors, funders and board will trust, one click away.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => startAdminDemo()} className="btn-primary" data-testid="about-demo">Try the admin demo</button>
            <Link to="/signup" className="btn-ghost border border-line" data-testid="about-signup">Get started</Link>
            <Link to="/hub" className="btn-ghost" data-testid="about-hub">Browse communities</Link>
          </div>
          <p className="mt-3 text-xs text-muted">The demo is a practice copy with sample data. Nothing in it touches a real community.</p>
        </div>

        <section id="promises" className="scroll-mt-24 border-t border-line py-10 sm:py-14" data-testid="about-promises">
          <p className="eyebrow">Three promises</p>
          <div className="mt-6 grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
            {PROMISES.map(([t, d, how], i) => (
              <div key={t} className="flex flex-col bg-surface p-6" data-testid={`about-promise-${i + 1}`}>
                <span className="stat text-sm text-muted">{String(i + 1).padStart(2, "0")}</span>
                <h2 className="mt-3 text-xl sm:text-2xl" style={{ textWrap: "balance" }}>{t}</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted">{d}</p>
                <p className="mt-auto pt-5 text-xs text-ink/70">{how}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="sample" className="scroll-mt-24 border-t border-line py-10 sm:py-14" data-testid="about-sample">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-xl">
              <p className="eyebrow">A sample report</p>
              <h2 className="mt-3 text-3xl sm:text-4xl" style={{ textWrap: "balance" }}>This is what your sponsor opens.</h2>
              <p className="mt-3 text-sm text-muted sm:text-base">One click from the admin home. Pick who it is for, and Pathwai builds it from your own records, with your Instagram reach alongside if you connect it. Everything below is made-up sample data.</p>
            </div>
            <div className="inline-flex rounded-full border border-line p-0.5 text-sm" role="tablist" aria-label="Report type">
              {REPORT_TYPES.map((t) => (
                <button key={t.kind} type="button" role="tab" aria-selected={kind === t.kind} onClick={() => setKind(t.kind)} data-testid={`about-sample-${t.kind}`}
                  className={cx("rounded-full px-4 py-1.5 transition-colors", kind === t.kind ? "bg-ink text-paper" : "text-muted hover:text-ink")}>{t.title.replace(" report", "")}</button>
              ))}
            </div>
          </div>
          <div className="mt-8 rounded-2xl border border-line bg-surface p-5 sm:p-8">
            <div className="mb-6 border-b border-line pb-5">
              <p className="eyebrow">{sample.audience}</p>
              <h3 className="mt-2 text-2xl sm:text-3xl" style={{ textWrap: "balance" }}>Northside Founders Club: {sample.headline}</h3>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">{sample.period_label} <span className="chip" data-testid="about-sample-chip">Sample data</span></p>
            </div>
            <ReportView report={sample} />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => startAdminDemo()} className="btn-primary" data-testid="about-sample-demo">Open it in the admin demo</button>
            <p className="text-xs text-muted">Download it as a PDF, or share a read-only live link that always shows current numbers (totals only, never names).</p>
          </div>
        </section>

        <div className="mb-3 flex items-center justify-between">
          <p className="eyebrow">Explore</p>
          <button type="button" className="text-sm text-muted underline underline-offset-2 hover:text-ink" data-testid="about-toggle-all"
            onClick={() => setOpen(allOpen ? [] : ALL)}>{allOpen ? "Close all" : "Open all"}</button>
        </div>

        <div className="border-b border-line">
          <Row id="who" n={1} title="Who it's for" summary="Gated networks of founders, professionals and members."
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

          <Row id="how" n={2} title="How it works" summary="Set up, introduce, run, report. Four steps."
            lede="You set it up once. After that, introductions run themselves and the proof builds as the community does." {...R("how")}>
            <ol className="divide-y divide-line border-y border-line">
              {STEPS.map(([t, d], i) => (
                <li key={t} className="flex gap-5 py-5">
                  <span className="stat flex h-9 w-9 flex-none items-center justify-center rounded-full border border-line text-sm">{i + 1}</span>
                  <span><span className="block text-base font-semibold">{t}</span><span className="mt-1 block text-sm leading-relaxed text-muted">{d}</span></span>
                </li>
              ))}
            </ol>
          </Row>

          <Row id="market" n={3} title="Competitors" summary="Community platforms, association software, learning tools and free chat apps."
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

          <Row id="diff" n={4} title="Why Pathwai" summary="Proof built in, introductions first, branded per community."
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
          <h2 className="mx-auto max-w-2xl text-3xl sm:text-5xl" style={{ textWrap: "balance" }}>See it the way you would run it.</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => startAdminDemo()} className="btn-primary" data-testid="about-cta">Try the admin demo</button>
            <Link to="/signup" className="btn-ghost border border-line">Get started</Link>
          </div>
        </div>
        <PoweredBy className="pb-10 text-center" />
      </main>
    </div>
  );
}
