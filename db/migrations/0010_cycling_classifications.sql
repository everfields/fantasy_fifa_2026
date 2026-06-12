-- ============================================================================
-- Mundial 2026 Pool — Cycling classifications (clasificaciones ciclistas)
-- Migration 0010: adds the "mountain classification" (maillot de lunares) hook
-- on matches plus a service-role-only email resolver used to pin the fixed
-- maillots (arcoíris / jóvenes) by email rather than by mutable nick.
-- Implements ADR-0014 (in drafting). Mirrors lib/types.ts.
--
-- Apply order: 0001_schema.sql -> 0002_rls.sql -> 0003_functions.sql
--              -> 0004_scoring_overhaul.sql -> 0006_admin_tools.sql
--              -> seed/seed.sql -> 0007_bonus_categories.sql
--              -> 0008_live_results_cron.sql -> 0009_standings_on_signup.sql
--              -> 0010_cycling_classifications.sql
--
-- IMPORTANT — scoring MATH still lives in TypeScript (lib/scoring). This file
-- only adds a tagging column on matches and a read-only helper function; it
-- computes no points and contains no scoring formulas. The mountain
-- classification simply sums predictions.points_awarded restricted to the
-- matches flagged with a montana_stage.
--
-- Additive-only (ADR-0007): one nullable column + two named CHECK constraints +
-- one partial index on `matches`, and one new function. NO drop/truncate/delete;
-- never touches predictions/bonus_answers/point_adjustments/round_awards/
-- profiles. Fully idempotent — safe to re-run.
--
-- This file has NO explicit begin/commit (autocommit per-statement, matching the
-- project convention). It touches no enum, so it carries none of the `alter
-- type` transaction caveats of 0004.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. matches.montana_stage — mountain-classification (maillot de lunares) tag.
--    Etapa de montaña (1..N) a la que pertenece el partido; null = no es partido
--    de montaña. La clasificación de montaña (maillot de lunares) suma
--    points_awarded solo de estos partidos.
-- ----------------------------------------------------------------------------
alter table matches
  add column if not exists montana_stage smallint;

comment on column matches.montana_stage is
  'Etapa de montaña (1..N) a la que pertenece el partido; null = no es partido de montaña. La clasificación de montaña (maillot de lunares) suma points_awarded solo de estos partidos.';

-- Named CHECK: a mountain stage, if set, is in 1..21. Added behind
-- `drop constraint if exists` (the project's idempotent convention).
alter table matches
  drop constraint if exists matches_montana_stage_range;

alter table matches
  add constraint matches_montana_stage_range
  check (montana_stage is null or montana_stage between 1 and 21);

-- Named CHECK (business rule): a joker match can never be a mountain stage.
alter table matches
  drop constraint if exists matches_montana_not_joker;

alter table matches
  add constraint matches_montana_not_joker
  check (not (is_joker and montana_stage is not null));

-- Partial index: only the (few) mountain-stage matches are indexed, keeping the
-- per-stage sum cheap without bloating the index with the null majority.
create index if not exists matches_montana_idx
  on matches (montana_stage)
  where montana_stage is not null;

-- ----------------------------------------------------------------------------
-- RLS note: `matches` is already readable by all authenticated members (see
-- 0002_rls.sql). `montana_stage` is intentionally PUBLIC — players must see
-- which matches score for the mountain classification. No new policy needed.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 2. public.profile_emails() — service-role-only email resolver.
--    The server uses it to resolve the fixed maillots (arcoíris / jóvenes) by
--    email, which is robust against nick changes. SECURITY DEFINER so it can
--    read auth.users; SECURITY is enforced by REVOKE/GRANT below — ONLY the
--    service role may call it. It must NEVER be invocable from the client: that
--    would expose every player's email address.
-- ----------------------------------------------------------------------------
create or replace function public.profile_emails()
returns table (id uuid, email text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email::text from auth.users u;
$$;

-- Lock the function down to the service role only.
revoke all on function public.profile_emails() from public, anon, authenticated;
grant execute on function public.profile_emails() to service_role;
