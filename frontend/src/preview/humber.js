// The "Humber Innovation Network" demo community: a network that connects student and alumni founders from Humber
// Polytechnic (Toronto) with investors, industry leaders and innovation partners. Founders carry their pitch right on
// their profile: the one-liner, the problem, the solution, traction, market and the ask, plus a link to the deck.
// The setting is real (Humber's Longo Centre for Entrepreneurship runs the BMO Launch Me pitch competition, where
// finalists get five minutes to pitch and then take judges' questions). Every person, venture, number, investor
// and perk below is made up for the demo. Dates are relative to today.

import { buildDemo, cover } from "./demoKit";

export const HUMBER_SLUG = "humber-innovation-network";
const ME = "u-hm-me";          // the member-demo persona (a founder)
const DANA = "u-hm-dana";      // the admin-demo persona (programs lead)

const COLORS = { accent: "#0B4EA2", on_accent: "#FFFFFF", background: "#F4F6FA", surface: "#FFFFFF", text: "#0B1F3A", muted: "#5D6B82", border: "#DCE3EE" };
const BRAND = {
  preset: "custom", mode: "light", colors: COLORS, font: "Manrope", heading_font: "Plus Jakarta Sans", heading_style: "normal",
  radius: "soft", button_shape: "rounded", logo_url: null, logo_mark_url: null, logo_adapts: true, show_name_with_logo: true,
  login_headline: "Where founders meet capital.", login_subhead: "Pitch to investors, get advice from people who've built it, and find your next customer.",
  welcome_message: "Pitch Day applications are open. Here's who's in the room and what's coming up.", footer_text: "Humber Innovation Network · demo community", support_email: "",
};
const COVERS = {
  blue: cover("#E8EEF8", "#0B4EA2", "#F2B33D"), gold: cover("#FBF3E2", "#F2B33D", "#0B4EA2"), teal: cover("#E6F3F1", "#1B9C8E", "#0B4EA2"),
  slate: cover("#EBEEF3", "#5D6B82", "#F2B33D"), coral: cover("#FBEDE8", "#E76F51", "#0B4EA2"),
};

const doc = (title, id) => ({ title, url: `https://example.com/humber-network/decks/${id}` });

// [id, name, member_type, title, company, location, bio, offers, interests, goals, needs, open_to, extra]
// Types: founder = Founder, partner = Investor, mentor = Industry leader, alumni = Innovation partner
const PEOPLE = [
  [DANA, "Dana Whitfield", "alumni", "Entrepreneurship programs lead", "Humber Polytechnic", "Etobicoke",
    "I run the pitch programs: workshops, mentor matching and pitch day. I make sure every founder gets five honest minutes with the right investor and a plan for what comes next.",
    ["Pitch coaching", "Mentor matching", "Program design", "Introductions to investors"], ["Startups", "Community building", "Running"],
    ["Fill every pitch day with the right judges", "Place 30 founders with a mentor this term"], ["Judges", "Investors", "Industry mentors"], ["Partnerships", "Mentoring"],
    { stage: "Innovation partner" }],
  [ME, "Fife Ashley-Dejo", "founder", "Founder", "Toronto Player League", "Toronto",
    "Pitching a community platform for wellness event brands: one place for members, events, perks and sponsors. I run a weekly wellness events community in Toronto and I'm building the tools I wish I had.",
    ["Community building", "Event operations", "Brand partnerships"], ["Padel", "Running", "Afrobeats"],
    ["Pilot with student clubs", "Land three sponsor partners"], ["Sponsor intros", "Feedback on my pitch", "A technical advisor"], ["Introductions", "Pilots"],
    { startup_name: "Pathwai", startup_one_liner: "A white-label home for wellness event communities: members, events, perks and sponsors in one place.", stage: "Pre-seed", industry: "Community & wellness",
      pitch: {
        problem: "Wellness event brands run on group chats, spreadsheets and DMs. Members drift, sponsors can't see impact and the host does everything by hand.",
        solution: "A branded member network: directory, events, perks, news and smart introductions, set up in an afternoon and run by the host.",
        traction: "Live demo communities for a wellness events brand, a Pilates studio, a church and a pro-sports community. A weekly events community in Toronto as the proving ground.",
        market: "Thousands of wellness, run-club and fitness event brands in Canada alone, each with a community and no software built for it.",
        ask: "Introductions to wellness sponsors, a pilot with two Humber student clubs, and a technical advisor.",
      },
      documents: [doc("Pitch deck · 10 slides", "pathwai")], social_links: { website: "https://example.com/pathwai" } }],
  ["u-hm-amina", "Amina Yusuf", "founder", "Founder & CEO", "Tidewell", "Rexdale",
    "Health Technology Management student. I watched my mother miss doses after moving to Canada, and I built Tidewell so no newcomer has to manage medication alone in a second language.",
    ["Health-tech product", "Newcomer user research", "Clinical pilots"], ["Public health", "Cooking", "Football"],
    ["Pilot with ten community clinics", "Close a pre-seed round"], ["Clinical advisors", "Pre-seed investors", "Multilingual UX"], ["Pilots", "Mentoring"],
    { startup_name: "Tidewell", startup_one_liner: "Medication reminders in the patient's own language, with a caregiver view that keeps families in the loop.", stage: "Pre-seed", industry: "Health tech",
      pitch: {
        problem: "Newcomers manage prescriptions in a language they're still learning. Missed doses lead to avoidable ER visits and stressed families.",
        solution: "A mobile app with voice and text reminders in eight languages, refill alerts and a shareable caregiver dashboard.",
        traction: "Three pilots with community clinics, 410 weekly active users and a 78% on-time-dose rate across the pilots.",
        market: "Over 400,000 newcomers settle in Canada each year, and most take at least one daily medication within five years.",
        ask: "$250K pre-seed to fund a clinical study, translation partnerships and one engineer.",
      },
      documents: [doc("Pitch deck · 12 slides", "tidewell"), doc("One-pager · clinic partnership", "tidewell-clinics")], social_links: { website: "https://example.com/tidewell" } }],
  ["u-hm-luca", "Luca Ferreira", "founder", "Co-founder", "Brickwise", "Mississauga",
    "Construction Management graduate. Spent three summers on renovation crews watching contractors drive across the city for one box of tile. Brickwise is the marketplace that fixes that.",
    ["Marketplace operations", "Contractor networks", "Supplier negotiations"], ["Soccer", "Home reno", "Coffee"],
    ["Reach $100K monthly GMV", "Raise a seed round"], ["Seed investors", "Supply-chain mentors", "A senior engineer"], ["Fundraising", "Mentoring"],
    { startup_name: "Brickwise", startup_one_liner: "A marketplace that gets renovation materials to GTA contractors the same day.", stage: "Seed", industry: "Construction tech",
      pitch: {
        problem: "Small contractors lose half a day on every job driving to pick up materials, and suppliers can't reach them efficiently.",
        solution: "Same-day delivery from local suppliers, ordered from a phone, with job-based billing for contractors.",
        traction: "120 active contractors, 14 suppliers, $38K monthly GMV and 62% month-over-month repeat orders.",
        market: "The GTA renovation materials market is a multi-billion-dollar spend, almost all of it bought in person.",
        ask: "$750K seed to expand from two suppliers' zones to the full GTA and add a delivery partner.",
      },
      documents: [doc("Pitch deck · 14 slides", "brickwise"), doc("Financial model", "brickwise-model")], social_links: { website: "https://example.com/brickwise" } }],
  ["u-hm-mei", "Mei Lin Chow", "founder", "Founder", "Sprout & Co.", "Scarborough",
    "Business and Sustainability student making packaging from the farm waste that normally gets burned. Prototype to pilot is the next hurdle.",
    ["Materials R&D", "Sustainability", "Supplier relationships"], ["Gardening", "Cycling", "Ceramics"],
    ["Run a 5,000-unit pilot", "Win a grocery partner"], ["Grocery distributors", "Manufacturing mentors", "Grants"], ["Pilots", "Funding"],
    { startup_name: "Sprout & Co.", startup_one_liner: "Compostable food packaging made from agricultural waste, priced to match plastic.", stage: "Prototype", industry: "Sustainability",
      pitch: {
        problem: "Food retailers want to drop plastic but compostable options cost two to three times more and few can be certified.",
        solution: "Moulded trays and clamshells made from wheat straw and husk, with a target unit cost within 10% of plastic.",
        traction: "Working prototypes, two letters of intent from grocery distributors and a lab report on compostability.",
        market: "Grocery and ready-meal packaging is one of the fastest-growing categories as bans on single-use plastics expand.",
        ask: "$120K in grants and pre-seed to run a pilot line, plus an intro to a contract manufacturer.",
      },
      documents: [doc("Pitch deck · 11 slides", "sprout")], social_links: { website: "https://example.com/sprout" } }],
  ["u-hm-jaden", "Jaden Brooks", "founder", "Founder", "ReelCoach", "Brampton",
    "Sport Management grad who coaches youth basketball on weekends. Wanted to send each player 30 seconds of feedback and couldn't, so I built the tool.",
    ["Sports tech", "Coaching", "Short video"], ["Basketball", "Film", "Hip-hop"],
    ["Reach 50 clubs", "Close a pre-seed round"], ["Club partnerships", "Pre-seed investors", "Mobile developer"], ["Partnerships", "Pilots"],
    { startup_name: "ReelCoach", startup_one_liner: "Video feedback for youth sports coaches: tag a play, send a clip, done in thirty seconds.", stage: "Pre-seed", industry: "Sports tech",
      pitch: {
        problem: "Youth coaches have no time for film. Players get generic feedback, parents get no visibility and clubs have no development record.",
        solution: "A phone app that lets a coach tag a play, record a voice note and send a clip to the player and parents in seconds.",
        traction: "Six clubs, 90 coaches and 1,400 players in the pilot. Coaches average 11 clips a week.",
        market: "Youth sport participation in Canada runs into the millions, with clubs paying for software they barely use.",
        ask: "$200K pre-seed to hire a mobile developer and run two league partnerships.",
      },
      documents: [doc("Pitch deck · 10 slides", "reelcoach")], social_links: { website: "https://example.com/reelcoach" } }],
  ["u-hm-fatima", "Fatima Al-Sayed", "founder", "CEO", "Maple Route", "North York",
    "International Business alum who grew up in a family export business. Cross-border paperwork is the quiet killer of small Canadian exporters, and I'm turning it into a button.",
    ["Cross-border logistics", "Customs & compliance", "Export strategy"], ["Travel", "Languages", "Tea"],
    ["Onboard 200 small exporters", "Raise a seed round"], ["Customs brokers", "Seed investors", "Freight partners"], ["Fundraising", "Partnerships"],
    { startup_name: "Maple Route", startup_one_liner: "One-click customs and shipping for small Canadian exporters selling to the US and EU.", stage: "Seed", industry: "Logistics",
      pitch: {
        problem: "A small exporter spends more time on customs forms than on sales, and one wrong code can freeze a shipment for weeks.",
        solution: "Automated HS-code classification, documents and carrier booking in one flow, with a broker on call for edge cases.",
        traction: "68 exporters, $2.1M in shipments processed and a 41% reduction in clearance time on average.",
        market: "Tens of thousands of Canadian small businesses export, and most still rely on spreadsheets and email.",
        ask: "$1M seed to hire in compliance and sales, and to open a US warehouse partnership.",
      },
      documents: [doc("Pitch deck · 13 slides", "maple-route"), doc("Customer case study", "maple-route-case")], social_links: { website: "https://example.com/maple-route" } }],
  ["u-hm-ethan", "Ethan Park", "founder", "Founder", "StudyLoop", "Etobicoke",
    "Third-year student who tutored half his floor in first year. StudyLoop pays senior students to tutor juniors, with the college's approval and the right guardrails.",
    ["Peer tutoring", "EdTech", "Student acquisition"], ["Chess", "Basketball", "Anime"],
    ["Launch with two Humber programs", "Win a college pilot"], ["Faculty champions", "Pre-seed investors", "Mentors in EdTech"], ["Pilots", "Mentoring"],
    { startup_name: "StudyLoop", startup_one_liner: "A peer-tutoring marketplace where senior students earn by helping first-years pass.", stage: "Pre-seed", industry: "EdTech",
      pitch: {
        problem: "First-year students fail courses they could pass with an hour of help, and colleges can't staff enough tutoring.",
        solution: "Verified peer tutors, scheduling, payments and a course-level dashboard so programs see where students struggle.",
        traction: "Pilots in two programs with 600 students, 180 tutoring hours booked and a 4.8 average rating.",
        market: "Every college and university in Canada has a retention problem and a tutoring budget that doesn't meet demand.",
        ask: "$180K pre-seed and a formal pilot with a college academic office.",
      },
      documents: [doc("Pitch deck · 9 slides", "studyloop")], social_links: { website: "https://example.com/studyloop" } }],
  ["u-hm-chiamaka", "Chiamaka Obi", "founder", "Founder", "Verde Wear", "Brampton",
    "Fashion Business student launching athleisure from recycled fibres, designed for the way people actually train in Toronto winters.",
    ["Apparel design", "Brand storytelling", "Supply chain"], ["Fashion", "Running", "Afrobeats"],
    ["Launch the first collection", "Reach 5,000 customers"], ["Manufacturing partners", "Brand investors", "Fashion retailers"], ["Partnerships", "Funding"],
    { startup_name: "Verde Wear", startup_one_liner: "Four-season athleisure made from recycled fibres, designed for Toronto winters.", stage: "Pre-revenue", industry: "Fashion",
      pitch: {
        problem: "Athleisure is either cheap and disposable or premium and nowhere near sustainable, and almost none of it is built for cold-weather training.",
        solution: "A small capsule collection in recycled fibres with thermal layers, priced between the fast-fashion and premium ends.",
        traction: "A 2,400-person waitlist, a finished prototype line and a sampling agreement with a certified manufacturer.",
        market: "Canadians spend heavily on activewear and increasingly choose sustainable brands.",
        ask: "$150K to fund the first production run, plus intros to two retail partners.",
      },
      documents: [doc("Pitch deck · 12 slides", "verde"), doc("Lookbook", "verde-lookbook")], social_links: { website: "https://example.com/verde" } }],
  ["u-hm-daniel", "Daniel Reyes", "founder", "Co-founder", "Shiftly", "Vaughan",
    "Computer Programming grad who ran the front desk at his mum's physio clinic. Shift scheduling by WhatsApp is how a surprising number of clinics still work.",
    ["Scheduling software", "SMB sales", "Product"], ["Chess", "Gym", "Podcasts"],
    ["Sign 40 clinics", "Hire a founding engineer"], ["Clinic owners", "Pre-seed investors", "An engineer"], ["Pilots", "Hiring"],
    { startup_name: "Shiftly", startup_one_liner: "Shift scheduling and cover for small clinics, built to replace WhatsApp and spreadsheets.", stage: "Pre-seed", industry: "SaaS",
      pitch: {
        problem: "Small clinics schedule staff in group chats. Cover is a scramble and last-minute gaps cost revenue.",
        solution: "Drag-and-drop schedules, instant cover requests and automatic compliance checks for healthcare staff.",
        traction: "11 clinics paying $149 a month, $1.6K in MRR and zero churn since launch.",
        market: "Tens of thousands of small clinics and care homes in Canada run on manual scheduling.",
        ask: "$300K pre-seed to hire a founding engineer and a clinic sales lead.",
      },
      documents: [doc("Pitch deck · 10 slides", "shiftly")], social_links: { website: "https://example.com/shiftly" } }],
  ["u-hm-priyanka", "Priyanka Desai", "partner", "Angel investor", "Independent", "Yorkville",
    "Former fintech COO now angel investing in Canadian pre-seed. I write $25K to $75K cheques and I prefer founders who've talked to forty customers before they talk to me.",
    ["Pre-seed cheques ($25K–$75K)", "Operations coaching", "Fintech intros"], ["Yoga", "Reading", "Travel"],
    ["Back eight pre-seed founders this year", "Mentor more women founders"], ["Founders with early traction", "Co-investors"], ["Investing", "Mentoring"],
    { stage: "Investor", industry: "Fintech", contact: { website: "https://example.com/priyanka" } }],
  ["u-hm-marcus", "Marcus Webb", "partner", "Partner", "Northgate Ventures", "King West",
    "We invest $250K to $1M at seed across SaaS, health and logistics. I like founders who can tell me what changed since last quarter, and what they'd do with twice the money.",
    ["Seed investing ($250K–$1M)", "Board experience", "Follow-on introductions"], ["Golf", "Cycling", "Jazz"],
    ["Find three seed-stage companies from the network"], ["Seed-stage founders", "Co-investors"], ["Investing", "Office hours"],
    { stage: "Investor", industry: "Venture capital", contact: { website: "https://example.com/northgate" } }],
  ["u-hm-helen", "Helen Okafor", "partner", "Regional director, business banking", "Lakeshore Business Bank", "Etobicoke",
    "I run small-business banking for the region and sit on pitch panels. I can talk through startup banking, working capital, and the loans and grants nobody mentions.",
    ["Business banking", "Working capital", "Grant navigation"], ["Community events", "Tennis", "Baking"],
    ["Sponsor two student pitch events", "Open banking to student founders"], ["Founders", "Programs to sponsor"], ["Sponsorship", "Judging"],
    { stage: "Investor", industry: "Banking", contact: { website: "https://example.com/lakeshore-bank" } }],
  ["u-hm-tom", "Tom Brennan", "partner", "Angel investor", "Independent", "Oakville",
    "Ran a manufacturing business for 25 years and sold it. Now I back hard-tech and product companies with long sales cycles and honest founders.",
    ["Angel cheques ($50K–$100K)", "Manufacturing know-how", "Supply-chain intros"], ["Fishing", "Hockey", "Woodworking"],
    ["Back a materials or hardware startup"], ["Founders in materials, hardware and logistics"], ["Investing", "Mentoring"],
    { stage: "Investor", industry: "Manufacturing" }],
  ["u-hm-samira", "Samira Haddad", "mentor", "VP Product", "ShelfWise", "Liberty Village",
    "I lead product at a grocery tech scale-up. I've reviewed hundreds of pitch decks and I'll tell you which slide is losing the room.",
    ["Product strategy", "Deck review", "Grocery & retail intros"], ["Cooking", "Cycling", "Design"],
    ["Mentor six student founders"], ["Founders to mentor"], ["Mentoring", "Office hours"],
    { stage: "Industry leader", industry: "Retail tech" }],
  ["u-hm-grant", "Grant Mitchell", "mentor", "COO", "Haulworks", "Mississauga",
    "COO of a regional logistics company. I'll tell you what a customer in my seat actually needs before they sign anything.",
    ["Logistics & operations", "Procurement insight", "Pilot hosting"], ["Hockey", "Barbecue", "Motorcycles"],
    ["Host two founder pilots"], ["Logistics and supply-chain founders"], ["Mentoring", "Pilots"],
    { stage: "Industry leader", industry: "Logistics" }],
  ["u-hm-nadia", "Nadia Petrov", "mentor", "Head of partnerships", "CareLoop Health", "Midtown",
    "Health-tech partnerships lead. I've walked many founders through hospital and clinic procurement, which is a different sport.",
    ["Clinical pilots", "Health procurement", "Hospital intros"], ["Hiking", "Film", "Tea"],
    ["Pair three health founders with clinics"], ["Health-tech founders"], ["Mentoring", "Pilots"],
    { stage: "Industry leader", industry: "Health tech" }],
  ["u-hm-kenji", "Kenji Watanabe", "mentor", "Founder & CEO (exited)", "Strobe Labs", "Distillery District",
    "Built and sold a hardware company. I mentor on the lonely parts of founding: hiring the first five people, saying no, and knowing when to stop.",
    ["Hiring first five", "Hardware & manufacturing", "Exit prep"], ["Cycling", "Ramen", "Synths"],
    ["Mentor two hardware founders"], ["Hardware and product founders"], ["Mentoring"],
    { stage: "Industry leader", industry: "Hardware" }],
  ["u-hm-roberto", "Roberto Alvarez", "alumni", "Corporate innovation lead", "Wavefront Telecom", "Financial District",
    "I look for startups my team can pilot with. We run three open innovation challenges a year and pay for the winning pilots.",
    ["Corporate pilots", "Open innovation challenges", "Enterprise intros"], ["Soccer", "Podcasts", "Cooking"],
    ["Pilot with five startups this year"], ["Founders with a working product"], ["Pilots", "Partnerships"],
    { stage: "Innovation partner", industry: "Telecom" }],
  ["u-hm-aisha", "Aisha Khan", "alumni", "Applied research lead", "Humber Polytechnic", "Etobicoke",
    "I lead applied research projects where students and industry partners work on real problems. If your startup needs a lab, a prototype or a research partner, start with me.",
    ["Applied research", "Prototyping labs", "Grant co-applications"], ["Research", "Running", "Baking"],
    ["Co-apply for three research grants"], ["Founders with research problems"], ["Research partnerships", "Grants"],
    { stage: "Innovation partner", industry: "Research" }],
];

function eventDefs({ at, until }) {
  const mon = until(1), tue = until(2), wed = until(3), thu = until(4), fri = until(5), sat = until(6);
  const CAMPUS = "Humber North Campus · innovation space (room sent when you RSVP)";
  const LAKE = "Humber Lakeshore Campus · innovation commons (room sent when you RSVP)";
  const ONLINE = "Online · link sent when you RSVP";
  const crowd = (...ids) => [DANA, ...ids];
  return [
    ["hm-e1", "Pitch Day: five minutes, five judges", "Every finalist gets five minutes to pitch and then takes the judges' questions. Judges come from banking, venture, industry and the city's small-business office. Audience votes for the room favourite.",
      DANA, "Dana Whitfield", at(thu + 7, 13), 240, CAMPUS, "Pitch", 150,
      crowd(ME, "u-hm-amina", "u-hm-luca", "u-hm-mei", "u-hm-jaden", "u-hm-fatima", "u-hm-ethan", "u-hm-chiamaka", "u-hm-daniel", "u-hm-priyanka", "u-hm-marcus", "u-hm-helen", "u-hm-samira"), ["pitch-day", "finals", "judges"],
      ["Doors and coffee (30 min)", "Opening remarks", "Pitches, five minutes each with questions", "Judges deliberate", "Winners and networking"], "Founders: arrive 45 minutes early with your deck on a USB stick and a backup PDF.", "blue", false],
    ["hm-e2", "Investor office hours: pre-seed", "Twenty-minute one-on-ones with angels and pre-seed funds. Bring your deck, a one-line ask and three questions. Founders who have done customer interviews get priority.",
      "u-hm-priyanka", "Priyanka Desai", at(tue, 16), 180, ONLINE, "Office Hours", 12,
      ["u-hm-priyanka", ME, "u-hm-amina", "u-hm-jaden", "u-hm-ethan", "u-hm-daniel", DANA], ["investors", "pre-seed", "office-hours"],
      ["Short intro", "20-minute one-on-ones", "Follow-up notes shared"], "Send your deck 24 hours ahead. Have your ask and use of funds ready.", "gold", false],
    ["hm-e3", "Pitch Practice Lab", "Practice your pitch in front of three mentors, then rewrite it. Every founder gets timed, interrupted with questions and a one-page feedback sheet.",
      DANA, "Dana Whitfield", at(wed, 17, 30), 120, CAMPUS, "Workshop", 30,
      crowd(ME, "u-hm-amina", "u-hm-luca", "u-hm-mei", "u-hm-jaden", "u-hm-samira", "u-hm-kenji", "u-hm-fatima"), ["pitch", "practice", "feedback"],
      ["Warm-up and format", "Round one: three-minute pitch", "Mentor feedback", "Round two: tighter pitch", "One-page feedback sheet"], "Bring your current deck and a printed one-liner.", "coral", false],
    ["hm-e4", "Founders × Industry mixer", "Founders meet the operators who might become their first customer. Name tags show what you build and what you're looking for, and we seat everyone by overlap.",
      "u-hm-grant", "Grant Mitchell", at(thu, 18), 120, "The Joinery · Liberty Village, Toronto", "Mixer", 80,
      crowd("u-hm-grant", "u-hm-nadia", "u-hm-samira", "u-hm-roberto", ME, "u-hm-luca", "u-hm-mei", "u-hm-amina", "u-hm-fatima", "u-hm-daniel"), ["mixer", "customers", "industry"],
      ["Name tags and drinks", "Table matches by overlap", "Two-minute lightning intros", "Open mingling"], "Bring a one-liner and a way to follow up (email, calendar link).", "teal", false],
    ["hm-e5", "Term sheets & SAFEs, explained", "A startup lawyer walks through the five clauses founders always miss: the cap, the discount, the pro-rata, the MFN and the liquidation preference. Q&A on anything in your own paperwork.",
      "u-hm-helen", "Helen Okafor", at(fri, 12), 75, ONLINE, "Workshop", 60,
      ["u-hm-helen", DANA, "u-hm-luca", "u-hm-fatima", "u-hm-amina", "u-hm-jaden"], ["legal", "term-sheets", "safe"],
      ["The five clauses that matter", "Worked example", "Q&A"], "Have a draft or a template ready if you want it reviewed live.", "slate", false],
    ["hm-e6", "Demo night: eight startups, three minutes each", "Short, fast and friendly. Eight founders demo a working product to a room of investors, customers and classmates. No slides; the product has to speak.",
      DANA, "Dana Whitfield", at(thu + 14, 18), 150, LAKE, "Demo Night", 120,
      crowd(ME, "u-hm-amina", "u-hm-luca", "u-hm-daniel", "u-hm-ethan", "u-hm-jaden", "u-hm-marcus", "u-hm-roberto", "u-hm-aisha"), ["demo-night", "product", "founders"],
      ["Doors", "Eight demos, three minutes each", "Audience questions", "Networking"], "Founders: a stable demo environment and a backup recording.", "blue", false],
    ["hm-e7", "Customer discovery sprint", "Ten conversations with strangers in one afternoon. A coach gives you a script, a quota and a debrief. Your idea will change, and that's the point.",
      "u-hm-samira", "Samira Haddad", at(sat, 10), 240, CAMPUS, "Workshop", 40,
      ["u-hm-samira", DANA, "u-hm-mei", "u-hm-chiamaka", "u-hm-ethan", "u-hm-jaden", ME], ["customer-discovery", "research", "sprint"],
      ["The script and the quota", "Out on campus: ten conversations", "Debrief and what changed", "Rewrite your problem slide"], "Comfortable shoes and a notebook.", "coral", false],
    ["hm-e8", "Funding landscape: grants, accelerators and angels", "A map of early-stage money in the GTA: what each source expects, how long it takes and which founders it fits. Guests from a grant program, an accelerator and an angel group.",
      DANA, "Dana Whitfield", at(mon + 7, 17), 90, ONLINE, "Workshop", 100,
      crowd("u-hm-marcus", "u-hm-priyanka", "u-hm-aisha", "u-hm-amina", "u-hm-luca", "u-hm-mei", "u-hm-chiamaka"), ["funding", "grants", "angels"],
      ["Grants and non-dilutive money", "Accelerators", "Angels and pre-seed funds", "Q&A"], "Know your stage and roughly how much you want to raise.", "gold", false],
    ["hm-e9", "Innovation partner showcase: open challenges", "Three corporate partners present real problems they will pay a startup to solve. Winning pitches get a funded pilot. Founders choose a challenge and pitch in three minutes.",
      "u-hm-roberto", "Roberto Alvarez", at(thu + 21, 15), 150, CAMPUS, "Pitch", 100,
      ["u-hm-roberto", DANA, "u-hm-grant", "u-hm-nadia", ME, "u-hm-luca", "u-hm-daniel", "u-hm-fatima"], ["corporate", "pilots", "challenge"],
      ["Three corporate challenge briefs", "Founder pitches (3 minutes each)", "Partner Q&A", "Networking"], "Read the challenge briefs beforehand. Pitches must address a specific challenge.", "teal", false],
    // recently finished
    ["hm-p1", "Pitch Day: last term's finalists", "Thirty-four finalists, five minutes each. Several walked away with funding and a mentor.", DANA, "Dana Whitfield", at(-12, 13), 240, CAMPUS, "Pitch", 150,
      crowd("u-hm-amina", "u-hm-luca", "u-hm-jaden", "u-hm-fatima", "u-hm-priyanka", "u-hm-marcus", "u-hm-helen"), ["pitch-day", "recap"], ["Doors", "Pitches", "Winners"], "", "blue", true],
    ["hm-p2", "Cap tables for first-time founders", "How to split equity without losing a friend: vesting, advisers and the first hire.", "u-hm-priyanka", "Priyanka Desai", at(-8, 17), 90, ONLINE, "Workshop", 60,
      ["u-hm-priyanka", "u-hm-luca", "u-hm-amina", "u-hm-ethan", DANA], ["cap-table", "equity"], ["Equity basics", "Vesting", "Q&A"], "", "slate", true],
    ["hm-p3", "Founder breakfast", "Coffee, pastries and honest stories about the hard month. No slides.", DANA, "Dana Whitfield", at(-20, 8, 30), 75, CAMPUS, "Mixer", 40,
      crowd("u-hm-amina", "u-hm-mei", "u-hm-daniel", "u-hm-kenji", ME), ["breakfast", "community"], ["Breakfast", "Stories", "Intros"], "", "gold", true],
  ];
}

const RESOURCES = [
  ["hm-r1", "Free legal clinic hour for founders", "One free hour with a startup lawyer: incorporation, IP assignment, founder agreements or a term sheet read-through. Limited slots each month.", "perk", "Free access", "Helen Okafor", "u-hm-helen", "Free 1 hour", "Message Helen with a one-paragraph description of your question.", ["legal", "free", "incorporation"], true, "slate"],
  ["hm-r2", "Cloud credits for student ventures", "Wavefront Telecom's partner programs include cloud and software credits for startups in the network. Ask Roberto for the application link.", "perk", "Credits", "Roberto Alvarez", "u-hm-roberto", "Up to $5K credits", "Message Roberto with your product and the stack you use.", ["credits", "cloud", "software"], true, "teal"],
  ["hm-r3", "Co-working day passes", "Haulworks keeps a few desks free for founders in the network. Bring a laptop and a lunch.", "perk", "Free access", "Grant Mitchell", "u-hm-grant", "Free day pass", "Book at least 48 hours ahead through Grant.", ["workspace", "free", "desk"], false, "gold"],
  ["hm-r4", "Introductions to pilot customers", "Nadia, Grant and Samira will make warm intros to buyers at health, logistics and retail companies for founders with a working product.", "perk", "Intro", "Nadia Petrov", "u-hm-nadia", "Warm intros", "Share a three-line summary of your product and the buyer you want to meet.", ["intros", "customers", "pilots"], true, "coral"],
  ["hm-r5", "The ten-slide pitch deck template", "The structure judges expect: problem, solution, demo, traction, market, model, team, competition, ask and use of funds. Includes a speaker-notes version for the five-minute format.", "template", "Template", "Samira Haddad", "u-hm-samira", null, "Duplicate the template, then book a Pitch Practice Lab.", ["pitch", "template", "deck"], true, "blue"],
  ["hm-r6", "SAFEs and cap tables, explained", "A plain-English guide to SAFEs, convertible notes, caps and discounts, with a cap-table template that shows dilution round by round.", "guide", "Guide", "Priyanka Desai", "u-hm-priyanka", null, "Read the guide before your first investor meeting.", ["safe", "equity", "cap-table"], true, "slate"],
  ["hm-r7", "Early-stage funding calendar for the GTA", "A running list of grants, competitions, accelerators and angel groups, with deadlines and who each is for. Updated monthly by the programs team.", "guide", "Guide", "Dana Whitfield", DANA, null, "Open the calendar and add the two deadlines that fit your stage.", ["funding", "grants", "calendar"], false, "gold"],
  ["hm-r8", "Customer interview script & tracker", "Twenty questions that don't lead the witness, plus a spreadsheet to track what each conversation changed about your problem statement.", "template", "Template", "Samira Haddad", "u-hm-samira", null, "Copy the sheet, do ten interviews, then rewrite your problem slide.", ["customer-discovery", "research", "template"], false, "coral"],
];

const ANNOUNCEMENTS = [
  ["hm-a1", "Pitch Day applications are open", "Five minutes, five judges and a funded prize pool. Apply with your deck and a one-line ask. Applications close in two weeks, and you can still book a Pitch Practice Lab before you submit.", "high", 1, "Apply"],
  ["hm-a2", "Founders: your profile now carries your pitch", "Add your one-liner, the problem, the solution, traction, market and ask to your profile, and link your deck. Investors can read it in under a minute before they message you.", "high", 3, "Edit profile"],
  ["hm-a3", "New investors in the network", "Northgate Ventures and two independent angels joined this month. Office hours for pre-seed founders are now open for booking.", "normal", 6, "Book office hours"],
  ["hm-a4", "Innovation partner challenge: pilots that get paid", "A national telecom is looking for startups to pilot three real problems. Winning founders get a funded pilot and a corporate mentor.", "normal", 10, "See the briefs"],
  ["hm-a5", "Mentors: sign up for this term", "Industry leaders: pick the founders you can help and the hours you can give. We match by sector, stage and need.", "normal", 15, "Become a mentor"],
];

const HELP = [
  ["hm-h1", "u-hm-mei", "Intro to a contract manufacturer for moulded fibre", "Looking for a manufacturer who can run a 5,000-unit pilot of moulded trays. Any warm intro helps.", "Introductions", ["manufacturing", "packaging", "pilot"], "high", ["u-hm-tom", "u-hm-kenji"], 2],
  ["hm-h2", "u-hm-jaden", "Feedback on my pricing slide", "Clubs say they'd pay but not how much. I'd love five minutes from someone who has priced B2B software.", "Pitch feedback", ["pricing", "deck"], "normal", ["u-hm-samira", "u-hm-priyanka"], 3],
  ["hm-h3", "u-hm-amina", "Which clinic software do community clinics use?", "Trying to integrate refill data. Any contacts at community health centres who could tell me which systems they run?", "Introductions", ["healthcare", "integration"], "normal", ["u-hm-nadia"], 4],
  ["hm-h4", "u-hm-daniel", "A founding engineer who has shipped scheduling software", "Looking for equity-plus-salary conversations. React, Node and a taste for boring, reliable software.", "Hiring", ["engineering", "hiring"], "normal", [], 6],
  ["hm-h5", DANA, "Judges for next pitch day", "We need two more industry judges for the finals. Banking, retail or health backgrounds preferred.", "Introductions", ["judges", "pitch-day"], "high", ["u-hm-helen", "u-hm-nadia"], 1],
];

const APPS = [
  ["u-hm-app-1", "Oluwaseun Bakare", "seun.app-1@example.com", "Founder", "FreightFlow", "Final-year Logistics student building a freight-matching tool. Looking for pilot customers and a mentor in trucking.", ["Logistics", "Product"]],
  ["u-hm-app-2", "Isabelle Roy", "isabelle.app-2@example.com", "Angel investor", "Independent", "I invest in early-stage consumer and health companies and would like to meet student founders.", ["Angel investing", "Consumer"]],
];

export function buildHumber(fixtures, deps) {
  return buildDemo(fixtures, deps, {
    slug: HUMBER_SLUG, prefix: "hm", name: "Humber Innovation Network", tagline: "Where Humber founders meet capital, mentors and customers.", hubKind: "Innovation & entrepreneurship network",
    hubCover: cover("#E8EEF8", "#0B4EA2", "#F2B33D"), covers: COVERS, brand: BRAND, emailDomain: "humber-network.example", memberId: ME, adminId: DANA, instagram: false,
    people: PEOPLE, events: eventDefs, resources: RESOURCES, announcements: ANNOUNCEMENTS, authorName: "Dana Whitfield", help: HELP, apps: APPS,
    matches: {
      member: [["u-hm-priyanka", ["Sponsor intros", "Pre-seed cheques"], ["Community building"]], ["u-hm-helen", ["Sponsor intros", "Business banking"], ["Event operations"]], ["u-hm-samira", ["Pitch feedback", "Deck review"], ["Event operations"]], ["u-hm-roberto", ["Corporate pilots"], ["Brand partnerships"]]],
      admin: [["u-hm-marcus", ["Judges"], ["Pitch coaching"]], ["u-hm-helen", ["Judges", "Sponsorship"], ["Program design"]], ["u-hm-nadia", ["Industry mentors"], ["Mentor matching"]], ["u-hm-roberto", ["Pilots"], ["Introductions to investors"]]],
    },
    completion: { percent: 100, missing: [], missing_keys: [], sections: { "About you": { done: 5, total: 5 }, "Skills & interests": { done: 2, total: 2 }, "Goals & support": { done: 2, total: 2 } } },
    config: {
      community_kind: "Innovation & entrepreneurship network", community_type: "professional", interest_tags: ["Startups", "Innovation"],
      about: "A network that connects student and alumni founders from Humber Polytechnic with investors, industry leaders and innovation partners. Founders put their pitch on their profile and meet the people who can fund, advise or become their first customer. Pitch days, office hours, mixers and mentor matching run all term. This is a demo community: every person, venture and number is made up.",
      about_url: "", about_cta: "",
      member_label_singular: "Member", member_label_plural: "Members",
      member_types: { founder: "Founder", mentor: "Industry leader", alumni: "Innovation partner", partner: "Investor", guest: "Guest" },
      event_types: ["Pitch", "Office Hours", "Workshop", "Mixer", "Demo Night"],
      support_categories: ["Introductions", "Pitch feedback", "Hiring", "Customers & pilots", "Funding", "Legal & finance", "Other"],
      profile: { fields: [
        { key: "title", label: "Role", enabled: true }, { key: "skill_set", label: "What I can offer", enabled: true },
        { key: "interests_hobbies", label: "Interests", enabled: true }, { key: "goals", label: "Goals this term", enabled: true }, { key: "support_needs", label: "Looking for", enabled: true },
      ] },
      signup_fields: [
        { key: "title", label: "Your role", type: "text", required: false }, { key: "skill_set", label: "What can you offer?", type: "tags", required: false },
        { key: "support_needs", label: "What are you looking for?", type: "tags", required: false },
      ],
      apply_questions: [
        { key: "who", label: "Are you a founder, investor, industry leader or innovation partner?", placeholder: "Founder, angel investor, VP at..." },
        { key: "why", label: "What would you like from the network?", placeholder: "Feedback on my pitch, deal flow, pilot customers..." },
      ],
      page_text: {
        members_title: "The network", members_subtitle: "Founders with their pitch, investors, industry leaders and innovation partners: what they do, what they offer and what they're looking for.",
        events_title: "Pitch days & events", events_subtitle: "Pitch Day, office hours, practice labs, mixers and demo nights.",
        resources_title: "Perks & resources", resources_subtitle: "Legal hours, credits, pitch templates and funding guides from the network.",
        support_title: "Asks", support_subtitle: "Need an intro, feedback on a deck or a pilot customer? Ask here. Offer a hand when you can.",
        requests_title: "Your to-do", requests_subtitle: "Forms and updates the programs team has asked you for.",
        matches_title: "Intros for you", matches_subtitle: "Investors, mentors, customers and events picked for your stage and what you're looking for.",
        updates_title: "Network news", updates_subtitle: "Pitch Day dates, new investors and partner challenges.",
        ask_title: "Ask the network", ask_subtitle: "Find an investor, a mentor or a first customer.",
      },
      nav: [
        { key: "members", label: "Network", enabled: true }, { key: "matches", label: "Intros", enabled: true }, { key: "events", label: "Events", enabled: true },
        { key: "resources", label: "Resources", enabled: true }, { key: "updates", label: "News", enabled: true }, { key: "requests", label: "To-do", enabled: false },
        { key: "support", label: "Asks", enabled: true }, { key: "inbox", label: "Messages", enabled: true },
      ],
      custom_links: [],
    },
  });
}
