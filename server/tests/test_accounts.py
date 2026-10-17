import json
import time

import pytest

from pipeline import accounts


def test_guest_token_roundtrip_and_hash_only():
    token, acc = accounts.guest("s_abcdefgh", "1.2.3.4")
    assert token.startswith("kl_") and acc["subject"] == "s_abcdefgh"
    assert accounts.from_token(token)["id"] == acc["id"]
    with accounts.db() as c:
        assert not c.execute("select 1 from tokens where hash=?", (token,)).fetchone()  # never stored in clear
    assert accounts.from_token("kl_" + "x" * 40) is None
    accounts.revoke(token)
    assert accounts.from_token(token) is None


def test_known_subject_cannot_be_claimed_twice():
    _, a = accounts.guest("s_samesubject", "1.1.1.1")
    _, b = accounts.guest("s_samesubject", "2.2.2.2")
    assert a["subject"] == "s_samesubject" and b["subject"] is None
    assert accounts.subject_of(b) == b["id"]


def test_guest_rate_limit_per_network(monkeypatch):
    monkeypatch.setattr(accounts, "GUESTS_PER_IP_DAY", 3)
    for _ in range(3):
        accounts.guest(None, "9.9.9.9")
    with pytest.raises(PermissionError):
        accounts.guest(None, "9.9.9.9")
    accounts.guest(None, "8.8.8.8")  # other networks unaffected


def test_email_code_links_then_switches_on_new_phone(tmp_path):
    with open(accounts.WAITLIST, "w") as f:
        f.write(json.dumps({"number": 41, "email": "ana@example.com"}) + "\n")
    t1, phone1 = accounts.guest(None, "1.1.1.1")
    code = accounts.email_start("Ana@Example.com")["dev_code"]
    tok, acc, switched = accounts.email_verify("ana@example.com", code, phone1)
    assert not switched and acc["id"] == phone1["id"] and acc["email"] == "ana@example.com" and acc["waitlist_no"] == 41
    # second phone, new guest, same email: switches to the saved account
    _, phone2 = accounts.guest(None, "2.2.2.2")
    with accounts.db() as c:
        c.execute("delete from email_codes")
    code2 = accounts.email_start("ana@example.com")["dev_code"]
    tok2, acc2, switched2 = accounts.email_verify("ana@example.com", code2, phone2)
    assert switched2 and acc2["id"] == phone1["id"]
    assert accounts.from_token(tok2)["id"] == phone1["id"]


def test_email_code_wrong_expired_and_tries():
    accounts.email_start("bo@example.com")
    with pytest.raises(ValueError):
        accounts.email_verify("bo@example.com", "000000", None)
    for _ in range(accounts.CODE_TRIES - 1):
        with pytest.raises(ValueError):
            accounts.email_verify("bo@example.com", "000001", None)
    with pytest.raises(PermissionError):
        accounts.email_verify("bo@example.com", "000002", None)
    with pytest.raises(PermissionError):  # resend too soon
        accounts.email_start("bo@example.com")
    with pytest.raises(ValueError):
        accounts.email_start("not-an-email")


def test_code_is_single_use():
    code = accounts.email_start("cy@example.com")["dev_code"]
    accounts.email_verify("cy@example.com", code, None)
    with pytest.raises(ValueError):
        accounts.email_verify("cy@example.com", code, None)


def test_paid_plan_carries_over_when_switching():
    _, saved = accounts.guest(None, "1.1.1.1")
    code = accounts.email_start("di@example.com")["dev_code"]
    accounts.email_verify("di@example.com", code, saved)
    _, guest = accounts.guest(None, "2.2.2.2")
    accounts.set_plan(guest["id"], "black", time.time() + 30 * 86400, "revenuecat")
    guest = accounts.get(guest["id"])
    with accounts.db() as c:
        c.execute("delete from email_codes")
    code = accounts.email_start("di@example.com")["dev_code"]
    _, acc, switched = accounts.email_verify("di@example.com", code, guest)
    assert switched and accounts.plan_of(acc) == "black"


def test_free_calls_then_credits_then_denied(monkeypatch):
    _, acc = accounts.guest(None, "1.1.1.1")
    for _ in range(2):
        a = accounts.live_allowance(acc)
        assert a["charge"] == "call" and a["allow_s"] == accounts.LIMITS["free"]["call_s"]
        accounts.charge_start(acc, a)
    monkeypatch.setattr(accounts, "credits_left", lambda acc: 1)
    a = accounts.live_allowance(acc)
    assert a["charge"] == "credit"
    monkeypatch.setattr(accounts, "credits_left", lambda acc: 0)
    with pytest.raises(accounts.Denied) as e:
        accounts.live_allowance(acc)
    assert e.value.reason == "calls"


def test_call_with_nothing_said_is_given_back():
    _, acc = accounts.guest(None, "1.1.1.1")
    a = accounts.live_allowance(acc)
    accounts.charge_start(acc, a)
    assert accounts.used(acc["id"], "calls") == 1
    accounts.charge_end(acc, a, 12, spoke=False)
    assert accounts.used(acc["id"], "calls") == 0


def test_daily_once_a_day_onboarding_once_ever():
    _, acc = accounts.guest(None, "1.1.1.1")
    a = accounts.live_allowance(acc, daily=True)
    assert a["charge"] == "daily" and a["allow_s"] == accounts.DAILY_QUEST_S
    accounts.charge_start(acc, a)
    assert accounts.live_allowance(acc, daily=True)["charge"] == "call"  # second daily today costs a call
    o = accounts.live_allowance(acc, onboarding=True)
    assert o["charge"] == "onboarding" and o["allow_s"] == accounts.ONBOARDING_S
    accounts.charge_start(acc, o)
    assert accounts.live_allowance(acc, onboarding=True)["charge"] == "call"


def test_paid_minutes_are_capped():
    _, acc = accounts.guest(None, "1.1.1.1")
    accounts.set_plan(acc["id"], "plus", time.time() + 86400, "test")
    acc = accounts.get(acc["id"])
    a = accounts.live_allowance(acc)
    assert a["charge"] == "minutes"
    # a call reserves its whole allowance when it opens; the unused part comes back when it's read
    before = accounts.remaining(acc, "live_s")
    accounts.charge_start(acc, a)
    assert accounts.remaining(acc, "live_s") == before - a["allow_s"]
    accounts.charge_end(acc, a, 100, spoke=True)
    assert accounts.remaining(acc, "live_s") == before - 100
    # spend the week in full calls until it runs out
    while True:
        try:
            a = accounts.live_allowance(acc)
        except accounts.Denied as e:
            assert e.reason == "minutes"
            break
        accounts.charge_start(acc, a)
        accounts.charge_end(acc, a, a["allow_s"] + 500, spoke=True)  # can't be charged past its own allowance
    assert accounts.remaining(acc, "live_s") < 45


def test_feature_tiers():
    _, acc = accounts.guest(None, "1.1.1.1")
    with pytest.raises(accounts.Denied):
        accounts.require_tier(acc, "wardrobe")
    with pytest.raises(accounts.Denied):
        accounts.require_tier(acc, "rehearse")
    accounts.set_plan(acc["id"], "plus", time.time() + 86400, "test")
    acc = accounts.get(acc["id"])
    accounts.require_tier(acc, "rehearse")
    with pytest.raises(accounts.Denied):
        accounts.require_tier(acc, "portrait")


def test_spend_and_refund():
    _, acc = accounts.guest(None, "1.1.1.1")
    for _ in range(accounts.LIMITS["free"]["fits"]):
        accounts.spend(acc, "fits")
    with pytest.raises(accounts.Denied):
        accounts.spend(acc, "fits")
    accounts.refund(acc, "fits")
    accounts.spend(acc, "fits")


def test_expired_plan_falls_back_to_free_after_grace():
    _, acc = accounts.guest(None, "1.1.1.1")
    accounts.set_plan(acc["id"], "plus", time.time() - accounts.GRACE_S - 10, "test")
    assert accounts.plan_of(accounts.get(acc["id"])) == "free"
    accounts.set_plan(acc["id"], "plus", time.time() - 3600, "test")  # inside grace
    assert accounts.plan_of(accounts.get(acc["id"])) == "plus"


def test_revenuecat_events_set_and_expire_plans():
    _, acc = accounts.guest(None, "1.1.1.1")
    exp = (time.time() + 7 * 86400) * 1000
    r = accounts.revenuecat_event({"id": "e1", "type": "INITIAL_PURCHASE", "app_user_id": acc["id"], "entitlement_ids": ["plus"], "expiration_at_ms": exp})
    assert r["accounts"] == 1 and accounts.plan_of(accounts.get(acc["id"])) == "plus"
    assert accounts.revenuecat_event({"id": "e1", "type": "INITIAL_PURCHASE", "app_user_id": acc["id"]}) == {"duplicate": True}
    accounts.revenuecat_event({"id": "e2", "type": "PRODUCT_CHANGE", "app_user_id": acc["id"], "entitlement_ids": ["black", "plus"], "expiration_at_ms": exp})
    assert accounts.plan_of(accounts.get(acc["id"])) == "black"
    accounts.revenuecat_event({"id": "e3", "type": "EXPIRATION", "app_user_id": acc["id"], "expiration_at_ms": (time.time() - accounts.GRACE_S - 5) * 1000})
    assert accounts.plan_of(accounts.get(acc["id"])) == "free"


def test_delete_removes_identity_and_tokens():
    tok, acc = accounts.guest("s_deleteme1", "1.1.1.1")
    code = accounts.email_start("el@example.com")["dev_code"]
    tok, acc, _ = accounts.email_verify("el@example.com", code, acc)
    accounts.delete(acc)
    assert accounts.from_token(tok) is None and accounts.get(acc["id"]) is None
    _, again = accounts.guest("s_deleteme1", "1.1.1.1")  # the install id is free again
    assert again["subject"] == "s_deleteme1" and again["id"] != acc["id"]


def test_status_shape():
    _, acc = accounts.guest(None, "1.1.1.1")
    st = accounts.status(acc)
    for k in ("plan", "left", "credits", "saved", "daily_done", "week"):
        assert k in st
    assert st["plan"] == "free" and st["left"]["calls"] == 2 and not st["saved"]
