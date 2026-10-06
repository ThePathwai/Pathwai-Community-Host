"""Platform-wide people features on the Hub (routes/hub.py): following other Pathwai accounts,
seeing which (public) communities someone belongs to, and DMs that don't need a shared community.
All three are keyed by email rather than any one community-scoped `id` -- see directory.person_by_email
for why that's the only identity that's actually stable across every community someone might belong to."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["USE_MOCK_DB"] = "true"
os.environ["ENABLE_AI_CHAT"] = "true"  # smoke tests exercise chat end to end even though it defaults off in production

from fastapi.testclient import TestClient

import server


def test_people_search_finds_seeded_personas_not_just_hub_signups():
    # demo@yourcommunity.app never went through /hub/signup -- they only exist as `users` docs
    # seeded directly into playr/grace/club-pto -- so this proves the directory-merge path, not just
    # the trivial case of two accounts that both signed up through the hub.
    with TestClient(server.app) as c:
        c.post("/api/hub/signup", json={"accepted_terms": True, "email": "searcher@example.com", "password": "Sup3rSecret!", "name": "Searcher Sam"})
        found = c.get("/api/hub/people", params={"q": "Ashley-Dejo"}).json()["people"]
        assert any(p["email"] == "demo@yourcommunity.app" for p in found)
        assert any(p["email"] == "admin@yourcommunity.app" for p in found)
        # never shows yourself
        me = c.get("/api/hub/people", params={"q": "Searcher"}).json()["people"]
        assert all(p["email"] != "searcher@example.com" for p in me)


def test_profile_photos_show_on_search_cards_profile_and_following_list():
    # The People panel reads like a social feed -- a photo gallery, not just a bio -- so photos saved
    # via PATCH /hub/profile need to ride along on every shape that feeds it: the search card, the
    # full profile, and the following/followers lists (all built on _public_person).
    with TestClient(server.app) as c:
        c.post("/api/hub/signup", json={"accepted_terms": True, "email": "photog@example.com", "password": "Sup3rSecret!", "name": "Photo Grapher"})
        r = c.patch("/api/hub/profile", json={"photos": ["data:image/png;base64,aaa", "data:image/png;base64,bbb"]})
        assert r.status_code == 200 and r.json()["account"]["photos"] == ["data:image/png;base64,aaa", "data:image/png;base64,bbb"]
        c.post("/api/auth/logout")

        c.post("/api/hub/signup", json={"accepted_terms": True, "email": "viewer2@example.com", "password": "Sup3rSecret!", "name": "Viewer Two"})
        found = c.get("/api/hub/people", params={"q": "Photo Grapher"}).json()["people"]
        assert found[0]["photos"] == ["data:image/png;base64,aaa", "data:image/png;base64,bbb"]

        prof = c.get("/api/hub/people/photog@example.com").json()
        assert prof["photos"] == ["data:image/png;base64,aaa", "data:image/png;base64,bbb"]

        c.post("/api/hub/people/photog@example.com/follow")
        following = c.get("/api/hub/following").json()["people"]
        assert next(p for p in following if p["email"] == "photog@example.com")["photos"] == ["data:image/png;base64,aaa", "data:image/png;base64,bbb"]

        # over the cap gets trimmed, not rejected
        c.post("/api/auth/logout")
        c.post("/api/auth/login", json={"email": "photog@example.com", "password": "Sup3rSecret!"})
        r2 = c.patch("/api/hub/profile", json={"photos": [f"data:image/png;base64,{i}" for i in range(15)]})
        assert len(r2.json()["account"]["photos"]) == 9


def test_follow_unfollow_and_profile_communities_respect_hidden_from_directory():
    with TestClient(server.app) as c:
        c.post("/api/hub/signup", json={"accepted_terms": True, "email": "follower1@example.com", "password": "Sup3rSecret!", "name": "Follower One"})

        prof = c.get("/api/hub/people/demo@yourcommunity.app").json()
        assert prof["is_following"] is False and prof["is_self"] is False
        slugs_before = {x["slug"] for x in prof["communities"]}
        assert {"playr", "grace", "club-pto"} <= slugs_before  # demo's real, non-hidden memberships

        r = c.post("/api/hub/people/demo@yourcommunity.app/follow")
        assert r.status_code == 201 and r.json()["is_following"] is True

        prof2 = c.get("/api/hub/people/demo@yourcommunity.app").json()
        assert prof2["is_following"] is True and prof2["followers"] == 1

        following = c.get("/api/hub/following").json()["people"]
        assert any(p["email"] == "demo@yourcommunity.app" for p in following)

        r = c.delete("/api/hub/people/demo@yourcommunity.app/follow")
        assert r.status_code == 200 and r.json()["is_following"] is False
        assert c.get("/api/hub/people/demo@yourcommunity.app").json()["followers"] == 0

        # can't follow yourself
        assert c.post("/api/hub/people/follower1@example.com/follow").status_code == 400


def test_hidden_from_directory_membership_never_shows_on_a_public_profile():
    # admin@yourcommunity.app is a platform admin: entering a community it isn't already seeded into
    # auto-creates a hidden_from_directory ghost membership there (see hub_enter). That ghost
    # membership must never surface on the platform-wide profile, even though it's a real, approved
    # `users` doc -- only playr/grace (admin's real, visible memberships) should.
    with TestClient(server.app) as c:
        c.post("/api/auth/login", json={"email": "admin@yourcommunity.app", "password": "Demo123!"})
        c.post("/api/hub/enter", json={"slug": "unity"})  # creates the hidden ghost row in unity
        c.post("/api/auth/logout")

        c.post("/api/hub/signup", json={"accepted_terms": True, "email": "viewer1@example.com", "password": "Sup3rSecret!", "name": "Viewer One"})
        prof = c.get("/api/hub/people/admin@yourcommunity.app").json()
        slugs = {x["slug"] for x in prof["communities"]}
        assert "playr" in slugs and "grace" in slugs
        assert "unity" not in slugs


def test_platform_messages_merge_into_the_unified_hub_inbox_without_a_shared_community():
    with TestClient(server.app) as c:
        c.post("/api/hub/signup", json={"accepted_terms": True, "email": "alice@example.com", "password": "Sup3rSecret!", "name": "Alice Platform"})
        c.post("/api/auth/logout")
        c.post("/api/hub/signup", json={"accepted_terms": True, "email": "bob@example.com", "password": "Sup3rSecret!", "name": "Bob Platform"})
        c.post("/api/auth/logout")

        # Alice messages Bob directly -- neither has ever joined a community.
        c.post("/api/hub/signup", json={"accepted_terms": True, "email": "alice2@example.com", "password": "Sup3rSecret!", "name": "Alice Two"})
        # (sign up as alice2 just to flush logout state cleanly between TestClient cookie sessions)
        c.post("/api/auth/logout")

        c.post("/api/auth/login", json={"email": "alice@example.com", "password": "Sup3rSecret!"})
        r = c.post("/api/hub/messages/threads", json={"recipient_emails": ["bob@example.com"], "subject": "Hey", "body": "Want to grab coffee?"})
        assert r.status_code == 201, r.text
        thread = r.json()
        assert thread["community_slug"] is None and thread["other"]["email"] == "bob@example.com"
        tid = thread["id"]
        c.post("/api/auth/logout")

        c.post("/api/auth/login", json={"email": "bob@example.com", "password": "Sup3rSecret!"})
        hub_msgs = c.get("/api/hub/messages").json()
        mine = next(t for t in hub_msgs["threads"] if t["id"] == tid)
        assert mine["unread"] is True and mine["community_slug"] is None
        assert mine["other"]["email"] == "alice@example.com"

        detail = c.get(f"/api/hub/messages/threads/{tid}").json()
        assert detail["messages"][0]["body"] == "Want to grab coffee?"
        assert c.get("/api/hub/messages").json()["unread"] == 0  # reading the thread marked it read

        reply = c.post(f"/api/hub/messages/threads/{tid}/reply", json={"body": "Sure, Thursday?"})
        assert reply.status_code == 201
        c.post("/api/auth/logout")

        c.post("/api/auth/login", json={"email": "alice@example.com", "password": "Sup3rSecret!"})
        assert c.get("/api/hub/messages").json()["unread"] == 1
        detail2 = c.get(f"/api/hub/messages/threads/{tid}").json()
        assert [m["body"] for m in detail2["messages"]] == ["Want to grab coffee?", "Sure, Thursday?"]


def test_platform_messaging_can_carry_an_invite_or_share_card():
    # The composer's "attach a community/event" option (invite/share) just rides along as the
    # thread's optional context, same shape idea as a community thread's context.
    with TestClient(server.app) as c:
        c.post("/api/hub/signup", json={"accepted_terms": True, "email": "carol@example.com", "password": "Sup3rSecret!", "name": "Carol Invites"})
        c.post("/api/auth/logout")
        c.post("/api/hub/signup", json={"accepted_terms": True, "email": "dave@example.com", "password": "Sup3rSecret!", "name": "Dave Invitee"})
        c.post("/api/auth/logout")

        c.post("/api/auth/login", json={"email": "carol@example.com", "password": "Sup3rSecret!"})
        r = c.post("/api/hub/messages/threads", json={
            "recipient_emails": ["dave@example.com"], "subject": "Come to this", "body": "Think you'd love this one.",
            "context": {"type": "event", "slug": "playr", "event_id": "evt-123", "title": "Sunday Pickup Run"},
        })
        assert r.status_code == 201
        assert r.json()["context"] == {"type": "event", "slug": "playr", "event_id": "evt-123", "title": "Sunday Pickup Run"}


def test_community_events_for_attach_picker_scoped_to_your_own_memberships():
    with TestClient(server.app) as c:
        c.post("/api/auth/login", json={"email": "demo@yourcommunity.app", "password": "Demo123!"})
        r = c.get("/api/hub/communities/playr/events")
        assert r.status_code == 200
        assert isinstance(r.json()["events"], list)
        # demo isn't a member of the-village
        assert c.get("/api/hub/communities/the-village/events").status_code == 403
        assert c.get("/api/hub/communities/not-a-real-slug/events").status_code == 404


def test_platform_message_delete_and_report():
    # Mirrors test_portal.py's test_message_delete_and_report for a community thread -- a platform
    # DM (no shared community, no community admin) previously had no way to take a message back or
    # flag it at all.
    with TestClient(server.app) as c:
        c.post("/api/hub/signup", json={"accepted_terms": True, "email": "erin@example.com", "password": "Sup3rSecret!", "name": "Erin Platform"})
        c.post("/api/auth/logout")
        c.post("/api/hub/signup", json={"accepted_terms": True, "email": "frank@example.com", "password": "Sup3rSecret!", "name": "Frank Platform"})
        c.post("/api/auth/logout")

        c.post("/api/auth/login", json={"email": "erin@example.com", "password": "Sup3rSecret!"})
        r = c.post("/api/hub/messages/threads", json={"recipient_emails": ["frank@example.com"], "body": "First message"})
        tid = r.json()["id"]
        first_msg_id = c.get(f"/api/hub/messages/threads/{tid}").json()["messages"][0]["id"]
        c.post("/api/auth/logout")

        # Frank replies -- he sends the second message, Erin sent the first.
        c.post("/api/auth/login", json={"email": "frank@example.com", "password": "Sup3rSecret!"})
        reply = c.post(f"/api/hub/messages/threads/{tid}/reply", json={"body": "Second message"})
        assert reply.status_code == 201
        second_msg_id = c.get(f"/api/hub/messages/threads/{tid}").json()["messages"][1]["id"]

        # Only the sender can delete -- Frank didn't send the first message, so he can't delete it.
        assert c.delete(f"/api/hub/messages/threads/{tid}/messages/{first_msg_id}").status_code == 403

        # Reporting doesn't remove anything -- just logs it (requires a non-empty reason).
        assert c.post(f"/api/hub/messages/threads/{tid}/messages/{first_msg_id}/report", json={"reason": ""}).status_code == 422
        assert c.post(f"/api/hub/messages/threads/{tid}/messages/{first_msg_id}/report", json={"reason": "Spam"}).status_code == 201
        detail = c.get(f"/api/hub/messages/threads/{tid}").json()
        assert [m["body"] for m in detail["messages"]] == ["First message", "Second message"]

        # Frank deletes his own message (the reply); the thread's last-message preview resyncs back
        # to Erin's.
        assert c.delete(f"/api/hub/messages/threads/{tid}/messages/{second_msg_id}").status_code == 200
        detail = c.get(f"/api/hub/messages/threads/{tid}").json()
        assert [m["body"] for m in detail["messages"]] == ["First message"]
        assert detail["last_message_preview"] == "First message"

        # Can't touch a conversation you're not part of.
        c.post("/api/auth/logout")
        c.post("/api/hub/signup", json={"accepted_terms": True, "email": "greg@example.com", "password": "Sup3rSecret!", "name": "Greg Outsider"})
        assert c.delete(f"/api/hub/messages/threads/{tid}/messages/{first_msg_id}").status_code == 404
        assert c.post(f"/api/hub/messages/threads/{tid}/messages/{first_msg_id}/report", json={"reason": "x"}).status_code == 404


def test_hub_people_and_follow_require_auth():
    with TestClient(server.app) as anon:
        assert anon.get("/api/hub/people").status_code == 401
        assert anon.get("/api/hub/people/demo@yourcommunity.app").status_code == 401
        assert anon.post("/api/hub/people/demo@yourcommunity.app/follow").status_code == 401
        assert anon.post("/api/hub/messages/threads", json={"recipient_emails": ["demo@yourcommunity.app"], "body": "hi"}).status_code == 401
