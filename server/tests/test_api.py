"""The HTTP surface: who may call what, signatures, plan gates and the live-call allowance."""
import time

import pytest
from fastapi.testclient import TestClient

import main
from pipeline import accounts, converse


@pytest.fixture
def client(monkeypatch):
    main._hits.clear()
    return TestClient(main.app)  # no lifespan: no warm-up, no ElevenLabs agent


def guest(client, ip="10.0.0.1"):
    r = client.post("/auth/guest", json={"subject": "s_test" + str(time.time_ns())[-8:]}, headers={"x-forwarded-for": ip})
    assert r.status_code == 200, r.text
    return {"authorization": f"Bearer {r.json()['token']}"}, r.json()["account"]


def test_expensive_endpoints_need_an_account(client):
    for path in ("/live/start", "/session/start", "/lesson", "/portrait", "/wardrobe/build", "/style/profile", "/table/verdict", "/redeem", "/challenge", "/privacy/delete", "/account/delete"):
        assert client.post(path, json={}).status_code == 401, path
    assert client.get("/me").status_code == 401
    assert client.get("/account").status_code == 401


def test_guest_then_account(client):
    h, acc = guest(client)
    r = client.get("/account", headers=h)
    assert r.status_code == 200 and r.json()["plan"] == "free" and r.json()["left"]["calls"] == 2
    r = client.post("/account", json={"name": "  Ana   Lopez "}, headers=h)
    assert r.json()["name"] == "Ana Lopez"


def test_tts_only_serves_signed_lines(client):
    assert client.get("/tts", params={"text": "free speech please"}).status_code == 403
    url = main._voice_url("Hello there.", "voice123")
    assert "sig=" in url
    bad = url.replace("Hello", "Goodbye").split("/tts", 1)[1]
    assert client.get("/tts" + bad).status_code == 403


def test_rate_limit_uses_the_proxy_appended_ip(client, monkeypatch):
    monkeypatch.setattr(main, "_AUTH_LIMITS", ((3, 600), (100, 86400)))
    for i in range(3):
        assert client.post("/auth/email/start", json={"email": f"x{i}@example.com"}, headers={"x-forwarded-for": f"6.6.6.{i}, 7.7.7.7"}).status_code in (200, 429)
    # forging a different left-most address doesn't reset the counter: the right-most one is ours
    r = client.post("/auth/email/start", json={"email": "y@example.com"}, headers={"x-forwarded-for": "1.2.3.4, 7.7.7.7"})
    assert r.status_code == 429


def test_email_sign_in_over_http(client):
    h, acc = guest(client)
    code = client.post("/auth/email/start", json={"email": "zo@example.com"}, headers={"x-forwarded-for": "5.5.5.5"}).json()["dev_code"]
    r = client.post("/auth/email/verify", json={"email": "zo@example.com", "code": code}, headers={**h, "x-forwarded-for": "5.5.5.5"})
    assert r.status_code == 200 and r.json()["account"]["saved"] and r.json()["account"]["id"] == acc["id"]
    # the website gets a cookie instead of a token in the body
    code = client.post("/auth/email/start", json={"email": "web@example.com"}, headers={"x-forwarded-for": "5.5.5.6"}).json()["dev_code"]
    r = client.post("/auth/email/verify", json={"email": "web@example.com", "code": code}, headers={"x-kleos-web": "1", "x-forwarded-for": "5.5.5.6"})
    assert "token" not in r.json() and "kleos_session" in r.headers.get("set-cookie", "")
    assert "HttpOnly" in r.headers["set-cookie"]


def test_dev_plan_switch_is_off_unless_enabled(client, monkeypatch):
    h, _ = guest(client)
    monkeypatch.delenv("KLEOS_DEV_PLANS", raising=False)
    assert client.post("/account/plan/dev", json={"plan": "black"}, headers=h).status_code == 404
    monkeypatch.setenv("KLEOS_DEV_PLANS", "1")
    assert client.post("/account/plan/dev", json={"plan": "black"}, headers=h).json()["plan"] == "black"


def test_plan_gates_answer_402_with_a_reason(client):
    h, _ = guest(client)
    r = client.post("/wardrobe/build", json={"items": []}, headers=h)
    assert r.status_code == 402 and r.json()["reason"] == "wardrobe"
    r = client.post("/portrait", json={"history": []}, headers=h)
    assert r.status_code == 402 and r.json()["reason"] == "portrait"
    r = client.post("/lesson", json={"unit": "Rehearse", "objective": "dinner"}, headers=h)
    assert r.status_code == 402 and r.json()["reason"] == "rehearse"


def test_webhook_requires_the_secret_and_sets_plans(client, monkeypatch):
    monkeypatch.setenv("REVENUECAT_WEBHOOK_AUTH", "s3cret-value")
    h, acc = guest(client)
    ev = {"event": {"id": "ev1", "type": "INITIAL_PURCHASE", "app_user_id": acc["id"], "entitlement_ids": ["plus"], "expiration_at_ms": (time.time() + 86400) * 1000, "price": 6.99}}
    assert client.post("/webhooks/revenuecat", json=ev, headers={"authorization": "nope"}).status_code == 401
    r = client.post("/webhooks/revenuecat", json=ev, headers={"authorization": "Bearer s3cret-value"})
    assert r.status_code == 200 and r.json()["plan"]["accounts"] == 1
    assert client.get("/account", headers=h).json()["plan"] == "plus"


def test_live_start_counts_the_allowance_and_refuses_after(client, monkeypatch):
    async def agent():
        return "agent_test"

    async def token(_):
        return "tok"
    monkeypatch.setattr(main, "_agent_id", agent)
    monkeypatch.setattr(main.live, "conversation_token", token)
    h, _ = guest(client)
    for _ in range(2):
        r = client.post("/live/start", json={"room_id": "q-split-bill"}, headers=h)
        assert r.status_code == 200, r.text
        sid = r.json()["session_id"]
        assert converse.SESSIONS[sid]["allow_s"] == accounts.LIMITS["free"]["call_s"]
        # a real call: they talked, then the app went quiet without hanging up (it's settled when the next starts)
        converse.SESSIONS[sid]["turns"].append({"role": "user", "text": "hello there"})
        converse.SESSIONS[sid].update(heard=True, active_at=time.time() - 120)
    r = client.post("/live/start", json={"room_id": "q-split-bill"}, headers=h)
    assert r.status_code == 402 and r.json()["reason"] == "calls"
    # the daily side quest is still free once today
    r = client.post("/live/start", json={"daily_id": next(iter(converse.DAILIES))}, headers=h)
    assert r.status_code == 200 and r.json()["masked"]


def test_someone_elses_call_is_off_limits(client, monkeypatch):
    async def agent():
        return "agent_test"

    async def token(_):
        return "tok"
    monkeypatch.setattr(main, "_agent_id", agent)
    monkeypatch.setattr(main.live, "conversation_token", token)
    h1, _ = guest(client, "10.0.0.1")
    h2, _ = guest(client, "10.0.0.2")
    sid = client.post("/live/start", json={"room_id": "q-split-bill"}, headers=h1).json()["session_id"]
    assert client.post(f"/live/{sid}/finish", json={}, headers=h2).status_code == 403
    assert client.post("/live/start", json={"resume": {"session": sid, "turn": 1}}, headers=h2).status_code in (402, 403)


def test_retry_moment_needs_plus(client, monkeypatch):
    async def agent():
        return "agent_test"

    async def token(_):
        return "tok"
    monkeypatch.setattr(main, "_agent_id", agent)
    monkeypatch.setattr(main.live, "conversation_token", token)
    h, acc = guest(client)
    sid = client.post("/live/start", json={"room_id": "q-split-bill"}, headers=h).json()["session_id"]
    converse.SESSIONS[sid]["turns"] += [{"role": "user", "text": "fine", "facts": {}}, {"role": "char", "text": "ok", "interest": 50, "trust": 50}]
    r = client.post("/live/start", json={"resume": {"session": sid, "turn": 1}}, headers=h)
    assert r.status_code == 402 and r.json()["reason"] == "retry"
    accounts.set_plan(acc["id"], "plus", time.time() + 86400, "test")
    r = client.post("/live/start", json={"resume": {"session": sid, "turn": 1}}, headers=h)
    assert r.status_code == 200 and r.json()["resumed"]


def test_delete_account(client):
    h, acc = guest(client)
    assert client.post("/account/delete", headers=h).json()["deleted"]
    assert client.get("/account", headers=h).status_code == 401


def test_a_new_call_hangs_up_the_old_one_and_minutes_are_reserved(client, monkeypatch):
    async def agent():
        return "agent_test"

    async def token(_):
        return "tok"
    monkeypatch.setattr(main, "_agent_id", agent)
    monkeypatch.setattr(main.live, "conversation_token", token)
    h, acc = guest(client, "10.0.3.1")
    accounts.set_plan(acc["id"], "plus", time.time() + 86400, "test")
    full = accounts.LIMITS["plus"]["live_s"]
    r = client.post("/live/start", json={"room_id": "q-split-bill"}, headers=h)
    sid = r.json()["session_id"]
    assert accounts.remaining(accounts.get(acc["id"]), "live_s") == full - r.json()["allow_s"]  # reserved up front
    # it goes quiet (the app died mid-call); the next start hangs it up, charges it to its last activity and
    # gives the rest of the reservation back
    converse.SESSIONS[sid].update(created=time.time() - 200, active_at=time.time() - 120, heard=True)
    converse.SESSIONS[sid]["turns"].append({"role": "user", "text": "hello"})
    r2 = client.post("/live/start", json={"room_id": "q-split-bill"}, headers=h)
    assert r2.status_code == 200
    used = full - accounts.remaining(accounts.get(acc["id"]), "live_s") - r2.json()["allow_s"]
    assert 60 <= used <= 100  # about 80 s of the first call, not its whole reservation
    assert converse.SESSIONS[sid]["closed"] is True
    # a second phone starting a call while this one is live hangs this one up, charged until now
    s2 = r2.json()["session_id"]
    converse.SESSIONS[s2].update(created=time.time() - 50, active_at=time.time(), heard=True)
    converse.SESSIONS[s2]["turns"].append({"role": "user", "text": "hey"})
    r3 = client.post("/live/start", json={"room_id": "q-split-bill"}, headers=h)
    assert r3.status_code == 200 and converse.SESSIONS[s2]["closed"] is True
    # no token, no peeking at someone's call
    assert client.get(f"/live/{r3.json()['session_id']}/state").status_code == 403


def test_a_failed_request_gives_the_allowance_back(client, monkeypatch):
    h, acc = guest(client, "10.0.4.1")
    before = accounts.remaining(accounts.get(acc["id"]), "fits")
    # no styles picked: refused after the spend, so it's given back
    assert client.post("/style/profile", json={"lanes": []}, headers=h).status_code == 422
    assert accounts.remaining(accounts.get(acc["id"]), "fits") == before

    async def boom(*a, **k):
        raise RuntimeError("upstream down")
    monkeypatch.setattr(main.vision, "style_profile", boom)
    with pytest.raises(RuntimeError):
        TestClient(main.app).post("/style/profile", json={"lanes": ["Old money"]}, headers=h)
    assert accounts.remaining(accounts.get(acc["id"]), "fits") == before

    async def ok(*a, **k):
        return {"direction": "x"}
    monkeypatch.setattr(main.vision, "style_profile", ok)
    assert client.post("/style/profile", json={"lanes": ["Old money"]}, headers=h).status_code == 200
    assert accounts.remaining(accounts.get(acc["id"]), "fits") == before - 1


def test_an_endpoint_that_refunds_itself_isnt_refunded_twice(client, monkeypatch):
    h, acc = guest(client, "10.0.4.2")
    before = accounts.remaining(accounts.get(acc["id"]), "poise")

    async def bad(**k):
        raise ValueError("Nothing to read.")
    monkeypatch.setattr(main.drafts, "review", bad)
    assert client.post("/poise/draft", json={"draft": "hey are we still on"}, headers=h).status_code == 422
    assert accounts.remaining(accounts.get(acc["id"]), "poise") == before


def test_decompression_bombs_are_refused_before_decoding():
    import io
    import struct
    import zlib
    # a PNG header claiming 30000 x 30000 pixels, with almost no data behind it
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 30000, 30000, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"\x00" * 100)) + chunk(b"IEND", b"")
    assert main._as_jpeg(png) is None
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (640, 480), "navy").save(buf, "PNG")
    assert main._as_jpeg(buf.getvalue())[:2] == b"\xff\xd8"


def test_inputs_of_the_wrong_shape_are_refused_not_crashed(client):
    h, _ = guest(client, "10.0.4.3")
    assert client.post("/waitlist", content=b"[1,2]", headers={"content-type": "application/json"}).status_code == 422
    assert client.post("/situations/s_x/answer", json={"choice": "abc"}).status_code == 422
    assert client.post("/account/summary", json={"recent": {"a": 1}, "streak": "9" * 40, "index": True}, headers=h).status_code in (200, 403)
    assert client.get("/tts", params={"text": "hi", "sig": "é"}).status_code == 403


def test_asking_twice_reuses_the_code_unless_it_was_used(client):
    a = client.post("/auth/email/start", json={"email": "twice@example.com"}, headers={"x-forwarded-for": "8.8.1.1"}).json()
    b = client.post("/auth/email/start", json={"email": "twice@example.com"}, headers={"x-forwarded-for": "8.8.1.1"}).json()
    assert b == {"sent": True, "already": True}
    h, _ = guest(client, "8.8.1.2")
    assert client.post("/auth/email/verify", json={"email": "twice@example.com", "code": a["dev_code"]}, headers=h).status_code == 200
    c = client.post("/auth/email/start", json={"email": "twice@example.com"}, headers={"x-forwarded-for": "8.8.1.1"}).json()
    assert c.get("dev_code") and not c.get("already")  # a fresh code, since the first was used


def test_lab_report_bands_and_what_it_leaves_out():
    from pipeline import lab
    voice = {"word_count": 80, "duration_s": 30, "wpm": 160, "filler_count": 4, "hedge_count": 1, "apology_count": 0, "pitch_variance": 0.8,
             "longest_pause_s": 2.5, "first_word_s": 0.4, "sentence_count": 5, "upward_endings": 3, "fade_endings": 0}
    ms = {m["key"]: m for m in lab.measures(voice, {"available": False})}
    assert ms["pace"]["status"] == "in" and ms["fillers"]["status"] == "high" and ms["melody"]["status"] == "low"
    assert ms["pause"]["status"] == "high" and ms["uptalk"]["status"] == "high" and "eyes" not in ms  # no face, no eye measure
    assert ms["fillers"]["source"] == "research" and ms["fillers"]["ref"] in lab.REFS
    assert lab.measures({"word_count": 3, "duration_s": 2}, {}) == []  # too little to measure honestly


def test_like_is_only_a_filler_when_it_does_no_work():
    from pipeline.audio import Word, _find_phrases, FILLERS
    ws = lambda s: [Word(w, i * 0.3, i * 0.3 + 0.2, 0.9) for i, w in enumerate(s.split())]
    assert _find_phrases(ws("I'd like to work on something bigger"), FILLERS) == []
    assert _find_phrases(ws("it looks like rain and you like it"), FILLERS) == []
    assert [h["word"] for h in _find_phrases(ws("it was like so good, um, honestly"), FILLERS)] == ["like", "um"]
