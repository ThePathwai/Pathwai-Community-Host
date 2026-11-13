import React from "react";
import { ArrowRight, Rocket } from "lucide-react";
import { startHubDemo } from "../lib/demo";
import { Eyebrow, Num, PageTop, Section, SiteShell, WAITLIST } from "../components/SiteKit";

// The website's About page (/about). Wording follows thepathwai.com.

const ABOUT = [
  ["Purpose", "Founders find support on their own."],
  ["Vision", "Every incubator's support, easy to see."],
  ["Outcome", "Advisors spend time where it matters."],
];

const VALUE = [
  ["More advisor capacity", "Fewer repeat questions."],
  ["Better use of resources", "Programs founders actually find."],
  ["Clearer founder experience", "See what fits."],
  ["Room to grow", "Serve more founders."],
];

const WHY = [
  ["For founders", "Clarity without waiting."],
  ["For advisors", "Time for deeper needs."],
  ["For host organizations", "Serve more founders."],
  ["Human support stays", "Advisors for what matters."],
];

export default function SiteAbout() {
  return (
    <SiteShell title="About">
      <PageTop eyebrow="About Pathwai" title="Founder clarity. Advisor capacity." sub="Pathwai helps founders navigate the opportunities and people in their incubator community, giving advisors more capacity for deeper needs." />

      <Section className="!pt-6">
        <div className="grid gap-4 sm:grid-cols-3" data-testid="site-about">
          {ABOUT.map(([tag, line]) => <div key={tag} className="card"><Eyebrow>{tag}</Eyebrow><p className="mt-2 text-xl font-bold leading-snug">{line}</p></div>)}
        </div>
      </Section>

      <Section id="hubs" eyebrow="Who it's for" title="Incubators and their founders." className="border-t border-line/60">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card"><Eyebrow>Founders</Eyebrow><p className="mt-2 text-2xl font-bold">Find support on your own.</p></div>
          <div className="card"><Eyebrow>Incubators &amp; advisors</Eyebrow><p className="mt-2 text-2xl font-bold">Less explaining. More advising.</p></div>
        </div>
      </Section>

      <Section eyebrow="Value for your incubator" title="Independent founders. Focused advisors." className="border-t border-line/60">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="site-value">
          {VALUE.map(([t, d], i) => <li key={t} className="card flex flex-col gap-2"><Num n={i + 1} /><h3 className="text-lg font-bold">{t}</h3><p className="text-sm text-muted">{d}</p></li>)}
        </ol>
      </Section>

      <Section eyebrow="Why Pathwai" title="Founder clarity. Support capacity." className="border-t border-line/60">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="site-why">
          {WHY.map(([tag, line]) => <div key={tag} className="card"><Eyebrow>{tag}</Eyebrow><p className="mt-2 text-xl font-bold leading-snug">{line}</p></div>)}
        </div>
      </Section>

      <section className="px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="card mx-auto flex max-w-6xl flex-col items-center gap-7 !p-8 text-center sm:!p-14">
          <h2 className="max-w-3xl text-3xl sm:text-5xl" style={{ textWrap: "balance" }}>See it work for your incubator.</h2>
          <div className="flex flex-wrap justify-center gap-3">
            <a href={WAITLIST} className="btn-primary !px-6 !py-3" data-testid="site-waitlist-end">Join the waitlist<ArrowRight className="h-4 w-4" aria-hidden /></a>
            <button type="button" onClick={startHubDemo} className="btn-ghost !px-6 !py-3" data-testid="site-demo-end"><Rocket className="h-4 w-4" aria-hidden />Try the demo</button>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
