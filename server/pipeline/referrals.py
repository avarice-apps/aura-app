"""Referrals, ambassador codes and scene challenges.

The reward design (why it looks like this):
- Double-sided and product-native: both people get live-call credits, not free weeks. A credit costs us about
  $0.45 of voice; a paying user costs ~$45-70 to acquire with ads. Credits also pull people back into a call.
- Paid on activation, not install: the invitee has to finish a real call before anyone is rewarded. Reinstalls
  and fake devices earn nothing.
- A bigger reward when the friend actually subscribes, so the incentive points at the outcome we want.
- Capped per month, so nobody farms it.
- Ambassadors (creators) earn cash: a share of what their subscribers pay in their first 30 days, after Apple's
  cut, capped per subscriber, paid monthly once the refund window has passed.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import time

DB = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "referrals.db")

INVITEE_CALLS = 2  # the friend, when their first call is read
REFERRER_ACTIVATION_CALLS = 2  # you, when they finish their first call
REFERRER_PAID_CALLS = 5  # you, when they start paying
MONTHLY_REWARD_CAP = 10  # rewarded friends per referrer per 30 days
NEW_MEMBER_S = 3 * 86400  # a code can be added up to three days after your first call
AMBASSADOR_PCT = 0.30
AMBASSADOR_WINDOW_S = 30 * 86400
AMBASSADOR_CAP_USD = 15.0
APPLE_DEFAULT_CUT = 0.15
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I


def _db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    c = sqlite3.connect(DB, timeout=10)
    c.row_factory = sqlite3.Row
    c.executescript(
        """
        create table if not exists codes (code text primary key, subject text, kind text not null, name text, pct real, created real);
        create unique index if not exists codes_subject on codes(subject) where subject is not null;
        create table if not exists redemptions (invitee text primary key, code text not null, at real, activated_at real, paid_at real, first_paid_at real);
        create table if not exists credits (subject text primary key, granted integer not null default 0);
        create table if not exists rewards (id integer primary key autoincrement, referrer text, invitee text, kind text, calls integer, at real);
        create table if not exists events (id text primary key, at real);
        create table if not exists seen (subject text primary key, first_read real);
        create table if not exists earnings (id integer primary key autoincrement, code text, invitee text, amount real, sandbox integer, at real, event_id text);
        create table if not exists challenges (code text primary key, kind text, ref_id text, title text,
            a_subject text, a_name text, a_rating integer, a_verdict text,
            b_subject text, b_name text, b_rating integer, b_verdict text, created real, answered real);
        """
    )
    return c


def _norm(code: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (code or "").upper())[:16]


# ---------------------------------------------------------------- codes

def code_for(subject: str) -> str:
    """Each install gets one stable invite code."""
    with _db() as c:
        row = c.execute("select code from codes where subject=? and kind='user'", (subject,)).fetchone()
        if row:
            return row["code"]
        h = int(hashlib.sha256(f"kleos|{subject}".encode()).hexdigest(), 16)
        for salt in range(20):
            n = h + salt * 7919
            code = "".join(ALPHABET[(n >> (5 * i)) % len(ALPHABET)] for i in range(6))
            try:
                c.execute("insert into codes(code, subject, kind, created) values (?,?,?,?)", (code, subject, "user", time.time()))
                return code
            except sqlite3.IntegrityError:
                continue
    raise RuntimeError("could not allocate an invite code")


def create_ambassador(code: str, name: str, pct: float = AMBASSADOR_PCT) -> dict:
    code = _norm(code)
    if not (3 <= len(code) <= 16):
        raise ValueError("Codes are 3-16 letters or digits.")
    pct = max(0.05, min(0.5, float(pct)))
    with _db() as c:
        try:
            c.execute("insert into codes(code, kind, name, pct, created) values (?,?,?,?,?)", (code, "ambassador", (name or code)[:60], pct, time.time()))
        except sqlite3.IntegrityError:
            raise ValueError("That code is taken.")
    return {"code": code, "name": name, "pct": pct}


def _dashboard_secret() -> str:
    """The admin key if set; otherwise a random secret kept on the server's volume (never a guessable default)."""
    if os.environ.get("AURA_ADMIN_KEY"):
        return os.environ["AURA_ADMIN_KEY"]
    path = os.path.join(os.path.dirname(DB), "dashboard.secret")
    try:
        with open(path) as f:
            return f.read().strip()
    except FileNotFoundError:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        val = secrets.token_urlsafe(32)
        with open(path, "w") as f:
            f.write(val)
        return val


def dashboard_key(code: str) -> str:
    return hmac.new(_dashboard_secret().encode(), _norm(code).encode(), hashlib.sha256).hexdigest()[:16]


# ---------------------------------------------------------------- redeem, activate, pay

def redeem(invitee: str, code: str) -> dict:
    code = _norm(code)
    if not invitee or not code:
        raise ValueError("Enter a code.")
    with _db() as c:
        row = c.execute("select * from codes where code=?", (code,)).fetchone()
        if not row:
            raise ValueError("That code doesn't exist.")
        if row["subject"] == invitee:
            raise ValueError("That's your own code.")
        if c.execute("select 1 from redemptions where invitee=?", (invitee,)).fetchone():
            raise ValueError("You've already used a code.")
        seen = c.execute("select first_read from seen where subject=?", (invitee,)).fetchone()
        if seen and seen["first_read"] < time.time() - NEW_MEMBER_S:
            raise ValueError("Codes are for new members, in their first three days.")
        c.execute("insert into redemptions(invitee, code, at) values (?,?,?)", (invitee, code, time.time()))
    if row["kind"] == "ambassador":
        msg = f"{row['name'] or code}’s code added. Finish your next call to unlock {INVITEE_CALLS} extra live calls."
    else:
        msg = f"Code from a friend added. Finish your next call and you both get {INVITEE_CALLS} extra live calls."
    return {"ok": True, "kind": row["kind"], "name": row["name"] or "", "message": msg}


def _grant(c: sqlite3.Connection, subject: str, calls: int) -> None:
    c.execute("insert into credits(subject, granted) values (?, ?) on conflict(subject) do update set granted = granted + excluded.granted", (subject, calls))


def activate(invitee: str) -> None:
    """Called when someone's call gets a real read. Rewards both sides once."""
    if not invitee:
        return
    with _db() as c:
        c.execute("insert or ignore into seen(subject, first_read) values (?, ?)", (invitee, time.time()))
        r = c.execute("select r.*, k.kind, k.subject as referrer from redemptions r join codes k on k.code = r.code where r.invitee=?", (invitee,)).fetchone()
        if not r or r["activated_at"]:
            return
        now = time.time()
        c.execute("update redemptions set activated_at=? where invitee=?", (now, invitee))
        _grant(c, invitee, INVITEE_CALLS)
        c.execute("insert into rewards(referrer, invitee, kind, calls, at) values (?,?,?,?,?)", (None, invitee, "welcome", INVITEE_CALLS, now))
        if r["kind"] == "user" and r["referrer"]:
            recent = c.execute("select count(*) n from rewards where referrer=? and kind='activation' and at > ?", (r["referrer"], now - 30 * 86400)).fetchone()["n"]
            if recent < MONTHLY_REWARD_CAP:
                _grant(c, r["referrer"], REFERRER_ACTIVATION_CALLS)
                c.execute("insert into rewards(referrer, invitee, kind, calls, at) values (?,?,?,?,?)", (r["referrer"], invitee, "activation", REFERRER_ACTIVATION_CALLS, now))


def _user_ids(ev: dict) -> list[str]:
    ids = [ev.get("app_user_id"), ev.get("original_app_user_id"), *(ev.get("aliases") or [])]
    return [i for i in dict.fromkeys(ids) if i]


def revenue_event(body: dict) -> dict:
    """RevenueCat webhook. Idempotent on event id."""
    ev = (body or {}).get("event") or {}
    eid = ev.get("id") or ""
    kind = ev.get("type")
    if not eid or kind not in ("INITIAL_PURCHASE", "RENEWAL", "NON_RENEWING_PURCHASE", "PRODUCT_CHANGE"):
        return {"ignored": True}
    price = ev.get("price")
    if not isinstance(price, (int, float)) or price <= 0 or ev.get("period_type") == "TRIAL":
        return {"ignored": "free"}
    sandbox = 1 if ev.get("environment") == "SANDBOX" else 0
    at = (ev.get("purchased_at_ms") or time.time() * 1000) / 1000
    with _db() as c:
        if c.execute("select 1 from events where id=?", (eid,)).fetchone():
            return {"duplicate": True}
        c.execute("insert into events(id, at) values (?,?)", (eid, time.time()))
        r = None
        for uid in _user_ids(ev):
            r = c.execute("select r.*, k.kind, k.subject as referrer, k.pct from redemptions r join codes k on k.code = r.code where r.invitee=?", (uid,)).fetchone()
            if r:
                break
        if not r:
            return {"no_referral": True}
        invitee = r["invitee"]
        first = r["first_paid_at"] or at
        if not r["first_paid_at"]:
            c.execute("update redemptions set first_paid_at=? where invitee=?", (first, invitee))
        if r["kind"] == "user":
            if not r["paid_at"] and not sandbox:
                c.execute("update redemptions set paid_at=? where invitee=?", (at, invitee))
                if r["referrer"]:
                    _grant(c, r["referrer"], REFERRER_PAID_CALLS)
                    c.execute("insert into rewards(referrer, invitee, kind, calls, at) values (?,?,?,?,?)", (r["referrer"], invitee, "paid", REFERRER_PAID_CALLS, time.time()))
            return {"referral": "user"}
        # ambassador: share of net revenue in the subscriber's first 30 days, capped per subscriber
        if at - first > AMBASSADOR_WINDOW_S:
            return {"ambassador": "outside window"}
        cut = (ev.get("commission_percentage") or APPLE_DEFAULT_CUT) + (ev.get("tax_percentage") or 0)
        net = float(price) * max(0.0, 1 - cut)
        so_far = c.execute("select coalesce(sum(amount),0) s from earnings where code=? and invitee=? and sandbox=?", (r["code"], invitee, sandbox)).fetchone()["s"]
        amount = round(max(0.0, min(AMBASSADOR_CAP_USD - so_far, net * (r["pct"] or AMBASSADOR_PCT))), 2)
        if amount > 0:
            c.execute("insert into earnings(code, invitee, amount, sandbox, at, event_id) values (?,?,?,?,?,?)", (r["code"], invitee, amount, sandbox, time.time(), eid))
        return {"ambassador": amount}


# ---------------------------------------------------------------- reads

def me(subject: str) -> dict:
    code = code_for(subject)
    with _db() as c:
        g = c.execute("select granted from credits where subject=?", (subject,)).fetchone()
        friends = c.execute("select count(*) n from rewards where referrer=? and kind='activation'", (subject,)).fetchone()["n"]
        paid = c.execute("select count(*) n from rewards where referrer=? and kind='paid'", (subject,)).fetchone()["n"]
        used = c.execute("select code from redemptions where invitee=?", (subject,)).fetchone()
    return {"code": code, "credits": g["granted"] if g else 0, "friends": friends, "friends_paid": paid, "used_code": used["code"] if used else None,
            "terms": {"you_get": REFERRER_ACTIVATION_CALLS, "you_get_paid": REFERRER_PAID_CALLS, "they_get": INVITEE_CALLS}}


def ambassador_stats(code: str) -> dict | None:
    code = _norm(code)
    with _db() as c:
        k = c.execute("select * from codes where code=? and kind='ambassador'", (code,)).fetchone()
        if not k:
            return None
        signups = c.execute("select count(*) n from redemptions where code=?", (code,)).fetchone()["n"]
        active = c.execute("select count(*) n from redemptions where code=? and activated_at is not null", (code,)).fetchone()["n"]
        paying = c.execute("select count(*) n from redemptions where code=? and first_paid_at is not null", (code,)).fetchone()["n"]
        cutoff = time.time() - AMBASSADOR_WINDOW_S
        earned = c.execute("select coalesce(sum(amount),0) s from earnings where code=? and sandbox=0", (code,)).fetchone()["s"]
        payable = c.execute("select coalesce(sum(e.amount),0) s from earnings e join redemptions r on r.invitee=e.invitee where e.code=? and e.sandbox=0 and r.first_paid_at < ?", (code, cutoff)).fetchone()["s"]
        sandbox = c.execute("select coalesce(sum(amount),0) s from earnings where code=? and sandbox=1", (code,)).fetchone()["s"]
    return {"code": code, "name": k["name"], "pct": k["pct"], "signups": signups, "active": active, "paying": paying, "earned": round(earned, 2), "payable": round(payable, 2), "sandbox": round(sandbox, 2)}


def all_ambassadors() -> list[dict]:
    with _db() as c:
        codes = [r["code"] for r in c.execute("select code from codes where kind='ambassador' order by created")]
    return [s for s in (ambassador_stats(x) for x in codes) if s]


# ---------------------------------------------------------------- scene challenges

def _challenge_code(c: sqlite3.Connection) -> str:
    for _ in range(12):
        code = "".join(secrets.choice(ALPHABET) for _ in range(5))
        if not c.execute("select 1 from challenges where code=?", (code,)).fetchone():
            return code
    raise RuntimeError("no free challenge code")


def challenge_create(kind: str, ref_id: str, title: str, subject: str, name: str, rating: int, verdict: str) -> dict:
    if kind not in ("daily", "floor"):
        raise ValueError("Only Side Quests and Open Floors can be challenged.")
    with _db() as c:
        c.execute("delete from challenges where created < ?", (time.time() - 30 * 86400,))
        code = _challenge_code(c)
        c.execute("insert into challenges(code, kind, ref_id, title, a_subject, a_name, a_rating, a_verdict, created) values (?,?,?,?,?,?,?,?,?)",
                  (code, kind, ref_id[:40], title[:80], subject, (name or "Someone")[:24], int(rating), (verdict or "")[:200], time.time()))
    return challenge_get(code)


def challenge_get(code: str) -> dict:
    with _db() as c:
        r = c.execute("select * from challenges where code=?", (_norm(code),)).fetchone()
    if not r:
        raise KeyError("No challenge with that code.")
    out = {k: r[k] for k in ("code", "kind", "ref_id", "title", "a_name", "a_rating", "a_verdict", "b_name", "b_rating", "b_verdict")}
    out["done"] = r["b_rating"] is not None
    if out["done"]:
        out["winner"] = "a" if r["a_rating"] > r["b_rating"] else "b" if r["b_rating"] > r["a_rating"] else "tie"
    return out


def challenge_answer(code: str, subject: str, name: str, rating: int, verdict: str) -> dict:
    with _db() as c:
        r = c.execute("select a_subject from challenges where code=?", (_norm(code),)).fetchone()
        if not r:
            raise KeyError("No challenge with that code.")
        if r["a_subject"] and r["a_subject"] == subject:
            raise ValueError("You can't answer your own challenge. Send it to a friend.")
        cur = c.execute("update challenges set b_subject=?, b_name=?, b_rating=?, b_verdict=?, answered=? where code=? and b_rating is null",
                        (subject, (name or "Your friend")[:24], int(rating), (verdict or "")[:200], time.time(), _norm(code)))
        if cur.rowcount == 0:
            raise ValueError("Someone already answered this one.")
    return challenge_get(code)


def delete_for(subject: str) -> None:
    with _db() as c:
        c.execute("delete from credits where subject=?", (subject,))
        c.execute("update challenges set a_subject=null where a_subject=?", (subject,))
        c.execute("update challenges set b_subject=null where b_subject=?", (subject,))
