"""Live conversations. A cast character talks with the user turn by turn; Poise evaluates afterwards.

Design rules (from review round 2):
- The character is generated BLIND to whether this is a retry. Its reaction depends only on what was said and how.
- Evaluation separates observable facts -> interpretation -> rating, and cites turns and quotes.
- Retries are experiments: the comparison may be worse, mixed or better, and says so.
"""
from __future__ import annotations

import json
import os
import re
import time
import uuid

import anthropic

from . import rubric
from .audio import VoiceFacts

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
LIVE = json.load(open(os.path.join(ROOT, "content", "live.json")))
CAST = {c["id"]: c for c in LIVE["cast"]}
ROOMS = {r["id"]: r for r in LIVE["rooms"]}

M_CHAR = os.environ.get("AURA_CHAR_MODEL", "claude-haiku-5-5")
M_EVAL = os.environ.get("AURA_EVAL_MODEL", "claude-sonnet-5-5")

BANNED = re.compile(r"\b(alpha|sigma|beta|mog|mogging|rizz|chad|incel|simp|frame)\b", re.I)

# goal-matched first conversations for onboarding
ONBOARDING = {
    "dates": {"character": "mara", "setting": "A first date at a small wine bar. Ten minutes in.", "opener": "Okay, so outside of work or school, what do you actually enjoy?", "goal": "Make one thing sound alive, then turn it back to her."},
    "work": {"character": "julian", "setting": "A job interview. First question.", "opener": "Tell me a little about yourself.", "goal": "Lead with one specific thing, then stop."},
    "rooms": {"character": "dev", "setting": "A house party. You walk up to a group mid-conversation; Dev turns to you.", "opener": "Hey, we were just arguing about the best bad movie. Who are you here with?", "goal": "Join without taking over. One line about you, one question back."},
    "ground": {"character": "dev", "setting": "A friend calls asking a favour you can't do.", "opener": "Hey, any chance you can help me move this Saturday? It's like four hours, tops.", "goal": "Say no once, kindly, without over-explaining. Hold it if he pushes."},
}

SESSIONS: dict[str, dict] = {}
SESSION_TTL = 6 * 3600


def _gc():
    now = time.time()
    for k in [k for k, v in SESSIONS.items() if now - v["created"] > SESSION_TTL]:
        SESSIONS.pop(k, None)


def _client():
    return anthropic.AsyncAnthropic()


async def _json_call(model: str, system: str, user: str, max_tokens: int = 3000, tries: int = 3, check=None) -> dict:
    err = None
    for _ in range(tries):
        msg = user if not err else f"{user}\n\nYour previous output failed a check: {err}. Return only valid JSON."
        r = await _client().messages.create(model=model, max_tokens=max_tokens, system=system, messages=[{"role": "user", "content": msg}])
        raw = "".join(b.text for b in r.content if getattr(b, "type", "") == "text")
        m = re.search(r"\{.*\}", raw, re.S)
        try:
            out = json.loads(m.group(0) if m else raw)
        except Exception:
            err = "invalid JSON"
            continue
        if BANNED.search(json.dumps(out)):
            err = "banned word"
            continue
        if check:
            err = check(out)
            if err:
                continue
        return out
    raise RuntimeError(f"model output failed checks: {err}")


# ---------------------------------------------------------------- sessions

def start(*, room_id: str | None = None, goal: str | None = None, lesson: dict | None = None, pressure: int = 1, max_turns: int | None = None, attempt_of: str | None = None) -> dict:
    """Create a session. Exactly one of room_id / goal (onboarding) / lesson (generated) / attempt_of."""
    _gc()
    if attempt_of:
        prev = SESSIONS.get(attempt_of)
        if not prev:
            raise KeyError("previous session expired")
        spec = dict(prev["spec"])
        pressure = prev["pressure"]
        max_turns = prev["max_turns"]
    elif goal:
        g = ONBOARDING[goal]
        spec = {"character": g["character"], "setting": g["setting"], "opener": g["opener"], "goal": g["goal"], "twist": None, "focus": {"dates": "dates", "work": "work", "rooms": "rooms", "ground": "ground"}.get(goal, "intro")}
    elif room_id:
        r = ROOMS[room_id]
        spec = {"character": r["partner"], "setting": r.get("setting") or r["title"], "opener": r["opener"], "goal": r["goal"], "twist": r.get("twist"), "focus": r.get("focus")}
    elif lesson:
        spec = {k: lesson.get(k) for k in ("character", "setting", "opener", "goal", "twist", "focus")}
    else:
        raise ValueError("need room_id, goal, lesson or attempt_of")
    sid = f"s_{uuid.uuid4().hex[:12]}"
    SESSIONS[sid] = {
        "id": sid,
        "created": time.time(),
        "spec": spec,
        "pressure": max(1, min(3, pressure)),
        "max_turns": max_turns or (2 if goal else 3),
        "attempt_of": attempt_of,
        "turns": [{"role": "char", "text": spec["opener"]}],
    }
    c = CAST[spec["character"]]
    return {"session_id": sid, "character": {"id": c["id"], "name": c["name"], "style": c["style"], "behaviour": c["behaviour"], "voice": c["voice"]}, "setting": spec["setting"], "goal": spec["goal"], "opener": spec["opener"], "max_turns": SESSIONS[sid]["max_turns"], "pressure": SESSIONS[sid]["pressure"]}


def _delivery_plain(f: dict) -> str:
    """Delivery facts in plain words, so the character can react to HOW it was said, not only what."""
    bits = []
    if f.get("filler_count", 0) >= 3:
        bits.append(f"said 'um/like/you know' {f['filler_count']} times")
    if f.get("hedge_count", 0) >= 2:
        bits.append("hedged a lot ('I guess', 'kind of')")
    if f.get("apology_count", 0):
        bits.append("apologised")
    if f.get("duration_s", 0) > 35:
        bits.append("talked for a long time")
    if f.get("ended_mid_sentence") or f.get("trailing_drop"):
        bits.append("trailed off at the end")
    if f.get("first_word_s", 0) > 2.5:
        bits.append("took a while to start")
    if f.get("wpm", 0) > 185:
        bits.append("spoke fast")
    if f.get("repeat_count", 0) + f.get("restart_count", 0) >= 2:
        bits.append("stumbled and restarted a couple of times")
    if f.get("rush_moments"):
        bits.append("sped up partway through")
    if f.get("fade_endings", 0) >= 2:
        bits.append("let the ends of sentences fade out")
    if f.get("flat_stretch_s", 0) >= 6:
        bits.append("sounded flat for a stretch")
    if f.get("presence", {}).get("available"):
        p = f["presence"]
        if p.get("eye_contact_ratio", 1) < 0.4:
            bits.append("mostly looked away")
        elif p.get("look_aways"):
            bits.append(f"looked {p['look_aways'][0]['dir']} at one point")
        if p.get("fidget_events", 0) >= 3:
            bits.append("fidgeted")
    if not bits:
        bits.append("spoke clearly and finished cleanly")
    return "; ".join(bits)


CHAR_SYSTEM = """You are playing {name}, a person in a realistic social scene inside a practice app. Style: {style}. Behaviour: {behaviour}

Scene: {setting}

You have an inner state that moves turn by turn, like a real person's:
- interest (0-100): how much you want to keep talking to him
- trust (0-100): how much you believe and respect what he says
Start of scene: interest {i0}, trust {t0}. Move them honestly based on WHAT he said and HOW (you get plain notes on his delivery). Specific, warm, clean answers raise them; hedging, rambling, apologising, dodging your question or trying too hard lower them. Typical moves are 5-20 points. Never move them because he is trying again; you have no memory of earlier attempts.

How to reply:
- Speak as {name}, out loud, 1-2 short sentences, natural spoken English. No stage directions, emojis or narration.
- Let your state show: low interest = shorter, cooler, glance-away replies; high interest = warmer, follow-up questions.
- Never coach him, never mention practice, apps, scores or AI.
- Pressure {pressure} of 3. At 2: one mild skeptical follow-up. At 3: skeptical and brief; you may use the twist.
- Twist available on your second reply if pressure allows: {twist}
- Never sexual, never cruel, never pressure him. If he is hostile, react like a reasonable person (cool, brief).

Return ONLY JSON: {{"reply": str, "interest": int, "trust": int, "thought": str (your private reaction in <= 14 words, first person, honest, e.g. "He finally said something real. Now I'm curious.")}}"""

START_STATE = {"mara": (60, 55), "theo": (45, 35), "dev": (65, 50), "julian": (40, 45), "ines": (35, 50), "kai": (45, 45)}


async def turn(session_id: str, user_text: str, facts: dict) -> dict:
    s = SESSIONS.get(session_id)
    if not s:
        raise KeyError("session expired")
    s["turns"].append({"role": "user", "text": user_text, "facts": facts})
    n_user = sum(1 for t in s["turns"] if t["role"] == "user")
    done = n_user >= s["max_turns"]
    spec = s["spec"]
    c = CAST[spec["character"]]
    i0, t0 = START_STATE.get(c["id"], (50, 50))
    system = CHAR_SYSTEM.format(name=c["name"], style=c["style"], behaviour=c["behaviour"], setting=spec["setting"], pressure=s["pressure"], twist=spec.get("twist") or "none", i0=i0, t0=t0)
    convo = []
    for t in s["turns"]:
        if t["role"] == "char":
            convo.append({"role": "assistant", "content": json.dumps({"reply": t["text"], "interest": t.get("interest", i0), "trust": t.get("trust", t0), "thought": t.get("thought", "")})})
        else:
            convo.append({"role": "user", "content": f'{t["text"]}\n\n[delivery: {_delivery_plain(t.get("facts", {}))}]'})
    if done:
        convo[-1]["content"] += "\n\n[Last exchange. Reply with one natural sentence that closes or continues the moment.]"
    out = None
    for _ in range(2):
        r = await _client().messages.create(model=M_CHAR, max_tokens=300, system=system, messages=convo)
        raw = "".join(b.text for b in r.content if getattr(b, "type", "") == "text")
        m = re.search(r"\{.*\}", raw, re.S)
        try:
            out = json.loads(m.group(0))
            break
        except Exception:
            out = {"reply": raw.strip().strip('"'), "interest": i0, "trust": t0, "thought": ""}
    clamp = lambda v, d: max(0, min(100, int(v))) if isinstance(v, (int, float)) else d
    reply = re.sub(r"^\*.*?\*\s*", "", str(out.get("reply", "")).strip().strip('"'))
    st = {"interest": clamp(out.get("interest"), i0), "trust": clamp(out.get("trust"), t0), "thought": str(out.get("thought", ""))[:140]}
    s["turns"].append({"role": "char", "text": reply, **st})
    return {"reply": reply, "done": done, "turn": n_user, "voice": c["voice"], **st}


def trace(session_id: str) -> list[dict]:
    s = SESSIONS[session_id]
    c = CAST[s["spec"]["character"]]
    i0, t0 = START_STATE.get(c["id"], (50, 50))
    pts = [{"turn": 0, "interest": i0, "trust": t0, "thought": None}]
    k = 0
    for t in s["turns"][1:]:
        if t["role"] == "char":
            k += 1
            pts.append({"turn": k, "interest": t.get("interest", i0), "trust": t.get("trust", t0), "thought": t.get("thought")})
    return pts


# ---------------------------------------------------------------- evaluation

# What matters most depends on the situation. The evaluator is told which lens applies.
RUBRIC_FOCUS = {
    "intro": "Introduction: clarity, relevance to the listener, and leaving an opening for them to respond.",
    "stories": "Storytelling: a shape (setup, turn, point), expressive delivery, and a point the listener can use.",
    "pushback": "Disagreement: a clear position held without heat, responding to what was actually said, respectful firmness.",
    "dates": "Social conversation: relevant follow-ups, reciprocity, listening, curiosity that isn't an interview.",
    "rooms": "Rooms and hosting: reading the group, inclusion, brevity, steering without dominating.",
    "work": "Interview or professional: specific examples, concise explanation, handling the follow-up without restarting.",
    "ground": "Boundary or favour: one clear sentence, no over-explaining, warmth without apology.",
}

EVAL_SYSTEM = """You are Poise, the coach inside Aura. You evaluate one short practice conversation.

Rules:
- Three layers, always: the observable detail (a quote, a count, a turn), the interpretation (how it likely landed), then the rating. Never present an interpretation as a measurement.
- Two strengths, one change. The change is the single adjustment that would most improve the NEXT attempt. It must cite a quote or a turn.
- Give a 'hint' (a delivery or structure adjustment, no script) and an optional 'example' (one example line in his own content, only as support).
- Social Awareness (0-100): did he answer what was asked, use what the other person said, ask anything back, read the moment? Cite evidence.
- Several styles are valid. Quiet and deliberate can score as high as warm and expressive. Never reward dominance for its own sake.
- Pauses: a deliberate pause before a hard answer is fine. Only flag pauses or fillers if they actually interrupted clarity or flow in context.
- No slang (alpha, sigma, mog, rizz). No exclamation marks. Second person. Plain, precise, a little dry.
- If a previous attempt is provided, write an honest 'compare' line. It may be better, worse or mixed. Never assume the retry improved.
- Archetype: one playful label for THIS answer (not the person), from: The Hedge, The Apologist, The Sprinter, The Statue, The Pleaser, The Blade, The Anchor, The Current, The Storyteller, The Understated. Entertainment, clearly.
- 'What matters most here' names the lens for this situation. Weight your awareness score and your change toward it. A storyteller and an interview candidate are not judged the same way.
- SIGNAL: each turn carries a time-ordered list of measured moments (fillers, hedges, repeats, restarts, rushes, fades, pauses, and when video exists, look-aways with direction). Find the one moment where two channels line up: words × voice, or voice × eyes. Examples: the hedge arrived exactly when the follow-up did; the main sentence faded as he looked down; the pace jumped on the hardest claim. Quote the words at that moment and name the measured thing. If nothing lines up, set signal to null. Never claim to read feelings, honesty or confidence from the face; describe visible behaviour and its likely effect on the listener.
- TURNING POINT: the single exchange where the conversation changed direction, if there is one (a question that opened it, an answer that went vague, a recovery). Name the turn, quote it, say what changed in the other person's inner state. If nothing turned, null. Do not invent drama.
- ALTERNATIVES: two viable ways he could have handled the change moment, in different registers (choose two of: warm and direct, brief and firm, playful and light, calm and explanatory). Each in his own content, one line, so he can pick the one that sounds like him. Neither is 'the' answer.
Return only JSON:
{"archetype": str, "archetype_line": str (<= 10 words),
 "strengths": [{"text": str, "turn": int}, {"text": str, "turn": int}],
 "change": {"text": str, "turn": int, "quote": str},
 "hint": str, "example": str,
 "alternatives": [{"style": str, "line": str}, {"style": str, "line": str}],
 "signal": {"text": str, "turn": int, "quote": str, "measured": str} or null,
 "turning_point": {"turn": int, "quote": str, "what_changed": str} or null,
 "awareness": {"score": int, "evidence": str},
 "compare": str or null,
 "script": str (40-70 words, spoken by Poise, ends with the one change)}"""


def _merge_facts(turns: list[dict]) -> VoiceFacts:
    fs = [t.get("facts") or {} for t in turns if t["role"] == "user"]
    if not fs:
        return VoiceFacts(0, "", 0, 0, 0, 0)
    dur = sum(f.get("duration_s", 0) for f in fs) or 1
    words = sum(f.get("word_count", 0) for f in fs)
    fill = sum(f.get("filler_count", 0) for f in fs)
    return VoiceFacts(
        duration_s=dur,
        transcript=" ".join(t["text"] for t in turns if t["role"] == "user"),
        word_count=words,
        wpm=sum(f.get("wpm", 0) * f.get("duration_s", 0) for f in fs) / dur,
        filler_count=fill,
        filler_per_min=fill / dur * 60,
        hedge_count=sum(f.get("hedge_count", 0) for f in fs),
        apology_count=sum(f.get("apology_count", 0) for f in fs),
        pause_count=sum(f.get("pause_count", 0) for f in fs),
        longest_pause_s=max(f.get("longest_pause_s", 0) for f in fs),
        first_word_s=sum(f.get("first_word_s", 0) for f in fs) / len(fs),
        sentence_count=sum(f.get("sentence_count", 0) for f in fs),
        upward_endings=sum(f.get("upward_endings", 0) for f in fs),
        pitch_median_hz=sum(f.get("pitch_median_hz", 0) for f in fs) / len(fs),
        pitch_variance=sum(f.get("pitch_variance", 0) for f in fs) / len(fs),
        energy_cv=sum(f.get("energy_cv", 0) for f in fs) / len(fs),
        trailing_drop=any(f.get("trailing_drop") for f in fs),
        ended_mid_sentence=bool(fs[-1].get("ended_mid_sentence")),
    )


def _counts(turns: list[dict]) -> dict:
    fs = [t.get("facts") or {} for t in turns if t["role"] == "user"]
    return {
        "fillers": sum(f.get("filler_count", 0) for f in fs),
        "hedges": sum(f.get("hedge_count", 0) for f in fs),
        "apologies": sum(f.get("apology_count", 0) for f in fs),
        "ended_clean": not bool(fs and (fs[-1].get("ended_mid_sentence") or fs[-1].get("trailing_drop"))),
        "talk_s": round(sum(f.get("duration_s", 0) for f in fs), 1),
        "wpm": round(sum(f.get("wpm", 0) for f in fs) / max(1, len(fs))),
    }


async def evaluate(session_id: str) -> dict:
    s = SESSIONS.get(session_id)
    if not s:
        raise KeyError("session expired")
    vf = _merge_facts(s["turns"])
    axes = {"voice": rubric.voice_score(vf), "command": rubric.command_score(vf), "composure": rubric.composure_score(vf)}
    transcript = []
    ui = 0
    for t in s["turns"]:
        if t["role"] == "user":
            ui += 1
            f = t.get("facts") or {}
            mom = "; ".join(f'{m["t"]}s {m["kind"]}: {m["detail"]}' for m in f.get("signal_moments", [])[:14]) or "none"
            tl = " | ".join(f'#{x["i"]} {x["wpm"]}wpm tone{x["tone_st"]:+.0f} loud{x["loud"]:.1f}{" fades" if x["fades"] else ""}{" rises" if x["ends_up"] else ""}' for x in f.get("timeline", [])[:8]) or "n/a"
            pres = ""
            if f.get("presence", {}).get("available"):
                p = f["presence"]
                la = ", ".join(f'{x["t"]}s {x["dir"]} {x["dur"]}s' for x in p.get("look_aways", [])[:6]) or "none"
                pres = f' [eyes: on-lens {p.get("eye_contact_ratio")}, look-aways {la}, end on lens {p.get("end_contact")}, darting {p.get("gaze_shift_rate")}/min, stillness {p.get("stillness_s")}s, fidgets {p.get("fidget_events")}, brow furrow {p.get("brow_furrow_ratio")}]'
            transcript.append(f'TURN {ui} (you): "{t["text"]}"  [voice: wpm {f.get("wpm",0)} (variation {f.get("rate_cv",0)}), fillers {f.get("filler_count",0)}, hedges {f.get("hedge_count",0)}, apologies {f.get("apology_count",0)}, repeats {f.get("repeat_count",0)}, restarts {f.get("restart_count",0)}, pitch range {f.get("pitch_range_st",0)}st, flat stretch {f.get("flat_stretch_s",0)}s, fades {f.get("fade_endings",0)}, first word {f.get("first_word_s",0)}s, ended mid-sentence {f.get("ended_mid_sentence")}] [per sentence: {tl}] [moments: {mom}]{pres}')
        else:
            transcript.append(f'{CAST[s["spec"]["character"]]["name"]}: "{t["text"]}"  [their inner state after this: interest {t.get("interest","?")}, trust {t.get("trust","?")}; private thought: {t.get("thought","")}]')
    prev_block = "none"
    if s.get("attempt_of") and s["attempt_of"] in SESSIONS and SESSIONS[s["attempt_of"]].get("evaluation"):
        p = SESSIONS[s["attempt_of"]]
        prev_block = json.dumps({"counts": _counts(p["turns"]), "change_given": p["evaluation"]["change"]["text"], "user_turns": [t["text"] for t in p["turns"] if t["role"] == "user"]})
    total_words = sum((t.get("facts") or {}).get("word_count", 0) for t in s["turns"] if t["role"] == "user")
    if total_words < 10:
        out = {"insufficient": True, "reason": "Not enough speech to rate fairly. That one doesn't count against you.", "rating": None, "axes": None, "counts": _counts(s["turns"]), "turns": [{"role": t["role"], "text": t["text"]} for t in s["turns"]], "trace": trace(session_id), "character": CAST[s["spec"]["character"]]["name"]}
        s["evaluation"] = out
        return out
    focus = RUBRIC_FOCUS.get(s["spec"].get("focus") or s["spec"].get("unit") or s["spec"].get("goal_key") or "", RUBRIC_FOCUS["intro"])
    user = f"""Scene: {s['spec']['setting']}
Goal: {s['spec']['goal']}
What matters most here: {focus}
Pressure: {s['pressure']}

{chr(10).join(transcript)}

Rubric scores (computed from audio, do not restate as yours): {json.dumps(axes)}
Previous attempt: {prev_block}"""

    def check(o):
        if len(o.get("strengths", [])) != 2:
            return "need exactly two strengths"
        if not o.get("change", {}).get("text"):
            return "missing change"
        if "!" in o.get("script", ""):
            return "exclamation mark"
        if len(o.get("alternatives") or []) != 2:
            return "need exactly two alternatives"
        return None

    out = await _json_call(M_EVAL, EVAL_SYSTEM, user, max_tokens=2500, check=check)
    axes["awareness"] = max(5, min(97, int(out.get("awareness", {}).get("score", 50))))
    rating = round(axes["voice"] * 0.3 + axes["command"] * 0.3 + axes["composure"] * 0.2 + axes["awareness"] * 0.2)
    out.update({"rating": rating, "axes": axes, "counts": _counts(s["turns"]), "turns": [{"role": t["role"], "text": t["text"]} for t in s["turns"]], "trace": trace(session_id), "character": CAST[s["spec"]["character"]]["name"]})
    if s.get("attempt_of") and s["attempt_of"] in SESSIONS and SESSIONS[s["attempt_of"]].get("evaluation"):
        prev = SESSIONS[s["attempt_of"]]["evaluation"]
        out["delta"] = rating - prev["rating"]
        out["prev_counts"] = prev["counts"]
        out["prev_rating"] = prev["rating"]
    s["evaluation"] = out
    return out


# ---------------------------------------------------------------- lessons (generated, never scripted)

LESSON_SYSTEM = """You design one 3-minute practice conversation for Aura. Return only JSON:
{"character": one of mara|theo|dev|julian|ines|kai, "setting": str (one sentence, concrete, everyday, varied), "opener": str (the character's first line, natural, under 20 words), "twist": str or null (a plausible mid-conversation change), "goal": str (the lesson goal restated for this scene, under 14 words), "hint": str (one delivery/structure tip, no script)}
Rules: scenes are realistic for adults 18-30 in cities: work, friends, dates, family, service, travel. Never sexual, never cruel. Vary settings; avoid ones in 'avoid'. Choose the character whose style best tests the goal."""


async def generate_lesson(*, unit: str, objective: str, weak: list[str], avoid: list[str], pressure: int, unit_id: str = "") -> dict:
    user = json.dumps({"unit": unit, "objective": objective, "his recurring weak spots": weak, "avoid settings": avoid, "pressure": pressure})

    def check(o):
        return None if o.get("character") in CAST and o.get("opener") else "bad character or missing opener"

    out = await _json_call(M_EVAL, LESSON_SYSTEM, user, max_tokens=800, check=check)
    out["focus"] = unit_id if unit_id in RUBRIC_FOCUS else "intro"
    return out


# ---------------------------------------------------------------- ledger / receipts

LEDGER_SYSTEM = """You are Poise. The user describes a real moment from his life. Break it into 3-6 beats and say where aura was gained or lost.
Return only JSON:
{"title": str (<= 5 words, e.g. 'Dinner, Friday'),
 "lines": [{"text": str (<= 9 words, what happened, second person implied), "points": int}],
 "total": int,
 "headline": str (one sentence: the real insight, e.g. 'The story wasn't the expensive part. The silence after it was.'),
 "next_time": str (one concrete action),
 "drill": str (a 3-minute practice idea for the app)}
Points are on the playful meme scale: small beats +-10..40, big ones +-80..250. total = sum. Be fair: credit what he did well. Never judge looks, never encourage anything manipulative or disrespectful. No slang (alpha, sigma, mog, rizz). If the story involves harm, distress or danger, set lines to [] and use headline to respond kindly and suggest real support."""


async def ledger(story: str, context: str = "") -> dict:
    def check(o):
        if o.get("lines") and abs(sum(int(l["points"]) for l in o["lines"]) - int(o.get("total", 0))) > 1:
            return "total must equal the sum of points"
        return None

    out = await _json_call(M_EVAL, LEDGER_SYSTEM, f"{context}\nStory: {story}".strip(), max_tokens=1200, check=check)
    out["receipt_no"] = f"{uuid.uuid4().int % 10000:04d}"
    return out
