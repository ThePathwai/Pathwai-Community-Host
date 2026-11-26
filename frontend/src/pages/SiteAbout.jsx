import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Rocket } from "../components/icons";
import { DEMO_PATH } from "../lib/demo";
import { Eyebrow, Growth, Num, PageTop, Proof, Section, SiteShell, WAITLIST } from "../components/SiteKit";

// The website's About page (/about). Wording follows thepathwai.com.

const ABOUT = [
  ["Purpose", "Give every hub a venture advisor."],
  ["Vision", "Every hub on one national system."],
  ["Outcome", "Founders know their next move. Advisors spend time where it matters."],
];

const VALUE = [
  ["More advisor capacity", "Fewer repeat questions."],
  ["Better use of your programs", "Programs founders actually find."],
  ["A clearer intake", "Founders arrive with a profile and a plan."],
  ["Room to grow", "Serve more founders with the same team."],
];

const WHY = [
  ["For hubs", "A venture advisor that knows your programs, and the numbers your funders ask for."],
  ["For founders", "Clarity without waiting."],
  ["For advisors", "Time for deeper needs."],
  ["Human support stays", "Advisors for what matters."],
];

export default function SiteAbout() {
  return (
    <SiteShell title="About">
      <PageTop eyebrow="About Pathwai" title="A venture advisor for every hub." sub="Pathwai gives each innovation hub its own venture advisor, so founders get clear next steps and advisors get time for the work only people can do. As more hubs join, the same system becomes national." />

      <Section className="!pt-6">
        <div className="grid gap-4 sm:grid-cols-3" data-testid="site-about">
          {ABOUT.map(([tag, line]) => <div key={tag} className="card"><Eyebrow>{tag}</Eyebrow><p className="mt-2 text-xl font-bold leading-snug">{line}</p></div>)}
        </div>
      </Section>

      <Section id="hubs" eyebrow="Who it's for" title="Hubs, founders and investors." className="border-t border-line/60">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card"><Eyebrow>Hubs &amp; advisors</Eyebrow><p className="mt-2 text-2xl font-bold">A venture advisor on call.</p></div>
          <div className="card"><Eyebrow>Founders</Eyebrow><p className="mt-2 text-2xl font-bold">Know your next move.</p></div>
          <div className="card"><Eyebrow>Investors</Eyebrow><p className="mt-2 text-2xl font-bold">Meet founders worth backing.</p></div>
        </div>
      </Section>

      <Section eyebrow="Proof for your funders" title="Report what your hub achieved." sub="The numbers come from what happens in your hub, so the report is something you can stand behind." className="border-t border-line/60">
        <Proof />
      </Section>

      <Section eyebrow="Where this goes" title="From one hub to a national system." sub="Each hub keeps its own advisor. Together they become one network." className="border-t border-line/60">
        <Growth />
      </Section>

      <Section eyebrow="Value for your hub" title="Independent founders. Focused advisors." className="border-t border-line/60">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="site-value">
          {VALUE.map(([t, d], i) => <li key={t} className="card flex flex-col gap-2"><Num n={i + 1} /><h3 className="text-lg font-bold">{t}</h3><p className="text-sm text-muted">{d}</p></li>)}
        </ol>
      </Section>

      <Section eyebrow="Why Pathwai" title="Founder clarity. Support capacity." className="border-t border-line/60">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="site-why">
          {WHY.map(([tag, line]) => <div key={tag} className="card"><Eyebrow>{tag}</Eyebrow><p className="mt-2 text-xl font-bold leading-snug">{line}</p></div>)}
        </div>
      </Section>

      <section className="px-4 pb-12 sm:px-6 sm:pb-16 lg:px-8">
        <div className="card mx-auto flex max-w-6xl flex-col items-center gap-7 !p-8 text-center sm:!p-14">
          <h2 className="max-w-3xl text-3xl sm:text-5xl" style={{ textWrap: "balance" }}>See it work for your hub.</h2>
          <div className="flex flex-wrap justify-center gap-3">
            <a href={WAITLIST} className="btn-primary !px-6 !py-3" data-testid="site-waitlist-end">Join the waitlist<ArrowRight className="h-4 w-4" aria-hidden /></a>
            <Link to={DEMO_PATH} className="btn-ghost !px-6 !py-3" data-testid="site-demo-end"><Rocket className="h-4 w-4" aria-hidden />Try the demo</Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
