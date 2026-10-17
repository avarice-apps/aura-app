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
