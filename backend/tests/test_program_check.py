"""The page checker: section links, requirement confirmation, and timing statements, on pages shaped like real program pages."""
from datetime import date, datetime, timezone

import program_check as pc

NOW = datetime(2026, 11, 20, 12, 0, tzinfo=timezone.utc)
PROG = {"id": "x", "name": "NRC IRAP", "apply_url": "https://nrc.example.ca/irap", "link_kind": "program", "status": "check",
        "deadline": {"kind": "none_published", "date": None, "note": "Contact for intake"},
        "requirements": ["Incorporated, for-profit SME in Canada", "500 or fewer employees", "Innovative, technology-driven product or service", "Talk to an Industrial Technology Advisor first", "Must have a unicorn"]}

PAGE = """<html><head><title>NRC IRAP | National Research Council</title></head><body>
<header><nav><a>Home</a><a>About</a></nav></header>
<main><h1>NRC IRAP</h1><p>The Industrial Research Assistance Program helps small and medium-sized businesses grow through innovation.</p>
<section id="eligibility"><h2>Eligibility</h2>
<ul><li>You must be an incorporated, for-profit small or medium-sized enterprise in Canada.</li>
<li>Your company has 500 or fewer employees.</li><li>You are developing an innovative, technology-driven product or service.</li></ul></section>
<h2>How to apply</h2><p>Start by talking to an Industrial Technology Advisor (ITA) in your region. Applications are accepted on a rolling basis.</p>
<p>""" + ("Filler text about the program and what it funds. " * 30) + """</p></main><footer>Contact</footer></body></html>"""


def test_links_and_requirements():
    c = pc.check_page(PROG, PAGE, PROG["apply_url"], NOW)
    assert c["ok"] and c["named"]
    assert c["section"]["label"] == "Eligibility" and c["section"]["url"] == "https://nrc.example.ca/irap#eligibility"   # program pages lead with who qualifies, by id
    assert c["sections"]["apply"]["url"].startswith("https://nrc.example.ca/irap#:~:text=How%20to%20apply")             # no id: a text fragment
    ok = {r["requirement"] for r in c["requirements"] if r["confirmed"]}
    assert "Incorporated, for-profit SME in Canada" in ok and "500 or fewer employees" in ok and "Innovative, technology-driven product or service" in ok
    assert "Talk to an Industrial Technology Advisor first" in ok
    assert "Must have a unicorn" not in ok                      # never confirmed without the page saying it
    assert c["signals"]["rolling"] and c["timing"]["status"] == "rolling"


def test_merge_changes_link_and_hides_nothing_unproven():
    c = pc.check_page(PROG, PAGE, PROG["apply_url"], NOW)
    m = pc.merge_check(PROG, c)
    assert m["apply_url"].endswith("#eligibility") and m["base_url"] == PROG["apply_url"] and m["verified"] == "official"
    assert m["status"] == "rolling" and m["page_check"]["total"] == 5 and len(m["page_check"]["confirmed"]) == 4
    assert PROG["status"] == "check" and "#" not in PROG["apply_url"]      # the original entry is untouched


def test_closed_and_conflict():
    closed = PAGE.replace("Applications are accepted on a rolling basis.", "Applications are now closed for this intake.")
    c = pc.check_page(PROG, closed, PROG["apply_url"], NOW)
    assert c["timing"]["status"] == "closed" and "closed" in c["timing"]["evidence"].lower()
    both = closed.replace("<h2>How to apply</h2>", "<h2>How to apply</h2><p>Applications are now open. Apply anytime.</p>")
    assert pc.check_page(PROG, both, PROG["apply_url"], NOW)["timing"] is None            # the page says both: change nothing


def test_deadline_dates():
    page = PAGE.replace("Applications are accepted on a rolling basis.", "The next application deadline is January 15, 2027. Past deadline: March 1, 2026.")
    c = pc.check_page(PROG, page, PROG["apply_url"], NOW)
    assert c["timing"]["status"] == "open" and c["timing"]["deadline"] == {"kind": "fixed", "date": "2027-01-15", "note": ""}
    page2 = PAGE.replace("Applications are accepted on a rolling basis.", "Applications close 15 December 2026 at 5 pm ET.")
    assert pc.check_page(PROG, page2, PROG["apply_url"], NOW)["timing"]["deadline"]["date"] == "2026-12-15"


def test_wrong_or_empty_page_changes_nothing():
    other = "<html><head><title>Welcome</title></head><body><h1>Welcome</h1><p>" + ("Latest news from our team. " * 40) + "</p></body></html>"
    c = pc.check_page(PROG, other, PROG["apply_url"], NOW)
    assert not c["ok"] and c["timing"] is None and "does not mention" in c["problem"]
    m = pc.merge_check(PROG, c)
    assert m["apply_url"] == PROG["apply_url"] and m["status"] == "check" and m["page_check"]["ok"] is False
    shell = "<html><head><title>NRC IRAP</title></head><body><div id='root'></div><script>app()</script></body></html>"
    assert "almost no readable text" in pc.check_page(PROG, shell, PROG["apply_url"], NOW)["problem"]


def test_text_fragment_is_safe_in_a_url():
    html = "<html><body><h2>Who can apply? (Ontario-based, for-profit)</h2><p>x</p></body></html>"
    s = pc.find_section(pc.parse_page(html), "https://a.ca/p#old", "eligibility")
    assert s["url"].startswith("https://a.ca/p#:~:text=Who%20can%20apply%3F") and "," not in s["url"].split("text=")[1] and " " not in s["url"]
