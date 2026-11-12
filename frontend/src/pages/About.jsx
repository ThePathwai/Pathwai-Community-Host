import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Compass, Gift, Handshake, Rocket, Route, Target, Users } from "lucide-react";
import { Wordmark, PoweredBy } from "../components/ui";
import { startHubDemo } from "../lib/demo";

// /about: public (no login). One idea, said plainly: Pathwai is an innovation navigation system. A founder says what they are building, the hub
// shows what fits and why, and they leave with a decision plan. Plain data below so copy edits are one-liners.

const STEPS = [
  [Rocket, "Tell it about your business", "Your stage, what you need, what you want to do next."],
  [Compass, "See what fits, and why", "Every program, grant, event, person and resource is checked against you."],
  [Target, "Make the decision", "Pick a direction, or say it in your own words."],
  [Route, "Leave with a plan", "Next 2 weeks, 30 days and 90 days. Start it alone or share it."],
];

const OPTIONS = [
  [Compass, "Programs and grants", "Good match now, not yet, or not a match, with the reason."],
  [CalendarDays, "Events", "The ones worth your time first, soonest at the top."],
  [Users, "People", "Mentors, alumni and founders who can help with what you need."],
  [Gift, "Resources", "Guides, templates and perks, checked the same way."],
];

const FOR_HUBS = [
  "Your programs, events, people and resources come first. The rest of the country is one tap away.",
  "Your name and colours, on your own address.",
  "Founders leave with a decision plan they can take to your team.",
];

export default function About() {
  const demo = () => startHubDemo();
  return (
    <div className="w-full" data-testid="about">
      <header className="glass sticky top-0 z-30 border-b border-line/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 lg:px-8">
          <Link to="/" className="shrink-0 text-2xl"><Wordmark name="Pathwai" brand={{}} /></Link>
          <div className="flex shrink-0 items-center gap-2">
            <Link to="/login" className="btn-ghost hidden whitespace-nowrap sm:inline-flex" data-testid="about-signin">Sign in</Link>
            <button type="button" onClick={demo} className="btn-primary whitespace-nowrap" data-testid="about-demo-top">Try the demo</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 lg:px-8">
        <section className="py-12 sm:py-20">
          <p className="eyebrow">Innovation navigation</p>
          <h1 className="mt-4 max-w-4xl text-5xl sm:text-6xl lg:text-7xl" style={{ textWrap: "balance" }}>Find the right next step for your startup.</h1>
          <p className="mt-5 max-w-xl text-lg text-muted sm:text-xl">Pathwai matches founders to the programs, grants, events, people and resources around them, then helps them turn it into a decision.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button type="button" onClick={demo} className="btn-primary" data-testid="about-demo">Try the demo</button>
            <Link to="/signup" className="btn-ghost border border-line" data-testid="about-signup">Get started</Link>
          </div>
          <p className="mt-3 text-xs text-muted">The demo uses sample data. Nothing in it touches a real hub.</p>
        </section>

        <section id="how" className="border-t border-line py-12 sm:py-16">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-3 max-w-2xl text-3xl sm:text-5xl" style={{ textWrap: "balance" }}>From a profile to a decision plan.</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="about-steps">
            {STEPS.map(([Icon, title, body], i) => (
              <li key={title} className="card flex flex-col gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink/[.06]"><Icon className="h-5 w-5" aria-hidden /></span>
                <p className="text-xs font-semibold uppercase text-muted" style={{ letterSpacing: "0.12em" }}>Step {i + 1}</p>
                <h3 className="text-lg font-bold leading-snug">{title}</h3>
                <p className="text-sm text-muted">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="options" className="border-t border-line py-12 sm:py-16">
          <p className="eyebrow">What founders see</p>
          <h2 className="mt-3 max-w-2xl text-3xl sm:text-5xl" style={{ textWrap: "balance" }}>Every option, with the reason.</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2" data-testid="about-options">
            {OPTIONS.map(([Icon, title, body]) => (
              <li key={title} className="card flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink/[.06]"><Icon className="h-5 w-5" aria-hidden /></span>
                <span><span className="block text-lg font-bold leading-snug">{title}</span><span className="mt-1 block text-sm text-muted">{body}</span></span>
              </li>
            ))}
          </ul>
        </section>

        <section id="hubs" className="border-t border-line py-12 sm:py-16">
          <p className="eyebrow">For innovation hubs</p>
          <h2 className="mt-3 max-w-2xl text-3xl sm:text-5xl" style={{ textWrap: "balance" }}>Point founders to what you already have.</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-3" data-testid="about-hubs">
            {FOR_HUBS.map((t) => (
              <li key={t} className="card flex items-start gap-3"><Handshake className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden /><span className="text-sm leading-relaxed">{t}</span></li>
            ))}
          </ul>
        </section>

        <div className="border-t border-line py-16 text-center sm:py-24">
          <h2 className="mx-auto max-w-2xl text-4xl sm:text-6xl" style={{ textWrap: "balance" }}>Watch a founder find their next step.</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={demo} className="btn-primary" data-testid="about-cta">Try the demo<ArrowRight className="h-4 w-4" aria-hidden /></button>
            <Link to="/signup" className="btn-ghost border border-line">Get started</Link>
          </div>
        </div>
        <PoweredBy className="pb-10 text-center" />
      </main>
    </div>
  );
}
