"""Aura API. Read → facts → rubric → Poise → voice.

Run: uvicorn main:app --port 8787
Env: DEEPGRAM_API_KEY, ANTHROPIC_API_KEY, ELEVENLABS_API_KEY, POISE_VOICE_ID (optional), SUPABASE_URL/SERVICE_KEY (optional, for persistence)
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import shutil
import tempfile
import time
import uuid

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response, HTMLResponse, FileResponse
from fastapi import Request

from pipeline import audio, face, rubric, poise, tts, converse
from training import store as train_store, learned

app = FastAPI(title="Aura", version="0.1")
AUDIO_DIR = os.environ.get("AURA_AUDIO_DIR", os.path.join(tempfile.gettempdir(), "aura-audio"))
os.makedirs(AUDIO_DIR, exist_ok=True)
PUBLIC_URL = os.environ.get("AURA_PUBLIC_URL", "http://localhost:8787")
ADMIN_KEY = os.environ.get("AURA_ADMIN_KEY", "")


@app.get("/health")
async def health():
    return {"ok": True, "t": time.time()}


async def _save(upload: UploadFile, suffix: str) -> str:
    path = tempfile.mktemp(suffix=suffix)
    with open(path, "wb") as f:
        shutil.copyfileobj(upload.file, f)
    return path


async def measure(video_path: str, with_face: bool = True, face_mesh: bool = True) -> tuple[dict, dict]:
    wav = audio.extract_wav(video_path)
    dg_task = audio.transcribe(wav)
    face_task = asyncio.to_thread(face.analyse, video_path, 6.0, face_mesh) if with_face else None
    dg = await dg_task
    v = await asyncio.to_thread(audio.analyse, wav, dg)
    p = await face_task if face_task else face.PresenceFacts()
    os.remove(wav)
    return v.to_dict(), p.to_dict()


@app.post("/read")
async def read(
    video: UploadFile = File(...),
    prompt_id: str = Form(...),
    prompt_text: str = Form(...),
    name: str = Form(""),
    intensity: str = Form("straight"),
    history: str = Form("[]"),
    deep: bool = Form(False),
    voice: bool = Form(True),
    train_consent: str = Form("0"),
    subject_id: str = Form(""),
):
    path = await _save(video, ".mp4")
    try:
        hist = json.loads(history or "[]")
        v, p = await measure(path)
        if v["word_count"] < 6:
            raise HTTPException(422, "We couldn't hear enough. Try again, closer to the mic.")
        scores = rubric.score(audio.VoiceFacts(**v), face.PresenceFacts(**p), read_axis=None, n_prior_reads=len(hist))
        facts = {"voice": {k: x for k, x in v.items() if k != "transcript"}, "presence": p}
        # learned perception model (if trained) blends into the rubric, weighted by how well it predicts real panels
        scores["axes"], perceived = learned.blend(scores["axes"], facts)
        scores["index"] = round(sum(scores["axes"][k] * w for k, w in rubric.AXIS_WEIGHT.items()))
        if train_consent == "1" and subject_id:
            try:
                train_store.save_clip(video_path=path, subject_id=subject_id, prompt_text=prompt_text, features=facts, rubric=scores)
            except Exception:
                pass
        out = await poise.verdict(prompt_text=prompt_text, voice=v, presence=p, scores=scores, history=hist, name=name, intensity=intensity, deep=deep)
        if out.get("safety"):
            return JSONResponse({"safety": True, "script": out.get("script", "")}, status_code=200)
        vid = f"v_{uuid.uuid4().hex[:12]}"
        audio_url = None
        if voice:
            try:
                mp3 = await tts.speak(out["script"])
                fn = f"{vid}.mp3"
                with open(os.path.join(AUDIO_DIR, fn), "wb") as f:
                    f.write(mp3)
                audio_url = f"{PUBLIC_URL}/audio/{fn}"
            except Exception:
                audio_url = None
        tells = [{"id": f"t_{i}", **t} for i, t in enumerate(out["tells"])]
        return {
            "id": vid,
            "promptId": prompt_id,
            "index": scores["index"],
            "band": scores["band"],
            "axes": scores["axes"],
            "archetype": out["archetype"],
            "tells": tells,
            "drill": out["drill"],
            "script": out["script"],
            "audioUrl": audio_url,
            "facts": facts,
            "perceived": perceived,
            "model": out.get("model"),
        }
    finally:
        if os.path.exists(path):
            os.remove(path)


@app.get("/audio/{fn}")
async def get_audio(fn: str):
    p = os.path.join(AUDIO_DIR, os.path.basename(fn))
    if not os.path.exists(p):
        raise HTTPException(404)
    with open(p, "rb") as f:
        return Response(f.read(), media_type="audio/mpeg")


@app.post("/pressure")
async def pressure(audio_file: UploadFile = File(..., alias="audio"), prompt_text: str = Form(...), seconds: int = Form(20)):
    path = await _save(audio_file, ".m4a")
    try:
        v, _ = await measure(path, with_face=False)
        vf = audio.VoiceFacts(**v)
        composure = rubric.composure_score(vf)
        # pressure rounds weigh fillers and finishing too
        composure = rubric.clamp(composure - max(0, vf.filler_per_min - 3) * 3 - (8 if vf.ended_mid_sentence else 0))
        line = await poise.pressure_line(prompt_text=prompt_text, voice=v, composure=composure)
        return {"composure": composure, "firstWordMs": int(vf.first_word_s * 1000), "fillers": vf.filler_count, "finished": not vf.ended_mid_sentence, "line": line}
    finally:
        os.remove(path)


@app.post("/silence")
async def silence(video: UploadFile = File(...)):
    path = await _save(video, ".mp4")
    try:
        p = await asyncio.to_thread(face.analyse, path, 8.0)
        if not p.available:
            raise HTTPException(422, "No face found. More light, closer to the lens.")
        presence = rubric.presence_score(p)
        line = "You held it. Most don't." if p.contact_breaks == 0 and p.fidget_events == 0 else "You looked away to check if it was over. It wasn't." if p.contact_breaks else "Your eyes stayed. Your hands didn't."
        return {"presence": presence, "breaks": p.contact_breaks, "blinks": int(p.blink_rate_per_min / 4), "fidgets": p.fidget_events, "longestHoldS": p.longest_contact_s, "line": line}
    finally:
        os.remove(path)


@app.get("/tts")
async def tts_get(text: str, voice_id: str | None = None):
    h = hashlib.sha1(f"{voice_id}|{text}".encode()).hexdigest()[:16]
    p = os.path.join(AUDIO_DIR, f"tts_{h}.mp3")
    if not os.path.exists(p):
        mp3 = await tts.speak(text, voice_id)
        with open(p, "wb") as f:
            f.write(mp3)
    with open(p, "rb") as f:
        return Response(f.read(), media_type="audio/mpeg")


# ---------------- training: consent, panel rating, admin ----------------

@app.post("/train/withdraw")
async def train_withdraw(subject_id: str = Form(...)):
    return {"removed": train_store.withdraw(subject_id)}


def _admin(key: str):
    if not ADMIN_KEY or key != ADMIN_KEY:
        raise HTTPException(403)


@app.post("/train/raters")
async def train_new_rater(label: str = Form(""), admin_key: str = Form(...)):
    _admin(admin_key)
    r = train_store.create_rater(label)
    return {**r, "link": f"{PUBLIC_URL}/rate?token={r['token']}"}


@app.get("/train/stats")
async def train_stats(admin_key: str):
    _admin(admin_key)
    return train_store.stats()


@app.post("/train/purge")
async def train_purge(admin_key: str = Form(...)):
    _admin(admin_key)
    return {"purged": train_store.purge_expired()}


RATE_HTML = os.path.join(os.path.dirname(__file__), "training", "rate.html")


@app.get("/rate", response_class=HTMLResponse)
async def rate_page():
    with open(RATE_HTML) as f:
        return f.read()


def _rater(token: str):
    r = train_store.rater_for(token)
    if not r:
        raise HTTPException(403, "invalid rater link")
    return r


@app.get("/rate/api/me")
async def rate_me(token: str):
    r = _rater(token)
    with train_store.db() as c:
        n = c.execute("select count(*) from ratings where rater_id=?", (r["id"],)).fetchone()[0]
    return {"label": r["label"], "dimensions": train_store.DIMENSIONS, "rated": n}


@app.get("/rate/api/next")
async def rate_next(token: str):
    r = _rater(token)
    c = train_store.next_clip(r["id"])
    return {"clip": dict(c) if c else None}


@app.get("/rate/clip/{cid}")
async def rate_clip(cid: str, token: str):
    _rater(token)
    p = train_store.clip_path(cid)
    if not p or not os.path.exists(p):
        raise HTTPException(404)
    return FileResponse(p, media_type="video/mp4")


@app.post("/rate/api/submit")
async def rate_submit(token: str, request: Request):
    r = _rater(token)
    body = await request.json()
    try:
        train_store.add_rating(body["clip_id"], r["id"], body["dims"], float(body.get("watched_s", 0)))
    except (ValueError, KeyError) as e:
        raise HTTPException(422, str(e))
    return {"ok": True}


# ---------------------------------------------------------------- live conversations

def _voice_url(text: str, voice_id: str) -> str:
    from urllib.parse import quote
    return f"{PUBLIC_URL}/tts?voice_id={voice_id}&text={quote(text)}"


@app.post("/session/start")
async def session_start(request: Request):
    b = await request.json()
    try:
        out = converse.start(room_id=b.get("room_id"), goal=b.get("goal"), lesson=b.get("lesson"), pressure=int(b.get("pressure", 1)), max_turns=b.get("max_turns"), attempt_of=b.get("attempt_of"))
    except KeyError as e:
        raise HTTPException(410, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))
    out["opener_audio"] = _voice_url(out["opener"], out["character"]["voice"])
    return out


@app.post("/session/{sid}/turn")
async def session_turn(sid: str, audio_file: UploadFile | None = File(None, alias="audio"), video: UploadFile | None = File(None)):
    """One user turn. Send `audio` (voice mode) or `video` (camera mode: face + eyes are measured too)."""
    if video is not None:
        path = await _save(video, ".mp4")
        with_face = True
    elif audio_file is not None:
        path = await _save(audio_file, ".m4a")
        with_face = False
    else:
        raise HTTPException(422, "send audio or video")
    try:
        v, p = await measure(path, with_face=with_face, face_mesh=True)
    finally:
        os.remove(path)
    text = v.get("transcript") or ""
    if len(text.split()) < 2:
        # Not enough to react to. The client should let him go again without it counting.
        raise HTTPException(422, "Didn't catch that. Try again, a little closer to the mic.")
    facts = {k: x for k, x in v.items() if k != "transcript"}
    if with_face:
        facts["presence"] = p
    try:
        r = await converse.turn(sid, text, facts)
    except KeyError as e:
        raise HTTPException(410, str(e))
    brief = {k: facts.get(k) for k in ("duration_s", "wpm", "filler_count", "hedge_count", "apology_count", "first_word_s", "ended_mid_sentence", "repeat_count", "restart_count", "fade_endings")}
    brief["rushed"] = bool(facts.get("rush_moments"))
    if with_face:
        brief["eye_contact"] = p.get("eye_contact_ratio")
    return {"user_text": text, "facts": brief, "reply": r["reply"], "reply_audio": _voice_url(r["reply"], r["voice"]), "done": r["done"], "turn": r["turn"], "interest": r["interest"], "trust": r["trust"]}


@app.post("/session/{sid}/evaluate")
async def session_evaluate(sid: str, voice: bool = True):
    try:
        out = await converse.evaluate(sid)
    except KeyError as e:
        raise HTTPException(410, str(e))
    if voice and out.get("script"):
        out["script_audio"] = _voice_url(out["script"], tts.VOICE_ID)
    return out


@app.post("/lesson")
async def lesson(request: Request):
    b = await request.json()
    return await converse.generate_lesson(unit=b.get("unit", ""), objective=b.get("objective", ""), weak=b.get("weak", []), avoid=b.get("avoid", []), pressure=int(b.get("pressure", 1)), unit_id=b.get("unit_id", ""))


@app.post("/ledger")
async def make_ledger(text: str = Form(""), context: str = Form(""), audio_file: UploadFile | None = File(None, alias="audio")):
    story = text
    if audio_file is not None:
        path = await _save(audio_file, ".m4a")
        try:
            v, _ = await measure(path, with_face=False)
            story = v.get("transcript") or text
        finally:
            os.remove(path)
    if len(story.split()) < 5:
        raise HTTPException(422, "Tell me a little more about what happened.")
    out = await converse.ledger(story, context)
    out["story"] = story
    return out


@app.post("/scan")
async def scan(video: UploadFile = File(...), prompt_text: str = Form(...), subject_consent: str = Form("0"), is_self: str = Form("0"), name: str = Form("")):
    """Back-camera Aura Scan / uploads. Consent required. Others get delivery-only mode (no face mesh). Clip deleted immediately."""
    if subject_consent != "1":
        raise HTTPException(403, "The person on camera has to confirm they're in and 18+.")
    path = await _save(video, ".mp4")
    try:
        v, p = await measure(path, with_face=True, face_mesh=(is_self == "1"))
    finally:
        os.remove(path)
    if v["word_count"] < 4:
        raise HTTPException(422, "Not enough speech to read.")
    vf = audio.VoiceFacts(**v)
    pf = face.PresenceFacts(**p)
    axes = {"delivery": rubric.voice_score(vf), "composure": rubric.composure_score(vf), "command": rubric.command_score(vf), "posture": rubric.presence_score(pf) if pf.available or p.get("frames_analysed") else 50}
    score = round(sum(axes.values()) / len(axes))
    tiers = [(90, "Gravity"), (75, "Magnetic"), (60, "Composed"), (45, "Present"), (30, "Faint"), (0, "Static")]
    tier = next(t for m, t in tiers if score >= m)
    card = await converse._json_call(converse.M_EVAL, """You write the playful result card for an 'Aura Scan' party game. Return JSON: {"archetype": "The ..." (2-3 words, fun, flattering-ish, never about looks), "best_moment": str (<= 12 words, cites a quote from the transcript), "roast": str (<= 14 words, affectionate, about delivery only, never looks/body/identity)}. No slang like alpha/sigma/mog/rizz.""", json.dumps({"prompt": prompt_text, "transcript": v["transcript"], "fillers": v["filler_count"], "hedges": v["hedge_count"], "wpm": v["wpm"], "score": score}), max_tokens=400)
    return {"score": score, "tier": tier, "axes": axes, "name": name, "transcript": v["transcript"], "counts": {"fillers": v["filler_count"], "hedges": v["hedge_count"], "wpm": v["wpm"]}, **card}


# ---------------------------------------------------------------- situations: "what everyone picked"
# Tiny SQLite tally. Percentages are only shown in the app once a situation has 200+ real answers.

import sqlite3

_SIT_DB = os.path.join(os.path.dirname(__file__), "data", "situations.sqlite")


def _sit_conn():
    os.makedirs(os.path.dirname(_SIT_DB), exist_ok=True)
    c = sqlite3.connect(_SIT_DB)
    c.execute("CREATE TABLE IF NOT EXISTS answers (sid TEXT, choice INTEGER, ts REAL)")
    c.execute("CREATE INDEX IF NOT EXISTS ix_sid ON answers(sid)")
    return c


@app.post("/situations/{sid}/answer")
async def situation_answer(sid: str, request: Request):
    b = await request.json()
    choice = int(b.get("choice", -1))
    if not (0 <= choice <= 3) or len(sid) > 64:
        raise HTTPException(422, "bad answer")
    c = _sit_conn()
    with c:
        c.execute("INSERT INTO answers VALUES (?, ?, ?)", (sid, choice, time.time()))
    c.close()
    return {"ok": True}


@app.get("/situations/{sid}/stats")
async def situation_stats(sid: str):
    c = _sit_conn()
    rows = c.execute("SELECT choice, COUNT(*) FROM answers WHERE sid=? GROUP BY choice", (sid,)).fetchall()
    c.close()
    counts = [0, 0, 0, 0]
    for ch, n in rows:
        counts[ch] = n
    return {"n": sum(counts), "counts": counts}
