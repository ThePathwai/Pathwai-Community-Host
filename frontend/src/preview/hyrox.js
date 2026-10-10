// The "Toronto Hyrox Crew" demo community: an independent training-and-racing community for people who do
// HYROX (the fitness race of eight 1 km runs, each followed by a functional station: SkiErg, sled push, sled pull,
// burpee broad jumps, row, farmers carry, sandbag lunges, wall balls). It is not affiliated with HYROX. The race
// format and divisions (Open, Pro, Doubles, Relay) are the real ones; Toronto is a real host city on the Canadian
// calendar. Everyone in the roster, every gym, brand, perk and time is made up. Dates are relative to today.

import { buildDemo, cover } from "./demoKit";

export const HYROX_SLUG = "toronto-hyrox-crew";
const ME = "u-hx-me";          // the member-demo persona
const MARCUS = "u-hx-marcus";  // the admin-demo persona (head coach and community host)

const COLORS = { accent: "#FFD60A", on_accent: "#0B0B0C", background: "#0B0B0C", surface: "#151517", text: "#F5F5F2", muted: "#9B9B94", border: "#2A2A2D" };
const BRAND = {
  preset: "custom", mode: "dark", colors: COLORS, font: "Space Grotesk", heading_font: "Anton", heading_style: "uppercase",
  radius: "sharp", button_shape: "square", logo_url: null, logo_mark_url: null, logo_adapts: true, show_name_with_logo: true,
  login_headline: "Eight stations. One crew.", login_subhead: "Find your doubles partner, your Saturday sled crew and your race-day plan.",
  welcome_message: "Race season is on. Here's what we're training this week and who's racing with you.", footer_text: "Toronto Hyrox Crew · an independent community, not affiliated with HYROX", support_email: "",
};
const COVERS = {
  volt: cover("#16160F", "#FFD60A", "#3A3A3C"), ember: cover("#1A1210", "#FF5A1F", "#FFD60A"), steel: cover("#111418", "#5D6B7A", "#FFD60A"),
  ash: cover("#141414", "#7A7A74", "#FF5A1F"), mint: cover("#0F1714", "#2FBF8F", "#FFD60A"),
};

// [id, name, member_type, title, company, location, bio, offers, interests, goals, needs, open_to, extra]
// Types: founder = Athlete, mentor = Coach, alumni = Judge & volunteer, partner = Partner (gym, recovery, brand)
const PEOPLE = [
  [MARCUS, "Marcus Ellery", "mentor", "Head coach & community host", "Ironwork Athletics", "Liberty Village",
    "Strength coach turned hybrid-racing coach. I started the Saturday sled sessions with six people and a borrowed sled, and I still write every Station Saturday plan myself. If you can run 5 km and want to stop dying on the wall balls, you belong here.",
    ["Race-plan design", "Sled push & pull technique", "Run-and-lift pacing", "Group coaching"], ["Hybrid training", "Powerlifting", "Trail running", "Cold plunges"],
    ["Get 100 members to a Toronto race weekend", "Launch a Pro-division group"], ["Volunteer judges", "Gym partners", "Recovery partners"], ["Collabs", "Sponsorship"],
    { stage: "Coach", industry: "Hyrox" }],
  [ME, "Fife Ashley-Dejo", "founder", "Doubles Open · training for a first race", "Toronto Player League", "Toronto",
    "Runs a wellness events community in Toronto and has finally signed up for a Hyrox. Racing Doubles Open with a partner I have yet to find. Sled work is my weak spot, wall balls are my enemy.",
    ["Event hosting", "Community building", "Brand partnerships"], ["Padel", "Running", "Afrobeats"],
    ["Finish a first race under 1:25", "Find a doubles partner", "Fix my sled push"], ["Doubles partner", "Sled technique", "Pacing"], ["Partners", "Introductions"],
    { stage: "Doubles Open", industry: "Hyrox" }],
  ["u-hx-priya", "Priya Nair", "founder", "Singles Pro · 1:04 PB", "Pro group", "Leslieville",
    "Pro women's athlete. I came from middle-distance running and learned the stations the hard way. Happy to share how I pace the first four runs so the last four still happen.",
    ["Pacing strategy", "Run-gym transitions", "SkiErg technique"], ["Trail running", "Strength", "Matcha"],
    ["Break 1:03 this season", "Qualify for the next championship"], ["Sled technique", "Recovery partners"], ["Training partners", "Pacers"],
    { stage: "Singles Pro", industry: "Hyrox" }],
  ["u-hx-tobi", "Tobi Adeleke", "founder", "Singles Open · 1:08 PB", "Open group", "Parkdale",
    "Former rugby flanker. Strong on sleds and carries, humbled by the 1 km runs. Chasing my first sub-1:05 and happy to push a training partner on Station Saturdays.",
    ["Sled push power", "Carry grip tips", "Training partner"], ["Rugby", "Afrobeats", "Cooking"],
    ["Sub-1:05 Open", "Win my age group"], ["Run coaching", "Pacers"], ["Training partners", "Race buddies"],
    { stage: "Singles Open", industry: "Hyrox" }],
  ["u-hx-hannah", "Hannah Sloane", "founder", "Doubles Mixed · looking for a partner", "Open group", "The Annex",
    "Marathon runner and two-time Hyrox finisher. Racing Doubles Mixed in the spring and looking for a partner who is stronger than me at sleds and happy to take the lunges.",
    ["Running pace (4:45/km)", "Race logistics", "Doubles planning"], ["Marathons", "Brunch", "Podcasts"],
    ["Race Doubles Mixed in Toronto", "Run a 3:10 marathon"], ["Doubles partner", "Sled technique"], ["Doubles partner"],
    { stage: "Doubles Mixed", industry: "Hyrox" }],
  ["u-hx-kwame", "Kwame Boateng", "founder", "First-timer · Open Singles", "Open group", "Scarborough",
    "Ex-sprinter, desk job now. First race this season and I have no idea how to pace eight kilometres of running with stations in between. Will bring snacks to any session you invite me to.",
    ["Sprint mechanics", "Good energy", "Snacks"], ["Football", "Gaming", "Highlife"],
    ["Finish my first race", "Don't walk the wall balls"], ["Pacing", "Beginner-friendly sessions", "Training buddies"], ["Training partners", "Coaching"],
    { stage: "First race", industry: "Hyrox" }],
  ["u-hx-lindsey", "Lindsey Park", "founder", "Relay captain · team of four", "Bay Street Relay", "Financial District",
    "Captain of a relay team from our office. Four people, two legs each, one group chat that never stops. We race to have fun and eat a lot after.",
    ["Relay strategy", "Team logistics", "Group energy"], ["Hiking", "Board games", "Ramen"],
    ["Get our whole floor to race", "Recruit a fourth for the spring relay"], ["A fourth relay teammate", "Pacing"], ["Teammates", "Race buddies"],
    { stage: "Relay", industry: "Hyrox" }],
  ["u-hx-mika", "Mika Tanaka", "founder", "Singles Open · 50-54 age group", "Masters group", "North York",
    "Started hybrid racing at 49 and have not looked back. Age groups are real: I race the clock, and my age group, and I am very proud of both.",
    ["Masters training", "Consistency", "Mobility routines"], ["Hiking", "Tea", "Photography"],
    ["Top three in my age group", "Race with my daughter next year"], ["Recovery partners", "Strength programming"], ["Training partners"],
    { stage: "Singles Open · 50-54", industry: "Hyrox" }],
  ["u-hx-andre", "Andre Lewis", "founder", "Singles Pro · 58:40 PB", "Pro group", "Bloordale",
    "Pro men's athlete and sled specialist. Lives on the track on Tuesdays, in the gym on everything else. Training partners who can hold 3:40/km after a sled pull are always welcome.",
    ["Sled power", "Run-with-fatigue workouts", "Race-week taper"], ["Track", "Cooking", "Jazz"],
    ["Break 58 minutes", "Podium a Pro race"], ["Recovery partners", "Physio"], ["Training partners", "Pacers"],
    { stage: "Singles Pro", industry: "Hyrox" }],
  ["u-hx-sam", "Sam Okoro", "founder", "Returning from injury · Doubles Open", "Open group", "Etobicoke",
    "Back from a calf strain with a smarter plan. Learned the hard way that run volume ramps slowly and the SkiErg is not a warm-up. Looking for a patient doubles partner.",
    ["Rehab-friendly training", "Consistency", "Encouragement"], ["Football", "Cycling", "Afrobeats"],
    ["Race Doubles Open", "Run a pain-free 1 km pace"], ["Doubles partner", "Physio advice"], ["Doubles partner", "Training partners"],
    { stage: "Doubles Open", industry: "Hyrox" }],
  ["u-hx-sofia", "Sofia Marchetti", "mentor", "Run coach (5k to half)", "Marchetti Running", "Little Italy",
    "Run coach for hybrid athletes. The eight kilometres of running are where most races are won and lost, and most people never train them on purpose. Tuesday run club is mine.",
    ["Run economy", "1 km repeat sessions", "Run-with-fatigue pacing"], ["Marathons", "Espresso", "Football"],
    ["Run club of 60 every Tuesday", "Coach a Pro athlete"], ["Gym partners", "Photo & content"], ["Collabs", "Referrals"],
    { stage: "Coach", industry: "Running" }],
  ["u-hx-naomi", "Dr. Naomi Chen", "mentor", "Sports physiotherapist", "Chen Sport Physio", "Dundas West",
    "Physio who works mostly with hybrid racers: knees on lunges, shoulders on sled work, hamstrings after run-lift blocks. I'd rather fix it in week three than week eleven.",
    ["Injury screening", "Return-to-run plans", "Mobility for stations"], ["Running", "Climbing", "Dumplings"],
    ["Run a pre-race screening day", "Refer more athletes early"], ["Gym partners", "Photo & content"], ["Referrals", "Workshops"],
    { stage: "Physio", industry: "Healthcare" }],
  ["u-hx-ravi", "Ravi Singh", "mentor", "Sports nutritionist", "Fuel Station Nutrition", "Midtown",
    "Registered dietitian. Race-day fuelling is its own training block: how much carb per hour, what the gut can handle on run five, and what to eat on the Friday before.",
    ["Race-day fuelling", "Carb & hydration plans", "Gut training"], ["Cycling", "Cooking", "Cricket"],
    ["Fuel 200 members for their first race"], ["Athlete case studies", "Gym partners"], ["Workshops", "Referrals"],
    { stage: "Nutrition", industry: "Nutrition" }],
  ["u-hx-jules", "Jules Tremblay", "alumni", "Volunteer judge", "Race-day volunteer", "Plateaux",
    "I judge at local events and I love explaining what a no-rep actually looks like. Burpee broad jumps and wall balls are where most repeats come from, and nobody should be surprised by them on race day.",
    ["Movement standards", "No-rep prevention", "Race-day etiquette"], ["Referee courses", "Cycling", "Cheese"],
    ["Train 20 new judges this season"], ["More volunteers", "Venue partners"], ["Workshops", "Volunteering"],
    { stage: "Judge", industry: "Hyrox" }],
  ["u-hx-owen", "Owen MacLeod", "alumni", "Volunteer judge & athlete", "Race-day volunteer", "The Beaches",
    "Ex-referee who found Hyrox after a knee injury. I judge on the days I'm not racing and I'm happy to do a mock-judge on your sandbag lunges.",
    ["Mock judging", "Standards walk-throughs", "Race-day nerves"], ["Football", "Dad jokes", "Hockey"],
    ["Judge at two races this season"], ["Athletes for mock-judging"], ["Volunteering", "Workshops"],
    { stage: "Judge", industry: "Hyrox" }],
  ["u-hx-zara", "Zara Ahmed", "partner", "Gym owner", "Ironwork Athletics", "Liberty Village",
    "Our gym is a Saturday home for the crew: sleds, SkiErgs, rowers and enough turf to push 50 m twice. Members of the crew get a free day pass whenever they bring a friend.",
    ["Free day passes", "Sled & turf space", "Race-sim hosting"], ["Gym design", "Coffee", "Padel"],
    ["Host a monthly full race sim", "Add a Pro-division training block"], ["Event partners", "Coaches"], ["Partnerships", "Events"],
    { stage: "Gym partner", industry: "Fitness", contact: { website: "https://example.com/ironwork" } }],
  ["u-hx-bruno", "Bruno Costa", "partner", "Studio owner", "Cold Room Recovery", "Junction",
    "Contrast therapy and recovery studio. Cold plunge, sauna and a physio room, ten minutes from the gym. Crew members get 20% off any recovery session.",
    ["Recovery sessions", "Contrast therapy", "Pop-up recovery at events"], ["Swimming", "Cycling", "Tea"],
    ["Run a recovery area at race week"], ["Event partners", "Content"], ["Pop-ups", "Partnerships"],
    { stage: "Recovery partner", industry: "Wellness", contact: { website: "https://example.com/coldroom" } }],
  ["u-hx-esi", "Esi Mensah", "partner", "Founder", "Fuel Station", "Queen West",
    "Founder of an endurance fuel brand. Gels, chews and electrolyte mixes designed for people who have to run again after a sled pull. Crew members get 15% off online.",
    ["Fuel discounts", "Race-day samples", "Sponsored hydration"], ["Cooking", "Running", "Afrobeats"],
    ["Sample at every Station Saturday", "Co-brand a race-week pack"], ["Athlete ambassadors", "Event partners"], ["Sponsorship", "Partnerships"],
    { stage: "Brand partner", industry: "Nutrition", contact: { website: "https://example.com/fuelstation" } }],
];

function eventDefs({ at, until }) {
  const sat = until(6), tue = until(2), wed = until(3), thu = until(4), sun = until(0);
  const crowd = (...ids) => [MARCUS, ...ids];
  const GYM = "Ironwork Athletics · Liberty Village, Toronto";
  const PARK = "Trinity Bellwoods Park · meet at the main gates";
  const COLD = "Cold Room Recovery · Junction, Toronto";
  return [
    ["hx-e1", "Station Saturday: sled push & pull", "Technique first, then volume. We work through low drive angles for the push, hand-over-hand pulls and how to stop the sled from owning your legs before run three. Coaches on the floor, Open and Pro weights available.",
      MARCUS, "Marcus Ellery", at(sat, 9), 90, GYM, "Station Clinic", 24,
      crowd(ME, "u-hx-tobi", "u-hx-andre", "u-hx-priya", "u-hx-kwame", "u-hx-sam", "u-hx-mika"), ["sleds", "technique", "saturday"],
      ["Warm-up and mobility (15 min)", "Push technique and drive angles", "Pull technique and grip", "Four rounds of 50 m push then 50 m pull", "Cool-down"], "Flat shoes with grip, a towel and water. Chalk is provided.", "volt", false],
    ["hx-e2", "Tuesday Run Club: 1 km repeats", "Eight kilometres of running is half the race. Tonight is 6 × 1 km at target race pace with a short jog between. Three pace groups from 4:15 to 5:45 per km.",
      "u-hx-sofia", "Sofia Marchetti", at(tue, 18, 30), 60, PARK, "Run Club", 60,
      ["u-hx-sofia", ME, "u-hx-hannah", "u-hx-tobi", "u-hx-kwame", "u-hx-lindsey", "u-hx-priya", "u-hx-sam", "u-hx-mika", "u-hx-andre"], ["running", "intervals", "pace-groups"],
      ["Warm-up jog and drills", "6 × 1 km at race pace", "Cool-down jog", "Coffee at the gates"], "Running shoes. A watch with a lap button helps. Reflective gear after dark.", "steel", false],
    ["hx-e3", "Judges & volunteers: movement standards night", "How no-reps get called and how to avoid them. Jules and Owen walk through every station's standard with athletes and judges in the same room, and everyone gets a mock-judge on their weakest movement.",
      "u-hx-jules", "Jules Tremblay", at(wed, 19), 90, "Fuel Station HQ · Queen West, Toronto", "Volunteer", 40,
      ["u-hx-jules", "u-hx-owen", MARCUS, "u-hx-kwame", "u-hx-lindsey", "u-hx-hannah"], ["judging", "standards", "volunteering"],
      ["Station-by-station standards walk-through", "Mock-judging in pairs", "Questions and the no-rep Hall of Fame", "Sign-up for race-weekend shifts"], "Notebook and a stopwatch if you have one. Bring your questions about no-reps.", "ash", false],
    ["hx-e4", "Doubles Match Night", "A workout built to find out who you pair well with. We rotate partners across four stations and a run, then you each list your top three. Matching happens over pizza.",
      MARCUS, "Marcus Ellery", at(thu, 19), 90, GYM, "Meetup", 32,
      crowd(ME, "u-hx-hannah", "u-hx-sam", "u-hx-tobi", "u-hx-lindsey", "u-hx-kwame", "u-hx-mika"), ["doubles", "partners", "social"],
      ["Welcome and goals round", "Rotating partner workout (4 stations)", "Pizza and top-three picks", "Pairs announced"], "Come as you are. Tell us your target division and rough 1 km pace.", "ember", false],
    ["hx-e5", "Full Race Simulation: Open", "The whole thing, in order, with judges and a clock: eight runs, eight stations, race-day weights. We timestamp every split so you leave with a pacing plan.",
      MARCUS, "Marcus Ellery", at(sat + 7, 8, 30), 180, GYM, "Race Sim", 30,
      crowd(ME, "u-hx-tobi", "u-hx-priya", "u-hx-andre", "u-hx-hannah", "u-hx-kwame", "u-hx-sam", "u-hx-mika", "u-hx-lindsey"), ["race-sim", "open", "full"],
      ["Check-in and weigh-in of your kit (30 min)", "Warm-up", "Full race, in heats", "Splits review and cool-down"], "Race kit, race-day nutrition and a plan for your gels. Judges and volunteers: arrive at 8:00.", "volt", false],
    ["hx-e6", "Race-day fuelling with Ravi", "A 45-minute talk and Q&A on carbs per hour, caffeine timing, the Friday dinner and what to do when your gut rebels on run five. Free samples from Fuel Station.",
      "u-hx-ravi", "Ravi Singh", at(thu + 7, 19), 60, "Fuel Station HQ · Queen West, Toronto", "Meetup", 50,
      ["u-hx-ravi", "u-hx-esi", ME, "u-hx-hannah", "u-hx-tobi", "u-hx-kwame", "u-hx-sam", "u-hx-lindsey", MARCUS], ["nutrition", "race-day", "talk"],
      ["What your body burns across a 70-minute race", "Gels, chews and what actually works on run five", "Your Friday-night plan", "Q&A"], "Bring your usual race-day fuel so we can look at it together.", "mint", false],
    ["hx-e7", "Recovery Sunday: mobility & cold plunge", "Mobility flow with Dr. Chen, then contrast therapy at Cold Room. A good reset after a hard sim weekend, and a first plunge for the brave.",
      "u-hx-naomi", "Dr. Naomi Chen", at(sun, 11), 120, COLD, "Recovery", 18,
      ["u-hx-naomi", "u-hx-bruno", "u-hx-mika", "u-hx-sam", "u-hx-priya", "u-hx-andre"], ["recovery", "mobility", "cold-plunge"],
      ["Mobility flow (30 min)", "Contrast therapy circuit", "Hydration and tea"], "Swimsuit, towel and a layer for after. First-timers get a short orientation.", "steel", false],
    ["hx-e8", "Relay team draft night", "Four legs, two stations each, one group chat. Come as a solo or a team and we'll match relay squads by pace and by who owns which station. Race-day plans and team names are mandatory fun.",
      "u-hx-lindsey", "Lindsey Park", at(wed + 7, 19), 75, "The Mill Street Taproom · Distillery District", "Meetup", 40,
      ["u-hx-lindsey", MARCUS, ME, "u-hx-kwame", "u-hx-hannah", "u-hx-tobi", "u-hx-mika"], ["relay", "teams", "social"],
      ["Introductions and station preferences", "Pairing and squad draft", "Team names and the group chat", "Food"], "Know your 1 km pace and which station you'd rather not do.", "ember", false],
    ["hx-e9", "Wall ball & burpee broad jump workshop", "The two stations that wreck Open athletes most often. Sofia on breathing and cadence, Marcus on mechanics, Jules on exactly what gets called as a no-rep.",
      MARCUS, "Marcus Ellery", at(sat + 14, 9), 90, GYM, "Station Clinic", 24,
      crowd("u-hx-sofia", "u-hx-jules", "u-hx-kwame", "u-hx-hannah", "u-hx-sam"), ["wall-balls", "burpees", "technique"],
      ["Wall ball cadence and breathing", "Burpee broad jump rhythm", "Mock-judging on both", "Timed block of 100 wall balls"], "Flat shoes. Knee sleeves optional. Chalk and balls provided.", "volt", false],
    // recently finished
    ["hx-p1", "Sim Saturday: the full course", "Our biggest sim yet: 28 athletes, three heats, full splits and a very quiet minute after wall balls.", MARCUS, "Marcus Ellery", at(-9, 8, 30), 180, GYM, "Race Sim", 30,
      crowd("u-hx-tobi", "u-hx-priya", "u-hx-andre", "u-hx-hannah", "u-hx-mika"), ["race-sim", "recap"], ["Check-in", "Warm-up", "Race", "Splits review"], "Race kit and fuel.", "ash", true],
    ["hx-p2", "Run Club: hill repeats", "Eight hills, one coffee. The best way to practise running tired.", "u-hx-sofia", "Sofia Marchetti", at(-6, 18, 30), 60, "High Park · by the Grenadier Café", "Run Club", 40,
      ["u-hx-sofia", "u-hx-tobi", "u-hx-kwame", "u-hx-lindsey", "u-hx-sam"], ["running", "hills"], ["Warm-up", "8 × hill repeats", "Cool-down"], "Running shoes.", "steel", true],
    ["hx-p3", "Doubles drills: sled and carry swaps", "Practised handing off the station at the right moment with five pairs and a stopwatch.", MARCUS, "Marcus Ellery", at(-20, 10), 75, GYM, "Station Clinic", 20,
      crowd("u-hx-tobi", "u-hx-hannah", "u-hx-sam", ME), ["doubles", "sleds"], ["Warm-up", "Hand-off drills", "Timed pair rounds"], "Flat shoes.", "volt", true],
  ];
}

const RESOURCES = [
  ["hx-r1", "Free day pass at Ironwork Athletics", "Ironwork hosts our Saturday sessions. Bring a friend to Station Saturday and you both train on the house. Sleds, SkiErgs and rowers are always available.", "perk", "Free access", "Zara Ahmed", "u-hx-zara", "Free day pass", "Message Zara with the name of the friend you're bringing and the day.", ["gym", "free", "saturday"], true, "volt"],
  ["hx-r2", "20% off recovery at Cold Room", "Cold plunge, sauna and a physio room, ten minutes from the gym. Show your crew profile at the desk.", "perk", "Discount", "Bruno Costa", "u-hx-bruno", "20% off", "Show your member profile at the front desk. Book ahead for Sunday afternoons.", ["recovery", "cold-plunge"], true, "steel"],
  ["hx-r3", "15% off Fuel Station gels & electrolytes", "Gels, chews and electrolytes built for people who have to run again after a sled pull. Free samples at every Station Saturday.", "perk", "Discount", "Esi Mensah", "u-hx-esi", "15% off", "Use the crew code at checkout. Samples are at the Ironwork front desk on Saturdays.", ["fuel", "nutrition", "race-day"], true, "ember"],
  ["hx-r4", "Free pre-race screening with a physio", "Dr. Chen runs a 25-minute pre-race screen for crew members: knees, shoulders, hips and a plan for the last three weeks before race day.", "perk", "Free access", "Dr. Naomi Chen", "u-hx-naomi", "Free 25 min", "Message Dr. Chen with your race date and any niggles.", ["physio", "injury", "screening"], false, "mint"],
  ["hx-r5", "Station-by-station pacing guide", "How to pace the eight stations and the eight runs between them: what to hold back on, where to push, and how to run on legs that are still wondering what a sled is.", "guide", "Insight", "Marcus Ellery", MARCUS, null, "Open the guide, then bring your splits to the next sim.", ["pacing", "stations", "guide"], true, "volt"],
  ["hx-r6", "The standards cheat sheet: Open & Pro", "One page: the eight stations in order, the distances, the Open and Pro weights, the burpee broad jump rule and what counts as a no-rep. Always confirm against the current official rulebook before race day, as weights and rules can change.", "guide", "Insight", "Jules Tremblay", "u-hx-jules", null, "Print it and keep it in your gym bag.", ["standards", "no-reps", "rules"], true, "ash"],
  ["hx-r7", "12-week plan to a first Open race", "Three runs, two station sessions and one recovery day a week. Written for people who can run 5 km and want to finish strong rather than just finish.", "template", "Training plan", "Marcus Ellery", MARCUS, null, "Download the plan, pick a start date and share it in the group chat.", ["training-plan", "beginner", "open"], false, "volt"],
  ["hx-r8", "Race-day checklist & doubles partner agreement", "Everything for the night before and the morning of, plus a one-page agreement for doubles partners: who owns which station, the pacing plan, and what happens if one of you has a bad day.", "template", "Template", "Lindsey Park", "u-hx-lindsey", null, "Copy, edit and share with your partner.", ["checklist", "doubles", "race-day"], false, "ember"],
];

const ANNOUNCEMENTS = [
  ["hx-a1", "Toronto race season: the sign-up checklist", "Entries sell out fast. Before you register: pick your division (Open, Pro, Doubles or Relay), find a partner if you're racing Doubles, and book the week off for recovery. We'll post everyone's heat times here.", "high", 1, "See divisions"],
  ["hx-a2", "Volunteer judges wanted", "We need 20 trained volunteers for the next race weekend. Come to the movement-standards night, get your mock-judge, and sign up for a shift.", "high", 3, "Sign up"],
  ["hx-a3", "Station Saturdays are moving to 9:00", "Doors open at 8:30 for early warm-ups. Sleds are loaded to Open weights by default; ask a coach if you'd like Pro.", "normal", 6, null],
  ["hx-a4", "Doubles Match Night is open", "Racing Doubles and don't have a partner? Come to Thursday's Match Night and meet your pair. We've seen four pairs form every month.", "normal", 9, "RSVP"],
  ["hx-a5", "A Pro-division training block is coming", "A six-week block for athletes aiming for Pro. Heavier sleds, tougher paces, fewer rest days. Message Marcus if you want in.", "normal", 15, "Message Marcus"],
];

const HELP = [
  ["hx-h1", "u-hx-hannah", "Looking for a mixed doubles partner (Open)", "Racing Doubles Mixed in the spring, 4:45/km runner, 1:15-ish target. I'd love someone stronger on sleds who doesn't mind taking the lunges.", "Doubles partner", ["doubles", "mixed", "open"], "high", [ME, "u-hx-sam"], 2],
  ["hx-h2", "u-hx-kwame", "Pacer for run five and six on the sim?", "I fade on the last two runs and don't know if it's pacing or fitness. A pacer for the next full sim would help me learn.", "Pacing & training", ["pacing", "sim"], "normal", ["u-hx-priya", "u-hx-sofia"], 3],
  ["hx-h3", "u-hx-lindsey", "A fourth for our relay team", "Three of us at Bay Street Relay need a fourth. Any pace is fine. We'll cover the entry for whoever joins.", "Doubles partner", ["relay", "team"], "normal", ["u-hx-tobi"], 5],
  ["hx-h4", MARCUS, "Borrow weight plates for the Pro block", "Short on 25 kg plates for the six-week Pro block. Anyone with a spare set for a few weeks, or a gym with some to lend?", "Gear & equipment", ["pro", "equipment"], "normal", ["u-hx-zara"], 7],
];

const APPS = [
  ["u-hx-app-1", "Yasmin Rahman", "yasmin.app-1@example.com", "ICU nurse", "Toronto General", "Did my first race last spring and loved it. Looking for a crew that trains on weekends around my shifts.", ["Endurance", "Shift-friendly training"]],
  ["u-hx-app-2", "Greg Hollis", "greg.app-2@example.com", "Personal trainer", "Hollis Fitness", "I coach hybrid athletes and want to learn from the community. Happy to run a mobility clinic for members.", ["Coaching", "Mobility"]],
];

export function buildHyrox(fixtures, deps) {
  return buildDemo(fixtures, deps, {
    slug: HYROX_SLUG, prefix: "hx", name: "Toronto Hyrox Crew", tagline: "Eight runs. Eight stations. One crew.", hubKind: "Fitness racing community",
    hubCover: cover("#121212", "#FFD60A", "#FF5A1F"), covers: COVERS, brand: BRAND, emailDomain: "torontohyrox.example", memberId: ME, adminId: MARCUS, instagram: true,
    people: PEOPLE, events: eventDefs, resources: RESOURCES, announcements: ANNOUNCEMENTS, authorName: "Marcus Ellery", help: HELP, apps: APPS,
    matches: {
      member: [["u-hx-hannah", ["Doubles partner", "Race logistics"], ["Event hosting"]], ["u-hx-marcus", ["Sled technique", "Race-plan design"], ["Community building"]], ["u-hx-sofia", ["Pacing"], ["Brand partnerships"]], ["u-hx-ravi", ["Race-day fuelling"], ["Event hosting"]]],
      admin: [["u-hx-zara", ["Gym partner"], ["Race-plan design"]], ["u-hx-jules", ["Volunteer judges"], ["Sled push & pull technique"]], ["u-hx-bruno", ["Recovery partner"], ["Group coaching"]], ["u-hx-esi", ["Sponsorship"], ["Group coaching"]]],
    },
    completion: { percent: 89, missing: ["Photo"], missing_keys: ["avatar_url"], sections: { "About you": { done: 4, total: 5 }, "Skills & interests": { done: 2, total: 2 }, "Goals & support": { done: 2, total: 2 } } },
    config: {
      community_kind: "Fitness racing community", community_type: "social", interest_tags: ["Fitness", "Running"],
      about: "An independent community for people who train for and race HYROX in Toronto: first-timers, Open and Pro athletes, Doubles pairs, Relay teams, coaches, physios, volunteer judges and the gyms and brands that back them. We share training, pacing plans, race-week logistics and rides to the venue. Not affiliated with HYROX.",
      about_url: "", about_cta: "",
      member_label_singular: "Athlete", member_label_plural: "Athletes",
      member_types: { founder: "Athlete", mentor: "Coach", alumni: "Judge & volunteer", partner: "Partner", guest: "Guest" },
      event_types: ["Station Clinic", "Run Club", "Race Sim", "Meetup", "Recovery", "Volunteer"],
      support_categories: ["Doubles partner", "Pacing & training", "Gear & equipment", "Recovery & injury", "Race logistics", "Nutrition", "Other"],
      profile: { fields: [
        { key: "title", label: "Division & PB", enabled: true }, { key: "skill_set", label: "What I can offer", enabled: true },
        { key: "interests_hobbies", label: "Training style", enabled: true }, { key: "goals", label: "Race goals", enabled: true }, { key: "support_needs", label: "Looking for", enabled: true },
      ] },
      signup_fields: [
        { key: "title", label: "Your division and best time", type: "text", required: false }, { key: "skill_set", label: "What can you offer the crew?", type: "tags", required: false },
        { key: "interests_hobbies", label: "Training style", type: "tags", required: false },
      ],
      apply_questions: [
        { key: "experience", label: "Have you raced a Hyrox before?", placeholder: "Never, once, a few times..." },
        { key: "division", label: "Which division are you aiming for?", placeholder: "Open, Pro, Doubles, Relay..." },
      ],
      page_text: {
        members_title: "Meet the crew", members_subtitle: "Athletes, coaches, physios, judges and partners: what they train, what they offer and what they're looking for.",
        events_title: "Training & races", events_subtitle: "Station clinics, run club, full simulations, recovery and race-week meetups.",
        resources_title: "Perks & plans", resources_subtitle: "Day passes, recovery and fuel deals, pacing guides and training plans, shared by the crew.",
        support_title: "Help board", support_subtitle: "Need a doubles partner, a pacer or borrowed kit? Ask here. Offer a hand when you can.",
        requests_title: "Your to-do", requests_subtitle: "Forms and updates the crew has asked you for.",
        matches_title: "People to train with", matches_subtitle: "Partners, coaches and sessions picked for your division, goals and what you're looking for.",
        updates_title: "Crew news", updates_subtitle: "Race-season updates, volunteer calls and new training blocks.",
        ask_title: "Ask the crew", ask_subtitle: "Find a partner, a session or someone who has done it before.",
      },
      nav: [
        { key: "members", label: "Crew", enabled: true }, { key: "matches", label: "Partners", enabled: true }, { key: "events", label: "Train & Race", enabled: true },
        { key: "resources", label: "Perks & Plans", enabled: true }, { key: "updates", label: "News", enabled: true }, { key: "requests", label: "To-do", enabled: false },
        { key: "support", label: "Help", enabled: true }, { key: "inbox", label: "Messages", enabled: true },
      ],
      custom_links: [{ label: "Race calendar", url: "https://example.com/toronto-hyrox-crew/calendar" }],
    },
  });
}
