import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Minus, Plus, X } from "lucide-react";
import { Wordmark, PoweredBy, cx } from "../components/ui";
import ReportView from "../components/ReportView";
import DeckPreview from "../components/DeckPreview";
import { startAdminDemo, startDemo } from "../lib/demo";
import { REPORT_TYPES, buildReport, sampleInstagram, sampleMetrics, withInstagram } from "../lib/sampleReport";

// /about -- public (no login). Written for the person who runs a community, because they are the buyer:
// what the admin gets (one toolset, numbers with context, proof to send), a sample report, what members get, then who it's for, how it works and how it compares.
// Plain data below so copy edits are one-liners.

const AUDIENCES = [
  ["Accelerators & incubators", "Cohorts need founders to find the right peer, mentor or customer fast. Pathwai introduces them and explains why."],
  ["Professional & alumni networks", "Keep a large, gated membership useful after the welcome email: directory, intros, events and perks in one place."],
  ["Community & cultural organizations", "Events, news and member benefits for people who share an identity, a mission or a neighbourhood."],
  ["Programs & learning cohorts", "Pair it with the learning tool you already use. Pathwai handles the people side: who is in your cohort and who to meet."],
];

// The loop the whole product is built around: a better experience for members is what creates the return for the person running the community,
// and the return pays for a better experience again.
const CIRCLE = [
  { who: "Members", title: "Members feel looked after", text: "One front door: the community's story, perks, introductions with a reason, offers and asks." },
  { who: "Members", title: "They show up and take part", text: "They attend, connect, use perks and trade value, because it is worth their time." },
  { who: "You", title: "Pathwai counts it", text: "Every action is counted from your own records and set against the last period." },
  { who: "You", title: "You decide with data", text: "Every number is set against the last period, so you see what is working and who is drifting." },
  { who: "Both", title: "It comes back to members", text: "You put what you learn into better perks, events and introductions. The results also draw in partners and sponsors when you want them." },
];

function WhoChip({ who }) {
  return <span className={cx("chip !text-[10px] uppercase tracking-wider", who === "Members" && "chip-accent")}>{who === "Both" ? "Members and you" : who === "You" ? "You" : "Members"}</span>;
}

function Circle() {
  const R = 37; // distance of each step from the centre, as a % of the ring's width
  const at = (i, r = R) => { const a = ((-90 + i * 72) * Math.PI) / 180; return [50 + r * Math.cos(a), 50 + r * Math.sin(a)]; };
  // an arc between two neighbouring steps, trimmed so the arrow sits in the gap between their cards
  const arc = (i) => {
    const a1 = ((-90 + i * 72 + 22) * Math.PI) / 180, a2 = ((-90 + (i + 1) * 72 - 22) * Math.PI) / 180;
    return `M ${50 + R * Math.cos(a1)} ${50 + R * Math.sin(a1)} A ${R} ${R} 0 0 1 ${50 + R * Math.cos(a2)} ${50 + R * Math.sin(a2)}`;
  };
  return (
    <div data-testid="about-circle-diagram">
      {/* phones and tablets: a plain list that loops back to the top */}
      <ol className="space-y-3 md:hidden">
        {CIRCLE.map((c, i) => (
          <li key={c.title} className="rounded-xl border border-line bg-surface p-4" data-testid={`about-circle-step-${i + 1}`}>
            <div className="flex items-center justify-between gap-3"><span className="stat text-sm text-muted">{String(i + 1).padStart(2, "0")}</span><WhoChip who={c.who} /></div>
            <p className="mt-2 text-base font-semibold">{c.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{c.text}</p>
          </li>
        ))}
        <li className="flex items-center justify-center gap-2 pt-1 text-sm font-semibold"><span aria-hidden>↻</span> And what you learn goes back to members as a better community</li>
      </ol>

      {/* desktop: the ring itself */}
      <div className="relative mx-auto hidden aspect-square w-full max-w-[46rem] md:block" role="img" aria-label="A loop: members feel looked after, they take part, Pathwai counts it, you decide with data, and what you learn comes back to members as a better community">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full text-ink" aria-hidden>
          <defs>
            <marker id="circle-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 1 1 L 8 5 L 1 9 z" fill="currentColor" /></marker>
          </defs>
          {CIRCLE.map((_, i) => <path key={i} d={arc(i)} fill="none" stroke="currentColor" strokeOpacity=".45" strokeWidth=".5" markerEnd="url(#circle-arrow)" />)}
        </svg>
        <div className="absolute left-1/2 top-1/2 w-[32%] -translate-x-1/2 -translate-y-1/2 text-center">
          <p className="eyebrow">The full circle</p>
          <p className="font-display mt-2 text-lg leading-tight lg:text-xl" style={{ textTransform: "none", letterSpacing: 0, textWrap: "balance" }}>Members get value. Data shows what works. You give more back.</p>
        </div>
        {CIRCLE.map((c, i) => {
          const [x, y] = at(i);
          return (
            <div key={c.title} className="absolute w-[25%] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-surface p-3 shadow-card" style={{ left: `${x}%`, top: `${y}%` }} data-testid={`about-circle-step-${i + 1}`}>
              <div className="flex items-center justify-between gap-2"><span className="stat text-xs text-muted">{String(i + 1).padStart(2, "0")}</span><WhoChip who={c.who} /></div>
              <p className="mt-1.5 text-sm font-semibold leading-tight">{c.title}</p>
              <p className="mt-1 text-xs leading-snug text-muted">{c.text}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2" data-testid="about-circle-value">
        <div className="bg-surface p-5">
          <p className="eyebrow">What is in it for members</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">A community that is easy to belong to: everything in one place, people worth meeting, perks that are real, a way to give and ask, and proof it shows up. They feel looked after, so they stay and take part.</p>
        </div>
        <div className="bg-surface p-5">
          <p className="eyebrow">What is in it for you</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">Members who stay and take part give you honest numbers to act on. You decide with data instead of guessing, you have proof ready for anyone who backs you, and what you learn goes straight back into giving members more.</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => startAdminDemo()} className="btn-primary" data-testid="about-circle-admin">See it as the admin</button>
        <button type="button" onClick={() => startDemo("member", "humber-innovation-network")} className="btn-ghost border border-line" data-testid="about-circle-member">See what members see</button>
      </div>
    </div>
  );
}

const PROMISES = [
  ["One toolset, not six", "Members, events and RSVPs, perks, news, applications, messages and project teams, all in your own branded space. It replaces the spreadsheet, the group chat, the event page, the form tool and the mailing list, so nothing has to be copied from one place to another.",
    "One directory · events and turnout · perks · news · applications · teams"],
  ["Decisions backed by data", "Every figure is counted from your own records and set against the period before it: active members, introductions made, event turnout, perk use. You see whether the community is growing or slipping, and who is going quiet while there is still time to bring them back.",
    "Up or down vs last period · weekly momentum · a going-quiet list with a one-tap nudge"],
  ["Proof ready when anyone asks", "If a partner, sponsor, investor or your board wants to know what the community did, the answer is one click away. Share a PDF, or a live link that stays current, and bring your Instagram reach in alongside.",
    "Reports for partners, sponsors, investors and boards · PDF or live link · every number counted, never estimated"],
];

// What a member sees. Written as the reason the admin gets a better return: members who feel looked after stay, take part, and make the numbers worth sending.
const MEMBER_GETS = [
  ["The community's story", "Its brand, mission and what it offers, kept in one place instead of scattered across posts and group chats."],
  ["Perks", "Offers from sponsors and partners in a single list, so the thing you promised a sponsor is the thing members actually find."],
  ["Introductions with a reason", "Matchmaking that says who to meet and why, so a cold intro becomes a warm one."],
  ["Offers and asks", "A simple way to say what you can give and what you need. Members swap value without the organizer in the middle."],
  ["A community you can count on", "A scorecard of how many people show up, how many events were held, how many introductions led to a conversation and how much help was given. Totals only, never names."],
];

const STEPS = [
  ["Set up your community in an afternoon", "Your name, colours and logo. Import your members or invite them. Decide who gets in and what they see."],
  ["Members join and are looked after", "Each member builds a profile and pitch card, finds perks, offers and asks in one place, and is introduced to the right people with a reason."],
  ["You see what is working", "The Impact view sets every number against the period before it, shows weekly momentum and lists who is going quiet, with a one-tap nudge."],
  ["Send the proof when someone asks", "Pick sponsor, investor or board, choose the period, and download the PDF or share a live link. No spreadsheet-wrangling the night before."],
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
    ["Impact reports for sponsors and investors, shareable as a live link", "Y", "P", "P", "N", "P", "N"],
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
  ["One toolset instead of a stack", "Pathwai replaces the separate tools you stitch together today, so your data lives in one place and lines up."],
  ["Context on every number", "Each figure is shown against the period before it, so you, a board or an investor sees direction, not just a total."],
  ["Proof is built in", "Reports for partners, sponsors, investors and boards come from the same records you already run the community on. Nothing to export, merge or chase."],
  ["Introductions, not just posts", "Most platforms give you a place to talk. Pathwai tells members who to talk to, and why."],
  ["Built for networks, not audiences", "Applications, approvals, gated directories and organizer tools come first, not course checkout."],
  ["Every community looks like itself", "Each community gets its own colours, logo, naming and navigation. Members keep one Pathwai login."],
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
function Row({ id, n, title, summary, lede, wide, open, onToggle, children }) {
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
          {wide ? (
            <div className="pb-10 sm:pb-14 sm:pl-20" hidden={!open}>{children}</div>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-6 pb-10 sm:grid-cols-12 sm:gap-8 sm:pb-14" hidden={!open}>
              <p className="text-base leading-relaxed text-muted sm:col-span-4 sm:pl-20 sm:pr-4 lg:text-lg">{lede}</p>
              <div className="sm:col-span-8">{children}</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const NAV = [["circle", "Full circle"], ["promises", "What you get"], ["sample", "Sample report"], ["members", "For members"], ["who", "Who it's for"], ["how", "How it works"], ["market", "Competitors"], ["diff", "Why us"]];
// Every section is a collapsible row so the page stays short; only the first starts open.
const ALL = ["circle", "promises", "sample", "members", "who", "how", "market", "diff", "compare"];
// Short tab names for the sample report switcher.
// Three made-up looks for the sample, to show the same report coming out in a community's own colours.
const SAMPLE_BRANDS = [
  { key: "ember", label: "Ember", colors: { accent: "#E4572E", background: "#111827", surface: "#1F2937", text: "#F9FAFB", muted: "#9CA3AF", border: "#374151", on_accent: "#FFFFFF" } },
  { key: "meadow", label: "Meadow", colors: { accent: "#1F7A4D", background: "#F4F1E8", surface: "#FFFFFF", text: "#16241B", muted: "#5C6B61", border: "#D8D4C4", on_accent: "#FFFFFF" } },
  { key: "violet", label: "Violet", colors: { accent: "#8B5CF6", background: "#0F0B1E", surface: "#1A1433", text: "#F5F3FF", muted: "#A79FC8", border: "#2E2552", on_accent: "#FFFFFF" } },
];
const TAB = { sponsor: "Brand partner", funder: "Investor or funder", board: "Board" };

export default function About() {
  const [kind, setKind] = useState("sponsor");
  const [view, setView] = useState("slides");
  const [look, setLook] = useState(0);
  const [open, setOpen] = useState(["circle"]);
  useEffect(() => {
    document.title = "Pathwai: run your community in one place, know what is working";
    const h = window.location.hash.replace("#", "");
    if (ALL.includes(h)) { setOpen([h]); setTimeout(() => document.getElementById(h)?.scrollIntoView({ behavior: "smooth" }), 80); }
    else window.scrollTo(0, 0);
  }, []);
  const toggle = (k) => setOpen((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));
  const jump = (k) => { if (ALL.includes(k)) setOpen((o) => (o.includes(k) ? o : [...o, k])); setTimeout(() => document.getElementById(k)?.scrollIntoView({ behavior: "smooth" }), 60); };
  const allOpen = open.length === ALL.length;
  const sample = useMemo(() => withInstagram(buildReport(kind, sampleMetrics({ members: 64, seed: "pathwai-sample", days: 90 }), "Northside Founders Club"), sampleInstagram("pathwai-sample")), [kind]);
  const demoConfig = useMemo(() => ({ community_name: "Northside Founders Club", brand: { colors: SAMPLE_BRANDS[look].colors },
    about: "Northside Founders Club brings first-time founders together every month to share what is working, meet people who can help, and get started faster." }), [look]);
  const R = (k) => ({ open: open.includes(k), onToggle: () => toggle(k) });

  return (
    <div className="w-full" data-testid="about">
      <header className="glass sticky top-0 z-30 border-b border-line/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 lg:px-8">
          <Link to="/" className="shrink-0 text-2xl"><Wordmark name="Pathwai" brand={{}} /></Link>
          <nav className="hidden min-w-0 items-center gap-4 whitespace-nowrap text-[13px] xl:flex" aria-label="About sections">
            {NAV.map(([k, label]) => <button key={k} type="button" onClick={() => jump(k)} className="text-muted hover:text-ink" data-testid={`about-nav-${k}`}>{label}</button>)}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <Link to="/login" className="btn-ghost hidden whitespace-nowrap sm:inline-flex" data-testid="about-signin">Sign in</Link>
            <button type="button" onClick={() => startAdminDemo()} className="btn-primary whitespace-nowrap" data-testid="about-demo-top">Try the demo</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="py-10 sm:py-16">
          <p className="eyebrow">Community software for organizers</p>
          <h1 className="mt-4 max-w-4xl text-4xl sm:text-5xl lg:text-6xl" style={{ textWrap: "balance" }}>Run your whole community in one place. Know what is working.</h1>
          <p className="mt-6 max-w-2xl text-base text-muted sm:text-lg">Your members get one place for perks, events and introductions. You get every tool and every number together, so you can make decisions with data and show your results to anyone who backs the community.</p>
          <div className="mt-8 grid max-w-4xl gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3" data-testid="about-hero-points">
            {[["For your members", "One place to belong: your story, perks, events, introductions, offers and asks."],
              ["For you", "One toolset instead of a stack: members, events, applications, messages and reports."],
              ["For your decisions", "Every number counted from your own records and set against the last period."]].map(([t, d]) => (
              <div key={t} className="bg-surface p-4"><p className="text-sm font-semibold">{t}</p><p className="mt-1 text-xs leading-relaxed text-muted">{d}</p></div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => startAdminDemo()} className="btn-primary" data-testid="about-demo">Try the admin demo</button>
            <Link to="/signup" className="btn-ghost border border-line" data-testid="about-signup">Get started</Link>
            <Link to="/hub" className="btn-ghost" data-testid="about-hub">Browse communities</Link>
          </div>
          <p className="mt-3 text-xs text-muted">The demo is a practice copy with sample data. Nothing in it touches a real community.</p>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <p className="eyebrow">Explore</p>
          <button type="button" className="text-sm text-muted underline underline-offset-2 hover:text-ink" data-testid="about-toggle-all"
            onClick={() => setOpen(allOpen ? [] : ALL)}>{allOpen ? "Close all" : "Open all"}</button>
        </div>

        <div className="border-b border-line">
          <Row id="circle" n={1} title="The full circle" summary="Members get value, data shows what works, and you give more back." wide {...R("circle")}>
            <Circle />
          </Row>

          <Row id="promises" n={2} title="What you get" summary="One toolset, decisions backed by data, proof ready when asked." wide {...R("promises")}>
            <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3" data-testid="about-promises">
              {PROMISES.map(([t, d, how], i) => (
                <div key={t} className="flex flex-col bg-surface p-6" data-testid={`about-promise-${i + 1}`}>
                  <span className="stat text-sm text-muted">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="mt-3 text-xl" style={{ textWrap: "balance", textTransform: "none", letterSpacing: 0 }}>{t}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{d}</p>
                  <p className="mt-auto pt-5 text-xs text-ink/70">{how}</p>
                </div>
              ))}
            </div>
          </Row>

          <Row id="sample" n={3} title="A sample report" summary="What a partner, sponsor, investor or board opens. Sample data." wide {...R("sample")}>
            <div data-testid="about-sample">
              <p className="max-w-2xl text-sm text-muted sm:text-base">One click from Admin. Pick who it is for (a sponsor, an investor or funder, your board) and Pathwai builds it from your own records, then dresses it in your colours, logo and photos as a slide deck you can download. Everything below is made-up sample data.</p>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3" data-testid="about-sample-controls">
                <div className="inline-flex max-w-full overflow-x-auto rounded-full border border-line p-0.5 text-sm" role="tablist" aria-label="Report type">
                  {REPORT_TYPES.map((t) => (
                    <button key={t.kind} type="button" role="tab" aria-selected={kind === t.kind} onClick={() => setKind(t.kind)} data-testid={`about-sample-${t.kind}`}
                      className={cx("whitespace-nowrap rounded-full px-4 py-1.5 transition-colors", kind === t.kind ? "bg-ink text-paper" : "text-muted hover:text-ink")}>{TAB[t.kind] || t.title}</button>
                  ))}
                </div>
                <div className="inline-flex rounded-full border border-line p-0.5 text-sm" role="tablist" aria-label="How to view the report">
                  {[["slides", "Slides"], ["report", "Report"]].map(([k, l]) => (
                    <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} data-testid={`about-sample-view-${k}`}
                      className={cx("rounded-full px-4 py-1.5 transition-colors", view === k ? "bg-ink text-paper" : "text-muted hover:text-ink")}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted" data-testid="about-sample-looks">
                <span className="chip whitespace-nowrap" data-testid="about-sample-chip">Sample data</span>
                <span className="flex items-center gap-2">
                  <span>Your colours, automatically</span>
                  {SAMPLE_BRANDS.map((b, i) => (
                    <button key={b.key} type="button" onClick={() => setLook(i)} aria-pressed={look === i} aria-label={`${b.label} colours`} title={b.label} data-testid={`about-sample-look-${b.key}`}
                      className={cx("h-7 w-7 flex-none rounded-full border-2 transition", look === i ? "border-ink" : "border-line")} style={{ background: `linear-gradient(135deg, ${b.colors.background} 50%, ${b.colors.accent} 50%)` }} />
                  ))}
                </span>
              </div>
              {view === "slides" ? (
                <div className="mt-4" data-testid="about-sample-slides"><DeckPreview report={sample} config={demoConfig} /></div>
              ) : (
                <div className="mt-4 rounded-2xl border border-line bg-surface p-5 sm:p-8">
                  <div className="mb-6 border-b border-line pb-5">
                    <p className="eyebrow">{sample.audience}</p>
                    <h3 className="mt-2 text-2xl sm:text-3xl" style={{ textWrap: "balance" }}>Northside Founders Club: {sample.headline}</h3>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">{sample.period_label}</p>
                  </div>
                  <ReportView report={sample} config={demoConfig} />
                </div>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => startAdminDemo()} className="btn-primary" data-testid="about-sample-demo">Open it in the admin demo</button>
                <p className="text-xs text-muted">Download the slides or a PDF, or share a read-only live link that always shows current numbers (totals only, never names).</p>
              </div>
            </div>
          </Row>

          <Row id="members" n={4} title="What your members get" summary="One front door: story, perks, introductions, offers and asks, and how reliable the community is."
            lede="Members get one place for everything about the community, and it should make them feel good: looked after, introduced and part of something that shows up. That is what keeps them, it gives you honest data to decide with, and what you learn goes back into giving them more." {...R("members")}>
            <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 sm:[&>:last-child:nth-child(odd)]:col-span-2" data-testid="about-member-gets">
              {MEMBER_GETS.map(([t, d]) => (
                <div key={t} className="bg-surface p-5">
                  <p className="text-base font-semibold">{t}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
                </div>
              ))}
            </div>
          </Row>

          <Row id="who" n={5} title="Who it's for" summary="Gated networks of founders, professionals and members."
            lede="Organizers who want to run on data, may answer to partners, sponsors, investors or a board, and need members to find each other, not just find content. Less suited if your main goal is selling courses or growing a large public audience." {...R("who")}>
            <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
              {AUDIENCES.map(([t, d]) => (
                <div key={t} className="bg-surface p-5">
                  <p className="text-base font-semibold">{t}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
                </div>
              ))}
            </div>
          </Row>

          <Row id="how" n={6} title="How it works" summary="Set up, look after members, see what works, send the proof."
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

          <Row id="market" n={7} title="Competitors" summary="Community platforms, association software, learning tools and free chat apps."
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

          <Row id="diff" n={8} title="Why Pathwai" summary="One toolset, context on every number, proof built in."
            lede="We are not trying to be the biggest platform. We are trying to be the best one for networks that run on relationships." {...R("diff")}>
            <ul className="divide-y divide-line border-y border-line">
              {EDGES.map(([t, d]) => (
                <li key={t} className="flex gap-4 py-5">
                  <ArrowRight className="mt-1 h-4 w-4 flex-none" />
                  <span><span className="block text-base font-semibold">{t}</span><span className="mt-1 block text-sm leading-relaxed text-muted">{d}</span></span>
                </li>
              ))}
            </ul>
          </Row>

          <Row id="compare" n={9} title="Compare at a glance" summary="Pathwai next to the usual platforms, feature by feature."
            lede="A quick yes, partly or no across the features networks ask about most." {...R("compare")}>
            <div className="overflow-x-auto rounded-xl border border-line" data-testid="about-matrix">
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
