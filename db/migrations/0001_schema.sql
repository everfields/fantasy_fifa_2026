-- ============================================================================
-- Mundial 2026 Pool — Schema
-- Migration 0001: tables, enums, triggers, default settings.
-- Mirrors lib/types.ts and PROJECT_PLAN.md section 2.
-- Apply order: 0001_schema.sql -> 0002_rls.sql -> 0003_functions.sql -> seed/seed.sql
-- ============================================================================

-- Needed for gen_random_uuid()
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Enums (mirror the TS string unions exactly)
-- ----------------------------------------------------------------------------
do $$ begin
  create type role as enum ('player', 'admin');                          -- Role
exception when duplicate_object then null; end $$;

do $$ begin
  create type match_status as enum ('scheduled', 'live', 'finished');    -- MatchStatus
exception when duplicate_object then null; end $$;

do $$ begin
  create type stage as enum (
    'group', 'round_of_32', 'round_of_16',
    'quarter', 'semi', 'third_place', 'final'                            -- Stage
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type bonus_type as enum ('single', 'multi', 'numeric');         -- BonusType
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- app_settings: single jsonb row, source of truth for the scoring engine.
-- A one-row table is enforced via a CHECK on a fixed primary key.
-- ----------------------------------------------------------------------------
create table if not exists app_settings (
  id          integer primary key default 1 check (id = 1),
  settings    jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Seed the single row with DEFAULT_APP_SETTINGS from lib/types.ts.
insert into app_settings (id, settings)
values (
  1,
  jsonb_build_object(
    'scoring', jsonb_build_object(
      'exact', 5,
      'sign', 3,
      'diff_bonus', 1,
      'joker_multiplier', 2,
      'exact_enabled', true,
      'sign_enabled', true,
      'diff_bonus_enabled', true
    ),
    'jokers_per_user', 3,
    'pot_amount', 0,
    'season_locked', false,
    'live_polling_seconds', 60
  )
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- profiles: 1:1 with auth.users (Profile)
-- ----------------------------------------------------------------------------
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,
  avatar        text,
  role          role not null default 'player',
  joker_count   integer not null default 0 check (joker_count >= 0),
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- teams (Team)
-- ----------------------------------------------------------------------------
create table if not exists teams (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  code           text not null unique,                  -- 3-letter FIFA code
  flag_url       text,
  "group"        text check ("group" is null or "group" ~ '^[A-L]$'),
  is_eliminated  boolean not null default false
);

-- ----------------------------------------------------------------------------
-- matches (Match). locks_at defaults to kickoff; both stored explicitly.
-- ----------------------------------------------------------------------------
create table if not exists matches (
  id                 uuid primary key default gen_random_uuid(),
  home_team          uuid references teams(id) on delete set null,
  away_team          uuid references teams(id) on delete set null,
  stage              stage not null,
  "group"            text check ("group" is null or "group" ~ '^[A-L]$'),
  kickoff_at         timestamptz not null,
  home_score         integer check (home_score is null or home_score >= 0),
  away_score         integer check (away_score is null or away_score >= 0),
  status             match_status not null default 'scheduled',
  locks_at           timestamptz not null,              -- = kickoff
  provider_match_id  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists matches_kickoff_idx on matches (kickoff_at);
create index if not exists matches_locks_at_idx on matches (locks_at);
create index if not exists matches_stage_idx on matches (stage);

-- ----------------------------------------------------------------------------
-- predictions (Prediction). One per (user, match).
-- points_awarded is computed in TypeScript (lib/scoring); null = not yet scored.
-- ----------------------------------------------------------------------------
create table if not exists predictions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  match_id        uuid not null references matches(id) on delete cascade,
  home_pred       integer not null check (home_pred >= 0),
  away_pred       integer not null check (away_pred >= 0),
  is_joker        boolean not null default false,
  points_awarded  integer,                              -- null = not yet scored
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, match_id)
);

create index if not exists predictions_match_idx on predictions (match_id);
create index if not exists predictions_user_idx on predictions (user_id);

-- ----------------------------------------------------------------------------
-- bonus_questions (BonusQuestion)
-- options: jsonb array of strings for single/multi; null for numeric.
-- correct_answer: jsonb — string | string[] | number | null.
-- ----------------------------------------------------------------------------
create table if not exists bonus_questions (
  id              uuid primary key default gen_random_uuid(),
  text            text not null,
  type            bonus_type not null,
  options         jsonb,
  points          integer not null default 0 check (points >= 0),
  correct_answer  jsonb,
  locks_at        timestamptz not null,
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- bonus_answers (BonusAnswer). One per (user, question).
-- answer: jsonb — string | string[] | number.
-- points_awarded computed in TS; null = not yet scored.
-- ----------------------------------------------------------------------------
create table if not exists bonus_answers (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  question_id     uuid not null references bonus_questions(id) on delete cascade,
  answer          jsonb not null,
  points_awarded  integer,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, question_id)
);

create index if not exists bonus_answers_question_idx on bonus_answers (question_id);
create index if not exists bonus_answers_user_idx on bonus_answers (user_id);

-- ----------------------------------------------------------------------------
-- standings_cache (StandingRow, materialized). Recomputed by refresh_standings().
-- display_name/avatar are denormalized copies for cheap reads.
-- ----------------------------------------------------------------------------
create table if not exists standings_cache (
  user_id       uuid primary key references profiles(id) on delete cascade,
  display_name  text not null,
  avatar        text,
  total_points  integer not null default 0,
  exact_hits    integer not null default 0,
  bonus_points  integer not null default 0,
  rank          integer not null default 0,
  updated_at    timestamptz not null default now()
);

create index if not exists standings_cache_rank_idx on standings_cache (rank);

-- ----------------------------------------------------------------------------
-- audit_log (AuditEntry)
-- ----------------------------------------------------------------------------
create table if not exists audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references profiles(id) on delete set null,
  action       text not null,
  target_type  text not null,
  target_id    text,
  "before"     jsonb,
  "after"      jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists audit_log_actor_idx on audit_log (actor_id);
create index if not exists audit_log_created_idx on audit_log (created_at desc);

-- ----------------------------------------------------------------------------
-- updated_at maintenance trigger
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists matches_set_updated_at on matches;
create trigger matches_set_updated_at
  before update on matches
  for each row execute function set_updated_at();

drop trigger if exists predictions_set_updated_at on predictions;
create trigger predictions_set_updated_at
  before update on predictions
  for each row execute function set_updated_at();

drop trigger if exists bonus_answers_set_updated_at on bonus_answers;
create trigger bonus_answers_set_updated_at
  before update on bonus_answers
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Auto-create a profile when a new auth.users row is inserted.
-- role defaults to 'player'; joker_count is read from app_settings.jokers_per_user.
-- display_name falls back to email local-part / 'Player' if no metadata.
-- ----------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_jokers integer;
  dn text;
begin
  select coalesce((settings ->> 'jokers_per_user')::int, 0)
    into default_jokers
    from app_settings
    where id = 1;

  dn := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(split_part(new.email, '@', 1), ''),
    'Player'
  );

  insert into public.profiles (id, display_name, role, joker_count)
  values (new.id, dn, 'player', coalesce(default_jokers, 0))
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
