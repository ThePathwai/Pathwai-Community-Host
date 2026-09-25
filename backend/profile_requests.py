"""Profile-request module — the Pathwai community team sends structured
info requests to members to keep their profiles fresh. Members fulfil them
by typing in the form or by dropping a PDF (e.g. a pitch deck) which is
parsed and run through GPT-5.2 to draft answers for review.
"""
from __future__ import annotations

import os
import io
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from pypdf import PdfReader
from emergentintegrations.llm.chat import LlmChat, UserMessage

from chatbot import MODEL_NAME, MODEL_PROVIDER

logger = logging.getLogger(__name__)


# ---------- request catalogue ----------
# Each request kind has a fixed schema of fields. `apply_to` says which
# user document fields the response writes through to.
REQUEST_KINDS = {
    "support_needs": {
        "title": "Refresh your support needed",
        "prompt": "What are your top asks this season? We use this to match you with coaches, partners and teammates.",
        "supports_pdf": False,
        "fields": [
            {"key": "support_needs", "label": "Top 3 asks (one per line)", "type": "list",
             "placeholder": "Shooting form\nBall handling\nFinding a team"},
            {"key": "biggest_hurdle", "label": "Biggest hurdle right now", "type": "longtext", "placeholder": "Getting to games after work..."},
        ],
        "apply_to": {"support_needs": "support_needs", "biggest_hurdle": "biggest_hurdle"},
    },
    "goals_refresh": {
        "title": "Season goals",
        "prompt": "What are you working toward this season? Coaches use your goals to plan clinics.",
        "supports_pdf": False,
        "fields": [
            {"key": "goals", "label": "Goals (one per line)", "type": "list", "placeholder": "Make Division A\nPlay every Sunday"},
        ],
        "apply_to": {"goals": "goals"},
    },
    "intro_refresh": {
        "title": "Refresh your intro",
        "prompt": "Tell us what you're focused on right now and how the community can help.",
        "supports_pdf": False,
        "fields": [
            {"key": "current_focus", "label": "What you're focused on right now", "type": "longtext", "placeholder": "Right now I'm working on..."},
            {"key": "support_needs", "label": "What you're looking for (one per line)", "type": "list", "placeholder": "A shooting partner\nA film review"},
        ],
        "apply_to": {"current_focus": "current_focus", "support_needs": "support_needs"},
    },
}


# ---------- helpers ----------
def list_request_kinds() -> list[dict]:
    return [
        {"kind": k, "title": v["title"], "prompt": v["prompt"], "supports_pdf": v["supports_pdf"], "fields": v["fields"]}
        for k, v in REQUEST_KINDS.items()
    ]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _serialize(doc: dict) -> dict:
    """Strip mongo _id and ensure the schema is on the response too."""
    if doc is None:
        return None
    doc.pop("_id", None)
    info = REQUEST_KINDS.get(doc.get("kind"))
    if info:
        doc.setdefault("title", info["title"])
        doc.setdefault("prompt", info["prompt"])
        doc.setdefault("supports_pdf", info["supports_pdf"])
        doc.setdefault("fields", info["fields"])
    return doc


async def list_for_user(db, user_id: str, status: Optional[str] = "pending") -> list[dict]:
    query = {"user_id": user_id}
    if status:
        query["status"] = status
    cursor = db.profile_requests.find(query).sort("created_at", -1)
    return [_serialize(d) async for d in cursor]


async def count_pending(db, user_id: str) -> int:
    return await db.profile_requests.count_documents({"user_id": user_id, "status": "pending"})


async def get_request(db, request_id: str) -> Optional[dict]:
    doc = await db.profile_requests.find_one({"id": request_id})
    return _serialize(doc) if doc else None


# ---------- submit (apply to user doc) ----------
def _normalize_response(kind: str, raw: dict) -> dict:
    """Coerce list-typed fields (string with newlines → list of strings)."""
    info = REQUEST_KINDS[kind]
    out = {}
    for spec in info["fields"]:
        key = spec["key"]
        val = raw.get(key)
        if val is None or val == "":
            continue
        if spec["type"] == "list":
            if isinstance(val, str):
                val = [line.strip(" -•\t") for line in re.split(r"[\n;]", val) if line.strip()]
            elif isinstance(val, list):
                val = [str(x).strip() for x in val if str(x).strip()]
        out[key] = val
    return out


def _apply_to_user_patch(kind: str, response: dict) -> dict:
    """Translate a response dict to a $set patch on the user document."""
    info = REQUEST_KINDS[kind]
    mapping = info["apply_to"]
    patch: dict = {}
    for user_field, resp_key in mapping.items():
        if isinstance(resp_key, dict):
            # Nested object: build/merge a sub-dict (e.g. venture.{vision, mission})
            sub = {}
            for sub_key, sub_resp_key in resp_key.items():
                if sub_resp_key in response and response[sub_resp_key] not in (None, ""):
                    sub[sub_key] = response[sub_resp_key]
            if sub:
                for k, v in sub.items():
                    patch[f"{user_field}.{k}"] = v
        elif resp_key == "*":
            # Write the whole response as a sub-document
            patch[user_field] = response
        else:
            if resp_key in response and response[resp_key] not in (None, ""):
                patch[user_field] = response[resp_key]
    return patch


async def submit(db, request_id: str, raw_response: dict) -> dict:
    req = await db.profile_requests.find_one({"id": request_id})
    if not req:
        raise ValueError("Request not found")
    if req["status"] != "pending":
        raise ValueError(f"Request is already {req['status']}")
    kind = req["kind"]
    response = _normalize_response(kind, raw_response)
    if not response:
        raise ValueError("Empty response — nothing to save")
    patch = _apply_to_user_patch(kind, response)
    if patch:
        await db.users.update_one({"id": req["user_id"]}, {"$set": patch})
    await db.profile_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": "submitted",
            "response": response,
            "submitted_at": _now(),
            "updated_at": _now(),
        }},
    )
    user = await db.users.find_one({"id": req["user_id"]})
    if user:
        user.pop("_id", None)
    out = await get_request(db, request_id)
    return {"request": out, "user": user, "applied_fields": list(patch.keys())}


async def dismiss(db, request_id: str) -> dict:
    req = await db.profile_requests.find_one({"id": request_id})
    if not req:
        raise ValueError("Request not found")
    await db.profile_requests.update_one(
        {"id": request_id},
        {"$set": {"status": "dismissed", "updated_at": _now()}},
    )
    return await get_request(db, request_id)


# ---------- PDF → LLM extraction ----------
PDF_MAX_BYTES = 5 * 1024 * 1024  # 5 MB
PDF_MAX_PAGES = 20
PDF_MAX_CHARS = 16000  # cap the slice fed to the LLM


def _extract_pdf_text(content: bytes) -> str:
    if len(content) > PDF_MAX_BYTES:
        raise ValueError(f"PDF too large — keep it under {PDF_MAX_BYTES // (1024 * 1024)} MB.")
    reader = PdfReader(io.BytesIO(content))
    pages = reader.pages
    if len(pages) > PDF_MAX_PAGES:
        raise ValueError(f"PDF has too many pages ({len(pages)}) — keep it under {PDF_MAX_PAGES} pages.")
    chunks = []
    for i, page in enumerate(pages):
        try:
            text = page.extract_text() or ""
        except Exception:  # malformed page, skip
            text = ""
        if text.strip():
            chunks.append(f"--- Page {i + 1} ---\n{text.strip()}")
    full = "\n\n".join(chunks)
    return full[:PDF_MAX_CHARS]


def _build_extract_prompt(kind: str) -> str:
    info = REQUEST_KINDS[kind]
    field_lines = []
    for f in info["fields"]:
        type_hint = {
            "text": "short string",
            "longtext": "a 1–3 sentence string",
            "list": "an array of strings (3–6 items)",
        }.get(f["type"], "string")
        field_lines.append(f'  "{f["key"]}": {type_hint},  // {f["label"]}')
    schema = "{\n" + "\n".join(field_lines) + "\n}"
    return (
        "You extract structured facts from a startup pitch deck so the founder can review and confirm.\n"
        f"Return ONLY a JSON object with this exact schema (no prose, no markdown fences):\n{schema}\n"
        "Rules:\n"
        "- Use facts from the deck. Do NOT invent numbers, customer names or claims.\n"
        "- If a field isn't supported by the deck, return an empty string (or empty array) for it.\n"
        "- Keep each string concise — this is for a profile card, not a slide.\n"
    )


def _parse_llm_json(text: str) -> dict:
    """Tolerant JSON parse — strips ```json fences, finds the outermost {...}."""
    if not text:
        return {}
    s = text.strip()
    # Strip markdown fences
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s)
        s = re.sub(r"\s*```$", "", s)
    # Locate the JSON object
    start = s.find("{")
    end = s.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return {}
    blob = s[start:end + 1]
    try:
        return json.loads(blob)
    except json.JSONDecodeError:
        # last resort — sanitize trailing commas
        blob2 = re.sub(r",(\s*[}\]])", r"\1", blob)
        try:
            return json.loads(blob2)
        except json.JSONDecodeError:
            return {}


async def extract_from_pdf(db, request_id: str, pdf_bytes: bytes) -> dict:
    """Extract draft answers from an uploaded PDF and return them for preview.
    Does NOT submit — frontend renders the preview-and-confirm UI.
    """
    req = await db.profile_requests.find_one({"id": request_id})
    if not req:
        raise ValueError("Request not found")
    info = REQUEST_KINDS.get(req["kind"])
    if not info:
        raise ValueError(f"Unknown request kind: {req['kind']}")
    if not info["supports_pdf"]:
        raise ValueError("This request doesn't support PDF upload.")

    pdf_text = _extract_pdf_text(pdf_bytes)
    if not pdf_text.strip():
        raise ValueError("Could not extract any text from this PDF — try a different export.")

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY is not configured on the server.")

    system = _build_extract_prompt(req["kind"])
    sid = f"pdf-extract-{uuid.uuid4()}"
    chat = LlmChat(api_key=api_key, session_id=sid, system_message=system).with_model(MODEL_PROVIDER, MODEL_NAME)
    raw = await chat.send_message(UserMessage(text=f"DECK TEXT:\n\n{pdf_text}"))
    extracted = _parse_llm_json(raw)
    # Coerce values into the right shape per field type
    cleaned = {}
    for f in info["fields"]:
        v = extracted.get(f["key"])
        if v is None:
            continue
        if f["type"] == "list":
            if isinstance(v, str):
                v = [s.strip() for s in re.split(r"[\n,;]", v) if s.strip()]
            elif not isinstance(v, list):
                v = [str(v)]
            cleaned[f["key"]] = [str(x).strip() for x in v if str(x).strip()]
        else:
            cleaned[f["key"]] = str(v).strip()
    return {
        "draft": cleaned,
        "pages_parsed": pdf_text.count("--- Page "),
        "chars": len(pdf_text),
    }
