"""Accounts, sign-in, plans and allowances.

How identity works:
- Every install gets a guest account the first time the app opens: a random token kept in the phone's keychain
  (SecureStore), so it survives a reinstall. Only the token's hash is stored here. No email, no friction.
- Saving the account (Sign in with Apple, or an emailed six-digit code) attaches an identity to the same account,
  so it works on a new phone and on joinkleos.com (Members). If that identity already belongs to another account,
  the phone switches to it instead.
- The plan comes from RevenueCat (webhook, or a direct check with the secret key). The RevenueCat app user id is
  the account id. Allowances are counted here, per account, per ISO week, so reinstalling resets nothing.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import smtplib
import sqlite3
import ssl
import threading
import time
from datetime import datetime, timezone
from email.message import EmailMessage

DATA = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
DB = os.path.join(DATA, "kleos.db")
WAITLIST = os.path.join(DATA, "waitlist.jsonl")

TIERS = ("free", "plus", "black")
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,24}$")


def _int_env(k: str, d: int) -> int:
    try:
        return int(os.environ.get(k, d))
    except ValueError:
        return d


# ---------------------------------------------------------------- allowances
# Live voice costs about $0.08 a minute, so paid plans carry a fair-use ceiling in minutes. Typical use is far
# below it; the ceiling exists so one account can't run up a bill. Everything else is counted in uses.
LIMITS: dict[str, dict[str, int]] = {
    "free": {"calls": 2, "call_s": 300, "clips": 1, "poise": 3, "profiles": 1, "fits": 3, "scans": 30, "duels": 12, "lessons": 12, "table": 6},
    "plus": {"live_s": _int_env("KLEOS_PLUS_LIVE_MIN", 45) * 60, "call_s": 1200, "clips": 10, "poise": 150, "profiles": 3, "fits": 30, "scans": 60, "duels": 40, "lessons": 80, "table": 30},
    "black": {"live_s": _int_env("KLEOS_BLACK_LIVE_MIN", 90) * 60, "call_s": 1200, "clips": 30, "poise": 300, "profiles": 15, "fits": 60, "scans": 120, "duels": 80, "lessons": 160, "table": 60},
}
DAILY_QUEST_S = 300  # the Daily Side Quest is free for everyone, once a day
ONBOARDING_S = 90
GRACE_S = 36 * 3600  # a renewal that hasn't been reported yet keeps the plan this long past its end

FEATURE_TIER = {"wardrobe": "black", "portrait": "black", "rehearse": "plus", "retry": "plus", "full_read": "plus"}


def week(t: float | None = None) -> str:
    d = datetime.fromtimestamp(t or time.time(), tz=timezone.utc).isocalendar()
    return f"{d[0]}-W{d[1]:02d}"


def day(t: float | None = None) -> str:
    return datetime.fromtimestamp(t or time.time(), tz=timezone.utc).strftime("%Y-%m-%d")


def at_least(have: str, need: str) -> bool:
    return TIERS.index(have if have in TIERS else "free") >= TIERS.index(need)


# ---------------------------------------------------------------- storage

_lock = threading.Lock()


def db() -> sqlite3.Connection:
    os.makedirs(DATA, exist_ok=True)
    c = sqlite3.connect(DB, timeout=15)
    c.row_factory = sqlite3.Row
    c.execute("pragma journal_mode=wal")
    c.executescript(
        """
        create table if not exists accounts (
            id text primary key, created real not null, subject text unique, email text unique, apple_sub text unique,
            name text, plan text not null default 'free', plan_until real, plan_source text, plan_checked real,
            waitlist_no integer, deleted real);
        create table if not exists tokens (hash text primary key, account_id text not null, kind text not null,
            created real not null, last_used real, revoked real);
        create index if not exists tokens_account on tokens(account_id);
        create table if not exists email_codes (email text primary key, code_hash text, expires real, tries integer,
            sent_at real, window_start real, window_sends integer);
        create table if not exists usage (account_id text not null, period text not null, kind text not null,
            n real not null default 0, primary key (account_id, period, kind));
        create table if not exists summaries (account_id text primary key, body text not null, updated real);
        create table if not exists guests_by_ip (ip text not null, at real not null);
        create index if not exists guests_ip on guests_by_ip(ip, at);
        create table if not exists rc_events (id text primary key, at real);
        """
    )
    return c


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _new_id() -> str:
    return "u_" + secrets.token_hex(10)


def _row(r: sqlite3.Row | None) -> dict | None:
    return dict(r) if r else None


def _issue(c: sqlite3.Connection, account_id: str, kind: str = "app") -> str:
    token = "kl_" + secrets.token_urlsafe(32)
    c.execute("insert into tokens(hash, account_id, kind, created, last_used) values (?,?,?,?,?)", (_hash(token), account_id, kind, time.time(), time.time()))
    return token


def subject_of(acc: dict) -> str:
    """The id the older parts of the server (invites, duels, training) know this person by."""
    return acc.get("subject") or acc["id"]


# ---------------------------------------------------------------- guests and tokens

GUESTS_PER_IP_DAY = _int_env("KLEOS_GUESTS_PER_IP_DAY", 25)


def guest(subject: str | None, ip: str) -> tuple[str, dict]:
    """A new install. Rate-limited per network so free allowances can't be farmed by minting accounts."""
    subject = (subject or "").strip()[:64] or None
    if subject and not re.fullmatch(r"[A-Za-z0-9_\-]{6,64}", subject):
        subject = None
    now = time.time()
    with _lock, db() as c:
        c.execute("delete from guests_by_ip where at < ?", (now - 86400,))
        n = c.execute("select count(*) from guests_by_ip where ip=?", (ip,)).fetchone()[0]
        if n >= GUESTS_PER_IP_DAY:
            raise PermissionError("Too many new accounts from this network today. Try again tomorrow.")
        if subject and c.execute("select 1 from accounts where subject=?", (subject,)).fetchone():
            subject = None  # never let a known install id be claimed by someone else
        aid = _new_id()
        c.execute("insert into accounts(id, created, subject) values (?,?,?)", (aid, now, subject))
        c.execute("insert into guests_by_ip(ip, at) values (?,?)", (ip, now))
        token = _issue(c, aid)
        acc = _row(c.execute("select * from accounts where id=?", (aid,)).fetchone())
    return token, acc  # type: ignore[return-value]


def from_token(token: str | None) -> dict | None:
    if not token or not token.startswith("kl_") or len(token) > 120:
        return None
    with db() as c:
        t = c.execute("select * from tokens where hash=? and revoked is null", (_hash(token),)).fetchone()
        if not t:
            return None
        acc = c.execute("select * from accounts where id=? and deleted is null", (t["account_id"],)).fetchone()
        if not acc:
            return None
        if not t["last_used"] or time.time() - t["last_used"] > 3600:
            c.execute("update tokens set last_used=? where hash=?", (time.time(), t["hash"]))
    return dict(acc)


def revoke(token: str) -> None:
    with db() as c:
        c.execute("update tokens set revoked=? where hash=?", (time.time(), _hash(token)))


def get(account_id: str) -> dict | None:
    with db() as c:
        return _row(c.execute("select * from accounts where id=? and deleted is null", (account_id,)).fetchone())


def set_name(acc: dict, name: str) -> dict:
    name = re.sub(r"\s+", " ", name or "").strip()[:40]
    with db() as c:
        c.execute("update accounts set name=? where id=?", (name or None, acc["id"]))
    return get(acc["id"])  # type: ignore[return-value]


# ---------------------------------------------------------------- the waitlist register

def waitlist_number(email: str) -> int | None:
    try:
        with open(WAITLIST) as f:
            for line in f:
                try:
                    r = json.loads(line)
                except Exception:
                    continue
                if r.get("email") == email:
                    return int(r["number"])
    except FileNotFoundError:
        return None
    return None


# ---------------------------------------------------------------- linking an identity

def _attach(c: sqlite3.Connection, current: dict | None, field: str, value: str, email: str | None = None) -> tuple[str, dict, bool]:
    """Attach `field=value` to the current account, or switch to the account that already has it.
    Returns (token, account, switched)."""
    owner = c.execute(f"select * from accounts where {field}=? and deleted is null", (value,)).fetchone()
    if owner and current and owner["id"] == current["id"]:
        return _issue(c, owner["id"]), dict(owner), False
    if owner:
        # Same person, new phone (or they saved it before). Bring a paid plan bought as a guest along with them.
        if current and current.get("plan") in ("plus", "black") and (current.get("plan_until") or 0) > (owner["plan_until"] or 0):
            c.execute("update accounts set plan=?, plan_until=?, plan_source=? where id=?", (current["plan"], current["plan_until"], "transfer", owner["id"]))
        token = _issue(c, owner["id"])
        return token, dict(c.execute("select * from accounts where id=?", (owner["id"],)).fetchone()), True
    if current:
        aid = current["id"]
        c.execute(f"update accounts set {field}=? where id=?", (value, aid))
    else:
        aid = _new_id()
        c.execute(f"insert into accounts(id, created, {field}) values (?,?,?)", (aid, time.time(), value))
    if email and not c.execute("select 1 from accounts where email=? and id<>?", (email, aid)).fetchone():
        c.execute("update accounts set email=coalesce(email, ?) where id=?", (email, aid))
    acc = dict(c.execute("select * from accounts where id=?", (aid,)).fetchone())
    if acc.get("email") and not acc.get("waitlist_no"):
        n = waitlist_number(acc["email"])
        if n:
            c.execute("update accounts set waitlist_no=? where id=?", (n, aid))
            acc["waitlist_no"] = n
    return _issue(c, aid), acc, False


# ---------------------------------------------------------------- email codes

CODE_TTL = 15 * 60
CODE_TRIES = 5


def _smtp_ready() -> bool:
    return bool(os.environ.get("SMTP_HOST") and os.environ.get("SMTP_USER") and os.environ.get("SMTP_PASS"))


def _send_mail(to: str, code: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = f"{code} is your Kleos code"
    msg["From"] = os.environ.get("SMTP_FROM", "Kleos <hello@joinkleos.com>")
    msg["To"] = to
    msg.set_content(f"Your Kleos code is {code}\n\nIt works for 15 minutes. If you didn't ask for it, ignore this email.\n\nKleos · joinkleos.com")
    msg.add_alternative(
        f"""<div style="font-family:Georgia,serif;max-width:420px;margin:0 auto;padding:32px 24px;color:#0D0B1E">
<div style="font:12px/1 monospace;letter-spacing:2px;color:#1608F2">KLEOS</div>
<p style="font-size:18px;margin:24px 0 8px">Your code</p>
<div style="font:600 34px/1.2 monospace;letter-spacing:8px;color:#1608F2">{code}</div>
<p style="color:#5E5E69;font:14px/1.5 -apple-system,Helvetica,sans-serif">It works for 15 minutes. If you didn't ask for it, ignore this email.</p></div>""",
        subtype="html",
    )
    host, port = os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", "465"))
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=ssl.create_default_context(), timeout=20) as s:
            s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=20) as s:
            s.starttls(context=ssl.create_default_context())
            s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])
            s.send_message(msg)


def email_start(email: str) -> dict:
    email = (email or "").strip().lower()
    if not EMAIL_RE.match(email):
        raise ValueError("That email doesn't look right.")
    now = time.time()
    with db() as c:
        r = c.execute("select * from email_codes where email=?", (email,)).fetchone()
        if r and r["sent_at"] and now - r["sent_at"] < 45:
            raise PermissionError("A code is on its way. Wait a minute before asking again.")
        ws, wn = (r["window_start"], r["window_sends"]) if r else (now, 0)
        if now - (ws or 0) > 3600:
            ws, wn = now, 0
        if wn >= 5:
            raise PermissionError("Too many codes for this email. Try again in an hour.")
        code = f"{secrets.randbelow(1_000_000):06d}"
        c.execute(
            "insert into email_codes(email, code_hash, expires, tries, sent_at, window_start, window_sends) values (?,?,?,?,?,?,?) "
            "on conflict(email) do update set code_hash=excluded.code_hash, expires=excluded.expires, tries=0, sent_at=excluded.sent_at, window_start=excluded.window_start, window_sends=excluded.window_sends",
            (email, _hash(f"{email}|{code}"), now + CODE_TTL, 0, now, ws, wn + 1),
        )
    out: dict = {"sent": True}
    if _smtp_ready():
        try:
            _send_mail(email, code)
        except Exception as e:  # don't leak SMTP details to the client
            print("email send failed:", repr(e)[:200])
            raise RuntimeError("Couldn't send the email. Try again in a minute.")
    else:
        print(f"[dev] Kleos code for {email}: {code}")
        if os.environ.get("KLEOS_DEV_CODES") == "1":
            out["dev_code"] = code  # local testing only; never set on the live server
    return out


def email_verify(email: str, code: str, current: dict | None) -> tuple[str, dict, bool]:
    email = (email or "").strip().lower()
    code = re.sub(r"\D", "", code or "")
    now = time.time()
    with _lock, db() as c:
        r = c.execute("select * from email_codes where email=?", (email,)).fetchone()
        if not r or not r["code_hash"] or r["expires"] < now:
            raise ValueError("That code has expired. Ask for a new one.")
        if r["tries"] >= CODE_TRIES:
            raise PermissionError("Too many tries. Ask for a new code.")
        if not hmac.compare_digest(r["code_hash"], _hash(f"{email}|{code}")):
            c.execute("update email_codes set tries=tries+1 where email=?", (email,))
            c.commit()  # the failed try must count even though we raise (the context manager would roll it back)
            raise ValueError("That code isn't right.")
        c.execute("update email_codes set code_hash=null where email=?", (email,))
        return _attach(c, current, "email", email)


# ---------------------------------------------------------------- Sign in with Apple

APPLE_ISS = "https://appleid.apple.com"
_jwks: dict = {"at": 0.0, "keys": None}


def _apple_keys() -> dict:
    import httpx

    if _jwks["keys"] and time.time() - _jwks["at"] < 86400:
        return _jwks["keys"]
    r = httpx.get("https://appleid.apple.com/auth/keys", timeout=10)
    r.raise_for_status()
    _jwks.update(at=time.time(), keys=r.json())
    return _jwks["keys"]


def verify_apple(identity_token: str) -> dict:
    import jwt

    try:
        head = jwt.get_unverified_header(identity_token)
        jwk = next(k for k in _apple_keys()["keys"] if k["kid"] == head.get("kid"))
        key = jwt.PyJWK(jwk).key
        auds = [a.strip() for a in os.environ.get("APPLE_AUDIENCES", "com.avarice.kleos,host.exp.Exponent").split(",") if a.strip()]
        claims = jwt.decode(identity_token, key=key, algorithms=["RS256"], audience=auds, issuer=APPLE_ISS)
    except StopIteration:
        raise ValueError("Apple sign-in couldn't be checked. Try again.")
    except Exception as e:
        print("apple token rejected:", repr(e)[:160])
        raise ValueError("Apple sign-in couldn't be checked. Try again.")
    if not claims.get("sub"):
        raise ValueError("Apple sign-in couldn't be checked. Try again.")
    return claims


def apple_sign_in(identity_token: str, current: dict | None, name: str = "") -> tuple[str, dict, bool]:
    claims = verify_apple(identity_token)
    email = str(claims.get("email") or "").lower() or None
    with _lock, db() as c:
        token, acc, switched = _attach(c, current, "apple_sub", claims["sub"], email if email and EMAIL_RE.match(email) else None)
        if name and not acc.get("name"):
            c.execute("update accounts set name=? where id=?", (name.strip()[:40], acc["id"]))
            acc["name"] = name.strip()[:40]
    return token, acc, switched


# ---------------------------------------------------------------- plans

def _rc_fetch(account_id: str) -> tuple[str, float | None] | None:
    """Ask RevenueCat directly (secret key). Returns (plan, expires) or None if RevenueCat isn't set up."""
    key = os.environ.get("REVENUECAT_SECRET_KEY", "")
    if not key:
        return None
    import httpx

    try:
        r = httpx.get(f"https://api.revenuecat.com/v1/subscribers/{account_id}", headers={"Authorization": f"Bearer {key}"}, timeout=10)
        if r.status_code >= 300:
            return None
        ents = (r.json().get("subscriber") or {}).get("entitlements") or {}
    except Exception as e:
        print("revenuecat check failed:", repr(e)[:160])
        return None
    best, until = "free", None
    for name in ("black", "plus"):
        e = ents.get(name)
        if not e:
            continue
        exp = e.get("expires_date")
        ts = datetime.fromisoformat(exp.replace("Z", "+00:00")).timestamp() if exp else None
        if ts is None or ts > time.time():
            best, until = name, ts
            break
    return best, until


def plan_of(acc: dict, refresh: bool = False) -> str:
    plan = acc.get("plan") or "free"
    until = acc.get("plan_until")
    active = plan in ("plus", "black") and (until is None or until + GRACE_S > time.time())
    stale = refresh or (plan != "free" and not active) or (time.time() - (acc.get("plan_checked") or 0) > 6 * 3600 and plan != "free")
    if stale and (refresh or time.time() - (acc.get("plan_checked") or 0) > 300):
        got = _rc_fetch(acc["id"])
        if got:
            plan, until = got
            with db() as c:
                c.execute("update accounts set plan=?, plan_until=?, plan_source=?, plan_checked=? where id=?", (plan, until, "revenuecat", time.time(), acc["id"]))
            acc.update(plan=plan, plan_until=until)
            active = plan != "free"
        else:
            with db() as c:
                c.execute("update accounts set plan_checked=? where id=?", (time.time(), acc["id"]))
    return plan if active else "free"


def set_plan(account_id: str, plan: str, until: float | None, source: str) -> None:
    if plan not in TIERS:
        return
    with db() as c:
        c.execute("update accounts set plan=?, plan_until=?, plan_source=?, plan_checked=? where id=?", (plan, until, source, time.time(), account_id))


def revenuecat_event(ev: dict) -> dict:
    """Keep plans in step with RevenueCat. Called by the webhook (already authenticated)."""
    eid = ev.get("id") or ""
    kind = ev.get("type") or ""
    ids = [i for i in dict.fromkeys([ev.get("app_user_id"), ev.get("original_app_user_id"), *(ev.get("aliases") or []), *(ev.get("transferred_to") or [])]) if i]
    with db() as c:
        if eid and c.execute("select 1 from rc_events where id=?", (eid,)).fetchone():
            return {"duplicate": True}
        if eid:
            c.execute("insert into rc_events(id, at) values (?,?)", (eid, time.time()))
        ents = set(ev.get("entitlement_ids") or ([ev["entitlement_id"]] if ev.get("entitlement_id") else []))
        tier = "black" if "black" in ents else "plus" if "plus" in ents else None
        exp = ev.get("expiration_at_ms")
        until = exp / 1000 if isinstance(exp, (int, float)) else None
        touched = 0
        for uid in ids:
            acc = c.execute("select id from accounts where id=?", (uid,)).fetchone()
            if not acc:
                continue
            if kind in ("EXPIRATION",) or (until and until < time.time()):
                c.execute("update accounts set plan='free', plan_until=?, plan_source='revenuecat', plan_checked=? where id=?", (until, time.time(), uid))
            elif tier and kind in ("INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "UNCANCELLATION", "NON_RENEWING_PURCHASE", "SUBSCRIPTION_EXTENDED", "TEMPORARY_ENTITLEMENT_GRANT", "TRANSFER"):
                c.execute("update accounts set plan=?, plan_until=?, plan_source='revenuecat', plan_checked=? where id=?", (tier, until, time.time(), uid))
            touched += 1
    return {"accounts": touched}


# ---------------------------------------------------------------- usage

def used(account_id: str, kind: str, period: str | None = None) -> float:
    with db() as c:
        r = c.execute("select n from usage where account_id=? and period=? and kind=?", (account_id, period or week(), kind)).fetchone()
    return float(r["n"]) if r else 0.0


def add_use(account_id: str, kind: str, n: float = 1, period: str | None = None) -> None:
    with db() as c:
        c.execute(
            "insert into usage(account_id, period, kind, n) values (?,?,?,?) on conflict(account_id, period, kind) do update set n = max(0, n + excluded.n)",
            (account_id, period or week(), kind, n),
        )


def remaining(acc: dict, kind: str, plan: str | None = None) -> float:
    plan = plan or plan_of(acc)
    cap = LIMITS[plan].get(kind)
    if cap is None:
        return float("inf")
    return max(0.0, cap - used(acc["id"], kind))


def credits_left(acc: dict) -> int:
    """Extra live calls earned through invites (granted in referrals.db) minus those spent."""
    try:
        from . import referrals

        granted = referrals.me(subject_of(acc)).get("credits", 0)
    except Exception:
        granted = 0
    return max(0, int(granted - used(acc["id"], "credits", "all")))


class Denied(Exception):
    """Out of allowance, or a feature the plan doesn't include. `reason` maps to a paywall headline in the app."""

    def __init__(self, reason: str, message: str):
        super().__init__(message)
        self.reason = reason
        self.message = message


MESSAGES = {
    "calls": "That was this week's free calls. Kleos+ keeps the line open.",
    "minutes": "You've used this week's live minutes. They come back on Monday.",
    "clips": "That's this week's clip ratings.",
    "poise": "That's this week's reads from Poise.",
    "profiles": "That's this week's Profile Reads.",
    "fits": "That's this week's Fit checks.",
    "scans": "That's a lot of takes this week. Take a breather.",
    "duels": "That's a lot of duels this week.",
    "lessons": "That's this week's lessons.",
    "table": "That's this week's table games.",
    "daily": "You've played today's Daily Side Quest. A new one opens tomorrow.",
    "wardrobe": "The Wardrobe is part of Kleos Black.",
    "portrait": "Your Portrait is part of Kleos Black.",
    "rehearse": "Rehearse is part of Kleos+.",
    "retry": "Running it back is part of Kleos+.",
}


def require_tier(acc: dict, feature: str) -> str:
    plan = plan_of(acc)
    if not at_least(plan, FEATURE_TIER[feature]):
        raise Denied(feature, MESSAGES[feature])
    return plan


def spend(acc: dict, kind: str) -> None:
    """Count one use of a metered feature, or refuse."""
    plan = plan_of(acc)
    if remaining(acc, kind, plan) < 1:
        raise Denied(kind, MESSAGES.get(kind, "That's this week's allowance."))
    add_use(acc["id"], kind, 1)


def refund(acc: dict, kind: str) -> None:
    add_use(acc["id"], kind, -1)


def live_allowance(acc: dict, *, onboarding: bool = False, daily: bool = False, poise: bool = False) -> dict:
    """Before a live call: is it allowed, how long may it run, and what does it cost.
    Returns {"plan", "allow_s", "charge": "onboarding"|"daily"|"call"|"credit"|"minutes"}."""
    plan = plan_of(acc)
    aid = acc["id"]
    if onboarding and used(aid, "onboarding", "all") < 1:
        return {"plan": plan, "allow_s": ONBOARDING_S, "charge": "onboarding"}
    if daily and used(aid, "daily", day()) < 1:
        return {"plan": plan, "allow_s": DAILY_QUEST_S if plan == "free" else LIMITS[plan]["call_s"], "charge": "daily"}
    if plan == "free":
        if remaining(acc, "calls", plan) >= 1:
            return {"plan": plan, "allow_s": LIMITS["free"]["call_s"], "charge": "call"}
        if credits_left(acc) >= 1:
            return {"plan": plan, "allow_s": LIMITS["free"]["call_s"], "charge": "credit"}
        raise Denied("daily" if daily else "calls", MESSAGES["daily"] if daily else MESSAGES["calls"])
    left = remaining(acc, "live_s", plan)
    if left < 45:
        raise Denied("minutes", MESSAGES["minutes"])
    return {"plan": plan, "allow_s": int(min(LIMITS[plan]["call_s"], left)), "charge": "minutes"}


def charge_start(acc: dict, allowance: dict) -> None:
    """Counted when the call opens (uses), so a crash can't make calls free. Minutes are counted at the end."""
    aid, ch = acc["id"], allowance["charge"]
    if ch == "onboarding":
        add_use(aid, "onboarding", 1, "all")
    elif ch == "daily":
        add_use(aid, "daily", 1, day())
    elif ch == "call":
        add_use(aid, "calls", 1)
    elif ch == "credit":
        add_use(aid, "credits", 1, "all")


def charge_end(acc: dict, allowance: dict, seconds: float, spoke: bool) -> None:
    """When the call is read back: paid plans pay in seconds; a call where nothing was said is given back."""
    aid, ch = acc["id"], allowance["charge"]
    if ch == "minutes":
        add_use(aid, "live_s", max(0.0, min(seconds, LIMITS.get(allowance["plan"], LIMITS["plus"])["call_s"] + 60)))
    elif not spoke:
        if ch == "call":
            add_use(aid, "calls", -1)
        elif ch == "credit":
            add_use(aid, "credits", -1, "all")
        elif ch == "daily":
            add_use(aid, "daily", -1, day())
        elif ch == "onboarding":
            add_use(aid, "onboarding", -1, "all")


def status(acc: dict, refresh: bool = False) -> dict:
    """Everything the app and the site show about an account."""
    plan = plan_of(acc, refresh=refresh)
    lim = LIMITS[plan]
    left = {k: (None if lim.get(k) is None else max(0, int(lim[k] - used(acc["id"], k)))) for k in ("calls", "clips", "poise", "profiles", "fits")}
    out = {
        "id": acc["id"],
        "name": acc.get("name") or "",
        "email": acc.get("email") or None,
        "apple": bool(acc.get("apple_sub")),
        "saved": bool(acc.get("email") or acc.get("apple_sub")),
        "waitlist_no": acc.get("waitlist_no"),
        "plan": plan,
        "plan_until": acc.get("plan_until") if plan != "free" else None,
        "week": week(),
        "left": left,
        "credits": credits_left(acc),
        "daily_done": used(acc["id"], "daily", day()) >= 1,
        "live_min_left": None if plan == "free" else int(remaining(acc, "live_s", plan) // 60),
        "live_min_week": None if plan == "free" else int(lim["live_s"] // 60),
        "subject": subject_of(acc),
    }
    return out


# ---------------------------------------------------------------- the site's Members page

def save_summary(acc: dict, body: dict) -> None:
    """A small summary the app sends (Index, streak, recent reads) so Members on the site can show it."""
    keep = {
        "index": body.get("index") if isinstance(body.get("index"), (int, float)) else None,
        "tier": str(body.get("tier") or "")[:20],
        "streak": int(body.get("streak") or 0) if str(body.get("streak") or "0").isdigit() else 0,
        "sessions": int(body.get("sessions") or 0) if str(body.get("sessions") or "0").isdigit() else 0,
        "laurels": int(body.get("laurels") or 0) if str(body.get("laurels") or "0").isdigit() else 0,
        "archetype": str(body.get("archetype") or "")[:40],
        "recent": [
            {"title": str(r.get("title") or "")[:60], "rating": int(r["rating"]) if isinstance(r.get("rating"), (int, float)) else None, "at": str(r.get("at") or "")[:24]}
            for r in (body.get("recent") or [])[:8]
            if isinstance(r, dict)
        ],
    }
    with db() as c:
        c.execute("insert into summaries(account_id, body, updated) values (?,?,?) on conflict(account_id) do update set body=excluded.body, updated=excluded.updated", (acc["id"], json.dumps(keep), time.time()))


def summary(acc: dict) -> dict | None:
    with db() as c:
        r = c.execute("select body, updated from summaries where account_id=?", (acc["id"],)).fetchone()
    if not r:
        return None
    return {**json.loads(r["body"]), "updated": r["updated"]}


# ---------------------------------------------------------------- deletion

def delete(acc: dict) -> None:
    """Apple requires in-app account deletion. Everything keyed to the account goes; the row is tombstoned so the
    id can never be reissued."""
    with db() as c:
        c.execute("update tokens set revoked=? where account_id=?", (time.time(), acc["id"]))
        c.execute("delete from usage where account_id=?", (acc["id"],))
        c.execute("delete from summaries where account_id=?", (acc["id"],))
        c.execute("update accounts set email=null, apple_sub=null, subject=null, name=null, deleted=? where id=?", (time.time(), acc["id"]))
