-- ============================================================================
-- Mundial 2026 Pool — Admin Tools
-- Migration 0006: manual grading of free-text bonus answers, arbitrary admin
-- point adjustments, and the standings aggregation that folds them in.
-- Mirrors the UPDATED lib/types.ts (BonusAnswer.manual_correct, PointAdjustment,
-- StandingRow.adjustment_points).
--
-- Apply order: 0001_schema.sql -> 0002_rls.sql -> 0003_functions.sql
--              -> 0004_scoring_overhaul.sql -> 0006_admin_tools.sql
--              -> seed/seed.sql
--
-- IMPORTANT — scoring MATH still lives in TypeScript (lib/scoring). These SQL
-- objects only store admin grading flags / adjustments and AGGREGATE the
-- already-computed points (predictions.points_awarded, bonus_answers
-- .points_awarded, round_awards.points, point_adjustments.points) into
-- standings_cache. No scoring formulas here.
--
-- This file has NO explicit begin/commit (autocommit per-statement, matching the
-- project convention). It does not touch any enum, so it carries none of the
-- `alter type` transaction caveats of 0004.
--
-- NOTE — deleting a bonus question needs NO schema change here: bonus_answers
-- .question_id already FK-cascades (on delete cascade, see 0001_schema.sql), so
-- removing a question drops its answers automatically. This migration only adds
-- the manual-grading flag, the adjustments table, and the standings rollup.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. bonus_answers.manual_correct — admin's manual verdict for 'text'-type
--    questions (free-text answers graded by hand). Nullable, no default:
--    null = not yet graded; true/false = admin's decision.
-- ----------------------------------------------------------------------------
alter table bonus_answers
  add column if not exists manual_correct boolean;

-- ----------------------------------------------------------------------------
-- Protect admin-only columns on bonus_answers from player writes.
--
-- Why a trigger (not column grants / extra policies): players legitimately
-- UPDATE their own bonus_answers row (an upsert of `answer`) while the question
-- is open — the 0002_rls.sql bonus_answers_update policy allows that on
-- ownership + lock only. But `manual_correct` and `points_awarded` are scored /
-- graded server-side and must NOT be settable by the owner during that upsert.
-- RLS is row-level (it cannot pin individual columns), and Supabase's blanket
-- UPDATE grant to `authenticated` makes column-level REVOKE brittle. The
-- consistent, idempotent fix is a BEFORE UPDATE trigger that, for any caller
-- who is NOT an admin (is_admin() from 0002) and is NOT the service role,
-- forces these two columns back to their OLD values. The service role and
-- SECURITY DEFINER scoring paths (which run as a privileged role, not
-- 'authenticated') are exempt, so the scoring engine can still write them.
-- ----------------------------------------------------------------------------
create or replace function bonus_answers_protect_admin_cols()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted callers may set the protected columns freely:
  --   * the service role (used by the scoring engine / cron), and
  --   * an admin profile (is_admin()).
  if current_user = 'service_role' or is_admin() then
    return new;
  end if;

  -- Everyone else (an ordinary player upserting their own answer): pin the
  -- admin-/scoring-owned columns to their previous values.
  new.manual_correct := old.manual_correct;
  new.points_awarded := old.points_awarded;
  return new;
end;
$$;

drop trigger if exists bonus_answers_protect_manual_correct on bonus_answers;
create trigger bonus_answers_protect_manual_correct
  before update on bonus_answers
  for each row execute function bonus_answers_protect_admin_cols();

-- ----------------------------------------------------------------------------
-- 2. point_adjustments (PointAdjustment) — arbitrary admin point adjustments
--    for unforeseen events. `points` may be negative. Every row carries a
--    non-empty human-readable reason. Summed into standings by
--    refresh_standings(). created_by is the admin profile (nullable / set null
--    if that admin is later removed).
-- ----------------------------------------------------------------------------
create table if not exists point_adjustments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  points      integer not null,                         -- negatives allowed (no check)
  reason      text not null check (length(trim(reason)) > 0),
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists point_adjustments_user_idx on point_adjustments (user_id);

-- ----------------------------------------------------------------------------
-- RLS for point_adjustments — readable by all authenticated members (it affects
-- the public leaderboard); writes only via service role / SECURITY DEFINER /
-- admin. Players cannot insert/update/delete. Mirrors the round_awards pattern
-- in 0004_scoring_overhaul.sql.
-- ----------------------------------------------------------------------------
alter table point_adjustments enable row level security;

drop policy if exists point_adjustments_select on point_adjustments;
create policy point_adjustments_select on point_adjustments
  for select to authenticated
  using (true);

drop policy if exists point_adjustments_admin_write on point_adjustments;
create policy point_adjustments_admin_write on point_adjustments
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ----------------------------------------------------------------------------
-- 3. standings_cache — add adjustment_points (sum of point_adjustments.points
--    per user; can be negative).
-- ----------------------------------------------------------------------------
alter table standings_cache
  add column if not exists adjustment_points integer not null default 0;

-- ----------------------------------------------------------------------------
-- 4. refresh_standings() — now also folds point_adjustments.points into
--    total_points and populates standings_cache.adjustment_points.
--      total_points = sum(predictions.points_awarded)
--                   + sum(bonus_answers.points_awarded)
--                   + sum(round_awards.points)
--                   + sum(point_adjustments.points)        -- NEW (may be < 0)
--      adjustment_points = sum(point_adjustments.points)   -- NEW
--    Tie-breakers UNCHANGED: total_points DESC -> exact_hits DESC ->
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
  adj_agg as (
    select
      pj.user_id,
      coalesce(sum(pj.points), 0)::int as adjustment_points
    from point_adjustments pj
    group by pj.user_id
  ),
  combined as (
    select
      pr.id as user_id,
      pr.display_name,
      pr.avatar,
      coalesce(pa.pred_points, 0)
        + coalesce(ba.bonus_points, 0)
        + coalesce(ma.meta_points, 0)
        + coalesce(aa.adjustment_points, 0) as total_points,
      coalesce(pa.exact_hits, 0)        as exact_hits,
      coalesce(ba.bonus_points, 0)      as bonus_points,
      coalesce(ma.meta_points, 0)       as meta_points,
      coalesce(aa.adjustment_points, 0) as adjustment_points
    from profiles pr
    left join pred_agg  pa on pa.user_id = pr.id
    left join bonus_agg ba on ba.user_id = pr.id
    left join meta_agg  ma on ma.user_id = pr.id
    left join adj_agg   aa on aa.user_id = pr.id
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
    display_name      = r.display_name,
    avatar            = r.avatar,
    total_points      = r.total_points,
    exact_hits        = r.exact_hits,
    bonus_points      = r.bonus_points,
    meta_points       = r.meta_points,
    adjustment_points = r.adjustment_points,
    rank              = r.rank,
    updated_at        = now()
  when not matched then insert
    (user_id, display_name, avatar, total_points, exact_hits, bonus_points,
     meta_points, adjustment_points, rank, updated_at)
    values
    (r.user_id, r.display_name, r.avatar, r.total_points, r.exact_hits,
     r.bonus_points, r.meta_points, r.adjustment_points, r.rank, now())
  when not matched by source then
    delete;
end;
$$;
