"""Pathwai community chatbot — grounded Q&A over seeded community data.

The chatbot answers queries about events, resources, people, announcements,
Slack signals, email updates and matches by injecting compact summaries of the
relevant Mongo collections as system context, then handing the conversation to
GPT-5.2 via the Emergent LLM key. Conversation history is persisted per
session_id in the `chat_messages` collection so the user can resume.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage

MODEL_PROVIDER = "openai"
MODEL_NAME = "gpt-5.2"

ROLE_LABEL = {
    "founder": "Player",
    "mentor": "Mentor",
    "alumni": "Alumni",
    "member": "Community member",
    "admin": "Community team",
}


# ---------- system prompt builder ----------
def _fmt_date(value: Any) -> str:
    if not value:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%a %b %d, %H:%M UTC")
    s = str(value)
    return s.replace("T", " ").split(".")[0]


def _truncate(text: str, n: int = 160) -> str:
    if not text:
        return ""
    text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 1] + "…"


async def build_context_prompt(db, me: Optional[dict]) -> str:
    """Pull condensed summaries of every collection so the LLM can answer grounded questions."""
    lines: list[str] = []

    # Persona — the viewer the bot is helping
    if me:
        lines.append("VIEWER (the person you are helping):")
        lines.append(
            f"- {me.get('name')} · {ROLE_LABEL.get(me.get('role'), me.get('role'))} · "
            f"{me.get('title') or ''} at {me.get('company') or ''} · {me.get('location') or ''}".strip(" ·")
        )
        if me.get("cohort"):
            lines.append(f"- Cohort: {me['cohort']}")
        if me.get("bio"):
            lines.append(f"- Bio: {_truncate(me['bio'], 220)}")
        # UNIFIED PATHWAI PROFILE — new fields
        if me.get("business_industry_focus"):
            lines.append(f"- Business / industry focus: {me['business_industry_focus']}")
        if me.get("product_description"):
            lines.append(f"- Product: {_truncate(me['product_description'], 240)}")
        if me.get("traction"):
            lines.append(f"- Traction: {_truncate(me['traction'], 200)}")
        if me.get("vision"):
            lines.append(f"- Vision: {_truncate(me['vision'], 200)}")
        if me.get("skill_set"):
            lines.append(f"- Skill set: {', '.join((me.get('skill_set') or [])[:8])}")
        if me.get("needs_seeking"):
            lines.append(f"- Actively seeking: {', '.join((me.get('needs_seeking') or [])[:6])}")
        if me.get("hats"):
            lines.append(f"- Wearing hats: {', '.join(me['hats'])}. Active hat: {me.get('active_hat') or me['hats'][0]}")
        if me.get("strengths"):
            lines.append(f"- Strong in: {', '.join(me['strengths'][:6])}")
        if me.get("growing_in"):
            lines.append(f"- Growing in: {', '.join(me['growing_in'][:6])}")
        if me.get("support_needs"):
            lines.append(f"- Support needs (ranked): {', '.join(me['support_needs'][:6])}")

        # Memberships the viewer already belongs to
        memberships = [m async for m in db.memberships.find(
            {"user_id": me["id"], "status": "approved"}
        ).limit(20)]
        if memberships:
            names = [m.get("org_name") or m.get("org_slug") for m in memberships]
            lines.append(f"- Already inside these communities: {', '.join(n for n in names if n)}")
        lines.append("")

    # Upcoming events
    events = [e async for e in db.events.find({"is_past": {"$ne": True}}).sort("starts_at", 1).limit(8)]
    if events:
        lines.append("UPCOMING EVENTS (Luma):")
        for e in events:
            who = f"by {e.get('host')}" if e.get("host") else ""
            where = e.get("location") or e.get("venue") or ""
            rec = "★ recommended for you" if me and me.get("role") in (e.get("recommended_for_roles") or []) else ""
            lines.append(
                f"- [{e.get('id')}] {e.get('title')} — {_fmt_date(e.get('starts_at'))} — {where} {who} {rec}".rstrip()
            )
            if e.get("description"):
                lines.append(f"    {_truncate(e['description'], 160)}")
        lines.append("")

    # Resources
    resources = [r async for r in db.resources.find().sort("published_at", -1).limit(12)]
    if resources:
        lines.append("RESOURCES (Disco):")
        for r in resources:
            tags = ", ".join((r.get("tags") or [])[:4])
            lines.append(
                f"- [{r.get('id')}] {r.get('title')} — {r.get('category') or r.get('source') or ''} — tags: {tags}"
            )
            if r.get("description"):
                lines.append(f"    {_truncate(r['description'], 140)}")
        lines.append("")

    # People directory (exclude the viewer themselves to keep prompt tight)
    user_query = {"id": {"$ne": me["id"]}} if me else {}
    people = [u async for u in db.users.find(user_query).limit(20)]
    if people:
        lines.append("COMMUNITY DIRECTORY:")
        for u in people:
            chips = ", ".join((u.get("strengths") or u.get("expertise") or [])[:4])
            lines.append(
                f"- [{u.get('id')}] {u.get('name')} · {ROLE_LABEL.get(u.get('role'), u.get('role'))} · "
                f"{u.get('title') or ''} @ {u.get('company') or ''} · {u.get('location') or ''} — {chips}".strip()
            )
        lines.append("")

    # Announcements
    anns = [a async for a in db.announcements.find().sort("published_at", -1).limit(6)]
    if anns:
        lines.append("RECENT ANNOUNCEMENTS:")
        for a in anns:
            lines.append(f"- {a.get('title')} ({_fmt_date(a.get('published_at'))}) — {_truncate(a.get('body') or a.get('summary') or '', 160)}")
        lines.append("")

    # Slack signals
    slack = [s async for s in db.slack_signals.find().sort("posted_at", -1).limit(6)]
    if slack:
        lines.append("SLACK SIGNALS (curated, not chat):")
        for s in slack:
            lines.append(
                f"- #{s.get('channel') or 'general'} · {s.get('headline') or s.get('summary') or ''} ({_fmt_date(s.get('posted_at'))})"
            )
        lines.append("")

    # Email updates
    emails = [e async for e in db.email_updates.find().sort("received_at", -1).limit(6)]
    if emails:
        lines.append("EMAIL UPDATES:")
        for e in emails:
            star = "★ important" if e.get("is_important") else ""
            lines.append(f"- {e.get('subject')} — {e.get('sender') or ''} ({_fmt_date(e.get('received_at'))}) {star}".rstrip())
        lines.append("")

    # LAYER 1 — Innovation spaces (organizations + programs) so the copilot can
    # answer "which programs fit me?" and "draft my pitch for org X".
    orgs = [o async for o in db.organizations.find().sort("verified", -1).limit(30)]
    if orgs:
        lines.append("INNOVATION SPACES (Layer 1 directory — programs the viewer can apply to):")
        for o in orgs:
            head = f"[{o.get('slug')}] {o.get('name')} · {o.get('type')} · {o.get('headquarters') or o.get('region') or ''}"
            focus = ", ".join((o.get('focus_areas') or [])[:5])
            stages = ", ".join((o.get('stages') or [])[:4])
            lines.append(f"- {head} — focus: {focus} · stages: {stages}")
            for p in (o.get('programs') or [])[:3]:
                lines.append(
                    f"    · Program: {p.get('name')} — {p.get('stage') or ''} · {p.get('intake_status') or 'open'} — {_truncate(p.get('description') or '', 140)}"
                )
        lines.append("")

    # LAYER 2 — Mentors (public opt-in list) so copilot can suggest external mentors too.
    mentors = [m async for m in db.mentors.find().limit(12)]
    if mentors:
        lines.append("PUBLIC MENTORS ON PATHWAI (Layer 2):")
        for m in mentors:
            lines.append(
                f"- {m.get('name')} · {m.get('title') or ''} @ {m.get('company') or ''} — "
                f"expertise: {', '.join((m.get('expertise') or [])[:4])}"
            )
        lines.append("")

    return "\n".join(lines)


SYSTEM_RULES = """You are **Coach Pilot** — the member-facing AI assistant for The Playr League, a community sports league.

Your job is to help members get the most out of their community:
1. **Discover people.** When someone asks "who can help me with X?" or "who
   should I connect with?", recommend 2–3 people from the COMMUNITY DIRECTORY
   based on their offers, skills, profession, or interests — with a one-line
   "why" for each.
2. **Surface opportunities.** Point members to relevant events, resources,
   support requests, and offers already inside the community.
3. **Draft messages.** When asked to "draft an intro to <person>" or "help
   me post a request", write a tight, warm message that reflects the viewer's
   own profile.
4. **Explain the community.** Answer factual questions ("what events are
   coming up?", "who joined recently?", "what skills are represented here?")
   using only the snapshot below.

Ground every answer in the community snapshot below — do not invent people,
events, resources, or requests that aren't listed. If the answer isn't in the
snapshot, say so plainly and suggest where the user might look.

Style: Conversational, concise, member-friendly. 1–3 short paragraphs or a
tight bulleted list. Weave names naturally — don't print raw ids unless asked.
When suggesting people, explain *why* in one phrase. Never speculate about
private contact details. It's okay to say "I'm not sure" — don't bluff.
"""


def build_system_message(context: str) -> str:
    return SYSTEM_RULES + "\n\n=== COMMUNITY SNAPSHOT (the only source of truth) ===\n" + context


# ---------- session / history persistence ----------
async def get_or_create_session(db, session_id: Optional[str], role: str) -> str:
    if session_id:
        existing = await db.chat_sessions.find_one({"session_id": session_id})
        if existing:
            return session_id
    new_id = session_id or f"sess-{uuid.uuid4().hex[:12]}"
    await db.chat_sessions.insert_one({
        "session_id": new_id,
        "role": role,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return new_id


async def load_history(db, session_id: str, limit: int = 30) -> list[dict]:
    cursor = db.chat_messages.find({"session_id": session_id}).sort("ts", 1).limit(limit)
    return [
        {"role": m["role"], "content": m["content"], "ts": m["ts"]}
        async for m in cursor
    ]


async def append_message(db, session_id: str, role: str, content: str) -> None:
    await db.chat_messages.insert_one({
        "session_id": session_id,
        "role": role,  # "user" or "assistant"
        "content": content,
        "ts": datetime.now(timezone.utc).isoformat(),
    })


# ---------- main chat handler ----------
async def send_chat(db, session_id: str, viewer_role: str, message: str) -> str:
    """Send a message to gpt-5.2 with grounded community context. Returns the assistant reply."""
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY is not configured on the server.")

    me = await db.users.find_one({"is_demo_me_for_role": viewer_role}) or await db.users.find_one({"role": viewer_role})
    if me:
        me.pop("_id", None)

    context = await build_context_prompt(db, me)
    system_message = build_system_message(context)

    chat = LlmChat(
        api_key=api_key,
        session_id=session_id,
        system_message=system_message,
    ).with_model(MODEL_PROVIDER, MODEL_NAME)

    # Replay history so the model has prior turns (LlmChat instances are per-request).
    history = await load_history(db, session_id, limit=20)
    # The library's send_message internally appends to its own history; we re-seed by
    # passing previous user turns as a single contextual recap so the assistant stays coherent.
    if history:
        recap_lines = []
        for h in history[-10:]:
            who = "User" if h["role"] == "user" else "You"
            recap_lines.append(f"{who}: {_truncate(h['content'], 220)}")
        recap = "PRIOR CONVERSATION (most recent last):\n" + "\n".join(recap_lines)
        chat.system_message = system_message + "\n\n" + recap

    reply = await chat.send_message(UserMessage(text=message))

    await append_message(db, session_id, "user", message)
    await append_message(db, session_id, "assistant", reply)
    return reply


# ---------- quick-start prompt chips ----------
QUICK_STARTS_BY_ROLE: dict[str, list[str]] = {
    "founder": [
        "Who here can give me career advice?",
        "Who could help me with my side business?",
        "Which game nights match my level this month?",
        "Draft a short message asking someone to be my mentor",
    ],
    "mentor": [
        "Which players are asking for coaching in my area?",
        "What clinics are coming up that I could join?",
        "Which players are new this season?",
        "Draft a welcome message for a new player",
    ],
    "member": [
        "How do I find a team in the league?",
        "What events are open to me this month?",
        "Show me beginner-friendly guides",
        "Who are the most active coaches right now?",
    ],
    "admin": [
        "What are players asking for help with most this week?",
        "Which events still have open spots?",
        "Which players haven't completed their profile?",
        "Who could help run the next clinic?",
    ],
}
