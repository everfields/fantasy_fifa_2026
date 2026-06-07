-- ============================================================================
-- Mundial 2026 Pool — Functions
-- Migration 0003: standings aggregation + audit helper.
--
-- IMPORTANT: scoring MATH (points per prediction) lives in TypeScript
-- (lib/scoring) and is written into predictions.points_awarded /
-- bonus_answers.points_awarded by the app. These functions ONLY aggregate
-- those already-computed values into standings_cache. No scoring logic here.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- refresh_standings()
-- Recomputes standings_cache for every profile by aggregating:
--   total_points = sum(predictions.points_awarded) + sum(bonus.points_awarded)
--   exact_hits   = count of predictions where the exact scoreline was hit
--                  (home_pred = home_score AND away_pred = away_score on a
--                   finished match). This is a structural "exact" count for the
--                   tie-breaker; it does NOT recompute scoring values.
--   bonus_points = sum(bonus_answers.points_awarded)
-- Rank is assigned with the tie-breaker order:
--   total_points DESC -> exact_hits DESC -> bonus_points DESC.
-- Players with equal (total, exact, bonus) share the same rank (rank() / ties).
--
-- SECURITY DEFINER so an admin (or the service role) can invoke it through RLS;
-- it fully rewrites the cache (delete + insert) so it is idempotent.
-- ----------------------------------------------------------------------------
create or replace function refresh_standings()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Aggregate per user.
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
  combined as (
    select
      pr.id as user_id,
      pr.display_name,
      pr.avatar,
      coalesce(pa.pred_points, 0) + coalesce(ba.bonus_points, 0) as total_points,
      coalesce(pa.exact_hits, 0) as exact_hits,
      coalesce(ba.bonus_points, 0) as bonus_points
    from profiles pr
    left join pred_agg  pa on pa.user_id = pr.id
    left join bonus_agg ba on ba.user_id = pr.id
  ),
  ranked as (
    select
      c.*,
      rank() over (
        order by c.total_points desc, c.exact_hits desc, c.bonus_points desc
      ) as rank
    from combined c
  )
  -- Idempotent rewrite of the cache.
  merge into standings_cache s
  using ranked r on s.user_id = r.user_id
  when matched then update set
    display_name = r.display_name,
    avatar       = r.avatar,
    total_points = r.total_points,
    exact_hits   = r.exact_hits,
    bonus_points = r.bonus_points,
    rank         = r.rank,
    updated_at   = now()
  when not matched then insert
    (user_id, display_name, avatar, total_points, exact_hits, bonus_points, rank, updated_at)
    values
    (r.user_id, r.display_name, r.avatar, r.total_points, r.exact_hits, r.bonus_points, r.rank, now())
  when not matched by source then
    delete;
end;
$$;

-- ----------------------------------------------------------------------------
-- log_audit() — convenience helper to append an audit_log entry.
-- Uses auth.uid() as actor when available (falls back to explicit p_actor).
-- SECURITY DEFINER so it can write through RLS from server/admin contexts.
-- ----------------------------------------------------------------------------
create or replace function log_audit(
  p_action      text,
  p_target_type text,
  p_target_id   text default null,
  p_before      jsonb default null,
  p_after       jsonb default null,
  p_actor       uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into audit_log (actor_id, action, target_type, target_id, "before", "after")
  values (coalesce(p_actor, auth.uid()), p_action, p_target_type, p_target_id, p_before, p_after)
  returning id into new_id;
  return new_id;
end;
$$;
