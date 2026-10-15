"""Live conversations. A cast character talks with the user turn by turn; Poise evaluates afterwards.

Design rules (from review round 2):
- The character is generated BLIND to whether this is a retry. Its reaction depends only on what was said and how.
- Evaluation separates observable facts -> interpretation -> rating, and cites turns and quotes.
- Retries are experiments: the comparison may be worse, mixed or better, and says so.
"""
from __future__ import annotations

import asyncio
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
try:
    with open(os.path.join(os.path.dirname(__file__), "..", "..", "content", "quests.json")) as _f:
        QUESTS = {q["id"]: q for q in json.load(_f)["quests"]}
except FileNotFoundError:
    QUESTS = {}
ROOMS.update(QUESTS)
with open(os.path.join(ROOT, "content", "floors.json")) as _f:
    _FL = json.load(_f)
EXTRAS = {e["label"]: e for e in _FL["extras"]}
FLOORS = {f["id"]: f for f in _FL["floors"]}
FLOOR_FOCUS = {"dating": "dates", "approach": "rooms", "status": "rooms", "work": "work", "money": "ground", "conflict": "pushback", "friends": "rooms"}

with open(os.path.join(ROOT, "content", "dailies.json")) as _f:
    DAILIES = {d["id"]: d for d in json.load(_f)["dailies"]}


def char_of(spec: dict) -> dict:
    """The main character of a scene: a cast member, or a one-off persona (Daily Side Quests)."""
    if spec.get("persona"):
        p = spec["persona"]
        return {"id": "persona", "name": p["name"], "style": p["style"], "behaviour": p["behaviour"], "voice": p["voice"], "start": p.get("start")}
    return CAST[spec["character"]]


def start_state(c: dict) -> tuple[int, int]:
    if c.get("start"):
        return tuple(c["start"])  # type: ignore[return-value]
    return START_STATE.get(c["id"], (50, 50))


# When a scene has no written beats, it still escalates: these are used after the scene's own twist.
GENERIC_BEATS = [
    "Push on the vaguest thing he just said: ask what he means, specifically, using his exact words.",
    "Someone else from the list walks up and joins in, with a reason that fits the setting. They react to him fresh.",
    "Ask the slightly uncomfortable question this situation naturally produces, the one people usually avoid.",
    "Test him: a light challenge, tease or disagreement, to see if he holds his ground without getting defensive.",
    "A practical interruption: a phone, a server, someone needing to leave. See whether he can pick the thread back up.",
    "Bring it to a decision point: a yes or no, a next step, or an exit, and see how he handles it.",
]

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


async def _json_call(model: str, system: str, user, max_tokens: int = 3000, tries: int = 3, check=None, allow_slang: bool = False) -> dict:
    """`user` is a string, or a list of content blocks (text and images) for vision calls."""
    err = None
    for _ in range(tries):
        fix = f"Your previous output failed a check: {err}. Return only valid JSON."
        if isinstance(user, list):
            msg = user if not err else user + [{"type": "text", "text": fix}]
        else:
            msg = user if not err else f"{user}\n\n{fix}"
        # Thinking is allowed for evaluation-quality calls; leave headroom so the JSON answer always fits.
        r = await _client().messages.create(model=model, max_tokens=max_tokens + 6000, system=system, messages=[{"role": "user", "content": msg}])
        raw = "".join(b.text for b in r.content if getattr(b, "type", "") == "text")
        m = re.search(r"\{.*\}", raw, re.S)
        try:
            out = json.loads(m.group(0) if m else raw)
        except Exception:
            err = "invalid JSON"
            continue
        if not allow_slang and BANNED.search(json.dumps(out)):
            err = "banned word"
            continue
        if check:
            err = check(out)
            if err:
                continue
        return out
    raise RuntimeError(f"model output failed checks: {err}")


# ---------------------------------------------------------------- sessions

def start(*, room_id: str | None = None, goal: str | None = None, lesson: dict | None = None, floor_id: str | None = None, daily_id: str | None = None, pressure: int = 1, max_turns: int | None = None, attempt_of: str | None = None, tone: str = "real", live: bool = False) -> dict:
    """Create a session. Exactly one of room_id / goal (onboarding) / lesson (generated) / floor_id (open floor) / attempt_of."""
    _gc()
    if daily_id:
        d = DAILIES[daily_id]
        spec = {"character": None, "persona": d["persona"], "setting": d["setting"], "opener": d["opener"], "goal": "Handle whatever this turns into.", "twist": None, "focus": FLOOR_FOCUS.get(d.get("category", ""), "rooms"), "roles": d.get("roles", {}), "beats": list(d["beats"]), "daily": daily_id, "title": d["title"]}
    elif floor_id:
        f = FLOORS[floor_id]
        spec = {"character": f["primary"], "setting": f["setting"], "opener": f["opener"], "goal": "Hold your own as it escalates. End it when you want your read.", "twist": None, "focus": FLOOR_FOCUS.get(f.get("category", ""), "rooms"), "roles": f.get("roles", {}), "beats": list(f["beats"]), "floor": floor_id, "title": f["title"]}
    elif attempt_of:
        prev = SESSIONS.get(attempt_of)
        if not prev:
            raise KeyError("previous session expired")
        spec = dict(prev["spec"])
        pressure = prev["pressure"]
        max_turns = prev["max_turns"]
        tone = prev.get("tone", tone)
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
        "tone": "unfiltered" if tone == "unfiltered" else "real",
        "turns": [{"role": "char", "text": spec["opener"]}],
        "live": bool(live or floor_id or daily_id),
        "beat": 0,
    }
    if not spec.get("beats"):
        spec["beats"] = ([spec["twist"]] if spec.get("twist") else []) + GENERIC_BEATS
    c = char_of(spec)
    return {"session_id": sid, "character": {"id": c["id"], "name": c["name"], "style": c["style"], "behaviour": c["behaviour"], "voice": c["voice"]}, "setting": spec["setting"], "goal": spec["goal"], "opener": spec["opener"], "max_turns": SESSIONS[sid]["max_turns"], "pressure": SESSIONS[sid]["pressure"], "speakers": _speaker_list(spec)}


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

{tone}

Return ONLY JSON: {{"reply": str, "interest": int, "trust": int, "thought": str (your private reaction in <= 14 words, first person, honest, e.g. "He finally said something real. Now I'm curious.")}}"""

TONE_CHAR = {
    "real": "Tone: everyday and realistic. Mild language only.",
    "unfiltered": (
        "Tone: UNFILTERED. Everyone here is an adult (18+). Talk like a real person in their twenties off the clock: "
        "swear naturally when it fits, banter, tease, roast him if he earns it, be blunt and funny, use current slang if it's natural for you. "
        "You can talk frankly about dating, hookups and sex the way friends do over drinks. Keep it conversational: never describe sex acts, never role-play anything sexual. "
        "If he gets creepy, pushes after a no, or is disrespectful, react like a real person would: shut it down, get cold, or walk off. "
        "No slurs, nothing demeaning about anyone's identity."
    ),
}

def _parse_char(raw: str, i0: int, t0: int) -> dict:
    """Robust parse of the character's JSON. Never lets raw JSON or an empty line reach the user."""
    txt = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.M).strip()
    m = re.search(r"\{.*\}", txt, re.S)
    if m:
        try:
            o = json.loads(m.group(0))
            if isinstance(o, dict) and str(o.get("reply", "")).strip():
                return o
        except Exception:
            pass
    rm = re.search(r'"reply"\s*:\s*"((?:[^"\\]|\\.)*)"', txt)
    if rm:
        num = lambda k, d: int(n.group(1)) if (n := re.search(rf'"{k}"\s*:\s*(\d+)', txt)) else d
        th = re.search(r'"thought"\s*:\s*"((?:[^"\\]|\\.)*)"', txt)
        return {"reply": json.loads(f'"{rm.group(1)}"'), "interest": num("interest", i0), "trust": num("trust", t0), "thought": json.loads(f'"{th.group(1)}"') if th else ""}
    if txt and not txt.startswith("{"):
        return {"reply": txt.strip('"'), "interest": i0, "trust": t0, "thought": ""}
    return {}


START_STATE = {"mara": (60, 55), "theo": (45, 35), "dev": (65, 50), "julian": (40, 45), "ines": (35, 50), "kai": (45, 45)}


async def turn(session_id: str, user_text: str, facts: dict) -> dict:
    s = SESSIONS.get(session_id)
    if not s:
        raise KeyError("session expired")
    s["turns"].append({"role": "user", "text": user_text, "facts": facts})
    n_user = sum(1 for t in s["turns"] if t["role"] == "user")
    done = n_user >= s["max_turns"]
    spec = s["spec"]
    c = char_of(spec)
    i0, t0 = start_state(c)
    system = CHAR_SYSTEM.format(name=c["name"], style=c["style"], behaviour=c["behaviour"], setting=spec["setting"], pressure=s["pressure"], twist=spec.get("twist") or "none", i0=i0, t0=t0, tone=TONE_CHAR.get(s.get("tone", "real"), TONE_CHAR["real"]))
    convo = [{"role": "user", "content": "[The scene begins.]"}]
    for t in s["turns"]:
        if t["role"] == "char":
            convo.append({"role": "assistant", "content": json.dumps({"reply": t["text"], "interest": t.get("interest", i0), "trust": t.get("trust", t0), "thought": t.get("thought", "")})})
        else:
            cut = "\n[You cut him off mid-sentence because he was going on too long. Start your reply by interrupting naturally.]" if (t.get("facts") or {}).get("interrupted") else ""
            convo.append({"role": "user", "content": f'{t["text"]}\n\n[delivery: {_delivery_plain(t.get("facts", {}))}]{cut}'})
    if done:
        convo[-1]["content"] += "\n\n[Last exchange. Reply with one natural sentence that closes or continues the moment.]"
    out = None
    for attempt in range(3):
        # If the model declines (empty reply), the last attempt falls back to the everyday tone.
        sys_ = system if attempt < 2 else system.replace(TONE_CHAR.get(s.get("tone", "real"), ""), TONE_CHAR["real"])
        r = await _client().messages.create(model=M_CHAR, max_tokens=300, system=sys_, messages=convo, thinking={"type": "disabled"})
        raw = "".join(b.text for b in r.content if getattr(b, "type", "") == "text").strip()
        out = _parse_char(raw, i0, t0)
        if out.get("reply"):
            break
    if not out or not out.get("reply"):
        out = {"reply": "Hm. Go on.", "interest": i0, "trust": t0, "thought": ""}
    clamp = lambda v, d: max(0, min(100, int(v))) if isinstance(v, (int, float)) else d
    reply = re.sub(r"^\*.*?\*\s*", "", str(out.get("reply", "")).strip().strip('"'))
    st = {"interest": clamp(out.get("interest"), i0), "trust": clamp(out.get("trust"), t0), "thought": str(out.get("thought", ""))[:140]}
    s["turns"].append({"role": "char", "text": reply, **st})
    return {"reply": reply, "done": done, "turn": n_user, "voice": c["voice"], **st}


LIVE_SYSTEM = """You are running a live, spoken social scene. You play {name}: {style}. {behaviour}
He is talking to you out loud, in real time, and hears everything you write as speech. He is his own person in the scene, not {name} and not any of the others; you don't know his name unless he has said it.

Scene: {setting}

Who can speak (nobody else):
- {name}: you. Your lines are untagged.
{others}
To make someone else speak, wrap only their words in their tag, like <Sasha>Wait, who is this?</Sasha>. At most two speakers per reply, and usually it is just you. You ({name}) normally speak in every reply; others only chime in when it's natural. Never tag {name}, and never address yourself by name. Someone not yet in the scene only speaks once the scene brings them in.

Your inner state as {name}: interest and trust, 0-100, starting at {i0} and {t0}. Move them honestly on WHAT he said and HOW he said it (you get plain notes on his delivery). Specific, warm, clean answers raise them. Hedging, rambling, apologising, dodging the question, trying too hard, generic answers and rudeness lower them. Typical moves are 5-20 points. Do not reward him for simply showing up.

How to talk:
- Like a real person out loud, never like an assistant. Short: one or two sentences, 30 words maximum across everyone who speaks. Real people don't monologue. Contractions, fragments, the odd "wait", "okay but", "I mean". No lists, no speeches, no therapy language.
- React to his exact words. Pick up the specific thing he said, poke at it, quote it back, ask about it. If his answer was vague, call it out the way a person would.
- Get more specific and more personal as it goes. Remember earlier details and bring them back. Never fall back to generic small talk.
- Let your state show: low interest means short, flat, distracted replies or looking for an exit; high interest means warmer, teasing, curious.
- Voice cues are allowed but rare, roughly one reply in four, never as the first word: [laughs], [sighs], [whispers], [excited]. Never write actions in asterisks, never describe what anyone is doing, never narrate ("she turns toward the door"). Only words people say out loud.
- If he says nothing, or something that makes no sense, react like a real person: an awkward beat, "...hello?", confusion, or moving on without him.
- If he is rude, creepy or clearly messing about, people react the way they would in real life: cold, short, annoyed, or they leave.
- Never coach him. Never mention practice, apps, AI or scores.
- Pressure {pressure} of 3: 1 is forgiving, 2 is realistic, 3 is hard: impatient, skeptical, quick to lose interest.
{tone}

{beat}

The scene is open-ended: keep it going. Only end it if staying would be unrealistic (your interest has collapsed, or the moment has clearly ended). Then say a real exit line and set "leaving" to true.

Format: only the spoken words (with tags for other speakers), then a new line with ### and the JSON:
<spoken words>
###{{"interest": int, "trust": int, "thought": str (14 words max, private, first person, honest), "leaving": bool}}"""

STAGE = re.compile(r"\*[^*]*\*?")  # *stage directions*, removed even mid-stream (prefix-stable)
SPEAKER_TAG = re.compile(r"<([A-Z][a-zA-Z]+)>(.*?)</\1>", re.S)
AUDIO_TAG = re.compile(r"\[(?:laughs|laughing|sighs|whispers|excited|slow|chuckles|pause|scoffs|gasps)[^\]]*\]\s*", re.I)


def _speaker_list(spec: dict) -> list[dict]:
    c = char_of(spec)
    out = [{"name": c["name"], "role": "primary"}]
    for label, role in (spec.get("roles") or {}).items():
        out.append({"name": label, "role": role})
    return out


def readable(text: str, primary: str) -> list[tuple[str, str]]:
    """Split a spoken reply with <Name>...</Name> tags into (speaker, words) parts, with voice cues removed."""
    parts, pos = [], 0
    for m in SPEAKER_TAG.finditer(text):
        before = AUDIO_TAG.sub("", text[pos : m.start()]).strip()
        if before:
            parts.append((primary, before))
        words = AUDIO_TAG.sub("", m.group(2)).strip()
        if words:
            parts.append((m.group(1), words))
        pos = m.end()
    rest = AUDIO_TAG.sub("", text[pos:]).strip()
    rest = re.sub(r"</?[A-Za-z]+>", "", rest).strip()
    if rest:
        parts.append((primary, rest))
    return parts


def _beat_block(s: dict, n_user: int) -> tuple[str, int]:
    """The beat instruction for this reply, and the beat index to store if the reply completes."""
    beats = s["spec"].get("beats") or []
    first, gap = (1, 2) if s["pressure"] >= 3 else (2, 2)
    i = s.get("beat", 0)
    if i < len(beats) and n_user >= first + gap * i:
        return f"WHAT HAPPENS NOW (work it into this reply, through dialogue only, reacting to what he just said first): {beats[i]}", i + 1
    if i < len(beats):
        return f"Coming up soon (do not force it yet): {beats[i]}", i
    return "The written beats are used up. Keep escalating the way real life would: harder questions, someone else's reaction, a decision point.", i


FILLER_RE = re.compile(r"\b(um+|uh+|er+|ah+|like|you know|sort of|kind of|i mean|basically|literally|actually)\b", re.I)
HEDGE_RE = re.compile(r"\b(i guess|i think|maybe|sort of|kind of|probably|i suppose|or something|or whatever|if that makes sense)\b", re.I)
APOLOGY_RE = re.compile(r"\b(sorry|apologies|my bad)\b", re.I)


def text_facts(text: str) -> dict:
    """Word-level facts from a live transcript. Acoustic facts are added after the call from the recording."""
    return {
        "word_count": len(text.split()),
        "filler_count": len(FILLER_RE.findall(text)),
        "hedge_count": len(HEDGE_RE.findall(text)),
        "apology_count": len(APOLOGY_RE.findall(text)),
        "ended_mid_sentence": bool(text.strip()) and not text.strip().endswith((".", "!", "?")),
        "silent": not text.strip(),
    }


def _live_system(s: dict, n_user: int, tone_txt: str) -> tuple[str, int]:
    spec = s["spec"]
    c = char_of(spec)
    i0, t0 = start_state(c)
    roles = spec.get("roles") or {}
    if roles:
        cast_by_name = {x["name"]: x for x in CAST.values()}
        def sketch(k):
            return EXTRAS[k]["sketch"] if k in EXTRAS else cast_by_name[k]["style"] if k in cast_by_name else ""
        others = "\n".join(f"- {k}: {v}. ({sketch(k)})" for k, v in roles.items() if k in EXTRAS or k in cast_by_name)
    else:
        others = "\n".join(f"- {k}: {e['sketch']}. Only if the scene calls for someone else; give them a role that fits the setting." for k, e in EXTRAS.items())
    beat, nxt = _beat_block(s, n_user)
    if n_user >= 40:
        beat = "The scene has run long. Bring it to a natural close in this reply and set leaving to true."
    return LIVE_SYSTEM.format(name=c["name"], style=c["style"], behaviour=c["behaviour"], setting=spec["setting"], others=others, i0=i0, t0=t0, pressure=s["pressure"], tone=tone_txt, beat=beat), nxt


async def stream_turn(session_id: str, user_text: str):
    """Live mode: yield the spoken words as they are generated; store inner state when done."""
    s = SESSIONS.get(session_id)
    if not s:
        raise KeyError("session expired")
    if s.get("closed") or s.get("done"):
        return  # hung up, or they already walked off
    # Nothing is committed until the reply finishes: if ElevenLabs cancels this request because he kept
    # talking, the session is left exactly as it was and the retry starts clean.
    user_turn = {"role": "user", "text": user_text, "facts": text_facts(user_text)}
    turns = s["turns"] + [user_turn]
    n_user = sum(1 for t in turns if t["role"] == "user")
    spec = s["spec"]
    c = char_of(spec)
    i0, t0 = start_state(c)
    tone_txt = TONE_CHAR.get(s.get("tone", "real"), TONE_CHAR["real"])
    beat0 = s.get("beat", 0)
    base, beat1 = _live_system(s, n_user, tone_txt)
    convo = [{"role": "user", "content": "[The scene begins.]"}]
    for t in turns:
        if t["role"] == "char":
            convo.append({"role": "assistant", "content": f'{t["text"]}\n###{json.dumps({"interest": t.get("interest", i0), "trust": t.get("trust", t0), "thought": t.get("thought", ""), "leaving": False})}'})
        elif not t["text"].strip():
            convo.append({"role": "user", "content": "[He says nothing. Several seconds of silence.]"})
        else:
            convo.append({"role": "user", "content": f'{t["text"]}\n\n[delivery: {_delivery_plain(t.get("facts", {}))}]'})
    convo[-1]["content"] += "\n[Reply out loud, under 30 words in total.]"

    spoken, tail = "", ""
    for attempt in range(2):
        system = base if attempt == 0 else base.replace(tone_txt, TONE_CHAR["real"])
        buf = ""
        emitted = 0
        async with _client().messages.stream(model=M_CHAR, max_tokens=320, system=system, messages=convo, thinking={"type": "disabled"}) as st:
            async for delta in st.text_stream:
                buf += delta
                cut = buf.find("###")
                if cut >= 0:
                    out = buf[:cut]
                else:
                    keep = len(buf) - len(buf.rstrip("#"))
                    out = buf[: len(buf) - keep]
                out = STAGE.sub("", out)
                new = out[emitted:]
                if new:
                    emitted += len(new)
                    yield new
        spoken = re.sub(r"[ \t]{2,}", " ", STAGE.sub("", buf.split("###")[0])).strip()
        tail = buf.split("###", 1)[1] if "###" in buf else ""
        if spoken:
            break
    if not spoken:
        spoken = "Hm. Go on."
        yield spoken
    state = {"interest": i0, "trust": t0, "thought": "", "leaving": False}
    m = re.search(r"\{.*\}", tail, re.S)
    if m:
        try:
            o = json.loads(m.group(0))
            clamp = lambda v, d: max(0, min(100, int(v))) if isinstance(v, (int, float)) else d
            state = {"interest": clamp(o.get("interest"), i0), "trust": clamp(o.get("trust"), t0), "thought": str(o.get("thought", ""))[:140], "leaving": bool(o.get("leaving"))}
        except Exception:
            pass
    s["turns"].extend([user_turn, {"role": "char", "text": spoken, **state, "beat_before": beat0, "at": time.time()}])
    s["beat"] = beat1
    if state["leaving"]:
        s["done"] = True


def attach_deep(session_id: str, turn_index: int, task) -> None:
    """Register a background analysis task for a user turn; its result merges into that turn's facts."""
    s = SESSIONS.get(session_id)
    if not s:
        return
    t = s["turns"][turn_index]

    async def merge():
        deep = await task
        t["facts"] = {**deep, **{k: v for k, v in t["facts"].items() if k in ("interrupted", "presence")}}

    t["pending"] = asyncio.ensure_future(merge())


def last_user_index(session_id: str) -> int:
    s = SESSIONS[session_id]
    return max(i for i, t in enumerate(s["turns"]) if t["role"] == "user")


def trace(session_id: str) -> list[dict]:
    s = SESSIONS[session_id]
    c = char_of(s["spec"])
    i0, t0 = start_state(c)
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

EVAL_SYSTEM = """You are Poise, the coach inside Kleos. You read back one practice conversation and say how it actually went.

Who you are: the friend who will not lie to him. People use this app because their friends are too polite. If it went badly, say so first, plainly. Never pad, never reassure, never praise him for trying or for showing up. Specific, dry, exact. Kind only in the sense that the truth is useful.

How to judge:
- Three layers, always: the observable detail (a quote, a count, a turn), how it likely landed, then the verdict. Never present an interpretation as a measurement.
- LANDED (0-100): how this actually went with the other people, judged like a sharp observer in the room. Ground it in their inner state over the conversation (interest and trust, their private thoughts) and in what was said. 
- EFFORT: "real" if he genuinely engaged; "half" if answers were mostly one-liners, deflections or going through the motions; "trolling" if he was clearly messing about, being absurd, rude for fun or not trying. Judge from the words, not the voice.
- Calibration for every score, no rounding up: 90+ almost never, genuinely impressive, a stranger would remember him. 75 = strong, would land with most people. 60 = fine but forgettable. 45 = noticeably awkward or flat. 30 = it went badly. Under 20 = he wasn't trying or it collapsed. Most real first attempts sit between 35 and 60.
- STRENGTHS: zero, one or two, only things that genuinely worked and cite a turn. If nothing worked, return an empty list. Never invent a strength to soften a verdict.
- One CHANGE: the single adjustment that would most improve the next attempt. Cite a quote or a turn.
- Give a 'hint' (a delivery or structure adjustment, no script) and an 'example' (one line in his own content).
- Social awareness (0-100): did he answer what was asked, use what they said, ask anything back, read the moment, handle new people joining? Cite evidence.
- Several styles are valid. Quiet and deliberate can score as high as warm and expressive. Never reward dominance, negging or arrogance.
- Pauses: a deliberate pause before a hard answer is fine. Flag pauses or fillers only if they hurt clarity or flow.
- No coaching clichés ("great job", "be yourself", "confidence is key", "remember to"), no therapy language, no exclamation marks. Second person. Short sentences.
- If a previous attempt is provided, write an honest 'compare' line. Better, worse or mixed. Never assume the retry improved.
- Archetype: one playful label for THIS conversation (not the person), from: The Hedge, The Apologist, The Sprinter, The Statue, The Pleaser, The Blade, The Anchor, The Current, The Storyteller, The Understated, The Ghost, The Clown. Entertainment, clearly.
- 'What matters most here' names the lens. Weight awareness and the change toward it.
- SIGNAL: each turn may carry time-ordered measured moments (fillers, hedges, repeats, restarts, rushes, fades, pauses, look-aways). Find the one moment where two channels line up (words x voice, or voice x eyes). Quote the words and name the measured thing. If nothing lines up or no audio was measured, null. Never claim to read feelings or honesty from the face.
- TURNING POINT: the single exchange where it changed direction, if there is one. Name the turn, quote it, say what changed in the other person. If nothing turned, null. Do not invent drama.
- ALTERNATIVES: two viable ways to handle the change moment, in different registers (two of: warm and direct, brief and firm, playful and light, calm and explanatory). Each one line in his own content.
- SCRIPT: 40-70 words Poise says out loud. Lead with the verdict in one blunt sentence, then the one change. Sounds like a person talking, not a report.
Return only JSON:
{"effort": "real"|"half"|"trolling",
 "landed": {"score": int, "evidence": str},
 "verdict": str (one blunt sentence, <= 16 words),
 "archetype": str, "archetype_line": str (<= 10 words),
 "strengths": [{"text": str, "turn": int}] (0-2 items),
 "change": {"text": str, "turn": int, "quote": str},
 "hint": str, "example": str,
 "alternatives": [{"style": str, "line": str}, {"style": str, "line": str}],
 "signal": {"text": str, "turn": int, "quote": str, "measured": str} or null,
 "turning_point": {"turn": int, "quote": str, "what_changed": str} or null,
 "awareness": {"score": int, "evidence": str},
 "compare": str or null,
 "script": str}"""


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
    # Deep voice analysis runs in the background during the conversation; make sure it has landed.
    pending = [t["pending"] for t in s["turns"] if t.get("pending")]
    if pending:
        await asyncio.gather(*pending, return_exceptions=True)
        for t in s["turns"]:
            t.pop("pending", None)
    vf = _merge_facts(s["turns"])
    acoustic = any((t.get("facts") or {}).get("duration_s") for t in s["turns"] if t["role"] == "user")
    axes = {"voice": rubric.voice_score(vf), "command": rubric.command_score(vf), "composure": rubric.composure_score(vf)}
    if not acoustic:
        # No recording measured: delivery can't be credited. Hold those axes near neutral instead of the rubric's base.
        axes = {k: round(50 + (v - 50) * 0.4) for k, v in axes.items()}
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
            if not t["text"].strip():
                transcript.append(f"TURN {ui} (you): [said nothing]")
                continue
            transcript.append(f'TURN {ui} (you): "{t["text"]}"  [voice: wpm {f.get("wpm",0)} (variation {f.get("rate_cv",0)}), fillers {f.get("filler_count",0)}, hedges {f.get("hedge_count",0)}, apologies {f.get("apology_count",0)}, repeats {f.get("repeat_count",0)}, restarts {f.get("restart_count",0)}, pitch range {f.get("pitch_range_st",0)}st, flat stretch {f.get("flat_stretch_s",0)}s, fades {f.get("fade_endings",0)}, first word {f.get("first_word_s",0)}s, ended mid-sentence {f.get("ended_mid_sentence")}] [per sentence: {tl}] [moments: {mom}]{pres}')
        else:
            prim = char_of(s["spec"])["name"]
            said = " / ".join(f'{who}: "{w}"' for who, w in readable(t["text"], prim)) or f'{prim}: "{t["text"]}"'
            transcript.append(f'{said}  [{prim}\'s inner state after this: interest {t.get("interest","?")}, trust {t.get("trust","?")}; private thought: {t.get("thought","")}{"; LEAVES" if t.get("leaving") else ""}]')
    prev_block = "none"
    if s.get("attempt_of") and s["attempt_of"] in SESSIONS and (SESSIONS[s["attempt_of"]].get("evaluation") or {}).get("change"):
        p = SESSIONS[s["attempt_of"]]
        prev_block = json.dumps({"counts": _counts(p["turns"]), "change_given": p["evaluation"]["change"]["text"], "user_turns": [t["text"] for t in p["turns"] if t["role"] == "user"]})
    total_words = sum((t.get("facts") or {}).get("word_count", 0) for t in s["turns"] if t["role"] == "user")
    if total_words < 8 and sum(1 for t in s["turns"] if t["role"] == "user") <= 1:
        out = {"insufficient": True, "reason": "You barely said anything, so there is nothing to read. Talk to them next time.", "rating": None, "axes": None, "counts": _counts(s["turns"]), "turns": [{"role": t["role"], "text": t["text"]} for t in s["turns"]], "trace": trace(session_id), "character": char_of(s["spec"])["name"]}
        s["evaluation"] = out
        return out
    focus = RUBRIC_FOCUS.get(s["spec"].get("focus") or s["spec"].get("unit") or s["spec"].get("goal_key") or "", RUBRIC_FOCUS["intro"])
    poise_tone = ("Voice for this user: UNFILTERED. You are brutal, funny and completely honest, like the friend filming his reaction. Swear when it's earned (fuck, shit, Jesus). If he embarrassed himself, say it in the first line, plainly: \"You humiliated yourself there. What the fuck was that?\" If he did well, say that just as bluntly. Roast what he DID and SAID, never his looks, body, race, sexuality or anything he can't change. No slurs. Slang (aura, cooked, fumbled, rizz, mogged) is fine if it lands. The analysis stays exact and the one change stays specific; the script should be quotable in a TikTok."
                  if s.get("tone") == "unfiltered" else "Voice: blunt and exact, no swearing. If it went badly, the first sentence says so.")
    user = f"""{poise_tone}
Scene: {s['spec']['setting']}
Goal: {s['spec']['goal']}
What matters most here: {focus}
Pressure: {s['pressure']}

{chr(10).join(transcript)}

Rubric scores (computed from audio{"" if acoustic else "; NO AUDIO MEASURED, delivery unknown"}, do not restate as yours): {json.dumps(axes)}
Previous attempt: {prev_block}"""

    def check(o):
        if len(o.get("strengths") or []) > 2:
            return "at most two strengths"
        if o.get("effort") not in ("real", "half", "trolling"):
            return "effort must be real, half or trolling"
        if not isinstance((o.get("landed") or {}).get("score"), (int, float)):
            return "missing landed score"
        if not isinstance(o.get("change"), dict) or not o["change"].get("text"):
            return "missing change"
        if not isinstance(o.get("awareness"), dict):
            return "missing awareness"
        if "!" in o.get("script", "") and s.get("tone") != "unfiltered":
            return "exclamation mark"
        if len(o.get("alternatives") or []) != 2:
            return "need exactly two alternatives"
        return None

    out = await _json_call(M_EVAL, EVAL_SYSTEM, user, max_tokens=2500, check=check, allow_slang=s.get("tone") == "unfiltered")
    axes["awareness"] = max(3, min(97, int(out.get("awareness", {}).get("score", 50))))
    landed = max(3, min(97, int(out["landed"]["score"])))
    rating = round(landed * 0.35 + axes["awareness"] * 0.2 + axes["voice"] * 0.15 + axes["command"] * 0.15 + axes["composure"] * 0.15)
    # Caps: delivery can't rescue a conversation that didn't land or wasn't real.
    spoken_turns = [t for t in s["turns"] if t["role"] == "user" and not (t.get("facts") or {}).get("silent") and t["text"].strip()]
    avg_words = total_words / max(1, len(spoken_turns))
    chars = [t for t in s["turns"] if t["role"] == "char" and "interest" in t]
    final_interest = chars[-1]["interest"] if chars else 50
    caps = {"trolling": 18, "half": 42}
    if out.get("effort") in caps:
        rating = min(rating, caps[out["effort"]])
    if avg_words < 5:
        rating = min(rating, 40)
    walked_off = bool(chars) and chars[-1].get("leaving") and final_interest < 35
    if final_interest < 25 or walked_off:
        rating = min(rating, 45)
    rating = min(rating, landed + 15)
    axes["landed"] = landed
    out.update({"rating": rating, "axes": axes, "counts": _counts(s["turns"]), "turns": [{"role": t["role"], "text": t["text"]} for t in s["turns"]], "trace": trace(session_id), "character": char_of(s["spec"])["name"]})
    if s.get("attempt_of") and s["attempt_of"] in SESSIONS and (SESSIONS[s["attempt_of"]].get("evaluation") or {}).get("rating") is not None:
        prev = SESSIONS[s["attempt_of"]]["evaluation"]
        out["delta"] = rating - prev["rating"]
        out["prev_counts"] = prev["counts"]
        out["prev_rating"] = prev["rating"]
    s["evaluation"] = out
    return out


# ---------------------------------------------------------------- lessons (generated, never scripted)

LESSON_SYSTEM = """You design one 3-minute practice conversation for Aura. Return only JSON:
{"character": one of mara|theo|dev|julian|ines|kai, "setting": str (one sentence, concrete, everyday, varied), "opener": str (the character's first line, natural, under 20 words), "twist": str or null (a plausible mid-conversation change), "goal": str (the lesson goal restated for this scene, under 14 words), "hint": str (one delivery/structure tip, no script)}
Rules: scenes are realistic for adults 18-30 in cities: work, friends, dates, family, service, travel. Never sexual, never cruel.
If the unit is "Rehearse", the objective is the user's own description of a real situation coming up. Rebuild it as faithfully as you can: the same kind of person, setting and stakes, with an opener that person would really say, and a twist that is the thing he is most likely dreading. Vary settings; avoid ones in 'avoid'. Choose the character whose style best tests the goal."""


async def generate_lesson(*, unit: str, objective: str, weak: list[str], avoid: list[str], pressure: int, unit_id: str = "", tone: str = "real") -> dict:
    user = json.dumps({"unit": unit, "objective": objective, "his recurring weak spots": weak, "avoid settings": avoid, "pressure": pressure})

    def check(o):
        return None if o.get("character") in CAST and o.get("opener") else "bad character or missing opener"

    sys_ = LESSON_SYSTEM if tone != "unfiltered" else LESSON_SYSTEM.replace("Never sexual, never cruel.", "UNFILTERED mode (adults): make it messier, funnier and more real: bars, side quests, awkward dates, roasts, money fights, hookup aftermath. Frank adult topics are fine; never explicit, never cruel.")
    out = await _json_call(M_EVAL, sys_, user, max_tokens=800, check=check, allow_slang=tone == "unfiltered")
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
 "said_instead": str (one line he could have said at the key moment, in his own voice, natural, under 25 words),
 "drill": str (a 3-minute practice idea for the app),
 "scene": {"character": one of mara|theo|dev|julian|ines|kai, "setting": str (the moment, re-staged as a practice scene, one sentence), "opener": str (the other person's first line, under 20 words), "goal": str (under 14 words)}}
Points are on the playful meme scale: small beats +-10..40, big ones +-80..250. total = sum. Be honest, not nice: credit only what actually worked, and if he fumbled, the total goes negative. Write like a sharp friend, not a coach: short, specific, no clichés, no therapy language. Never judge looks, never encourage anything manipulative or disrespectful. No slang (alpha, sigma, mog, rizz). If the story involves harm, distress or danger, set lines to [] and use headline to respond kindly and suggest real support."""


async def ledger(story: str, context: str = "", tone: str = "real") -> dict:
    def check(o):
        if o.get("lines") and abs(sum(int(l["points"]) for l in o["lines"]) - int(o.get("total", 0))) > 1:
            return "total must equal the sum of points"
        return None

    sys_ = LEDGER_SYSTEM + ("\nThis user chose UNFILTERED: be brutal and funny like the best friend reading the receipt out loud. Swear when it's earned, call a fumble a fumble ('you fumbled so hard'), slang welcome (aura, cooked, fumbled, rizz). Roast what he did, never his looks or identity. Still specific." if tone == "unfiltered" else "")
    out = await _json_call(M_EVAL, sys_, f"{context}\nStory: {story}".strip(), max_tokens=1200, check=check, allow_slang=tone == "unfiltered")
    out["receipt_no"] = f"{uuid.uuid4().int % 10000:04d}"
    return out


# ---------------------------------------------------------------- portrait (Kleos Black)

PORTRAIT_SYSTEM = """You are Poise. You've read every practice conversation this person has had in Kleos. Write their Portrait: an honest, specific read of who they are in a room, built only from the evidence given (scores, verdicts, the changes you kept giving, archetypes, recurring patterns). Never generic. Never flattering for its own sake. Quote patterns with counts where you can.
Return only JSON:
{"headline": str (<= 12 words, the truest sentence about how he comes across),
 "in_a_room": str (2-3 sentences: what people experience talking to him),
 "strengths": [str, str] (each <= 16 words, with evidence),
 "the_pattern": str (the one habit that costs him most, with how often it showed up),
 "when_it_works": str (the conditions where he's at his best),
 "next_month": [str, str, str] (three specific practice targets, in order),
 "line": str (one line Poise would say to him out loud, <= 20 words)}"""


async def portrait(history: list[dict], tone: str = "real") -> dict:
    voice = "Voice: UNFILTERED, brutal and funny, swear if earned." if tone == "unfiltered" else "Voice: blunt and exact, warm underneath."
    def check(o):
        if not o.get("headline") or len(o.get("next_month") or []) != 3:
            return "need headline and three next_month items"
        return None
    return await _json_call(M_EVAL, PORTRAIT_SYSTEM, f"{voice}\nConversations, newest first:\n{json.dumps(history[:30])}", max_tokens=1600, check=check, allow_slang=tone == "unfiltered")
