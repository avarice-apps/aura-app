"""The Poise engine: content integrity, retrieval, the blind assessor, tone rendering, retries and the director."""
import asyncio
import json
import os
import re
import time

import pytest

from pipeline import converse, guidance

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ---------------------------------------------------------------- content

def test_every_scene_is_playable_and_linked():
    qs = json.load(open(os.path.join(ROOT, "content", "quests.json")))["quests"]
    ids = [q["id"] for q in qs]
    assert len(ids) == len(set(ids)) and len(qs) >= 60
    for q in qs:
        assert q["partner"] in converse.CAST, q["id"]
        assert q["category"] in {"dating", "night", "approach", "friends", "work", "money", "conflict", "service", "status"}, q["id"]
        assert q["focus"] in converse.RUBRIC_FOCUS, q["id"]
        assert q["opener"].strip() and q["setting"].strip() and q["goal"].strip()
        for c in q.get("cards", []):
            assert c in guidance.CARDS, (q["id"], c)
    # the original ids survive
    for keep in ("q-bar-fade", "q-split-bill", "q-ex-at-party", "q-morning-after", "q-barber"):
        assert keep in ids


def test_no_evaluation_fixture_in_runtime_guidance():
    pack = open(os.path.join(ROOT, "content", "guidance.json")).read()
    fixture_dir = os.path.join(ROOT, "reference", "poise-handoff", "evaluation")
    for name in ("development.jsonl", "validation.jsonl", "reserved.jsonl"):
        for line in open(os.path.join(fixture_dir, name)):
            case = json.loads(line)
            assert case["id"] not in pack
    assert "expected" not in json.loads(pack)["cards"][0]


def test_dailies_have_no_diagnosis_labels():
    txt = open(os.path.join(ROOT, "content", "dailies.json")).read().lower()
    for w in ("schizo", "psychotic", "autistic", "bipolar"):
        assert w not in txt


# ---------------------------------------------------------------- retrieval

def test_scene_cards_come_first_then_house_cards():
    cards = guidance.retrieve(scene="h-s13", mode="scene", text="they took my idea in the meeting")
    assert cards[0]["id"] == "K13" and len(cards) <= 3
    looks = guidance.retrieve(mode="scene", text="he said I got mogged and my jawline is recessed")
    assert "H08" in [c["id"] for c in looks]
    assert "H06" in [c["id"] for c in guidance.retrieve(mode="ledger", text="", tone="unfiltered")]
    assert guidance.ids(cards)["version"] == guidance.VERSION


# ---------------------------------------------------------------- who you play

def test_romance_follows_dating_preference_only_in_dating_scenes():
    u_men = converse.clean_user({"dates": "men"})
    u_women = converse.clean_user({"dates": "women"})
    assert converse.romance_partner("ines", "dating", u_men) in ("theo", "kai")
    assert converse.romance_partner("ines", "work", u_men) == "ines"
    assert converse.romance_partner("theo", "dating", u_women) == "ines"
    assert converse.romance_partner("ines", "dating", converse.clean_user({})) == "ines"
    s = converse.start(room_id="q-bar-fade", user={"dates": "men"}, tone="real")
    assert converse.CAST_GENDER[converse.SESSIONS[s["session_id"]]["spec"]["character"]] == "m"


def test_player_line_and_injection_safety():
    u = converse.clean_user({"pronoun": "she", "name": "Ana<script>", "dates": "nope"})
    assert u == {"pronoun": "she", "dates": None, "name": "Anascript"}
    assert "a woman" in converse.player_line(u) and "she/her" in converse.player_line(u)
    assert "they/them" in converse.player_line(converse.clean_user(None))


def test_named_strangers_are_masked_personas():
    s = converse.start(room_id="h-s04", tone="real")
    assert s["character"]["name"] == "Sahar" and s["masked"]


# ---------------------------------------------------------------- retry this moment

def _played_session():
    s = converse.start(room_id="q-split-bill", tone="real")
    sid = s["session_id"]
    ses = converse.SESSIONS[sid]
    ses["turns"] += [
        {"role": "user", "text": "Yeah sure, whatever works.", "facts": converse.text_facts("Yeah sure, whatever works.")},
        {"role": "char", "text": "Great, ninety each then.", "interest": 40, "trust": 30, "thought": "Pushover. Easy.", "beat_after": 0},
        {"role": "user", "text": "Actually I only had a salad, can I just pay mine?", "facts": converse.text_facts("x")},
        {"role": "char", "text": "Don't be that guy.", "interest": 20, "trust": 25, "thought": "SECRET_LATER_THOUGHT", "leaving": True, "beat_after": 1},
    ]
    ses["evaluation"] = {"rating": 40, "counts": converse._counts(ses["turns"]), "change": {"text": "Say your number first."}}
    return sid


def test_resume_restores_the_instant_before_the_moment_and_nothing_after():
    sid = _played_session()
    r = converse.start(resume={"session": sid, "turn": 2})
    new = converse.SESSIONS[r["session_id"]]
    texts = [t["text"] for t in new["turns"]]
    assert texts[-1] == "Great, ninety each then." and r["opener"] == "Great, ninety each then."
    assert "Don't be that guy." not in texts and not any("SECRET_LATER_THOUGHT" in json.dumps(t) for t in new["turns"])
    assert all(t.get("context") for t in new["turns"])
    assert new["moment_of"]["turn"] == 2 and "salad" in new["moment_of"]["said"]
    assert r["resumed"]
    with pytest.raises(ValueError):
        converse.start(resume={"session": sid, "turn": 9})


# ---------------------------------------------------------------- the assessor is blind to private state

def test_assessor_payload_has_no_private_state():
    sid = _played_session()
    lines, judged = converse.assessor_payload(converse.SESSIONS[sid])
    blob = "\n".join(lines)
    assert "Pushover" not in blob and "SECRET_LATER_THOUGHT" not in blob
    assert "interest" not in blob.lower() and "trust" not in blob.lower() and "LEAVES" not in blob
    assert judged == 2 and 'Dev: "Don\'t be that guy."' in blob


def _fake_eval(score=55, aw=60):
    return {
        "effort": "real", "landed": {"score": score, "evidence": "e"}, "awareness": {"score": aw, "status": "assessed", "evidence": "e"},
        "evidence": [{"turn": 1, "quote": "Yeah sure", "observation": "agreed fast"}], "uncertainties": [], "archetype": "The Pleaser",
        "strengths": [], "change": {"text": "Name your share first.", "turn": 1, "quote": "Yeah sure"}, "hint": "h", "example": "x",
        "alternatives": [{"style": "a", "line": "1"}, {"style": "b", "line": "2"}], "signal": None, "turning_point": None, "compare": None, "memory": "m",
        "straight": {"verdict": "You agreed before you knew the number.", "archetype_line": "Easy yes.", "script": "You said yes first and asked later. Say your share before anyone sets a price."},
        "unfiltered": {"verdict": "You signed the bill before reading it.", "archetype_line": "Yes-man, ninety dollars.", "script": "You paid ninety dollars for a salad because saying a number felt rude. Fucking say the number."},
    }


def _run_eval(monkeypatch, tone, fake=None):
    async def fake_call(model, system, user, **kw):
        _run_eval.last_user = user
        out = fake or _fake_eval()
        err = kw.get("check")(json.loads(json.dumps(out))) if kw.get("check") else None
        assert err is None, err
        return json.loads(json.dumps(out))
    monkeypatch.setattr(converse, "_json_call", fake_call)
    sid = _played_session()
    converse.SESSIONS[sid]["tone"] = tone
    return asyncio.run(converse.evaluate(sid))


def test_tone_changes_words_not_findings(monkeypatch):
    a = _run_eval(monkeypatch, "real")
    b = _run_eval(monkeypatch, "unfiltered")
    for k in ("rating", "axes", "axes_status", "change", "evidence", "strengths", "alternatives", "effort"):
        assert a[k] == b[k], k
    assert a["script"] != b["script"] and "Fucking" in b["script"] and "Fucking" not in a["script"]
    assert a["voices"] == b["voices"]


def test_private_reaction_never_caps_the_score(monkeypatch):
    out = _run_eval(monkeypatch, "real", _fake_eval(score=80, aw=80))
    # the character "left" with interest 20, which used to cap the rating at 45
    assert out["rating"] > 45


def test_no_audio_means_not_measured_not_neutral(monkeypatch):
    out = _run_eval(monkeypatch, "real")
    assert out["axes"]["voice"] is None and out["axes_status"]["voice"] == "not_measured"
    assert out["axes"]["command"] is not None and out["rubric_version"] == converse.RUBRIC_VERSION
    assert out["guidance"]["cards"], "scene cards were retrieved"


def test_straight_voice_may_not_swear(monkeypatch):
    """A straight voice that swears is rewritten on its own by the fast model; the findings stay as they were."""
    bad = _fake_eval()
    bad["straight"]["script"] = "That was shit, honestly. Next time, say the number first and stop."
    calls = []

    async def fake_call(model, system, user, **kw):
        calls.append(model)
        if model == converse.M_EVAL:
            return json.loads(json.dumps(bad))
        fixed = {"verdict": "It went badly.", "archetype_line": "The Hedge", "script": "That went badly. Next time, say the number first and stop there. One sentence, no question tag, and let them answer."}
        assert kw["check"](fixed) is None and kw["check"]({"verdict": "x", "script": "shit"}) is not None
        return fixed
    monkeypatch.setattr(converse, "_json_call", fake_call)
    out = asyncio.run(converse.evaluate(_played_session()))
    assert calls[:2] == [converse.M_EVAL, converse.M_CHAR]  # the quick read, one voice rewrite; then only the detail
    assert calls.count(converse.M_EVAL) == 2
    assert "shit" not in out["voices"]["straight"]["script"] and out["change"] == bad["change"]


def test_resumed_read_judges_only_the_new_turns(monkeypatch):
    sid = _played_session()
    r = converse.start(resume={"session": sid, "turn": 2})
    new = converse.SESSIONS[r["session_id"]]
    new["turns"] += [{"role": "user", "text": "I had the salad, so I'll put in twenty-five with tip.", "facts": converse.text_facts("I had the salad, so I'll put in twenty-five with tip.")},
                     {"role": "char", "text": "Fair enough.", "interest": 50, "trust": 60, "thought": "ok"}]
    seen = {}
    async def fake_call(model, system, user, **kw):
        seen["user"] = user
        return _fake_eval()
    monkeypatch.setattr(converse, "_json_call", fake_call)
    out = asyncio.run(converse.evaluate(r["session_id"]))
    assert "EARLIER, context only" in seen["user"] and "retried_moment" in seen["user"]
    assert out["moment"]["turn"] == 2 and out["delta"] == out["rating"] - 40


# ---------------------------------------------------------------- the director

def test_beats_arrive_when_due_and_are_forced_only_when_overdue():
    s = converse.start(room_id="q-split-bill", tone="real", pressure=2)
    ses = converse.SESSIONS[s["session_id"]]
    txt, i, forced = converse._beat_block(ses, 1)
    assert "later" in txt and not forced
    txt, i, forced = converse._beat_block(ses, 2)
    assert "only if the conversation naturally reaches it" in txt and not forced
    txt, i, forced = converse._beat_block(ses, 4)
    assert forced and "WHAT HAPPENS NOW" in txt


def test_call_allowance_wraps_the_scene_up():
    s = converse.start(room_id="q-split-bill", tone="real", allow_s=120)
    ses = converse.SESSIONS[s["session_id"]]
    ses["created"] = time.time() - 110
    system, _, _ = converse._live_system(ses, 2, converse.TONE_CHAR["real"])
    assert "wrap up" in system.lower()

    ses["created"] = time.time() - 200
    async def collect():
        return [p async for p in converse.stream_turn(s["session_id"], "So anyway")]
    out = asyncio.run(collect())
    assert out and ses["done"]


def test_scene_direction_reaches_the_character():
    s = converse.start(room_id="h-s13", tone="real")
    ses = converse.SESSIONS[s["session_id"]]
    system, _, _ = converse._live_system(ses, 1, converse.TONE_CHAR["real"])
    assert "Restore attribution" in system and "If they fumble" in system


def test_prompts_dont_assume_the_player_is_a_man():
    for name in ("LIVE_SYSTEM", "CHAR_SYSTEM", "EVAL_SYSTEM", "POISE_LIVE_SYSTEM", "LEDGER_SYSTEM", "PORTRAIT_SYSTEM"):
        txt = getattr(converse, name)
        assert not re.search(r"\b(him|his)\b", txt), name


def test_quick_read_comes_first_and_detail_follows(monkeypatch):
    calls = []

    async def fake_call(model, system, user, **kw):
        calls.append(system)
        if system == converse.EVAL_DETAIL:
            assert "FINDINGS (fixed)" in user
            await asyncio.sleep(0.05)
            return {"evidence": [{"turn": 1, "quote": "split", "observation": "x"}], "uncertainties": [], "alternatives": [{"style": "a", "line": "One."}, {"style": "b", "line": "Two."}], "signal": None, "turning_point": None, "compare": None}
        return _fake_eval()
    monkeypatch.setattr(converse, "_json_call", fake_call)
    sid = _played_session()

    async def go():
        quick = await converse.evaluate(sid, detail=False)
        assert quick["detail_pending"] is True and quick["alternatives"] == [] and quick["rating"] is not None
        full = await converse.full_read(sid)
        assert full["detail_pending"] is False and len(full["alternatives"]) == 2 and full["rating"] == quick["rating"]
    asyncio.run(go())
    assert calls[0] == converse.EVAL_QUICK
