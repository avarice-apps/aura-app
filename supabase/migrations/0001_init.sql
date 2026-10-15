-- Aura schema. Supabase Postgres. Face templates are never stored; clips auto-delete at 30 days.

create extension if not exists "pgcrypto";

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  intensity text not null default 'straight' check (intensity in ('straight','unsparing')),
  age_confirmed_at timestamptz,
  biometric_consent_at timestamptz,
  plan text not null default 'free' check (plan in ('free','plus','pro')),
  trial_ends_at timestamptz,
  streak int not null default 0,
  last_gauntlet_day date,
  freezes_left int not null default 1,
  tells_cleared int not null default 0,
  witness_user_id uuid references auth.users,
  created_at timestamptz not null default now()
);

create table reads (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  prompt_id text not null,
  prompt_text text not null,
  is_reread boolean not null default false,
  index int not null,
  band int not null,
  axes jsonb not null,            -- {voice,presence,command,composure,read}
  archetype text not null,
  tells jsonb not null,           -- [{id,title,evidence,axis}]
  drill jsonb not null,           -- {title,body,minutes,expiresAt,doneAt}
  script text not null,
  audio_path text,                -- storage path for Poise's mp3
  facts jsonb not null,           -- measured voice + presence facts; numbers only
  model text,
  clip_path text,                 -- storage path; purged by the 30-day job
  clip_expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now()
);
create index reads_user_created on reads (user_id, created_at desc);

create table tells (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  axis text not null,
  opened_at timestamptz not null default now(),
  cleared_at timestamptz,         -- set after two consecutive reads without it
  clean_streak int not null default 0
);
create index tells_user_open on tells (user_id) where cleared_at is null;

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  mode text not null check (mode in ('pressure','room','silence','drill','gauntlet','duet','cold','reference')),
  score int,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index sessions_user_mode on sessions (user_id, mode, created_at desc);

create table seasons (
  id serial primary key,
  starts_on date not null,
  ends_on date not null
);

create table leagues (
  id uuid primary key default gen_random_uuid(),
  season_id int not null references seasons,
  index_band int not null         -- e.g. 40 = indexes 40..49
);

create table standings (
  league_id uuid not null references leagues on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  points int not null default 0,  -- gauntlets + index movement
  rank int,
  primary key (league_id, user_id)
);

create table duets (
  id uuid primary key default gen_random_uuid(),
  prompt_id text not null,
  inviter_id uuid not null references auth.users on delete cascade,
  invitee_id uuid references auth.users on delete set null,
  inviter_read_id text references reads,
  invitee_read_id text references reads,
  revealed_at timestamptz,
  created_at timestamptz not null default now()
);

create table events (
  id bigserial primary key,
  user_id uuid references auth.users on delete cascade,
  name text not null,             -- paywall_view, verdict_unblur, reread_complete, cancel_step ...
  props jsonb,
  created_at timestamptz not null default now()
);
create index events_name_created on events (name, created_at desc);

-- Row level security
alter table profiles enable row level security;
alter table reads enable row level security;
alter table tells enable row level security;
alter table sessions enable row level security;
alter table standings enable row level security;
alter table duets enable row level security;
alter table events enable row level security;

create policy "own profile" on profiles for all using (auth.uid() = id);
create policy "own reads" on reads for all using (auth.uid() = user_id);
create policy "own tells" on tells for all using (auth.uid() = user_id);
create policy "own sessions" on sessions for all using (auth.uid() = user_id);
create policy "league visible" on standings for select using (true);
create policy "own standing" on standings for update using (auth.uid() = user_id);
create policy "duet parties" on duets for all using (auth.uid() = inviter_id or auth.uid() = invitee_id);
create policy "own events" on events for insert with check (auth.uid() = user_id);

-- Delete everything: one function, called from Settings.
create or replace function delete_me() returns void language plpgsql security definer as $$
begin
  delete from reads where user_id = auth.uid();
  delete from tells where user_id = auth.uid();
  delete from sessions where user_id = auth.uid();
  delete from standings where user_id = auth.uid();
  delete from events where user_id = auth.uid();
  delete from profiles where id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;

-- 30-day clip purge (schedule with pg_cron: select cron.schedule('purge-clips', '0 4 * * *', $$select purge_clips()$$);)
create or replace function purge_clips() returns void language sql security definer as $$
  update reads set clip_path = null where clip_path is not null and clip_expires_at < now();
$$;
