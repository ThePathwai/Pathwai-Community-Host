from community_group import community_group


def test_innovation_communities():
    assert community_group({"community_kind": "Innovation & entrepreneurship network"}) == "innovation"
    assert community_group({"community_kind": "Professional network", "interest_tags": ["Entrepreneurship"]}) == "innovation"
    assert community_group({"community_kind": "Founders circle"}) == "innovation"
    assert community_group({"community_kind": "Community", "interest_tags": ["Tech"]}) == "innovation"
    assert community_group({"community_type": "startup"}) == "innovation"


def test_leisure_communities():
    for kind, tags in [("Wellness & events", ["Wellness", "Sports"]), ("church", ["Faith"]), ("dinner club", ["Food & Dining"]), ("padel club", ["Sports", "Parenting"]), ("Gym & fitness", ["Wellness"]), ("Run club", ["Sports"])]:
        assert community_group({"community_kind": kind, "interest_tags": tags, "community_type": "social"}) == "leisure", kind
    assert community_group({}) == "leisure"


def test_explicit_override_wins():
    assert community_group({"community_kind": "Run club", "community_group": "innovation"}) == "innovation"
    assert community_group({"community_kind": "Tech community", "community_group": "leisure"}) == "leisure"
