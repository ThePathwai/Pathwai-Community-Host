"""Events must follow the founder's profile: what they asked for (all fourteen needs), their sector, their stage, their group and their city."""
from datetime import date, timedelta

import events_feed as ef

TODAY = date(2026, 11, 20)
N = [0]


def ev(title, days, summary="", city="Toronto", province="ON", online=False, topics=("network",), audiences=(), price="free", org="Org"):
    N[0] += 1
    d = TODAY + timedelta(days=days)
    return {"id": f"e{N[0]}", "title": title, "summary": summary, "org": org, "city": city, "province": province, "online": online, "price": price, "topics": list(topics),
            "audiences": list(audiences), "date": d.isoformat(), "start": d.isoformat() + "T18:00:00-05:00", "end": d.isoformat() + "T20:00:00-05:00", "url": "https://x.example/e", "venue": "",
            "source_id": "s", "source_name": "s", "priority": 3, "image": "", "time": "18:00"}


BASE = {"stage": "launched", "province": "ON", "city": "Toronto", "needs": ["funding"], "sectors": ["tech"], "audiences": []}


def rank(events, **kw):
    return ef.rank_events(events, {**BASE, **kw}, TODAY)


def by_title(res, t):
    return next(e for e in res["events"] + res["others"] if e["title"] == t)


def test_every_need_can_match_an_event():
    cases = {"export": "Selling abroad: a CanExport workshop", "rd": "SR&ED and R&D funding clinic", "ip": "Patents and trademarks for founders", "talent": "How to make your first hire",
             "tax": "Tax and bookkeeping basics", "legal": "Legal basics: contracts and incorporation", "visa": "Start-up Visa and immigration for founders", "tools": "Free software and cloud credits",
             "space": "Coworking open house at the workspace"}
    for need, title in cases.items():
        e = ev(title, 5, topics=())
        r = rank([e], needs=[need], sectors=[])
        row = r["events"][0]
        assert row["fit"] == "strong" and any(ef.NEED_REASON[need] == x for x in row["reasons"]), need
        assert r["best"] == [row["id"]], need
        other = rank([e], needs=["funding"], sectors=[])["events"][0]
        assert other["fit"] == "possible" and ef.NEED_REASON[need] not in other["reasons"], need


def test_best_is_by_fit_not_by_date():
    soon_generic = ev("Founders mixer", 2, topics=("network",))
    later_perfect = ev("Angel investor funding night", 30, topics=("funding",), audiences=())
    r = rank([soon_generic, later_perfect], needs=["funding"], sectors=[])
    assert [e["title"] for e in r["events"]] == ["Founders mixer", "Angel investor funding night"]     # the calendar still runs by date
    assert r["best"][0] == later_perfect["id"] and soon_generic["id"] not in r["best"]                 # but the best list leads with what you asked for


def test_sector_counts():
    health = ev("MedTech founders breakfast", 9, topics=("network",))
    plain = ev("Founders breakfast", 3, topics=("network",))
    r = rank([plain, health], needs=[], sectors=["health"])
    assert by_title(r, "MedTech founders breakfast")["score"] > by_title(r, "Founders breakfast")["score"]
    assert any("health" in x for x in by_title(r, "MedTech founders breakfast")["reasons"])
    assert r["best"] == [health["id"]]
    assert rank([health], needs=[], sectors=["food"])["best"] == []


def test_stage_is_used_and_a_mismatch_is_said_out_loud():
    early = ev("Idea-stage founders: validate your idea", 5)
    late = ev("Scale-up growth summit for Series B founders", 6)
    idea = rank([early, late], stage="idea", needs=[], sectors=[])
    assert by_title(idea, early["title"])["score"] > by_title(idea, late["title"])["score"]
    assert any("Pitched at founders at your stage" in x for x in by_title(idea, early["title"])["reasons"])
    assert any("scale-ups" in x for x in by_title(idea, late["title"])["cautions"])
    grown = rank([early, late], stage="growth", needs=[], sectors=[])
    assert by_title(grown, late["title"])["score"] > by_title(grown, early["title"])["score"]
    assert any("first-time and early-stage" in x for x in by_title(grown, early["title"])["cautions"])


def test_group_events_lead_for_that_group_and_stay_out_for_everyone_else():
    wom = ev("Women in business networking night", 10, audiences=("women",))
    gen = ev("Funding workshop", 2, topics=("funding",))
    f = rank([wom, gen], needs=["funding"], sectors=[], gender="female")
    assert f["best"][0] == wom["id"]
    m = rank([wom, gen], needs=["funding"], sectors=[], gender="male")
    assert wom["id"] not in [e["id"] for e in m["events"]] and wom["id"] in [e["id"] for e in m["others"]]


def test_city_and_province_matter():
    here = ev("Funding night", 4, topics=("funding",), city="Toronto")
    near = ev("Funding night", 4, topics=("funding",), city="Hamilton")
    away = ev("Funding night", 4, topics=("funding",), city="Calgary", province="AB")
    r = rank([here, near, away], needs=["funding"], sectors=[])
    ids = [e["id"] for e in r["events"]]
    assert here["id"] in ids and near["id"] in ids and away["id"] in [e["id"] for e in r["others"]]
    assert next(e for e in r["events"] if e["id"] == here["id"])["score"] > next(e for e in r["events"] if e["id"] == near["id"])["score"]


def test_without_a_profile_there_is_no_best_list_and_two_founders_differ():
    events = [ev("Funding night", 3, topics=("funding",)), ev("MedTech mentors", 5, topics=("mentorship",)), ev("Patents for founders", 7, topics=()), ev("Export workshop: selling abroad", 9, topics=())]
    assert ef.rank_events(events, None, TODAY)["best"] == []
    a = rank(events, needs=["funding"], sectors=["tech"])["best"]
    b = rank(events, needs=["ip", "export"], sectors=["health"])["best"]
    assert a != b and set(a) != set(b)
