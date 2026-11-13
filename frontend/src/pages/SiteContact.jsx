import React, { useState } from "react";
import { Building2, Handshake, Mail, TrendingUp } from "lucide-react";
import { CONTACT, PageTop, Section, SiteShell } from "../components/SiteKit";

// The website's Contact page (/contact). There is no message service behind the site yet, so the form builds an email in the visitor's own mail app.

const REACH = [
  [Handshake, "Partnerships", "Integrate Pathwai into your ecosystem."],
  [TrendingUp, "Investment", "Join our mission to power innovation communities."],
  [Building2, "Enterprise", "Custom solutions for your organization."],
];
const TOPICS = ["Partnerships", "Investment", "Enterprise", "Join the waitlist", "Something else"];

export default function SiteContact() {
  const [f, setF] = useState({ name: "", email: "", org: "", topic: TOPICS[0], message: "" });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const send = (e) => {
    e.preventDefault();
    const body = `${f.message}\n\n${f.name}${f.org ? `\n${f.org}` : ""}\n${f.email}`;
    window.location.href = `mailto:${CONTACT}?subject=${encodeURIComponent(f.topic)}&body=${encodeURIComponent(body)}`;
  };
  return (
    <SiteShell title="Contact">
      <PageTop eyebrow="Contact" title="Get in touch." sub="Let's build the future of community together." />

      <Section className="!pt-6">
        <div className="grid gap-4 sm:grid-cols-3" data-testid="site-reach">
          {REACH.map(([Icon, t, d]) => (
            <a key={t} href={`mailto:${CONTACT}?subject=${encodeURIComponent(t)}`} className="card card-hover block"><Icon className="h-5 w-5 text-muted" aria-hidden /><p className="eyebrow mt-4">{t}</p><p className="mt-1 text-lg font-bold leading-snug">{d}</p></a>
          ))}
        </div>
      </Section>

      <Section eyebrow="Send a message" title="Tell us what you need." className="border-t border-line/60">
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <form onSubmit={send} className="card grid gap-4 !p-6 sm:!p-8" data-testid="site-contact-form">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="label">Name</span><input className="input" required value={f.name} onChange={set("name")} autoComplete="name" data-testid="contact-name" /></label>
              <label className="block"><span className="label">Email</span><input className="input" type="email" required value={f.email} onChange={set("email")} autoComplete="email" data-testid="contact-email" /></label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="label">Organization</span><input className="input" value={f.org} onChange={set("org")} autoComplete="organization" data-testid="contact-org" /></label>
              <label className="block"><span className="label">About</span>
                <select className="input" value={f.topic} onChange={set("topic")} data-testid="contact-topic">{TOPICS.map((t) => <option key={t}>{t}</option>)}</select></label>
            </div>
            <label className="block"><span className="label">Message</span><textarea className="input min-h-[140px]" required value={f.message} onChange={set("message")} data-testid="contact-message" /></label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className="btn-primary" data-testid="contact-send">Send message</button>
              <p className="text-xs text-muted">This opens your email app with the message ready to send.</p>
            </div>
          </form>
          <div className="card h-fit">
            <Mail className="h-5 w-5 text-muted" aria-hidden />
            <p className="eyebrow mt-4">Email us</p>
            <a href={`mailto:${CONTACT}`} className="hit mt-1 block break-all text-xl font-bold underline underline-offset-4" data-testid="site-email">{CONTACT}</a>
            <p className="mt-3 text-sm text-muted">Partnerships, investment, enterprise and waitlist questions all come to the same inbox.</p>
          </div>
        </div>
      </Section>
    </SiteShell>
  );
}
