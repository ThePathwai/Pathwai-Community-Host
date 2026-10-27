import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowRight, Compass, Search, BarChart3, CalendarDays, Check, ClipboardCheck, CreditCard, FileSpreadsheet, Gift, GraduationCap, Handshake, Heart, Instagram, Link2, Mail, Megaphone, Minus, Newspaper, Plus, Rocket, Send, Smartphone, Table2, Ticket, TrendingUp, UserPlus, Users, X, Building2, Eye, MessageCircle } from "lucide-react";
import { Wordmark, PoweredBy, cx } from "../components/ui";
import { TikTokIcon } from "../components/SocialIcons";
import ReportView from "../components/ReportView";
import DeckPreview from "../components/DeckPreview";
import { startAdminDemo, startDemo } from "../lib/demo";
import { REPORT_TYPES, buildReport, sampleInstagram, sampleMetrics, sampleTikTok, withSocial } from "../lib/sampleReport";

// /about -- public (no login). Written for the person who runs a community, because they are the buyer.
// Built to be glanced at: big short lines, an icon on everything, almost no paragraphs.
// Plain data below so copy edits are one-liners.

// What it replaces -> what it is. Left column is crossed out, right is the one app.
const REPLACES = [[FileSpreadsheet, "Spreadsheet"], [CalendarDays, "Event page"], [Ticket, "Ticketing"], [Mail, "Mailing list"], [MessageCircle, "Group chat"], [Smartphone, "Text blasts"]];

// Everything built in: icon, name, five words.
const BUILT_IN = [
  [Users, "Members", "A directory people use"],
  [CalendarDays, "Events", "RSVPs and check-in"],
  [Ticket, "Tickets", "Paid, free or tiered"],
  [Send, "Texts and email", "Write once, reach everyone"],
  [Gift, "Perks", "Offers from partners"],
  [Handshake, "Introductions", "Who to meet, and why"],
  [ClipboardCheck, "Applications", "Approve who gets in"],
  [Newspaper, "News", "Updates in one feed"],
];

// The Navigator: founders find their next step, and the communities that can help.
const NAVIGATOR = [[Search, "Pick your stage", "Idea to growing"], [Compass, "Get a path", "With the reason for each"], [Users, "Find your people", "Communities that fit"]];

const IMPORT_STEPS = [[FileSpreadsheet, "Upload a CSV", "or paste a link"], [Eye, "Preview", "see it before it saves"], [Check, "Done", "no retyping"]];
const IMPORT_FROM = ["Google Sheets", "Excel / CSV", "Apple, Google, Outlook calendars", "Airtable (CSV)", "Luma (calendar link)"];

// The loop the product is built around, as four steps.
const LOOP = [[Heart, "Members feel looked after"], [Users, "They show up"], [BarChart3, "You see the numbers"], [Rocket, "You give more back"]];

const PROOF = [[TrendingUp, "Up or down vs last period"], [UserPlus, "Who is going quiet"], [Megaphone, "Sponsor, investor and board decks"]];

// What a member sees.
const MEMBER_GETS = [
  [Heart, "Your story", "One front door"],
  [Gift, "Perks", "Real offers"],
  [Handshake, "Intros", "With a reason"],
  [Megaphone, "Offers and asks", "Swap value"],
  [Check, "A scorecard", "Totals, never names"],
];

const AUDIENCES = [
  [Rocket, "Accelerators and incubators"],
  [Building2, "Professional and alumni networks"],
  [Heart, "Community and cultural groups"],
  [GraduationCap, "Programs and cohorts"],
];

// Only these plug in. Everything else is already in Pathwai.
const CONNECT = [[CreditCard, "Stripe", "Take payments"], [Instagram, "Instagram", "Show your reach"], [TikTokIcon, "TikTok", "Show your reach"], [Table2, "Forms", "Google, Typeform, Jotform"]];

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

function Tile({ Icon, title, text, className }) {
  return (
    <div className={cx("flex flex-col items-center rounded-xl border border-line bg-surface p-4 text-center", className)}>
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink/[.07]"><Icon className="h-5 w-5" /></span>
      <p className="mt-3 text-sm font-semibold leading-tight">{title}</p>
      {text && <p className="mt-1 text-xs leading-snug text-muted">{text}</p>}
    </div>
  );
}

function Section({ id, eyebrow, title, children, className }) {
  return (
    <section id={id} className={cx("scroll-mt-24 border-t border-line py-12 sm:py-16", className)} data-testid={`about-${id}`}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 className="mt-3 max-w-3xl text-3xl sm:text-5xl" style={{ textWrap: "balance" }}>{title}</h2>
      <div className="mt-8 sm:mt-10">{children}</div>
    </section>
  );
}

// Left: the pile of tools, crossed out. Right: one app. The whole pitch in one picture.
function Replaces() {
  return (
    <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]" data-testid="about-replaces">
      <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <p className="eyebrow">Today</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {REPLACES.map(([Icon, label]) => (
            <span key={label} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-muted line-through decoration-ink/40"><Icon className="h-4 w-4 flex-none" />{label}</span>
          ))}
        </div>
      </div>
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-ink text-paper"><ArrowDown className="h-5 w-5 md:hidden" /><ArrowRight className="hidden h-5 w-5 md:block" /></span>
      <div className="rounded-2xl border-2 border-ink bg-surface p-4 sm:p-5">
        <p className="eyebrow">With Pathwai</p>
        <div className="mt-3 flex items-center gap-3"><span className="text-3xl"><Wordmark name="Pathwai" brand={{}} /></span></div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {REPLACES.map(([, label]) => <span key={label} className="chip chip-accent gap-1"><Check className="h-3 w-3" />{label}</span>)}
        </div>
      </div>
    </div>
  );
}

const NAV = [["built-in", "Built in"], ["import", "Bring your data"], ["sample", "Sample report"], ["members", "For members"], ["who", "Who it's for"], ["compare", "Compare"]];

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
  const [more, setMore] = useState(false);
  useEffect(() => {
    document.title = "Pathwai: your whole community in one app";
    const h = window.location.hash.replace("#", "");
    if (h) setTimeout(() => document.getElementById(h)?.scrollIntoView({ behavior: "smooth" }), 80);
    else window.scrollTo(0, 0);
  }, []);
  const jump = (k) => document.getElementById(k)?.scrollIntoView({ behavior: "smooth" });
  const sample = useMemo(() => withSocial(buildReport(kind, sampleMetrics({ members: 64, seed: "pathwai-sample", days: 90 }), "Northside Founders Club"), { instagram: sampleInstagram("pathwai-sample"), tiktok: sampleTikTok("pathwai-sample") }), [kind]);
  const demoConfig = useMemo(() => ({ community_name: "Northside Founders Club", brand: { colors: SAMPLE_BRANDS[look].colors },
    about: "Northside Founders Club brings first-time founders together every month to share what is working, meet people who can help, and get started faster." }), [look]);

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
          <h1 className="mt-4 max-w-4xl text-5xl sm:text-6xl lg:text-7xl" style={{ textWrap: "balance" }}>Your whole community. One app.</h1>
          <p className="mt-5 max-w-xl text-lg text-muted sm:text-xl">Members, events, tickets, texts and email. All built in.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => startAdminDemo()} className="btn-primary" data-testid="about-demo">Try the admin demo</button>
            <Link to="/signup" className="btn-ghost border border-line" data-testid="about-signup">Get started</Link>
            <Link to="/hub" className="btn-ghost" data-testid="about-hub">Browse communities</Link>
          </div>
          <p className="mt-3 text-xs text-muted">The demo uses sample data. Nothing in it touches a real community.</p>
          <div className="mt-10 sm:mt-14"><Replaces /></div>
        </div>

        <Section id="built-in" eyebrow="Built in" title="Everything you run, in one place.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="about-built-in">
            {BUILT_IN.map(([Icon, t, d]) => <Tile key={t} Icon={Icon} title={t} text={d} />)}
          </div>
          <p className="mt-5 text-sm text-muted">No other apps to log in to. Nothing to connect, nothing to type twice.</p>
        </Section>

        <Section id="navigator" eyebrow="Navigator" title="Founders find their next step. Then they find you.">
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center" data-testid="about-navigator">
            {NAVIGATOR.map(([Icon, t, d], i) => (
              <React.Fragment key={t}>
                <Tile Icon={Icon} title={t} text={d} className="flex-1" />
                {i < NAVIGATOR.length - 1 && <ArrowRight className="mx-auto h-5 w-5 flex-none rotate-90 text-muted sm:rotate-0" aria-hidden />}
              </React.Fragment>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link to="/navigator" className="btn-primary" data-testid="about-navigator-open">Try the Navigator</Link>
            <span className="text-sm text-muted">Your community lists its programs once. Founders see them next to the national ones.</span>
          </div>
        </Section>

        <Section id="import" eyebrow="Switching" title="Bring your data in a minute.">
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center" data-testid="about-import">
            {IMPORT_STEPS.map(([Icon, t, d], i) => (
              <React.Fragment key={t}>
                <Tile Icon={Icon} title={t} text={d} className="flex-1" />
                {i < IMPORT_STEPS.length - 1 && <ArrowRight className="mx-auto h-5 w-5 flex-none rotate-90 text-muted sm:rotate-0" aria-hidden />}
              </React.Fragment>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">{IMPORT_FROM.map((s) => <span key={s} className="chip"><Link2 className="mr-1.5 h-3 w-3" />{s}</span>)}</div>
        </Section>

        <Section id="loop" eyebrow="The idea" title="Happy members make better numbers.">
          <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center" data-testid="about-loop">
            {LOOP.map(([Icon, t], i) => (
              <React.Fragment key={t}>
                <Tile Icon={Icon} title={t} className="flex-1" />
                {i < LOOP.length - 1 && <ArrowRight className="mx-auto h-5 w-5 flex-none rotate-90 text-muted md:rotate-0" aria-hidden />}
              </React.Fragment>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold"><span aria-hidden>↻</span> Round again</div>
        </Section>

        <Section id="sample" eyebrow="Proof" title="Send the proof in one click.">
          <div data-testid="about-sample">
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              {PROOF.map(([Icon, t]) => <div key={t} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3"><span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-ink/[.07]"><Icon className="h-4 w-4" /></span><p className="text-sm font-medium leading-tight">{t}</p></div>)}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3" data-testid="about-sample-controls">
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
                <span>Your colours</span>
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
            <div className="mt-5"><button type="button" onClick={() => startAdminDemo()} className="btn-primary" data-testid="about-sample-demo">Open it in the admin demo</button></div>
          </div>
        </Section>

        <Section id="members" eyebrow="For members" title="One front door for them.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="about-member-gets">
            {MEMBER_GETS.map(([Icon, t, d]) => <Tile key={t} Icon={Icon} title={t} text={d} />)}
          </div>
          <div className="mt-5"><button type="button" onClick={() => startDemo("member", "humber-innovation-network")} className="btn-ghost border border-line" data-testid="about-circle-member">See what members see</button></div>
        </Section>

        <Section id="connect" eyebrow="Plugs in" title="Only these connect. The rest is built in.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="about-connect">
            {CONNECT.map(([Icon, t, d]) => <Tile key={t} Icon={Icon} title={t} text={d} />)}
          </div>
        </Section>

        <Section id="who" eyebrow="Who it's for" title="Networks that run on relationships.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {AUDIENCES.map(([Icon, t]) => <Tile key={t} Icon={Icon} title={t} />)}
          </div>
          <p className="mt-5 text-sm text-muted">Not built for selling courses or growing a big public audience.</p>
        </Section>

        <Section id="compare" eyebrow="Compare" title="Pathwai next to the usual platforms.">
          <div className="overflow-x-auto rounded-xl border border-line" data-testid="about-matrix">
            <table className="w-full min-w-[36rem] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="p-3 font-medium text-muted"> </th>
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
          <p className="mt-3 text-xs text-muted">Payments and courses aren't our focus: use Stripe or your learning tool alongside. Installs on a phone today; app store listing is next.</p>
          <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4" data-testid="about-toggle-market">
            <span className={cx("flex h-6 w-6 items-center justify-center rounded-full border border-line transition", more && "rotate-45")}><Plus className="h-3.5 w-3.5" /></span>{more ? "Hide" : "Show"} the detail on each platform
          </button>
          {more && (
            <div className="mt-6 space-y-8" data-testid="about-market">
              {COMPETITORS.map((g) => (
                <div key={g.group}>
                  <h3 className="text-base font-semibold" style={{ textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-sans)", fontWeight: 600 }}>{g.group}</h3>
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
              <p className="text-xs text-muted">{PRICE_NOTE}</p>
            </div>
          )}
        </Section>

        <div className="border-t border-line py-16 text-center sm:py-24">
          <h2 className="mx-auto max-w-2xl text-4xl sm:text-6xl" style={{ textWrap: "balance" }}>See it the way you'd run it.</h2>
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
