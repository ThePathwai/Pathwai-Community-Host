import re
from typing import Any, Dict

from fastapi import APIRouter, Body, Depends, HTTPException

from auth import require_role
from database import current_community, db
from ._common import audit, now_iso

router = APIRouter(tags=["community"])

PLAYR_COLORS = {"accent": "#FF2E44", "on_accent": "#FFFFFF", "background": "#09090B", "surface": "#131316", "text": "#F5F5F4", "muted": "#8F8F98", "border": "#26262B"}

# Profile fields shown on every member's page and in the editor. Admins can rename them or hide the optional ones.
DEFAULT_PROFILE = {
    "fields": [
        {"key": "age", "label": "Age", "enabled": True},
        {"key": "height", "label": "Height", "enabled": True},
        {"key": "title", "label": "Profession", "enabled": True},
        {"key": "skill_set", "label": "Skills", "enabled": True},
        {"key": "interests_hobbies", "label": "Interests", "enabled": True},
        {"key": "goals", "label": "Goals", "enabled": True},
        {"key": "support_needs", "label": "Support needed", "enabled": True},
    ],
}
PROFILE_KEYS = {f["key"] for f in DEFAULT_PROFILE["fields"]}

DEFAULT_CONFIG: Dict[str, Any] = {
    "community_name": "The Playr League",
    "require_approval": True,
    "community_kind": "Wellness & events community", "about": "Networking, workshops and wellness events for professionals across the GTA.", "hub_cover": None, "apply_questions": [],
    # Shown on the hub's "Discover communities" browse/filter UI (see routes/hub.py:_summary) — not
    # shown inside the community itself. Free text so any admin can set it; both default to unset.
    "country": "", "interest_tags": [],
    "tagline": "Play. Connect. Grow. A health and wellness community that brings people together at events.",
    "community_type": "sports",
    "theme": {"preset": "playr", "accent": "#F00F21"},
    "member_label_singular": "Member",
    "member_label_plural": "Members",
    "member_types": {"founder": "Member", "mentor": "Host", "alumni": "Alumni", "partner": "Partner", "guest": "Guest"},
    "profile": DEFAULT_PROFILE,
    "event_types": ["Networking", "Workshop", "Wellness", "Social", "Summit"],
    "support_categories": ["Career advice", "Business help", "Legal & finance", "Marketing & content", "Mentorship", "Wellness", "Introductions", "Events", "Other"],
    "signup_fields": [
        {"key": "title", "label": "Profession", "type": "text", "required": False},
        {"key": "skill_set", "label": "Skills", "type": "tags", "required": False},
        {"key": "interests_hobbies", "label": "Interests", "type": "tags", "required": False},
    ],
    "custom_profile_fields": [],
    "widgets": ["upcoming_events", "support_requests", "smart_matches", "announcements", "resources"],
    "page_text": {},
    "gallery_photos": [],  # portrait (4:5) carousel on the dashboard — each photo placed by the admin (client-side crop) before it's saved
    "dashboard_cover_url": None,  # fallback photo behind the dashboard's "next event" widget when there's no event cover to show; falls back to the logo if unset
    "allow_member_submissions": {"events": True, "resources": True, "announcements": True},
    "brand": {
        "preset": "playr-modern", "mode": "dark",
        "colors": dict(PLAYR_COLORS),
        "font": "Plus Jakarta Sans", "heading_font": "Plus Jakarta Sans", "heading_style": "normal", "radius": "soft", "button_shape": "rounded",
        "logo_url": None, "logo_mark_url": None, "logo_adapts": True, "show_name_with_logo": False,
        "login_headline": "Meet your people.", "login_subhead": "Find your next event and the members who can help you grow.",
        "welcome_message": "Welcome to the community. Here's what's happening this week.", "footer_text": "Connect. Share. Grow.", "support_email": "hello@playr.example",
    },
    "nav": [
        {"key": "members", "label": "Members", "enabled": True}, {"key": "matches", "label": "Connections", "enabled": True},
        {"key": "events", "label": "Events", "enabled": True}, {"key": "resources", "label": "Perks", "enabled": True},
        {"key": "updates", "label": "News", "enabled": True}, {"key": "requests", "label": "To-do", "enabled": True},
        {"key": "support", "label": "Help board", "enabled": True},
        {"key": "inbox", "label": "Messages", "enabled": True},
    ],
    "custom_links": [],
    "setup_completed": True,
}

def _p(preset, label, mode, accent, bg, surface, text, muted, border, on_accent=None, **kw):
    cols = {"accent": accent, "background": bg, "surface": surface, "text": text, "muted": muted, "border": border}
    if on_accent:
        cols["on_accent"] = on_accent
    return {"preset": preset, "label": label, "accent": accent, "mode": mode, "colors": cols, **kw}


THEME_PRESETS = [
    _p("playr-modern", "Playr League · Modern (dark)", "dark", "#FF2E44", "#09090B", "#131316", "#F5F5F4", "#8F8F98", "#26262B", on_accent="#FFFFFF", heading_font="Plus Jakarta Sans", font="Plus Jakarta Sans", heading_style="normal", radius="soft", button_shape="rounded"),
    _p("playr-modern-light", "Playr League · Modern (light)", "light", "#F0142B", "#F6F5F2", "#FFFFFF", "#0B0B0C", "#6B6B70", "#E6E4DF", on_accent="#FFFFFF", heading_font="Plus Jakarta Sans", font="Plus Jakarta Sans", heading_style="normal", radius="soft", button_shape="rounded"),
    _p("playr-pro", "Playr League · Professional", "light", "#E30B1D", "#F4F4F1", "#FFFFFF", "#111111", "#6A6A66", "#E5E5E0", on_accent="#FFFFFF", heading_font="Inter", font="Inter", heading_style="normal", radius="soft", button_shape="pill"),
    _p("playr", "Playr League · Black", "dark", "#F00F21", "#0A0A0A", "#161616", "#F4F1EA", "#A8A39A", "#2C2C2C", on_accent="#FFFFFF", heading_font="Anton", font="Montserrat", radius="round", button_shape="pill"),
    _p("playr-cream", "Playr League · Cream", "light", "#F00F21", "#F4F1EA", "#FFFFFF", "#0A0A0A", "#6B665C", "#DDD7C8", on_accent="#FFFFFF", heading_font="Anton", font="Montserrat", radius="round", button_shape="pill"),
    _p("pathwai", "Pathwai", "dark", "#EBEBEB", "#0D0D0D", "#171717", "#EBEBEB", "#A1A1A1", "#2E2E2E"),
    _p("paper", "Paper", "light", "#0A0A0A", "#FAFAF8", "#FFFFFF", "#0A0A0A", "#6B6A66", "#E7E5E0", heading_style="normal"),
    _p("ocean", "Ocean", "dark", "#3B82F6", "#0A1220", "#111B2E", "#E6EEF9", "#8FA3BF", "#1F3050"),
    _p("forest", "Forest", "light", "#0F6E38", "#F5F8F4", "#FFFFFF", "#10261A", "#5E7466", "#DCE6DC", heading_style="normal"),
    _p("sunset", "Sunset", "dark", "#F2703F", "#140C0A", "#1E1310", "#F7EAE4", "#B79B90", "#3A241D"),
    _p("violet", "Violet", "light", "#6D28D9", "#FAF8FF", "#FFFFFF", "#1C1230", "#6F6688", "#E6E0F3", heading_style="normal"),
]
HEADING_FONTS = ["Plus Jakarta Sans", "Playfair Display", "Lora", "Inter", "Montserrat", "Anton", "Bebas Neue", "Oswald", "Archivo Black"]
FONTS = ["Plus Jakarta Sans", "Inter", "Space Grotesk", "DM Sans", "Manrope", "Poppins", "Montserrat", "Work Sans", "IBM Plex Sans", "Playfair Display", "Lora"]
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
NAV_KEYS = {"members", "matches", "events", "resources", "updates", "requests", "support", "inbox"}


def _validate(clean: Dict[str, Any]) -> None:
    pt = clean.get("page_text")
    if pt is not None:
        if not isinstance(pt, dict) or len(pt) > 200:
            raise HTTPException(status_code=400, detail="page_text must be an object")
        clean["page_text"] = {str(k)[:60]: str(v)[:400] for k, v in pt.items() if isinstance(v, (str, int, float))}
    b = clean.get("brand")
    if b is not None:
        if not isinstance(b, dict):
            raise HTTPException(status_code=400, detail="Invalid brand settings")
        for k, v in (b.get("colors") or {}).items():
            if k not in DEFAULT_CONFIG["brand"]["colors"] or not HEX.match(str(v)):
                raise HTTPException(status_code=400, detail=f"Colour '{k}' must be a hex value like #1A2B3C")
        if b.get("font") and b["font"] not in FONTS:
            raise HTTPException(status_code=400, detail="Choose one of the listed fonts")
        if b.get("heading_font") and b["heading_font"] not in HEADING_FONTS:
            raise HTTPException(status_code=400, detail="Choose one of the listed heading fonts")
        for k in ("logo_adapts", "show_name_with_logo"):
            if k in b and not isinstance(b[k], bool):
                raise HTTPException(status_code=400, detail=f"{k} must be on or off")
        for k, allowed in (("mode", {"dark", "light"}), ("radius", {"sharp", "soft", "round"}), ("button_shape", {"pill", "rounded", "square"}), ("heading_style", {"uppercase", "normal"})):
            if b.get(k) and b[k] not in allowed:
                raise HTTPException(status_code=400, detail=f"Invalid {k}")
        for k in ("logo_url", "logo_mark_url"):
            v = b.get(k)
            if v:
                if not (v.startswith("https://") or v.startswith("data:image/")):
                    raise HTTPException(status_code=400, detail="Logos must be an https link or an uploaded image")
                if len(v) > 700_000:
                    raise HTTPException(status_code=400, detail="That logo file is too large (max ~500KB)")
        for k in ("login_headline", "login_subhead", "welcome_message", "footer_text", "support_email"):
            if b.get(k) and len(str(b[k])) > 300:
                raise HTTPException(status_code=400, detail=f"{k.replace('_', ' ').capitalize()} is too long")
    gp = clean.get("gallery_photos")
    if gp is not None:
        if not isinstance(gp, list) or len(gp) > 10:
            raise HTTPException(status_code=400, detail="Add up to 10 photos")
        cleaned = []
        for v in gp:
            if not isinstance(v, str) or not (v.startswith("https://") or v.startswith("data:image/") or v.startswith("/api/uploads/")):
                raise HTTPException(status_code=400, detail="Photos must be an https link or an uploaded image")
            if len(v) > 700_000:
                raise HTTPException(status_code=400, detail="One of your photos is too large (max ~500KB)")
            cleaned.append(v)
        clean["gallery_photos"] = cleaned
    dc = clean.get("dashboard_cover_url")
    if dc is not None and dc != "":
        if not isinstance(dc, str) or not (dc.startswith("https://") or dc.startswith("data:image/") or dc.startswith("/api/uploads/")):
            raise HTTPException(status_code=400, detail="Cover photo must be an https link or an uploaded image")
        if len(dc) > 700_000:
            raise HTTPException(status_code=400, detail="That cover photo is too large (max ~500KB)")
    elif dc == "":
        clean["dashboard_cover_url"] = None
    mt = clean.get("member_types")
    if mt is not None:
        if not isinstance(mt, dict):
            raise HTTPException(status_code=400, detail="Invalid member types")
        clean["member_types"] = {k: str(v).strip()[:24] for k, v in mt.items() if k in {"founder", "mentor", "alumni", "partner", "guest"} and str(v).strip()}
    pr = clean.get("profile")
    if pr is not None:
        fields = (pr or {}).get("fields") if isinstance(pr, dict) else None
        if not isinstance(fields, list) or any((f.get("key") not in PROFILE_KEYS or not str(f.get("label", "")).strip() or len(f["label"]) > 30) for f in fields):
            raise HTTPException(status_code=400, detail="Each profile field needs a valid key and a label under 31 characters")
        clean["profile"] = {"fields": [{"key": f["key"], "label": f["label"].strip(), "enabled": bool(f.get("enabled", True))} for f in fields]}
    for n in clean.get("nav") or []:
        if n.get("key") not in NAV_KEYS or not str(n.get("label", "")).strip() or len(n["label"]) > 24:
            raise HTTPException(status_code=400, detail="Each menu item needs a valid key and a label under 25 characters")
    for l in clean.get("custom_links") or []:
        if not str(l.get("url", "")).startswith("https://") or not str(l.get("label", "")).strip():
            raise HTTPException(status_code=400, detail="Custom links need a label and an https URL")


async def get_config() -> Dict[str, Any]:
    doc = await db.community_config.find_one({"_key": "singleton"}) or {}
    doc.pop("_id", None)
    doc.pop("_key", None)
    out = {**DEFAULT_CONFIG, **doc}
    b = dict(DEFAULT_CONFIG["brand"]); b.update(doc.get("brand") or {})
    b["colors"] = {**DEFAULT_CONFIG["brand"]["colors"], **((doc.get("brand") or {}).get("colors") or {})}
    out["brand"] = b
    out["member_types"] = {**DEFAULT_CONFIG["member_types"], **(doc.get("member_types") or {})}
    have_f = {f["key"] for f in (doc.get("profile") or {}).get("fields", [])}
    if doc.get("profile"):
        out["profile"] = {"fields": doc["profile"]["fields"] + [f for f in DEFAULT_PROFILE["fields"] if f["key"] not in have_f]}
    if "nav" in doc:  # keep newly added modules visible for older saved configs
        have = {n["key"] for n in doc["nav"]}
        out["nav"] = doc["nav"] + [n for n in DEFAULT_CONFIG["nav"] if n["key"] not in have]
    # Not stored on the doc itself -- this whole lookup is already scoped to one community via the
    # `db` contextvar proxy, so the slug is just whichever one that is. Admin's "Share your
    # community" panel needs it to build the external /c/:slug link without a second round trip.
    out["slug"] = current_community()
    return out


@router.get("/community/config")
async def read_config():
    return await get_config()


@router.get("/community/presets")
async def presets():
    return {"themes": THEME_PRESETS, "community_types": ["sports", "startup", "social", "professional", "alumni"], "heading_fonts": HEADING_FONTS, "fonts": FONTS}


@router.patch("/community/config")
async def patch_config(patch: Dict[str, Any] = Body(...), me: dict = Depends(require_role("admin"))):
    # Policy: every community requires admin approval, full stop -- there's no admin-facing way to
    # turn that off, so `require_approval` is excluded here even though it's still a DEFAULT_CONFIG
    # key (routes/hub.py's _apply_to_community and server.py's auth_signup both hardcode it anyway;
    # this just keeps the stored config from claiming otherwise).
    allowed = set(DEFAULT_CONFIG.keys()) - {"require_approval"}
    clean = {k: v for k, v in patch.items() if k in allowed}
    _validate(clean)
    if "brand" in clean:  # keep the legacy theme accent in sync
        clean["theme"] = {"preset": clean["brand"].get("preset", "custom"), "accent": (clean["brand"].get("colors") or {}).get("accent", "#EBEBEB")}
    if clean:
        clean["updated_at"] = now_iso()
        await db.community_config.update_one({"_key": "singleton"}, {"$set": clean}, upsert=True)
        if "community_name" in clean:
            await db.users.update_many({"role": "admin"}, {"$set": {"company": clean["community_name"]}})
        await audit(me["id"], "community.config_updated", "community_config", "singleton", {"fields": list(clean.keys())})
    return await get_config()
