// Terms of Service + Privacy Policy text, and the one place the version people accept is defined.
//
// LEGAL_VERSION must match LEGAL_VERSION in backend/routes/_common.py -- the server stamps that value
// onto every new account ("accepted version X on date Y"). Bump BOTH when either document changes in a
// way people should re-accept.
//
// NOTE: this is a plain-language starting draft written for a Canadian (Ontario) community platform. It is
// not legal advice -- have a lawyer review it, and set REACT_APP_LEGAL_EMAIL / REACT_APP_LEGAL_ENTITY (build
// variables) to your real contact address and operating entity before launch.
export const LEGAL_VERSION = "2026-10-06";
export const LEGAL_EFFECTIVE = "October 6, 2026";
export const LEGAL_EMAIL = process.env.REACT_APP_LEGAL_EMAIL || "privacy@pathwai.app";
export const LEGAL_ENTITY = process.env.REACT_APP_LEGAL_ENTITY || "Pathwai";

export const TERMS = {
  title: "Terms of Service",
  intro: `These Terms govern your use of ${LEGAL_ENTITY}'s website and apps ("Pathwai", "we", "us"). By creating an account or using Pathwai you agree to them. If you don't agree, please don't create an account.`,
  sections: [
    ["Who can use Pathwai", [
      "You must be at least 13 years old. If a community you want to join sets a higher minimum age, you must meet it. If you are under the age of majority where you live, you confirm a parent or guardian is aware you are using Pathwai and agrees to these Terms.",
      "You agree to give accurate information and to keep it up to date.",
    ]],
    ["Your account", [
      "One Pathwai account lets you apply to and belong to many communities. Keep your password private and tell us right away if you think someone else has used your account. You are responsible for what happens under your account.",
      "Signing in with Google or Apple lets us confirm your email address; we don't receive your Google or Apple password.",
    ]],
    ["Communities and approval", [
      "Pathwai is a platform: each community is created and run by its own organizers (\"community admins\"). Joining a community requires an admin's approval, and admins can decline, remove or restrict members at their discretion under their own rules.",
      "Events, memberships, payments, messages and other offerings inside a community are between you and that community. Pathwai is not the organizer or seller, and is not responsible for events, advice or promises made by communities or other members.",
    ]],
    ["What you post", [
      "You keep ownership of the profile information, photos, messages and other content you post (\"Your Content\"). You give us a limited licence to host, store, display and transmit it as needed to run Pathwai and to show it to the people you choose, according to your visibility settings and the community you are in.",
      "You promise you have the right to post it, and that it doesn't break the law or anyone else's rights.",
    ]],
    ["Be decent", [
      "Don't harass, threaten, impersonate or discriminate against anyone; don't post unlawful, hateful, sexually explicit or deceptive content; don't send spam or scrape member information; don't try to break, probe or overload the service or access accounts or data that aren't yours; and don't use Pathwai to sell or promote anything without the community's permission.",
      "You can report a message or person to us or to a community admin. We may remove content or suspend accounts that break these rules or put others at risk.",
    ]],
    ["If you run a community", [
      "Community admins are responsible for their community: for how they use members' information, for the accuracy of their events and prices, and for obeying laws that apply to them, including Canada's Anti-Spam Legislation (CASL) and privacy laws when they send emails or text messages. Only message people who have agreed to receive messages, and honour opt-outs (for example a STOP reply to a text).",
      "If you connect third-party tools (Stripe, Twilio, SendGrid, Airtable, Luma or others), you remain responsible for your accounts with them and for their terms.",
    ]],
    ["Payments", [
      "Membership dues and event tickets are paid to the community through our payment partner (Stripe). We do not see or store full card numbers. Prices, taxes and refund rules are set by the community, so contact the community about refunds.",
    ]],
    ["Third-party services", [
      "Pathwai may link to or work with services we don't control (for example Luma, Typeform, Google Forms). Their own terms and privacy practices apply when you use them.",
    ]],
    ["Ending your account", [
      "You can stop using Pathwai at any time and ask us to delete your account (see the Privacy Policy). We may suspend or end access if you break these Terms, if required by law, or if we stop offering the service. Sections that by their nature should continue (for example disclaimers and limits of liability) survive.",
    ]],
    ["Disclaimers", [
      "Pathwai is provided \"as is\" and \"as available\". We work to keep it reliable and secure but don't promise it will always be uninterrupted or error-free. We aren't responsible for the conduct of members or communities, or for in-person events you attend.",
    ]],
    ["Limit of liability", [
      "To the fullest extent permitted by law, we are not liable for indirect, incidental or consequential losses, or for loss of data, profits or goodwill, arising from your use of Pathwai. Our total liability for any claim is limited to the greater of CAD $100 or the amount you paid us (if any) in the 12 months before the claim. Nothing here limits liability that cannot be limited by law, including your statutory consumer rights.",
    ]],
    ["Governing law", [
      "These Terms are governed by the laws of the Province of Ontario and the federal laws of Canada that apply there. Disputes will be decided by the courts located in Toronto, Ontario, unless the law gives you the right to bring a claim elsewhere.",
    ]],
    ["Changes", [
      "We may update these Terms. If a change is significant we will tell you in the product or by email and, where required, ask you to accept the new version. If you keep using Pathwai after a change takes effect you accept it.",
    ]],
    ["Contact", [`Questions about these Terms: ${LEGAL_EMAIL}.`]],
  ],
};

export const PRIVACY = {
  title: "Privacy Policy",
  intro: `${LEGAL_ENTITY} ("Pathwai", "we", "us") respects your privacy. This policy explains what we collect, why, who sees it and the choices you have. It is written to meet Canadian privacy law (PIPEDA); we treat people elsewhere the same way.`,
  sections: [
    ["What we collect", [
      "Account details: your name, email address and a securely hashed password (or, if you sign in with Google or Apple, the name, email and profile picture they share with us).",
      "Profile details you choose to add: age, what you do, employer or school, city or neighbourhood, bio, skills, interests, goals, photos, phone number and links such as LinkedIn, Instagram or a website. All of this is optional.",
      "Community activity: communities you apply to or join, your answers to application questions, event RSVPs and tickets, messages you send, requests and forms you complete, and notification and communication preferences.",
      "Payments: if you pay dues or buy a ticket, Stripe collects your card details; we receive only a confirmation, the amount and a reference. We never see or store your full card number.",
      "Technical data: IP address, device and browser type, and basic logs we need to keep the service secure and working.",
      "Consent record: when you created your account and which version of these documents you accepted.",
    ]],
    ["How we use it", [
      "To create and secure your account; to let you discover, apply to and take part in communities; to show your profile to others as described below; to deliver messages, event updates and the notifications you've asked for; to process payments through the community's payment account; to prevent abuse and fraud; to fix problems and improve Pathwai; and to meet legal obligations.",
      "We don't sell your personal information and we don't use it for third-party advertising.",
    ]],
    ["Who can see what", [
      "People in the communities you belong to, and other Pathwai members, may see the profile details you make visible. Your email and phone number follow your visibility setting for each community. You can edit your profile and photos, and change what is shown, in your account at any time.",
      "Community admins can see your application answers and the profile details you share with their community, can message you, and (if they connect messaging tools) may email or text you if you've opted in. They are responsible for how they use that information; please read a community's own rules before you join.",
      "Messages are visible to the people in the conversation, and to us only when needed to investigate abuse, a report you make, or a legal requirement.",
    ]],
    ["Service providers", [
      "We use trusted providers to run Pathwai: cloud hosting and database services, email delivery (SendGrid), sign-in (Google, Apple) and payments (Stripe). Community admins may also connect their own tools, such as Twilio for text messages, SendGrid for email, Airtable or Luma, which then receive the member information needed for that purpose. These providers may only use your information to provide their service to us or to the community.",
      "We may also disclose information if the law requires it, to protect people's safety or our rights, or in connection with a business transfer (with the same protections).",
    ]],
    ["Where it is stored", [
      "Your information may be stored and processed on servers in Canada, the United States or other countries where our providers operate, where it can be subject to those countries' laws.",
    ]],
    ["Cookies", [
      "We use only the cookies the service needs to work: they keep you signed in and remember which community you are viewing. We don't use advertising or cross-site tracking cookies.",
    ]],
    ["How long we keep it", [
      "We keep your account information while your account is open. If you ask us to delete your account we remove or anonymize your personal information within a reasonable period, except where we must keep some records for legal, security or payment reasons. Content you posted in a community (such as event comments or messages other people received) may remain visible to them in anonymized form.",
    ]],
    ["Your choices and rights", [
      "You can access and correct your information in your account, opt out of text and email messages in Settings (and reply STOP to any text), and ask us to delete your account. You can also ask for a copy of your information, withdraw consent, or raise a privacy concern with us at the address below. You may also complain to the Office of the Privacy Commissioner of Canada.",
    ]],
    ["Security", [
      "We use industry-standard safeguards, including encrypted connections, hashed passwords and encrypted storage of integration keys, and limit who can access personal information. No system is perfectly secure, so please use a strong, unique password.",
    ]],
    ["Children", [
      "Pathwai is not for children under 13 and we don't knowingly collect their information. If you believe a child under 13 has an account, contact us and we'll remove it.",
    ]],
    ["Changes to this policy", [
      "We'll post updates here and, if the change is significant, tell you in the product or by email.",
    ]],
    ["Contact us", [`Privacy questions, access or deletion requests: ${LEGAL_EMAIL}.`]],
  ],
};
