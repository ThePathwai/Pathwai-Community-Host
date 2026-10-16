// The "Club PTO" demo community: a padel club in Toronto, shown from both sides of one community.
//  - the club runs Skill Lab (four weeks of small-group coaching: six players, one coach, every level), and
//  - the community is also where potential sponsors meet the club, and where members trade skills with each other
//    (a designer swaps a logo for lessons, a physio runs a movement clinic, an accountant helps a coach).
// What comes from clubpto.com/skills-lab is only its public summary: Skill Lab is four weeks of small-group padel coaching in
// Toronto, six players, one coach, every level. Everything else (people, sponsors, businesses, numbers, prices, dates)
// is made up for the demo. Club PTO's own colours and logo are kept from the recorded community. Dates are relative to today.

import { at, buildDemo, cover } from "./demoKit";

export const CLUBPTO_SLUG = "club-pto";
const ME = "u-pt-me";          // the member-demo persona (a Skill Lab player)
const DIEGO = "u-pt-diego";    // the admin-demo persona (head coach and club owner)

const COLOR = { teal: "#023E3F", olive: "#ABAE23", cream: "#F0E5D4", clay: "#C8643B" };
const COVERS = {
  teal: cover("#E3EEEC", COLOR.teal, COLOR.olive), olive: cover("#F4F3DA", COLOR.olive, COLOR.teal), cream: cover(COLOR.cream, COLOR.clay, COLOR.teal),
  clay: cover("#F6E6DC", COLOR.clay, COLOR.olive), night: cover("#0F2B2B", COLOR.olive, COLOR.teal),
};

// [id, name, member_type, title, company, location, bio, offers, interests, goals, needs, openTo, extra]
// Types here: founder = Player, mentor = Coach, partner = Sponsor, alumni = Skill Lab alum, guest = Guest
const PEOPLE = [
  [DIEGO, "Diego Fontana", "mentor", "Head coach & club owner", "Club PTO", "Toronto",
    "I started Club PTO to make padel easy to start and hard to quit. I coach Skill Lab, run the ladder and look after our sponsors, so every partner gets players who actually show up.",
    ["Padel coaching", "Skill Lab programming", "Sponsor partnerships", "Tournament running"], ["Padel", "Coffee", "Football"],
    ["Fill every Skill Lab cohort", "Sign three season sponsors"], ["Sponsors", "Volunteer coaches", "Photographers"], ["Sponsors", "Partnerships"],
    { stage: "Level 4" }],
  [ME, "Fife Ashley-Dejo", "founder", "Event producer", "Toronto Player League", "Toronto",
    "Finishing my second Skill Lab cohort. I run wellness events in Toronto and love that padel gets strangers talking in about four minutes.",
    ["Event operations", "Community building", "Brand partnerships"], ["Padel", "Running", "Afrobeats"],
    ["Reach Level 3", "Find a regular doubles partner"], ["Doubles partner", "Backhand coaching", "A photographer for a tournament"], ["Skill swaps", "Doubles"],
    { stage: "Level 2" }],
  ["u-pt-priya", "Priya Raman", "mentor", "Skill Lab coach", "Club PTO", "Toronto",
    "I coach the beginner and Level 1 Skill Lab groups. Six players per court means everyone gets a ball every few seconds and a correction every few minutes.",
    ["Beginner coaching", "Grip & footwork", "Wall play basics"], ["Padel", "Yoga", "Travel"],
    ["Run two Skill Lab cohorts this season"], ["Video analysis help"], ["Mentoring"], { stage: "Level 4" }],
  ["u-pt-tomas", "Tomás Reyes", "mentor", "Skill Lab coach", "Club PTO", "Toronto",
    "I coach the Level 2 and 3 groups: bandeja, víbora and how to stop standing at the net like a statue.",
    ["Intermediate coaching", "Bandeja & smash", "Match tactics"], ["Padel", "Cooking", "Cycling"],
    ["Prepare players for their first tournament"], ["A physio partner"], ["Mentoring"], { stage: "Level 5" }],
  ["u-pt-aisha", "Aisha Bello", "founder", "Brand designer", "Studio Bello", "Leslieville",
    "Designer by day. Joined the Wednesday Skill Lab and now spend my lunch breaks watching bandeja videos.",
    ["Logo & brand design", "Social graphics", "Event posters"], ["Padel", "Design", "Brunch"],
    ["Move up to Level 2", "Trade design work for coaching hours"], ["Doubles partner", "Private lessons"], ["Skill swaps"], { stage: "Level 1" }],
  ["u-pt-marcus", "Marcus Lee", "alumni", "Accountant", "Lee & Co. Bookkeeping", "North York",
    "Skill Lab alum (Cohort 1). Level 2 and slightly too competitive. Happy to do bookkeeping for small businesses in exchange for court time.",
    ["Bookkeeping", "Small-business tax", "Budgeting"], ["Padel", "Hockey", "Podcasts"],
    ["Find a Level 2 doubles partner"], ["Doubles partner", "Tournament entries"], ["Skill swaps", "Doubles"], { stage: "Level 2" }],
  ["u-pt-chloe", "Chloe Tremblay", "founder", "Photographer", "Chloe T. Photo", "Queen West",
    "I shoot weddings and, lately, padel. Looking to trade event photography for private lessons.",
    ["Event photography", "Photo editing", "Short video"], ["Padel", "Film", "Hiking"],
    ["Build a padel portfolio", "Get to Level 1"], ["Private lessons", "A court buddy"], ["Skill swaps"], { stage: "Level 1" }],
  ["u-pt-kwame", "Kwame Mensah", "alumni", "Physiotherapist", "Harbour & Hip Physio", "Liberty Village",
    "Skill Lab alum (Cohort 2) and physio. I run a free warm-up and injury-prevention session before Saturday open play.",
    ["Injury prevention", "Warm-up programming", "Movement screens"], ["Padel", "Running", "Cooking"],
    ["Keep players on court", "Build the club's warm-up routine"], ["Referrals"], ["Skill swaps", "Sponsorship"], { stage: "Level 2" }],
  ["u-pt-sam", "Sam Patel", "founder", "Software developer", "Independent", "The Annex",
    "New to the sport, hooked after one session. I can build a simple site or booking tool for someone who can teach me a decent serve.",
    ["Websites", "Booking tools", "Automation"], ["Padel", "Gaming", "Cycling"],
    ["Finish Skill Lab Cohort 4", "Play a social match"], ["Beginner coaching", "A practice partner"], ["Skill swaps"], { stage: "Beginner" }],
  ["u-pt-nina", "Nina Kovacs", "founder", "Copywriter", "Kovacs Words", "Roncesvalles",
    "I write the words on websites. Trading copy for time on court.",
    ["Copywriting", "Newsletters", "Brand voice"], ["Padel", "Reading", "Gardening"],
    ["Hit the ball over the net reliably"], ["Beginner coaching"], ["Skill swaps"], { stage: "Beginner" }],
  ["u-pt-elena", "Elena Marchetti", "partner", "Clinic director", "Harbour & Hip Physio", "Liberty Village",
    "We sponsor Club PTO because racquet-sport players are our favourite patients. We offer a free movement screen for every Skill Lab player.",
    ["Free movement screens", "Injury-prevention clinics", "Discounted physio"], ["Padel", "Wellness", "Community"],
    ["Meet 100 new local players this season"], ["Players who need physio", "Event slots"], ["Sponsorship"], { stage: "Gold sponsor" }],
  ["u-pt-dev", "Dev Anand", "partner", "Owner", "Northline Coffee Roasters", "Little Italy",
    "Our cafe is a two-minute walk from the courts. We give Skill Lab players a free coffee after every session and want to be where the community hangs out.",
    ["Free coffee after sessions", "Catering for events", "Tasting nights"], ["Coffee", "Padel", "Running"],
    ["Be the post-game coffee spot"], ["Event partnerships"], ["Sponsorship"], { stage: "Silver sponsor" }],
  ["u-pt-lena", "Lena Fischer", "partner", "Retail manager", "Baseline Padel Supply", "Toronto",
    "We sell racquets, balls and grips, and we want first-time players to try before they buy. We run demo days and give members a discount.",
    ["Racquet demo days", "Member discount", "Gear advice"], ["Padel", "Tennis", "Design"],
    ["Get racquets into new players' hands"], ["Beginner clinics", "Tournaments to sponsor"], ["Sponsorship"], { stage: "Gold sponsor" }],
  ["u-pt-jordan", "Jordan Wu", "guest", "Product manager", "Independent", "Liberty Village",
    "Came to open play with a friend. Thinking about joining Skill Lab.",
    ["Product strategy"], ["Padel", "Tennis"], ["Try Skill Lab"], ["Beginner coaching"], ["Skill swaps"], { stage: "Beginner" }],
];

function eventDefs({ at: A, until }) {
  const mon = until(1), tue = until(2), wed = until(3), fri = until(5), sat = until(6), sun = until(0);
  const COURTS = "Club PTO courts · Toronto (address sent when you RSVP)";
  const crew = ["u-pt-aisha", "u-pt-sam", "u-pt-nina", "u-pt-chloe", "u-pt-jordan"];
  return [
    ["pt-e1", "Skill Lab · Cohort 3 · Week 3: Walls & positioning", "Week three of four. Six players, one coach: how to use the back and side walls, where to stand between points and how to take the ball off the glass without panicking. Every level welcome in the cohort; Priya adjusts the drills to each player.",
      "u-pt-priya", "Priya Raman", A(wed, 19), 90, COURTS, "Skill Lab", 6, ["u-pt-priya", ME, "u-pt-aisha", "u-pt-sam", "u-pt-nina", "u-pt-chloe"], ["skill-lab", "coaching", "walls"],
      ["Warm-up and footwork ladder (15 min)", "Wall-play drills in pairs (30 min)", "Positioning games, two vs two (30 min)", "Cool-down and homework"], "Bring court shoes and a water bottle. Racquets are provided.", "teal", false],
    ["pt-e2", "Skill Lab · Cohort 4 · Starts Monday (Level 1)", "Four weeks of small-group padel coaching. Six players, one coach. This cohort is for people who have played a handful of times and want the basics to stick: grip, serve, volley and the rules. A few spots left.",
      "u-pt-priya", "Priya Raman", A(mon + 7, 19), 90, COURTS, "Skill Lab", 6, ["u-pt-priya", "u-pt-jordan", "u-pt-marcus", "u-pt-chloe"], ["skill-lab", "level-1", "beginner"],
      ["Week 1: grip, stance and the serve", "Week 2: volleys and the net", "Week 3: walls and positioning", "Week 4: match play"], "No experience needed. We'll lend you a racquet and a good attitude is enough.", "olive", false],
    ["pt-e3", "Skill Lab · Cohort 4 · Starts Wednesday (Level 2–3)", "For players who know the rules and want to win points: bandeja, víbora and tactics. Six players, one coach, with Tomás.",
      "u-pt-tomas", "Tomás Reyes", A(wed + 7, 19), 90, COURTS, "Skill Lab", 6, ["u-pt-tomas", "u-pt-marcus", "u-pt-kwame"], ["skill-lab", "level-2", "tactics"],
      ["Week 1: bandeja", "Week 2: víbora and smash", "Week 3: tactics at the net", "Week 4: match play with coach feedback"], "Come warmed up. We start hitting in the first five minutes.", "clay", false],
    ["pt-e4", "Open play + sponsor meet-up night", "Friday open play with the people behind the club: our sponsors will be courtside, running a gear demo, a free movement screen and a coffee bar. A relaxed way for members to meet them, and for prospective sponsors to see what the community is like.",
      DIEGO, "Diego Fontana", A(fri, 18, 30), 150, COURTS, "Sponsor Night", 40, [DIEGO, ME, "u-pt-elena", "u-pt-dev", "u-pt-lena", "u-pt-marcus", "u-pt-kwame", ...crew.slice(0, 3)], ["open-play", "sponsors", "networking"],
      ["Doors, coffee and gear demo", "Rotating open play", "Sponsor lightning intros (2 min each)", "Prize draw"], "Wear what you play in. Bring a friend who might want to sponsor or join.", "night", false],
    ["pt-e5", "Sponsor showcase: partner with Club PTO", "For businesses thinking about sponsoring: who our members are, what packages look like and how sponsors already use the community (perks, event slots, member offers, a spot on the calendar). Short talk, a tour of the courts and plenty of questions.",
      DIEGO, "Diego Fontana", A(tue + 7, 8, 30), 60, "Club PTO courts · Toronto, with coffee from Northline", "Sponsor Night", 20, [DIEGO, "u-pt-elena", "u-pt-lena"], ["sponsors", "partnerships", "showcase"],
      ["Welcome and coffee", "Who the members are", "Sponsor packages and how they work", "Court tour and questions"], "No preparation needed. Bring a business card or just yourself.", "teal", false],
    ["pt-e6", "Skill Swap Social", "Members trade what they're good at. Bring one thing you can offer and one thing you need; we'll match you at the board and you can start a swap over a few games. Designers get lessons, physios get photos, coaches get their books done.",
      DIEGO, "Diego Fontana", A(sun, 11), 120, COURTS, "Social", 30, [DIEGO, ME, "u-pt-aisha", "u-pt-marcus", "u-pt-chloe", "u-pt-kwame", "u-pt-sam", "u-pt-nina"], ["skill-swap", "community", "social"],
      ["Name tags: offer + need", "Match at the board", "Open play with your match", "Post your swap on the board"], "Think of one concrete thing you can do in an hour.", "cream", false],
    ["pt-e7", "Saturday Round Robin (all levels)", "Everyone plays everyone, partners rotate every round. Prizes from Baseline Padel Supply.",
      DIEGO, "Diego Fontana", A(sat, 10), 180, COURTS, "Open Play", 32, [DIEGO, ME, "u-pt-marcus", "u-pt-kwame", "u-pt-lena", ...crew], ["round-robin", "open-play", "all-levels"],
      ["Warm-up led by Kwame", "Round robin, 12 minutes a round", "Final and prizes"], "Come with whatever level you have; partners rotate.", "olive", false],
    ["pt-e8", "Cohort 2 graduation match night", "A look back: the Cohort 2 players played a showcase match night with their coaches.",
      "u-pt-tomas", "Tomás Reyes", A(-12, 19), 120, COURTS, "Skill Lab", 24, [DIEGO, "u-pt-tomas", "u-pt-marcus", "u-pt-kwame", "u-pt-aisha"], ["skill-lab", "graduation"],
      ["Match night", "Awards"], "", "clay", true],
  ];
}

// [id, title, description, type, category, author, authorId, value, claim, tags, featured, coverKey]
const RESOURCES = [
  ["pt-r1", "Partner with Club PTO: what sponsors get", "A plain-English look at sponsoring the club: who the members are (sample figures: about 180 active players, 60% aged 25 to 40, most live within 5 km of the courts), the three packages, and how sponsors use the community. Prices and numbers on this page are made up for the demo.", "guide", "Sponsors", "Diego Fontana", DIEGO, null, "Read the packages, then message Diego to book a showcase tour.", ["sponsors", "packages", "partnership"], true, "teal"],
  ["pt-r2", "Free movement screen for Skill Lab players", "Harbour & Hip Physio gives every Skill Lab player a free 20-minute movement screen with a physio, so you play longer and hurt less.", "perk", "Sponsor perks", "Elena Marchetti", "u-pt-elena", "Free 20-min screen", "Message Elena with your Skill Lab cohort and a time that suits you.", ["physio", "sponsor", "free"], true, "olive"],
  ["pt-r3", "Free coffee after every Skill Lab session", "Northline Coffee Roasters pours a free drip coffee or tea for every Skill Lab player after class. Show your Club PTO profile at the counter.", "perk", "Sponsor perks", "Dev Anand", "u-pt-dev", "Free coffee", "Show this perk at the Northline counter after your session.", ["coffee", "sponsor", "free"], true, "clay"],
  ["pt-r4", "15% off grips, balls and racquet demos", "Baseline Padel Supply gives Club PTO members 15% off accessories and free racquet demos on Saturday round robin days.", "perk", "Sponsor perks", "Lena Fischer", "u-pt-lena", "15% off", "Use code CLUBPTO at checkout or mention it in the shop.", ["gear", "sponsor", "discount"], false, "teal"],
  ["pt-r5", "Skill swap: a bookkeeping hour for a lesson hour", "Marcus will do an hour of small-business bookkeeping or tax planning for any member or coach who gives him an hour of coaching or court time.", "perk", "Member offers", "Marcus Lee", "u-pt-marcus", "1 hour ↔ 1 hour", "Post a swap request on the board or message Marcus.", ["skill-swap", "finance", "member-offer"], false, "cream"],
  ["pt-r6", "Skill swap: logo or poster for private lessons", "Aisha designs logos, event posters and social graphics for members and sponsors in exchange for coaching hours.", "perk", "Member offers", "Aisha Bello", "u-pt-aisha", "Design ↔ lessons", "Message Aisha with what you need and what you'd offer.", ["skill-swap", "design", "member-offer"], true, "olive"],
  ["pt-r7", "Skill swap: tournament photos for lessons", "Chloe shoots portraits and action photos at tournaments and events in return for court time or lessons.", "perk", "Member offers", "Chloe Tremblay", "u-pt-chloe", "Photos ↔ lessons", "Message Chloe with the event date and what you can offer.", ["skill-swap", "photography", "member-offer"], false, "clay"],
  ["pt-r8", "Padel in five minutes: scoring, rules and the walls", "How padel scoring works, when the ball can hit the walls, how to serve underhand and why doubles is the default. Written by Priya for new Skill Lab players.", "guide", "Guide", "Priya Raman", "u-pt-priya", null, "Read before your first session.", ["rules", "beginner", "guide"], true, "cream"],
  ["pt-r9", "Skill swap offer template", "A one-paragraph template for proposing a swap: what you offer, what you need, how many hours, and how you'll know it's done. Use it on the board.", "template", "Template", "Diego Fontana", DIEGO, null, "Copy it, fill in the blanks and post it on the board.", ["skill-swap", "template"], false, "teal"],
];

const ANNOUNCEMENTS = [
  ["pt-a1", "Skill Lab Cohort 4 is open", "Four weeks of small-group padel coaching: six players, one coach, every level. Level 1 starts Monday with Priya; Level 2–3 starts Wednesday with Tomás. A few spots left in each.", "high", 1, "See sessions"],
  ["pt-a2", "Sponsors: three packages for the season", "We've opened a limited number of season sponsor slots: Court sponsor, Skill Lab sponsor and Community sponsor. The guide below shows what each includes. Book a showcase tour to see the club.", "high", 2, "Read the guide"],
  ["pt-a3", "The skill swap board is live", "Members can now offer and request skills on the board: design for lessons, photos for court time, bookkeeping for coaching. Post yours and see who has matched.", "normal", 4, "Open the board"],
  ["pt-a4", "New perks from our sponsors", "Free movement screens from Harbour & Hip, free coffee after Skill Lab from Northline and 15% off gear from Baseline. Find them under Perks & offers.", "normal", 6, "See perks"],
  ["pt-a5", "Coaches: volunteer for the season finale", "We need two more volunteer coaches for the season finale round robin. Hours count toward your Skill Lab credit.", "normal", 10, "Volunteer"],
];

const HELP = [
  ["pt-h1", "u-pt-aisha", "Offering: a logo or poster, trade for two private lessons", "I'll design a logo, a poster or a set of social graphics for any member or business. Looking for two private lessons with a Level 2+ coach in return.", "Skill swap", ["design", "lessons", "swap"], "normal", ["u-pt-tomas"], 1],
  ["pt-h2", "u-pt-marcus", "Looking for a Level 2 doubles partner for the winter league", "I play Tuesdays and Thursdays after 6pm. Happy to trade a bookkeeping hour if you can commit to the whole league.", "Doubles partner", ["doubles", "league", "level-2"], "normal", [ME], 2],
  ["pt-h3", "u-pt-sam", "Who can take photos of my company's team padel day?", "Thirty people, two courts, a Friday afternoon. I can build you a simple website or booking tool in exchange.", "Skill swap", ["photography", "swap", "web"], "normal", ["u-pt-chloe"], 3],
  ["pt-h4", "u-pt-elena", "Sponsor: we'd like to run a pop-up injury-prevention clinic", "We can run a one-hour clinic for members before a round robin. Looking for a date that works and a few players to demo on.", "Sponsor intro", ["sponsor", "clinic", "physio"], "normal", [DIEGO], 4],
  ["pt-h5", DIEGO, "Looking for a sponsor for the season finale prize table", "We'd love a local business to put its name on the finale prizes and meet 60 players. Packages start small; message me.", "Sponsor intro", ["sponsor", "finale", "prizes"], "high", ["u-pt-dev", "u-pt-lena"], 1],
];

// Join requests the admin sees: two businesses interested in sponsoring and a new player.
const APPS = [
  ["u-pt-app-1", "Rina Okoye", "rina.app-1@example.com", "Marketing lead", "Lakeview Smoothies", "We're a local smoothie bar interested in sponsoring Skill Lab and offering members a perk. Would love to visit the courts and talk packages.", ["Sponsorship", "Marketing"]],
  ["u-pt-app-2", "Owen Barlow", "owen.app-2@example.com", "Owner", "Barlow Sports Massage", "I'd like to offer members discounted sports massage and could run a recovery station at tournaments. Interested in the community sponsor package.", ["Sponsorship", "Recovery"]],
  ["u-pt-app-3", "Hana Sato", "hana.app-3@example.com", "Teacher", "Independent", "Played once with a friend and loved it. Hoping to join a Skill Lab cohort and meet people to play with.", ["Beginner padel"]],
];

export function buildClubPto(fixtures, deps) {
  // Keep Club PTO's own look and logo from the recorded community; swap in new copy.
  const old = fixtures.communities[CLUBPTO_SLUG]?.public?.["/community/config"] || {};
  const BRAND = {
    ...JSON.parse(JSON.stringify(old.brand || {})),
    login_headline: "Padel for every level, and the people behind it.",
    login_subhead: "Join a Skill Lab cohort, trade skills with other members or meet the sponsors who back the club.",
    welcome_message: "Skill Lab Cohort 4 is open, and the sponsors are courtside on Friday. Here's what's on this week.",
    footer_text: "Club PTO · Toronto · demo community",
  };
  const hubOld = (fixtures.hub || []).find((h) => h.slug === CLUBPTO_SLUG) || {};
  return buildDemo(fixtures, deps, {
    slug: CLUBPTO_SLUG, prefix: "pt", name: "Club PTO", tagline: "Small-group padel in Toronto. Six players, one coach, every level.", hubKind: "Padel club",
    hubCover: hubOld.cover || old.hub_cover || COVERS.teal, covers: COVERS, brand: BRAND, emailDomain: "clubpto.example", memberId: ME, adminId: DIEGO, instagram: true,
    people: PEOPLE, events: eventDefs, resources: RESOURCES, announcements: ANNOUNCEMENTS, authorName: "Diego Fontana", help: HELP, apps: APPS,
    matches: {
      member: [["u-pt-aisha", ["Logo & brand design", "Event posters"], ["Event operations", "Brand partnerships"]], ["u-pt-tomas", ["Backhand coaching", "Bandeja & smash"], ["Community building"]], ["u-pt-elena", ["Free movement screens"], ["Event operations"]], ["u-pt-chloe", ["Event photography"], ["Event operations"]]],
      admin: [["u-pt-elena", ["Sponsorship", "Injury-prevention clinics"], ["Sponsor partnerships"]], ["u-pt-lena", ["Racquet demo days", "Member discount"], ["Tournament running"]], ["u-pt-dev", ["Free coffee after sessions"], ["Sponsor partnerships"]], ["u-pt-chloe", ["Event photography"], ["Padel coaching"]]],
    },
    completion: { percent: 100, missing: [], missing_keys: [], sections: { "About you": { done: 5, total: 5 }, "Skills & interests": { done: 2, total: 2 }, "Goals & support": { done: 2, total: 2 } } },
    config: {
      community_kind: "Padel club", community_type: "sports", interest_tags: ["Padel", "Sports", "Sponsorship"],
      about: "Club PTO is a padel club in Toronto. Skill Lab is our four-week small-group coaching program: six players, one coach, every level. This community is where players meet each other, where members trade skills (a designer for lessons, a physio for photos, an accountant for court time) and where local businesses meet the club and decide whether to sponsor it. This is a demo community: the people, businesses, perks and numbers are made up.",
      about_url: "https://clubpto.com/skills-lab", about_cta: "See Skill Lab",
      member_label_singular: "Member", member_label_plural: "Members",
      member_types: { founder: "Player", mentor: "Coach", alumni: "Skill Lab alum", partner: "Sponsor", guest: "Guest" },
      event_types: ["Skill Lab", "Open Play", "Sponsor Night", "Social", "Tournament"],
      support_categories: ["Skill swap", "Doubles partner", "Sponsor intro", "Gear", "Coaching", "Other"],
      profile: { fields: [
        { key: "title", label: "Role", enabled: true }, { key: "stage", label: "Padel level", enabled: true }, { key: "skill_set", label: "What I can trade", enabled: true },
        { key: "interests_hobbies", label: "Interests", enabled: true }, { key: "goals", label: "Goals", enabled: true }, { key: "support_needs", label: "Looking for", enabled: true },
      ] },
      signup_fields: [
        { key: "title", label: "What do you do?", type: "text", required: false }, { key: "skill_set", label: "What could you trade or offer?", type: "tags", required: false },
        { key: "support_needs", label: "What are you looking for?", type: "tags", required: false },
      ],
      apply_questions: [
        { key: "who", label: "Are you a player, or a business interested in sponsoring?", placeholder: "Player, local cafe, physio clinic..." },
        { key: "why", label: "What would you like from Club PTO?", placeholder: "A Skill Lab cohort, people to play with, sponsor exposure..." },
      ],
      page_text: {
        members_title: "Members & sponsors", members_subtitle: "Players, coaches, Skill Lab alumni and the sponsors who back the club: what they do and what they'd trade.",
        events_title: "Schedule", events_subtitle: "Skill Lab sessions, open play, round robins and sponsor nights.",
        resources_title: "Perks & offers", resources_subtitle: "Sponsor perks and the skills members offer each other.",
        support_title: "Skill swap & sponsor board", support_subtitle: "Offer a skill, ask for one, find a doubles partner or introduce a sponsor.",
        matches_title: "People to meet", matches_subtitle: "Members, coaches and sponsors picked for what you can trade and what you're looking for.",
        updates_title: "Club news", updates_subtitle: "Skill Lab cohorts, sponsor news and new perks.",
        ask_title: "Ask the club", ask_subtitle: "Find a partner, a coach, a swap or a sponsor.",
      },
      nav: [
        { key: "members", label: "People", enabled: true }, { key: "matches", label: "Meet", enabled: true }, { key: "events", label: "Schedule", enabled: true },
        { key: "resources", label: "Perks & offers", enabled: true }, { key: "updates", label: "Club news", enabled: true }, { key: "requests", label: "To-do", enabled: false },
        { key: "support", label: "Swap board", enabled: true }, { key: "inbox", label: "Messages", enabled: true },
      ],
      custom_links: [{ label: "Skill Lab on clubpto.com", url: "https://clubpto.com/skills-lab" }],
    },
  });
}
