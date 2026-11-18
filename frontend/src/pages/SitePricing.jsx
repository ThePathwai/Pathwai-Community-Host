import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Minus } from "lucide-react";
import { cx } from "../components/ui";
import { CONTACT, PageTop, Pill, Section, SiteShell, WAITLIST } from "../components/SiteKit";
import { ANNUAL_MONTHS_BILLED, CURRENCY, FEATURES, GRACE, TIERS, comparison, money } from "../lib/pricing";

// The website's Pricing page (/pricing). Everything on it is read from lib/pricing.js, so editing prices or features there changes this page.
// There is no checkout yet: the buttons open an email (or the waitlist) because nothing charges anyone.

const unlimited = (v, unit) => (v == null ? `Unlimited ${unit}` : `${v.toLocaleString("en-CA")} ${unit}`);
const planMail = (t) => `mailto:${CONTACT}?subject=${encodeURIComponent(`Pathwai ${t.name} plan`)}&body=${encodeURIComponent(`Hi Pathwai team,\n\nI'm interested in the ${t.name} plan.\n\nName:\nOrganization:\nApproximate number of founders:\n`)}`;

// What a tier adds on top of the one below it, so each card stays short.
function added(i) {
  const prev = i ? TIERS[i - 1].features : {};
  return FEATURES.filter((f) => f.id !== "support" && TIERS[i].features[f.id] && !prev[f.id]);
}

function Price({ t, annual }) {
  if (!t.monthly) return <div><span className="eyebrow block">&nbsp;</span><p className="font-display text-5xl font-light">Free</p><p className="mt-1 text-xs text-muted">No card needed · {CURRENCY}</p></div>;
  const per = annual ? (t.monthly * ANNUAL_MONTHS_BILLED) / 12 : t.monthly;
  return (
    <div>
      <span className="eyebrow block">{t.from ? "From" : "\u00a0"}</span>
      <p className="font-display text-5xl font-light" style={{ fontVariantNumeric: "tabular-nums" }}>{money(per)}<span className="ml-1 text-base text-muted">/mo</span></p>
      <p className="mt-1 text-xs text-muted">{annual ? `Billed ${money(t.monthly * ANNUAL_MONTHS_BILLED)} a year` : "Billed monthly"} · {CURRENCY}</p>
    </div>
  );
}

function TierCard({ t, i, annual }) {
  const plus = added(i);
  const L = t.limits;
  const lines = [unlimited(L.resources, "resources hosted"), L.founders == null ? "Unlimited active founders" : `Up to ${L.founders.toLocaleString("en-CA")} active founders`, unlimited(L.admins, "admin seats"), `${L.aiGuide} AI guide use`];
  return (
    <article className={cx("card flex flex-col !p-6", t.popular && "ring-1 ring-ink/40")} data-testid={`plan-${t.id}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-2xl font-bold">{t.name}</h3>
        {t.popular && <Pill tone="blue">Most popular</Pill>}
      </div>
      <p className="mt-1 min-h-[2.5rem] text-sm text-muted">{t.forWho}</p>
      <div className="mt-5"><Price t={t} annual={annual} /></div>
      {t.id === "starter"
        ? <a href={WAITLIST} className="btn-ghost mt-5 justify-center border border-line" data-testid={`plan-cta-${t.id}`}>Join the waitlist</a>
        : <a href={planMail(t)} className={cx("mt-5 justify-center", t.popular ? "btn-primary" : "btn-ghost border border-line")} data-testid={`plan-cta-${t.id}`}>{t.from ? "Talk to us" : "Choose " + t.name}<ArrowRight className="h-4 w-4" aria-hidden /></a>}
      <ul className="mt-6 grid gap-2.5 border-t border-line/60 pt-5 text-sm">
        {lines.map((x) => <li key={x} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden /><span>{x}</span></li>)}
      </ul>
      <p className="eyebrow mt-5">{i ? `Everything in ${TIERS[i - 1].name}, plus` : "Includes"}</p>
      <ul className="mt-3 grid gap-2.5 text-sm">
        {(i ? [] : FEATURES.filter((f) => f.id !== "support" && t.features[f.id])).concat(i ? plus : []).map((f) => <li key={f.id} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden /><span>{f.label}</span></li>)}
        <li className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden /><span>{t.features.support} support</span></li>
      </ul>
      {t.note && <p className="mt-5 text-xs text-muted">{t.note}</p>}
    </article>
  );
}

const Cell = ({ v }) => (v === true ? <Check className="mx-auto h-4 w-4 text-emerald-500" aria-label="Included" /> : v === false ? <Minus className="mx-auto h-4 w-4 text-muted/50" aria-label="Not included" /> : <span>{v == null ? "Unlimited" : typeof v === "number" ? v.toLocaleString("en-CA") : v}</span>);

const FAQ = [
  ["What counts as a resource?", "Anything published in your catalogue: a program, grant, resource, perk or guide. Events, people and mentors do not count."],
  ["What is an active founder?", "A founder who signed in during the last 90 days. People who registered once and never came back do not count."],
  ["What happens if we go over a limit?", `You get a heads-up at 90%, then ${Math.round(GRACE * 100)}% of breathing room. Past that, we will ask you to move up a plan. Nothing is switched off without a conversation.`],
  ["Can we change plans?", "Yes. Move up or down at any time. Paying annually gets you 12 months for the price of 10."],
  ["Is there a free trial?", "Starter is free for good, up to 25 founders and 25 resources, so you can try the real product with your community."],
];

export default function SitePricing() {
  const [annual, setAnnual] = useState(false);
  const rows = comparison();
  return (
    <SiteShell title="Pricing">
      <PageTop eyebrow="Pricing" title="Simple plans that grow with your community." sub="One flat monthly price. Choose how many resources you host and which features you need." />

      <Section className="!pt-6">
        <div className="mb-8 flex justify-center">
          <div className="inline-flex rounded-full border border-line bg-ink/5 p-1 text-sm" role="group" aria-label="Billing period">
            {[[false, "Monthly"], [true, "Annual"]].map(([v, label]) => (
              <button key={label} type="button" onClick={() => setAnnual(v)} aria-pressed={annual === v} className={cx("rounded-full px-4 py-1.5", annual === v ? "bg-ink text-paper" : "text-muted hover:text-ink")} data-testid={`billing-${v ? "annual" : "monthly"}`}>{label}{v && <span className="ml-1.5 text-[11px] opacity-80">2 months free</span>}</button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="site-plans">
          {TIERS.map((t, i) => <TierCard key={t.id} t={t} i={i} annual={annual} />)}
        </div>
        <p className="mt-6 text-center text-xs text-muted">Prices in {CURRENCY}, before tax. Placeholder pricing while Pathwai is in early access.</p>
      </Section>

      <Section eyebrow="Compare plans" title="Everything, side by side." className="max-md:hidden border-t border-line/60">
        <div className="card overflow-x-auto !p-0" data-testid="site-compare">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line/60">
                <th className="p-4 text-left font-normal text-muted"><span className="sr-only">Feature</span></th>
                {TIERS.map((t) => <th key={t.id} className="p-4 text-center font-bold">{t.name}<span className="mt-0.5 block text-xs font-normal text-muted">{t.monthly ? `${t.from ? "From " : ""}${money(t.monthly)}/mo` : "Free"}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-line/40 last:border-0">
                  <th scope="row" className="p-4 text-left font-normal">{r.label}</th>
                  {r.values.map((v, k) => <td key={k} className="p-4 text-center text-muted"><Cell v={v} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section eyebrow="Questions" title="Good to know." className="border-t border-line/60">
        <div className="mx-auto grid max-w-3xl gap-3" data-testid="site-faq">
          {FAQ.map(([q, a]) => (
            <details key={q} className="card group !p-5">
              <summary className="cursor-pointer list-none text-lg font-bold marker:hidden">{q}</summary>
              <p className="mt-2 text-muted">{a}</p>
            </details>
          ))}
        </div>
      </Section>

      <Section className="border-t border-line/60">
        <div className="card mx-auto max-w-3xl text-center !p-8 sm:!p-10">
          <h2 className="text-3xl sm:text-4xl" style={{ textWrap: "balance" }}>Not sure which plan fits?</h2>
          <p className="mx-auto mt-3 max-w-md text-muted">Tell us about your community and we will recommend one.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/contact" className="btn-primary !px-6 !py-3">Talk to us<ArrowRight className="h-4 w-4" aria-hidden /></Link>
            <a href={WAITLIST} className="btn-ghost border border-line !px-6 !py-3">Join the waitlist</a>
          </div>
        </div>
      </Section>
    </SiteShell>
  );
}
