"""Profile check-in module.

Admin systems schedule check-ins for users (founders, alumni) to keep their
profiles current. Users respond with either typed text or by uploading a PDF.
GPT-5.2 extracts structured field updates from whichever response was given
and the user reviews each proposed change before it lands on their profile.
"""
from __future__ import annotations

import io
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage

from chatbot import MODEL_NAME, MODEL_PROVIDER

logger = logging.getLogger(__name__)


# ---------- field catalogue ----------
# The fields admin can request. Each entry defines the value shape and a
# human prompt. The LLM extractor is told these shapes so it returns matching
# structures.
FIELD_CATALOGUE: dict[str, dict] = {
    "bio": {
        "label": "Founder bio",
        "type": "string",
        "prompt": "Has your bio changed? Share a 2–3 sentence updated bio.",
    },
    "venture_tagline": {
        "label": "Venture tagline",
        "type": "string",
        "prompt": "One-line description of what your venture is building today.",
    },
    "support_needs": {
        "label": "Support needs (ranked)",
        "type": "list",
        "prompt": "What 3–5 things do you need help with this quarter, in priority order?",
    },
    "growing_in": {
        "label": "Growing in",
        "type": "list",
        "prompt": "Which 2–4 areas are you actively trying to grow in right now?",
    },
    "strengths": {
        "label": "Strengths",
        "type": "list",
        "prompt": "What are you strongest at today? Share 3–6 strengths.",
    },
    "achievements": {
        "label": "Recent achievements",
        "type": "list",
        "prompt": "Wins, milestones, or press from the last quarter — one per line.",
    },
    "program_goals": {
        "label": "Program goals",
        "type": "list_of_goals",
        "prompt": "Your 2–3 goals for this quarter. Include a target due month and a rough % progress.",
    },
    "biggest_hurdle": {
        "label": "Biggest hurdle",
        "type": "string",
        "prompt": "What's the one thing most blocking you right now?",
    },
    "venture_traction": {
        "label": "Venture traction",
        "type": "list_of_pairs",
        "prompt": "Key traction numbers (ARR, customers, team size, etc.). Each as 'value: label' (e.g. '$2.4M: ARR').",
    },
}


# ---------- helpers ----------
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def _resolve_current_value(user: dict, key: str) -> Any:
    """Pull the current profile value for a catalogue key."""
    if key == "venture_traction":
        return (user.get("venture") or {}).get("traction") or []
    return user.get(key)


async def _apply_value_to_user(db, user_id: str, key: str, value: Any) -> None:
    """Persist an accepted value back to the user document."""
    update_set: dict[str, Any] = {"updated_at": _now_iso()}
    if key == "venture_traction":
        # nested merge under venture.traction
        existing = await db.users.find_one({"id": user_id})
        venture = dict((existing or {}).get("venture") or {})
        venture["traction"] = value
        update_set["venture"] = venture
    else:
        update_set[key] = value
    await db.users.update_one({"id": user_id}, {"$set": update_set})


# ---------- PDF + text extraction ----------
def extract_pdf_text(content: bytes) -> str:
    """Extract plain text from a PDF byte stream. Returns '' on failure."""
    try:
        import pypdf

        reader = pypdf.PdfReader(io.BytesIO(content))
        parts: list[str] = []
        for page in reader.pages[:30]:  # cap at 30 pages
            try:
                parts.append(page.extract_text() or "")
            except Exception:  # noqa: BLE001
                continue
        text = "\n".join(parts)
        # Trim outsized whitespace
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()
    except Exception as exc:  # noqa: BLE001
        logger.warning("pdf parse failed: %s", exc)
        return ""


# ---------- LLM extraction ----------
_EXTRACTION_SYSTEM = """You are a careful information-extraction assistant for the Pathwai
member portal. You receive (1) a list of profile fields the admin team is
asking the user to refresh, (2) the user's current values for each, and (3)
the user's response (either typed text or text extracted from a PDF).

Your job is to propose updated values ONLY for the fields you can confidently
infer from the response. Never invent values that aren't supported by the
response.

Return ONLY a JSON object with this shape — no prose, no markdown fences:

{
  "updates": [
    {
      "key": "<one of the catalogue keys>",
      "value": <new value matching the expected type>,
      "confidence": <0.0-1.0>,
      "note": "<one short sentence on how you inferred it>"
    }
  ]
}

Value types per catalogue key:
- string       → a plain string
- list         → an array of strings
- list_of_goals → an array of objects: {"title","due","progress","description"} (progress is 0-100, due is a short month like "Aug" or a date)
- list_of_pairs → an array of objects: {"value","label"}

Rules:
- Only include keys that the user clearly addressed. Skip silent fields.
- Strip filler ("um", "you know", etc.) and tighten phrasing.
- Numbers in traction (revenue, ARR, customers, team size) must be quoted exactly as the user reported them.
- If unsure, lower the confidence and explain why in the note.
"""


def _build_extraction_user_message(fields: list[dict], current_values: dict[str, Any], response_text: str, source_kind: str) -> str:
    field_lines: list[str] = []
    for f in fields:
        meta = FIELD_CATALOGUE.get(f["key"]) or {}
        field_lines.append(
            f"- key: {f['key']}\n"
            f"  label: {meta.get('label') or f['key']}\n"
            f"  expected_type: {meta.get('type')}\n"
            f"  prompt: {meta.get('prompt')}\n"
            f"  current_value: {json.dumps(current_values.get(f['key']))[:600]}"
        )
    return (
        f"SOURCE: {source_kind}\n\n"
        "REQUESTED FIELDS:\n" + "\n".join(field_lines) + "\n\n"
        "USER RESPONSE (verbatim):\n\"\"\"\n" + response_text + "\n\"\"\""
    )


async def _extract_updates(fields: list[dict], current_values: dict[str, Any], response_text: str, source_kind: str) -> list[dict]:
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY is not configured on the server.")
    if not response_text.strip():
        return []
    chat = LlmChat(
        api_key=api_key,
        session_id=f"extract-{uuid.uuid4().hex[:8]}",
        system_message=_EXTRACTION_SYSTEM,
    ).with_model(MODEL_PROVIDER, MODEL_NAME)
    raw = await chat.send_message(UserMessage(text=_build_extraction_user_message(fields, current_values, response_text, source_kind)))
    return _parse_json_updates(raw, fields)


def _parse_json_updates(raw: str, fields: list[dict]) -> list[dict]:
    """Robustly parse the LLM JSON output."""
    valid_keys = {f["key"] for f in fields}
    if not raw:
        return []
    # Strip code fences if present
    cleaned = raw.strip()
    fence = re.match(r"```(?:json)?\s*(.*?)\s*```", cleaned, re.DOTALL)
    if fence:
        cleaned = fence.group(1)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        # Last-ditch: find the first {...} object
        m = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not m:
            return []
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError:
            return []
    updates = data.get("updates") if isinstance(data, dict) else None
    if not isinstance(updates, list):
        return []
    parsed: list[dict] = []
    for u in updates:
        if not isinstance(u, dict):
            continue
        key = u.get("key")
        if key not in valid_keys:
            continue
        parsed.append({
            "key": key,
            "value": u.get("value"),
            "confidence": float(u.get("confidence") or 0.7),
            "note": (u.get("note") or "").strip(),
        })
    return parsed


# ---------- public API consumed by server.py routes ----------
async def fetch_pending_for_user(db, user_id: str) -> list[dict]:
    cursor = db.checkins.find({"user_id": user_id, "status": {"$ne": "completed"}})
    items = []
    async for c in cursor:
        c.pop("_id", None)
        items.append(c)
    items.sort(key=lambda c: c.get("due_at") or "")
    return items


async def get_checkin(db, checkin_id: str) -> Optional[dict]:
    c = await db.checkins.find_one({"id": checkin_id})
    if c:
        c.pop("_id", None)
    return c


def _enrich_field(field: dict) -> dict:
    meta = FIELD_CATALOGUE.get(field["key"]) or {}
    return {
        **field,
        "label": field.get("label") or meta.get("label") or field["key"],
        "prompt": field.get("prompt") or meta.get("prompt"),
        "type": meta.get("type", "string"),
    }


async def hydrate_checkin(db, checkin: dict) -> dict:
    """Attach the user's current values and field metadata to a check-in."""
    user = await db.users.find_one({"id": checkin["user_id"]})
    if user:
        user.pop("_id", None)
    enriched_fields = [_enrich_field(f) for f in checkin.get("fields") or []]
    current_values = {f["key"]: _resolve_current_value(user or {}, f["key"]) for f in enriched_fields}
    return {
        **checkin,
        "fields": enriched_fields,
        "current_values": current_values,
        "user": {
            "id": (user or {}).get("id"),
            "name": (user or {}).get("name"),
            "avatar_url": (user or {}).get("avatar_url"),
            "role": (user or {}).get("role"),
        } if user else None,
    }


async def submit_typed_response(db, checkin_id: str, field_keys: list[str], response_text: str) -> dict:
    """Generate proposed updates from a typed response covering one or more fields."""
    c = await db.checkins.find_one({"id": checkin_id})
    if not c:
        raise ValueError("Check-in not found")
    if c.get("status") == "completed":
        raise ValueError("Check-in already completed")
    user = await db.users.find_one({"id": c["user_id"]}) or {}
    user.pop("_id", None)
    fields = [_enrich_field(f) for f in c.get("fields") or [] if f["key"] in (field_keys or [f["key"] for f in c.get("fields") or []])]
    current_values = {f["key"]: _resolve_current_value(user, f["key"]) for f in fields}
    proposals = await _extract_updates(fields, current_values, response_text, source_kind="typed_response")
    return await _record_proposals(db, c, proposals, source="typed", raw_response=response_text)


async def submit_document(db, checkin_id: str, filename: str, content: bytes) -> dict:
    """Generate proposed updates from an uploaded document covering ALL the check-in's fields."""
    c = await db.checkins.find_one({"id": checkin_id})
    if not c:
        raise ValueError("Check-in not found")
    if c.get("status") == "completed":
        raise ValueError("Check-in already completed")
    if filename.lower().endswith(".pdf"):
        text = extract_pdf_text(content)
        kind = "pdf"
    else:
        # Treat as plain text upload
        try:
            text = content.decode("utf-8", errors="ignore")
        except Exception:  # noqa: BLE001
            text = ""
        kind = "text_file"
    if not text.strip():
        raise ValueError("Could not extract any readable text from the uploaded document.")
    user = await db.users.find_one({"id": c["user_id"]}) or {}
    user.pop("_id", None)
    fields = [_enrich_field(f) for f in c.get("fields") or []]
    current_values = {f["key"]: _resolve_current_value(user, f["key"]) for f in fields}
    proposals = await _extract_updates(fields, current_values, text, source_kind=f"{kind}:{filename}")
    return await _record_proposals(db, c, proposals, source=kind, raw_response=text[:4000], filename=filename)


async def _record_proposals(db, c: dict, proposals: list[dict], *, source: str, raw_response: str, filename: Optional[str] = None) -> dict:
    """Append new proposals to the check-in (status -> in_progress) and return the updated, hydrated check-in."""
    now = _now_iso()
    existing = c.get("proposed_updates") or []
    enriched: list[dict] = []
    for p in proposals:
        enriched.append({
            "id": _new_id("pu"),
            "key": p["key"],
            "value": p["value"],
            "confidence": p["confidence"],
            "note": p["note"],
            "source": source,
            "filename": filename,
            "accepted": None,
            "created_at": now,
        })
    await db.checkins.update_one(
        {"id": c["id"]},
        {
            "$push": {"proposed_updates": {"$each": enriched}},
            "$set": {"status": "in_progress", "updated_at": now, "last_source": source},
        },
    )
    refreshed = await db.checkins.find_one({"id": c["id"]})
    refreshed.pop("_id", None)
    return await hydrate_checkin(db, refreshed)


async def decide_proposal(db, checkin_id: str, proposal_id: str, accepted: bool) -> dict:
    c = await db.checkins.find_one({"id": checkin_id})
    if not c:
        raise ValueError("Check-in not found")
    proposals = c.get("proposed_updates") or []
    target = next((p for p in proposals if p["id"] == proposal_id), None)
    if not target:
        raise ValueError("Proposal not found")
    target["accepted"] = bool(accepted)
    target["decided_at"] = _now_iso()
    await db.checkins.update_one({"id": checkin_id}, {"$set": {"proposed_updates": proposals, "updated_at": _now_iso()}})
    if accepted:
        await _apply_value_to_user(db, c["user_id"], target["key"], target["value"])
    refreshed = await db.checkins.find_one({"id": checkin_id})
    refreshed.pop("_id", None)
    return await hydrate_checkin(db, refreshed)


async def complete_checkin(db, checkin_id: str) -> dict:
    c = await db.checkins.find_one({"id": checkin_id})
    if not c:
        raise ValueError("Check-in not found")
    await db.checkins.update_one(
        {"id": checkin_id},
        {"$set": {"status": "completed", "completed_at": _now_iso(), "updated_at": _now_iso()}},
    )
    refreshed = await db.checkins.find_one({"id": checkin_id})
    refreshed.pop("_id", None)
    return await hydrate_checkin(db, refreshed)
