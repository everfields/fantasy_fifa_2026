-- ============================================================================
-- Mundial 2026 Pool — Scoring System Overhaul
-- Migration 0004: admin-assigned jokers, ~10x scoring magnitudes, the new
-- "meta volante" (round-champion) award, a free-text bonus type, and group-stage
-- matchday tagging. Mirrors the UPDATED lib/types.ts.
--
-- Apply order: 0001_schema.sql -> 0002_rls.sql -> 0003_functions.sql
--              -> 0004_scoring_overhaul.sql -> seed/seed.sql
--
-- IMPORTANT — scoring MATH still lives in TypeScript (lib/scoring). These SQL
-- objects only store admin-configured flags and AGGREGATE already-computed
-- points (predictions.points_awarded, bonus_answers.points_awarded,
-- round_awards.points) into standings_cache. No scoring formulas here.
--
-- !! POSTGRES `ALTER TYPE ... ADD VALUE` CAVEAT (read before applying) !!
-- `alter type <enum> add value` cannot run inside a transaction block that
-- ALSO uses the new value, and historically could not run inside an explicit
-- transaction at all. This migration file therefore contains NO explicit
-- `begin`/`commit`: when applied with `psql -f` it runs in autocommit mode,
-- so each statement (including the enum addition) is its own committed
-- transaction. The new `'text'` value is NOT referenced by any other statement
-- in this file (no CHECK / DML depends on it), so ordering is safe.
-- DO NOT wrap this file in a transaction, and DO NOT run it bundled with other
-- migrations inside a single explicit transaction, or the enum addition will
-- error with: "ALTER TYPE ... ADD cannot run inside a transaction block".
-- (Supabase CLI `db push` / the dashboard SQL editor apply each file
--  independently in autocommit — this is the intended path.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. matches — two new columns.
--    is_joker : admin-designated joker match (×joker_multiplier for ALL users).
--               Default false; admin assigns in the UI. No seeded defaults.
--    matchday : group-stage matchday 1/2/3; null for knockouts.
-- ----------------------------------------------------------------------------
alter table matches
  add column if not exists is_joker boolean not null default false;

alter table matches
  add column if not exists matchday smallint
  check (matchday is null or matchday between 1 and 3);

create index if not exists matches_matchday_idx on matches (matchday);

-- ----------------------------------------------------------------------------
-- 2. bonus_type enum — add 'text' (free-text answer; case-insensitive match).
--    Must be its own committed statement (see caveat header above).
-- ----------------------------------------------------------------------------
alter type bonus_type add value if not exists 'text';

-- ----------------------------------------------------------------------------
-- 3. round_awards — "meta volante" / round-champion awards (RoundAward).
--    The player with the most prediction points within a round earns `points`
--    (config: meta_volante_points). One row per (round_key, user). Computed
--    during recalc by the app/service role; summed into standings.
--    round_points stores the player's prediction points in that round (audit).
-- ----------------------------------------------------------------------------
create table if not exists round_awards (
  id            uuid primary key default gen_random_uuid(),
  round_key     text not null,                  -- 'group-md1'..'group-md3','round_of_32','round_of_16','quarter','semi','final'
  user_id       uuid not null references profiles(id) on delete cascade,
  points        integer not null,               -- the award (meta_volante_points, e.g. 100)
  round_points  integer not null default 0,     -- player's prediction points in that round (audit/display)
  created_at    timestamptz not null default now(),
  unique (round_key, user_id)
);

create index if not exists round_awards_user_idx on round_awards (user_id);
create index if not exists round_awards_round_idx on round_awards (round_key);

-- ----------------------------------------------------------------------------
-- 4. RLS for round_awards — public-read to all authenticated members (like
--    standings_cache); writes only via service role / SECURITY DEFINER / admin.
--    Players cannot insert/update/delete. Mirrors the standings_cache pattern
--    in 0002_rls.sql.
-- ----------------------------------------------------------------------------
alter table round_awards enable row level security;

drop policy if exists round_awards_select on round_awards;
create policy round_awards_select on round_awards
  for select to authenticated
  using (true);

drop policy if exists round_awards_admin_write on round_awards;
create policy round_awards_admin_write on round_awards
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ----------------------------------------------------------------------------
-- 5. standings_cache — add meta_points (sum of round_awards.points per user).
-- ----------------------------------------------------------------------------
alter table standings_cache
  add column if not exists meta_points integer not null default 0;

-- ----------------------------------------------------------------------------
-- 6. app_settings — migrate the single config row to the NEW shape, mirroring
--    DEFAULT_APP_SETTINGS in lib/types.ts. Idempotent: replaces the canonical
--    row with the new defaults. (Pre-launch there are no admin customizations
--    worth preserving; the overhaul changes the magnitudes deliberately.)
-- ----------------------------------------------------------------------------
insert into app_settings (id, settings, updated_at)
values (
  1,
  jsonb_build_object(
    'scoring', jsonb_build_object(
      'exact', 50,
      'sign', 20,
      'diff_bonus', 10,
      'joker_multiplier', 3,
      'exact_enabled', true,
      'sign_enabled', true,
      'diff_bonus_enabled', true
    ),
    'bonus_default_points', 100,
    'group_winner_points', 50,
    'meta_volante_points', 100,
    'jokers_per_user', 0,
    'pot_amount', 0,
    'season_locked', false,
    'live_polling_seconds', 60
  ),
  now()
)
on conflict (id) do update set
  settings   = excluded.settings,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- 7. matchday seeding — tag the 72 group-stage matches with 1/2/3.
--    Each group (A–L) has 6 matches = 3 matchdays of 2 matches. Order each
--    group's matches by kickoff_at; the chronological pairs map to matchdays
--    1, 2, 3. Knockouts keep matchday null. Idempotent (re-run yields same).
-- ----------------------------------------------------------------------------
with ordered as (
  select
    id,
    ((row_number() over (
       partition by "group" order by kickoff_at, id
     ) - 1) / 2) + 1 as md
  from matches
  where stage = 'group' and "group" is not null
)
update matches m
   set matchday = o.md
  from ordered o
 where m.id = o.id
   and (m.matchday is distinct from o.md);

-- ----------------------------------------------------------------------------
-- 8. refresh_standings() — now also folds round_awards.points into
--    total_points and populates standings_cache.meta_points.
--      total_points = sum(predictions.points_awarded)
--                   + sum(bonus_answers.points_awarded)
--                   + sum(round_awards.points)
--      meta_points  = sum(round_awards.points)
--    Tie-breakers unchanged: total_points DESC -> exact_hits DESC ->
--    bonus_points DESC. Aggregation only — no scoring math. Idempotent MERGE.
-- ----------------------------------------------------------------------------
create or replace function refresh_standings()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with pred_agg as (
    select
      p.user_id,
      coalesce(sum(p.points_awarded), 0)::int as pred_points,
      coalesce(sum(
        case
          when m.status = 'finished'
           and m.home_score is not null and m.away_score is not null
           and p.home_pred = m.home_score
           and p.away_pred = m.away_score
          then 1 else 0
        end
      ), 0)::int as exact_hits
    from predictions p
    join matches m on m.id = p.match_id
    group by p.user_id
  ),
  bonus_agg as (
    select
      ba.user_id,
      coalesce(sum(ba.points_awarded), 0)::int as bonus_points
    from bonus_answers ba
    group by ba.user_id
  ),
  meta_agg as (
    select
      ra.user_id,
      coalesce(sum(ra.points), 0)::int as meta_points
    from round_awards ra
    group by ra.user_id
  ),
  combined as (
    select
      pr.id as user_id,
      pr.display_name,
      pr.avatar,
      coalesce(pa.pred_points, 0)
        + coalesce(ba.bonus_points, 0)
        + coalesce(ma.meta_points, 0) as total_points,
      coalesce(pa.exact_hits, 0)   as exact_hits,
      coalesce(ba.bonus_points, 0) as bonus_points,
      coalesce(ma.meta_points, 0)  as meta_points
    from profiles pr
    left join pred_agg  pa on pa.user_id = pr.id
    left join bonus_agg ba on ba.user_id = pr.id
    left join meta_agg  ma on ma.user_id = pr.id
  ),
  ranked as (
    select
      c.*,
      rank() over (
        order by c.total_points desc, c.exact_hits desc, c.bonus_points desc
      ) as rank
    from combined c
  )
  merge into standings_cache s
  using ranked r on s.user_id = r.user_id
  when matched then update set
    display_name = r.display_name,
    avatar       = r.avatar,
    total_points = r.total_points,
    exact_hits   = r.exact_hits,
    bonus_points = r.bonus_points,
    meta_points  = r.meta_points,
    rank         = r.rank,
    updated_at   = now()
  when not matched then insert
    (user_id, display_name, avatar, total_points, exact_hits, bonus_points, meta_points, rank, updated_at)
    values
    (r.user_id, r.display_name, r.avatar, r.total_points, r.exact_hits, r.bonus_points, r.meta_points, r.rank, now())
  when not matched by source then
    delete;
end;
$$;
