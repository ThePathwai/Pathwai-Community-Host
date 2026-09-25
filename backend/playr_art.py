"""Generated artwork for the Playr League demo: illustrated member portraits and event posters.

No external images are needed (they are embedded as small SVG data URIs), so the demo works offline and
inside sandboxed previews. Members can replace their portrait with a real photo from their profile.
"""
from __future__ import annotations

import base64
from pathlib import Path
from typing import Optional
from urllib.parse import quote

RED, BLACK, CREAM = "#F00F21", "#0A0A0A", "#F4F1EA"
SKIN = {"a": "#F6D5B8", "b": "#E8B98F", "c": "#C98B5E", "d": "#A0653F", "e": "#7A4A2C", "f": "#553219"}
HAIRC = {"black": "#141110", "brown": "#3B2416", "auburn": "#7B3A1E", "blond": "#D9B45B", "grey": "#9A9A9A", "red": "#B03A22"}
BGS = ["#E4E2DD", "#DCE2E9", "#EAE4DA", "#E1E7E2", "#E8E0E5", "#DFE3EB"]
TOPS = ["#2B3444", "#3B3B3B", "#4A5D57", "#5B4B4B", "#33415C", "#6B6F76", "#22303C", "#7A6A58"]


def _uri(svg: str) -> str:
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()


def portrait(skin="b", hair="short", hair_color="black", jersey=RED, number="7", bg=0, glasses=False, beard=False,
             band=False, cap=False, smile=True) -> str:
    s, h = SKIN[skin], HAIRC[hair_color]
    dark = "#0A0A0A"
    light_bg = BGS[bg % len(BGS)] in ("#F0EBDD", "#E9E3D3")
    numfill = "#FFFFFF" if jersey not in (CREAM, "#FFFFFF") else BLACK
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="{BGS[bg % len(BGS)]}"/>']
    # back hair
    if hair == "afro":
        parts.append(f'<circle cx="100" cy="74" r="54" fill="{h}"/>')
    if hair == "long":
        parts.append(f'<path d="M52 84 C46 40 154 40 148 84 L156 150 L44 150Z" fill="{h}"/>')
    if hair == "puffs":
        parts.append(f'<circle cx="58" cy="52" r="20" fill="{h}"/><circle cx="142" cy="52" r="20" fill="{h}"/>')
    # shoulders / jersey
    top = TOPS[(sum(map(ord, str(number))) + bg) % len(TOPS)]
    parts.append(f'<path d="M14 200 C14 152 56 140 100 140 C144 140 186 152 186 200Z" fill="{top}"/>')
    parts.append('<path d="M84 141 L100 166 L116 141 L108 139 L100 150 L92 139Z" fill="#F4F4F2" fill-opacity=".92"/>')
    parts.append(f'<path d="M78 141 C86 160 114 160 122 141 C114 146 86 146 78 141Z" fill="{s}"/>')
    # neck + head
    parts.append(f'<rect x="86" y="112" width="28" height="36" rx="10" fill="{s}"/><rect x="86" y="128" width="28" height="12" fill="#000" fill-opacity=".14"/>')
    parts.append(f'<circle cx="63" cy="92" r="8" fill="{s}"/><circle cx="137" cy="92" r="8" fill="{s}"/>')
    parts.append(f'<ellipse cx="100" cy="90" rx="38" ry="45" fill="{s}"/>')
    # front hair
    if hair == "short":
        parts.append(f'<path d="M61 88 C56 42 144 42 139 88 C132 66 116 60 100 60 C84 60 68 66 61 88Z" fill="{h}"/>')
    elif hair == "fade":
        parts.append(f'<path d="M63 82 C60 46 140 46 137 82 C130 64 116 58 100 58 C84 58 70 64 63 82Z" fill="{h}"/>')
    elif hair == "afro":
        parts.append(f'<path d="M62 82 C62 58 138 58 138 82 C128 68 72 68 62 82Z" fill="{h}"/>')
    elif hair == "long":
        parts.append(f'<path d="M60 90 C54 40 146 40 140 90 C138 66 122 58 100 58 C78 58 62 66 60 90Z" fill="{h}"/>')
    elif hair == "bun":
        parts.append(f'<circle cx="100" cy="38" r="15" fill="{h}"/><path d="M61 88 C56 44 144 44 139 88 C132 66 116 60 100 60 C84 60 68 66 61 88Z" fill="{h}"/>')
    elif hair == "braids":
        parts.append(f'<path d="M60 92 C54 42 146 42 140 92 C136 66 120 58 100 58 C80 58 64 66 60 92Z" fill="{h}"/>')
        for x in (58, 68, 132, 142):
            parts.append(f'<rect x="{x-3}" y="80" width="6" height="66" rx="3" fill="{h}"/>')
    elif hair == "puffs":
        parts.append(f'<path d="M62 84 C62 56 138 56 138 84 C128 66 72 66 62 84Z" fill="{h}"/>')
    elif hair == "curly":
        for cx, cy in ((70, 62), (86, 54), (104, 52), (122, 56), (134, 68), (62, 76), (140, 80)):
            parts.append(f'<circle cx="{cx}" cy="{cy}" r="14" fill="{h}"/>')
    elif hair == "locs":
        parts.append(f'<path d="M60 92 C54 42 146 42 140 92 C136 66 120 58 100 58 C80 58 64 66 60 92Z" fill="{h}"/>')
        for x in (56, 64, 72, 128, 136, 144):
            parts.append(f'<rect x="{x-3}" y="72" width="7" height="{56 if x in (56,144) else 44}" rx="3.5" fill="{h}"/>')
    if False and band:
        parts.append(f'<rect x="60" y="66" width="80" height="9" rx="4" fill="{RED}"/>')
    if False and cap:
        parts.append(f'<path d="M58 78 C58 40 142 40 142 78Z" fill="{RED}"/><path d="M52 78 L148 78 C150 84 132 84 100 84 C68 84 50 84 52 78Z" fill="#B00A18"/><circle cx="100" cy="48" r="3" fill="{CREAM}"/>')
    # face
    eye = "#1A1210"
    parts.append(f'<ellipse cx="85" cy="94" rx="7" ry="5" fill="#fff"/><ellipse cx="115" cy="94" rx="7" ry="5" fill="#fff"/><circle cx="85" cy="94" r="3.4" fill="{eye}"/><circle cx="115" cy="94" r="3.4" fill="{eye}"/>')
    parts.append(f'<path d="M77 84 Q85 80 93 84 M107 84 Q115 80 123 84" fill="none" stroke="{h if hair != "bald" else eye}" stroke-width="3" stroke-linecap="round"/>')
    parts.append(f'<path d="M100 96 L96 110 Q100 113 104 110Z" fill="#000" fill-opacity=".13"/>')
    if beard:
        parts.append(f'<path d="M64 100 C64 140 136 140 136 100 C132 118 118 124 100 124 C82 124 68 118 64 100Z" fill="{h}"/>')
        parts.append(f'<path d="M88 116 Q100 122 112 116" fill="none" stroke="{s}" stroke-width="3" stroke-linecap="round" opacity=".0"/>')
    mouth = "M88 118 Q100 128 112 118" if smile else "M90 120 L110 120"
    parts.append(f'<path d="{mouth}" fill="none" stroke="{"#F4F1EA" if beard else "#7A2A22"}" stroke-width="3.5" stroke-linecap="round"/>')
    if glasses:
        parts.append(f'<g fill="none" stroke="{dark}" stroke-width="3"><circle cx="85" cy="94" r="11"/><circle cx="115" cy="94" r="11"/><path d="M96 94 L104 94"/></g>')
    parts.append("</svg>")
    return _uri("".join(parts))


def poster(kind: str = "indoor", accent: str = RED) -> str:
    """Abstract event cover: blurred gradient mesh (no venue or sport imagery)."""
    pal = {"indoor": ("#0E1016", "#3B2A5C", accent), "outdoor": ("#0D1A16", "#1F6B52", "#E8B04A"), "show": ("#140C10", "#7A1F3D", accent),
           "social": ("#16110D", "#8A4B2A", "#F2B36B"), "clinic": ("#0B1220", "#1E4E8C", "#5CC8C2")}.get(kind, ("#0E1016", "#3B2A5C", accent))
    bg, mid, hi = pal
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240"><defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="38"/></filter></defs><rect width="400" height="240" fill="{bg}"/>']
    s.append(f'<g filter="url(#b)"><circle cx="330" cy="50" r="120" fill="{mid}"/><circle cx="90" cy="210" r="100" fill="{hi}" fill-opacity=".85"/><circle cx="220" cy="130" r="60" fill="{mid}" fill-opacity=".8"/></g>')
    s.append("</svg>")
    return _uri("".join(s))


_ASSETS = Path(__file__).parent / "assets"


def png_data_uri(name: str) -> Optional[str]:
    p = _ASSETS / name
    if not p.exists():
        return None
    return "data:image/png;base64," + base64.b64encode(p.read_bytes()).decode()
