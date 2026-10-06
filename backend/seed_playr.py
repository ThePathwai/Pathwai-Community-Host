"""The Playr League demo community: members, coaches, teams, events, playbook, help board, news.

Every member profile carries: name, age, height, profession, skills, interests, goals and support needed.
No avatar_url is set here -- members just get Avatar.jsx's own initials-on-color fallback (see
hueFromName/Avatar in components/ui.jsx), rather than a generated illustration: an illustrated
"character creator" face read as out of place for a professional community platform, and a real
stock-photo URL can't load inside the published preview anyway (only embedded/self-contained images
do), so initials are the one option that looks clean everywhere. Each member's `art=` profile below
(skin/hair/jersey/etc.) is now unused -- kept in case illustrated portraits are wanted again later,
via playr_art.py's still-available `portrait()` -- rather than ripped out of 25 member entries for a
purely cosmetic cleanup. Members can still replace the initials with a real photo from their profile.
Runs once (marker in community_config) — set DEMO_DATASET=legacy to keep the old Pathwai sample data instead.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from auth import hash_password
from playr_art import BLACK, CREAM, RED, poster, png_data_uri

WIPE = ["users", "events", "resources", "announcements", "slack_signals", "email_updates", "profile_requests", "connect_requests",
        "organizations", "mentors", "memberships", "applications", "support_requests", "member_requests",
        "notifications", "match_actions", "audit_log", "chat_sessions", "chat_messages"]

NOW = datetime.now(timezone.utc)


def iso(days=0, hours=0, at: int | None = None) -> str:
    d = NOW + timedelta(days=days, hours=hours)
    if at is not None:
        d = d.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(hours=at + 4)  # local (Toronto, EDT) time
    return d.isoformat()


def day(days: int) -> str:
    return (NOW + timedelta(days=days)).date().isoformat()


def ht(ft: int, inch: int) -> str:
    return f"{ft}'{inch}\" · {round((ft * 12 + inch) * 2.54)} cm"


# --------------------------------------------------------------------------------------------- organisations
ORGS = [
    dict(slug="indoor-series", name="Signature Events", type="nonprofit", tagline="Our flagship monthly community gatherings.",
         overview="Monthly mixers and panels at The New Arena: talks from members, open networking and a chance to meet the people behind the profiles.",
         accent_color=RED, headquarters="The New Arena, Toronto", region="Ontario", founded_year=2022, focus_areas=["Networking", "Panels", "Community"],
         stages=["all_stages"], community_size=320, tags=["networking", "community"],
         programs=[dict(name="Fall Season 2026", description="Monthly mixers, a summit and member showcases.", duration="12 weeks", intake_status="Registration open", cta_url="https://example.com/register",
                        extra_questions=[dict(key="interests", label="What would you like to get out of the season?", type="text", required=True, placeholder="Clients, mentors, collaborators..."),
                                         dict(key="referral", label="Who referred you?", type="text", required=False)]),
                   dict(name="Member introductions", description="Not sure where to start? We'll introduce you to three members.", duration="Rolling", intake_status="Open")],
         key_people=[dict(name="Fife Ashley-Dejo", title="Community Lead"), dict(name="Dre Whitfield", title="Programs Mentor")]),
    dict(slug="after-hours", name="After Hours Socials", type="nonprofit", tagline="Evening socials with music, food and good company.",
         overview="Relaxed Friday-night socials: live music, food vendors and easy conversation. Members and guests all welcome.",
         accent_color="#F4F1EA", headquarters="The New Arena, Toronto", region="Ontario", founded_year=2024, focus_areas=["Social", "Music", "Creators"],
         stages=["all_stages"], community_size=180, tags=["social", "creators"],
         programs=[dict(name="Host a table", description="Curate a table around a topic you care about.", duration="Per event", intake_status="Open"),
                   dict(name="Creator crew", description="Photo, video and music volunteers.", duration="Per event", intake_status="Open")],
         key_people=[dict(name="Fife Ashley-Dejo", title="Community Lead")]),
    dict(slug="playr-academy", name="Playr League Workshops", type="university", tagline="Practical workshops taught by members.",
         overview="Business, career and wellness workshops led by members: pricing, legal basics, public speaking, first aid and more.",
         accent_color=RED, headquarters="Toronto, ON", region="Ontario", founded_year=2023, focus_areas=["Workshops", "Mentorship", "Careers"],
         stages=["all_stages"], community_size=210, tags=["workshops", "mentorship"],
         programs=[dict(name="Business Growth Lab", description="Six-week small-group program for side businesses.", duration="6 weeks", intake_status="Cohort 4 · open"),
                   dict(name="First aid certification", description="Two-night certification with a paramedic.", duration="2 nights", intake_status="Open")],
         key_people=[dict(name="Dre Whitfield", title="Programs Mentor"), dict(name="Kwame Asante", title="Wellness lead")]),
    dict(slug="outdoor-series", name="Wellness Outdoors", type="nonprofit", tagline="Walks, yoga and pop-up wellness sessions in the park.",
         overview="Pop-up sessions across the city from May to September. Casual, social and beginner-friendly.",
         accent_color="#F00F21", headquarters="Various parks, Toronto", region="Ontario", founded_year=2023, focus_areas=["Wellness", "Outdoors", "Social"],
         stages=["all_stages"], community_size=140, tags=["outdoor", "wellness"],
         programs=[dict(name="Summer 2027 interest list", description="Be first to know when sessions open.", duration="Seasonal", intake_status="Waitlist")]),
    dict(slug="bayview-sport-clinic", name="Bayview Health Clinic", type="corporate", tagline="Physio and recovery partner of the community.",
         overview="Discounted physio, recovery and movement assessments for every Playr League member.", accent_color="#F4F1EA",
         headquarters="Leslieville, Toronto", region="Ontario", founded_year=2015, focus_areas=["Physio", "Recovery"], stages=["all_stages"], community_size=12,
         tags=["partner", "health"], programs=[dict(name="Member assessment", description="Free 20-minute movement screen.", intake_status="Open")]),
    dict(slug="ironhouse-fuel", name="Ironhouse Nutrition", type="corporate", tagline="Meal prep and nutrition partner.",
         overview="Weekly meal plans and a monthly nutrition Q&A for members.", accent_color=RED, headquarters="Toronto, ON", region="Ontario", founded_year=2019,
         focus_areas=["Nutrition"], stages=["all_stages"], community_size=8, tags=["partner", "nutrition"],
         programs=[dict(name="Member meal plan", description="15% off weekly plans.", intake_status="Open")]),
]


# --------------------------------------------------------------------------------------------- members
# (id, name, age, (ft,in), sport, level, position, profession, employer, hood, art, division, skills, interests, goals, needs, bio, role, orgs)
A = dict
M: List[Dict[str, Any]] = [
    A(id="u-founder-me", name="Fife Ashley-Dejo", age=27, h=(5, 9), sport="Basketball", level="Intermediate", position="Wing", prof="Physiotherapist", emp="Bayview Health Clinic", hood="Leslieville",
      art=A(skin="d", hair="puffs", hair_color="black", jersey=RED, number="9", bg=0, smile=True), div="Sunday Indoor · Div B · Red Line",
      skills=["Recovery & mobility", "Defense", "Rebounding", "Team leadership"], interests=["Trail running", "Film photography", "Afrobeats", "Meal prep"],
      goals=["Move up to Division A", "Play a full season injury-free", "Start a women's clinic night"], needs=["Shooting form", "Ball handling", "Video review"],
      bio="Physiotherapist building a private practice. Keen to swap notes with other health and wellness professionals, and to find help with marketing and business setup.", role="founder", orgs=["indoor-series", "playr-academy", "bayview-sport-clinic"]),
    A(id="u-dre", name="Dre Whitfield", age=41, h=(6, 3), sport="Basketball", level="Competitive", position="Head coach", prof="Leadership coach", emp="Whitfield Hoops", hood="Downsview",
      art=A(skin="e", hair="fade", hair_color="black", jersey=BLACK, number="1", bg=1, beard=True, smile=True), div="Playr League Academy · Head Coach",
      skills=["Shooting", "Ball handling", "Video review", "Mental game", "Playmaking"], interests=["Vinyl records", "BBQ", "Sports podcasts"],
      goals=["Launch a year-round shooting lab", "Certify 10 new coaches"], needs=["Photography", "Content creation", "Event organising"],
      bio="Ten years as a pro athlete, now a skills coach and mentor. I love helping people turn experience into a career and a clear plan.", role="mentor", orgs=["playr-academy", "indoor-series"]),
    A(id="u-sofia", name="Sofia Marchetti", age=36, h=(5, 11), sport="Volleyball", level="Advanced", position="Head coach", prof="High school teacher", emp="Danforth Collegiate", hood="Danforth",
      art=A(skin="a", hair="long", hair_color="auburn", jersey=CREAM, number="4", bg=2, smile=True), div="Playr League Academy · Volleyball",
      skills=["Serving", "Footwork", "Team leadership", "Coaching youth"], interests=["Gardening", "Italian cooking", "Cycling"],
      goals=["Grow the volleyball community to 8 teams", "Run a youth clinic"], needs=["Content creation", "Refereeing"],
      bio="High school teacher who loves building programs and communities. Ask me about curriculum design, facilitation or public speaking.", role="mentor", orgs=["playr-academy", "outdoor-series"]),
    A(id="u-kwame", name="Kwame Asante", age=45, h=(6, 1), sport="Basketball", level="Advanced", position="Strength coach", prof="Strength & conditioning coach", emp="Ironworks Performance", hood="Etobicoke",
      art=A(skin="e", hair="bald", hair_color="black", jersey=BLACK, number="45", bg=4, beard=True, glasses=True), div="Playr League Academy · Performance",
      skills=["Conditioning", "Nutrition", "Recovery & mobility", "Mental game"], interests=["Powerlifting", "Chess", "Highlife music"],
      goals=["Build a community-wide warm-up standard", "Run a 12-week off-season program"], needs=["Stats & analytics", "Event organising"],
      bio="Strength coach growing a small training business. Happy to talk habits, mobility and how to build a client base.", role="mentor", orgs=["playr-academy"]),
    A(id="u-priya", name="Priya Raman", age=33, h=(5, 5), sport="Basketball", level="Advanced", position="Assistant coach", prof="Sports data analyst", emp="Northlake Analytics", hood="Liberty Village",
      art=A(skin="c", hair="long", hair_color="black", jersey=RED, number="12", bg=3, glasses=True), div="Sunday Indoor · Div A · Night Shift",
      skills=["Stats & analytics", "Video review", "Playmaking", "Career advice"], interests=["Data viz", "Bouldering", "True crime podcasts"],
      goals=["Publish community stats every week", "Mentor two women into analytics careers"], needs=["Photography", "Shooting form"],
      bio="Data analyst in the sports industry. Happy to help with reporting and dashboards, or with breaking into analytics.", role="mentor", orgs=["indoor-series", "playr-academy"]),
    A(id="u-lena", name="Lena Hoffmann", age=39, h=(5, 8), sport="Pickleball", level="Competitive", position="Coach", prof="Pickleball instructor", emp="Rally Courts", hood="The Beaches",
      art=A(skin="a", hair="bun", hair_color="blond", jersey=CREAM, number="3", bg=5, band=True), div="Outdoor Series · Pickleball",
      skills=["Footwork", "Coaching youth", "Defense", "Serving"], interests=["Surfing", "Sourdough", "Travel"],
      goals=["Get 100 people playing pickleball this summer"], needs=["Content creation", "Finding a team"],
      bio="Pickleball instructor turning a passion into a full-time business. Always up for talking about running a small business and finding venues.", role="mentor", orgs=["outdoor-series"]),
    A(id="u-tariq", name="Tariq Bello", age=24, h=(6, 4), sport="Basketball", level="Advanced", position="Center", prof="Software developer", emp="Northlake Systems", hood="Regent Park",
      art=A(skin="f", hair="fade", hair_color="black", jersey=BLACK, number="21", bg=2, glasses=True), div="Sunday Indoor · Div A · Night Shift",
      skills=["Rebounding", "Defense", "Stats & analytics", "Team leadership"], interests=["Gaming", "Anime", "Bouldering"],
      goals=["Make the Div A all-community team", "Learn to shoot threes"], needs=["Shooting form", "Ball handling"],
      bio="Software developer who likes helping non-technical friends with websites and tools. Looking for advice on going freelance.", role="founder", orgs=["indoor-series"]),
    A(id="u-jasmine", name="Jasmine Cho", age=22, h=(5, 6), sport="Volleyball", level="Intermediate", position="Setter", prof="Kinesiology grad student", emp="University of Toronto", hood="The Annex",
      art=A(skin="a", hair="bun", hair_color="black", jersey=RED, number="6", bg=0, smile=True), div="Outdoor Series · Volleyball",
      skills=["Playmaking", "Serving", "Stats & analytics"], interests=["K-drama", "Baking", "Yoga"],
      goals=["Get into a physiotherapy program", "Captain a rec team"], needs=["Conditioning", "Career advice", "Team leadership"],
      bio="Kinesiology grad student looking for career advice from anyone in health or sports medicine. Happy to help with research and writing.", role="founder", orgs=["outdoor-series"]),
    A(id="u-marcus", name="Marcus Lee", age=31, h=(5, 10), sport="Basketball", level="Intermediate", position="Guard", prof="Line cook", emp="Kensington Kitchen", hood="Kensington Market",
      art=A(skin="c", hair="short", hair_color="black", jersey=CREAM, number="8", bg=1, beard=True, smile=True), div="Sunday Indoor · Div B · Red Line",
      skills=["Ball handling", "Playmaking", "Defense"], interests=["Cooking", "Thrifting", "Hip-hop"],
      goals=["Hit 35% from three", "Cook for the community's season party"], needs=["Shooting form", "Nutrition", "Video review"],
      bio="Line cook and caterer building a food business. Always up to feed a crowd and trade tips on event catering.", role="founder", orgs=["indoor-series"]),
    A(id="u-aaliyah", name="Aaliyah Grant", age=26, h=(5, 8), sport="Basketball", level="Intermediate", position="Forward", prof="Photographer & videographer", emp="Freelance", hood="Parkdale",
      art=A(skin="e", hair="braids", hair_color="black", jersey=BLACK, number="15", bg=3, smile=True), div="Wednesday Indoor · Div B · Mid Range",
      skills=["Photography", "Content creation", "Rebounding", "Video review"], interests=["Film cameras", "Fashion", "Roller skating"],
      goals=["Shoot the season highlight reel", "Play in the After Hours showcase"], needs=["Shooting form", "Finding a team"],
      bio="Photographer and videographer. Ask me about content for your brand, or how to price freelance creative work.", role="founder", orgs=["indoor-series", "after-hours"]),
    A(id="u-ben", name="Ben Kowalski", age=35, h=(6, 0), sport="Basketball", level="Beginner", position="Forward", prof="Accountant", emp="Kowalski & Reid", hood="North York",
      art=A(skin="a", hair="short", hair_color="brown", jersey=RED, number="35", bg=4, glasses=True, smile=True), div="Sunday Indoor · Div C · Free Agents",
      skills=["Stats & analytics", "Event organising"], interests=["Craft beer", "Dad jokes"],
      goals=["Lose 15 lb this season", "Play every Sunday"], needs=["Conditioning", "Ball handling", "Nutrition"],
      bio="Accountant who helps small businesses and freelancers get their books in order. Always glad to answer a tax question.", role="founder", orgs=["indoor-series"]),
    A(id="u-noor", name="Noor Haddad", age=29, h=(5, 4), sport="Volleyball", level="Advanced", position="Libero", prof="Registered nurse", emp="St. Joseph's Health", hood="Danforth",
      art=A(skin="b", hair="long", hair_color="black", jersey=CREAM, number="2", bg=5, smile=True), div="Outdoor Series · Volleyball",
      skills=["Defense", "Recovery & mobility", "Team leadership", "First aid"], interests=["Hiking", "Baking", "Podcasts"],
      goals=["Coach a youth team", "Play in a national tournament"], needs=["Career advice", "Mental game"],
      bio="Night-shift nurse exploring a move into health education. First aid certified and happy to share what I know.", role="founder", orgs=["outdoor-series"]),
    A(id="u-isabela", name="Isabela Reyes", age=21, h=(5, 9), sport="Basketball", level="Competitive", position="Guard", prof="Design student", emp="OCAD University", hood="Little Portugal",
      art=A(skin="b", hair="curly", hair_color="brown", jersey=RED, number="10", bg=0, smile=True), div="Sunday Indoor · Div A · Night Shift",
      skills=["Shooting", "Ball handling", "Content creation", "Playmaking"], interests=["Illustration", "Streetwear", "Skateboarding"],
      goals=["Play university ball", "Design the community merch"], needs=["Video review", "Mental game", "Career advice"],
      bio="Design student building a freelance branding portfolio. Looking for mentors and first clients.", role="founder", orgs=["indoor-series"]),
    A(id="u-seun", name="Oluwaseun Adeyemi", age=28, h=(6, 2), sport="Basketball", level="Advanced", position="Forward", prof="Personal trainer", emp="Adeyemi Athletics", hood="Scarborough",
      art=A(skin="f", hair="fade", hair_color="black", jersey=BLACK, number="23", bg=2, beard=True, smile=True), div="Sunday Indoor · Div A · Night Shift",
      skills=["Conditioning", "Nutrition", "Rebounding", "Defense"], interests=["Fitness challenges", "Afrobeats", "Sneakers"],
      goals=["Grow my training business", "Land my first ten online clients"], needs=["Photography", "Content creation"],
      bio="Personal trainer building a business around online coaching. I'll help you get fit if you help me with content.", role="founder", orgs=["indoor-series", "playr-academy"]),
    A(id="u-hannah", name="Hannah Li", age=37, h=(5, 5), sport="Pickleball", level="Intermediate", position="Doubles", prof="Product manager", emp="Brightside Health", hood="Yorkville",
      art=A(skin="a", hair="bun", hair_color="black", jersey=CREAM, number="17", bg=5, glasses=True, smile=True), div="Outdoor Series · Pickleball",
      skills=["Event organising", "Team leadership", "Stats & analytics"], interests=["Running club", "Ceramics", "Travel"],
      goals=["Win a mixed doubles ladder", "Organise a corporate tournament"], needs=["Footwork", "Serving", "Finding a team"],
      bio="Product manager who loves turning messy ideas into roadmaps. Looking for people to swap career advice with.", role="founder", orgs=["outdoor-series"]),
    A(id="u-rafael", name="Rafael Costa", age=30, h=(5, 11), sport="Futsal", level="Advanced", position="Pivot", prof="Barber", emp="Costa Cuts", hood="Little Italy",
      art=A(skin="c", hair="curly", hair_color="black", jersey=RED, number="11", bg=1, beard=True, smile=True), div="Outdoor Series · Futsal",
      skills=["Playmaking", "Footwork", "Ball handling", "Event organising"], interests=["Fashion", "Cooking"],
      goals=["Start a weekly futsal night", "Referee certified"], needs=["Refereeing", "Photography", "Content creation"],
      bio="Barber building a second shop. Looking for advice on hiring, leasing and marketing for a local business.", role="founder", orgs=["outdoor-series"]),
    A(id="u-amara", name="Amara Nwosu", age=25, h=(5, 10), sport="Basketball", level="Intermediate", position="Wing", prof="Marketing coordinator", emp="Sundial Media", hood="West Queen West",
      art=A(skin="e", hair="afro", hair_color="black", jersey=BLACK, number="5", bg=4, smile=True), div="Wednesday Indoor · Div B · Mid Range",
      skills=["Content creation", "Event organising", "Shooting"], interests=["Social media", "Concerts", "Pilates"],
      goals=["Run social for the community", "Hit 40% from three"], needs=["Defense", "Conditioning", "Video review"],
      bio="Marketing coordinator who helps small brands show up online. Looking for grant-writing and non-profit experience.", role="founder", orgs=["indoor-series", "after-hours"]),
    A(id="u-jonah", name="Jonah Friedman", age=42, h=(5, 9), sport="Basketball", level="Beginner", position="Forward", prof="Paramedic", emp="Toronto Paramedic Services", hood="Midtown",
      art=A(skin="a", hair="short", hair_color="grey", jersey=RED, number="42", bg=4, beard=True, smile=True), div="Sunday Indoor · Div C · Free Agents",
      skills=["First aid", "Recovery & mobility", "Team leadership"], interests=["Cycling", "Jazz", "Cooking for a crowd"],
      goals=["Keep up with the 25-year-olds", "Learn a real layup"], needs=["Shooting form", "Ball handling", "Conditioning"],
      bio="Paramedic and first aid instructor. Happy to run a safety session for your team or event.", role="founder", orgs=["indoor-series"]),
    A(id="u-keisha", name="Keisha Brown", age=32, h=(5, 7), sport="Volleyball", level="Intermediate", position="Outside hitter", prof="Elementary teacher", emp="Riverdale Public School", hood="Riverdale",
      art=A(skin="e", hair="locs", hair_color="black", jersey=CREAM, number="14", bg=2, smile=True), div="Outdoor Series · Volleyball",
      skills=["Coaching youth", "Team leadership", "Serving"], interests=["Poetry", "Camping", "Board games"],
      goals=["Start a youth clinic", "Run a school tournament"], needs=["Event organising", "Recovery & mobility"],
      bio="Elementary teacher who wants to start a community programme for kids in the neighbourhood. Looking for funding know-how.", role="founder", orgs=["outdoor-series", "playr-academy"]),
    A(id="u-mateus", name="Mateus Oliveira", age=27, h=(6, 0), sport="Basketball", level="Advanced", position="Guard", prof="Electrician", emp="Oliveira Electric", hood="Junction",
      art=A(skin="b", hair="short", hair_color="black", jersey=BLACK, number="3", bg=1, beard=True), div="Wednesday Indoor · Div A · Mid Range",
      skills=["Playmaking", "Ball handling", "Defense", "Shooting"], interests=["Motorbikes", "Home renovation"],
      goals=["Make Division A all-community", "Get referee certified"], needs=["Video review", "Refereeing", "Stats & analytics"],
      bio="Licensed electrician growing a contracting business. Always happy to talk trades, quoting and hiring apprentices.", role="founder", orgs=["indoor-series"]),
    A(id="u-yuki", name="Yuki Tanaka", age=23, h=(5, 3), sport="Basketball", level="Beginner", position="Guard", prof="Barista & DJ", emp="Third Wave Coffee", hood="Chinatown",
      art=A(skin="a", hair="short", hair_color="black", jersey=RED, number="0", bg=0, band=True, smile=True), div="Sunday Indoor · Div C · Free Agents",
      skills=["Content creation", "Event organising"], interests=["Vinyl DJing", "Coffee", "Ramen crawls"],
      goals=["DJ the After Hours showcase", "Make my first layup in a game"], needs=["Ball handling", "Shooting form", "Finding a team"],
      bio="Barista and DJ working toward full-time music. Looking for booking advice and a bit of business coaching.", role="founder", orgs=["indoor-series", "after-hours"]),
    A(id="u-grace", name="Grace Mensah", age=34, h=(5, 9), sport="Basketball", level="Intermediate", position="Forward", prof="Employment lawyer", emp="Mensah Law", hood="Financial District",
      art=A(skin="f", hair="afro", hair_color="black", jersey=RED, number="24", bg=3, glasses=True, smile=True), div="Wednesday Indoor · Div B · Mid Range",
      skills=["Career advice", "Team leadership", "Rebounding"], interests=["Book club", "Theatre", "Spin class"],
      goals=["Play twice a week", "Mentor young women in law"], needs=["Conditioning", "Recovery & mobility"],
      bio="Employment lawyer. Happy to give career or contract advice to any member.", role="founder", orgs=["indoor-series"]),
    A(id="u-ravi", name="Ravi Malhotra", age=29, h=(5, 11), sport="Basketball", level="Intermediate", position="Guard", prof="Data analyst", emp="Cascade Retail", hood="Thorncliffe",
      art=A(skin="c", hair="short", hair_color="black", jersey=CREAM, number="7", bg=5, glasses=True), div="Sunday Indoor · Div B · Red Line",
      skills=["Stats & analytics", "Shooting", "Video review"], interests=["Cricket", "Tech meetups", "Street food"],
      goals=["Build a shot-chart tool for the community", "Present at the Community Summit"], needs=["Product management", "Career coaching", "Business strategy"],
      bio="Data analyst who loves building small tools. Looking for a product mentor and feedback on a side project.", role="founder", orgs=["indoor-series"]),
    A(id="u-elena", name="Elena Petrova", age=40, h=(5, 6), sport="Pickleball", level="Advanced", position="Doubles", prof="Registered dietitian", emp="Ironhouse Nutrition", hood="High Park",
      art=A(skin="a", hair="long", hair_color="blond", jersey=CREAM, number="16", bg=5, smile=True), div="Outdoor Series · Pickleball",
      skills=["Nutrition", "Footwork", "Mental game"], interests=["Ballet", "Fermenting", "Hiking"],
      goals=["Run a nutrition Q&A each month", "Win a mixed doubles ladder"], needs=["Content creation", "Event organising"],
      bio="Registered dietitian with a growing private practice. Ask me anything about nutrition and starting a health business.", role="founder", orgs=["outdoor-series", "ironhouse-fuel"]),
    A(id="u-chris", name="Chris Beaumont", age=20, h=(6, 6), sport="Basketball", level="Competitive", position="Center", prof="University student", emp="Seneca College", hood="Rexdale",
      art=A(skin="e", hair="fade", hair_color="black", jersey=RED, number="32", bg=1, smile=True), div="Sunday Indoor · Div A · Night Shift",
      skills=["Rebounding", "Defense", "Shooting"], interests=["Streaming", "Sneakers", "Mixtapes"],
      goals=["Get recruited to a university team", "Get to 220 lb of muscle"], needs=["Career advice", "Nutrition", "Video review"],
      bio="Student looking for a first internship. Keen to learn from anyone in business, tech or health.", role="founder", orgs=["indoor-series"]),
    A(id="u-zainab", name="Zainab Ali", age=28, h=(5, 8), sport="Basketball", level="Intermediate", position="Guard", prof="Architect", emp="Studio Ali", hood="Distillery District",
      art=A(skin="c", hair="long", hair_color="black", jersey=BLACK, number="13", bg=3, smile=True), div="Wednesday Indoor · Div B · Mid Range",
      skills=["Playmaking", "Event organising", "Photography"], interests=["Architecture walks", "Coffee", "Film"],
      goals=["Design a new court mural", "Play in the season finale"], needs=["Shooting form", "Defense", "Mental game"],
      bio="Architect who also designs murals and events. A community art project starts this winter and I'd love collaborators.", role="founder", orgs=["indoor-series", "after-hours"]),
    A(id="u-camille", name="Camille Roy", age=30, h=(5, 7), sport="Volleyball", level="Intermediate", position="Middle blocker", prof="Pilates instructor", emp="Core Collective Studio", hood="Queen West",
      art=A(skin="a", hair="bun", hair_color="brown", jersey=CREAM, number="19", bg=5, smile=True), div="Outdoor Series · Volleyball",
      skills=["Pilates instruction", "Client coaching", "Small business operations", "Social media"], interests=["Ceramics", "Sunday markets", "Cycling"],
      goals=["Open a second studio location", "Run a wellness retreat"], needs=["Marketing", "Accounting & bookkeeping", "Web development"],
      bio="Reformer and mat Pilates instructor. Members get a discount on classes, and I love trading skills.", role="founder", orgs=["outdoor-series"]),
    A(id="u-devi", name="Devi Nair", age=26, h=(5, 5), sport="Basketball", level="Beginner", position="Guard", prof="Retail store manager", emp="Northgate Outfitters", hood="Bloor West",
      art=A(skin="c", hair="long", hair_color="black", jersey=BLACK, number="22", bg=2, smile=True), div="Wednesday Indoor · Div C · Free Agents",
      skills=["Retail operations", "Hiring", "Leadership", "Customer service"], interests=["Thrifting", "Baking", "Podcasts"],
      goals=["Become a district manager", "Start an online shop"], needs=["Business strategy", "Web development", "Career coaching"],
      bio="I run a store by day. I can share my staff discount and I'm always up for talking hiring and retail.", role="founder", orgs=["indoor-series"]),
    A(id="u-admin-me", name="Fife Ashley-Dejo", age=34, h=(6, 1), sport="Basketball", level="Advanced", position="Commissioner", prof="Community Lead", emp="The Playr League", hood="Toronto",
      art=A(skin="d", hair="short", hair_color="black", jersey=RED, number="00", bg=0, beard=True, smile=True), div="League office",
      skills=["Event organising", "Team leadership", "Refereeing"], interests=["Coffee", "Live music"],
      goals=["Fill every division", "Open a second venue"], needs=["Photography", "Content creation", "Refereeing"],
      bio="I run The Playr League. Message me for anything, from schedule changes to new ideas.", role="admin", orgs=["indoor-series", "after-hours", "playr-academy", "outdoor-series"], mtype="partner"),
]


# Professional side of each profile: skills, career goals and support needed are work-related (sport stays in position/level/division).
PRO = {
    "u-founder-me": (["Healthcare & rehab", "Public speaking", "Leadership", "Clinic operations"], ["Open my own physio clinic", "Become a clinical director", "Speak at a sports medicine conference"], ["Business strategy", "Accounting & bookkeeping", "Branding", "Legal advice"]),
    "u-dre": (["Coaching", "Public speaking", "Mentorship", "Networking"], ["Grow Whitfield Hoops into a full academy", "Land corporate coaching workshops"], ["Marketing", "Video production", "Sponsorship", "Accounting & bookkeeping"]),
    "u-sofia": (["Curriculum design", "Public speaking", "Mentorship", "Leadership"], ["Move into a vice-principal role", "Launch a youth sports non-profit"], ["Grant writing", "Legal advice", "Social media"]),
    "u-kwame": (["Business strategy", "Mentorship", "Public speaking", "Program design"], ["Open a second performance gym", "Sign corporate wellness contracts"], ["Marketing", "Sales", "Hiring", "Accounting & bookkeeping"]),
    "u-priya": (["Data analysis", "Career coaching", "Interview prep", "Grant writing"], ["Become head of analytics", "Start a sports-analytics consultancy"], ["Sales", "Branding", "Fundraising"]),
    "u-lena": (["Small business operations", "Coaching", "Event production"], ["Grow my coaching business to full time", "Partner with a venue operator"], ["Marketing", "Social media", "Web development", "Sponsorship"]),
    "u-tariq": (["Web development", "Data analysis", "Product management"], ["Get promoted to senior engineer", "Launch a side-project app"], ["Career coaching", "Business strategy", "Fundraising", "Public speaking"]),
    "u-jasmine": (["Research", "Data analysis", "Public speaking"], ["Land a physiotherapy residency", "Publish my first paper"], ["Career coaching", "Networking", "Interview prep", "Mentorship"]),
    "u-marcus": (["Culinary", "Event production", "Small business operations"], ["Open my own restaurant", "Become a head chef"], ["Fundraising", "Accounting & bookkeeping", "Legal advice", "Branding"]),
    "u-aaliyah": (["Photography", "Video production", "Branding", "Social media"], ["Grow my freelance studio to 10 retainers", "Land a brand campaign"], ["Accounting & bookkeeping", "Legal advice", "Sales", "Business strategy"]),
    "u-ben": (["Accounting & bookkeeping", "Tax planning", "Business strategy"], ["Make partner at my firm", "Build a small-business advisory practice"], ["Marketing", "Sales", "Public speaking", "Networking"]),
    "u-noor": (["Healthcare & rehab", "Leadership", "Mentorship"], ["Become a nurse practitioner", "Move into nursing leadership"], ["Career coaching", "Interview prep", "Networking", "Mentorship"]),
    "u-isabela": (["Branding", "UX design", "Social media", "Video production"], ["Land a design internship", "Launch a merch line"], ["Career coaching", "Interview prep", "Business strategy", "Sales"]),
    "u-seun": (["Sales", "Small business operations", "Client coaching"], ["Open my own training studio", "Reach $250k in revenue"], ["Marketing", "Photography", "Accounting & bookkeeping", "Web development"]),
    "u-hannah": (["Product management", "Business strategy", "Fundraising", "Hiring"], ["Become a director of product", "Start an advisory practice"], ["Public speaking", "Networking", "Career coaching"]),
    "u-rafael": (["Small business operations", "Sales", "Event production"], ["Open a second barbershop", "Launch a grooming product line"], ["Accounting & bookkeeping", "Legal advice", "Marketing", "Photography"]),
    "u-amara": (["Marketing", "Social media", "Event production", "Branding"], ["Become a marketing manager", "Build a freelance side business"], ["Career coaching", "Negotiation", "Public speaking", "Data analysis"]),
    "u-jonah": (["Emergency medicine", "First aid training", "Leadership"], ["Move into a supervisor role", "Start a first-aid training business"], ["Business strategy", "Marketing", "Legal advice", "Accounting & bookkeeping"]),
    "u-keisha": (["Curriculum design", "Program design", "Leadership"], ["Become a school principal", "Launch a youth sports non-profit"], ["Grant writing", "Fundraising", "Legal advice", "Networking"]),
    "u-mateus": (["Skilled trades", "Project management", "Small business operations"], ["Get my master electrician licence", "Start my own contracting company"], ["Accounting & bookkeeping", "Legal advice", "Marketing", "Hiring"]),
    "u-yuki": (["Music production", "Event production", "Social media"], ["Get booked at three festivals", "Turn DJing into a full-time income"], ["Business strategy", "Legal advice", "Branding", "Accounting & bookkeeping"]),
    "u-grace": (["Legal advice", "Negotiation", "Contracts", "Mentorship", "Interview prep", "Networking"], ["Make partner", "Build a mentorship program for young lawyers"], ["Business strategy", "Marketing", "Public speaking"]),
    "u-ravi": (["Data analysis", "Web development", "Product management"], ["Move into a data science role", "Turn my shot-chart tool into a product"], ["Fundraising", "Business strategy", "Career coaching", "Marketing"]),
    "u-elena": (["Nutrition coaching", "Public speaking", "Client coaching"], ["Publish a meal-planning book", "Expand my clinic practice"], ["Marketing", "Video production", "Web development", "Branding"]),
    "u-chris": (["Leadership", "Public speaking"], ["Land a summer internship", "Get into a business degree"], ["Career coaching", "Interview prep", "Networking", "Mentorship"]),
    "u-zainab": (["Architecture", "Project management", "Branding", "Photography"], ["Get my architect licence", "Win a public mural commission"], ["Grant writing", "Business strategy", "Legal advice", "Sales"]),
    "u-admin-me": (["Event production", "Sponsorship", "Leadership", "Small business operations"], ["Secure title sponsors", "Open a second venue"], ["Fundraising", "Legal advice", "Marketing", "Video production"]),
}
for _m in M:
    if _m["id"] in PRO:
        _m["skills"], _m["goals"], _m["needs"] = PRO[_m["id"]]


def _contact(name: str, uid: str, real_email=None) -> Dict[str, Any]:
    parts = name.lower().replace("'", "").split()
    n = sum(ord(c) for c in uid) % 90 + 10
    handle = "".join(parts)
    out = {"email": real_email or f"{parts[0]}@playr.example", "phone": f"+1 416 555 01{n:02d}", "linkedin": f"https://linkedin.com/in/{'-'.join(parts)}", "instagram": f"@{handle}"}
    if n % 3 == 0:
        out["website"] = f"https://{handle}.example.com"
    return out


def _member_doc(m: Dict[str, Any], pw_hash: str) -> Dict[str, Any]:
    email_map = {"u-founder-me": "demo@yourcommunity.app", "u-admin-me": "admin@yourcommunity.app"}
    first = m["name"].split()[0].lower()
    doc = {
        "id": m["id"], "name": m["name"], "email": email_map.get(m["id"], f"{first}.{m['id'][2:]}@playr.example"), "password_hash": pw_hash if m["id"] in email_map else None,
        "settings": {"notifications": {"sms": sum(map(ord, m["id"])) % 3 != 0}},
        "role": m["role"], "member_type": m.get("mtype") or ("mentor" if m["role"] == "mentor" else "founder"),
        "age": m["age"], "height": ht(*m["h"]), "avatar_url": None,
        "title": m["prof"], "company": m["emp"], "location": f"{m['hood']}, Toronto", "bio": m["bio"],
        "industry": None, "stage": None, "position": None, "cohort": None,
        "skill_set": m["skills"], "expertise": m["skills"], "interests_hobbies": m["interests"], "interests": m["interests"],
        "goals": m["goals"], "support_needs": m["needs"], "needs_seeking": m["needs"],
        "open_to": ["Introductions", "Feedback on my work"] if m["role"] != "mentor" else ["1:1 mentoring chats", "Portfolio reviews"],
        "contact": _contact(m["name"], m["id"], email_map.get(m["id"])),
        "contact_visibility": "members",
        "preferred_contact": "in-app messages",
        "created_at": iso(-60), "updated_at": iso(-2),
        "memberships_space_slugs": m["orgs"], "active_space_slug": None,
        "header_stats": [{"value": str(m["age"]), "label": "age"}, {"value": ht(*m["h"]).split(" · ")[0], "label": "height"}, {"value": m["level"], "label": "level", "accent": True}],
    }
    if m["id"] == "u-founder-me":
        doc.update(is_demo_me_for_role="founder", phone="+1 416 555 0142", hats=["founder"], active_hat="founder")
    if m["id"] == "u-admin-me":
        doc.update(is_demo_me_for_role="admin", hidden_from_directory=False)
    return doc


# --------------------------------------------------------------------------------------------- membership requests
def _applicants(pw: str) -> List[Dict[str, Any]]:
    """People who asked to join and are waiting for (or were given) a decision. Hidden from the directory until approved."""
    rows = [
        ("u-app-1", "Nadia Rahman", "Occupational therapist", "Riverside Rehab", "pending", -1, dict(skin="c", hair="long", hair_color="black", bg=1, smile=True),
         "I run a small rehab practice and want to meet other health and wellness professionals, and find referral partners.", ["Healthcare & rehab", "Client care"]),
        ("u-app-2", "Owen Blake", "Founder", "Blake Coffee Roasters", "pending", -1, dict(skin="a", hair="short", hair_color="brown", bg=2, beard=True, smile=True),
         "Growing a specialty coffee business. Looking for marketers, accountants and other founders to learn from.", ["Small business operations", "Sales"]),
        ("u-app-3", "Fatima Yusuf", "HR manager", "Northgate Logistics", "pending", -2, dict(skin="d", hair="bun", hair_color="black", bg=0, glasses=True, smile=True),
         "A friend at the Playr League invited me. I'd like to offer hiring and HR advice and meet people outside my industry.", ["Hiring", "Leadership"]),
        ("u-app-4", "Marcus Bell", "Freelance videographer", "", "pending", -3, dict(skin="e", hair="fade", hair_color="black", bg=3, smile=True),
         "Attended the September mixer as a guest. Would love to join properly and connect with brands who need video.", ["Video production", "Photography"]),
        ("u-app-5", "Chloe Martin", "Financial planner", "Harbour Advisory", "pending", -4, dict(skin="a", hair="long", hair_color="blond", bg=5, smile=True),
         "I can help members with budgeting and planning as a community perk, and I want to grow my network.", ["Accounting & bookkeeping", "Public speaking"]),
        ("u-app-6", "Sam Torres", "Sales rep", "Unknown Co.", "rejected", -9, dict(skin="b", hair="short", hair_color="black", bg=4),
         "Looking for leads to sell to.", ["Sales"]),
    ]
    out = []
    for uid, name, title, company, st, days, art, why, skills in rows:
        first = name.split()[0].lower()
        out.append({"id": uid, "name": name, "email": f"{first}.{uid[2:]}@example.com", "password_hash": pw, "role": "member", "member_type": "founder",
                    "title": title, "company": company, "location": "Toronto", "bio": why, "join_reason": why, "avatar_url": None,
                    "skill_set": skills, "expertise": skills, "membership_status": st, "hidden_from_directory": True, "signup_source": "self",
                    "created_at": iso(days), "updated_at": iso(days),
                    **({"membership_decided_at": iso(-8), "membership_decided_by": "u-admin-me", "membership_decided_by_name": "Fife Ashley-Dejo",
                        "membership_note": "Promotional sign-up, not a fit for the community."} if st == "rejected" else {})})
    return out


# --------------------------------------------------------------------------------------------- events
def _events(name: Dict[str, str]) -> List[Dict[str, Any]]:
    TIERS = {
        3: [
            {"id": "t3-early", "name": "Early bird", "price_cents": 1500, "capacity": 40, "sold": 0},
            {"id": "t3-ga", "name": "General admission", "price_cents": 2500, "capacity": None, "sold": 0},
            {"id": "t3-vip", "name": "VIP · front row + meet the DJ", "price_cents": 6000, "capacity": 10, "sold": 0},
        ],
    }

    def ev(i, title, desc, days, at, dur, host, host_id, loc, cat, cap, tags, kind, space, going, agenda=None, prep=None, virtual=False, roles=("founder",)):
        return {"id": f"evt-{i}", "title": title, "description": desc, "host": host, "host_id": host_id, "starts_at": iso(days, at=at),
                "ends_at": (datetime.fromisoformat(iso(days, at=at)) + timedelta(hours=dur)).isoformat(), "location": loc, "is_virtual": virtual,
                "cover_url": poster(kind), "source": "luma" if i % 2 else "native", "category": cat, "capacity": cap, "attendee_ids": list(going),
                "recommended_for_roles": list(roles), "post_resource_ids": [], "tags": tags, "rsvps": {u: "yes" for u in going},
                "agenda": agenda or ["Doors and welcome (15 min)", "Main session", "Open networking"], "prep": prep or "Bring a notebook and business cards.",
                "space_slug": space, "status": "approved", "created_at": iso(-20), "currency": "cad",
                "price_cents": {2: 4000}.get(i), "ticket_tiers": TIERS.get(i, [])}
    ME = "u-founder-me"
    pool = [m["id"] for m in M]
    ev_list = [
        ev(1, "Community Mixer · September", "Our monthly mixer at The New Arena: three short member talks, then open networking. Bring business cards and an open mind.", 2, 19, 3, "Fife Ashley-Dejo", "u-admin-me", "The New Arena · Main hall", "Networking", 80,
           ["networking", "community", "introductions"], "indoor", "indoor-series", pool[:14] + [ME], agenda=["Doors and welcome (18:30)", "Three member talks", "Open networking", "Close and follow-ups"]),
        ev(2, "Business Growth Workshop with Dre", "A small-group working session on positioning, pricing and finding your first ten clients. Bring your numbers.", 5, 18, 2, "Dre Whitfield", "u-dre", "Playr League Workshops studio", "Workshop", 16,
           ["business strategy", "sales", "marketing"], "clinic", "playr-academy", ["u-tariq", "u-marcus", "u-jonah", "u-yuki"], prep="Bring a laptop and one page describing your business."),
        ev(3, "After Hours · Friday Social", "Live music, food trucks and easy conversation. Photographers and creators welcome.", 8, 21, 3, "Fife Ashley-Dejo", "u-admin-me", "The New Arena · Lounge", "Social", 300,
           ["social", "photography", "music"], "show", "after-hours", pool[3:16], agenda=["Doors 20:30", "Welcome", "Live set", "Open floor"]),
        ev(4, "Women's and non-binary networking brunch", "A relaxed, no-pressure brunch to meet other members, swap advice and build your circle. All career stages.", 6, 11, 2, "Fife Ashley-Dejo", ME, "Leslieville · Brunch room", "Networking", 30,
           ["networking", "mentorship", "leadership"], "social", "indoor-series", [ME, "u-isabela", "u-aaliyah", "u-amara", "u-yuki", "u-grace"], roles=("founder", "mentor")),
        ev(5, "Public speaking workshop", "Structure a talk, manage nerves and land your key message. Coach Sofia leads practice rounds with feedback.", 10, 18, 2, "Sofia Marchetti", "u-sofia", "Playr League Workshops studio", "Workshop", 24,
           ["public speaking", "leadership", "communication"], "clinic", "playr-academy", ["u-jasmine", "u-noor", "u-keisha"]),
        ev(6, "Recovery & mobility workshop", "Fifty minutes with Kwame and Maya on desk-job posture, warming up and staying injury-free. Live on Zoom.", 12, 19, 1, "Kwame Asante", "u-kwame", "Virtual · Zoom", "Wellness", 100,
           ["recovery", "mobility", "wellness"], "clinic", "playr-academy", [ME, "u-ben", "u-jonah", "u-grace"], virtual=True),
        ev(7, "First aid & CPR certification night", "Learn the essentials with a working paramedic. Certificates issued on the night.", 14, 18, 3, "Jonah Friedman", "u-jonah", "The New Arena · Meeting room", "Workshop", 20,
           ["first aid", "safety", "certification"], "clinic", "playr-academy", ["u-mateus", "u-rafael"]),
        ev(8, "Walk & talk in the park", "A slow-paced group walk with conversation starters and coffee after. Great for meeting people one-to-one.", 9, 9, 2, "Lena Hoffmann", "u-lena", "Sunnyside Park", "Wellness", 32,
           ["wellness", "networking", "outdoors"], "outdoor", "outdoor-series", ["u-hannah", "u-elena", "u-lena"], prep="Comfortable shoes and a water bottle."),
        ev(9, "Community social and portrait night", "Free professional portraits, a photo wall and a slideshow of the season so far.", 18, 19, 3, "Aaliyah Grant", "u-aaliyah", "The New Arena · Lounge", "Social", 120,
           ["photography", "social", "content creation"], "social", "after-hours", pool[:10]),
        ev(10, "Annual Community Summit", "Two days of keynotes, workshops and a member marketplace. Prizes for the best member pitches.", 30, 10, 8, "Fife Ashley-Dejo", "u-admin-me", "The New Arena", "Summit", 240,
           ["summit", "networking", "keynotes"], "indoor", "indoor-series", pool[:8]),
        ev(14, "Career night: people who made the jump", "Five members share how they changed roles, started businesses or got promoted. Mentor speed-rounds after.", 16, 18, 3, "Hannah Li", "u-hannah", "The New Arena · Lounge", "Networking", 80,
           ["career coaching", "networking", "public speaking", "mentorship"], "social", "after-hours", pool[2:12], agenda=["Panel (45 min)", "Mentor speed-rounds", "Open networking"]),
        ev(15, "Small business clinic: pricing, legal and books", "Ben, Grace and Kwame answer your questions about starting or growing a side business. Bring your numbers.", 22, 19, 2, "Ben Kowalski", "u-ben", "Virtual · Zoom", "Workshop", 60,
           ["business strategy", "legal advice", "accounting & bookkeeping", "sales"], "clinic", "playr-academy", ["u-marcus", "u-rafael", "u-seun"], virtual=True),
        ev(11, "Summit registration closes", "Last day to register for the Annual Community Summit.", 20, 23, 1, "The Playr League", "u-admin-me", "Online", "Deadline", None,
           ["summit", "registration"], "indoor", "indoor-series", [], virtual=True),
        ev(12, "Community Mixer · August", "Last month's mixer. Photos and speaker notes are in the News tab.", -5, 19, 3, "Fife Ashley-Dejo", "u-admin-me", "The New Arena · Main hall", "Networking", 80,
           ["networking"], "indoor", "indoor-series", pool[:12] + [ME]),
        ev(13, "Members' welcome breakfast", "A relaxed breakfast for new members: meet the team, meet each other, ask anything.", -12, 9, 2, "Dre Whitfield", "u-dre", "Playr League Workshops studio", "Networking", 40,
           ["welcome", "networking"], "clinic", "playr-academy", pool[:10]),
    ]
    ev_list.append({"id": "evt-pending-1", "title": "Saturday coffee meetup", "description": "Casual coffee for members in the east end. Bring a friend.", "starts_at": iso(9, at=10),
                    "ends_at": iso(9, at=12), "location": "Leslieville café", "host": "Marcus Lee", "category": "Networking", "tags": ["networking", "coffee"], "source": "community",
                    "attendee_ids": [], "rsvps": {}, "status": "pending", "submitted_by": "u-marcus", "submitted_by_name": "Marcus Lee", "created_at": iso(-1),
                    "cover_url": poster("outdoor"), "space_slug": "outdoor-series"})
    return ev_list


# --------------------------------------------------------------------------------------------- playbook
def _resources() -> List[Dict[str, Any]]:
    """Community perks: discounts, free access, know-how and intros that members share with each other."""
    by = {m["id"]: m for m in M}

    def r(i, uid, title, desc, cat, perk, claim, tags, feat=False, cta="Claim this", typ="perk", saved=(), status="approved"):
        u = by[uid]
        slug = title.lower().replace(" ", "-").replace(":", "").replace("&", "and").replace("'", "").replace("(", "").replace(")", "").replace(",", "").replace("$", "")[:48]
        url = f"https://example.com/perks/{slug}"
        return {"id": f"res-{i}", "title": title, "description": desc, "source": "community", "type": typ, "category": cat, "format": "Perk" if typ == "perk" else "Guide",
                "author": u["name"], "shared_by": {"id": uid, "name": u["name"], "avatar_url": None, "title": u["prof"]}, "perk_value": perk, "how_to_claim": claim,
                "duration_min": None, "cover_url": {1: poster("outdoor"), 8: poster("social"), 12: poster("clinic")}.get(i), "tags": tags, "is_featured": feat, "saved_by": list(saved), "published_at": iso(-i * 2), "url": url, "slug": slug, "external_url": url,
                "cta_label": cta, "difficulty": None, "lesson_count": None, "format_summary": perk or cat, "learning_outcomes": [], "prerequisites": [], "last_updated": iso(-i),
                "space_slug": "indoor-series", "status": status, "submitted_by": uid if status == "pending" else None, "submitted_by_name": u["name"] if status == "pending" else None}
    ME = "u-founder-me"
    return [
        r(1, "u-camille", "20% off Reformer and mat Pilates classes", "Drop-in and class packs at Core Collective Studio on Queen West. First class is a beginner-friendly intro.", "Discount", "20% off",
          "Show your Playr League profile at the front desk, or message Camille to book.", ["pilates", "wellness", "classes", "discount"], True, "Book a class"),
        r(2, "u-devi", "30% staff discount at Northgate Outfitters", "I can add you to my staff-discount list: outerwear, footwear and gear. Works in store and online.", "Discount", "30% off",
          "Message Devi your name and email. Codes are valid for 12 months.", ["retail", "gear", "discount", "clothing"], True),
        r(3, "u-tariq", "The AI tools I actually use every day", "My honest stack for coding, writing and meeting notes: what each tool is good at, what it costs and what I stopped using.", "Insight", None,
          "Open the guide. Questions? Say hi in the comments or on my profile.", ["ai", "productivity", "web development", "tools"], True, "Read the guide", "guide", [ME]),
        r(4, "u-ben", "Free 30-minute tax and bookkeeping consult", "Sole proprietors, freelancers and side businesses: bring your questions on HST, expenses and setting up your books.", "Free access", "Free 30 min",
          "Message Ben with your business type and two dates that work.", ["accounting & bookkeeping", "tax planning", "small business", "freelance"], True, "Book a consult"),
        r(5, "u-grace", "Free contract review (up to 5 pages)", "Leases, freelance agreements and client contracts. I'll flag the clauses to push back on. Not formal legal advice.", "Free access", "Free review",
          "Send the PDF through the message button, with a note on what worries you.", ["legal advice", "contracts", "negotiation"], True, "Send a contract"),
        r(6, "u-aaliyah", "Free professional headshot (10 spots a month)", "A 20-minute session in natural light, two retouched photos delivered in a week. Great for LinkedIn and portfolios.", "Free access", "Free headshot",
          "Reply to this perk with your preferred weekend. Spots go quickly.", ["photography", "branding", "linkedin", "career coaching"], False, "Book a slot"),
        r(7, "u-ravi", "AI for spreadsheets: my five-tool stack", "How I clean data, write formulas and build dashboards in half the time with AI. Includes prompts you can copy.", "Insight", None,
          "Open the guide.", ["ai", "data analysis", "productivity", "spreadsheets"], False, "Read the guide", "guide"),
        r(8, "u-isabela", "Logo and brand kit at a student rate", "Logo, colours and type for a side project or small business. Flat $150, two revisions, delivered in a week.", "Discount", "$150 flat",
          "Send a short brief and an example brand you like.", ["branding", "ux design", "design", "small business"], False, "Send a brief"),
        r(9, "u-seun", "First personal training session free", "A 45-minute assessment and programme with Adeyemi Athletics. Any level, any goal.", "Free access", "Free session",
          "Message Seun with your goals and preferred evening.", ["client coaching", "fitness", "training"], False, "Book a session"),
        r(10, "u-rafael", "20% off at Costa Cuts", "Cuts, fades and beard trims. Book any weekday and mention the community.", "Discount", "20% off",
          "Book on the shop's page and mention the Playr League at the chair.", ["barber", "grooming", "discount"], False, "Book online"),
        r(11, "u-amara", "Free social content calendar template", "The Notion calendar I use for client work: ideas, captions, hashtags and a monthly review page.", "Template", None,
          "Duplicate the template and make it yours.", ["marketing", "social media", "content"], False, "Get the template", "template"),
        r(12, "u-hannah", "Product roadmap template and how I run planning", "A one-page roadmap, an OKR sheet and the meeting agenda that keeps my team aligned.", "Template", None,
          "Copy the workbook. Ask me anything on my profile.", ["product management", "business strategy", "leadership"], False, "Get the template", "template"),
        r(13, "u-priya", "Referrals for analytics roles at Northlake", "Northlake is hiring analysts and engineers. I'm happy to refer members who are a fit and give feedback on your resume.", "Intro", "Referral",
          "Send your resume and a line on the role you want.", ["career coaching", "data analysis", "referral", "interview prep"], False, "Ask for a referral"),
        r(14, "u-marcus", "15% off catering from Kensington Kitchen", "Team events, launches and parties, 20 to 120 people. Menu on request.", "Discount", "15% off",
          "Mention the community when you request a quote.", ["catering", "event production", "culinary", "discount"], False, "Request a quote"),
        r(15, "u-admin-me", "Free court hours for member-organised games", "Book The New Arena's practice court for free, twice a month, for a member-organised game or workshop.", "Free access", "Free court hours",
          "Message Devon with your date and headcount.", ["event production", "venue", "sponsorship"], False, "Request a date"),
        r(16, "u-jonah", "Free CPR and first aid session for your team or business", "A 90-minute hands-on session, up to 15 people. Certification through the course provider costs extra.", "Free access", "Free session",
          "Message Jonah with a date and headcount.", ["first aid training", "leadership", "health"], False, "Book a session"),
        r(17, "u-grace", "Negotiating your salary: a script that works", "Word-for-word scripts, research prompts and what to do when the answer is no.", "Insight", None,
          "Open the guide.", ["negotiation", "career coaching", "interview prep"], False, "Read the guide", "guide", [ME]),
        r(18, "u-yuki", "DJ sets for your event at a member rate", "Two-hour minimum, gear included. Weddings, launches and pop-ups.", "Discount", "Member rate",
          "Message Yuki with your date and vibe.", ["music production", "event production", "dj"], False, "Book a set"),
        r(19, "u-elena", "Free 20-minute nutrition consult", "Fuelling, meal planning or a food question. As a registered dietitian I can point you to the right plan.", "Free access", "Free 20 min",
          "Message Elena with your goal.", ["nutrition coaching", "wellness", "meal planning"], False, "Book a call"),
        r(20, "u-zainab", "Free 1-hour home renovation walkthrough", "I'll look at your space and tell you what's worth doing and what to skip. Toronto and GTA.", "Free access", "Free 1 hr",
          "Message Zainab with photos and your address area.", ["architecture", "project management", "renovation"], False, "Request a visit", "perk", (), "pending"),
    ]


def _announcements() -> List[Dict[str, Any]]:
    def a(i, title, body, prio, author, days, cta, space):
        return {"id": f"ann-{i}", "title": title, "body": body, "source": "mailchimp", "priority": prio, "author": author, "published_at": iso(days), "cta_label": cta,
                "cta_url": "#", "space_slug": space, "status": "approved", "image_url": poster("social") if i == 5 else None}
    return [
        a(1, "Summit registration is open", "Two days of keynotes, workshops and a member marketplace. Early-bird tickets for members until the end of the month.", "high", "Fife Ashley-Dejo", -1, "Register", "indoor-series"),
        a(2, "We're at The New Arena", "Signature Events now run in the main hall with better sound, seating and a dedicated networking lounge.", "normal", "The Playr League", -3, "See the venue", "indoor-series"),
        a(3, "After Hours tickets are live", "Friday's social includes live music, food vendors and a photo wall. Members get first access.", "high", "Fife Ashley-Dejo", -2, "Reserve tickets", "after-hours"),
        a(4, "Workshop leaders wanted", "Have a skill to share? Lead a workshop and get featured in the member directory. Next planning call is in two weeks.", "normal", "Playr League Workshops", -6, "Sign up", "playr-academy"),
        a(5, "Portrait night: help wanted", "Free member portraits at the social night. Photographers, message Aaliyah if you want to help.", "normal", "Aaliyah Grant", -4, "Join the crew", "after-hours"),
    ]


def _help_board() -> List[Dict[str, Any]]:
    users = {m["id"]: m for m in M}

    def snap(uid):
        u = users[uid]
        return {"id": uid, "name": u["name"], "avatar_url": None, "title": u["prof"], "company": u["emp"]}

    def h(i, uid, title, desc, cat, urgency, tags, helpers=(), days=-1, space="indoor-series"):
        return {"id": f"help-{i}", "user_id": uid, "user_snapshot": snap(uid), "space_slug": space, "title": title, "description": desc, "category": cat,
                "tags": tags, "urgency": urgency, "image_url": poster("clinic") if i == 3 else None, "status": "open", "is_featured": False, "helpers": list(helpers), "created_at": iso(days), "updated_at": iso(days), "resolved_at": None}
    return [
        h(1, "u-tariq", "Looking for a mentor in engineering management", "Two years from a senior role. Would love a monthly coffee with someone who has made the jump.", "Career advice", "normal", ["career coaching", "mentorship"], ["u-hannah", "u-priya"], -1),
        h(2, "u-marcus", "Need a lawyer to look over a restaurant lease", "Signing on a small space in Kensington. Want a second pair of eyes before I commit.", "Legal & finance", "high", ["legal advice", "contracts"], ["u-grace"], -2),
        h(3, "u-aaliyah", "How do I price a brand photography retainer?", "Two clients want monthly retainers and I have no idea what to charge.", "Business help", "normal", ["business strategy", "sales"], ["u-kwame", "u-seun"], -3),
        h(4, "u-jasmine", "Practice interview for physio residency", "Applications close next month. Anyone who has sat on a panel, or been through it?", "Career advice", "normal", ["interview prep", "career coaching"], ["u-founder-me", "u-grace"], -1, "outdoor-series"),
        h(5, "u-amara", "Anyone with grant-writing experience?", "Helping a youth non-profit apply for a community grant. Need feedback on a two-page draft.", "Business help", "normal", ["grant writing"], ["u-priya"], -2),
        h(6, "u-yuki", "Need a bookkeeper for my DJ side business", "Invoices, HST, expenses. Happy to trade a set for your time.", "Legal & finance", "normal", ["accounting & bookkeeping"], ["u-ben"], -1, "after-hours"),
        h(7, "u-isabela", "Design portfolio review", "Applying for internships. Looking for honest notes from anyone who hires designers.", "Career advice", "normal", ["career coaching", "branding"], ["u-aaliyah"], -4),
        h(8, "u-seun", "Web developer for my training studio site", "Need a simple booking site. Can pay, or trade training sessions.", "Business help", "high", ["web development", "marketing"], ["u-tariq", "u-ravi"], 0),
        h(9, "u-founder-me", "Advice on opening a physio clinic", "Thinking about going independent in two years. Would love to talk to anyone who has done it: costs, licensing and finding first clients.", "Business help", "normal", ["business strategy", "accounting & bookkeeping", "legal advice"], ["u-ben", "u-grace", "u-kwame"], -1),
        h(10, "u-hannah", "Speaker slot: 10 minutes on product careers", "Running a career night for members. Need two more speakers from any profession.", "Career advice", "normal", ["public speaking", "networking"], [], -1, "outdoor-series"),
    ]


# --------------------------------------------------------------------------------------------- seeding
async def seed_playr(db, force: bool = False) -> bool:
    marker = await db.community_config.find_one({"_key": "playr_seed"})
    if marker and not force:
        return False
    for c in WIPE:
        await db[c].delete_many({})
    await db.community_config.delete_many({})
    pw = hash_password(os.environ.get("DEMO_PASSWORD") or "Demo123!")

    # organisations (leagues / programs / partners)
    now = iso()
    for o in ORGS:
        o.setdefault("id", str(uuid.uuid4()))
        o.update(verified=True, created_at=now, updated_at=now, logo_url=None, cover_url=poster("indoor" if o["slug"] != "after-hours" else "show", o.get("accent_color") or RED),
                 notable_alumni=[], partners=[], contact={"website": "https://example.com", "email": "hello@playr.example"}, portfolio_size=None)
        for p in o.get("programs", []):
            p.setdefault("stage", "all_stages")
    await db.organizations.insert_many([dict(o) for o in ORGS])

    users = [_member_doc(m, pw) for m in M]
    await db.users.insert_many([dict(u) for u in users])
    await db.users.insert_many(_applicants(pw))
    orgs = {o["slug"]: o for o in ORGS}
    mem = []
    for m in M:
        for s in m["orgs"]:
            mem.append({"id": uuid.uuid4().hex[:16], "user_id": m["id"], "org_slug": s, "org_name": orgs[s]["name"], "status": "approved", "joined_at": iso(-45), "application_id": None})
    # one pending application for the demo member (tracker page)
    app_id = str(uuid.uuid4())
    await db.applications.insert_many([
        {"id": app_id, "user_id": "u-founder-me", "user_snapshot": None, "org_slug": "after-hours", "org_name": "After Hours", "pitch": "Would love to join the creator crew and shoot recovery content for players.",
         "why": "After Hours is where the community shows up, and I want to help members stay healthy.", "status": "pending", "created_at": iso(-3), "decided_at": None, "reviewer_note": None},
        {"id": str(uuid.uuid4()), "user_id": "u-founder-me", "user_snapshot": None, "org_slug": "outdoor-series", "org_name": "Outdoor Series", "pitch": "Interested in a mixed volleyball roster.", "why": "Cross-training in summer.",
         "status": "approved", "created_at": iso(-30), "decided_at": iso(-28), "reviewer_note": "Welcome!"},
    ])
    mem.append({"id": uuid.uuid4().hex[:16], "user_id": "u-founder-me", "org_slug": "outdoor-series", "org_name": "Outdoor Series", "status": "approved", "joined_at": iso(-28), "application_id": None})
    await db.memberships.insert_many(mem)

    await db.events.insert_many(_events({}))
    await db.resources.insert_many(_resources())
    await db.announcements.insert_many(_announcements())
    await db.support_requests.insert_many(_help_board())

    me = users[0]
    # team support ticket + member requests (admin ↔ member workflows)
    await db.support_requests.insert_one({
        "id": "sup-team-1", "user_id": "u-founder-me", "to_team": True, "user_snapshot": {k: me.get(k) for k in ("id", "name", "avatar_url", "title", "company")},
        "title": "Can I lead a workshop next quarter?", "description": "I'd like to run a session on recovery and desk posture. Who decides and what's the process?",
        "category": "scheduling", "category_label": "Scheduling", "urgency": "normal", "deadline": day(10), "status": "in_progress", "assignee_id": "u-admin-me",
        "tags": [], "helpers": [], "last_response": "Dre will review proposals after the next planning call. I'll send the details.",
        "timeline": [{"status": "submitted", "at": iso(-4), "by": me["name"]}, {"status": "assigned", "at": iso(-3), "by": "Fife Ashley-Dejo"},
                     {"status": "in_progress", "at": iso(-1), "by": "Fife Ashley-Dejo", "note": "Dre will review proposals after the next planning call. I'll send the details."}],
        "created_at": iso(-4), "updated_at": iso(-1), "resolved_at": None})
    from routes.portal import REQUEST_KINDS

    def req(i, uid, kind, title, reason, due, status="not_started", **kw):
        d = {"id": f"rq-{i}", "user_id": uid, "kind": kind, "title": title, "reason": reason, "due_date": due, "status": status, "created_by": "u-admin-me",
             "created_by_name": "Fife Ashley-Dejo", "created_at": iso(-6), "updated_at": iso(-6), "external_url": None, "webhook_token": None,
             "fields": REQUEST_KINDS[kind]["fields"]}
        d.update(kw)
        return d
    reqs = [
        req(1, "u-founder-me", "availability", "Fall event availability", "We're building the events calendar. Tell us which evenings you can attend.", day(3)),
        req(2, "u-founder-me", "goals_update", "Set your career goals", "We use these to match you with mentors and people who can help.", day(9), "in_progress"),
        req(3, "u-founder-me", "waiver", "Sign the 2026 event consent form", "Required before you attend in-person events.", day(-1), external_url="https://example.com/waiver", external_provider="Google Form", webhook_token="demo-webhook-token", fields=[]),
        req(4, "u-founder-me", "event_followup", "Follow-up: Members' welcome breakfast", "What was the highlight and what are you working on next?", None, "reviewed",
            response={"takeaway": "My conditioning is better than my handle", "next_step": "Two ball-handling sessions a week"}, submitted_at=iso(-10)),
    ]
    for i, uid in enumerate(["u-tariq", "u-marcus", "u-ben", "u-isabela", "u-jonah", "u-yuki"]):
        st = ["submitted", "not_started", "in_progress", "submitted", "not_started", "resolved"][i]
        d = req(10 + i, uid, "availability", "Fall event availability", "We're building the calendar.", day(-2 if i == 4 else 5), st)
        if st == "submitted":
            d.update(response={"nights": ["Sunday", "Wednesday"], "notes": "Any time after 7pm"}, submitted_at=iso(-1))
        reqs.append(d)
    await db.member_requests.insert_many(reqs)

    await db.profile_requests.insert_many([
        {"id": "pr-u-founder-me-support_needs", "user_id": "u-founder-me", "kind": "support_needs", "created_by": "u-admin-me", "created_by_label": "The Playr League team",
         "status": "pending", "created_at": iso(-1), "updated_at": iso(-1)}])
    await db.connect_requests.insert_many([
        {"id": str(uuid.uuid4()), "sender_id": "u-founder-me", "sender_name": me["name"], "sender_role": "founder", "sender_avatar_url": me["avatar_url"], "recipient_id": "u-dre",
         "recipient_name": "Dre Whitfield", "recipient_role": "mentor", "recipient_avatar_url": None, "kind": "20-min-chat",
         "kind_label": "20-min chat", "topic": "Fixing my shot before Div A assessment", "note": "Happy to trade physio advice for shooting notes.", "status": "pending", "source": "airtable",
         "created_at": iso(-2), "updated_at": iso(-2)},
        {"id": str(uuid.uuid4()), "sender_id": "u-tariq", "sender_name": "Tariq Bello", "sender_role": "founder", "sender_avatar_url": None, "recipient_id": "u-founder-me",
         "recipient_name": me["name"], "recipient_role": "founder", "recipient_avatar_url": me["avatar_url"], "kind": "async-question", "kind_label": "Async question",
         "topic": "Desk posture: what should I stretch?", "note": "Tight shoulders after long days coding.", "status": "pending", "source": "app", "created_at": iso(-1), "updated_at": iso(-1)},
    ])
    await db.notifications.insert_many([
        {"id": str(uuid.uuid4()), "user_id": "u-founder-me", "kind": "value_match", "title": "You could help: Ankle feels weird after last game", "body": "Matches your skills: recovery & mobility",
         "link": "/support", "meta": {}, "read": False, "created_at": iso(hours=-3)},
        {"id": str(uuid.uuid4()), "user_id": "u-founder-me", "kind": "connect_request", "title": "Tariq Bello asked a question", "body": "Desk posture question", "link": "/support", "meta": {}, "read": False, "created_at": iso(hours=-20)},
        {"id": str(uuid.uuid4()), "user_id": "u-founder-me", "kind": "help_offer", "title": "Dre Whitfield offered to help", "body": "Looking for a shooting partner on Tuesday nights", "link": "/support", "meta": {}, "read": True, "created_at": iso(-1)},
    ])

    # community config (brand, nav, copy, logo)
    from routes.community_config import DEFAULT_CONFIG
    cfg = {k: v for k, v in DEFAULT_CONFIG.items()}
    brand = dict(cfg["brand"])
    brand["logo_url"] = png_data_uri("tpl-mark-cream.png")
    brand["logo_mark_url"] = png_data_uri("tpl-favicon.png")
    cfg["brand"] = brand
    cfg["hub_cover"] = poster("show", "#FF2E44")
    cfg["community_kind"] = "Wellness & events"
    cfg["about"] = "A health and wellness brand that hosts networking nights, workshops and socials, and connects members who can help each other."
    cfg["country"] = "Canada"
    cfg["interest_tags"] = ["Wellness", "Sports"]
    cfg["page_text"] = {
        "members_title": "Meet the members", "members_subtitle": "Everyone in the community: their work, skills, goals and what they need help with.",
        "events_title": "Events", "events_subtitle": "Networking, workshops and wellness sessions you can join.",
        "resources_title": "Community perks", "resources_subtitle": "Discounts, free access and know-how that members share with each other.",
        "support_title": "Help board", "support_subtitle": "Ask for career advice or business help. Offer help when you can.",
        "requests_title": "Your to-do", "requests_subtitle": "Forms and updates the Playr League team has asked you for.",
        "matches_title": "Recommended connections", "matches_subtitle": "Members, events and perks picked for what you need and what you offer.",
        "updates_title": "Community news", "updates_subtitle": "Announcements and updates from the team.",
        "ask_title": "Ask the League", "ask_subtitle": "Find a mentor, someone who can help, or your next event.",
    }
    cfg.update(_key="singleton", updated_at=iso())
    await db.community_config.insert_one(cfg)
    await db.community_config.insert_one({"_key": "playr_seed", "at": iso()})
    return True
