-- ============================================================================
-- 0012 — Fix: bonus_answers protect trigger silently dropped EVERY scored
--        points_awarded write (ADR-0020).
--
-- BUG. `bonus_answers_protect_admin_cols()` (0006) pins `manual_correct` and
-- `points_awarded` back to their OLD values for any caller that is neither the
-- service role nor an admin, so ordinary players cannot self-grade. Its
-- exemption test is `current_user = 'service_role' or is_admin()`. But the
-- function was declared `security definer`, and inside a SECURITY DEFINER
-- routine `current_user` is the function OWNER (the migration role, e.g.
-- `postgres`) — NEVER the session's `service_role`. For a keyed service call
-- `is_admin()` is also false (auth.uid() is null). So BOTH exemption branches
-- fail and the else-branch runs for the scoring engine too: every recalc /
-- closeBonus / gradeTextAnswer write to bonus_answers.points_awarded was
-- silently reverted to null. Net effect: bonus points (group-winner, etc.)
-- never reached refresh_standings(), which sums points_awarded.
--
-- FIX. Recreate the function as `security invoker` (the original intent — its
-- own comment says it should run "as a privileged role, not 'authenticated'").
-- Under SECURITY INVOKER, `current_user` reflects PostgREST's per-request
-- `SET ROLE`, so it correctly equals 'service_role' for service calls and
-- 'authenticated' for players. is_admin() stays SECURITY DEFINER and works
-- regardless. The guard only reads OLD/NEW + is_admin(); it needs no elevated
-- privilege, so INVOKER is safe.
--
-- Additive-only and idempotent: replaces a function in place, recreates the
-- trigger, touches NO player data, no schema change.
-- ============================================================================

create or replace function bonus_answers_protect_admin_cols()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Trusted callers may set the protected columns freely:
  --   * the service role (used by the scoring engine / cron), and
  --   * an admin profile (is_admin()).
  -- SECURITY INVOKER: current_user is the per-request role (service_role /
  -- authenticated), NOT this function's owner — that is what makes the
  -- 'service_role' check meaningful.
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
