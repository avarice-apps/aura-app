"""Debate Duel: two people, one topic, opposite sides, 45 seconds each, recorded at different times.
Poise judges who argued better and stayed more composed. Media is never stored: only measured facts and words."""
from __future__ import annotations

import json
import os
import random
import sqlite3
import string
import time
import uuid

from .converse import M_EVAL, _json_call

DATA = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
DB = os.path.join(DATA, "duels.db")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
TOPICS = {t["id"]: t for t in json.load(open(os.path.join(ROOT, "content", "duels.json")))["topics"]}


def _db() -> sqlite3.Connection:
    os.makedirs(DATA, exist_ok=True)
    c = sqlite3.connect(DB)
    c.execute("create table if not exists duels (id text primary key, code text unique, topic_id text, tone text, name_a text, name_b text, a text, b text, result text, created real)")
    cols = [r[1] for r in c.execute("pragma table_info(duels)")]
    for col in ("subject_a", "subject_b"):
        if col not in cols:
            c.execute(f"alter table duels add column {col} text")
    c.execute("delete from duels where created < ?", (time.time() - 30 * 86400,))  # privacy policy: 30 days
    return c


def _code() -> str:
    alphabet = "".join(ch for ch in string.ascii_uppercase + string.digits if ch not in "O0I1")
    return "".join(random.choice(alphabet) for _ in range(5))


def _take(v: dict, p: dict) -> dict:
    keep_v = ("transcript", "word_count", "duration_s", "wpm", "filler_count", "hedge_count", "apology_count", "pause_count", "longest_pause_s", "first_word_s", "pitch_variance", "upward_endings", "sentence_count", "trailing_drop", "ended_mid_sentence")
    keep_p = ("available", "eye_contact_ratio", "contact_breaks", "fidget_events", "head_motion", "blink_rate_per_min")
    return {"voice": {k: v.get(k) for k in keep_v}, "presence": {k: p.get(k) for k in keep_p}}


def create(topic_id: str, name: str, tone: str, v: dict, p: dict, subject: str = "") -> dict:
    if topic_id not in TOPICS:
        raise KeyError("unknown topic")
    with _db() as c:
        for _ in range(8):
            did, code = uuid.uuid4().hex[:12], _code()
            try:
                c.execute("insert into duels (id, code, topic_id, tone, name_a, name_b, a, b, result, created, subject_a) values (?,?,?,?,?,?,?,?,?,?,?)", (did, code, topic_id, tone, (name or "Player 1")[:40], None, json.dumps(_take(v, p)), None, None, time.time(), subject[:64]))
                break
            except sqlite3.IntegrityError:
                continue
        else:
            raise RuntimeError("Couldn't create a duel code. Try again.")
    return get(code)


def delete_for(subject: str) -> int:
    """Privacy: delete every duel this install created or answered."""
    with _db() as c:
        return c.execute("delete from duels where subject_a = ? or subject_b = ?", (subject, subject)).rowcount


def get(code: str) -> dict:
    with _db() as c:
        r = c.execute("select id, code, topic_id, tone, name_a, name_b, result, created from duels where code = ?", (code.upper().strip(),)).fetchone()
    if not r:
        raise KeyError("No duel with that code.")
    t = TOPICS[r[2]]
    return {"id": r[0], "code": r[1], "topic_id": r[2], "topic": t["topic"], "side_a": t["a"], "side_b": t["b"], "tone": r[3], "name_a": r[4], "name_b": r[5], "status": "done" if r[6] else "waiting", "result": json.loads(r[6]) if r[6] else None}


JUDGE = """You are Poise, judging a Debate Duel inside Kleos. Two people argued opposite sides of one topic, 45 seconds each, recorded separately. Neither heard the other.
Judge two things, equally: ARGUMENT (a clear position, a reason that actually supports it, an example, answering the obvious objection, no rambling) and COMPOSURE (steady pace, few fillers and hedges, no apologising, finishing sentences, eye contact on camera when measured). Use the measured facts; don't invent delivery details that weren't measured.
Never judge looks, voice pitch as gender, accent, or anything people can't change. Take the side they were given: don't punish someone for arguing a side you disagree with. If someone barely spoke, they lose, and say so.
Return only JSON:
{"winner": "a"|"b"|"draw", "margin": "clear"|"close",
 "scores": {"a": {"argument": int, "composure": int, "total": int}, "b": {"argument": int, "composure": int, "total": int}},
 "verdict": str (one sentence, <= 20 words, who won and why),
 "best_line": {"who": "a"|"b", "quote": str (their actual words)},
 "fumble": {"who": "a"|"b", "quote": str, "why": str (<= 14 words)} or null,
 "note_a": str (<= 18 words, the one thing A should fix), "note_b": str (<= 18 words, same for B),
 "caption": str (one quotable line for TikTok, <= 14 words)}
Scores 0-100, honest, total = round((argument + composure) / 2)."""


async def answer(code: str, name: str, v: dict, p: dict, subject: str = "") -> dict:
    d = get(code)
    if d["status"] == "done":
        return d
    b = _take(v, p)
    with _db() as c:
        a = json.loads(c.execute("select a from duels where code = ?", (d["code"],)).fetchone()[0])
    tone = d["tone"]
    voice = ("Voice: UNFILTERED. Brutal and funny, swear when it's earned, roast the arguments not the people." if tone == "unfiltered" else "Voice: blunt, funny, no swearing.")
    user = f"""{voice}
Topic: {d['topic']}
A ({d['name_a']}) argued: {d['side_a']}
B ({name or 'Player 2'}) argued: {d['side_b']}

A's take: "{a['voice'].get('transcript') or ''}"
A measured: {json.dumps({k: x for k, x in a['voice'].items() if k != 'transcript'})} presence {json.dumps(a['presence'])}

B's take: "{b['voice'].get('transcript') or ''}"
B measured: {json.dumps({k: x for k, x in b['voice'].items() if k != 'transcript'})} presence {json.dumps(b['presence'])}"""

    def check(o):
        if o.get("winner") not in ("a", "b", "draw"):
            return "winner must be a, b or draw"
        sc = o.get("scores") or {}
        if not all(isinstance((sc.get(k) or {}).get("total"), (int, float)) for k in ("a", "b")):
            return "need totals for a and b"
        return None

    res = await _json_call(M_EVAL, JUDGE, user, max_tokens=1200, check=check, allow_slang=tone == "unfiltered")
    with _db() as c:
        # First answer wins; a second, simultaneous answer gets the stored verdict instead of overwriting it.
        c.execute("update duels set name_b = ?, b = ?, result = ?, subject_b = ? where code = ? and result is null", ((name or "Player 2")[:40], json.dumps(b), json.dumps(res), subject[:64], d["code"]))
    return get(code)
