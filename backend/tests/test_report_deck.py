"""The branded slide deck: every community's report comes out in its own colours, logo and photos."""
import base64
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw
from reportlab.lib import colors

import impact
import report_deck
import server


def _uri(im, fmt="PNG"):
    b = io.BytesIO()
    im.save(b, fmt)
    return f"data:image/{fmt.lower()};base64," + base64.b64encode(b.getvalue()).decode()


def _logo(rgb):
    im = Image.new("RGBA", (400, 120), (0, 0, 0, 0))
    ImageDraw.Draw(im).rectangle([0, 20, 400, 100], fill=rgb + (255,))
    return im


def _pages(pdf: bytes) -> int:
    return len(re.findall(rb"/Type\s*/Page\b", pdf))


def _report(kind="sponsor"):
    # a small hand-made report, so the deck is tested without a database
    tile = lambda l, v, n="", a=False: {"label": l, "value": v, "note": n, "accent": a}  # noqa: E731
    return {"type": kind, "title": "Sponsor report", "audience": "For sponsors", "headline": "What your support reached", "community": "Test Club",
            "generated_at": "2026-10-01T12:00:00", "period_days": 90, "period_label": "Last 90 days",
            "sections": [
                {"kind": "reach", "title": "Reach", "subtitle": "Who is taking part.", "tiles": [tile("Members", 40, "", True), tile("Active", 22, "55%")],
                 "charts": [{"type": "columns", "title": "Active per week", "items": [{"label": f"W{i}", "value": i + 2} for i in range(8)]}], "insights": ["22 of 40 were active."]},
                {"kind": "perks", "title": "Perks", "subtitle": "Use.", "tiles": [tile("Opens", 9, "", True)],
                 "charts": [{"type": "hbar", "title": "Top", "items": [{"label": "Free hour", "value": 5}, {"label": "Credits", "value": 4}]}, {"type": "donut", "title": "Mix", "items": [{"label": "A", "value": 3}, {"label": "B", "value": 1}]}], "insights": []},
                {"kind": "events", "title": "Events", "subtitle": "Held.", "tiles": [tile("Held", 2)],
                 "charts": [{"type": "table", "title": "Recent", "columns": ["Event", "Date", "RSVPs", "Came"], "rows": [["Mixer", "Oct 1", 9, 7]]}], "insights": []},
                {"kind": "health", "title": "Empty", "subtitle": "Nothing yet.", "tiles": [tile("None", 0)], "charts": [{"type": "columns", "title": "Zeros", "items": [{"label": "a", "value": 0}]}], "insights": []},
            ]}


def test_deck_has_cover_glance_a_slide_per_section_and_a_close():
    pdf = report_deck.build_deck(_report(), {"community_name": "Test Club"})
    assert pdf[:4] == b"%PDF"
    assert _pages(pdf) == 2 + 4 + 1


@pytest.mark.parametrize("palette", [
    {"accent": "#0F6E38", "background": "#F5F8F4", "surface": "#FFFFFF", "text": "#10261A"},   # light, green
    {"accent": "#FFD60A", "background": "#FFFFFF", "surface": "#F6F6F6", "text": "#111111"},   # yellow on white: the accent alone would not read
    {"accent": "#EBEBEB", "background": "#0D0D0D", "surface": "#171717", "text": "#EBEBEB"},   # dark
    {"accent": "#F00F21", "background": "#0A0A0A", "surface": "#161616", "text": "#F4F1EA"},
    {"accent": "nonsense", "background": "", "text": None},                                    # bad values fall back instead of failing
])
def test_deck_builds_in_any_palette(palette):
    assert report_deck.build_deck(_report(), {"community_name": "X", "brand": {"colors": palette}})[:4] == b"%PDF"


def test_text_and_chart_colours_always_have_enough_contrast():
    for accent, bg, text in [("#FFD60A", "#FFFFFF", "#FFFFFF"), ("#111111", "#0D0D0D", "#222222"), ("#EBEBEB", "#FFFFFF", "#F0F0F0")]:
        th = report_deck.Theme({"brand": {"colors": {"accent": accent, "background": bg, "text": text}}})
        assert report_deck._contrast(th.text, th.bg) >= 4.5
        assert report_deck._contrast(th.accent_fg, th.bg) >= 3
        assert report_deck._contrast(th.on_accent, th.accent) >= 4.5


def test_logo_and_photos_are_used_and_a_vanishing_logo_is_recoloured():
    th_bg = colors.HexColor("#0D0D0D")
    black = report_deck._logo_for(_uri(_logo((10, 10, 10))), th_bg, True, colors.white)
    assert black is not None and black[1] == pytest.approx(400 / 120, rel=0.02)  # shown, with its own proportions
    pdf = report_deck.build_deck(_report(), {"community_name": "Pic Club", "brand": {"colors": {"background": "#0D0D0D"}, "logo_url": _uri(_logo((10, 10, 10)))},
                                              "gallery_photos": [_uri(Image.new("RGB", (800, 1000), (30, 90, 160)), "JPEG"), _uri(Image.new("RGB", (800, 1000), (160, 60, 30)), "JPEG")]})
    plain = report_deck.build_deck(_report(), {"community_name": "Pic Club", "brand": {"colors": {"background": "#0D0D0D"}}})
    assert len(pdf) > len(plain)  # the photos and logo really are in the file


def test_bad_images_never_break_the_deck_and_private_hosts_are_refused():
    for url in ("https://127.0.0.1/logo.png", "https://localhost/x.png", "http://example.com/x.png", "file:///etc/passwd", "data:image/png;base64,@@@", "/api/uploads/missing.png", ""):
        assert report_deck._load_bytes(url) is None
    cfg = {"community_name": "Odd", "brand": {"logo_url": "https://127.0.0.1/logo.png"}, "gallery_photos": ["file:///etc/passwd", 5]}
    assert report_deck.build_deck(_report(), cfg)[:4] == b"%PDF"


def test_sparse_and_empty_reports_still_make_a_deck():
    rep = _report()
    rep["sections"] = [{"kind": "x", "title": "Only", "subtitle": "", "tiles": [{"label": "N", "value": "n/a", "note": "", "accent": False}], "charts": [], "insights": []}]
    assert _pages(report_deck.build_deck(rep, {})) == 4
    rep["sections"] = []
    assert report_deck.build_deck(rep, {})[:4] == b"%PDF"


def test_non_latin_text_does_not_crash():
    rep = _report()
    rep["community"] = "Émigrés 東京 😀"
    assert report_deck.build_deck(rep, {"community_name": "Émigrés 東京 😀"})[:4] == b"%PDF"


def _login(email):
    c = TestClient(server.app)
    c.__enter__()
    assert c.post("/api/auth/login", json={"email": email, "password": "Demo123!"}).status_code == 200
    return c


def test_deck_endpoint_is_admin_only_and_names_the_file():
    m = _login("demo@yourcommunity.app")
    assert m.get("/api/admin/reports/sponsor/deck.pdf").status_code == 403
    a = _login("admin@yourcommunity.app")
    for kind in impact.REPORT_TYPES:
        r = a.get(f"/api/admin/reports/{kind}/deck.pdf", params={"days": 30, "label": "Acme Bank"})
        assert r.status_code == 200 and r.content[:4] == b"%PDF"
        assert "slides" in r.headers["content-disposition"] and r.headers["content-disposition"].endswith('.pdf"')
    assert a.get("/api/admin/reports/nope/deck.pdf").status_code == 400


def test_shared_link_carries_the_brand_but_never_an_email():
    a = _login("admin@yourcommunity.app")
    s = a.post("/api/admin/report-shares", json={"kind": "sponsor", "days": 90, "label": "Acme Bank"}).json()
    body = TestClient(server.app).get(f"/api/public/report/{s['token']}")
    assert body.status_code == 200
    j = body.json()
    assert j["brand"].get("colors", {}).get("accent") and "support_email" not in j["brand"]
    assert isinstance(j["photos"], list) and len(j["photos"]) <= 2 and "about" in j
    assert "@" not in body.text  # totals and public branding only


@pytest.mark.parametrize("n_tiles", [0, 1, 2, 3, 4, 5, 6, 9])
@pytest.mark.parametrize("charts", ["none", "table", "columns", "two"])
def test_every_mix_of_tiles_and_charts_makes_one_slide(n_tiles, charts):
    """Plug and play: whatever a community has (a lot, a little, one figure, nine), a section is still exactly one slide."""
    tiles = [{"label": f"A fairly long label number {i}", "value": ["7", "1,284", "$12,400.50", "68%"][i % 4], "note": "with a note that runs on for a while", "accent": i == 0} for i in range(n_tiles)]
    col = {"type": "columns", "title": "Weekly", "items": [{"label": f"W{i}", "value": i + 1} for i in range(10)]}
    tab = {"type": "table", "title": "Rows", "columns": ["Name", "Date", "RSVPs", "Came"], "rows": [[f"Row {i}", "Oct 1", i, i] for i in range(9)]}
    chs = {"none": [], "table": [tab], "columns": [col], "two": [col, {"type": "hbar", "title": "Top", "items": [{"label": "x" * 60, "value": 5}]}]}[charts]
    rep = _report()
    rep["sections"] = [{"kind": "x", "title": "T" * 90, "subtitle": "S" * 200, "tiles": tiles, "charts": chs, "insights": ["An insight that is rather long " * 6, "Another", "A third"]}]
    pdf = report_deck.build_deck(rep, {"community_name": "A very long community name " * 4})
    assert _pages(pdf) == (4 if n_tiles else 3)


def test_layout_helpers_keep_text_inside_tiles():
    assert report_deck._val_size("$12,400,000.50", 180, 88, False) <= 30
    assert report_deck._val_size("7", 380, 210, True) <= 84
    assert report_deck._ins_lines("x" * 2000, 380) == 3 and report_deck._ins_lines("", 380) == 1
    assert report_deck._nat_h({"type": "table", "rows": [[1]] * 3}) < report_deck._nat_h({"type": "table", "rows": [[1]] * 7})


def test_selection_takes_out_only_what_was_switched_off():
    rep = _report()
    keys = report_deck.selection_keys(rep)
    assert "glance" in keys and "s:reach" in keys and "t:reach:Members" in keys and "c:reach:Active per week" in keys and "i:reach:0" in keys
    out = report_deck.apply_selection(rep, ["t:reach:Members", "i:reach:0", "s:perks", "bogus"])
    assert [s["kind"] for s in out["sections"]] == ["reach", "events", "health"]
    assert [t["label"] for t in out["sections"][0]["tiles"]] == ["Active"] and out["sections"][0]["insights"] == []
    assert len(rep["sections"]) == 4 and len(rep["sections"][0]["tiles"]) == 2  # the full report is untouched
    assert report_deck.apply_selection(rep, []) is rep
    # a section with nothing left is dropped, and the glance slide can go
    gone = report_deck.apply_selection(rep, ["t:events:Held", "c:events:Recent", "glance"])
    assert "events" not in [s["kind"] for s in gone["sections"]] and gone["hide_glance"] is True
    assert _pages(report_deck.build_deck(gone, {})) == 5  # cover, 3 sections, close (no glance)
    assert report_deck.clean_hidden(["a", 3, None, "a"], rep) == []


def test_deck_selection_is_saved_per_report_type_and_used_by_the_download():
    a = _login("admin@yourcommunity.app")
    assert _login("demo@yourcommunity.app").put("/api/admin/deck-selection/sponsor", json={"hidden": []}).status_code == 403
    assert a.get("/api/admin/deck-selection/sponsor").json()["hidden"] == []
    assert a.put("/api/admin/deck-selection/nope", json={"hidden": []}).status_code == 400
    rep = a.get("/api/admin/reports/sponsor").json()
    first = rep["sections"][0]
    r = a.put("/api/admin/deck-selection/sponsor", json={"hidden": ["glance", f"s:{first['kind']}", "junk"]})
    assert r.status_code == 200 and r.json()["hidden"] == ["glance", f"s:{first['kind']}", "junk"]
    assert a.get("/api/admin/deck-selection/funder").json()["hidden"] == []
    full = len(rep["sections"]) + 3  # cover, glance, closing
    pdf = a.get("/api/admin/reports/sponsor/deck.pdf").content
    assert _pages(pdf) == full - 2  # no glance, one section fewer
    a.put("/api/admin/deck-selection/sponsor", json={"hidden": []})
    assert _pages(a.get("/api/admin/reports/sponsor/deck.pdf").content) == full


def test_sponsor_report_is_a_partnership_proposal_with_an_offer_and_an_ask():
    a = _login("admin@yourcommunity.app")
    rep = a.get("/api/admin/reports/sponsor").json()
    assert rep["title"] == "Partnership proposal" and "partner" in rep["headline"].lower()
    kinds = [s["kind"] for s in rep["sections"]]
    assert kinds[-2:] == ["offer_give", "offer_ask"]
    ask = next(s for s in rep["sections"] if s["kind"] == "offer_ask")
    assert {"Product samples", "In-person activations"} <= {c["title"] for c in ask["cards"]}
    # the other report types are unchanged
    assert not any(str(s["kind"]).startswith("offer_") for k in ("funder", "board") for s in a.get(f"/api/admin/reports/{k}").json()["sections"])
    # the document and the slides both carry it
    assert a.get("/api/admin/reports/sponsor.pdf").content[:4] == b"%PDF"
    pdf = a.get("/api/admin/reports/sponsor/deck.pdf").content
    assert _pages(pdf) == len(rep["sections"]) + 3


def test_offer_is_editable_cleaned_and_resettable():
    a = _login("admin@yourcommunity.app")
    assert _login("demo@yourcommunity.app").put("/api/admin/partnership-offer", json={"give": [], "ask": []}).status_code == 403
    got = a.get("/api/admin/partnership-offer").json()
    assert got["custom"] is False and len(got["offer"]["give"]) >= 3
    mine = {"give": [{"title": "  Feature on our stories  ", "text": "x" * 500}, {"title": "", "text": "dropped"}, "junk"], "ask": [{"title": "Free samples", "text": "For 50 guests"}]}
    r = a.put("/api/admin/partnership-offer", json={"give": [c for c in mine["give"] if isinstance(c, dict)], "ask": mine["ask"]}).json()
    assert r["custom"] is True and [c["title"] for c in r["offer"]["give"]] == ["Feature on our stories"] and len(r["offer"]["give"][0]["text"]) == 240
    rep = a.get("/api/admin/reports/sponsor").json()
    assert next(s for s in rep["sections"] if s["kind"] == "offer_ask")["cards"][0]["title"] == "Free samples"
    # a card can be left out of the slides like any other item
    assert a.put("/api/admin/deck-selection/sponsor", json={"hidden": ["k:offer_ask:Free samples"]}).status_code == 200
    assert _pages(a.get("/api/admin/reports/sponsor/deck.pdf").content) == len(rep["sections"]) + 3 - 1
    a.put("/api/admin/deck-selection/sponsor", json={"hidden": []})
    # an empty side drops that section; resetting brings the suggested wording back
    a.put("/api/admin/partnership-offer", json={"give": [], "ask": []})
    assert [s["kind"] for s in a.get("/api/admin/reports/sponsor").json()["sections"]][-1] != "offer_ask"
    assert a.delete("/api/admin/partnership-offer").json()["custom"] is False
    assert a.get("/api/admin/reports/sponsor").json()["sections"][-1]["kind"] == "offer_ask"
