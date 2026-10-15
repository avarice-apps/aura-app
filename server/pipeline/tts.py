"""Poise's voice. ElevenLabs text-to-speech."""
from __future__ import annotations

import os

import httpx

VOICE_ID = os.environ.get("POISE_VOICE_ID", "6RhsStUwC1J5DEn4TbMO")  # Girl Aura, custom voice chosen by Rafael


async def speak(text: str, voice_id: str | None = None) -> bytes:
    key = os.environ["ELEVENLABS_API_KEY"]
    vid = voice_id or VOICE_ID
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{vid}",
            params={"output_format": "mp3_44100_128"},
            headers={"xi-api-key": key, "Content-Type": "application/json"},
            json={
                "text": text,
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {"stability": 0.5, "similarity_boost": 0.8, "style": 0.3, "use_speaker_boost": True},
            },
        )
    r.raise_for_status()
    return r.content


async def stream(text: str, voice_id: str | None = None, fast: bool = False):
    """Yield mp3 chunks as ElevenLabs produces them. fast=True uses the low-latency Flash model (characters)."""
    key = os.environ["ELEVENLABS_API_KEY"]
    vid = voice_id or VOICE_ID
    model = "eleven_flash_v2_5" if fast else "eleven_multilingual_v2"
    async with httpx.AsyncClient(timeout=60) as client:
        async with client.stream(
            "POST",
            f"https://api.elevenlabs.io/v1/text-to-speech/{vid}/stream",
            params={"output_format": "mp3_44100_128"},
            headers={"xi-api-key": key, "Content-Type": "application/json"},
            json={"text": text, "model_id": model, "voice_settings": {"stability": 0.5, "similarity_boost": 0.8, "style": 0.3, "use_speaker_boost": True}},
        ) as r:
            r.raise_for_status()
            async for chunk in r.aiter_bytes():
                if chunk:
                    yield chunk
