"""Poise Direct (Kleos Black): text Poise from your phone's messages.

Off unless KLEOS_DIRECT_CHANNEL is set to "sms" (Twilio) or "imessage" (Sendblue). One channel at a time.

Linking proves you own the number, so a typed number is never trusted:
  the app asks for a single-use code (10 minutes) -> you text "LINK 12345678" to the Kleos number from your phone ->
  the inbound message's sender is bound to your account. Only a hash of the number is kept; replies go back to the
  number the message came from, so Kleos never needs to store it in the clear. Text UNLINK (or unlink in the app)
  to undo it; linking a number again moves it.

Every inbound message:
  verify the provider's signature (or the secret webhook path) -> drop duplicates (provider message id) ->
  answer 200 at once -> in the background, per account and in order: entitlement (Black, checked on the server),
  rate limits and a global daily cap, then one bounded task (draft read, or a Poise answer) -> reply.
Nothing here sends a message to anyone but the person who texted, and only in reply. Numbers that aren't linked get
at most one reply a day (so a spoofed sender can't be used to pump texts), failed link attempts are throttled per
sender and overall, every outgoing text counts against a daily ceiling, and STOP is never answered (the carrier
confirms opt-outs itself).

Context: Poise Direct sees only what the person allowed in the app (what's coming up, their taste), plus the last
few messages of this thread. Never coaching history, wardrobe photos or other people's chats. The thread is kept
30 days and can be deleted from the app.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from urllib.parse import quote

from . import accounts, converse, drafts

DATA = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
DB = os.path.join(DATA, "direct.db")
CODE_TTL = 10 * 60
KEEP = 30 * 86400
PER_HOUR = int(os.environ.get("KLEOS_DIRECT_PER_HOUR", "30"))
PER_DAY = int(os.environ.get("KLEOS_DIRECT_PER_DAY", "120"))
GLOBAL_DAILY_CAP = int(os.environ.get("KLEOS_DIRECT_DAILY_CAP", "3000"))
OUT_DAILY_CAP = int(os.environ.get("KLEOS_DIRECT_OUT_CAP", str(GLOBAL_DAILY_CAP * 2)))  # every text we send, any reason
LINK_FAILS_PER_SENDER = 5  # a day
LINK_FAILS_OVERALL = 300  # a day, across every sender: past this, linking pauses until tomorrow
DEDUPE_KEEP = 30 * 86400
MAX_REPLY = 900
_locks: dict[str, asyncio.Lock] = {}
_tasks: set = set()


def channel() -> str:
    c = os.environ.get("KLEOS_DIRECT_CHANNEL", "").strip().lower()
    return c if c in ("sms", "imessage") else ""


def enabled() -> bool:
    # The phone-number hashes are keyed by KLEOS_SIGNING_KEY, so it has to be set (and stable) before anyone links.
    return bool(channel()) and bool(number()) and len(os.environ.get("KLEOS_SIGNING_KEY", "")) >= 32


def number() -> str:
    return os.environ.get("TWILIO_FROM", "") if channel() == "sms" else os.environ.get("SENDBLUE_FROM", "") if channel() == "imessage" else ""


def db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    c = sqlite3.connect(DB, timeout=10)
    c.row_factory = sqlite3.Row
    c.executescript(
        """
        create table if not exists links (addr_hash text primary key, account_id text unique, channel text, created real);
        create table if not exists codes (code_hash text primary key, account_id text, expires real, used real);
        create table if not exists events (event_id text primary key, created real);
        create table if not exists messages (id integer primary key autoincrement, account_id text, role text, text text, created real);
        create table if not exists context (account_id text primary key, body text, updated real);
        create table if not exists counters (key text primary key, n integer);
        create table if not exists notices (account_id text, kind text, day text, primary key (account_id, kind, day));
        """
    )
    return c


def _salt() -> bytes:
    s = os.environ.get("KLEOS_SIGNING_KEY", "")
    if not s:
        raise RuntimeError("KLEOS_SIGNING_KEY is required for Poise Direct")
    return hashlib.sha256(("direct|" + s).encode()).digest()


def normalize(addr: str) -> str:
    a = str(addr or "").strip().lower()
    if "@" in a:
        return a  # iMessage can come from an Apple ID email
    digits = re.sub(r"[^\d+]", "", a)
    return digits if digits.startswith("+") else "+" + digits


def addr_hash(addr: str) -> str:
    return hmac.new(_salt(), normalize(addr).encode(), hashlib.sha256).hexdigest()


# ------------------------------------------------------------------ linking, from the app

def link_code(acc: dict) -> dict:
    """A single-use code to text from the phone being linked."""
    code = f"{secrets.randbelow(90_000_000) + 10_000_000}"  # 8 digits: guessing one in ten minutes is hopeless
    with db() as c:
        c.execute("delete from codes where account_id=? or expires < ?", (acc["id"], time.time()))
        c.execute("insert into codes values (?,?,?,?)", (hashlib.sha256(code.encode()).hexdigest(), acc["id"], time.time() + CODE_TTL, None))
    body = f"LINK {code}"
    to = number()
    return {"code": code, "text": body, "to": to, "expires_in": CODE_TTL, "sms": f"sms:{to}&body={quote(body)}" if to else None}


def status(acc: dict) -> dict:
    with db() as c:
        link = c.execute("select channel, created from links where account_id=?", (acc["id"],)).fetchone()
        ctx = c.execute("select body from context where account_id=?", (acc["id"],)).fetchone()
    allowed = json.loads(ctx["body"]).get("allow", {}) if ctx else {}
    return {"enabled": enabled(), "channel": channel() or None, "number": number() or None, "linked": bool(link), "linked_at": link["created"] if link else None,
            "allow": {"occasion": bool(allowed.get("occasion")), "style": bool(allowed.get("style"))}, "black": accounts.plan_of(acc) == "black"}


def unlink(account_id: str) -> None:
    with db() as c:
        c.execute("delete from links where account_id=?", (account_id,))


def set_context(acc: dict, body: dict) -> dict:
    """What the person lets Poise Direct know. Only the parts they switched on are stored."""
    asked = body.get("allow") if isinstance(body.get("allow"), dict) else {}
    allow = {"occasion": asked.get("occasion") is True, "style": asked.get("style") is True}
    keep = {"allow": allow}
    if allow["occasion"] and isinstance(body.get("occasion"), str):
        keep["occasion"] = body["occasion"][:300]
    if allow["style"] and isinstance(body.get("style"), str):
        keep["style"] = body["style"][:300]
    with db() as c:
        c.execute("insert into context values (?,?,?) on conflict(account_id) do update set body=excluded.body, updated=excluded.updated", (acc["id"], json.dumps(keep), time.time()))
    return status(acc)


def history(acc: dict) -> list[dict]:
    with db() as c:
        c.execute("delete from messages where created < ?", (time.time() - KEEP,))
        rows = c.execute("select role, text, created from messages where account_id=? order by id desc limit 60", (acc["id"],)).fetchall()
    return [dict(r) for r in reversed(rows)]


def clear_history(account_id: str) -> None:
    with db() as c:
        c.execute("delete from messages where account_id=?", (account_id,))


def delete_for(account_id: str) -> None:
    with db() as c:
        for t in ("links", "codes", "messages", "context", "notices"):
            c.execute(f"delete from {t} where account_id=?", (account_id,))


# ------------------------------------------------------------------ providers

class Inbound(dict):
    """{event_id, sender, text}"""


def twilio_signature_ok(url: str, params: dict, signature: str) -> bool:
    token = os.environ.get("TWILIO_AUTH_TOKEN", "")
    if not token or not signature:
        return False
    data = url + "".join(k + str(params[k]) for k in sorted(params))
    expected = base64.b64encode(hmac.new(token.encode(), data.encode(), hashlib.sha1).digest()).decode()
    return hmac.compare_digest(expected.encode(), str(signature).encode())


def parse_twilio(params: dict) -> Inbound | None:
    if not params.get("MessageSid") or not params.get("From"):
        return None
    return Inbound(event_id="tw:" + params["MessageSid"], sender=params["From"], text=str(params.get("Body") or ""))


def sendblue_path_ok(token: str) -> bool:
    want = os.environ.get("SENDBLUE_WEBHOOK_TOKEN", "")
    return bool(want) and len(want) >= 24 and hmac.compare_digest(want.encode(), str(token or "").encode())


def parse_sendblue(body: dict) -> Inbound | None:
    if body.get("is_outbound") or not body.get("message_handle") or not body.get("from_number"):
        return None
    if body.get("group_id"):
        return None  # groups aren't supported in the pilot
    return Inbound(event_id="sb:" + str(body["message_handle"]), sender=str(body["from_number"]), text=str(body.get("content") or ""))


async def send(to: str, text: str) -> None:
    """Reply to the person who texted. Credentials and provider calls stay on the server."""
    import httpx

    text = text.strip()[:MAX_REPLY]
    if os.environ.get("KLEOS_DIRECT_DRY_RUN") == "1":  # local development: print instead of sending
        print(f"[direct dry-run] to …{normalize(to)[-4:]}: {text}")
        return
    if channel() == "sms":
        sid, token = os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"]
        data = {"To": to, "Body": text}
        if os.environ.get("TWILIO_MESSAGING_SERVICE_SID"):
            data["MessagingServiceSid"] = os.environ["TWILIO_MESSAGING_SERVICE_SID"]
        else:
            data["From"] = os.environ["TWILIO_FROM"]
        async with httpx.AsyncClient(timeout=20) as h:
            r = await h.post(f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json", data=data, auth=(sid, token))
            r.raise_for_status()
    elif channel() == "imessage":
        api = os.environ.get("SENDBLUE_API", "https://api.sendblue.co/api").rstrip("/")
        headers = {"sb-api-key-id": os.environ["SENDBLUE_KEY_ID"], "sb-api-secret-key": os.environ["SENDBLUE_SECRET"], "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=20) as h:
            r = await h.post(f"{api}/send-message", headers=headers, json={"number": to, "from_number": os.environ["SENDBLUE_FROM"], "content": text})
            r.raise_for_status()


# ------------------------------------------------------------------ inbound

def first_time(event_id: str) -> bool:
    """At-least-once delivery: the same message can arrive twice. Only the first is processed (and charged)."""
    with db() as c:
        c.execute("delete from events where created < ?", (time.time() - DEDUPE_KEEP,))
        try:
            c.execute("insert into events values (?,?)", (event_id, time.time()))
            return True
        except sqlite3.IntegrityError:
            return False


def _bump(key: str) -> int:
    with db() as c:
        c.execute("insert into counters values (?,1) on conflict(key) do update set n=n+1", (key,))
        return c.execute("select n from counters where key=?", (key,)).fetchone()["n"]


def _count(key: str) -> int:
    with db() as c:
        r = c.execute("select n from counters where key=?", (key,)).fetchone()
    return r["n"] if r else 0


def _notice_once(account_id: str, kind: str) -> bool:
    with db() as c:
        try:
            c.execute("insert into notices values (?,?,?)", (account_id, kind, accounts.day()))
            return True
        except sqlite3.IntegrityError:
            return False


LINK_RE = re.compile(r"^\s*link\s+(\d{8})\s*$", re.I)
STOP_RE = re.compile(r"\s*(stop|stopall|unsubscribe|cancel|end|quit|revoke|optout)\s*", re.I)
HELP = "This is Poise. Text me a message you're about to send and I'll read it first, or ask me anything about tonight. Text UNLINK to disconnect."


def handle(msg: Inbound, reply) -> None:
    """Queue the work; the webhook returns at once. `reply(to, text)` is the provider's send."""
    t = asyncio.ensure_future(_process(msg, reply))
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)


def _capped(reply):
    """Every text we send counts against one daily ceiling, whatever it's for."""
    async def send_one(to: str, text: str) -> None:
        if _bump(f"o:{accounts.day()}") > OUT_DAILY_CAP:
            print("direct: outgoing ceiling reached, not sending")
            return
        await reply(to, text)
    return send_one


async def _process(msg: Inbound, reply) -> None:
    accounts.PENDING.set(None)  # this runs after the webhook has answered: its spends stand or are refunded here
    sender, text = msg["sender"], (msg["text"] or "").strip()
    h = addr_hash(sender)
    reply = _capped(reply)
    try:
        with db() as c:
            row = c.execute("select account_id from links where addr_hash=?", (h,)).fetchone()
        if STOP_RE.fullmatch(text):
            # Carrier opt-out words: stop replying and say nothing (the carrier sends its own confirmation).
            if row:
                unlink(row["account_id"])
            return
        m = LINK_RE.match(text)
        if m:
            day_ = accounts.day()
            if _count(f"lf:{h}:{day_}") >= LINK_FAILS_PER_SENDER or _count(f"lf:{day_}") >= LINK_FAILS_OVERALL:
                return  # too many wrong codes today: no attempt, no reply
            ok, answer = _link(h, m.group(1))
            if not ok:
                _bump(f"lf:{h}:{day_}")
                _bump(f"lf:{day_}")
                if not _notice_once("n:" + h, "link"):
                    return
            return await reply(sender, answer)
        if not row:
            if _notice_once("n:" + h, "unlinked"):  # once a day per number, so spoofed senders can't pump texts
                await reply(sender, "This number isn't linked to Kleos. Open Kleos › Poise › Text Poise from Messages to link it.")
            return
        aid = row["account_id"]
        lock = _locks.setdefault(aid, asyncio.Lock())
        async with lock:  # one at a time per person, in arrival order
            await _answer(aid, sender, text, reply)
    except Exception as e:
        print("direct: failed", msg.get("event_id"), repr(e)[:160])
        try:
            if _notice_once("n:" + h, "error"):
                await reply(sender, "Something went wrong on my side. Try that again in a minute.")
        except Exception:
            pass


def _link(h: str, code: str) -> tuple[bool, str]:
    with db() as c:
        r = c.execute("select * from codes where code_hash=?", (hashlib.sha256(code.encode()).hexdigest(),)).fetchone()
        if not r or r["used"] or r["expires"] < time.time():
            return False, "That code didn't work or has expired. Get a new one in Kleos and text it again."
        c.execute("update codes set used=? where code_hash=?", (time.time(), r["code_hash"]))
        c.execute("delete from links where account_id=? or addr_hash=?", (r["account_id"], h))
        c.execute("insert into links values (?,?,?,?)", (h, r["account_id"], channel(), time.time()))
    return True, "Linked. " + HELP


async def _answer(aid: str, sender: str, text: str, reply) -> None:
    if re.fullmatch(r"\s*unlink\s*", text, re.I):
        unlink(aid)
        return await reply(sender, "Unlinked. Poise won't reply to this number any more. Link it again from Kleos any time.")
    hour, day_ = time.strftime("%Y%m%d%H"), accounts.day()
    if _bump(f"h:{aid}:{hour}") > PER_HOUR or _bump(f"d:{aid}:{day_}") > PER_DAY:
        if _notice_once(aid, "rate"):
            await reply(sender, "That's a lot of messages. Give it an hour and I'm all yours.")
        return
    if re.fullmatch(r"\s*(help|info|\?)\s*", text, re.I):
        return await reply(sender, HELP)
    acc = accounts.get(aid)
    if not acc:
        unlink(aid)
        return
    if accounts.plan_of(acc) != "black":
        if _notice_once(aid, "plan"):
            await reply(sender, "Poise Direct is part of Kleos Black, and this account isn't on Black right now. You can still use Poise in the app.")
        return
    if not text or len(text) < 2:
        return
    if _bump(f"g:{day_}") > GLOBAL_DAILY_CAP:
        if _notice_once(aid, "cap"):
            await reply(sender, "Poise Direct is busy right now. Open Kleos and ask in the app.")
        return
    try:
        accounts.spend(acc, "poise")
    except accounts.Denied:
        if _notice_once(aid, "allowance"):
            await reply(sender, "That's this week's reads from Poise. They come back Monday.")
        return
    t0 = time.time()
    try:
        parts = await respond(aid, acc, text)
    except Exception:
        accounts.refund(acc, "poise")
        raise
    _remember(aid, "user", text)
    for p in parts:
        await reply(sender, p)
    _remember(aid, "poise", "\n\n".join(parts))
    print(f"direct: answered in {time.time() - t0:.1f}s ({len(parts)} part{'s' if len(parts) != 1 else ''})")


def _remember(aid: str, role: str, text: str) -> None:
    with db() as c:
        c.execute("delete from messages where created < ?", (time.time() - KEEP,))
        c.execute("insert into messages (account_id, role, text, created) values (?,?,?,?)", (aid, role, text[:2000], time.time()))
        # counters are per hour/day; anything older than two days is dead weight
        c.execute("delete from counters where key like 'h:%' and substr(key, -10) < ?", (time.strftime("%Y%m%d%H", time.gmtime(time.time() - 2 * 86400)),))


DRAFT_RE = re.compile(r"^\s*(draft|check|before i send|read this|how does this sound)\s*[:\-]?\s*", re.I)
QUOTED_RE = re.compile(r"[\"“](.{12,}?)[\"”]", re.S)


def classify(text: str) -> tuple[str, str]:
    """A bounded router, in code: a draft to read, or a question/story for Poise."""
    m = DRAFT_RE.match(text)
    if m and len(text[m.end():].split()) >= 2:
        return "draft", text[m.end():].strip()
    q = QUOTED_RE.search(text)
    if q and len(q.group(1).split()) >= 4 and re.search(r"\b(send|sending|text|reply|say|said|message|sound|read)\b", text, re.I):
        return "draft", q.group(1).strip()
    return "ask", text


async def respond(aid: str, acc: dict, text: str) -> list[str]:
    kind, body = classify(text)
    with db() as c:
        ctx_row = c.execute("select body from context where account_id=?", (aid,)).fetchone()
        prior = c.execute("select role, text from messages where account_id=? and created > ? order by id desc limit 6", (aid, time.time() - 6 * 3600)).fetchall()
    ctx = json.loads(ctx_row["body"]) if ctx_row else {}
    allowed = []
    if ctx.get("occasion"):
        allowed.append(f"Coming up for them: {ctx['occasion']}")
    if ctx.get("style"):
        allowed.append(f"Their taste: {ctx['style']}")
    thread = "\n".join(f"{'Them' if r['role'] == 'user' else 'Poise'}: {r['text'][:300]}" for r in reversed(prior))
    if kind == "draft":
        out = await drafts.review(draft=body, tone="real")
        parts = [out["reads"] + (f" {out['change']}" if out.get("change") else "")]
        for a in out["alternatives"][:2]:
            parts.append(a["text"])
        if out.get("clarify"):
            parts.append(out["clarify"])
        return [p for p in parts if p.strip()]
    context = "\n".join(x for x in ["This is a text-message thread with Poise: answer like a text, under 70 words, no lists.", *allowed, f"Earlier in this text thread:\n{thread}" if thread else ""] if x)
    out = await converse.ledger(text[:1500], context=context, tone="real", user={"name": acc.get("name") or ""})
    if out.get("advice"):
        return [out["advice"]]
    if out.get("lines"):
        lines = "\n".join(f"{'+' if l['points'] > 0 else ''}{l['points']}  {l['text']}" for l in out["lines"])
        return [f"{out.get('headline', '')}\n\n{lines}\nNet {out.get('total', 0):+d}", f"Next time: {out.get('next_time', '')}"]
    return [out.get("headline") or "Tell me a bit more."]
