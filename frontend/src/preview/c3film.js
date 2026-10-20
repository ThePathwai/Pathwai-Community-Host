// The "C3 Film Team" demo community: the creative team inside a church (C3), not the whole congregation. Each person lists
// the creative skills they bring and where they'd like to serve, the calendar is the team's rhythm (weekly meeting, shoots,
// edit nights, onboarding and off-boarding), and anyone can start a small project team ("Easter weekend shoot crew").
// C3's own colours and logo are kept from the recorded community. Every person, project, date and number is made up for the
// demo. Dates are relative to today.

import { at, buildDemo, cover } from "./demoKit";

export const C3_SLUG = "grace";
const ME = "u-c3-me";          // the member-demo persona (a videographer & editor)
const NAOMI = "u-c3-naomi";    // the admin-demo persona (film team lead)

const COLOR = { navy: "#042D49", red: "#EA2401", sky: "#0B3A5C", sand: "#F3F7FA" };
const COVERS = {
  navy: cover("#0B3A5C", COLOR.red, "#12507A"), red: cover("#2A1512", COLOR.red, COLOR.navy), blue: cover("#0A3350", "#3AA0E8", COLOR.red),
  gold: cover("#2B2410", "#F0B429", COLOR.navy), teal: cover("#08323B", "#1B9C8E", COLOR.red),
};

// [id, name, member_type, title, company, location, bio, creative skills, gear & interests, where I want to serve, looking to learn, open to, extra]
// Types: founder = Team member, mentor = Team lead, alumni = Alumni (served before), partner = Ministry partner, guest = New / trial
const PEOPLE = [
  [NAOMI, "Naomi Adeyemi", "mentor", "Film team lead", "C3 Film Team", "Toronto",
    "I lead the film team. I make sure every shoot has a plan, every person has a role that fits them, and nobody burns out. Ask me about onboarding, scheduling or what we're making next.",
    ["Directing", "Producing", "Shot lists", "Team leadership"], ["Cinema cameras", "Storytelling", "Coffee"],
    ["Sunday service direction", "Mentoring newer members"], ["A second producer", "Colour grading help"], ["Mentoring", "Leading a project team"], { stage: "Pro" }],
  [ME, "Fife Ashley-Dejo", "founder", "Videographer & editor", "C3 Film Team", "Toronto",
    "I shoot and edit. Happy on a gimbal or at the edit desk. I want to tell more of our church's stories, especially testimonies.",
    ["Videography", "Video editing", "Gimbal operation", "Event coverage"], ["Sony FX3", "Premiere Pro", "Afrobeats"],
    ["Testimony videos", "Baptism stories", "Training newer shooters"], ["Colour grading", "Sound design"], ["Leading a project team", "Mentoring"], { stage: "Intermediate" }],
  ["u-c3-tobi", "Tobi Adebayo", "founder", "Director", "C3 Film Team", "North York",
    "Short-film director who got into church media through the youth group. I like a tight shot list and a loose set.",
    ["Directing", "Scriptwriting", "Casting", "Storyboarding"], ["Cinema lenses", "Documentary", "Basketball"],
    ["Youth ministry films", "Easter production"], ["Producing", "Budgeting a shoot"], ["Leading a project team"], { stage: "Pro" }],
  ["u-c3-ravi", "Ravi Menon", "founder", "Livestream director", "C3 Film Team", "Scarborough",
    "I run the Sunday livestream: switcher, graphics and the countdown that always starts four seconds late. I'd love a backup director.",
    ["Livestream directing", "Multi-camera switching", "OBS & vMix", "Graphics operation"], ["Blackmagic ATEM", "Tech", "Cycling"],
    ["Sunday livestream", "Training a backup director"], ["Audio mixing"], ["Mentoring", "Leading a project team"], { stage: "Pro" }],
  ["u-c3-zara", "Zara Okonkwo", "founder", "Motion designer", "C3 Film Team", "Etobicoke",
    "Motion graphics and titles. I'll make your lower thirds feel like they belong to the same family.",
    ["Motion graphics", "After Effects", "Title design", "Brand animation"], ["Wacom tablet", "Typography", "Baking"],
    ["Youth ministry promos", "Series bumpers"], ["Cinematography basics"], ["Leading a project team"], { stage: "Intermediate" }],
  ["u-c3-daniel", "Daniel Kim", "founder", "Sound engineer", "C3 Film Team", "Mississauga",
    "Audio is half the picture. I record on set, clean it up in post and mix the worship nights.",
    ["Location sound", "Audio mixing", "Podcast production", "Sound design"], ["Boom mics", "Worship music", "Hiking"],
    ["Worship night recordings", "Podcast"], ["Camera operation"], ["Mentoring"], { stage: "Pro" }],
  ["u-c3-amara", "Amara Nwosu", "founder", "Photographer", "C3 Film Team", "Liberty Village",
    "Stills for every event: baptisms, youth nights, Sunday arrivals. I'd like to start shooting video with my camera.",
    ["Event photography", "Portraits", "Photo editing"], ["Canon R6", "Lightroom", "Brunch"],
    ["Baptism coverage", "Church socials"], ["Videography", "Gimbal operation"], ["Mentoring"], { stage: "Intermediate" }],
  ["u-c3-marcus", "Marcus Bell", "founder", "Colourist & editor", "C3 Film Team", "The Danforth",
    "I grade everything we shoot so a Sunday service and a short film look like the same church. Always up to teach a LUT workflow.",
    ["Colour grading", "Video editing", "DaVinci Resolve", "Workflow & asset management"], ["Resolve Studio", "Film emulation", "Running"],
    ["Colour for the Easter film", "Teaching colour"], ["Motion graphics"], ["Mentoring", "Leading a project team"], { stage: "Pro" }],
  ["u-c3-lena", "Lena Petrov", "founder", "Drone pilot & second shooter", "C3 Film Team", "Leslieville",
    "Licensed drone pilot. Aerials of the building, outreach days and the baptism in the park.",
    ["Drone cinematography", "Camera operation", "Event coverage"], ["DJI Mavic 3", "Travel", "Rock climbing"],
    ["Outreach days", "Missions trip documentary"], ["Editing"], ["Missions trip documentary"], { stage: "Intermediate" }],
  ["u-c3-joel", "Joel Mensah", "founder", "Social media producer", "C3 Film Team", "Brampton",
    "I turn long sermons and shoots into short clips people actually watch. Captions, hooks and a calendar.",
    ["Short-form video", "Captions & copy", "Social strategy", "Posting schedules"], ["CapCut", "Analytics", "Football"],
    ["Social media for Sunday", "Youth content"], ["Videography"], ["Leading a project team"], { stage: "Intermediate" }],
  ["u-c3-grace", "Grace Okafor", "founder", "Scriptwriter", "C3 Film Team", "Roncesvalles",
    "I write the words: devotional scripts, testimonies and voice-overs. I'd love to get closer to the camera side.",
    ["Scriptwriting", "Interviewing", "Voice-over writing"], ["Journaling", "Poetry", "Tea"],
    ["Testimony series", "Kids ministry stories"], ["Directing", "Camera basics"], ["Mentoring"], { stage: "Beginner" }],
  ["u-c3-sam", "Sam Rivera", "alumni", "Gaffer", "C3 Film Team", "Parkdale",
    "I light the room. Served on the team for two years, still available for the big shoots.",
    ["Lighting", "Grip", "Set design"], ["Aputure lights", "Woodworking", "Film history"],
    ["Easter production", "Training new lighting volunteers"], ["Producing"], ["Mentoring"], { stage: "Pro" }],
  ["u-c3-jordan", "Jordan Fraser", "alumni", "Editor", "Independent", "Hamilton",
    "Leaving the team at the end of the month for a new job in another city. Currently handing over the Sunday edit pipeline.",
    ["Video editing", "Sermon edits", "Asset management"], ["Final Cut Pro", "Podcasts", "Cooking"],
    ["A clean handover"], ["Mentoring"], ["Mentoring"], { stage: "Intermediate" }],
  ["u-c3-nia", "Nia Campbell", "guest", "Aspiring camera operator", "New volunteer", "Toronto",
    "Just joined from the youth group. I've shot on my phone for years and want to learn proper cameras.",
    ["Mobile video", "Photography basics"], ["iPhone", "Dance", "Youth ministry"],
    ["Youth ministry stories", "Learning on set"], ["Camera operation", "Lighting", "Editing"], ["Mentoring", "Shadowing"], { stage: "Beginner" }],
  ["u-c3-pastor", "Pastor Michael Grant", "partner", "Pastor, media & communications", "C3 Toronto", "Toronto",
    "I oversee media and communications. The film team's work is how the church's story gets told outside our walls. I'm here to clear roadblocks and say thank you.",
    ["Vision & messaging", "Approvals", "Ministry priorities"], ["Preaching", "Coffee", "Sports"],
    ["Telling more testimonies", "A sustainable team"], ["Volunteer coordination ideas"], ["Partnerships"], { stage: "Ministry partner" }],
];

function eventDefs({ at: A, until }) {
  const mon = until(1), tue = until(2), wed = until(3), thu = until(4), fri = until(5), sat = until(6), sun = until(0);
  const STUDIO = "C3 Toronto · film studio (room sent when you RSVP)";
  const ONLINE = "Online · link sent when you RSVP";
  const core = [NAOMI, ME, "u-c3-tobi", "u-c3-ravi", "u-c3-zara", "u-c3-daniel", "u-c3-marcus", "u-c3-amara", "u-c3-lena", "u-c3-joel", "u-c3-grace"];
  return [
    ["c3-e1", "Weekly team meeting", "Our weekly check-in: what shipped, what's shooting this week, who needs help. Fifteen minutes of announcements, then project teams break out. New faces welcome.",
      NAOMI, "Naomi Adeyemi", A(tue, 19), 60, STUDIO, "Team Meeting", 30, [...core, "u-c3-nia"], ["weekly", "planning", "team"],
      ["Wins and shout-outs (10 min)", "This week's shoots and edits (15 min)", "Project team breakouts (25 min)", "Prayer and close (10 min)"], "Bring one thing you're working on and one thing you need.", "navy", false],
    ["c3-e2", "Easter Sunday service shoot", "Full-team shoot for the Easter gatherings: multi-camera coverage, aerials of the building and the baptism, plus testimonies recorded on the side. Call time is early; breakfast is provided.",
      NAOMI, "Naomi Adeyemi", A(sat + 7, 6, 30), 480, "C3 Toronto · main auditorium", "Shoot", 20, [NAOMI, ME, "u-c3-tobi", "u-c3-ravi", "u-c3-daniel", "u-c3-amara", "u-c3-lena", "u-c3-sam"], ["easter", "multi-cam", "service"],
      ["6:30 call time and coffee", "Walkthrough and shot list", "Rehearsal", "Services (two)", "Wrap and card dump"], "Charge every battery the night before. Wear black. Bring your own camera or tell Naomi you need a loaner.", "red", false],
    ["c3-e3", "Youth night promo shoot", "A short, loud promo for the next youth night: three locations, five young people, one afternoon. Perfect for newer members who want to shadow.",
      "u-c3-tobi", "Tobi Adebayo", A(sun, 14), 180, "C3 Toronto · youth space and the parking lot", "Shoot", 10, ["u-c3-tobi", "u-c3-zara", "u-c3-joel", "u-c3-nia", "u-c3-lena"], ["youth", "promo", "shadow"],
      ["Brief and storyboard", "Interiors", "Exteriors", "Wrap and review"], "Joel is cutting a 15-second version for social the same night.", "blue", false],
    ["c3-e4", "Edit night", "A quiet room, big screens and good snacks. Bring your project, get a second pair of eyes from a colourist or sound engineer, and leave with a cut you're proud of.",
      "u-c3-marcus", "Marcus Bell", A(thu, 18, 30), 150, STUDIO, "Edit Night", 14, ["u-c3-marcus", ME, "u-c3-daniel", "u-c3-jordan", "u-c3-grace", "u-c3-zara"], ["editing", "feedback", "colour"],
      ["Open edit time", "Rotating review: colour and sound", "Export checks"], "Bring a laptop and headphones. Projects should have a rough cut.", "gold", false],
    ["c3-e5", "Onboarding: welcome to the film team", "For new members: how the team works, how to book gear, how files are named and stored, who to ask for what, and where your skills fit. You'll leave with a role, a mentor and your first shoot on the calendar.",
      NAOMI, "Naomi Adeyemi", A(wed, 18), 90, STUDIO, "Onboarding", 12, [NAOMI, "u-c3-nia", "u-c3-grace", "u-c3-amara", "u-c3-ravi"], ["onboarding", "new-members", "gear"],
      ["Welcome and the team's mission", "Roles and where you fit", "Gear booking and file workflow", "Pick your first shoot and a mentor"], "Fill in your profile with your skills and where you'd like to serve before you come.", "teal", false],
    ["c3-e6", "Off-boarding and handover: Jordan's last Sunday", "Jordan is moving cities. This session is the handover: raw footage and project files, the Sunday edit pipeline, passwords and gear returned, and a thank-you. Anyone picking up the Sunday edit should attend.",
      NAOMI, "Naomi Adeyemi", A(mon + 7, 19), 60, STUDIO, "Off-boarding", 12, [NAOMI, "u-c3-jordan", "u-c3-marcus", ME], ["off-boarding", "handover", "thank-you"],
      ["Walk through the Sunday edit pipeline", "Hand over project files and accounts", "Gear and keys returned", "Prayer and thank-you"], "Jordan: bring the handover checklist. Editors: bring questions.", "navy", false],
    ["c3-e7", "Camera basics workshop", "Hands-on with the church's cameras: exposure, focus, framing and moving shots. No experience needed. Great for new members and for people who want to try a different role.",
      "u-c3-lena", "Lena Petrov", A(fri, 18), 120, STUDIO, "Training", 10, ["u-c3-lena", "u-c3-nia", "u-c3-grace", "u-c3-amara", "u-c3-joel"], ["training", "camera", "beginner"],
      ["Exposure triangle in 15 minutes", "Hands-on stations", "Short walk-and-shoot exercise"], "Bring a charged phone if you have no camera.", "gold", false],
    ["c3-e8", "Christmas Eve shoot (look back)", "A look back at the Christmas Eve production: ten people, four cameras and a lot of candles.",
      NAOMI, "Naomi Adeyemi", A(-20, 15), 360, "C3 Toronto · main auditorium", "Shoot", 20, [NAOMI, "u-c3-tobi", "u-c3-ravi", "u-c3-daniel", "u-c3-sam", "u-c3-marcus"], ["christmas", "multi-cam"],
      ["Rehearsal", "Services", "Wrap"], "", "red", true],
  ];
}

// [id, title, description, type, category, author, authorId, value, claim, tags, featured, coverKey]
const RESOURCES = [
  ["c3-r1", "Film team onboarding checklist", "Everything a new member does in their first month: fill in your profile, meet your mentor, shadow one shoot, book your first piece of gear and join one project team.", "guide", "Onboarding", "Naomi Adeyemi", NAOMI, null, "Open the checklist and tick it off with your mentor.", ["onboarding", "checklist"], true, "teal"],
  ["c3-r2", "Off-boarding and handover checklist", "How to leave well: hand over project files and accounts, return gear, document your workflow and say goodbye to the team. Also useful if you're stepping back for a season.", "guide", "Off-boarding", "Naomi Adeyemi", NAOMI, null, "Copy it, fill it in and book a handover session with Naomi.", ["off-boarding", "handover", "checklist"], true, "navy"],
  ["c3-r3", "Shot list and storyboard template", "A one-page shot list and a storyboard grid. Tobi's version: tight on the must-haves, loose on everything else.", "template", "Template", "Tobi Adebayo", "u-c3-tobi", null, "Make a copy and share it with your project team.", ["shot-list", "template", "pre-production"], false, "gold"],
  ["c3-r4", "Gear booking sheet", "Book cameras, lenses, lights, mics and drones from the church kit. See what's free, what's out and who has it.", "perk", "Gear", "Naomi Adeyemi", NAOMI, "Free loan", "Add your name and dates on the sheet at least 48 hours before you need it.", ["gear", "booking"], true, "red"],
  ["c3-r5", "Talent and location release forms", "The release forms we use for testimonies, baptisms and anyone filmed on church property.", "template", "Template", "Pastor Michael Grant", "u-c3-pastor", null, "Download, print or send the digital version before you hit record.", ["release", "legal", "testimony"], false, "blue"],
  ["c3-r6", "File naming and folder structure", "How we name projects, where raw footage lives and what goes in the archive. Follow it and anyone on the team can pick up your edit.", "guide", "Workflow", "Marcus Bell", "u-c3-marcus", null, "Set up your project folder from the template before your next shoot.", ["workflow", "assets", "naming"], false, "gold"],
  ["c3-r7", "LUT pack for the church cameras", "Our approved look: a LUT for each camera so a Sunday service and a short film feel like the same church.", "perk", "Gear", "Marcus Bell", "u-c3-marcus", "Free download", "Ask Marcus for the link; he'll also show you how to apply it.", ["colour", "lut", "workflow"], false, "teal"],
];

const ANNOUNCEMENTS = [
  ["c3-a1", "Easter shoot: pick your role", "We're shooting both Easter services with a full crew. Pick a role on the sign-up sheet: cameras, sound, lighting, aerials, stills or runner. New members can shadow.", "high", 1, "See the shoot"],
  ["c3-a2", "New: start your own project team", "Got an idea? Start a project team (a testimony series, a short film, a livestream upgrade), say what skills you need and invite people to join. Find it under Project teams.", "high", 2, "Start a team"],
  ["c3-a3", "Welcome Nia, Grace and Amara", "Three new members joined this month. Say hi, offer a skill swap and invite them to a shoot.", "normal", 4, "See the team"],
  ["c3-a4", "Jordan's handover", "Jordan is moving at the end of the month. Sunday editors: please attend the handover session so nothing gets lost.", "normal", 6, "See the session"],
  ["c3-a5", "Gear audit this weekend", "We're checking in every camera, lens and mic. If you have church gear at home, please bring it Sunday.", "normal", 9, "Gear sheet"],
];

const HELP = [
  ["c3-h1", "u-c3-tobi", "Need a second shooter for the youth promo", "Sunday afternoon, three locations. Gimbal experience is a bonus, enthusiasm is mandatory.", "Need a hand on a shoot", ["videography", "second-shooter", "youth"], "high", ["u-c3-lena", ME], 1],
  ["c3-h2", "u-c3-zara", "Can someone grade a 30-second promo?", "I have a rough cut and no idea how to match it to our look. Marcus, I'm looking at you, but anyone with Resolve is welcome.", "Editing help", ["colour", "resolve", "promo"], "normal", ["u-c3-marcus"], 2],
  ["c3-h3", "u-c3-nia", "Looking for someone to shadow on a shoot", "I'm new and want to see how a real set works. I can carry cases, hold a reflector and learn fast.", "Learning", ["shadow", "beginner", "camera"], "normal", ["u-c3-lena", "u-c3-ravi"], 3],
  ["c3-h4", "u-c3-grace", "Anyone want to trade writing for camera lessons?", "I'll write your scripts, captions or voice-overs. In return I'd love an hour on camera basics.", "Skill swap", ["writing", "camera", "swap"], "normal", [ME], 4],
  ["c3-h5", NAOMI, "Two more people for Easter sound and lighting", "We're short on lighting assistants and a sound runner for both services.", "Need a hand on a shoot", ["lighting", "sound", "easter"], "high", ["u-c3-sam", "u-c3-daniel"], 1],
];

const APPS = [
  ["u-c3-app-1", "Esther Boateng", "esther.app-1@example.com", "Video editor", "Independent", "I edit for a living and want to use it for something that matters. I can help on Sunday edits and teach newer editors.", ["Video editing", "Colour grading"]],
  ["u-c3-app-2", "Caleb Reyes", "caleb.app-2@example.com", "Camera operator", "Student", "Film student looking for real shoots and a team to serve with. Happy to start as a runner.", ["Camera operation", "Lighting"]],
];

// Project teams anyone can start. [name, description, looking for, lead, members, status]
const TEAMS = [
  ["Easter weekend shoot crew", "The full production for both Easter services: multi-cam, aerials, sound and a baptism package. Roles are being finalised this week.", ["Gaffer", "Sound", "Camera operator", "Runner"], "u-c3-tobi", [NAOMI, "u-c3-tobi", "u-c3-ravi", "u-c3-daniel", "u-c3-lena", "u-c3-sam"], "active", 2],
  ["Sunday livestream", "Keeping the weekly livestream sharp and training a backup director so Ravi can finally sit in the congregation.", ["Graphics operation", "Livestream directing", "Audio mixing"], "u-c3-ravi", ["u-c3-ravi", "u-c3-zara", "u-c3-daniel", "u-c3-nia"], "active", 9],
  ["Baptism stories", "A short film series of baptism testimonies, one every month. Shot at the service, edited with the person's own words.", ["Video editing", "Colour grading", "Interviewing"], ME, [ME, "u-c3-grace", "u-c3-amara"], "active", 3],
  ["Youth ministry promo series", "Short, loud promos for each youth night, made with the students.", ["Motion graphics", "Short-form video"], "u-c3-zara", ["u-c3-zara", "u-c3-joel", "u-c3-nia", "u-c3-tobi"], "active", 5],
  ["Christmas Eve film", "The recap film from Christmas Eve. Delivered and published.", [], NAOMI, [NAOMI, "u-c3-marcus", "u-c3-jordan", "u-c3-sam"], "done", 20],
];

export function buildC3Film(fixtures, deps) {
  const old = fixtures.communities[C3_SLUG]?.public?.["/community/config"] || {};
  const BRAND = {
    ...JSON.parse(JSON.stringify(old.brand || {})),
    login_headline: "Tell the story. Serve with your gifts.",
    login_subhead: "The C3 Film Team: find your role, join a project team and see what we're shooting next.",
    welcome_message: "Easter is coming. Here's what's shooting, what's being edited and who needs your skills.",
    footer_text: "C3 Film Team · a creative team of C3 Toronto · demo community",
  };
  const hubOld = (fixtures.hub || []).find((h) => h.slug === C3_SLUG) || {};
  const built = buildDemo(fixtures, deps, {
    slug: C3_SLUG, prefix: "c3", name: "C3 Film Team", tagline: "The creative team telling C3's story. Find your role, start a project.", hubKind: "Church creative team",
    hubCover: hubOld.cover || old.hub_cover || COVERS.navy, covers: COVERS, brand: BRAND, emailDomain: "c3film.example", memberId: ME, adminId: NAOMI, instagram: false,
    people: PEOPLE, events: eventDefs, resources: RESOURCES, announcements: ANNOUNCEMENTS, authorName: "Naomi Adeyemi", help: HELP, apps: APPS,
    matches: {
      member: [["u-c3-marcus", ["Colour grading", "DaVinci Resolve"], ["Videography", "Video editing"]], ["u-c3-daniel", ["Sound design", "Location sound"], ["Videography"]], ["u-c3-grace", ["Scriptwriting", "Interviewing"], ["Videography", "Video editing"]], ["u-c3-nia", ["Learning on set"], ["Videography", "Gimbal operation"]]],
      admin: [["u-c3-nia", ["Camera operation"], ["Mentoring", "Directing"]], ["u-c3-grace", ["Scriptwriting"], ["Directing", "Mentoring"]], ["u-c3-amara", ["Event photography"], ["Mentoring"]], ["u-c3-marcus", ["Colour grading", "Team leadership"], ["Producing"]]],
    },
    completion: { percent: 100, missing: [], missing_keys: [], sections: { "About you": { done: 5, total: 5 }, "Skills & interests": { done: 2, total: 2 }, "Goals & support": { done: 2, total: 2 } } },
    config: {
      community_kind: "Church creative team", community_type: "social", interest_tags: ["Faith", "Film", "Creative"],
      about: "The C3 Film Team is the creative team inside C3 Toronto: videographers, editors, colourists, sound and lighting, motion designers, photographers, writers and livestream crew. Everyone here lists the skills they bring and where they'd like to serve. We meet weekly, shoot on the weekends, edit together and onboard (and say goodbye to) people well. Anyone can start a project team for something they want to make. This is a demo community: the people, projects and dates are made up.",
      about_url: "", about_cta: "",
      member_label_singular: "Team member", member_label_plural: "Team members",
      member_types: { founder: "Team member", mentor: "Team lead", alumni: "Alumni", partner: "Ministry partner", guest: "New volunteer" },
      event_types: ["Team Meeting", "Shoot", "Edit Night", "Onboarding", "Off-boarding", "Training"],
      support_categories: ["Need a hand on a shoot", "Editing help", "Gear", "Learning", "Skill swap", "Other"],
      profile: { fields: [
        { key: "title", label: "Role on the team", enabled: true }, { key: "stage", label: "Experience", enabled: true }, { key: "skill_set", label: "Creative skills", enabled: true },
        { key: "interests_hobbies", label: "Gear & interests", enabled: true }, { key: "goals", label: "Where I want to serve", enabled: true }, { key: "support_needs", label: "Looking to learn", enabled: true },
      ] },
      signup_fields: [
        { key: "title", label: "Your creative role", type: "text", required: false }, { key: "skill_set", label: "Your creative skills", type: "tags", required: false },
        { key: "goals", label: "Where would you like to serve?", type: "tags", required: false },
      ],
      apply_questions: [
        { key: "skills", label: "What creative skills do you bring?", placeholder: "Camera, editing, sound, lighting, writing, design..." },
        { key: "serve", label: "Where would you like to get involved?", placeholder: "Sunday livestream, testimonies, youth content..." },
      ],
      page_text: {
        members_title: "The team", members_subtitle: "Everyone's creative skills, where they'd like to serve and what they want to learn.",
        events_title: "Team calendar", events_subtitle: "Weekly meetings, shoots, edit nights, onboarding and off-boarding.",
        resources_title: "Team resources", resources_subtitle: "Checklists, templates, gear and workflow guides.",
        support_title: "Help board", support_subtitle: "Need a hand on a shoot, an editing eye or a skill swap? Ask here.",
        matches_title: "People to work with", matches_subtitle: "Teammates whose skills fit what you're making, and who you can help in return.",
        updates_title: "Team news", updates_subtitle: "Shoot sign-ups, new members and handovers.",
        ask_title: "Ask the team", ask_subtitle: "Find a colourist, a second shooter or someone to learn from.",
        teams_title: "Project teams", teams_subtitle: "Small groups for a shoot, a series or an upgrade. Start one for something you want to make, or join one that needs your skills.",
      },
      nav: [
        { key: "members", label: "The team", enabled: true }, { key: "teams", label: "Project teams", enabled: true }, { key: "events", label: "Calendar", enabled: true },
        { key: "matches", label: "Collaborators", enabled: true }, { key: "resources", label: "Resources", enabled: true }, { key: "updates", label: "News", enabled: true },
        { key: "requests", label: "To-do", enabled: false }, { key: "support", label: "Help board", enabled: true }, { key: "inbox", label: "Messages", enabled: true },
      ],
      custom_links: [],
    },
  });
  // The project teams that already exist (anyone can start more).
  const day = 864e5;
  built.book.shared = built.book.shared || {};
  built.book.shared.teams = { items: TEAMS.map(([name, description, looking_for, lead_id, member_ids, status, daysAgo], i) => ({
    id: "c3-team-" + (i + 1), name, description, looking_for, status, lead_id, member_ids: [...new Set(member_ids)], created_by: lead_id,
    created_at: new Date(Date.now() - daysAgo * day).toISOString(), updated_at: new Date(Date.now() - daysAgo * day).toISOString(),
  })) };
  return built;
}
