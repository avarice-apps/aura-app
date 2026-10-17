"""Training data store. SQLite locally; swap for Supabase Postgres + Storage in production (schema in supabase/migrations/0002_training.sql).

Only clips from users who opted in are stored here. Clips are kept up to 12 months and removed on withdrawal.
"""
from __future__ import annotations

import json
import os
import secrets
import shutil
import sqlite3
import time
import uuid
from contextlib import contextmanager

ROOT = os.environ.get("AURA_TRAIN_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "training_data"))
DB = os.path.join(ROOT, "aura_train.sqlite")
CLIPS = os.path.join(ROOT, "clips")
RETENTION_DAYS = 365

# What raters score. 1–7 Likert. Wording matters: these are perceptions, not diagnoses.
DIMENSIONS = {
    "confident": "How confident did they seem?",
    "warm": "How warm or likeable did they seem?",
    "nervous": "How nervous did they seem?",
    "clear": "How clear and easy to follow were they?",
    "trust": "How much would you trust what they said?",
    "engage": "How much would you want to keep listening?",
}


def _init():
    os.makedirs(CLIPS, exist_ok=True)
    with sqlite3.connect(DB) as c:
        c.executescript(
            """
            create table if not exists clips (
              id text primary key,
              subject_id text not null,
              created_at real not null,
              prompt_text text,
              path text not null,
              duration_s real,
              features text not null,   -- json: voice + presence facts (numbers only)
              rubric text not null      -- json: axes + index at time of read
            );
            create index if not exists clips_subject on clips(subject_id);
            create table if not exists raters (
              id text primary key,
              token text unique not null,
              label text,
              created_at real not null,
              active integer not null default 1
            );
            create table if not exists ratings (
              id integer primary key autoincrement,
              clip_id text not null references clips(id) on delete cascade,
              rater_id text not null references raters(id),
              dims text not null,       -- json {dimension: 1..7}
              watched_s real,
              created_at real not null,
              unique(clip_id, rater_id)
            );
            """
        )


@contextmanager
def db():
    _init()
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    c.execute("pragma foreign_keys = on")
    try:
        yield c
        c.commit()
    finally:
        c.close()


def save_clip(*, video_path: str, subject_id: str, prompt_text: str, features: dict, rubric: dict) -> str:
    cid = f"c_{uuid.uuid4().hex[:12]}"
    _init()
    dest = os.path.join(CLIPS, f"{cid}.mp4")
    shutil.copyfile(video_path, dest)
    with db() as c:
        c.execute(
            "insert into clips values (?,?,?,?,?,?,?,?)",
            (cid, subject_id, time.time(), prompt_text, dest, features.get("voice", {}).get("duration_s"), json.dumps(features), json.dumps(rubric)),
        )
    return cid


def withdraw(subject_id: str) -> int:
    with db() as c:
        rows = c.execute("select id, path from clips where subject_id=?", (subject_id,)).fetchall()
        for r in rows:
            if os.path.exists(r["path"]):
                os.remove(r["path"])
        c.execute("delete from ratings where clip_id in (select id from clips where subject_id=?)", (subject_id,))
        c.execute("delete from clips where subject_id=?", (subject_id,))
    return len(rows)


def purge_expired() -> int:
    cutoff = time.time() - RETENTION_DAYS * 86400
    with db() as c:
        rows = c.execute("select id, path from clips where created_at < ?", (cutoff,)).fetchall()
        for r in rows:
            if os.path.exists(r["path"]):
                os.remove(r["path"])
        c.execute("delete from ratings where clip_id in (select id from clips where created_at < ?)", (cutoff,))
        c.execute("delete from clips where created_at < ?", (cutoff,))
    return len(rows)


def create_rater(label: str) -> dict:
    rid = f"r_{uuid.uuid4().hex[:8]}"
    token = secrets.token_urlsafe(18)
    with db() as c:
        c.execute("insert into raters values (?,?,?,?,1)", (rid, token, label, time.time()))
    return {"id": rid, "token": token, "label": label}


def rater_for(token: str):
    with db() as c:
        return c.execute("select * from raters where token=? and active=1", (token,)).fetchone()


def next_clip(rater_id: str, target_ratings: int = 3):
    """Least-rated clip this rater hasn't seen; stops offering a clip once it has target_ratings."""
    with db() as c:
        return c.execute(
            """
            select c.id, c.prompt_text, c.duration_s, count(r.id) n
            from clips c left join ratings r on r.clip_id = c.id
            where c.id not in (select clip_id from ratings where rater_id = ?)
            group by c.id having n < ?
            order by n asc, random() limit 1
            """,
            (rater_id, target_ratings),
        ).fetchone()


def clip_path(cid: str) -> str | None:
    with db() as c:
        r = c.execute("select path from clips where id=?", (cid,)).fetchone()
        return r["path"] if r else None


def add_rating(clip_id: str, rater_id: str, dims: dict, watched_s: float):
    clean = {k: int(v) for k, v in dims.items() if k in DIMENSIONS and 1 <= int(v) <= 7}
    if len(clean) != len(DIMENSIONS):
        raise ValueError("all dimensions required, 1–7")
    with db() as c:
        c.execute(
            "insert or replace into ratings (clip_id, rater_id, dims, watched_s, created_at) values (?,?,?,?,?)",
            (clip_id, rater_id, json.dumps(clean), watched_s, time.time()),
        )


def stats() -> dict:
    with db() as c:
        clips = c.execute("select count(*) from clips").fetchone()[0]
        ratings = c.execute("select count(*) from ratings").fetchone()[0]
        ready = c.execute("select count(*) from (select clip_id from ratings group by clip_id having count(*) >= 2)").fetchone()[0]
        raters = c.execute("select count(*) from raters where active=1").fetchone()[0]
    return {"clips": clips, "ratings": ratings, "clips_with_2plus_ratings": ready, "raters": raters}


def export_rows():
    with db() as c:
        clips = {r["id"]: dict(r) for r in c.execute("select * from clips")}
        ratings = [dict(r) for r in c.execute("select * from ratings")]
    return clips, ratings
