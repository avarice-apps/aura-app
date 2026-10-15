-- Training data (production mirror of server/training/store.py). Only opted-in users' clips.
alter table profiles add column if not exists training_consent_at timestamptz;
alter table profiles add column if not exists training_withdrawn_at timestamptz;

create table training_clips (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  read_id text references reads on delete set null,
  prompt_text text,
  clip_path text not null,                -- private storage bucket "training"
  duration_s real,
  features jsonb not null,                -- numbers only
  rubric jsonb not null,
  expires_at timestamptz not null default now() + interval '365 days',
  created_at timestamptz not null default now()
);
create index training_clips_user on training_clips (user_id);

create table raters (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  label text,
  reliability real,                       -- updated by the training job
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table ratings (
  id bigserial primary key,
  clip_id text not null references training_clips on delete cascade,
  rater_id uuid not null references raters,
  dims jsonb not null,                    -- {confident,warm,nervous,clear,trust,engage}: 1..7
  watched_s real,
  created_at timestamptz not null default now(),
  unique (clip_id, rater_id)
);

create table model_versions (
  id serial primary key,
  kind text not null default 'perception',
  n_clips int not null,
  metrics jsonb not null,                 -- cv r2 / spearman per dimension
  artifact_path text not null,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

alter table training_clips enable row level security;
alter table ratings enable row level security;
alter table raters enable row level security;
create policy "own training clips visible" on training_clips for select using (auth.uid() = user_id);

-- Withdrawal: removes every training clip and rating for the caller.
create or replace function withdraw_training() returns int language plpgsql security definer as $$
declare n int;
begin
  delete from training_clips where user_id = auth.uid();
  get diagnostics n = row_count;
  update profiles set training_consent_at = null, training_withdrawn_at = now() where id = auth.uid();
  return n;
end $$;

-- 12-month retention.
create or replace function purge_training() returns int language plpgsql security definer as $$
declare n int;
begin
  delete from training_clips where expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;
