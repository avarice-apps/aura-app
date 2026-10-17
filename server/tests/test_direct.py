"""Poise Direct: off by default, linking proves the number, webhooks are verified and deduplicated,
Black is checked on the server for every message, limits hold, and replies only go back to the sender."""
import asyncio
import base64
import hashlib
import hmac
import time

import pytest
from fastapi.testclient import TestClient

import main
from pipeline import accounts, direct, drafts, converse

URL = "https://kleos.test/direct/twilio"


@pytest.fixture
def client():
    main._hits.clear()
    return TestClient(main.app)


@pytest.fixture
def sms(monkeypatch):
    monkeypatch.setenv("KLEOS_DIRECT_CHANNEL", "sms")
    monkeypatch.setenv("TWILIO_FROM", "+15550001111")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "tok_test_123")
    monkeypatch.setenv("KLEOS_DIRECT_WEBHOOK_URL", URL)
    monkeypatch.setenv("KLEOS_SIGNING_KEY", "k" * 40)


def person(client, plan=None):
    r = client.post("/auth/guest", json={"subject": "s_dir" + str(time.time_ns())[-9:]}, headers={"x-forwarded-for": "10.7.0.1"})
    tok, acc = r.json()["token"], r.json()["account"]
    if plan:
        accounts.set_plan(acc["id"], plan, time.time() + 86400, "test")
    return {"authorization": f"Bearer {tok}"}, acc


def sign(params):
    data = URL + "".join(k + params[k] for k in sorted(params))
    return base64.b64encode(hmac.new(b"tok_test_123", data.encode(), hashlib.sha1).digest()).decode()


class Outbox:
    def __init__(self):
        self.sent = []

    async def __call__(self, to, text):
        self.sent.append((to, text))


def run(coro):
    return asyncio.run(coro)


def test_off_by_default(client):
    h, _ = person(client, "black")
    assert client.get("/direct/status", headers=h).json()["enabled"] is False
    assert client.post("/direct/link", headers=h).status_code == 404
    assert client.post("/direct/twilio", data={"From": "+1", "Body": "hi", "MessageSid": "SM1"}).status_code == 404
    assert client.post("/direct/sendblue/whatever", json={}).status_code == 404


def test_link_needs_black_and_gives_a_text_to_send(client, sms):
    h, _ = person(client)
    r = client.post("/direct/link", headers=h)
    assert r.status_code == 402 and r.json()["reason"] == "direct"
    hb, _ = person(client, "black")
    j = client.post("/direct/link", headers=hb).json()
    assert j["to"] == "+15550001111" and j["text"] == f"LINK {j['code']}" and j["sms"].startswith("sms:+15550001111&body=LINK%20")


def test_webhook_signature_and_dedupe(client, sms, monkeypatch):
    got = []
    monkeypatch.setattr(direct, "handle", lambda msg, reply: got.append(msg))
    p = {"From": "+15551234567", "To": "+15550001111", "Body": "hello", "MessageSid": "SMabc"}
    assert client.post("/direct/twilio", data=p).status_code == 403
    assert client.post("/direct/twilio", data=p, headers={"x-twilio-signature": "bogus"}).status_code == 403
    for _ in range(2):  # Twilio retries; only the first counts
        r = client.post("/direct/twilio", data=p, headers={"x-twilio-signature": sign(p)})
        assert r.status_code == 200 and "<Response>" in r.text
    assert [m["event_id"] for m in got] == ["tw:SMabc"]


def test_linking_by_text_and_answers_only_for_black(client, sms, monkeypatch):
    hb, acc = person(client, "black")
    code = client.post("/direct/link", headers=hb).json()["code"]
    out = Outbox()
    phone = "+1 (555) 123-4567"
    # an unknown number gets pointed to the app, nothing else
    run(direct._process(direct.Inbound(event_id="e0", sender=phone, text="hi"), out))
    assert "isn't linked" in out.sent[-1][1]
    run(direct._process(direct.Inbound(event_id="e1", sender=phone, text=f"link {code}"), out))
    assert out.sent[-1] == (phone, out.sent[-1][1]) and out.sent[-1][1].startswith("Linked.")
    # the code is single use
    run(direct._process(direct.Inbound(event_id="e2", sender="+15559999999", text=f"LINK {code}"), out))
    assert "didn't work" in out.sent[-1][1]
    assert client.get("/direct/status", headers=hb).json()["linked"] is True

    async def fake_ledger(story, context="", tone="real", user=None):
        assert "Earlier in this text thread" not in context or "hi" in context
        return {"advice": "Wear the navy. Arrive ten minutes early.", "lines": []}

    monkeypatch.setattr(converse, "ledger", fake_ledger)
    run(direct._process(direct.Inbound(event_id="e3", sender="+15551234567", text="what should I wear tonight?"), out))
    assert out.sent[-1] == ("+15551234567", "Wear the navy. Arrive ten minutes early.")
    assert [m["role"] for m in client.get("/direct/history", headers=hb).json()["messages"]] == ["user", "poise"]
    # the plan lapses: one notice a day, no answers
    accounts.set_plan(acc["id"], "free", None, "test")
    n = len(out.sent)
    run(direct._process(direct.Inbound(event_id="e4", sender=phone, text="are you there"), out))
    run(direct._process(direct.Inbound(event_id="e5", sender=phone, text="hello?"), out))
    assert len(out.sent) == n + 1 and "Kleos Black" in out.sent[-1][1]


def test_draft_messages_get_a_read_and_two_versions(client, sms, monkeypatch):
    hb, acc = person(client, "black")
    code = client.post("/direct/link", headers=hb).json()["code"]
    out = Outbox()
    run(direct._process(direct.Inbound(event_id="d1", sender="+15550002222", text=f"LINK {code}"), out))

    async def fake_review(draft, convo=None, to="", intent="", outcome="", tone="real", user=None):
        assert draft == "are we still on for friday at 8pm? totally fine if not"
        return {"reads": "Clear, but the last line hands them an exit.", "change": "Drop it.", "alternatives": [{"label": "A", "text": "are we still on for friday at 8pm?"}, {"label": "B", "text": "friday at 8pm still good?"}], "clarify": None}

    monkeypatch.setattr(drafts, "review", fake_review)
    run(direct._process(direct.Inbound(event_id="d2", sender="+15550002222", text="draft: are we still on for friday at 8pm? totally fine if not"), out))
    assert [t for _, t in out.sent[-3:]] == ["Clear, but the last line hands them an exit. Drop it.", "are we still on for friday at 8pm?", "friday at 8pm still good?"]


def test_classifier():
    assert direct.classify("check: hey are we still on")[0] == "draft"
    assert direct.classify('should I send "hey, sorry, are we still on for tonight?"')[0] == "draft"
    assert direct.classify("what do I wear to a wedding")[0] == "ask"


def test_rate_limit_and_unlink_by_text(client, sms, monkeypatch):
    monkeypatch.setattr(direct, "PER_HOUR", 2)
    hb, acc = person(client, "black")
    code = client.post("/direct/link", headers=hb).json()["code"]
    out = Outbox()
    run(direct._process(direct.Inbound(event_id="r0", sender="+15550003333", text=f"LINK {code}"), out))

    async def fake_ledger(story, context="", tone="real", user=None):
        return {"advice": "ok", "lines": []}

    monkeypatch.setattr(converse, "ledger", fake_ledger)
    for i in range(4):
        run(direct._process(direct.Inbound(event_id=f"r{i+1}", sender="+15550003333", text=f"question {i}"), out))
    texts = [t for _, t in out.sent[1:]]
    assert texts.count("ok") == 2 and sum("a lot of messages" in t for t in texts) == 1
    run(direct._process(direct.Inbound(event_id="r9", sender="+15550003333", text="UNLINK"), out))
    assert client.get("/direct/status", headers=hb).json()["linked"] is False


def test_sendblue_path_secret_and_groups(client, monkeypatch):
    monkeypatch.setenv("KLEOS_DIRECT_CHANNEL", "imessage")
    monkeypatch.setenv("SENDBLUE_FROM", "+15550004444")
    monkeypatch.setenv("SENDBLUE_WEBHOOK_TOKEN", "x" * 32)
    monkeypatch.setenv("KLEOS_SIGNING_KEY", "k" * 40)
    got = []
    monkeypatch.setattr(direct, "handle", lambda msg, reply: got.append(msg))
    body = {"content": "hi", "from_number": "+15551112222", "message_handle": "h1", "is_outbound": False}
    assert client.post("/direct/sendblue/" + "y" * 32, json=body).status_code == 404
    assert client.post("/direct/sendblue/" + "x" * 32, json=body).status_code == 200
    assert client.post("/direct/sendblue/" + "x" * 32, json={**body, "message_handle": "h2", "group_id": "g"}).status_code == 200
    assert client.post("/direct/sendblue/" + "x" * 32, json={**body, "message_handle": "h3", "is_outbound": True}).status_code == 200
    assert [m["event_id"] for m in got] == ["sb:h1"]


def test_context_only_keeps_what_was_allowed_and_deletion(client, sms):
    hb, acc = person(client, "black")
    client.post("/direct/context", json={"allow": {"occasion": True, "style": False}, "occasion": "Dinner Friday", "style": "Old money"}, headers=hb)
    with direct.db() as c:
        body = c.execute("select body from context where account_id=?", (acc["id"],)).fetchone()["body"]
    assert "Dinner Friday" in body and "Old money" not in body
    code = client.post("/direct/link", headers=hb).json()["code"]
    run(direct._process(direct.Inbound(event_id="x1", sender="+15550005555", text=f"LINK {code}"), Outbox()))
    assert client.post("/account/delete", headers=hb).status_code == 200
    with direct.db() as c:
        assert c.execute("select count(*) from links").fetchone()[0] == 0
        assert c.execute("select count(*) from context").fetchone()[0] == 0


def test_needs_a_signing_key(client, sms, monkeypatch):
    monkeypatch.delenv("KLEOS_SIGNING_KEY")
    h, _ = person(client, "black")
    assert client.get("/direct/status", headers=h).json()["enabled"] is False
    assert client.post("/direct/link", headers=h).status_code == 404


def test_codes_are_eight_digits_and_guessing_is_throttled(client, sms):
    hb, _ = person(client, "black")
    code = client.post("/direct/link", headers=hb).json()["code"]
    assert len(code) == 8 and code.isdigit()
    out = Outbox()
    guesser = "+15550006666"
    for i in range(12):
        run(direct._process(direct.Inbound(event_id=f"g{i}", sender=guesser, text=f"LINK {10000000 + i}"), out))
    assert len(out.sent) == 1  # one "didn't work" a day, then silence
    # past the per-sender limit even the right code isn't tried from that number today
    run(direct._process(direct.Inbound(event_id="g-right", sender=guesser, text=f"LINK {code}"), out))
    assert client.get("/direct/status", headers=hb).json()["linked"] is False
    # someone else's real number still links
    run(direct._process(direct.Inbound(event_id="g-ok", sender="+15550007777", text=f"LINK {code}"), out))
    assert out.sent[-1][1].startswith("Linked.")


def test_unlinked_numbers_get_one_reply_a_day_and_stop_is_silent(client, sms, monkeypatch):
    out = Outbox()
    for i in range(5):
        run(direct._process(direct.Inbound(event_id=f"u{i}", sender="+15550008888", text="hello?"), out))
        run(direct._process(direct.Inbound(event_id=f"h{i}", sender="+15550008888", text="HELP"), out))
    assert len(out.sent) == 1
    hb, _ = person(client, "black")
    code = client.post("/direct/link", headers=hb).json()["code"]
    run(direct._process(direct.Inbound(event_id="s0", sender="+15550009999", text=f"LINK {code}"), out))
    n = len(out.sent)
    run(direct._process(direct.Inbound(event_id="s1", sender="+15550009999", text="STOP"), out))
    assert len(out.sent) == n  # the carrier confirms opt-outs; we say nothing
    assert client.get("/direct/status", headers=hb).json()["linked"] is False


def test_every_outgoing_text_counts_against_the_ceiling(client, sms, monkeypatch):
    monkeypatch.setattr(direct, "OUT_DAILY_CAP", 3)
    out = Outbox()
    for i in range(10):
        run(direct._process(direct.Inbound(event_id=f"c{i}", sender=f"+1555001{i:04d}", text="hi"), out))
    assert len(out.sent) == 3


def test_help_counts_toward_the_rate_limit(client, sms, monkeypatch):
    monkeypatch.setattr(direct, "PER_HOUR", 2)
    hb, _ = person(client, "black")
    code = client.post("/direct/link", headers=hb).json()["code"]
    out = Outbox()
    run(direct._process(direct.Inbound(event_id="hl0", sender="+15550001234", text=f"LINK {code}"), out))
    for i in range(6):
        run(direct._process(direct.Inbound(event_id=f"hl{i+1}", sender="+15550001234", text="help"), out))
    assert len(out.sent) == 1 + 2 + 1  # linked, two answers, one "a lot of messages"
