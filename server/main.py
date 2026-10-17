"""Aura API. Read → facts → rubric → Poise → voice.

Run: uvicorn main:app --port 8787
Env: DEEPGRAM_API_KEY, ANTHROPIC_API_KEY, ELEVENLABS_API_KEY, POISE_VOICE_ID (optional), SUPABASE_URL/SERVICE_KEY (optional, for persistence)
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import secrets
import shutil
import subprocess
import tempfile
import time
import uuid

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response, HTMLResponse, FileResponse, StreamingResponse, RedirectResponse
from fastapi import Request

from pipeline import lab, audio, face, rubric, poise, tts, converse, live, vision, duel, legal, referrals, clips, accounts, table, drafts, tribunal, direct
from training import store as train_store, learned

app = FastAPI(title="Kleos", version="0.2")


# ---------------------------------------------------------------- who is asking
# The app sends `Authorization: Bearer <token>` (a guest account is created on first launch); the site sends the
# `kleos_session` cookie after an emailed code. Client IPs come from the right-most X-Forwarded-For entry, the one
# Railway's proxy appends: anything to the left of it was written by the client and can be forged.

def _client_ip(request: Request) -> str:
    parts = [p.strip() for p in (request.headers.get("x-forwarded-for") or "").split(",") if p.strip()]
    if parts:
        return parts[-1][:64]
    return request.client.host if request.client else "?"


def _token(request: Request) -> str | None:
    h = request.headers.get("authorization") or ""
    if h[:7].lower() == "bearer ":
        return h[7:].strip() or None
    return request.cookies.get("kleos_session") or None


def _acct(request: Request, required: bool = True) -> dict | None:
    acc = accounts.from_token(_token(request))
    if acc is None and required:
        raise HTTPException(401, "Your session has expired. Close Kleos and open it again.")
    return acc


@app.exception_handler(accounts.Denied)
async def _denied(request: Request, exc: accounts.Denied):
    # 402: the app opens the paywall with the right headline for `reason`.
    return JSONResponse({"detail": exc.message, "reason": exc.reason}, status_code=402)


# ---------------------------------------------------------------- abuse limits
# Every expensive endpoint costs real money (models, voice). Cap requests per caller so nobody can use the server
# as a free AI proxy. Allowances per plan are enforced per account (pipeline/accounts.py); this is the outer fence.
# ElevenLabs' /llm calls are exempt (authenticated with the agent secret and bounded by the live session).
_EXPENSIVE = ("/read", "/fit", "/wardrobe", "/style", "/pressure", "/silence", "/scan", "/live/", "/session/", "/situations/", "/lesson", "/ledger", "/poise/", "/tribunal", "/direct/link", "/portrait", "/duel", "/moment", "/profile", "/clip/", "/redeem", "/challenge", "/auth/", "/table", "/waitlist", "/client/")
_LIMITS = ((120, 600), (1000, 86400))  # per caller: 120 per 10 minutes, 1000 per day
_AUTH_LIMITS = ((30, 600), (200, 86400))  # sign-in attempts per network
# New installs per network. Campus wifi and mobile carriers put thousands of phones behind one address, so this is
# generous; it only stops a script minting accounts for their free calls.
_GUEST_LIMITS = ((60, 600), (400, 86400))
_hits: dict[str, list[float]] = {}


_MAX_BODY = {"/poise/draft/extract": 14 * 1024 * 1024, "/fit": 40 * 1024 * 1024, "/wardrobe": 60 * 1024 * 1024, "/profile": 40 * 1024 * 1024}
_MAX_MEDIA = 250 * 1024 * 1024  # recorded takes and clips
_MAX_JSON = 1024 * 1024
_MEDIA_PATHS = ("/read", "/pressure", "/silence", "/scan", "/duel", "/moment", "/session/", "/live/", "/ledger", "/clip/", "/train/")


def _limit_key(request: Request, auth_path: bool) -> str:
    """Bucket by the verified account, or by network for sign-in and anything without a valid token.
    A made-up token never gets a fresh bucket."""
    if auth_path:
        return "a:" + _client_ip(request)
    tok = _token(request)
    acc = accounts.from_token(tok) if tok else None
    return ("acct:" + acc["id"]) if acc else ("ip:" + _client_ip(request))


def _prune_hits(now: float) -> None:
    for k in [k for k, v in _hits.items() if not v or now - v[-1] > 86400]:
        _hits.pop(k, None)
    if len(_hits) > 50000:  # still too many live buckets: drop the least recently used
        for k, _ in sorted(_hits.items(), key=lambda kv: kv[1][-1])[: len(_hits) - 40000]:
            _hits.pop(k, None)


class _RedactSecrets(logging.Filter):
    """The Sendblue webhook carries its secret in the path; keep it out of the access log."""
    _re = re.compile(r"(/direct/sendblue/)[^\s/?]+")

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple):
            record.args = tuple(self._re.sub(r"\1[redacted]", a) if isinstance(a, str) else a for a in record.args)
        elif isinstance(record.msg, str):
            record.msg = self._re.sub(r"\1[redacted]", record.msg)
        return True


logging.getLogger("uvicorn.access").addFilter(_RedactSecrets())


@app.middleware("http")
async def refund_failed(request: Request, call_next):
    """A metered request that fails doesn't use up an allowance (see accounts.PENDING)."""
    accounts.PENDING.set([])
    try:
        resp = await call_next(request)
    except BaseException:
        accounts.settle_request(failed=True)
        raise
    accounts.settle_request(failed=resp.status_code >= 400)
    return resp


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    path = request.url.path
    # Sizes: refuse oversized bodies before reading them (when the client says how big they are).
    if request.method == "POST":
        try:
            size = int(request.headers.get("content-length") or 0)
        except ValueError:
            size = 0
        cap = next((v for k, v in _MAX_BODY.items() if path.startswith(k)), _MAX_MEDIA if path.startswith(_MEDIA_PATHS) else _MAX_JSON)
        if size > cap and not path.startswith(("/direct/", "/llm/", "/revenuecat")):
            return JSONResponse({"detail": "That's too big to send."}, status_code=413)
        # The site signs in with a cookie. A cookie-only request must come from our own page (it sends this header),
        # so another site can't post as the person even if a browser relaxes SameSite.
        if request.cookies.get("kleos_session") and not request.headers.get("authorization") and request.headers.get("x-kleos-web") != "1" and not path.startswith(("/direct/", "/llm/", "/revenuecat", "/waitlist")):
            return JSONResponse({"detail": "Refused."}, status_code=403)
    limited = (request.method == "POST" and path.startswith(_EXPENSIVE)) or (request.method == "GET" and path.startswith("/tribunal/"))
    if limited and not path.startswith("/llm/"):
        auth_path = path.startswith(("/auth/", "/waitlist"))
        key = _limit_key(request, auth_path)
        if path == "/auth/guest":
            key = "g:" + _client_ip(request)
        limits = _GUEST_LIMITS if path == "/auth/guest" else _AUTH_LIMITS if auth_path else _LIMITS
        now = time.time()
        hits = [t for t in _hits.get(key, []) if now - t < limits[-1][1]]
        for n, window in limits:
            if sum(1 for t in hits if now - t < window) >= n:
                return JSONResponse({"detail": "Slow down a little. Try again in a few minutes."}, status_code=429)
        hits.append(now)
        _hits[key] = hits
        if len(_hits) > 50000:
            _prune_hits(now)
    return await call_next(request)


def _cap(text: str, n: int) -> str:
    """Free text goes to a model; keep it to a sane size so it can't carry a whole essay of instructions."""
    return (text or "")[:n]

AUDIO_DIR = os.environ.get("AURA_AUDIO_DIR", os.path.join(tempfile.gettempdir(), "aura-audio"))
os.makedirs(AUDIO_DIR, exist_ok=True)
PUBLIC_URL = os.environ.get("AURA_PUBLIC_URL", "http://localhost:8787")
ADMIN_KEY = os.environ.get("AURA_ADMIN_KEY", "")


# ---------------------------------------------------------------- the site (joinkleos.com)
# The waitlist page lives at /, its assets under /site/. The page is also previewed from claude.ai, so these
# two paths (and POST /waitlist) answer cross-origin; nothing else does.
_SITE = os.path.join(os.path.dirname(__file__), "site")
_WAITLIST = os.path.join(os.path.dirname(__file__), "data", "waitlist.jsonl")
_CORS = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type"}


@app.get("/", include_in_schema=False)
async def site_home():
    return FileResponse(os.path.join(_SITE, "index.html"), media_type="text/html", headers={"Cache-Control": "no-cache"})


@app.get("/site/{name}", include_in_schema=False)
async def site_asset(name: str):
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", name) or ".." in name:
        raise HTTPException(404)
    path = os.path.join(_SITE, name)
    if not os.path.isfile(path):
        raise HTTPException(404)
    return FileResponse(path, headers={**_CORS, "Cache-Control": "public, max-age=86400"})


# The release site (Collection · Poise · Members) lives in site/r/ and stays private until launch:
# /r/?k=<preview key> sets a cookie; without it /r/ answers 404. Only the key's hash is kept here.
_RELEASE = os.path.join(_SITE, "r")
_PREVIEW_SHA = "b1372a5d042aff5d9392f69e2888082d4f9cc16bbeb06d667d1a17b370c8ae34"
_TYPES = {".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".png": "image/png"}


def _preview_ok(value: str) -> bool:
    import hashlib, hmac
    return bool(value) and hmac.compare_digest(hashlib.sha256(value.encode()).hexdigest(), _PREVIEW_SHA)


@app.get("/r", include_in_schema=False)
async def release_root(request: Request):
    return RedirectResponse("/r/" + (("?" + request.url.query) if request.url.query else ""))


@app.get("/r/{path:path}", include_in_schema=False)
async def release(path: str, request: Request, k: str = ""):
    if k and _preview_ok(k):
        resp = RedirectResponse("/r/" + path)
        resp.set_cookie("kleos_preview", k, max_age=60 * 60 * 24 * 60, httponly=True, samesite="lax", secure=request.url.scheme == "https")
        return resp
    if not _preview_ok(request.cookies.get("kleos_preview", "")):
        raise HTTPException(404)
    path = path or "index.html"
    if not re.fullmatch(r"(img/(m/)?)?[A-Za-z0-9_.-]{1,80}", path) or ".." in path:
        raise HTTPException(404)
    full = os.path.join(_RELEASE, path)
    if not os.path.isfile(full):
        raise HTTPException(404)
    ext = os.path.splitext(full)[1]
    cache = "no-cache" if ext in (".html", ".js", ".css") else "private, max-age=86400"
    return FileResponse(full, media_type=_TYPES.get(ext), headers={"Cache-Control": cache, "X-Robots-Tag": "noindex"})


@app.options("/waitlist", include_in_schema=False)
async def waitlist_options():
    return Response(status_code=204, headers=_CORS)


@app.post("/waitlist")
async def waitlist(request: Request):
    body = await _body(request)
    email = str(body.get("email", "")).strip().lower()[:120]
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(422, "That email doesn't look right.")
    os.makedirs(os.path.dirname(_WAITLIST), exist_ok=True)
    rows = []
    if os.path.exists(_WAITLIST):
        with open(_WAITLIST) as f:
            rows = [json.loads(l) for l in f if l.strip()]
    for r in rows:
        if r.get("email") == email:
            return JSONResponse({"number": r["number"], "again": True}, headers=_CORS)
    number = len(rows) + 1
    with open(_WAITLIST, "a") as f:
        f.write(json.dumps({"number": number, "email": email, "at": time.time(), "source": str(body.get("source", ""))[:80]}) + "\n")
    return JSONResponse({"number": number}, headers=_CORS)


# ---------------------------------------------------------------- accounts

async def _body(request: Request) -> dict:
    try:
        b = await request.json()
        return b if isinstance(b, dict) else {}
    except Exception:
        return {}


def _signed_in(request: Request, token: str, acc: dict, switched: bool) -> JSONResponse:
    out = {"token": token, "account": accounts.status(acc), "switched": switched}
    resp = JSONResponse(out)
    if request.headers.get("x-kleos-web") == "1":
        # The site keeps the session in a cookie the page's script can't read.
        resp = JSONResponse({"account": out["account"], "switched": switched})
        resp.set_cookie("kleos_session", token, max_age=60 * 60 * 24 * 90, httponly=True, samesite="lax", secure=request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https")
    return resp


@app.post("/auth/guest")
async def auth_guest(request: Request):
    """First launch: a guest account. The app keeps the token in the keychain."""
    b = await _body(request)
    try:
        token, acc = accounts.guest(str(b.get("subject") or ""), _client_ip(request))
    except PermissionError as e:
        raise HTTPException(429, str(e))
    return {"token": token, "account": accounts.status(acc)}


@app.post("/auth/email/start")
async def auth_email_start(request: Request):
    b = await _body(request)
    try:
        return await asyncio.to_thread(accounts.email_start, str(b.get("email") or ""))  # SMTP can take seconds
    except ValueError as e:
        raise HTTPException(422, str(e))
    except PermissionError as e:
        raise HTTPException(429, str(e))
    except RuntimeError as e:
        raise HTTPException(502, str(e))


@app.post("/auth/email/verify")
async def auth_email_verify(request: Request):
    b = await _body(request)
    current = _acct(request, required=False)
    try:
        token, acc, switched = accounts.email_verify(str(b.get("email") or ""), str(b.get("code") or ""), current)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except PermissionError as e:
        raise HTTPException(429, str(e))
    return _signed_in(request, token, acc, switched)


@app.post("/auth/apple/nonce")
async def auth_apple_nonce():
    """Sign in with Apple, step one: a single-use nonce the app hands to Apple."""
    return {"nonce": accounts.apple_nonce()}


@app.post("/auth/apple")
async def auth_apple(request: Request):
    b = await _body(request)
    current = _acct(request, required=False)
    try:
        token, acc, switched = await asyncio.to_thread(accounts.apple_sign_in, str(b.get("identity_token") or ""), current, str(b.get("name") or ""), str(b.get("nonce") or ""))
    except ValueError as e:
        raise HTTPException(422, str(e))
    return _signed_in(request, token, acc, switched)


@app.post("/auth/logout")
async def auth_logout(request: Request):
    tok = _token(request)
    if tok:
        accounts.revoke(tok)
    resp = JSONResponse({"ok": True})
    resp.delete_cookie("kleos_session")
    return resp


_refreshed: dict[str, float] = {}


async def _status(acc: dict, refresh: bool) -> dict:
    """The account, asking RevenueCat directly only when asked, at most every 30 s, and never on the event loop."""
    if refresh and time.time() - _refreshed.get(acc["id"], 0) > 30:
        _refreshed[acc["id"]] = time.time()
        if len(_refreshed) > 20000:
            _refreshed.clear()
        return await asyncio.to_thread(accounts.status, acc, True)
    return accounts.status(acc)


@app.get("/account")
async def account_get(request: Request, refresh: int = 0):
    acc = _acct(request)
    out = await _status(acc, bool(refresh))
    out["summary"] = accounts.summary(acc)
    return JSONResponse(out, headers={"Cache-Control": "no-store"})


@app.post("/account")
async def account_update(request: Request):
    acc = _acct(request)
    b = await _body(request)
    if "name" in b:
        acc = accounts.set_name(acc, str(b.get("name") or ""))
    return accounts.status(acc)


@app.post("/account/summary")
async def account_summary(request: Request):
    """The app's Index, streak and recent reads, so the Members page on the site can show them."""
    acc = _acct(request)
    accounts.save_summary(acc, await _body(request))
    return {"ok": True}


@app.post("/account/plan/refresh")
async def account_plan_refresh(request: Request):
    """After a purchase or restore: ask RevenueCat directly instead of waiting for the webhook."""
    acc = _acct(request)
    return await _status(acc, True)


@app.post("/account/plan/dev")
async def account_plan_dev(request: Request):
    """Phone test builds without RevenueCat. Only works while KLEOS_DEV_PLANS=1 is set on the server; remove it at launch."""
    if os.environ.get("KLEOS_DEV_PLANS") != "1":
        raise HTTPException(404)
    acc = _acct(request)
    plan = str((await _body(request)).get("plan") or "free")
    accounts.set_plan(acc["id"], plan, time.time() + 7 * 86400 if plan != "free" else None, "dev")
    return accounts.status(accounts.get(acc["id"]))


@app.post("/account/delete")
async def account_delete(request: Request):
    """Delete the account and everything the server keeps for it. A subscription is cancelled in Apple's settings."""
    acc = _acct(request)
    subj = accounts.subject_of(acc)
    n = duel.delete_for(subj)
    for fn in (referrals.delete_for, train_store.withdraw):
        try:
            fn(subj)
        except Exception:
            pass
    for fn in (tribunal.delete_for, direct.delete_for):
        try:
            fn(acc["id"])
        except Exception:
            pass
    accounts.delete(acc)
    resp = JSONResponse({"deleted": True, "duels": n})
    resp.delete_cookie("kleos_session")
    return resp


@app.get("/admin/waitlist")
async def admin_waitlist(request: Request):
    _admin(request.headers.get("x-admin-key", ""))
    if not os.path.exists(_WAITLIST):
        return []
    with open(_WAITLIST) as f:
        return [json.loads(l) for l in f if l.strip()]


@app.get("/health")
async def health():
    return {"ok": True, "t": time.time()}


async def _save(upload: UploadFile, suffix: str) -> str:
    path = tempfile.mktemp(suffix=suffix)
    with open(path, "wb") as f:
        shutil.copyfileobj(upload.file, f)
    return path


async def measure(video_path: str, with_face: bool = True, face_mesh: bool = True) -> tuple[dict, dict]:
    wav = await asyncio.to_thread(audio.extract_wav, video_path)  # ffmpeg off the event loop: live calls share it
    dg_task = audio.transcribe(wav)
    face_task = asyncio.to_thread(face.analyse, video_path, 6.0, face_mesh) if with_face else None
    dg = await dg_task
    v = await asyncio.to_thread(audio.analyse, wav, dg)
    p = await face_task if face_task else face.PresenceFacts()
    os.remove(wav)
    return v.to_dict(), p.to_dict()


@app.post("/read")
async def read(
    request: Request,
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
    acc = _acct(request)
    accounts.spend(acc, "scans")
    path = await _save(video, ".mp4")
    try:
        try:
            hist = json.loads(history or "[]")
        except ValueError:
            hist = []
        hist = [h for h in hist if isinstance(h, dict)][:3] if isinstance(hist, list) else []
        prompt_text, name = _cap(prompt_text, 300), _cap(name, 40)
        v, p = await measure(path)
        if v["word_count"] < 6:
            raise HTTPException(422, "We couldn't hear enough. Try again, closer to the mic.")
        scores = rubric.score(audio.VoiceFacts(**v), face.PresenceFacts(**p), read_axis=None, n_prior_reads=len(hist))
        facts = {"voice": {k: x for k, x in v.items() if k != "transcript"}, "presence": p}
        # learned perception model (if trained) blends into the rubric, weighted by how well it predicts real panels
        scores["axes"], perceived = learned.blend(scores["axes"], facts)
        scores["index"] = round(sum(scores["axes"][k] * w for k, w in rubric.AXIS_WEIGHT.items()))
        # Only the opt-in recorded on the server counts, and clips are filed under this account's own subject.
        if accounts.used(acc["id"], "train_consent", "all") >= 1:
            try:
                train_store.save_clip(video_path=path, subject_id=accounts.subject_of(acc), prompt_text=prompt_text, features=facts, rubric=scores)
            except Exception:
                pass
        out = await poise.verdict(prompt_text=prompt_text, voice=v, presence=p, scores=scores, history=hist, name=name, intensity=intensity, deep=deep)
        if out.get("safety"):
            return JSONResponse({"safety": True, "script": out.get("script", "")}, status_code=200)
        # What they said, judged (labelled as such); everything else on the report is measured.
        landed = out.get("landed") if isinstance(out.get("landed"), dict) else {}
        if isinstance(landed.get("score"), (int, float)):
            scores["axes"]["read"] = rubric.clamp(landed["score"])
            scores["index"] = round(sum(scores["axes"][k] * w for k, w in rubric.AXIS_WEIGHT.items()))
        ms = lab.measures(v, p)
        vid = f"v_{uuid.uuid4().hex[:12]}"
        # Poise's voice streams on first play from a signed link, instead of making them wait for the whole file.
        audio_url = _voice_url(out["script"], tts.VOICE_ID) if voice else None
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
            "landed": {"score": scores["axes"]["read"], "why": str(landed.get("why") or "")[:160]} if landed else None,
            "measures": ms,
            "lab": lab.summary(ms),
            "transcript": v.get("transcript", ""),
            "prompt": prompt_text,
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
async def pressure(request: Request, audio_file: UploadFile = File(..., alias="audio"), prompt_text: str = Form(...), seconds: int = Form(20)):
    accounts.spend(_acct(request), "scans")
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
async def silence(request: Request, video: UploadFile = File(...)):
    accounts.spend(_acct(request), "scans")
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


def _tts_sig(text: str, voice_id: str | None, fast: int) -> str:
    import hmac as _hm
    key = (os.environ.get("KLEOS_SIGNING_KEY") or live.llm_secret()).encode()
    return _hm.new(key, f"{voice_id or ''}|{int(bool(fast))}|{text}".encode(), hashlib.sha256).hexdigest()[:20]


@app.get("/tts")
async def tts_get(text: str, voice_id: str | None = None, fast: int = 0, sig: str = ""):
    """Voice lines the server itself wrote (replies, Poise's reads). Only signed URLs are served, so this can't be
    used as a free text-to-speech service. Cached after first play; the first play streams straight from ElevenLabs."""
    import hmac as _hm
    if len(text) > 1200 or not sig or not _hm.compare_digest(str(sig).encode(), _tts_sig(text, voice_id, fast).encode()):
        raise HTTPException(403)
    h = hashlib.sha1(f"{voice_id}|{fast}|{text}".encode()).hexdigest()[:16]
    p = os.path.join(AUDIO_DIR, f"tts_{h}.mp3")
    if os.path.exists(p):
        with open(p, "rb") as f:
            return Response(f.read(), media_type="audio/mpeg")

    async def gen():
        buf = bytearray()
        async for chunk in tts.stream(text, voice_id, fast=bool(fast)):
            buf.extend(chunk)
            yield chunk
        with open(p, "wb") as f:
            f.write(bytes(buf))

    return StreamingResponse(gen(), media_type="audio/mpeg")


# ---------------- training: consent, panel rating, admin ----------------

@app.post("/train/withdraw")
async def train_withdraw(request: Request):
    acc = _acct(request)
    return {"removed": train_store.withdraw(accounts.subject_of(acc))}


@app.post("/train/consent")
async def train_consent(request: Request):
    """The opt-in from onboarding or You, recorded against the account (clips are only kept for opted-in accounts)."""
    acc = _acct(request)
    on = bool((await _body(request)).get("on"))
    with accounts.db() as c:
        c.execute("insert into usage(account_id, period, kind, n) values (?,?,?,?) on conflict(account_id, period, kind) do update set n=excluded.n", (acc["id"], "all", "train_consent", 1 if on else 0))
    if not on:
        train_store.withdraw(accounts.subject_of(acc))
    return {"on": on}


def _admin(key: str):
    import hmac as _hm
    if not ADMIN_KEY or len(ADMIN_KEY) < 16 or not _hm.compare_digest((key or "").encode(), ADMIN_KEY.encode()):
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

def _voice_url(text: str, voice_id: str, fast: bool = False) -> str:
    from urllib.parse import quote
    f = 1 if fast else 0
    return f"{PUBLIC_URL}/tts?voice_id={voice_id}&text={quote(text)}" + ("&fast=1" if fast else "") + f"&sig={_tts_sig(text, voice_id, f)}"


# ---------------------------------------------------------------- live (full-duplex) conversations

_LIVE_AGENT: dict = {}


async def _agent_id() -> str:
    if not _LIVE_AGENT.get("id"):
        _LIVE_AGENT["id"] = await live.ensure_agent(PUBLIC_URL)
    return _LIVE_AGENT["id"]


def _warm_analysers() -> None:
    """First read after a deploy was ~15s slower: librosa/numba compile and the face model load on first use.
    Do that once at startup on a two-second synthetic clip, so the first real user doesn't pay for it."""
    tmp = tempfile.mkdtemp(prefix="kleos_warm_")
    try:
        vid = os.path.join(tmp, "w.mp4")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=s=320x568:r=15:d=2", "-f", "lavfi", "-i", "sine=f=180:d=2",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", vid], check=True, timeout=60)
        wav = audio.extract_wav(vid)
        dg = {"results": {"channels": [{"alternatives": [{"transcript": "warm up the reader now", "words": [
            {"word": w, "punctuated_word": w, "start": 0.2 + i * 0.3, "end": 0.4 + i * 0.3, "confidence": 0.99} for i, w in enumerate("warm up the reader now".split())]}]}]}}
        try:
            audio.analyse(wav, dg)
        except Exception as e:
            print("warm audio:", repr(e)[:120])
        try:
            face.analyse(vid, 6.0, True)
        except Exception as e:
            print("warm face:", repr(e)[:120])
        print("analysers warm")
    except Exception as e:
        print("warm-up skipped:", repr(e)[:120])
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


@app.on_event("startup")
async def _warm_startup():
    asyncio.get_running_loop().run_in_executor(None, _warm_analysers)  # background; never delays start


def _sweep_audio(max_age_s: float = 48 * 3600) -> int:
    """Generated voice files (Poise's reads, cached replies) are temporary: anything older than two days goes."""
    n = 0
    now = time.time()
    for name in os.listdir(AUDIO_DIR):
        fp = os.path.join(AUDIO_DIR, name)
        try:
            if os.path.isfile(fp) and now - os.path.getmtime(fp) > max_age_s:
                os.remove(fp)
                n += 1
        except OSError:
            pass
    return n


@app.on_event("startup")
async def _sweeper():
    async def loop():
        while True:
            try:
                await asyncio.to_thread(_sweep_audio)
                await asyncio.to_thread(clips.gc)
            except Exception as e:
                print("sweep failed:", repr(e)[:120])
            await asyncio.sleep(3600)
    _BG.add(asyncio.create_task(loop()))


@app.on_event("startup")
async def _live_startup():
    if os.environ.get("ELEVENLABS_API_KEY") and PUBLIC_URL.startswith("https://"):
        try:
            await _agent_id()
        except Exception as e:  # never block the server on this
            print("live agent setup failed:", e)


def _scene_gates(acc: dict, b: dict) -> None:
    """Plan features inside a call request: running a scene back, retrying a moment, rehearsing a real situation."""
    if b.get("attempt_of") or b.get("resume"):
        accounts.require_tier(acc, "retry")
    lesson = b.get("lesson") if isinstance(b.get("lesson"), dict) else None
    if lesson and lesson.get("rehearse"):
        accounts.require_tier(acc, "rehearse")


def _spoke(s: dict) -> bool:
    return any(t["role"] == "user" and t["text"].strip() and not t.get("context") for t in s["turns"]) or bool(s.get("pending_user"))


def _one_call_at_a_time(acc: dict) -> None:
    """One open call per account: starting a new call hangs up the old one (from then on it only says goodbye)
    and settles it, so two phones can't run calls side by side on one allowance, and backing out of a call
    and starting another never gets stuck. A call that was still live is charged up to now; one that had gone
    quiet (the app crashed, the phone died) is charged up to its last activity."""
    now = time.time()
    for old in [x for x in list(converse.SESSIONS.values()) if x.get("account") == acc["id"] and not x.get("settled")]:
        live_now = not old.get("closed") and old.get("heard") and now - old.get("active_at", old["created"]) < 60
        old["closed"] = True
        _settle(old, _spoke(old), ended_at=now if live_now else old.get("active_at"))


def _owned(acc: dict, sid) -> dict | None:
    """A previous call this account may build on (run it back, retry a moment). Anyone else's is refused."""
    if not sid:
        return None
    prev = converse.SESSIONS.get(str(sid))
    if prev and prev.get("account") and prev["account"] != acc["id"]:
        raise HTTPException(403, "That call isn't yours.")
    return prev


def _start_scene(acc: dict, b: dict, *, live_call: bool) -> tuple[dict, dict]:
    """Check the allowance, open the scene, count it. Returns (scene, allowance)."""
    if b.get("resume") is not None and not isinstance(b.get("resume"), dict):
        raise HTTPException(422, "Bad request.")
    for k in ("lesson", "user", "profile"):
        if b.get(k) is not None and not isinstance(b.get(k), dict):
            b[k] = None
    _owned(acc, b.get("attempt_of"))
    _owned(acc, (b.get("resume") or {}).get("session"))
    _one_call_at_a_time(acc)
    _scene_gates(acc, b)
    allowance = accounts.live_allowance(acc, onboarding=bool(b.get("goal")), daily=bool(b.get("daily_id")), poise=bool(b.get("poise")))
    try:
        kw = dict(room_id=b.get("room_id"), goal=b.get("goal"), lesson=b.get("lesson"), floor_id=b.get("floor_id"), daily_id=b.get("daily_id"), attempt_of=b.get("attempt_of"), tone=b.get("tone", "real"), profile=b.get("profile"), user=b.get("user"), resume=b.get("resume") if isinstance(b.get("resume"), dict) else None, allow_s=allowance["allow_s"])
        if live_call:
            out = converse.start(**kw, pressure=int(b.get("pressure", 2)), max_turns=b.get("max_turns"), live=True, poise=bool(b.get("poise")))
        else:
            out = converse.start(**kw, pressure=int(b.get("pressure", 1)), max_turns=b.get("max_turns") or (8 if (b.get("floor_id") or b.get("daily_id")) else None))
    except KeyError as e:
        raise HTTPException(410, f"That scene isn't available: {str(e).strip(chr(39))}")
    except ValueError as e:
        raise HTTPException(400, str(e))
    sid = out["session_id"]
    s = converse.SESSIONS[sid]
    s.update(account=acc["id"], allowance=allowance, subject=accounts.subject_of(acc), active_at=time.time())
    accounts.charge_start(acc, allowance)
    return out, allowance


def _session_for(request: Request, sid: str) -> dict:
    s = converse.SESSIONS.get(sid)
    if s is None:
        raise HTTPException(410, "That call expired. Start a new one.")
    acc = _acct(request, required=False)
    if s.get("account") and (not acc or acc["id"] != s["account"]):
        raise HTTPException(403, "That call isn't yours.")
    return s


@app.post("/live/start")
async def live_start(request: Request):
    """Start a live voice session: our session + a one-time ElevenLabs token + per-session overrides."""
    acc = _acct(request)
    b = await _body(request)
    out, allowance = _start_scene(acc, b, live_call=True)
    sid = out["session_id"]
    try:
        agent_id = await _agent_id()
        token = await live.conversation_token(agent_id)
    except Exception as e:
        _LIVE_AGENT.pop("id", None)  # re-create next time
        print("live start failed:", repr(e)[:300])
        accounts.charge_end(acc, allowance, 0, spoke=False)  # nothing happened: give it back
        converse.SESSIONS.pop(sid, None)
        raise HTTPException(502, "Couldn't open the live line. Try again in a moment.")
    return {**out, "agent_id": agent_id, "conversation_token": token, "overrides": {"agent": {"prompt": {"prompt": f"[[kleos:{sid}]]"}, "firstMessage": out["opener"]}, "tts": {"voiceId": out["character"]["voice"]}}}


@app.get("/live/{sid}/state")
async def live_state(sid: str, request: Request):
    s = _session_for(request, sid)
    chars = [t for t in s["turns"] if t["role"] == "char"]
    last = chars[-1] if chars else {}
    return {"done": bool(s.get("done")), "leaving": bool(last.get("leaving")), "turns": sum(1 for t in s["turns"] if t["role"] == "user"), "interest": last.get("interest"), "trust": last.get("trust")}


def _settle(s: dict, spoke: bool, ended_at: float | None = None) -> None:
    """Charge the call once: seconds for paid plans; a call where nothing was said is given back.
    `ended_at`: for calls that were never hung up properly, the last moment we heard from them."""
    if s.get("settled") or not s.get("account") or not s.get("allowance"):
        return
    s["settled"] = True
    acc = accounts.get(s["account"])
    if acc:
        end = min(time.time(), (ended_at + 15) if ended_at else time.time())
        accounts.charge_end(acc, s["allowance"], max(0.0, end - s["created"] - 3), spoke)


# Sessions that expire without a read are settled on the way out (their unused minutes come back).
converse.ON_DROP = lambda s: _settle(s, _spoke(s), ended_at=s.get("active_at"))


async def _wait_for_camera(s: dict, limit: float) -> None:
    """The app uploads the camera stills alongside /finish, not before it. Give them a bounded wait."""
    ev = s.setdefault("camera_ready", asyncio.Event())
    try:
        await asyncio.wait_for(ev.wait(), timeout=limit)
    except asyncio.TimeoutError:
        print("camera stills didn't arrive in time; reading without them")


async def _read_back(sid: str, cid: str | None, voice: bool, frames: bool = False) -> dict:
    s = converse.SESSIONS[sid]
    spoke = _spoke(s)
    _settle(s, spoke)
    if s["spec"].get("poise"):
        # A talk with Poise has no score. Poise leaves a short note for the chat; ElevenLabs forgets the call.
        if cid:
            asyncio.create_task(live.delete_conversation(cid))
        turns = [{"role": t["role"], "text": t["text"]} for t in s["turns"]]
        out = {"poise": True, "turns": turns}
        if spoke:
            try:
                out.update(await converse.poise_call_note(s))
            except Exception as e:
                print("poise note failed:", repr(e)[:160])
        s["evaluation"] = out
        return out
    if s.get("pending_user"):  # he hung up mid-thought after an "Mm-hm": his words still count
        frag = s.pop("pending_user")
        s["turns"].append({"role": "user", "text": frag, "facts": converse.text_facts(frag)})
    camera = asyncio.create_task(_wait_for_camera(s, 8)) if frames and not s.get("camera") else None
    analysis = None
    if cid:
        # The recording takes ElevenLabs a few seconds to finalise. It's measured while the read is being
        # written; the read waits for it only up to KLEOS_AUDIO_WAIT seconds in total, then goes without voice
        # facts. The analysis keeps running in the background so the recording is still deleted.
        analysis = asyncio.create_task(live.analyse_call(sid, cid))
        s["analysis_task"] = analysis
    if camera:
        await camera  # usually already done: it ran alongside the recording's analysis
    out = await converse.evaluate(sid, detail=False, audio=analysis, audio_budget=float(os.environ.get("KLEOS_AUDIO_WAIT", "6")))
    if s.get("subject") and not out.get("insufficient"):
        try:
            referrals.activate(s["subject"])
        except Exception as e:
            print("referral activation failed:", e)
    if voice and out.get("script"):
        out["script_audio"] = _voice_url(out["script"], tts.VOICE_ID)
    s["evaluation"] = out
    return out


@app.post("/client/error")
async def client_error(request: Request):
    """A screen in the app crashed. Logged (message, top of the stack, screen) so it can be fixed; nothing kept."""
    b = await _body(request)
    msg = re.sub(r"\s+", " ", str(b.get("message") or ""))[:300]
    stack = re.sub(r"\s+", " ", str(b.get("stack") or ""))[:900]
    print(f"client error on {str(b.get('path') or '')[:80]!r}: {msg} | {stack}")
    return {"ok": True}


@app.post("/live/{sid}/mic")
async def live_mic(sid: str, request: Request):
    """The app heard nothing from the mic for several seconds and tried to revive it. Log what the engine reported."""
    try:
        _session_for(request, sid)
    except HTTPException:
        return {"ok": True}  # only the call's own app gets to write to the log
    b = await _body(request)
    print("mic diag", sid, json.dumps(b, ensure_ascii=True)[:400])
    return {"ok": True}


@app.post("/live/{sid}/finish")
async def live_finish(sid: str, request: Request, voice: bool = True):
    """After hang-up: measure the recording, then Poise evaluates. Runs as a job so slow reads never
    hit a request timeout: returns the read if it's ready within ~25s, otherwise {"pending": true}
    and the app polls GET /live/{sid}/result."""
    b = await _body(request)
    s = _session_for(request, sid)
    s["closed"] = True  # anything ElevenLabs still sends for this call is ignored
    if s.get("evaluation"):
        return s["evaluation"]
    job = s.get("read_job")
    if job is None or (job.done() and job.exception()):
        job = asyncio.create_task(_read_back(sid, b.get("conversation_id"), voice, frames=b.get("frames") is True))
        s["read_job"] = job
    try:
        return await asyncio.wait_for(asyncio.shield(job), timeout=25)
    except asyncio.TimeoutError:
        return {"pending": True}
    except KeyError as e:
        raise HTTPException(410, str(e))


@app.get("/live/{sid}/result")
async def live_result(sid: str, request: Request):
    s = _session_for(request, sid)
    if s.get("evaluation"):
        return s["evaluation"]
    job = s.get("read_job")
    if job is None:
        raise HTTPException(404, "No read in progress.")
    if job.done() and job.exception():
        raise HTTPException(500, "Poise couldn't read that call. Try again.")
    return {"pending": True}


@app.post("/llm/v1/chat/completions")
async def live_llm(request: Request):
    """ElevenLabs calls this for every character reply. Our engine answers, streamed."""
    import hmac as _hm
    if not _hm.compare_digest(str(request.headers.get("x-kleos-key") or "").encode(), live.llm_secret().encode()):
        raise HTTPException(401)
    b = await _body(request)
    msgs = b.get("messages") or []
    sid = live.session_from_messages(msgs)
    text = live.last_user_text(msgs)
    s = converse.SESSIONS.get(sid) if sid else None
    if s is not None:
        s["active_at"], s["heard"] = time.time(), True
        left = converse.time_left(s)
        if left is not None and left < -90:
            s["closed"] = True  # well past the allowance: the character only says goodbye from here
    if not sid or sid not in converse.SESSIONS:
        async def bye():
            yield 'data: {"choices":[{"index":0,"delta":{"content":"Sorry, I lost you there."},"finish_reason":null}]}\n\n'
            yield "data: [DONE]\n\n"
        return StreamingResponse(bye(), media_type="text/event-stream")
    # The agent can ask for a reply after a long silence; then the last message is ours, not his.
    last_role = next((m.get("role") for m in reversed(msgs) if m.get("role") in ("user", "assistant")), "user")
    if last_role != "user":
        text = ""
    live.rollback_if_retry(sid, text)
    return StreamingResponse(live.openai_stream(sid, text, b.get("model") or "kleos-character"), media_type="text/event-stream")


@app.post("/session/start")
async def session_start(request: Request):
    """Turn-based fallback (no live audio on this phone): same scenes, same allowance."""
    acc = _acct(request)
    b = await _body(request)
    out, _ = _start_scene(acc, b, live_call=False)
    out["opener_audio"] = _voice_url(out["opener"], out["character"]["voice"])
    return out


@app.post("/session/{sid}/turn")
async def session_turn(sid: str, request: Request, audio_file: UploadFile | None = File(None, alias="audio"), video: UploadFile | None = File(None), interrupted: str = Form("0")):
    """One user turn. Send `audio` (voice mode) or `video` (camera mode: face + eyes are measured too)."""
    s_ = _session_for(request, sid)
    if s_.get("closed") and s_.get("settled"):
        raise HTTPException(410, "This call ended when another one started.")
    s_.update(active_at=time.time(), heard=True)
    if video is not None:
        path = await _save(video, ".mp4")
        with_face = True
    elif audio_file is not None:
        path = await _save(audio_file, ".m4a")
        with_face = False
    else:
        raise HTTPException(422, "send audio or video")
    # Fast path: transcribe, compute word-level facts, let the character reply.
    # Deep voice (pitch, pace timeline, fades) and face analysis run in the background and land before evaluation.
    wav = await asyncio.to_thread(audio.extract_wav, path)  # off the event loop: other people's live calls stream on it
    try:
        dg = await audio.transcribe(wav)
    except Exception:
        os.remove(wav)
        os.remove(path)
        raise HTTPException(502, "Transcription hiccup. Go again, it doesn't count.")
    quick = audio.quick_facts(dg, await asyncio.to_thread(audio.duration_of, wav)).to_dict()
    text = quick.get("transcript") or ""
    if len(text.split()) < 2:
        os.remove(wav)
        os.remove(path)
        raise HTTPException(422, "Didn't catch that. Try again, a little closer to the mic.")
    facts = {k: x for k, x in quick.items() if k != "transcript"}
    if interrupted == "1":
        facts["interrupted"] = True

    async def deep():
        try:
            v = await asyncio.to_thread(audio.analyse, wav, dg)
            d = {k: x for k, x in v.to_dict().items() if k != "transcript"}
            if with_face:
                pf = await asyncio.to_thread(face.analyse, path, 6.0, True)
                d["presence"] = pf.to_dict()
            return d
        finally:
            for f in (wav, path):
                if os.path.exists(f):
                    os.remove(f)

    try:
        r = await converse.turn(sid, text, facts)
    except KeyError as e:
        raise HTTPException(410, str(e))
    converse.attach_deep(sid, converse.last_user_index(sid), asyncio.ensure_future(deep()))
    brief = {k: facts.get(k) for k in ("duration_s", "wpm", "filler_count", "hedge_count", "apology_count", "first_word_s", "ended_mid_sentence", "repeat_count")}
    return {"user_text": text, "facts": brief, "reply": r["reply"], "reply_audio": _voice_url(r["reply"], r["voice"], fast=True), "done": r["done"], "turn": r["turn"], "interest": r["interest"], "trust": r["trust"]}


@app.post("/session/{sid}/evaluate")
async def session_evaluate(sid: str, request: Request, voice: bool = True):
    s = _session_for(request, sid)
    _settle(s, _spoke(s))
    try:
        out = await converse.evaluate(sid, detail=False)  # the detail follows; the app picks it up from /live/{sid}/result
    except KeyError as e:
        raise HTTPException(410, str(e))
    if voice and out.get("script"):
        out["script_audio"] = _voice_url(out["script"], tts.VOICE_ID)
    return out


@app.post("/lesson")
async def lesson(request: Request):
    acc = _acct(request)
    b = await _body(request)
    rehearse = str(b.get("unit", "")).strip().lower() == "rehearse"
    if rehearse:
        accounts.require_tier(acc, "rehearse")
    accounts.spend(acc, "lessons")
    try:
        user = converse.clean_user(b.get("user"))
        out = await converse.generate_lesson(unit=_cap(b.get("unit", ""), 60), objective=_cap(b.get("objective", ""), 1200), weak=[_cap(str(x), 40) for x in (b.get("weak") or [])][:4], avoid=[_cap(str(x), 120) for x in (b.get("avoid") or [])][:8], pressure=int(b.get("pressure", 1)), unit_id=_cap(b.get("unit_id", ""), 24), tone=b.get("tone", "real"), dates=user.get("dates"))
    except Exception:
        accounts.refund(acc, "lessons")
        raise
    if rehearse:
        out["rehearse"] = True
    return out


@app.post("/ledger")
async def make_ledger(request: Request, text: str = Form(""), context: str = Form(""), tone: str = Form("real"), user: str = Form("{}"), audio_file: UploadFile | None = File(None, alias="audio")):
    acc = _acct(request)
    accounts.spend(acc, "poise")
    try:
        return await _ledger(text, context, tone, user, audio_file)
    except Exception:
        accounts.refund(acc, "poise")
        raise


async def _ledger(text: str, context: str, tone: str, user: str, audio_file):
    story = _cap(text, 3000)
    context = _cap(context, 1500)
    try:
        user_d = json.loads(user or "{}")
    except Exception:
        user_d = {}
    if audio_file is not None:
        path = await _save(audio_file, ".m4a")
        try:
            v, _ = await measure(path, with_face=False)
            story = _cap(v.get("transcript") or text, 3000)
        finally:
            os.remove(path)
    if len(story.split()) < 3:
        raise HTTPException(422, "I didn’t catch enough of that. Say it again, a bit slower." if audio_file is not None else "Give me a bit more: what happened, or what do you want to know?")
    out = await converse.ledger(story, context, tone, user_d)
    out["story"] = story
    return out


# ---------------------------------------------------------------- tribunals

def _tribunal(fn):
    """Round rules become HTTP answers: 403 not a member, 404 unknown code, 409 wrong phase, 410 expired."""
    try:
        return fn()
    except tribunal.Refused as e:
        raise HTTPException(e.status, e.message)


@app.post("/tribunal")
async def tribunal_create(request: Request):
    acc = _acct(request)
    b = await _body(request)
    accounts.spend(acc, "duels")
    try:
        return _tribunal(lambda: tribunal.create(acc, format=str(b.get("format") or ""), topic=str(b.get("topic") or ""), tone=str(b.get("tone") or "real"), name=str(b.get("name") or acc.get("name") or ""), side=str(b.get("side") or ""), watchers=b.get("watchers") is True))
    except Exception:
        accounts.refund(acc, "duels")
        raise


@app.get("/tribunal/{code}")
async def tribunal_get(code: str, request: Request):
    acc = _acct(request, required=False)
    return JSONResponse(_tribunal(lambda: tribunal.view(code, acc)), headers={"Cache-Control": "no-store"})


@app.post("/tribunal/{code}/join")
async def tribunal_join(code: str, request: Request):
    acc = _acct(request)
    b = await _body(request)
    seat = "audience" if b.get("seat") == "audience" else "b"
    return _tribunal(lambda: tribunal.join(code, acc, name=str(b.get("name") or acc.get("name") or ""), side=str(b.get("side") or ""), seat=seat, accept=b.get("accept") is True))


@app.post("/tribunal/{code}/submit")
async def tribunal_submit(code: str, request: Request):
    acc = _acct(request)
    b = await _body(request)
    out, ready = _tribunal(lambda: tribunal.submit(code, acc, kind=str(b.get("kind") or ""), text=str(b.get("text") or "")))
    if ready:
        tribunal.start_judging(out["code"])
    return out


@app.post("/tribunal/{code}/judge")
async def tribunal_rejudge(code: str, request: Request):
    """If a ruling failed, either participant can ask again. Members only; finished rounds return their result."""
    acc = _acct(request)
    v = _tribunal(lambda: tribunal.view(code, acc))
    if not v.get("me") or v["me"]["seat"] not in ("a", "b"):
        raise HTTPException(403, "Only the two people in this tribunal can ask for the ruling.")
    if v["state"] == "judging":
        tribunal.start_judging(v["code"])
    return v


@app.post("/tribunal/{code}/leave")
async def tribunal_leave(code: str, request: Request):
    acc = _acct(request)
    return _tribunal(lambda: tribunal.leave(code, acc))


@app.post("/tribunal/{code}/report")
async def tribunal_report(code: str, request: Request):
    acc = _acct(request)
    b = await _body(request)
    return _tribunal(lambda: tribunal.report(code, acc, str(b.get("reason") or "")))


@app.post("/tribunal/{code}/rematch")
async def tribunal_rematch(code: str, request: Request):
    acc = _acct(request)
    accounts.spend(acc, "duels")
    try:
        return _tribunal(lambda: tribunal.rematch(code, acc))
    except Exception:
        accounts.refund(acc, "duels")
        raise


# ---------------------------------------------------------------- Poise Direct (Black)

@app.get("/direct/status")
async def direct_status(request: Request):
    return JSONResponse(direct.status(_acct(request)), headers={"Cache-Control": "no-store"})


@app.post("/direct/link")
async def direct_link(request: Request):
    """A single-use code to text from the phone being linked. The text itself is the proof of ownership."""
    acc = _acct(request)
    if not direct.enabled():
        raise HTTPException(404, "Poise Direct isn't open yet.")
    accounts.require_tier(acc, "direct")
    return direct.link_code(acc)


@app.post("/direct/unlink")
async def direct_unlink(request: Request):
    acc = _acct(request)
    direct.unlink(acc["id"])
    return direct.status(acc)


@app.post("/direct/context")
async def direct_context(request: Request):
    acc = _acct(request)
    return direct.set_context(acc, await _body(request))


@app.get("/direct/history")
async def direct_history(request: Request):
    return JSONResponse({"messages": direct.history(_acct(request))}, headers={"Cache-Control": "no-store"})


@app.post("/direct/history/delete")
async def direct_history_delete(request: Request):
    acc = _acct(request)
    direct.clear_history(acc["id"])
    return {"deleted": True}


async def _direct_reply(to: str, text: str) -> None:
    await direct.send(to, text)


@app.post("/direct/twilio", include_in_schema=False)
async def direct_twilio(request: Request):
    """Twilio SMS webhook. Signed with the account's auth token; anything unsigned is refused."""
    if direct.channel() != "sms":
        raise HTTPException(404)
    form = dict((await request.form()).items())
    url = os.environ.get("KLEOS_DIRECT_WEBHOOK_URL") or (PUBLIC_URL.rstrip("/") + "/direct/twilio")
    if not direct.twilio_signature_ok(url, form, request.headers.get("x-twilio-signature", "")):
        raise HTTPException(403)
    msg = direct.parse_twilio(form)
    if msg and direct.first_time(msg["event_id"]):
        direct.handle(msg, _direct_reply)
    return Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", media_type="text/xml")


@app.post("/direct/sendblue/{token}", include_in_schema=False)
async def direct_sendblue(token: str, request: Request):
    """Sendblue (iMessage) webhook. The secret is part of the URL you register with Sendblue."""
    if direct.channel() != "imessage" or not direct.sendblue_path_ok(token):
        raise HTTPException(404)
    msg = direct.parse_sendblue(await _body(request))
    if msg and direct.first_time(msg["event_id"]):
        direct.handle(msg, _direct_reply)
    return {"ok": True}


# ---------------------------------------------------------------- before I send this

EXTRACTS_PER_DAY = int(os.environ.get("KLEOS_EXTRACTS_PER_DAY", "25"))


@app.post("/poise/draft")
async def draft_review(request: Request):
    """A draft message (or the conversation it answers), read before it's sent. Nothing is stored."""
    acc = _acct(request)
    b = await _body(request)
    draft_txt, convo = str(b.get("draft") or ""), b.get("convo") or []
    if not draft_txt.strip() and not drafts.clean_convo(convo):
        raise HTTPException(422, "Paste the message, or add the conversation it answers.")
    accounts.spend(acc, "poise")
    try:
        return await drafts.review(
            draft=draft_txt, convo=convo, to=str(b.get("to") or ""), intent=str(b.get("intent") or ""),
            outcome=str(b.get("outcome") or ""), tone="unfiltered" if b.get("tone") == "unfiltered" else "real",
            user=b.get("user") if isinstance(b.get("user"), dict) else {},
        )
    except ValueError as e:
        accounts.refund(acc, "poise")
        raise HTTPException(422, str(e))
    except Exception as e:
        accounts.refund(acc, "poise")
        print("draft review failed:", repr(e)[:200])
        raise HTTPException(502, "Poise couldn't read that one. Try again.")


@app.post("/poise/draft/extract")
async def draft_extract(request: Request, image: UploadFile = File(...)):
    """A screenshot of a conversation, turned into who-said-what. Read in memory, never saved."""
    acc = _acct(request)
    # count first, then check, so parallel uploads can't all slip under the cap
    accounts.add_use(acc["id"], "extract", 1, accounts.day())
    if accounts.used(acc["id"], "extract", accounts.day()) > EXTRACTS_PER_DAY:
        accounts.add_use(acc["id"], "extract", -1, accounts.day())
        raise HTTPException(429, "That's a lot of screenshots today. Paste the text instead.")
    raw = await image.read(12 * 1024 * 1024 + 1)
    if len(raw) > 12 * 1024 * 1024:
        raise HTTPException(413, "That image is too big.")
    jpg = await _jpeg(raw)
    del raw
    if not jpg:
        raise HTTPException(422, "Couldn't open that screenshot. Try again.")
    try:
        return await drafts.extract(jpg)
    except Exception as e:
        print("extract failed:", repr(e)[:200])
        raise HTTPException(502, "Couldn't read that screenshot. Paste the text instead.")


MAX_PIXELS = 40_000_000  # a 48MP phone photo is fine; a decompression bomb isn't


async def _jpeg(raw: bytes) -> bytes | None:
    """Decode off the event loop: a big HEIC can take a second of CPU."""
    return await asyncio.to_thread(_as_jpeg, raw)


def _as_jpeg(raw: bytes) -> bytes | None:
    """Phones send PNG screenshots and HEIC photos, often mislabelled. Normalise to a JPEG the model accepts."""
    import io
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    try:
        import pillow_heif  # type: ignore
        pillow_heif.register_heif_opener()
    except Exception:
        pass
    try:
        im = Image.open(io.BytesIO(raw))
        w, h = im.size  # read from the header, before any pixels are decoded
        if w * h > MAX_PIXELS or w > 12000 or h > 12000:
            print("image refused: too many pixels", w, h)
            return None
        if im.format == "JPEG":
            im.draft("RGB", (1800, 1800))  # let the decoder downscale as it reads
        im = im.convert("RGB")
        im.thumbnail((1800, 1800))
        out = io.BytesIO()
        im.save(out, "JPEG", quality=85)
        return out.getvalue()
    except Exception as e:
        print("image decode failed:", repr(e)[:120])
        return None


@app.get("/privacy", response_class=HTMLResponse)
async def privacy_page():
    return legal.privacy()


@app.get("/terms", response_class=HTMLResponse)
async def terms_page():
    return legal.terms()


@app.post("/portrait")
async def make_portrait(request: Request):
    """Kleos Black: a deep read across every conversation (the app sends compact summaries; nothing is stored)."""
    accounts.require_tier(_acct(request), "portrait")
    b = await _body(request)
    hist = b.get("history") or []
    if len(hist) < 3:
        raise HTTPException(422, "Have at least three conversations first, so there's something real to read.")
    return await converse.portrait(hist, b.get("tone", "real"))


@app.post("/duel")
async def duel_create(request: Request, video: UploadFile = File(...), topic_id: str = Form(...), name: str = Form(""), tone: str = Form("real"), subject_id: str = Form("")):
    """Debate Duel, first take. Returns a code to send to the opponent."""
    acc = _acct(request)
    accounts.spend(acc, "duels")
    subject_id = accounts.subject_of(acc)
    path = await _save(video, ".mp4")
    try:
        v, p = await measure(path)
    finally:
        os.remove(path)
    if (v.get("word_count") or 0) < 8:
        raise HTTPException(422, "Couldn't hear enough of your argument. Try again, closer to the mic.")
    try:
        return duel.create(topic_id, name, tone, v, p, subject_id)
    except KeyError as e:
        raise HTTPException(404, str(e).strip("'\""))
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@app.get("/duel/{code}")
async def duel_get(code: str):
    try:
        return duel.get(code)
    except KeyError as e:
        raise HTTPException(404, str(e).strip("'\""))


@app.post("/duel/{code}/answer")
async def duel_answer(code: str, request: Request, video: UploadFile = File(...), name: str = Form(""), subject_id: str = Form("")):
    """Debate Duel, second take. Poise judges both."""
    acc = _acct(request)
    accounts.spend(acc, "duels")
    subject_id = accounts.subject_of(acc)
    try:
        duel.get(code)
    except KeyError as e:
        raise HTTPException(404, str(e).strip("'\""))
    path = await _save(video, ".mp4")
    try:
        v, p = await measure(path)
    finally:
        os.remove(path)
    if (v.get("word_count") or 0) < 8:
        raise HTTPException(422, "Couldn't hear enough of your argument. Try again, closer to the mic.")
    return await duel.answer(code, name, v, p, subject_id)


# ---------------------------------------------------------------- camera during live calls

@app.post("/live/{sid}/frames")
async def live_frames(sid: str, request: Request, frames: list[UploadFile] = File(...)):
    """Optional: stills from the front camera during the call (one every few seconds). Measured for eye contact
    and stillness, then deleted. Sent before /finish so the read can use them."""
    s = _session_for(request, sid)
    tmp = tempfile.mkdtemp(prefix="kleos_cam_")
    ready = s.setdefault("camera_ready", asyncio.Event())
    try:
        n = 0
        for f in frames[:60]:
            raw = await f.read()
            jpg = await _jpeg(raw)
            if not jpg:
                continue
            with open(os.path.join(tmp, f"f{n:03d}.jpg"), "wb") as fh:
                fh.write(jpg)
            n += 1
        if n < 3:
            return {"camera": None}
        vid = os.path.join(tmp, "cam.mp4")
        await asyncio.to_thread(subprocess.run, ["ffmpeg", "-y", "-loglevel", "error", "-framerate", "1", "-i", os.path.join(tmp, "f%03d.jpg"),
                                                 "-vf", "scale=640:-2,format=yuv420p", "-c:v", "libx264", "-preset", "ultrafast", vid], check=True, timeout=60)
        p = await asyncio.to_thread(face.analyse, vid, 1.0, True)
        d = p.to_dict()
        if not d.get("available") or d.get("face_found_ratio", 0) < 0.3:
            return {"camera": None}
        s["camera"] = {k: d.get(k) for k in ("frames_analysed", "face_found_ratio", "eye_contact_ratio", "contact_breaks", "gaze_down_ratio", "head_motion", "shoulder_tilt_deg", "lean", "smile_ratio")}
        return {"camera": {"eye_contact": d.get("eye_contact_ratio")}}
    except Exception as e:
        print("camera analysis failed:", repr(e)[:200])
        return {"camera": None}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        ready.set()  # the read (which may already be waiting) can go


# ---------------------------------------------------------------- Aura Replay clips

@app.post("/clip/{sid}")
async def make_clip(sid: str, request: Request):
    s = _session_for(request, sid)
    if not s.get("evaluation") or s["evaluation"].get("poise") or s["evaluation"].get("insufficient"):
        raise HTTPException(410, "That call has expired. Clips can be made for about two hours after a call.")
    task = s.get("analysis_task")
    if task is not None and not task.done():
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=20)
        except Exception:
            pass
    await converse.full_read(sid, timeout=25)  # the clip is cut around the turning point, which is in the detail
    try:
        path = await clips.make(sid, s, s["evaluation"], tts_bytes=lambda t: tts.speak(t))
    except Exception as e:
        print("clip failed:", repr(e)[:200])
        raise HTTPException(502, "Couldn't make the clip. Try again.")
    return {"url": f"{PUBLIC_URL}/clips/{os.path.basename(path)}"}


@app.get("/clips/{name}")
async def get_clip(name: str):
    if not re.fullmatch(r"c_[0-9a-f]{24}\.mp4", name):
        raise HTTPException(404)
    p = os.path.join(clips.CLIP_DIR, name)
    if not os.path.exists(p):
        raise HTTPException(404, "That clip has expired.")
    return FileResponse(p, media_type="video/mp4", filename="kleos-aura-replay.mp4")


# ---------------------------------------------------------------- referrals and ambassadors

@app.get("/me")
async def me(request: Request):
    """Invite code and earned call credits."""
    acc = _acct(request)
    out = referrals.me(accounts.subject_of(acc))
    out["credits"] = accounts.credits_left(acc)
    return out


@app.post("/redeem")
async def redeem(request: Request):
    acc = _acct(request)
    b = await _body(request)
    try:
        return referrals.redeem(accounts.subject_of(acc), str(b.get("code") or ""))
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/webhooks/revenuecat")
async def revenuecat_webhook(request: Request):
    expected = os.environ.get("REVENUECAT_WEBHOOK_AUTH", "")
    import hmac as _hm
    got = request.headers.get("authorization", "")
    if not expected or not (_hm.compare_digest(got.encode(), expected.encode()) or _hm.compare_digest(got.encode(), f"Bearer {expected}".encode())):
        raise HTTPException(401)
    body = await _body(request)
    out = {"referral": referrals.revenue_event(body)}
    try:
        out["plan"] = accounts.revenuecat_event((body or {}).get("event") or {})
    except Exception as e:
        print("plan sync from webhook failed:", repr(e)[:160])
    return out


@app.post("/admin/ambassadors")
async def admin_add_ambassador(request: Request):
    _admin(request.headers.get("x-admin-key", ""))
    b = await request.json()
    try:
        a = referrals.create_ambassador(b.get("code", ""), b.get("name", ""), float(b.get("pct", referrals.AMBASSADOR_PCT)))
    except ValueError as e:
        raise HTTPException(422, str(e))
    k = referrals.dashboard_key(a["code"])
    return {**a, "invite_link": f"{PUBLIC_URL}/i/{a['code']}", "dashboard": f"{PUBLIC_URL}/a/{a['code']}?k={k}"}


@app.get("/admin/ambassadors")
async def admin_list_ambassadors(request: Request):
    _admin(request.headers.get("x-admin-key", ""))
    return referrals.all_ambassadors()


def _page(title: str, body: str) -> HTMLResponse:
    return HTMLResponse(f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Geist:wght@400;500&family=Geist+Mono&display=swap" rel="stylesheet">
<style>body{{margin:0;background:#1608F2;color:#fff;font-family:Geist,system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center}}
main{{max-width:420px;padding:32px 24px}}h1{{font-family:'Instrument Serif',serif;font-weight:400;font-size:52px;line-height:1;margin:12px 0 16px}}
.k{{font-family:'Geist Mono',monospace;font-size:12px;letter-spacing:2px;opacity:.75}}p{{color:#D6D2FF;line-height:1.5}}
a.b{{display:block;text-align:center;background:#fff;color:#1608F2;text-decoration:none;font-weight:500;padding:16px;border-radius:999px;margin-top:20px}}
.code{{font-family:'Geist Mono',monospace;font-size:32px;letter-spacing:6px;margin:8px 0}}table{{width:100%;border-collapse:collapse;margin-top:16px}}
td{{padding:10px 0;border-top:1px solid rgba(255,255,255,.25)}}td:last-child{{text-align:right;font-family:'Geist Mono',monospace}}</style></head>
<body><main>{body}</main></body></html>""")


@app.get("/i/{code}")
async def invite_page(code: str):
    import html as _h
    c = _h.escape(re.sub(r"[^A-Za-z0-9]", "", code).upper()[:16])
    store = os.environ.get("KLEOS_APP_STORE_URL", "https://apps.apple.com/")
    return _page("You're invited to Kleos", f"""<div class="k">KLEOS · INVITE</div><h1>Someone thinks you should hear the truth.</h1>
<p>Kleos puts you in live conversations and tells you honestly how you came across. Use this code in the app for {referrals.INVITEE_CALLS} extra live calls.</p>
<div class="code">{c}</div><a class="b" href="kleos://invite/{c}">Open in Kleos</a><a class="b" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.5)" href="{store}">Get the app</a>""")


@app.get("/a/{code}")
async def ambassador_page(code: str, k: str = ""):
    import html as _h
    if not hmac_eq(k, referrals.dashboard_key(code)):
        raise HTTPException(404)
    st = referrals.ambassador_stats(code)
    if not st:
        raise HTTPException(404)
    rows = "".join(f"<tr><td>{a}</td><td>{b}</td></tr>" for a, b in [("Code", st["code"]), ("Signed up with your code", st["signups"]), ("Finished a call", st["active"]), ("Subscribed", st["paying"]), ("Earned so far", f"${st['earned']:.2f}"), ("Ready to pay out", f"${st['payable']:.2f}")])
    return _page("Kleos ambassador", f"""<div class="k">KLEOS · AMBASSADOR</div><h1>{_h.escape(st['name'] or st['code'])}</h1>
<p>You earn {int(st['pct']*100)}% of what each subscriber you bring pays in their first 30 days, after Apple's fee, up to ${referrals.AMBASSADOR_CAP_USD:.0f} per subscriber. Payouts are monthly once the 30 days have passed.</p>
<table>{rows}</table><p style="margin-top:20px">Your link: {PUBLIC_URL}/i/{st['code']}</p>""")


def hmac_eq(a: str, b: str) -> bool:
    import hmac as _hm
    return _hm.compare_digest((a or "").encode(), (b or "").encode())


# ---------------------------------------------------------------- scene challenges

@app.post("/challenge")
async def challenge_create(request: Request):
    acc = _acct(request)
    b = await _body(request)
    try:
        return referrals.challenge_create(b.get("kind", ""), str(b.get("ref_id", "")), str(b.get("title", "")), accounts.subject_of(acc), str(b.get("name", "")), int(b.get("rating", 0)), str(b.get("verdict", "")))
    except (ValueError, TypeError) as e:
        raise HTTPException(422, str(e))


@app.get("/challenge/{code}")
async def challenge_get(code: str):
    try:
        return referrals.challenge_get(code)
    except KeyError as e:
        raise HTTPException(404, str(e))


@app.post("/challenge/{code}/answer")
async def challenge_answer(code: str, request: Request):
    acc = _acct(request)
    b = await _body(request)
    try:
        return referrals.challenge_answer(code, accounts.subject_of(acc), str(b.get("name", "")), int(b.get("rating", 0)), str(b.get("verdict", "")))
    except KeyError as e:
        raise HTTPException(404, str(e))
    except (ValueError, TypeError) as e:
        raise HTTPException(409, str(e))


@app.post("/privacy/delete")
async def privacy_delete(request: Request):
    """'Delete everything' in the app: removes this account's duels, invites and training clips from the server
    (the account itself stays; /account/delete removes that too)."""
    acc = _acct(request)
    sid = accounts.subject_of(acc)
    n = duel.delete_for(sid)
    try:
        referrals.delete_for(sid)
    except Exception:
        pass
    try:
        train_store.withdraw(sid)
    except Exception:
        pass
    return {"deleted_duels": n}


@app.post("/moment")
async def rate_moment(request: Request, video: UploadFile = File(...), note: str = Form(""), tone: str = Form("real"), render: str = Form("0")):
    """Rate a Clip / Aura Check: anything filmed or uploaded, scored for aura beat by beat. Behaviour only.
    The clip is deleted right after, unless render=1: then it's kept only until the rated video is made."""
    acc = _acct(request)
    accounts.spend(acc, "clips")
    path = await _save(video, ".mp4")
    keep = False
    try:
        try:
            out = await vision.rate_moment(path, _cap(note, 400), tone)
        except Exception:
            accounts.refund(acc, "clips")
            raise
        if out.get("declined"):
            accounts.refund(acc, "clips")
        keep = render == "1" and not out.get("declined") and bool(out.get("lines"))
        if keep:
            clips.gc()
            vid = secrets.token_hex(6)
            shutil.move(path, clips.scan_src(vid))
    finally:
        for p_ in ((path + ".wav",) if keep else (path, path + ".wav")):
            if os.path.exists(p_):
                os.remove(p_)
    if out.get("declined"):
        raise HTTPException(422, out.get("reason") or "Poise won't rate that one.")
    if keep:
        out["video_id"] = vid
        task = asyncio.create_task(clips.make_scan(vid, dict(out), kind="moment"))
        _BG.add(task)
        task.add_done_callback(_BG.discard)
    return out


@app.post("/fit")
async def read_fit(request: Request, photos: list[UploadFile] = File(...), tone: str = Form("real"), lane: str = Form("")):
    """Fit check: an outfit photo, rated honestly, with fixes and the colours that suit the wearer. Not stored."""
    acc = _acct(request)
    accounts.spend(acc, "fits")
    try:
        return await _fit(photos, tone, lane)
    except Exception:
        accounts.refund(acc, "fits")
        raise


async def _fit(photos, tone, lane):
    imgs = []
    for f in photos[:3]:
        jpg = await _jpeg(await f.read())
        if jpg:
            imgs.append((jpg, "image/jpeg"))
    if not imgs:
        raise HTTPException(422, "Couldn't open that photo. Try again.")
    out = await vision.read_fit(imgs, tone, _cap(lane, 40))
    if out.get("declined"):
        raise HTTPException(422, out.get("reason") or "Poise won't rate that one.")
    return out


@app.post("/style/profile")
async def style_profile_ep(request: Request):
    """The style quiz → a path to aura: signature direction, principles, core pieces, palette."""
    accounts.spend(_acct(request), "fits")
    b = await _body(request)
    clean = lambda xs, n: [_cap(str(x), 40) for x in (xs or [])][:n]
    answers = {"styles": clean(b.get("lanes"), 6), "colours_he_owns": clean(b.get("colours"), 10), "his_week": clean(b.get("life"), 8),
               "how_he_feels_about_his_wardrobe": _cap(str(b.get("feeling") or ""), 80), "wants_to_come_across_as": _cap(str(b.get("presence") or ""), 60)}
    if not answers["styles"]:
        raise HTTPException(422, "Pick at least one style.")
    return await vision.style_profile(answers, b.get("tone", "real"))


@app.post("/wardrobe/scan")
async def wardrobe_scan(request: Request, photos: list[UploadFile] = File(...)):
    """Catalogue clothes from photos. Photos aren't stored; the app keeps them on the phone."""
    accounts.require_tier(_acct(request), "wardrobe")
    imgs = []
    for f in photos[:8]:
        jpg = await _jpeg(await f.read())
        if jpg:
            imgs.append((jpg, "image/jpeg"))
    if not imgs:
        raise HTTPException(422, "Couldn't open those photos.")
    return await vision.scan_wardrobe(imgs)


@app.post("/wardrobe/build")
async def wardrobe_build(request: Request):
    """Two outfits from the wardrobe the app sends (descriptions only), for an occasion and a presence."""
    accounts.require_tier(_acct(request), "wardrobe")
    b = await _body(request)
    items = [
        {"id": str(x.get("id"))[:40], "category": str(x.get("category"))[:12], "name": _cap(str(x.get("name") or ""), 60),
         "colour": _cap(str((x.get("colour") or {}).get("name") or ""), 30), "formality": int(x.get("formality") or 3)}
        for x in (b.get("items") or [])[:150] if isinstance(x, dict) and x.get("id")
    ]
    if len(items) < 2:
        raise HTTPException(422, "Add at least a top, a bottom and shoes first.")
    return await vision.build_fits(items, _cap(b.get("occasion") or "", 120), _cap(b.get("presence") or "", 80), b.get("colouring"), b.get("tone", "real"), _cap(b.get("lane") or "", 40))


@app.post("/profile")
async def read_profile(request: Request, shots: list[UploadFile] = File(...), handle: str = Form(""), tone: str = Form("real")):
    """Profile Read: screenshots of an Instagram profile, read the way a stranger would."""
    acc = _acct(request)
    accounts.spend(acc, "profiles")
    try:
        out = await _profile_read(shots, handle, tone)
    except Exception:
        accounts.refund(acc, "profiles")
        raise
    return out


async def _profile_read(shots, handle, tone):
    imgs = []
    for f in shots[:6]:
        jpg = await _jpeg(await f.read())
        if jpg:
            imgs.append((jpg, "image/jpeg"))
    if not imgs:
        raise HTTPException(422, "Couldn't open those images. Try screenshots of the profile instead.")
    out = await vision.read_profile(imgs, handle, tone)
    if out.get("declined"):
        raise HTTPException(422, out.get("reason") or "Poise won't read that one.")
    return out


@app.post("/scan")
async def scan(request: Request, video: UploadFile = File(...), prompt_text: str = Form(...), subject_consent: str = Form("0"), is_self: str = Form("0"), name: str = Form(""), render: str = Form("0")):
    """Back-camera Aura Scan / uploads. Consent required. Others get delivery-only mode (no face mesh).
    The take is deleted right after the read, unless render=1: then it is kept only until the rated video is made
    (seconds), and that video is deleted within two hours."""
    if subject_consent != "1":
        raise HTTPException(403, "The person on camera has to confirm they're in and 18+.")
    accounts.spend(_acct(request), "scans")
    prompt_text = _cap(prompt_text, 300)
    name = _cap(name, 40)
    path = await _save(video, ".mp4")
    keep = render == "1"
    try:
        v, p = await measure(path, with_face=True, face_mesh=(is_self == "1"))
    except Exception:
        os.remove(path)
        raise
    if v["word_count"] < 4:
        os.remove(path)
        raise HTTPException(422, "Not enough speech to read. Say the prompt out loud, then answer it.")
    if keep:
        clips.gc()
        vid = secrets.token_hex(6)
        shutil.move(path, clips.scan_src(vid))
    else:
        os.remove(path)
    vf = audio.VoiceFacts(**v)
    pf = face.PresenceFacts(**p)
    axes = {"delivery": rubric.voice_score(vf), "composure": rubric.composure_score(vf), "command": rubric.command_score(vf), "posture": rubric.presence_score(pf) if pf.available or p.get("frames_analysed") else 50}
    score = round(sum(axes.values()) / len(axes))
    tiers = [(90, "Gravity"), (75, "Magnetic"), (60, "Composed"), (45, "Present"), (30, "Faint"), (0, "Static")]
    tier = next(t for m, t in tiers if score >= m)
    card = await converse._json_call(converse.M_EVAL, """You write the playful result card for an 'Aura Scan' party game. Return JSON: {"archetype": "The ..." (2-3 words, fun, flattering-ish, never about looks), "best_moment": str (<= 12 words, cites a quote from the transcript), "roast": str (<= 14 words, affectionate, about delivery only, never looks/body/identity)}. No slang like alpha/sigma/mog/rizz. Swearing in the take is normal: quote it as said if it was the moment, never mark it down or comment on language.""", json.dumps({"prompt": prompt_text, "transcript": v["transcript"], "fillers": v["filler_count"], "hedges": v["hedge_count"], "wpm": v["wpm"], "score": score}), max_tokens=400, think=False)
    out = {"score": score, "tier": tier, "axes": axes, "name": name, "transcript": v["transcript"], "counts": {"fillers": v["filler_count"], "hedges": v["hedge_count"], "wpm": v["wpm"]}, **card}
    if keep:
        out["video_id"] = vid
        task = asyncio.create_task(clips.make_scan(vid, {**out, "prompt": prompt_text}))
        _BG.add(task)  # keep a reference so the render isn't garbage-collected mid-way
        task.add_done_callback(_BG.discard)
    return out


_BG: set = set()


@app.get("/scan/video/{vid}/status")
async def scan_video_status(vid: str):
    if not re.fullmatch(r"[0-9a-f]{12}", vid):
        return {"expired": True}
    out = clips.scan_out(vid)
    return {"ready": os.path.exists(out), "failed": os.path.exists(out + ".failed"),
            "expired": not (os.path.exists(out) or os.path.exists(out + ".failed") or os.path.exists(clips.scan_src(vid)))}


@app.get("/scan/video/{vid}")
async def scan_video(vid: str):
    """The rated Aura Scan video: 200 with the file when ready, 202 while it renders."""
    if not re.fullmatch(r"[0-9a-f]{12}", vid):
        raise HTTPException(404, "No video.")
    out = clips.scan_out(vid)
    if os.path.exists(out):
        return FileResponse(out, media_type="video/mp4", filename="kleos-aura-scan.mp4")
    if os.path.exists(out + ".failed"):
        raise HTTPException(500, "Couldn't make that video. The card still saves.")
    if os.path.exists(clips.scan_src(vid)):
        return JSONResponse({"pending": True}, status_code=202)
    raise HTTPException(404, "That video has expired. Videos are kept for two hours.")


# ---------------------------------------------------------------- The Table (party game)

@app.post("/table/verdict")
async def table_verdict(request: Request):
    """Poise's verdict at the end of a round of The Table. The game itself runs on the phone."""
    acc = _acct(request)
    accounts.spend(acc, "table")
    b = await _body(request)
    try:
        return await table.verdict(b.get("players") or [], str(b.get("tone") or "real"))
    except ValueError as e:
        accounts.refund(acc, "table")
        raise HTTPException(422, str(e))
    except Exception:
        accounts.refund(acc, "table")
        raise


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
    b = await _body(request)
    choice = b.get("choice") if isinstance(b.get("choice"), int) and not isinstance(b.get("choice"), bool) else -1
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
