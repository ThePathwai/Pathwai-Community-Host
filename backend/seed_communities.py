"""Additional demo communities for the multi-community Pathwai demo.

  grace       "C3"                - C3 Toronto's Downtown campus, a warm, inclusive church near Dovercourt Park, Toronto (light, ivory + forest green + gold)
  the-village  "The Village"        - an invite-only chef-led supper club in Toronto (dark, near-black + brass + burgundy)

Each community has its own database. `seed_community(dbx, slug)` fills one raw motor/mongomock Database using the same
document shapes as seed_playr.py. All names, places and businesses are fictional. Idempotent through a marker doc.
"""
from __future__ import annotations

import base64
import copy
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List
from urllib.parse import quote

from auth import hash_password
from playr_art import png_data_uri, portrait

COMMUNITY_SLUGS_NEW = ["grace", "the-village", "club-pto"]

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


def _uri(svg: str) -> str:
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()


A = dict

# --------------------------------------------------------------------------------------------- artwork
# poster kind -> (background, mid, highlight) per community; same blurred-mesh recipe as playr_art.poster
POSTER_PAL = {
    "grace": {"indoor": ("#042038", "#0B3A5C", "#EA2401"), "outdoor": ("#062A47", "#175880", "#F2703F"), "show": ("#02182B", "#12507A", "#EA2401"),
              "social": ("#04263F", "#7C1F0A", "#F2703F"), "clinic": ("#02182B", "#0B3A5C", "#F2703F")},
    "the-village": {"indoor": ("#FBF3E3", "#F0D8A8", "#C8792E"), "outdoor": ("#F7EEDB", "#D9C08A", "#8E6B3A"), "show": ("#FAF0DE", "#E8B85E", "#7A1F35"),
                    "social": ("#F9EFDC", "#E3C489", "#B9843A"), "clinic": ("#FAF2E4", "#D8B98A", "#5A3A22")},
    "club-pto": {"indoor": ("#0A211F", "#0F3634", "#ABAE23"), "outdoor": ("#0C2825", "#154C48", "#D8D24A"), "show": ("#081E1C", "#023E3F", "#ABAE23"),
                 "social": ("#0C2825", "#8A7A1E", "#D8D24A"), "clinic": ("#0A211F", "#0F3634", "#D8D24A")},
}


def poster_custom(kind: str, slug: str) -> str:
    """Abstract event cover in the community palette: a blurred gradient mesh."""
    bg, mid, hi = POSTER_PAL[slug].get(kind, POSTER_PAL[slug]["indoor"])
    s = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240"><defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%">'
         f'<feGaussianBlur stdDeviation="38"/></filter></defs><rect width="400" height="240" fill="{bg}"/>'
         f'<g filter="url(#b)"><circle cx="330" cy="50" r="120" fill="{mid}"/><circle cx="90" cy="210" r="100" fill="{hi}" fill-opacity=".85"/>'
         f'<circle cx="220" cy="130" r="60" fill="{mid}" fill-opacity=".8"/></g></svg>')
    return _uri(s)


def _logo(slug: str) -> tuple[str, str, bool]:
    """Returns (logo_url, logo_mark_url, show_name_with_logo) — a wordmark that already spells out
    the name (village, club-pto) hides the redundant text next to it; a bare mark (grace) shows it."""
    if slug == "grace":  # C3's real mark: three sheared red bars on navy
        mark = png_data_uri("c3-logo.png")
        return mark, mark, True
    if slug == "the-village":  # the real wordmark for the wide nav spot; just the hut for the square favicon slot
        return png_data_uri("village-logo.png"), png_data_uri("village-mark.png"), False
    # club-pto: crossed racquets with the "Club · PTO" wordmark baked in, square, works for both slots
    mark = png_data_uri("club-pto-logo.png")
    return mark, mark, False


def _hub_cover(slug: str) -> str:
    if slug == "grace":  # navy + red mesh echoing the real C3 mark
        svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300"><defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="42"/></filter></defs>'
               '<rect width="600" height="300" fill="#042D49"/><g filter="url(#b)"><circle cx="470" cy="60" r="140" fill="#EA2401" fill-opacity=".5"/>'
               '<circle cx="100" cy="260" r="140" fill="#0B3A5C" fill-opacity=".8"/><circle cx="300" cy="150" r="75" fill="#175880" fill-opacity=".6"/></g>'
               '<g fill="#EA2401"><path d="M215 150 L385 150 L410 168 L385 186 L215 186Z"/><path d="M215 194 L385 194 L410 212 L385 230 L215 230Z" fill-opacity=".85"/></g></svg>')
    elif slug == "the-village":  # warm cream + gold mesh, with a brass long-table motif — matches the new light logo
        svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300"><defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="44"/></filter></defs>'
               '<rect width="600" height="300" fill="#FFFBF3"/><g filter="url(#b)"><circle cx="150" cy="70" r="130" fill="#F4B65C" fill-opacity=".55"/><circle cx="470" cy="250" r="140" fill="#7A1F35" fill-opacity=".18"/>'
               '<circle cx="300" cy="150" r="60" fill="#C8792E" fill-opacity=".35"/></g><ellipse cx="300" cy="170" rx="170" ry="34" fill="none" stroke="#B08130" stroke-opacity=".55" stroke-width="2"/>'
               '<g fill="#B08130" fill-opacity=".9"><circle cx="160" cy="170" r="5"/><circle cx="210" cy="149" r="5"/><circle cx="260" cy="140" r="5"/><circle cx="340" cy="140" r="5"/>'
               '<circle cx="390" cy="149" r="5"/><circle cx="440" cy="170" r="5"/><circle cx="210" cy="192" r="5"/><circle cx="260" cy="201" r="5"/><circle cx="340" cy="201" r="5"/><circle cx="390" cy="192" r="5"/></g></svg>')
    else:  # club-pto: deep teal + olive mesh with a crossed-racquets silhouette, echoing the real mark
        svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300"><defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="42"/></filter></defs>'
               '<rect width="600" height="300" fill="#023E3F"/><g filter="url(#b)"><circle cx="470" cy="60" r="140" fill="#ABAE23" fill-opacity=".45"/>'
               '<circle cx="100" cy="260" r="140" fill="#0F3634" fill-opacity=".85"/><circle cx="300" cy="150" r="75" fill="#0C4B49" fill-opacity=".7"/></g>'
               '<g fill="none" stroke="#F0E5D3" stroke-width="5" stroke-opacity=".85"><ellipse cx="270" cy="175" rx="42" ry="52" transform="rotate(-18 270 175)"/>'
               '<ellipse cx="345" cy="175" rx="42" ry="52" transform="rotate(18 345 175)"/></g>'
               '<path d="M270 227 L308 260 L345 227" fill="none" stroke="#F0E5D3" stroke-width="5" stroke-opacity=".85" stroke-linecap="round"/></svg>')
    return _uri(svg)


# --------------------------------------------------------------------------------------------- members: GRACE
# fields: id name age prof emp hood art skills interests goals needs bio role mtype since(year) tag(role label) open_to [website] [login email]
GRACE_ME = "u-founder-me"
GRACE_ADMIN = "u-g-admin"
GRACE_M: List[Dict[str, Any]] = [
    A(id="u-founder-me", name="Fife Ashley-Dejo", age=27, prof="Physiotherapist", emp="Bayview Health Clinic", hood="Leslieville",
      art=A(skin="d", hair="puffs", hair_color="black", bg=0, smile=True), tag="Welcome team", since=2024,
      skills=["Childcare", "Cooking for a crowd", "Welcoming newcomers", "First aid"], interests=["Trail running", "Choir", "Film photography", "Meal prep"],
      goals=["Help start a Saturday family stretch class", "Get to know more neighbours", "Join the Community Meal rota"], needs=["Rides on winter Sundays", "A running buddy", "Small group to join"],
      bio="Physiotherapist who joined C3 two years ago and found a second family. I help on the welcome team, love a good potluck, and am always happy to chat posture, injuries and where to find a great coffee in Leslieville.",
      role="member", mtype="founder", open_to=["Coffee and conversation", "Small group invitations"], login="demo@yourcommunity.app", flag="founder"),
    A(id="u-g-admin", name="Pastor Jonathan Martin", age=44, prof="Campus Pastor", emp="C3 Toronto", hood="Dovercourt Park",
      art=A(skin="e", hair="short", hair_color="black", bg=1, beard=True, smile=True, glasses=True), tag="Campus Pastor", since=2016,
      skills=["Teaching", "Pastoral care", "Marriage preparation", "Conflict mediation"], interests=["Jazz", "Cycling", "Gardening", "Football on Saturdays"],
      goals=["Grow our Connect Groups network", "Train ten new Connect Group leaders"], needs=["More volunteers for the Community Meal", "A second person on AV"],
      bio="Campus Pastor at C3 Toronto's Downtown location, alongside his wife Angela. Preaches most Sundays and leads our Pastoral Care team. My door is open, so grab me after any gathering for a coffee.",
      role="admin", mtype="partner", open_to=["Coffee and conversation", "Home visits"], login="pastor@c3.example", flag="admin", site="https://c3toronto.com/locations/downtown"),
    A(id="u-admin-me", name="Fife Ashley-Dejo", age=34, prof="Community Lead", emp="Dovercourt Park Community Hub", hood="Dovercourt Park",
      art=A(skin="d", hair="short", hair_color="black", bg=2, beard=True, smile=True), tag="Volunteer coordinator", since=2022,
      skills=["Event organising", "Volunteer coordination", "Photography", "Fundraising"], interests=["Coffee", "Live music", "Basketball"],
      goals=["Fill every slot on our volunteer Teams", "Run a neighbourhood clean-up"], needs=["Extra hands on set-up day", "A projector for the hall"],
      bio="I coordinate volunteer Teams and events between C3 and the wider Dovercourt Park community. Message me if you'd like to serve but aren't sure where to start.",
      role="member", mtype="founder", open_to=["Coffee and conversation", "Volunteer matching"], login="admin@yourcommunity.app"),
    A(id="u-g-priscilla", name="Priscilla Tan", age=38, prof="Music teacher", emp="Lansdowne Music Studio", hood="Bloorcourt",
      art=A(skin="a", hair="long", hair_color="black", bg=3, smile=True), tag="Worship leader", since=2018,
      skills=["Music & worship", "Choir direction", "Piano", "Teaching kids"], interests=["Baking", "Hymn history", "Hiking"],
      goals=["Start an intergenerational choir", "Teach five young people to play in the C3 Worship band"], needs=["A second keyboard", "A guitarist for Sunday mornings"],
      bio="I lead C3 Worship on Sundays and teach piano through the week. The choir is open to everyone, whether or not you think you can sing.",
      role="member", mtype="mentor", open_to=["Music mentoring", "Coffee and conversation"]),
    A(id="u-g-david", name="David Okafor", age=31, prof="High school teacher", emp="Danforth Collegiate", hood="Danforth",
      art=A(skin="e", hair="fade", hair_color="black", bg=4, smile=True, glasses=True), tag="Youth leader", since=2019,
      skills=["Youth mentoring", "Tutoring", "Games & icebreakers", "Camp planning"], interests=["Board games", "Soccer", "Podcasts"],
      goals=["Double Youth Night attendance", "Plan a summer camp weekend"], needs=["Two more youth volunteers", "Pizza budget", "Van drivers for the camp trip"],
      bio="Teacher by day, youth leader on Thursday nights. Our teens are funny, thoughtful and full of ideas, and we'd love more adults who can simply show up and listen.",
      role="member", mtype="mentor", open_to=["Youth volunteering", "Tutoring introductions"]),
    A(id="u-g-ruth", name="Ruth Abernathy", age=68, prof="Retired nurse", emp="Retired", hood="Wallace Emerson",
      art=A(skin="a", hair="short", hair_color="grey", bg=2, smile=True, glasses=True), tag="Meal team lead", since=2009,
      skills=["Cooking for a crowd", "Visiting & companionship", "First aid", "Meal train coordination"], interests=["Knitting", "Crosswords", "Grandchildren", "Radio dramas"],
      goals=["Feed 60 neighbours at every Community Meal", "Teach a cooking basics class"], needs=["Help carrying groceries", "Two more kitchen volunteers"],
      bio="Retired nurse and the person to ask about the Community Meal. I've been here since before the new roof. Bring your appetite and I'll find you a job.",
      role="member", mtype="mentor", open_to=["Visits and phone calls", "Kitchen mentoring"]),
    A(id="u-g-samir", name="Samir Haddad", age=36, prof="Software developer", emp="Northlake Systems", hood="Leslieville",
      art=A(skin="c", hair="short", hair_color="black", bg=5, smile=True, beard=True), tag="Tech & AV team", since=2021,
      skills=["Tech / AV", "Live streaming", "Website help", "Sound desk"], interests=["Woodworking", "Cycling", "Indie films"],
      goals=["Make Sunday livestreams reliable", "Train two people on the sound desk"], needs=["Moving help this month", "A second camera operator"],
      bio="I run the sound desk and the livestream for people who can't make it in person. Happy to teach anyone who's curious about cables and mixers.",
      role="member", mtype="founder", open_to=["Tech help", "Teaching AV"]),
    A(id="u-g-lucia", name="Lucia Fernandes", age=40, prof="Baker & mum of three", emp="Lucia's Kitchen", hood="Greektown",
      art=A(skin="b", hair="curly", hair_color="brown", bg=0, smile=True), tag="Families ministry", since=2017,
      skills=["Childcare", "Baking", "Party planning", "Portuguese translation"], interests=["Gardening", "Festas", "Sunday walks"],
      goals=["Start a parents' morning group", "Bake for every baptism this year"], needs=["Babysitting swaps", "Someone to share school-run driving"],
      bio="Three kids, one oven, and a heart for young families. Ask me about the Sunday kids' program or my pastel de nata.",
      role="member", mtype="founder", open_to=["Childcare swaps", "Recipe swaps"]),
    A(id="u-g-james", name="James Whitaker", age=57, prof="Carpenter & contractor", emp="Whitaker Renovations", hood="East York",
      art=A(skin="a", hair="short", hair_color="grey", bg=1, smile=True, beard=True), tag="Volunteer Day lead", since=2013,
      skills=["Carpentry", "Home repairs", "Moving help", "Project management"], interests=["Fishing", "Old trucks", "Woodturning"],
      goals=["Build accessible ramps for three neighbours", "Repair the church hall floor"], needs=["Volunteers with a truck", "Paint donations"],
      bio="I lead Volunteer Day on the second Saturday of the month. If something needs fixing at church or at a neighbour's house, we'll bring the tools.",
      role="member", mtype="founder", open_to=["Repairs & handyman help", "Moving help"]),
    A(id="u-g-naomi", name="Naomi Bekele", age=24, prof="Graduate student, education", emp="OISE, University of Toronto", hood="The Annex",
      art=A(skin="e", hair="braids", hair_color="black", bg=3, smile=True), tag="Tutoring club", since=2023,
      skills=["Tutoring", "Math help", "English as a second language", "Youth mentoring"], interests=["Poetry", "Long-distance running", "Ethiopian coffee ceremonies"],
      goals=["Grow the homework club to 20 students", "Publish my thesis"], needs=["A quiet room for tutoring", "Rides home after evening sessions"],
      bio="I tutor on Tuesdays and Saturdays and I'm always looking for more students and more volunteers. No teaching experience needed, only patience.",
      role="member", mtype="founder", open_to=["Tutoring", "Study partners"]),
    A(id="u-g-helen", name="Helen Park", age=52, prof="Accountant", emp="Park & Lowe CPA", hood="North York",
      art=A(skin="a", hair="bun", hair_color="black", bg=5, smile=True, glasses=True), tag="Treasurer", since=2012,
      skills=["Accounting & bookkeeping", "Budgeting help", "Tax preparation", "Charity governance"], interests=["Gardening", "Classical music", "Crossword clubs"],
      goals=["Run a free tax clinic each spring", "Keep the building fund on track"], needs=["A volunteer to help with the newsletter"],
      bio="Church treasurer and a numbers person. If money feels stressful, come and see me. I run a free budgeting clinic and there is no judgement here.",
      role="member", mtype="founder", open_to=["Budget help", "Tax help"]),
    A(id="u-g-elijah", name="Elijah Brooks", age=33, prof="Graphic designer", emp="Freelance", hood="Dovercourt Park",
      art=A(skin="f", hair="fade", hair_color="black", bg=2, smile=True), tag="New parent", since=2024,
      skills=["Graphic design", "Posters & flyers", "Photography", "Social media"], interests=["Vinyl", "Coffee", "Screen printing"],
      goals=["Design the fall welcome kit", "Find a rhythm with a newborn"], needs=["Meal train for the first month", "Baby-friendly Connect Group"],
      bio="New dad, designer, and slowly-improving sleeper. I make the posters you see on our noticeboard and would love to help our outreach look great.",
      role="member", mtype="founder", open_to=["Design help", "Meals & visits"]),
]

GRACE_APPLICANTS = [
    ("u-g-app-1", "Anita Sharma", "Pharmacist", "Bloorcourt Pharmacy", "pending", -1, dict(skin="c", hair="long", hair_color="black", bg=1, smile=True),
     "We moved near Dovercourt Park in the spring and have been coming on Sundays. I'd love to join a Connect Group and get to know the neighbourhood.", ["Cooking for a crowd", "Tutoring"], "A neighbour, Lucia, invited us to the Community Meal."),
    ("u-g-app-2", "Peter Novak", "Retired engineer", "", "pending", -3, dict(skin="a", hair="short", hair_color="grey", bg=4, glasses=True, smile=True),
     "Retired last year and looking for meaningful ways to give back. I can help with repairs, driving or anything technical.", ["Home repairs", "Driving"], "Saw the Volunteer Day sign on Pauline Avenue."),
]

# --------------------------------------------------------------------------------------------- members: THE VILLAGE
TN_ADMIN = "u-t-admin"
TN_M: List[Dict[str, Any]] = [
    A(id="u-t-admin", name="Camille Laurent", age=41, prof="Host & Founder", emp="The Village", hood="Queen West",
      art=A(skin="a", hair="long", hair_color="auburn", bg=4, smile=True), tag="Host & founder", since=2021,
      skills=["Hosting", "Menu curation", "Wine pairing", "Storytelling"], interests=["Old cookbooks", "Natural wine", "Antiques", "Rainy-day markets"],
      goals=["Keep The Village intimate and unhurried", "Host one dinner a year abroad", "Publish a members' cookbook"], needs=["A second private dining room", "Introductions to small-batch producers"],
      bio="Former restaurant manager who started The Village at her own kitchen table. Fourteen guests, one long table, no phones and a menu nobody has seen in advance.",
      role="admin", mtype="partner", open_to=["Introductions", "Guest-chef collaborations"], login="host@thevillage.example", flag="admin", site="https://thevillage.example"),
    A(id="u-t-julien", name="Julien Moreau", age=44, prof="Chef de cuisine", emp="Petit Foyer", hood="Little Italy",
      art=A(skin="a", hair="short", hair_color="brown", bg=0, beard=True, smile=True), tag="Resident chef", since=2021,
      skills=["French technique", "Fire cooking", "Menu writing", "Butchery"], interests=["Foraging", "Vintage knives", "Cycling in the Alps"],
      goals=["Open a 24-seat dining room", "Cook one dinner a season for The Village"], needs=["A reliable game supplier", "Front-of-house partner"],
      bio="Trained in Lyon, now cooking a small seasonal menu in a Little Italy dining room. My Village dinners are always a bit longer than planned.",
      role="member", mtype="mentor", open_to=["Guest-chef dinners", "Stage placements"]),
    A(id="u-t-ines", name="Ines Okoye", age=37, prof="Sommelier", emp="Cellar & Co.", hood="Liberty Village",
      art=A(skin="e", hair="afro", hair_color="black", bg=3, smile=True), tag="Sommelier", since=2022,
      skills=["Wine pairing", "Blind tasting", "Cellar management", "Sake & spirits"], interests=["Vineyard travel", "Ceramics", "Jazz clubs"],
      goals=["Pour a full Burgundy flight at the Salon", "Earn my Master Sommelier diploma"], needs=["Access to Jura allocations", "A tasting room with good light"],
      bio="Sommelier who believes a great bottle should be poured generously and explained briefly. I curate the pairings for our long-table dinners.",
      role="member", mtype="mentor", open_to=["Wine consultations", "Tasting nights"]),
    A(id="u-t-theo", name="Theo Papadakis", age=46, prof="Restaurateur", emp="Agora Meze House", hood="Danforth",
      art=A(skin="b", hair="short", hair_color="black", bg=1, beard=True, smile=True), tag="Guest chef", since=2022,
      skills=["Mediterranean cuisine", "Restaurant operations", "Catering", "Olive oil sourcing"], interests=["Sailing", "Backgammon", "Family lunches"],
      goals=["Bring a Cretan feast to the long table", "Import a small olive oil"], needs=["A guest sommelier", "Ceramic serveware"],
      bio="Third-generation restaurateur. I like food that arrives in the middle of the table and disappears quickly.",
      role="member", mtype="mentor", open_to=["Guest-chef dinners", "Supplier introductions"]),
    A(id="u-t-amira", name="Amira Haddad", age=35, prof="Food writer", emp="Saltwater Quarterly", hood="Leslieville",
      art=A(skin="c", hair="long", hair_color="black", bg=5, smile=True, glasses=True), tag="Regular", since=2022,
      skills=["Food writing", "Restaurant criticism", "Editing", "Recipe development"], interests=["Street food", "Essays", "Lebanese cooking"],
      goals=["Finish my book on supper clubs", "Interview every chef at the table"], needs=["Chefs willing to be interviewed", "A quiet writing room"],
      bio="Writer covering how Toronto eats. I promise never to review a Village dinner without permission and never to mention the seating chart.",
      role="member", mtype="founder", open_to=["Interviews", "Introductions to chefs"]),
    A(id="u-t-victor", name="Victor Lam", age=48, prof="Architect", emp="Lam + Ortiz Architects", hood="Yorkville",
      art=A(skin="a", hair="short", hair_color="grey", bg=2, glasses=True, smile=True), tag="Regular", since=2021,
      skills=["Interior design", "Restaurant design", "Lighting", "Project management"], interests=["Mid-century furniture", "Whisky", "Long lunches"],
      goals=["Design a dining room for The Village", "Collect a full set of Bauhaus glassware"], needs=["Introductions to ceramicists", "Someone to source vintage tables"],
      bio="Architect who designs restaurants and eats in them even more. One of the founding guests at the very first long table.",
      role="member", mtype="founder", open_to=["Design advice", "Venue scouting"]),
    A(id="u-t-sasha", name="Sasha Volkov", age=32, prof="Pastry chef & ceramicist", emp="Volkov Studio", hood="Junction",
      art=A(skin="a", hair="bun", hair_color="blond", bg=0, smile=True), tag="Guest chef", since=2023,
      skills=["Pastry", "Ceramics", "Dessert design", "Fermentation"], interests=["Flea markets", "Pottery wheels", "Tea ceremonies"],
      goals=["Serve dessert on my own plates at every dinner", "Teach a Salon on fermented fruit"], needs=["A kiln space", "Introductions to florists"],
      bio="I make the desserts and the plates they arrive on. Ask me anything about tempering, tea or why the last course matters most.",
      role="member", mtype="mentor", open_to=["Collaborations", "Ceramic commissions"]),
    A(id="u-t-marguerite", name="Marguerite Bell", age=53, prof="Wine merchant", emp="Bell & Barrel Wine Merchants", hood="Rosedale",
      art=A(skin="a", hair="short", hair_color="grey", bg=4, smile=True), tag="Partner", since=2021,
      skills=["Wine sourcing", "Private cellars", "Allocations", "Importing"], interests=["Opera", "Hiking in Burgundy", "Vintage champagne"],
      goals=["Find a great value Loire producer", "Open a members' tasting room"], needs=["Chefs who want to host a trade tasting", "Storage space near downtown"],
      bio="I've been importing small-grower wine to Ontario for twenty-five years. The Village members get first look at anything new in our cellar.",
      role="member", mtype="partner", open_to=["Wine sourcing", "Trade tastings"]),
    A(id="u-t-daniel", name="Daniel Osei", age=45, prof="Investor", emp="Osei Partners", hood="Forest Hill",
      art=A(skin="f", hair="fade", hair_color="black", bg=1, smile=True, glasses=True), tag="Regular", since=2022,
      skills=["Hospitality investing", "Negotiation", "Wine collecting", "Networking"], interests=["Vintage watches", "Cricket", "Argentine steak"],
      goals=["Back one chef-led restaurant this year", "Bring three new guests to a dinner"], needs=["A plus-one for October", "Introductions to young chefs"],
      bio="I invest in food businesses and, more happily, eat at them. The Village is the one evening a month I leave my phone in the coat room.",
      role="member", mtype="founder", open_to=["Investment conversations", "Plus-one swaps"]),
    A(id="u-t-rosa", name="Rosa Delgado", age=34, prof="Food photographer", emp="Delgado Studio", hood="Parkdale",
      art=A(skin="b", hair="curly", hair_color="brown", bg=3, smile=True), tag="Regular", since=2023,
      skills=["Food photography", "Styling", "Editorial shoots", "Cookbook art direction"], interests=["Film cameras", "Spanish wine", "Market mornings"],
      goals=["Shoot Camille's cookbook", "Build a portfolio of chef portraits"], needs=["A chef for a portrait series", "A north-facing studio"],
      bio="Photographer who prefers natural light and half-empty plates. I'll happily shoot a dinner if you promise me a seat.",
      role="member", mtype="founder", open_to=["Photo shoots", "Introductions to chefs"]),
    A(id="u-t-felix", name="Felix Brandt", age=39, prof="Bar director", emp="The Copper Room", hood="Ossington",
      art=A(skin="a", hair="short", hair_color="red", bg=5, beard=True, smile=True), tag="Regular", since=2022,
      skills=["Cocktail design", "Bar programs", "Non-alcoholic pairing", "Hospitality training"], interests=["Vintage glassware", "Bitters", "Vinyl"],
      goals=["Design a non-alcoholic pairing for every dinner", "Open a members' cocktail hour"], needs=["Ice supplier", "A quiet corner for a supper club bar"],
      bio="I run a small cocktail bar and moonlight as the pre-dinner aperitif. Ask me about vermouth.",
      role="member", mtype="founder", open_to=["Aperitif collaborations", "Bar consulting"]),
    A(id="u-t-noor", name="Noor Rahimi", age=36, prof="Cheesemonger", emp="Curd & Whey", hood="Kensington Market",
      art=A(skin="c", hair="bun", hair_color="black", bg=2, smile=True), tag="Regular", since=2023,
      skills=["Cheese selection", "Affinage", "Charcuterie boards", "Farm relationships"], interests=["Farm visits", "Bread baking", "Natural wine"],
      goals=["Build a cheese course for every dinner", "Visit five Ontario dairies this year"], needs=["A cool room for ageing", "Chefs who want a cheese partner"],
      bio="I sell cheese for a living and talk about it for fun. Ask me what's ripe and what to pour next to it.",
      role="member", mtype="founder", open_to=["Cheese courses", "Farm introductions"]),
]

TN_APPLICANTS = [
    ("u-t-app-1", "Elliot Grant", "Creative director", "Northlight Studio", "pending", -1, dict(skin="a", hair="short", hair_color="brown", bg=2, beard=True, smile=True),
     "Camille and Victor have both told me about the long table. I cook a lot at home and would love to meet people who care as much about a dinner as I do.", ["Design", "Cooking"], "Referred by Victor Lam. I love slow-cooked lamb and anything with anchovy."),
    ("u-t-app-2", "Mei Zhang", "Product designer", "Atlas Health", "pending", -4, dict(skin="a", hair="long", hair_color="black", bg=5, smile=True, glasses=True),
     "A friend brought me to a Salon last spring. I'd like to become a regular and help with the menu design and printed ephemera.", ["Design", "Print"], "Referred by Ines Okoye. Favourite dish: hand-pulled noodles."),
]

# --------------------------------------------------------------------------------------------- members: CLUB PTO
PTO_ADMIN = "u-p-admin"
PTO_M: List[Dict[str, Any]] = [
    A(id="u-founder-me", name="Fife Ashley-Dejo", age=27, prof="Physiotherapist", emp="Bayview Health Clinic", hood="Leslieville",
      art=A(skin="d", hair="puffs", hair_color="black", bg=0, smile=True), tag="Ladder league", since=2024,
      skills=["Doubles strategy", "Match warm-ups", "Injury prevention tips"], interests=["Running", "Tennis (former)", "Brunch after matches"],
      goals=["Move up to Ladder Division B", "Play in the fall mixed doubles tournament"], needs=["A consistent Tuesday partner", "Help with backhand volleys"],
      bio="Physiotherapist and recent padel convert. I traded my running shoes for court shoes two years ago and haven't looked back — usually on the Tuesday ladder, always up for a rally before clinic.",
      role="member", mtype="founder", open_to=["Hitting partners", "Injury advice"], login="demo@yourcommunity.app", flag="founder"),
    A(id="u-p-admin", name="Diego Fontana", age=39, prof="Head Coach & Club Director", emp="Club PTO", hood="Etobicoke",
      art=A(skin="c", hair="short", hair_color="black", bg=1, beard=True, smile=True), tag="Head coach", since=2021,
      skills=["Coaching", "Ladder league management", "Tournament direction", "Stringing"], interests=["Beach padel", "Football (soccer)", "Coffee between sessions"],
      goals=["Open a second court block", "Send two players to Nationals"], needs=["A second certified coach", "Sponsors for the fall tournament"],
      bio="Grew up playing padel outside Buenos Aires and have been coaching in Toronto since 2021. I run the ladder league, the clinics, and most of the club's bad puns.",
      role="admin", mtype="partner", open_to=["Coaching", "Partner matching"], login="coach@clubpto.example", flag="admin", site="https://clubpto.example"),
    A(id="u-p-sofia", name="Sofia Almeida", age=29, prof="Touring pro & coach", emp="Freelance", hood="Liberty Village",
      art=A(skin="c", hair="long", hair_color="black", bg=2, smile=True), tag="Assistant coach", since=2022,
      skills=["Advanced technique", "Video analysis", "Junior coaching"], interests=["Beach volleyball", "Portuguese cooking", "Travel"],
      goals=["Qualify for the Canadian Open", "Build a junior academy"], needs=["More court time for junior sessions", "A hitting partner for tournament prep"],
      bio="Former touring pro, now coaching Tuesdays and Thursdays. Ask me about footwork, or the best pastel de nata in the city.",
      role="member", mtype="mentor", open_to=["Coaching", "Video analysis"]),
    A(id="u-p-marcus", name="Marcus Webb", age=44, prof="Operations Manager", emp="Bright Line Logistics", hood="High Park",
      art=A(skin="a", hair="short", hair_color="brown", bg=3, smile=True, glasses=True), tag="Ladder captain", since=2022,
      skills=["Ladder scheduling", "Score-keeping", "Court booking"], interests=["Craft beer", "Cycling", "Fantasy football"],
      goals=["Grow the ladder to 40 players", "Run a summer round robin every month"], needs=["A co-captain for Division B", "Sponsorship for trophies"],
      bio="I keep the ladder league honest: fair scheduling, fair scores, minimal trash talk (some trash talk). Message me about matches or byes.",
      role="member", mtype="founder", open_to=["Ladder questions", "Match scheduling"]),
    A(id="u-p-priya", name="Priya Nair", age=33, prof="Marketing Manager", emp="Northbank Creative", hood="Junction",
      art=A(skin="c", hair="long", hair_color="black", bg=4, smile=True), tag="Social chair", since=2023,
      skills=["Event planning", "Social media", "Partner matching for beginners"], interests=["Wine tasting", "Board games", "Travel"],
      goals=["Sell out the fall mixer", "Start a beginners' meetup"], needs=["Volunteers for the socials", "A photographer for the tournament"],
      bio="I run the socials and the club Instagram. If you're new and nervous about your first round robin, I'll pair you with someone kind.",
      role="member", mtype="founder", open_to=["Event help", "Beginner introductions"]),
    A(id="u-p-hassan", name="Hassan Ali", age=36, prof="High school teacher", emp="Etobicoke Collegiate", hood="Etobicoke",
      art=A(skin="e", hair="short", hair_color="black", bg=5, beard=True, smile=True, glasses=True), tag="Juniors coach", since=2023,
      skills=["Youth coaching", "Camp planning", "Equipment fitting"], interests=["Cricket", "Hiking", "Cooking for a crowd"],
      goals=["Launch a Saturday junior clinic", "Get five juniors playing tournaments"], needs=["Kid-sized racquets", "Two more junior coaching volunteers"],
      bio="I teach high school by day and run our junior clinic on Saturdays. Padel is the easiest racquet sport to fall in love with fast, ask any of my students.",
      role="member", mtype="mentor", open_to=["Junior coaching", "Equipment advice"]),
    A(id="u-p-elena", name="Elena Vasquez", age=41, prof="Owner, stringing studio", emp="Vasquez Racquet Studio", hood="Junction",
      art=A(skin="a", hair="bun", hair_color="black", bg=0, smile=True), tag="Stringing partner", since=2022,
      skills=["Stringing", "Racquet fitting", "Equipment advice"], interests=["Ceramics", "Trail running", "Spanish wine"],
      goals=["Open a weekly stringing pop-up at the club", "Demo the new racquet lines"], needs=["A shelf near the front desk", "Feedback testers for new racquets"],
      bio="I string racquets for half the ladder and will happily talk you out of buying the wrong one. Drop by on Thursdays.",
      role="member", mtype="partner", open_to=["Stringing", "Equipment advice"]),
    A(id="u-p-owen", name="Owen Bennett", age=52, prof="Architect", emp="Bennett & Cole Architects", hood="Roncesvalles",
      art=A(skin="a", hair="short", hair_color="grey", bg=1, glasses=True, smile=True), tag="Regular", since=2021,
      skills=["Carpool coordination", "Photography", "Sponsorship outreach"], interests=["Vintage cars", "Wine", "Golf"],
      goals=["Get a proper scoreboard installed", "Host an alumni round robin"], needs=["A ride-share partner from Roncesvalles", "Extra balls for warm-up"],
      bio="One of the club's founding members. I organise the west-end carpool and take questionable photos of everyone's backhands.",
      role="member", mtype="founder", open_to=["Carpooling", "Photography"]),
    A(id="u-p-natasha", name="Natasha Kim", age=30, prof="Registered dietitian", emp="Fuel Nutrition Co.", hood="Liberty Village",
      art=A(skin="e", hair="long", hair_color="black", bg=2, smile=True), tag="Fitness & footwork", since=2023,
      skills=["Nutrition coaching", "Footwork drills", "Injury recovery tips"], interests=["Running", "Cooking", "Podcasts"],
      goals=["Run a footwork clinic every month", "Play in the mixed doubles ladder"], needs=["A regular practice partner on Wednesdays", "New grip tape"],
      bio="Dietitian by trade, footwork nerd by obsession. I run our monthly fitness & footwork clinic, bring shoes with good grip.",
      role="member", mtype="mentor", open_to=["Nutrition advice", "Footwork drills"]),
    A(id="u-p-jordan", name="Jordan Lee", age=27, prof="Software developer", emp="Meridian Labs", hood="Parkdale",
      art=A(skin="f", hair="fade", hair_color="black", bg=3, smile=True, glasses=True), tag="Livestream & tech", since=2023,
      skills=["Livestreaming finals", "Booking app support", "Video analysis tools"], interests=["Esports", "Cycling", "Craft coffee"],
      goals=["Livestream every ladder final", "Build a simple results tracker"], needs=["A second camera for finals", "Feedback on the booking app"],
      bio="I stream the ladder finals and keep the booking app from breaking. Happy to help anyone stuck reserving a court.",
      role="member", mtype="founder", open_to=["Tech help", "Livestream volunteering"]),
    A(id="u-p-winston", name="Winston Park", age=47, prof="Real estate broker", emp="Park Realty Group", hood="Etobicoke",
      art=A(skin="e", hair="short", hair_color="grey", bg=4, smile=True), tag="Sponsorship lead", since=2022,
      skills=["Sponsorship & partnerships", "Negotiation", "Networking"], interests=["Golf", "Whisky", "Classic rock"],
      goals=["Land a title sponsor for the fall tournament", "Get club merch made"], needs=["Design help for sponsor decks", "Introductions to local businesses"],
      bio="I chase sponsors so the club can afford new balls and a real scoreboard. Ask me about the fall tournament prize pool.",
      role="member", mtype="partner", open_to=["Sponsorship", "Networking"]),
    A(id="u-p-aiko", name="Aiko Tanaka", age=34, prof="UX designer", emp="Freelance", hood="The Beaches",
      art=A(skin="a", hair="bun", hair_color="black", bg=5, smile=True), tag="Beginner mentor", since=2024,
      skills=["Beginner mentoring", "Graphic design", "Poster design"], interests=["Ceramics", "Japanese cooking", "Weekend hikes"],
      goals=["Mentor five total beginners this year", "Design new club posters"], needs=["A consistent beginner partner on Sunday mornings", "Feedback on the new posters"],
      bio="I design the posters you see on the court fence and mentor total beginners every Sunday morning. Padel is easy to learn and hard to stop playing.",
      role="member", mtype="founder", open_to=["Beginner mentoring", "Design help"]),
]

PTO_APPLICANTS = [
    ("u-p-app-1", "Ben Torres", "Personal trainer", "FitLife Studio", "pending", -1, dict(skin="c", hair="short", hair_color="black", bg=1, beard=True, smile=True),
     "I've been playing tennis for years and a friend dragged me to a round robin last month. I'm hooked and would love to join the ladder.", ["Coaching", "Fitness training"], "A friend from FitLife Studio brought me to a round robin."),
    ("u-p-app-2", "Layla Haddad", "Product manager", "Northbridge Tech", "pending", -3, dict(skin="c", hair="long", hair_color="black", bg=5, smile=True, glasses=True),
     "New to padel but played squash competitively in university. Looking for a club with a real ladder league and good coaching.", ["Squash (competitive)", "Strategy"], "Found Club PTO through a search for Toronto padel clubs."),
]


# --------------------------------------------------------------------------------------------- documents
def _users(slug: str, pw: str) -> List[Dict[str, Any]]:
    if slug == "grace":
        members, domain, prefix = GRACE_M, "c3.example", "g"
    elif slug == "club-pto":
        members, domain, prefix = PTO_M, "clubpto.example", "p"
    else:
        members, domain, prefix = TN_M, "thevillage.example", "t"
    out = []
    for i, m in enumerate(members):
        first, last = m["name"].replace("Pastor ", "").split()[0].lower(), m["name"].split()[-1].lower()
        email = m.get("login") or f"{first}.{last}@{domain}"
        contact = {"email": email, "phone": f"+1 416 555 01{20 + i:02d}", "linkedin": f"https://linkedin.com/in/{first}-{last}", "instagram": f"@{first}.{last}"}
        if m.get("site"):
            contact["website"] = m["site"]
        elif i % 4 == 2:
            contact["website"] = f"https://{first}{last}.example.com"
        doc = {
            "id": m["id"], "name": m["name"], "email": email, "password_hash": pw if m.get("login") else None,
            "role": m["role"], "member_type": m["mtype"], "age": m["age"], "height": None, "avatar_url": portrait(number=m["id"], **m["art"]),
            "title": m["prof"], "company": m["emp"], "location": f"{m['hood']}, Toronto", "bio": m["bio"],
            "industry": None, "stage": None, "position": None, "cohort": None,
            "skill_set": m["skills"], "expertise": m["skills"], "interests_hobbies": m["interests"], "interests": m["interests"],
            "goals": m["goals"], "support_needs": m["needs"], "needs_seeking": m["needs"], "open_to": m["open_to"],
            "contact": contact, "contact_visibility": "members", "preferred_contact": "in-app messages",
            "created_at": iso(-(2026 - m["since"]) * 30 - 30), "updated_at": iso(-2),
            "memberships_space_slugs": [slug], "active_space_slug": None,
            "membership_status": "approved", "hidden_from_directory": False,
            "header_stats": [{"value": str(m["since"]), "label": "member since"}, {"value": m["tag"], "label": "role", "accent": True}],
        }
        if m.get("flag"):
            doc["is_demo_me_for_role"] = m["flag"]
        if m["id"] == "u-founder-me":
            doc.update(phone="+1 416 555 0142", hats=["founder"], active_hat="founder")
        out.append(doc)
    if slug == "grace":
        applicants = GRACE_APPLICANTS
    elif slug == "club-pto":
        applicants = PTO_APPLICANTS
    else:
        applicants = TN_APPLICANTS
    for uid, name, title, company, st, days, art, why, skills, answer in applicants:
        first, last = name.lower().split()
        out.append({"id": uid, "name": name, "email": f"{first}.{last}@example.com", "password_hash": pw, "role": "member", "member_type": "founder",
                    "title": title, "company": company, "location": "Toronto", "bio": why, "join_reason": why, "avatar_url": portrait(number=uid, **art),
                    "skill_set": skills, "expertise": skills, "membership_status": st, "hidden_from_directory": True, "signup_source": "self",
                    "apply_answers": {"referral": answer},
                    "contact": {"email": f"{first}.{last}@example.com", "phone": f"+1 416 555 01{80 + len(out):02d}", "linkedin": f"https://linkedin.com/in/{first}-{last}", "instagram": f"@{first}.{last}"},
                    "contact_visibility": "members", "created_at": iso(days), "updated_at": iso(days)})
    return out


def _snap(u: Dict[str, Any]) -> Dict[str, Any]:
    return {"id": u["id"], "name": u["name"], "avatar_url": u["avatar_url"], "title": u["title"], "company": u["company"]}


def _events(slug: str, U: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    P = lambda k: poster_custom(k, slug)
    pool = [u for u in U if U[u].get("membership_status") == "approved"]
    exc = lambda *ids: [p for p in pool if p not in ids]

    def ev(i, title, desc, days, at, dur, host_id, loc, cat, cap, tags, kind, going, agenda, prep, virtual=False):
        h = U[host_id]
        start = iso(days, at=at)
        return {"id": f"evt-{slug}-{i}", "title": title, "description": desc, "host": h["name"], "host_id": host_id, "starts_at": start,
                "ends_at": (datetime.fromisoformat(start) + timedelta(hours=dur)).isoformat(), "location": loc, "is_virtual": virtual, "cover_url": P(kind),
                "source": "native", "category": cat, "capacity": cap, "attendee_ids": list(going), "recommended_for_roles": ["founder", "member", "mentor"],
                "post_resource_ids": [], "tags": tags, "rsvps": {u: "yes" for u in going}, "agenda": agenda, "prep": prep, "space_slug": slug,
                "status": "approved", "created_at": iso(-20)}

    if slug == "grace":
        E = [
            ev(1, "Sunday Gathering", "Our weekly morning together: music from C3 Worship, a short talk from Pastor Jonathan, and coffee in the hall after. We run three services (8:30, 10:00 and 11:45 am); this is the 10:00. Children are welcome, with C3 Kids running downstairs for the whole service.", 3, 10, 1.5, GRACE_ADMIN,
               "C3 Toronto · 12 Pauline Avenue", "Sunday Gathering", 220, ["worship", "families", "welcome"], "indoor", pool,
               ["Welcome and music (10:00)", "Reflection", "C3 Kids dismissal", "Coffee and conversation"], "Come as you are. Newcomers can find the welcome table by the front door."),
            ev(2, "Community Meal: Neighbours' Table", "A free hot meal for anyone in the neighbourhood, cooked by our kitchen team. Come hungry, bring a friend, stay for dessert and conversation.", 6, 17, 2, "u-g-ruth",
               "C3 · Fellowship hall", "Community Meal", 90, ["meal", "neighbours", "volunteers"], "social", exc("u-g-james", "u-g-helen") + [],
               ["Doors open (17:00)", "Grace before the meal", "Dinner and dessert", "Clean-up crew (all welcome)"], "Let us know about allergies when you RSVP. Vegetarian and gluten-free options every week."),
            ev(3, "Connect Group: Kitchen Table Conversations", "An informal evening Connect Group that meets in a home near Bloorcourt. Supper, a short reading and honest conversation about faith, work and life.", 8, 19, 2, "u-g-lucia",
               "Home of Lucia & Rui · Bloorcourt", "Connect Group", 12, ["connect group", "conversation", "supper"], "outdoor", ["u-founder-me", "u-g-elijah", "u-g-helen", "u-g-naomi", "u-g-samir", "u-g-priscilla"],
               ["Supper (19:00)", "Reading and questions", "Time to share", "Closing thoughts"], "Bring a dessert or a drink if you like. Address is sent after you RSVP."),
            ev(4, "Volunteer Day: Food Bank & Garden", "Join a Team: pack hampers for the neighbourhood food bank, then weed and plant in our church garden. Gloves and lunch provided. Tasks for all ages and abilities.", 11, 9, 4, "u-g-james",
               "C3 · Garden & loading dock", "Volunteer Day", 40, ["volunteer", "teams", "garden"], "outdoor", exc("u-g-admin", "u-g-priscilla", "u-g-elijah"),
               ["Meet and safety briefing (09:00)", "Food bank packing", "Lunch break", "Garden work"], "Wear closed shoes and clothes that can get dirty."),
            ev(5, "Youth Night: Games & Pizza", "Our weekly night for teens in grades 6 to 12: games, pizza, a short discussion and a chance to unwind after school. Adult volunteers welcome.", 13, 18, 3, "u-g-david",
               "C3 · Youth room", "Youth Night", 30, ["youth", "teens", "games"], "show", ["u-g-david", "u-g-naomi", "u-g-samir", "u-g-lucia"],
               ["Games (18:00)", "Pizza", "Short talk and small groups", "Free time"], "Teens can bring a friend. Parents are welcome to stay for coffee."),
            ev(6, "Prayer Evening", "A quiet, unhurried hour of reflection and prayer with candles and soft music, hosted with our Pastoral Care team. Come for as long as you like, and take a moment for yourself, your neighbours or the city.", 15, 19, 1.5, "u-g-priscilla",
               "C3 · Sanctuary", "Prayer Evening", 60, ["prayer", "reflection", "music"], "indoor", ["u-founder-me", "u-g-admin", "u-g-priscilla", "u-g-ruth", "u-g-helen", "u-g-elijah", "u-admin-me"],
               ["Gathering (19:00)", "Guided reflection", "Open prayer", "Blessing"], "No experience needed. Silence is welcome."),
            ev(7, "Sunday Gathering: Last Week", "Last Sunday's gathering, with a guest speaker on hospitality and a welcome lunch for new neighbours. Notes and photos are in the news tab.", -4, 10, 1.5, GRACE_ADMIN,
               "C3 Toronto · 12 Pauline Avenue", "Sunday Gathering", 220, ["worship"], "indoor", pool, ["Welcome and music", "Talk", "Lunch"], "None needed."),
            ev(8, "Community Meal: Harvest Supper", "A larger meal for the whole neighbourhood, with soup, bread and pies from seven of our kitchens.", -11, 17, 2, "u-g-ruth",
               "C3 · Fellowship hall", "Community Meal", 90, ["meal", "harvest"], "social", exc("u-g-samir"), ["Doors open", "Supper", "Pie auction for the food bank"], "None needed."),
            ev(9, "HER Night", "An evening for the women of C3: worship, a short talk and time to connect over dessert. Bring a friend, no RSVP required at the door but it helps us plan food.", 2, 19, 2, "u-g-lucia",
               "C3 Toronto · 12 Pauline Avenue", "Women's Night", 120, ["women", "worship", "community"], "show", exc("u-g-admin", "u-g-david", "u-g-james", "u-g-samir"),
               ["Doors and worship (19:00)", "Talk", "Dessert and connection"], "Come as you are. Childcare is not provided for this evening."),
            ev(10, "Vision Builders Gala", "A celebration evening for our Vision Builders stewardship initiative: dinner, stories from the past year and a look at what's next for our Downtown campus. Semi-formal.", 36, 18, 3, GRACE_ADMIN,
               "C3 Toronto · 12 Pauline Avenue", "Fundraiser", 150, ["vision builders", "gala", "stewardship"], "social", pool,
               ["Reception (18:00)", "Dinner", "Vision update from Pastor Jonathan", "Closing toast"], "Tickets support the Vision Builders fund. Semi-formal attire."),
        ]
        E.append({"id": "evt-grace-pending-1", "title": "Saturday morning stroller walk", "description": "A relaxed walk through Dufferin Grove Park with strollers and coffee. All parents and carers welcome.",
                  "starts_at": iso(9, at=10), "ends_at": iso(9, at=12), "location": "Dufferin Grove Park", "host": "Lucia Fernandes", "category": "Connect Group", "tags": ["families", "walk"], "source": "community",
                  "attendee_ids": [], "rsvps": {}, "status": "pending", "submitted_by": "u-g-lucia", "submitted_by_name": "Lucia Fernandes", "created_at": iso(-1), "cover_url": P("outdoor"), "space_slug": slug})
        return E
    if slug == "club-pto":
        E = [
            ev(1, "Tuesday Ladder Night", "Our weekly ladder league night: score-tracked doubles across four divisions, on all three courts. Come rain or shine, we're covered.", 2, 19, 2, "u-p-marcus",
               "Club PTO · Courts 1-3", "Ladder League", 24, ["ladder", "doubles", "weekly"], "indoor", pool,
               ["Warm-up (19:00)", "Ladder matches", "Standings posted after"], "Check your division and opponent on the ladder board before you arrive."),
            ev(2, "Beginner Clinic: First Steps on Court", "A relaxed 90-minute intro for total beginners: grip, the glass walls, scoring and your first rally. Loaner racquets provided, no experience needed.", 4, 10, 1.5, "u-p-aiko",
               "Club PTO · Court 2", "Beginner Clinic", 12, ["beginners", "clinic", "intro"], "clinic", ["u-p-aiko", "u-founder-me", "u-p-hassan"],
               ["Welcome and grip basics (10:00)", "Wall play and scoring", "First rallies", "Q&A"], "Wear court shoes if you have them; loaners available otherwise."),
            ev(3, "Junior Padel Camp", "Saturday morning coaching for kids 8 to 15: footwork games, wall drills and mini-matches, run by our juniors coach Hassan and volunteers.", 6, 9, 2, "u-p-hassan",
               "Club PTO · Courts 1-2", "Junior Camp", 20, ["juniors", "coaching", "kids"], "outdoor", ["u-p-hassan", "u-p-sofia", "u-p-aiko"],
               ["Warm-up games (09:00)", "Skill stations", "Mini-matches", "Snack and pickup"], "Parents welcome to watch from the lounge."),
            ev(4, "Footwork & Fitness Clinic", "Natasha's monthly clinic on court movement, split-step timing and recovery: less about hitting, more about getting there first.", 9, 18, 1.5, "u-p-natasha",
               "Club PTO · Court 3", "Footwork Clinic", 14, ["fitness", "footwork", "clinic"], "clinic", exc("u-p-owen", "u-p-winston"),
               ["Dynamic warm-up (18:00)", "Footwork drills", "Applied rally practice", "Cool-down and stretch"], "Bring indoor court shoes and a water bottle."),
            ev(5, "Round Robin Social", "A friendly mixed round robin with rotating partners, followed by pizza on the patio. All levels welcome, especially newer players.", 11, 18, 3, "u-p-priya",
               "Club PTO · Courts 1-3 & patio", "Round Robin Social", 32, ["social", "round robin", "all levels"], "social", pool,
               ["Check-in and pairing (18:00)", "Round robin rounds", "Pizza on the patio"], "New players are paired with a regular for their first match."),
            ev(6, "Stringing & Equipment Pop-Up", "Elena sets up her stringing bench courtside for the evening: same-day restrings, grip advice and a look at the new racquet demo line.", 13, 17, 3, "u-p-elena",
               "Club PTO · Front lounge", "Equipment Pop-Up", 30, ["stringing", "equipment", "demo"], "indoor", exc("u-p-hassan", "u-p-jordan"),
               ["Pop-up opens (17:00)", "Restrings while you play", "Demo racquets available"], "Book a restring slot at the front desk; walk-ins fit in when possible."),
            ev(7, "Ladder Finals Night", "The Tuesday ladder's top two in each division play off for the season trophy, livestreamed by Jordan to the club Instagram.", 20, 19, 2.5, "u-p-marcus",
               "Club PTO · Court 1 (show court)", "Ladder League", 40, ["ladder", "finals", "livestream"], "show", pool,
               ["Division C & D finals (19:00)", "Division A & B finals", "Trophy presentation"], "Come cheer even if you're not in the finals; there's a full bar cart."),
            ev(8, "Tuesday Ladder Night: Last Week", "Last week's ladder night. Full standings and photos are posted in the news tab.", -5, 19, 2, "u-p-marcus",
               "Club PTO · Courts 1-3", "Ladder League", 24, ["ladder"], "indoor", pool, ["Warm-up", "Ladder matches", "Standings posted"], "None needed."),
            ev(9, "Fall Mixer & Sponsor Night", "An evening celebrating our fall tournament sponsors, with exhibition doubles from the coaches and a raffle for club merch.", 27, 18, 3, "u-p-winston",
               "Club PTO · Courts 1-3 & patio", "Fall Mixer", 50, ["social", "sponsors", "mixer"], "social", pool,
               ["Doors and drinks (18:00)", "Exhibition doubles", "Raffle draw"], "Business casual. Sponsors and their guests are welcome."),
        ]
        E.append({"id": "evt-club-pto-pending-1", "title": "Sunday morning beginners' round robin", "description": "A low-key round robin just for beginners and newer players, coached lightly by volunteers. No ladder pressure.",
                  "starts_at": iso(10, at=10), "ends_at": iso(10, at=12), "location": "Club PTO · Court 2", "host": "Aiko Tanaka", "category": "Beginner Clinic", "tags": ["beginners", "round robin"], "source": "community",
                  "attendee_ids": [], "rsvps": {}, "status": "pending", "submitted_by": "u-p-aiko", "submitted_by_name": "Aiko Tanaka", "created_at": iso(-1), "cover_url": P("clinic"), "space_slug": slug})
        return E
    E = [
        ev(1, "Long Table Dinner: Ember & Ash", "Fourteen guests, one table, five courses cooked over live fire by Julien Moreau, with a wine pairing curated by Ines Okoye. Menu revealed at the table.", 5, 19, 3.5, "u-t-julien",
           "The Loft at Atelier 9 · Queen West", "Long Table Dinner", 14, ["dinner", "fire cooking", "wine pairing"], "indoor", pool,
           ["Aperitif (19:00)", "First course at the table (19:45)", "Five courses with pairings", "Digestifs and cheese"], "Arrive on time. Tell us about allergies when you reserve your seat."),
        ev(2, "Chef's Counter: Theo Papadakis", "An eight-seat counter with guest chef Theo Papadakis: a Cretan tasting menu cooked in front of you, with a glass of something Greek and unfiltered.", 9, 19, 2.5, "u-t-theo",
           "Petit Foyer · Chef's counter", "Chef's Counter", 8, ["chef's counter", "guest chef", "tasting menu"], "show", ["u-t-theo", "u-t-admin", "u-t-victor", "u-t-daniel", "u-t-amira", "u-t-rosa", "u-t-ines", "u-t-felix"],
           ["Welcome drink", "Eight-course counter menu", "Conversation with the chef"], "Counter seating. Smart casual."),
        ev(3, "Wine Salon: Burgundy vs. Niagara", "A blind flight of twelve pinots and chardonnays from Côte d'Or and Niagara with Ines Okoye and Marguerite Bell. Bring a palate and an open mind. Members only.", 12, 19, 2.5, "u-t-ines",
           "Bell & Barrel Tasting Room", "Wine Salon", 20, ["wine", "blind tasting", "salon"], "social", pool,
           ["Welcome pour", "Blind flight (12 wines)", "Reveal and debate", "Cheese and charcuterie"], "Arrive without strong perfume. We provide water and crackers."),
        ev(4, "Market Morning: St. Lawrence", "A slow, guided walk through the Saturday market with Julien and Sasha, followed by breakfast made from what we buy. Bring a tote bag.", 14, 9, 3, "u-t-sasha",
           "St. Lawrence Market · meet at the clock", "Market Morning", 12, ["market", "seasonal", "breakfast"], "outdoor", ["u-t-sasha", "u-t-julien", "u-t-amira", "u-t-rosa", "u-t-victor", "u-t-admin", "u-t-marguerite"],
           ["Meet at the clock (09:00)", "Market walk", "Breakfast in the kitchen studio"], "Comfortable shoes and a tote bag."),
        ev(5, "Members' Supper", "An informal supper only for members: a family-style menu from the regulars, natural wine on the table and no formalities. Bring a bottle you'd love to share.", 19, 19, 3, "u-t-admin",
           "Camille's Kitchen · Queen West", "Members' Supper", 14, ["members", "supper", "bring a bottle"], "social", pool,
           ["Arrivals", "Family-style supper", "Late-night dessert"], "Bring a bottle to share."),
        ev(6, "Long Table Dinner: Autumn Harvest", "Our seasonal long-table dinner: squash, game, late-season tomatoes and a very serious apple tart. Fourteen guests, one table.", 26, 19, 3.5, "u-t-admin",
           "The Loft at Atelier 9 · Queen West", "Long Table Dinner", 14, ["dinner", "seasonal", "harvest"], "indoor", pool[:12], ["Aperitif", "Five courses", "Digestifs"], "Arrive on time."),
        ev(7, "Long Table Dinner: Late Summer", "Last month's dinner: heirloom tomatoes, grilled sardines and a peach galette. Photographs by Rosa are in the news tab.", -8, 19, 3.5, "u-t-admin",
           "The Loft at Atelier 9 · Queen West", "Long Table Dinner", 14, ["dinner", "summer"], "indoor", pool[:12], ["Aperitif", "Five courses", "Digestifs"], "None needed."),
        ev(8, "Wine Salon: Orange & Amber", "An evening exploring skin-contact wines from Georgia, Friuli and Prince Edward County with Ines Okoye.", -16, 19, 2.5, "u-t-ines",
           "Bell & Barrel Tasting Room", "Wine Salon", 20, ["wine", "salon"], "social", exc("u-t-theo", "u-t-daniel"), ["Welcome pour", "Guided flight", "Cheese"], "None needed."),
    ]
    E.append({"id": "evt-the-village-pending-1", "title": "Oyster and champagne hour", "description": "A short, celebratory hour of oysters and grower champagne before the Wine Salon.",
              "starts_at": iso(12, at=17), "ends_at": iso(12, at=18), "location": "Bell & Barrel Tasting Room", "host": "Felix Brandt", "category": "Wine Salon", "tags": ["champagne", "oysters"], "source": "community",
              "attendee_ids": [], "rsvps": {}, "status": "pending", "submitted_by": "u-t-felix", "submitted_by_name": "Felix Brandt", "created_at": iso(-1), "cover_url": P("show"), "space_slug": slug})
    return E


def _resources(slug: str, U: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    P = lambda k: poster_custom(k, slug)

    def r(i, uid, title, desc, cat, perk, claim, tags, feat=False, cta="Learn more", typ="perk", cover=None, saved=()):
        u = U[uid]
        rs = title.lower().replace(" ", "-").replace(":", "").replace("&", "and").replace("'", "").replace("(", "").replace(")", "").replace(",", "").replace("$", "").replace("%", "")[:48]
        url = f"https://example.com/{slug}/{rs}"
        return {"id": f"res-{slug}-{i}", "title": title, "description": desc, "source": "community", "type": typ, "category": cat, "format": "Perk" if typ == "perk" else "Guide",
                "author": u["name"], "shared_by": {"id": uid, "name": u["name"], "avatar_url": u["avatar_url"], "title": u["title"]}, "perk_value": perk, "how_to_claim": claim,
                "duration_min": None, "cover_url": cover, "tags": tags, "is_featured": feat, "saved_by": list(saved), "published_at": iso(-i * 3), "url": url, "slug": rs, "external_url": url,
                "cta_label": cta, "difficulty": None, "lesson_count": None, "format_summary": perk or cat, "learning_outcomes": [], "prerequisites": [], "last_updated": iso(-i),
                "space_slug": slug, "status": "approved", "submitted_by": None, "submitted_by_name": None}
    if slug == "grace":
        return [
            r(1, "u-g-ruth", "Meal Train: cook for a family in need", "When a family welcomes a baby, has surgery or hits a hard patch, we organise a meal rota. Sign up to bring one dinner: we handle the schedule and dietary notes.", "Ways to serve", "One dinner",
              "Add your name to the current rota. Ruth will send the address and preferences.", ["meals", "care", "cooking"], True, "Join the rota", cover=P("social"), saved=["u-founder-me"]),
            r(2, "u-g-naomi", "Homework Club: tutors needed", "Tuesday and Saturday sessions for students in grades 3 to 10. No teaching experience needed, just patience. Training and a police check are provided by the church.", "Ways to serve", "2 hrs / week",
              "Message Naomi with your preferred day. New tutors shadow for one session.", ["tutoring", "youth", "volunteer"], True, "Volunteer", cover=P("indoor")),
            r(3, "u-g-james", "Ride Share: Sunday drivers list", "Members who drive can offer seats to neighbours who can't get to the gathering. Add yourself as a driver, or ask for a ride.", "Ways to serve", "Rides",
              "Message James with your area and how many seats you have.", ["rides", "care", "sunday"], False, "Offer a ride"),
            r(4, "u-g-helen", "Free budgeting and tax clinic", "One-on-one sessions with a chartered accountant for anyone who wants help with a budget, tax return or benefits form. Confidential and free to everyone in the neighbourhood.", "Community resources", "Free 45 min",
              "Book through Helen. Bring last year's return if you have it.", ["money", "tax", "budget"], True, "Book a session"),
            r(5, "u-g-priscilla", "Newcomer's guide to Dovercourt Park", "A friendly two-page guide to schools, libraries, clinics, community centres, the best cheap lunches and how to get around the west end without a car.", "Community resources", None,
              "Open the guide or pick up a printed copy at the welcome table.", ["newcomers", "neighbourhood", "guide"], False, "Read the guide", "guide"),
            r(6, "u-g-samir", "Learn the sound desk: AV team training", "A relaxed 90-minute session on the mixer, cameras and livestream. No experience needed. Join the rota when you're ready.", "Ways to serve", "90-min training",
              "Reply to Samir with a date that suits you.", ["tech", "av", "training"], False, "Book a slot", cover=None),
        ]
    if slug == "the-village":
      return [
        r(1, "u-t-admin", "Priority booking for Long Table Dinners", "Members get a 48-hour head start on every Long Table Dinner and Chef's Counter. Seats fill within hours, so this is the easiest way to guarantee a place.", "Ticket priority", "48-hour head start",
          "Automatic for members. You'll get an invitation email when a date is released.", ["dinners", "priority", "reservations"], True, "See upcoming dates", cover=P("indoor"), saved=[]),
        r(2, "u-t-marguerite", "15% off at Bell & Barrel Wine Merchants", "Members receive 15% off any case and complimentary delivery downtown. Ask for the members' cellar list.", "Wine & cellar", "15% off",
          "Quote 'The Village' when ordering, or send Marguerite a note.", ["wine", "cellar", "discount"], True, "Request the list", cover=P("social")),
        r(3, "u-t-julien", "Complimentary aperitif at Petit Foyer", "A glass of house aperitif with your first course on any weeknight, and a kitchen tour if you ask nicely.", "Partner restaurants", "Free aperitif",
          "Book online and mention The Village in the notes.", ["restaurant", "french", "aperitif"], False, "Book a table"),
        r(4, "u-t-theo", "Agora Meze House: members' table for six", "Reserve the long table at the back of the room, with a chef's selection of dishes for the middle of the table. Members only.", "Partner restaurants", "Members' table",
          "Email the restaurant with your date and party size.", ["restaurant", "greek", "group dining"], False, "Reserve the table"),
        r(5, "u-t-ines", "How we pair wine with a five-course menu", "Ines's working notes on structuring a pairing: acidity, weight, sequencing and when to break the rules. Includes a template we use for every dinner.", "Guides", None,
          "Open the guide.", ["wine pairing", "guide", "sommelier"], False, "Read the guide", "guide"),
        r(6, "u-t-victor", "Atelier 9 private dining room: members' rate", "Our long-table home is a light-filled loft on Queen West. Members can book it for private dinners and celebrations at a reduced weekday rate.", "Ticket priority", "Members' rate",
          "Message Victor or Camille with your date and party size.", ["venue", "private events", "loft"], False, "Request a date", cover=P("outdoor")),
    ]
    if slug == "club-pto":
        return [
            r(1, "u-p-elena", "10% off restrings at Vasquez Racquet Studio", "Members get 10% off any restring and free grip installation at Elena's studio in the Junction, or at her courtside pop-ups.", "Equipment & stringing", "10% off",
              "Mention Club PTO at the studio or the pop-up.", ["stringing", "discount", "equipment"], True, "Book a restring", cover=P("indoor")),
            r(2, "u-p-marcus", "Ladder league: how divisions work", "Marcus's guide to the Tuesday ladder: promotion and relegation, how byes are handled, and how to challenge for a higher spot.", "Ladder & scheduling", None,
              "Open the guide.", ["ladder", "guide", "scheduling"], True, "Read the guide", "guide"),
            r(3, "u-p-hassan", "Junior clinic: loaner racquets for kids", "We keep a bin of kid-sized racquets for the Saturday junior clinic. Borrow one for the season while your child decides if padel sticks.", "Ways to help", "Free loan",
              "Ask Hassan on a Saturday morning.", ["juniors", "equipment", "loan"], False, "Ask about a loaner"),
            r(4, "u-p-natasha", "Footwork & recovery: a starter routine", "Natasha's simple five-minute warm-up and cool-down routine for padel, built to protect knees and ankles on hard courts.", "Guides", None,
              "Open the guide.", ["fitness", "footwork", "injury prevention"], False, "Read the guide", "guide"),
            r(5, "u-p-jordan", "Booking app help & livestream archive", "Stuck reserving a court? Jordan's quick-start guide covers the booking app, plus a link to replays of past ladder finals.", "Ways to help", "Free help",
              "Message Jordan with a screenshot of what's not working.", ["booking app", "tech support", "livestream"], False, "Get help"),
            r(6, "u-p-winston", "Bright Court Sports: 15% off club merch", "Our fall tournament sponsor offers Club PTO members 15% off padel shoes, bags and apparel, in-store or online.", "Partner offers", "15% off",
              "Show your member card in-store, or use the code at checkout online.", ["gear", "discount", "sponsor"], True, "Shop the offer", cover=P("social")),
        ]
    raise ValueError(f"Unknown community slug: {slug}")


def _announcements(slug: str, U) -> List[Dict[str, Any]]:
    P = lambda k: poster_custom(k, slug)

    def a(i, title, body, prio, author, days, cta, img=None):
        return {"id": f"ann-{slug}-{i}", "title": title, "body": body, "source": "mailchimp", "priority": prio, "author": author, "published_at": iso(days), "cta_label": cta,
                "cta_url": "#", "space_slug": slug, "status": "approved", "image_url": img}
    if slug == "grace":
        return [
            a(1, "Fall welcome: new neighbours' lunch", "After the Sunday Gathering on the 3rd we'll host a lunch for anyone new to the church or the neighbourhood. Pastor Jonathan and the welcome team will be there, and it's a great way to meet people.", "high", "Pastor Jonathan Martin", -1, "RSVP", P("social")),
            a(2, "Volunteers needed: Community Meal kitchen", "Ruth's team needs two more cooks and two dishwashers for the Tuesday Community Meal. Training is friendly, and you'll be fed.", "normal", "Ruth Abernathy", -2, "Sign up"),
            a(3, "Youth Night is back on Thursdays", "Youth Night moves back to Thursdays from 6 pm. Grades 6 to 12, pizza and games. Two more adult volunteers are welcome.", "normal", "David Okafor", -4, "Volunteer"),
            a(4, "Vision Builders: thank you", "Thank you for helping us reach 82% of our goal toward this year's Vision Builders campaign for our Downtown campus. Join us at the Vision Builders Gala on October 30th to hear what's next.", "normal", "Helen Park", -7, "See the update"),
        ]
    if slug == "the-village":
        return [
            a(1, "Autumn dates released", "The Ember & Ash long-table dinner and the Autumn Harvest dinner are now open to members. Seats go quickly, so reserve within the 48-hour window.", "high", "Camille Laurent", -1, "Reserve a seat", P("indoor")),
            a(2, "New: Members' offers", "Bell & Barrel, Petit Foyer and Agora Meze House are now our founding partners. Discounts, complimentary pours and a members' table are all listed in Members' offers.", "normal", "Camille Laurent", -3, "See the offers"),
            a(3, "Guest chef announced: Theo Papadakis", "Theo Papadakis of Agora Meze House will cook an eight-seat Chef's Counter next week. Only eight places, and three are taken.", "high", "Camille Laurent", -2, "Reserve a place", P("show")),
            a(4, "House etiquette, refreshed", "A short reminder of how we host: phones in the coat room, no talk of work at the table, arrive on time and bring curiosity. Read the note before your next dinner.", "normal", "Camille Laurent", -8, "Read the note"),
        ]
    return [
        a(1, "Fall ladder registration is open", "Sign up for the fall ladder league by Friday. Four divisions, weekly matches, and a livestreamed finals night at the end of the season.", "high", "Diego Fontana", -1, "Sign up", P("indoor")),
        a(2, "New: junior clinic on Saturdays", "Hassan's Saturday junior clinic for kids 8 to 15 kicks off this weekend. A few spots left; sign up on the schedule tab.", "normal", "Diego Fontana", -2, "Reserve a spot"),
        a(3, "Sponsor announced: Bright Court Sports", "Bright Court Sports is our fall tournament sponsor, and members now get 15% off gear in Members' offers.", "normal", "Winston Park", -4, "See the offer", P("social")),
        a(4, "Court etiquette, refreshed", "A quick reminder: wipe down the glass after sweaty matches, respect your ladder time slot, and return loaner racquets to the front desk.", "normal", "Diego Fontana", -7, "Read the note"),
    ]


def _help_board(slug: str, U) -> List[Dict[str, Any]]:
    def h(i, uid, title, desc, cat, urgency, tags, helpers=(), days=-1):
        return {"id": f"help-{slug}-{i}", "user_id": uid, "user_snapshot": _snap(U[uid]), "space_slug": slug, "title": title, "description": desc, "category": cat, "tags": tags,
                "urgency": urgency, "image_url": None, "status": "open", "is_featured": False, "helpers": list(helpers), "created_at": iso(days), "updated_at": iso(days), "resolved_at": None}
    if slug == "grace":
        return [
            h(1, "u-g-naomi", "Ride home after Tuesday tutoring", "Tutoring finishes at 8 pm and the TTC gets thin. Would anyone be able to give me a lift toward the Annex, or share a taxi?", "Rides", "normal", ["rides", "tutoring"], ["u-g-samir"], -1),
            h(2, "u-g-elijah", "Meal train for our first month with the baby", "We're welcoming our daughter next week. A dinner or two while we find our feet would be a huge gift. Vegetarian, please, and no nuts.", "Meals & groceries", "normal", ["meals", "new baby"], ["u-g-ruth", "u-g-lucia", "u-founder-me"], -2),
            h(3, "u-g-samir", "Moving help this Saturday", "Moving a one-bedroom from Leslieville to Dovercourt Park. Need two people with strong backs and one with a van for a couple of hours. Pizza on me.", "Practical help", "high", ["moving", "van"], ["u-g-james"], -1),
            h(4, "u-g-lucia", "Babysitting swap on Sunday mornings", "Anyone with school-age kids up for swapping one Sunday a month so we each get a peaceful gathering? I'm happy to take yours in return.", "Childcare", "normal", ["childcare", "swap"], ["u-founder-me"], -3),
            h(5, "u-g-ruth", "Help carrying groceries for the Community Meal", "Tuesday mornings, about an hour, from the shop on Danforth to the hall. Two people would make it a breeze.", "Practical help", "normal", ["groceries", "volunteer"], ["u-admin-me"], -2),
            h(6, "u-founder-me", "Looking for a Connect Group on Wednesday evenings", "I'd love a small, welcoming Connect Group that meets on Wednesdays. I can bring a dessert and a listening ear. Dovercourt Park or Leslieville ideal.", "Prayer & encouragement", "normal", ["connect group", "welcome"], ["u-g-lucia", "u-g-priscilla"], -1),
            h(7, "u-g-david", "Two adults needed for Youth Night on Thursdays", "We're looking for two more adults to help supervise games and pizza on Thursday evenings. A police check is provided. It's about three hours a week.", "Practical help", "high", ["youth", "volunteer"], [], -1),
            h(8, "u-g-helen", "Prayers and encouragement for our newcomer families", "Several families joined us in the past month. If you can, say hello on Sunday or drop a note in the welcome box, because it makes a big difference.", "Prayer & encouragement", "normal", ["welcome", "encouragement"], ["u-g-priscilla", "u-g-admin"], -4),
        ]
    if slug == "the-village":
        return [
            h(1, "u-t-daniel", "Seeking a plus-one for the Autumn Harvest dinner", "My usual guest is travelling. I'd love to bring someone curious who enjoys good conversation and doesn't mind a slow pace. Happy to cover the seat.", "Plus-ones & guests", "normal", ["plus-one", "dinner"], ["u-t-amira"], -1),
            h(2, "u-t-ines", "Looking for Jura allocations", "Trying to source a few cases of Savagnin and Poulsard for the Salon. If any of you know a small importer with a spare allocation, an introduction would help.", "Wine & sourcing", "normal", ["wine", "sourcing"], ["u-t-marguerite"], -2),
            h(3, "u-t-victor", "Venue for a private 30th-anniversary dinner", "Thirty guests, a Saturday in November, somewhere with atmosphere and a real kitchen. Ideas welcome, including private dining rooms not on the usual lists.", "Venues & private events", "high", ["venue", "private event"], ["u-t-admin", "u-t-theo"], -1),
            h(4, "u-t-julien", "A reliable game supplier", "I need pheasant, quail and a little venison from a small Ontario farm. Ideally someone who delivers to downtown twice a week.", "Wine & sourcing", "normal", ["sourcing", "game", "producers"], ["u-t-theo"], -3),
            h(5, "u-t-sasha", "Introductions to florists who love foraged material", "Looking for a florist for table arrangements with seasonal, foraged material: branches, herbs, berries. Low and unfussy.", "Introductions", "normal", ["flowers", "tableware", "collaboration"], ["u-t-rosa"], -2),
            h(6, "u-t-amira", "Chefs willing to be interviewed for my book", "I'm writing about supper clubs and would love thirty minutes with anyone who runs one, or cooks at one. Coffee on me.", "Introductions", "normal", ["writing", "interview"], ["u-t-julien", "u-t-theo"], -2),
            h(7, "u-t-rosa", "A north-facing studio for a chef portrait series", "I'm shooting portraits of local chefs in their own kitchens and need a couple of extra locations with good light. Suggestions welcome.", "Venues & private events", "normal", ["photography", "location"], ["u-t-victor"], -4),
            h(8, "u-t-felix", "Non-alcoholic pairing ideas for the Loft dinners", "I'd like to build a proper zero-proof pairing for the dinners. Would anyone like to taste through a few options before the next dinner?", "Introductions", "normal", ["non-alcoholic", "pairing"], ["u-t-ines", "u-t-sasha"], -1),
        ]
    return [
        h(1, "u-p-owen", "Ride-share from Roncesvalles for Tuesday ladder", "I drive in most Tuesdays and have two spare seats. Happy to pick up along Roncesvalles or Bloor West if anyone wants to skip the streetcar with a racquet bag.", "Rides", "normal", ["rides", "ladder"], ["u-p-priya"], -1),
        h(2, "u-p-priya", "Photographer for the fall mixer", "Looking for anyone handy with a camera to shoot the fall mixer and sponsor night. Happy to comp your guest ticket.", "Volunteers", "normal", ["photography", "volunteer"], ["u-p-owen"], -2),
        h(3, "u-p-hassan", "Two more volunteers for the junior clinic", "Saturday mornings, 9 to 11. No coaching experience needed, just patience with 8-to-15-year-olds and a decent forehand.", "Volunteers", "high", ["juniors", "volunteer"], ["u-p-aiko"], -1),
        h(4, "u-p-elena", "Spare padel shoes, size 8-9 women's", "Restringing a pair someone left months ago and never claimed. If they're yours, or you just need a spare pair that size, come find me at the front desk.", "Equipment", "normal", ["equipment", "shoes"], [], -3),
        h(5, "u-p-jordan", "Co-commentator for the ladder finals livestream", "Streaming the finals solo gets long. Looking for someone who knows the ladder standings to jump on mic for commentary.", "Volunteers", "normal", ["livestream", "volunteer"], ["u-p-marcus"], -2),
        h(6, "u-p-natasha", "Practice partner for Wednesday footwork drills", "Looking for a regular Wednesday evening partner to run footwork and wall drills with, roughly intermediate level.", "Partners", "normal", ["practice partner", "footwork"], ["u-p-winston"], -1),
        h(7, "u-p-winston", "Local businesses for the fall tournament prize table", "Chasing a few more prize donations for the fall tournament: gear, gift cards, anything padel-adjacent. Introductions welcome.", "Sponsorship", "normal", ["sponsorship", "introductions"], ["u-p-marcus"], -4),
        h(8, "u-p-aiko", "Beginner partner for Sunday mornings", "New to padel and looking for another beginner to hit with before the Sunday round robin gets going. No pressure, just rallying.", "Partners", "normal", ["beginners", "practice partner"], ["u-founder-me"], -2),
    ]


def _notifications(slug: str, U) -> List[Dict[str, Any]]:
    def n(uid, kind, title, body, link, read, **when):
        return {"id": str(uuid.uuid4()), "user_id": uid, "kind": kind, "title": title, "body": body, "link": link, "meta": {}, "read": read, "created_at": iso(**when)}
    if slug == "grace":
        return [
            n("u-founder-me", "value_match", "You could help: Babysitting swap on Sunday mornings", "Matches your skill: Childcare", "/support", False, hours=-4),
            n("u-founder-me", "help_offer", "Lucia Fernandes offered to help", "Looking for a Connect Group on Wednesday evenings", "/support", False, hours=-20),
            n("u-founder-me", "connect_request", "Pastor Jonathan sent you a note", "Thanks for helping with the welcome table on Sunday", "/support", True, days=-1),
            n(GRACE_ADMIN, "member_request", "Two new membership requests", "Anita Sharma and Peter Novak are waiting for a welcome", "/admin", False, hours=-6),
        ]
    if slug == "the-village":
        return [
            n(TN_ADMIN, "member_request", "Two new membership requests", "Elliot Grant and Mei Zhang are waiting for a decision", "/admin", False, hours=-3),
            n(TN_ADMIN, "help_offer", "Marguerite Bell offered to help", "Looking for Jura allocations", "/support", False, hours=-18),
            n(TN_ADMIN, "value_match", "You could help: Venue for a private anniversary dinner", "Matches your expertise: Hosting", "/support", True, days=-1),
        ]
    return [
        n("u-founder-me", "value_match", "You could help: Beginner partner for Sunday mornings", "Matches your skill: Doubles strategy", "/support", False, hours=-5),
        n("u-founder-me", "help_offer", "Owen Bennett offered you a ride", "Ride-share from Roncesvalles for Tuesday ladder", "/support", False, hours=-22),
        n(PTO_ADMIN, "member_request", "Two new membership requests", "Ben Torres and Layla Haddad are waiting for a decision", "/admin", False, hours=-4),
    ]


# --------------------------------------------------------------------------------------------- config
def _config(slug: str) -> Dict[str, Any]:
    from routes.community_config import DEFAULT_CONFIG
    cfg = copy.deepcopy(DEFAULT_CONFIG)
    nav = {n["key"]: n for n in cfg["nav"]}

    def set_nav(**labels):
        for k, v in labels.items():
            nav[k]["label"] = v

    def profile(title_l, skills_l, int_l, goals_l, needs_l):
        return {"fields": [{"key": "age", "label": "Age", "enabled": False}, {"key": "height", "label": "Height", "enabled": False}, {"key": "title", "label": title_l, "enabled": True},
                           {"key": "skill_set", "label": skills_l, "enabled": True}, {"key": "interests_hobbies", "label": int_l, "enabled": True},
                           {"key": "goals", "label": goals_l, "enabled": True}, {"key": "support_needs", "label": needs_l, "enabled": True}]}
    if slug == "grace":
        set_nav(members="Congregation", matches="Connections", events="Gatherings", resources="Resources", updates="News", requests="To-do", support="Needs board")
        cfg.update(
            community_name="C3", tagline="Encounter Jesus and find home. Downtown Toronto.", community_type="social",
            theme={"preset": "custom", "accent": "#EA2401"}, member_label_singular="Member", member_label_plural="Congregation",
            member_types={"founder": "Member", "mentor": "Leader", "alumni": "Friend", "partner": "Pastoral staff", "guest": "Visitor"},
            profile=profile("Occupation", "Ways I can serve", "Interests", "Hopes for this year", "Where I'd welcome help"),
            event_types=["Sunday Gathering", "Community Meal", "Connect Group", "Volunteer Day", "Youth Night", "Prayer Evening", "Women's Night", "Fundraiser"],
            support_categories=["Rides", "Meals & groceries", "Practical help", "Childcare", "Tutoring & mentoring", "Prayer & encouragement", "Other"],
            signup_fields=[{"key": "title", "label": "Occupation", "type": "text", "required": False}, {"key": "skill_set", "label": "Ways you could serve (e.g. childcare, cooking, tech)", "type": "tags", "required": False},
                           {"key": "interests_hobbies", "label": "Interests", "type": "tags", "required": False}],
            page_text={"members_title": "Our congregation", "members_subtitle": "Neighbours, families and volunteers at C3 Downtown. Say hello, find a friend or see who serves where.",
                       "events_title": "Gatherings", "events_subtitle": "Sunday gatherings, meals, Connect Groups, volunteer Teams and evenings of prayer.",
                       "resources_title": "Ways to serve & community resources", "resources_subtitle": "Volunteer opportunities and free help from our congregation for our neighbours.",
                       "support_title": "Needs board", "support_subtitle": "Ask for a ride, a meal or a helping hand, and offer help when you can. Please keep requests practical and share only what you're comfortable with.",
                       "requests_title": "Your to-do", "requests_subtitle": "Forms and notes from the church office.",
                       "matches_title": "People to meet", "matches_subtitle": "Neighbours, gatherings and ways to serve chosen for you.",
                       "updates_title": "Church news", "updates_subtitle": "Notes and announcements from Pastor Jonathan and the team.",
                       "ask_title": "Ask C3", "ask_subtitle": "Find a Connect Group, a Team to serve on or someone who can help."},
            community_kind="church", country="Canada", interest_tags=["Faith"],
            about="C3 is a friendly, multigenerational church at our Downtown Toronto campus near Dovercourt Park. We gather on Sunday mornings across three services, share a free Community Meal every Tuesday and look after each other through Connect Groups, C3 Kids, Youth, tutoring and volunteer Teams. Everyone is welcome, whatever they believe or wherever they are on the journey.",
            apply_questions=[{"key": "referral", "label": "How did you hear about us?", "placeholder": "A neighbour, a poster, the Community Meal..."},
                             {"key": "hope", "label": "Is there something you're hoping to find here?", "placeholder": "Friends, a Connect Group, a way to serve..."}],
        )
        brand = {"preset": "custom", "mode": "dark", "font": "Inter", "heading_font": "Plus Jakarta Sans", "heading_style": "normal", "radius": "soft", "button_shape": "rounded",
                 "colors": {"accent": "#EA2401", "on_accent": "#FFFFFF", "background": "#042D49", "surface": "#0B3A5C", "text": "#F3F7FA", "muted": "#7C96AD", "border": "#12507A"},
                 "login_headline": "Encounter Jesus and find home.", "login_subhead": "Sign in to find gatherings, Connect Groups and neighbours who can help.",
                 "welcome_message": "Welcome to C3. Here is what is happening in our church family this week.", "footer_text": "C3 Toronto · 12 Pauline Avenue, Toronto · All are welcome",
                 "support_email": "office@c3.example"}
    elif slug == "the-village":
        set_nav(members="Guests", matches="Introductions", events="Dinners", resources="Members' offers", updates="Dispatch", requests="To-do", support="Requests")
        cfg.update(
            community_name="The Village", tagline="Invite-only long-table dinners in Toronto. Fourteen guests, one table.", community_type="social",
            theme={"preset": "custom", "accent": "#F4B65C"}, member_label_singular="Guest", member_label_plural="Guests",
            member_types={"founder": "Guest", "mentor": "Chef", "alumni": "Founding guest", "partner": "Host", "guest": "Plus-one"},
            profile=profile("Profession", "Skills & craft", "Tastes & interests", "What I'm working on", "What I'm seeking"),
            event_types=["Long Table Dinner", "Chef's Counter", "Wine Salon", "Market Morning", "Members' Supper"],
            support_categories=["Plus-ones & guests", "Wine & sourcing", "Venues & private events", "Introductions", "Collaborations", "Other"],
            signup_fields=[{"key": "title", "label": "Profession", "type": "text", "required": False}, {"key": "skill_set", "label": "Craft or expertise", "type": "tags", "required": False},
                           {"key": "interests_hobbies", "label": "Favourite foods & wines", "type": "tags", "required": False}],
            page_text={"members_title": "The guest book", "members_subtitle": "Chefs, sommeliers, makers and regulars around the long table.",
                       "events_title": "Dinners & evenings", "events_subtitle": "Long tables, counters, salons and markets. Seats are limited and go quickly.",
                       "resources_title": "Members' offers", "resources_subtitle": "Partner restaurants, wine merchants and priority access, exclusively for members.",
                       "support_title": "Introductions & requests", "support_subtitle": "Seeking a plus-one, a bottle, a room or an introduction? Ask the table.",
                       "requests_title": "Your to-do", "requests_subtitle": "Notes and confirmations from the host.",
                       "matches_title": "Introductions", "matches_subtitle": "Guests, dinners and offers chosen for your tastes and what you're looking for.",
                       "updates_title": "The Dispatch", "updates_subtitle": "Menus, guest chefs and house notes from Camille.",
                       "ask_title": "Ask The Village", "ask_subtitle": "Find a seat, a pairing or someone at the table who can help."},
            community_kind="dinner club", country="Canada", interest_tags=["Food & Dining"],
            about="The Village is a members-only supper club in Toronto. Once or twice a month, fourteen guests sit down at one long table for a chef-led dinner with wine pairings. Between dinners, members meet at wine Salons, market mornings and counter evenings with guest chefs. Membership is by invitation and application.",
            apply_questions=[{"key": "referral", "label": "Who referred you?", "placeholder": "A member's name, or how you came across us"},
                             {"key": "love", "label": "What do you love to eat?", "placeholder": "A dish, a region, a memorable meal..."}],
        )
        brand = {"preset": "custom", "mode": "light", "font": "Inter", "heading_font": "Playfair Display", "heading_style": "normal", "radius": "sharp", "button_shape": "square",
                 "colors": {"accent": "#F4B65C", "on_accent": "#2B1B0E", "background": "#FFFFFF", "surface": "#FFFBF3", "text": "#211A12", "muted": "#7A6F5E", "border": "#EDE3D2"},
                 "login_headline": "A seat at the table.", "login_subhead": "Members sign in to reserve dinners, salons and offers.",
                 "welcome_message": "Good evening. Here is what is coming to the table.", "footer_text": "The Village · By invitation · Toronto", "support_email": "host@thevillage.example"}
    else:
        set_nav(members="Members", matches="Introductions", events="On the schedule", resources="Members' offers", updates="Club news", requests="To-do", support="Requests")
        cfg.update(
            community_name="Club PTO", tagline="A padel club for players of every level. Toronto.", community_type="social",
            theme={"preset": "custom", "accent": "#023E3F"}, member_label_singular="Member", member_label_plural="Members",
            member_types={"founder": "Member", "mentor": "Coach", "alumni": "Alumni", "partner": "Staff", "guest": "Guest"},
            profile=profile("Occupation", "Skills & coaching", "Interests", "Goals on court", "What I'm looking for"),
            event_types=["Ladder League", "Beginner Clinic", "Junior Camp", "Footwork Clinic", "Round Robin Social", "Equipment Pop-Up", "Fall Mixer"],
            support_categories=["Rides", "Partners", "Volunteers", "Equipment", "Sponsorship", "Other"],
            signup_fields=[{"key": "title", "label": "Occupation", "type": "text", "required": False}, {"key": "skill_set", "label": "Skills or ways you can help", "type": "tags", "required": False},
                           {"key": "interests_hobbies", "label": "Interests", "type": "tags", "required": False}],
            page_text={"members_title": "Our members", "members_subtitle": "Ladder regulars, coaches and newer players around Club PTO.",
                       "events_title": "On the schedule", "events_subtitle": "Ladder nights, clinics, socials and the fall tournament.",
                       "resources_title": "Members' offers & resources", "resources_subtitle": "Discounts, guides and ways to help from your fellow members.",
                       "support_title": "Requests board", "support_subtitle": "Need a ride, a practice partner or a hand with equipment? Ask here, and offer help when you can.",
                       "requests_title": "Your to-do", "requests_subtitle": "Notes and confirmations from the club office.",
                       "matches_title": "Introductions", "matches_subtitle": "Members, matches and clinics chosen for your level and goals.",
                       "updates_title": "Club news", "updates_subtitle": "Ladder results, clinic announcements and news from the coaches.",
                       "ask_title": "Ask Club PTO", "ask_subtitle": "Find a partner, a clinic or a coach who can help."},
            community_kind="padel club", country="Canada", interest_tags=["Sports", "Parenting"],
            about="Club PTO is a padel club in Toronto with three courts, a weekly ladder league, and coaching for every level from total beginners to tournament players. We run clinics, socials, junior camps and a livestreamed ladder final each season. Members get priority court booking, equipment perks and a genuinely friendly bunch of regulars.",
            apply_questions=[{"key": "referral", "label": "How did you hear about us?", "placeholder": "A friend, a walk-by, a search..."},
                             {"key": "level", "label": "What's your playing level?", "placeholder": "Total beginner, casual, competitive..."}],
        )
        brand = {"preset": "custom", "mode": "light", "font": "Inter", "heading_font": "Plus Jakarta Sans", "heading_style": "normal", "radius": "soft", "button_shape": "rounded",
                 "colors": {"accent": "#023E3F", "on_accent": "#FFFFFF", "background": "#F0E5D4", "surface": "#F8F3EC", "text": "#1C1F1D", "muted": "#66645D", "border": "#D0C7B8"},
                 "login_headline": "A padel club for every level.", "login_subhead": "Sign in for the ladder, clinics and everything on the schedule.",
                 "welcome_message": "Welcome to Club PTO. Here is what's on the courts this week.", "footer_text": "Club PTO · Toronto", "support_email": "info@clubpto.example"}
    b = dict(cfg["brand"])
    b.update(brand)
    logo_url, logo_mark_url, show_name = _logo(slug)
    b.update(logo_url=logo_url, logo_mark_url=logo_mark_url, logo_adapts=False, show_name_with_logo=show_name)
    cfg["brand"] = b
    cfg["nav"] = [nav[n["key"]] for n in DEFAULT_CONFIG["nav"]]
    cfg["require_approval"] = True
    cfg["hub_cover"] = _hub_cover(slug)
    return cfg


# --------------------------------------------------------------------------------------------- seeding
async def seed_community(dbx, slug: str, force: bool = False) -> bool:
    if slug not in COMMUNITY_SLUGS_NEW:
        raise ValueError(f"Unknown community slug: {slug}")
    marker = await dbx.community_config.find_one({"_key": f"{slug}_seed"})
    if marker and not force:
        return False
    for c in WIPE:
        await dbx[c].delete_many({})
    await dbx.community_config.delete_many({})
    pw = hash_password(os.environ.get("DEMO_PASSWORD") or "Demo123!")

    users = _users(slug, pw)
    await dbx.users.insert_many([dict(u) for u in users])
    U = {u["id"]: u for u in users}
    await dbx.events.insert_many(_events(slug, U))
    await dbx.resources.insert_many(_resources(slug, U))
    await dbx.announcements.insert_many(_announcements(slug, U))
    await dbx.support_requests.insert_many(_help_board(slug, U))
    await dbx.notifications.insert_many(_notifications(slug, U))

    cfg = _config(slug)
    from routes.community_config import DEFAULT_PROFILE
    cfg["profile"] = {"fields": [{**f, "enabled": False} if f["key"] in ("age", "height") else dict(f) for f in DEFAULT_PROFILE["fields"]]}
    cfg.update(_key="singleton", updated_at=iso())
    await dbx.community_config.insert_one(cfg)
    await dbx.community_config.insert_one({"_key": f"{slug}_seed", "at": iso()})
    return True
