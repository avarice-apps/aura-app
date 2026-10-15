"""Live, full-duplex conversations.

ElevenLabs Agents handles the real-time audio: streaming speech-to-text, turn-taking, interruptions,
and streamed voices. Our server stays the brain: ElevenLabs calls `/llm/v1/chat/completions` on this
server for every character reply, and `converse.stream_turn` produces it (inner state, delivery
awareness, tone, twists). After the call we pull the recording, slice out the user's turns and run
the full voice analysis before Poise evaluates.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import secrets
import subprocess
import tempfile

import httpx

from . import audio, converse

API = "https://api.elevenlabs.io/v1"
DATA = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
AGENT_FILE = os.path.join(DATA, "live_agent.json")
SESSION_TAG = re.compile(r"\[\[kleos:(s_[0-9a-f]{12})\]\]")


def _key() -> str:
    return os.environ["ELEVENLABS_API_KEY"]


def _load() -> dict:
    try:
        with open(AGENT_FILE) as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def _save(d: dict) -> None:
    os.makedirs(DATA, exist_ok=True)
    with open(AGENT_FILE, "w") as f:
        json.dump(d, f)


def llm_secret() -> str:
    d = _load()
    if not d.get("secret"):
        d["secret"] = secrets.token_urlsafe(24)
        _save(d)
    return d["secret"]


def _agent_config(public_url: str) -> dict:
    return {
        "name": "Kleos Live",
        "conversation_config": {
            "agent": {
                "first_message": "Hey.",
                "language": "en",
                "prompt": {
                    "prompt": "[[kleos:s_000000000000]]",
                    "llm": "custom-llm",
                    "custom_llm": {
                        "url": f"{public_url.rstrip('/')}/llm/v1",
                        "model_id": "kleos-character",
                        "request_headers": {"x-kleos-key": llm_secret()},
                    },
                },
            },
            "tts": {"voice_id": "EXAVITQu4vr4xnSDxMaL", "model_id": "eleven_flash_v2"},
            "turn": {"turn_timeout": 12, "turn_eagerness": "normal"},
            "conversation": {"max_duration_seconds": 420, "client_events": ["audio", "interruption", "agent_response", "user_transcript", "agent_response_correction"]},
        },
        "platform_settings": {
            "auth": {"enable_auth": True},
            "overrides": {
                "custom_llm_extra_body": True,
                "conversation_config_override": {
                    "agent": {"prompt": {"prompt": True}, "first_message": True},
                    "tts": {"voice_id": True},
                },
            },
        },
    }


async def ensure_agent(public_url: str) -> str:
    """Create the shared live agent once, and point its brain at this server's current public URL."""
    d = _load()
    cfg = _agent_config(public_url)
    async with httpx.AsyncClient(timeout=30) as c:
        if d.get("agent_id"):
            r = await c.patch(f"{API}/convai/agents/{d['agent_id']}", headers={"xi-api-key": _key()}, json=cfg)
            if r.status_code < 300:
                return d["agent_id"]
        r = await c.post(f"{API}/convai/agents/create", headers={"xi-api-key": _key()}, json=cfg)
        r.raise_for_status()
        d["agent_id"] = r.json()["agent_id"]
        _save(d)
        return d["agent_id"]


async def conversation_token(agent_id: str) -> str:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{API}/convai/conversation/token", params={"agent_id": agent_id}, headers={"xi-api-key": _key()})
        r.raise_for_status()
        return r.json()["token"]


def session_from_messages(messages: list[dict]) -> str | None:
    for m in messages:
        content = m.get("content")
        if isinstance(content, list):
            content = " ".join(p.get("text", "") for p in content if isinstance(p, dict))
        if isinstance(content, str):
            hit = SESSION_TAG.search(content)
            if hit:
                return hit.group(1)
    return None


def last_user_text(messages: list[dict]) -> str:
    for m in reversed(messages):
        if m.get("role") == "user":
            c = m.get("content")
            if isinstance(c, list):
                c = " ".join(p.get("text", "") for p in c if isinstance(p, dict))
            return (c or "").strip()
    return ""


async def openai_stream(session_id: str, user_text: str, model: str = "kleos-character"):
    """Our character, as an OpenAI-compatible SSE stream (what ElevenLabs expects from a custom LLM)."""
    base = {"id": f"chatcmpl-{session_id}", "object": "chat.completion.chunk", "model": model}
    yield f"data: {json.dumps({**base, 'choices': [{'index': 0, 'delta': {'role': 'assistant'}, 'finish_reason': None}]})}\n\n"
    try:
        async for piece in converse.stream_turn(session_id, user_text):
            yield f"data: {json.dumps({**base, 'choices': [{'index': 0, 'delta': {'content': piece}, 'finish_reason': None}]})}\n\n"
    except KeyError:
        yield f"data: {json.dumps({**base, 'choices': [{'index': 0, 'delta': {'content': 'Sorry, I have to run.'}, 'finish_reason': None}]})}\n\n"
    yield f"data: {json.dumps({**base, 'choices': [{'index': 0, 'delta': {}, 'finish_reason': 'stop'}]})}\n\n"
    yield "data: [DONE]\n\n"


# ---------------------------------------------------------------- after the call

async def fetch_conversation(conversation_id: str) -> tuple[dict, bytes | None]:
    async with httpx.AsyncClient(timeout=60) as c:
        meta = None
        # The recording and transcript are finalised a few seconds after hang-up.
        for _ in range(12):
            r = await c.get(f"{API}/convai/conversations/{conversation_id}", headers={"xi-api-key": _key()})
            if r.status_code < 300:
                meta = r.json()
                if meta.get("status") in ("done", "failed"):
                    break
            await asyncio.sleep(2.5)
        audio_bytes = None
        if meta and meta.get("has_audio", True):
            a = await c.get(f"{API}/convai/conversations/{conversation_id}/audio", headers={"xi-api-key": _key()})
            if a.status_code < 300 and a.content:
                audio_bytes = a.content
    return meta or {}, audio_bytes


def _user_spans(transcript: list[dict], total: float) -> list[tuple[float, float, str]]:
    spans = []
    for i, m in enumerate(transcript):
        if m.get("role") != "user" or not (m.get("message") or "").strip():
            continue
        t0 = float(m.get("time_in_call_secs") or 0)
        nxt = next((float(x.get("time_in_call_secs") or 0) for x in transcript[i + 1 :] if x.get("role") != "user"), total)
        spans.append((max(0.0, t0 - 0.3), max(t0 + 0.5, nxt), m["message"].strip()))
    return spans


async def analyse_call(session_id: str, conversation_id: str) -> None:
    """Attach measured voice facts to each user turn from the real recording, then the session is ready to evaluate."""
    s = converse.SESSIONS.get(session_id)
    if not s:
        raise KeyError("session expired")
    meta, rec = await fetch_conversation(conversation_id)
    transcript = meta.get("transcript") or []
    if not rec:
        return
    tmp = tempfile.mkdtemp(prefix="kleos_live_")
    src = os.path.join(tmp, "call.mp3")
    with open(src, "wb") as f:
        f.write(rec)
    total = float((meta.get("metadata") or {}).get("call_duration_secs") or 0) or 600.0
    spans = _user_spans(transcript, total)
    user_turns = [t for t in s["turns"] if t["role"] == "user"]

    async def one(i: int, span: tuple[float, float, str]):
        t0, t1, _ = span
        wav = os.path.join(tmp, f"u{i}.wav")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{t0:.2f}", "-to", f"{t1:.2f}", "-i", src, "-ac", "1", "-ar", "16000", wav], check=True)
        dg = await audio.transcribe(wav)
        v = await asyncio.to_thread(audio.analyse, wav, dg)
        return {k: x for k, x in v.to_dict().items() if k != "transcript"}

    results = await asyncio.gather(*(one(i, sp) for i, sp in enumerate(spans)), return_exceptions=True)
    for turn, res in zip(user_turns, results):
        if isinstance(res, dict):
            turn["facts"] = {**res, **{k: v for k, v in (turn.get("facts") or {}).items() if k in ("interrupted", "presence")}}
    s["conversation_id"] = conversation_id
