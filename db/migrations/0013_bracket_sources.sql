-- ============================================================================
-- Mundial 2026 Pool — Bracket sources (knockout auto-propagation)
-- Migration 0013: adds bracket-wiring columns to `matches` so knockout slots
-- can auto-populate from the results of earlier matches, plus a shootout-winner
-- record for level knockout ties.
--
-- Apply order: 0001_schema.sql -> 0002_rls.sql -> 0003_functions.sql
--              -> 0004_scoring_overhaul.sql -> 0006_admin_tools.sql
--              -> seed/seed.sql -> 0007_bonus_categories.sql
--              -> 0008_live_results_cron.sql -> 0009_standings_on_signup.sql
--              -> 0010_cycling_classifications.sql
--              -> 0011_meta_volante_distribution.sql
--              -> 0012_fix_bonus_protect_trigger.sql
--              -> 0013_bracket_sources.sql
--
-- SEMANTICS.
--   * home_source / away_source point at the match whose WINNER (or LOSER, per
--     home_source_kind / away_source_kind) fills this slot. They are admin-
--     configured wiring of the bracket. Propagation code (in the app) updates
--     home_team / away_team IN PLACE when the referenced source match finishes —
--     it never deletes/reinserts a matches row (predictions cascade off matches).
--   * penalty_winner records the shootout winner when a knockout match ends
--     level in regulation/extra time; it identifies which team advances so the
--     downstream slots resolve correctly. The app validates that penalty_winner
--     is one of the two teams (NOT a DB CHECK: during backfill the winner may be
--     set before home_team/away_team are assigned).
--
-- Additive-only (ADR-0007): five nullable/defaulted columns + one named CHECK
-- constraint on `matches`. NO drop/truncate/delete; never touches predictions/
-- bonus_answers/point_adjustments/round_awards/profiles. FK deletes are
-- `on delete set null`, so a deleted source/team never cascades into a matches
-- row. Fully idempotent — safe to re-run.
--
-- This file has NO explicit begin/commit (autocommit per-statement, matching the
-- project convention). It touches no enum, so it carries none of the `alter
-- type` transaction caveats of 0004.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Bracket-source + shootout columns on `matches`.
--    home_source / away_source: the match feeding this slot; *_source_kind says
--    whether the WINNER or the LOSER of that match advances here. penalty_winner:
--    the team that won on penalties (level knockout ties).
-- ----------------------------------------------------------------------------
alter table matches add column if not exists home_source uuid references matches(id) on delete set null;
alter table matches add column if not exists away_source uuid references matches(id) on delete set null;
alter table matches add column if not exists home_source_kind text not null default 'winner' check (home_source_kind in ('winner','loser'));
alter table matches add column if not exists away_source_kind text not null default 'winner' check (away_source_kind in ('winner','loser'));
alter table matches add column if not exists penalty_winner uuid references teams(id) on delete set null;

comment on column matches.home_source is
  'Match whose winner/loser (per home_source_kind) fills this home slot; admin-configured bracket wiring. Propagation updates home_team in place when the source match finishes.';
comment on column matches.away_source is
  'Match whose winner/loser (per away_source_kind) fills this away slot; admin-configured bracket wiring. Propagation updates away_team in place when the source match finishes.';
comment on column matches.home_source_kind is
  'Whether the WINNER or LOSER of home_source advances into this home slot (winner|loser).';
comment on column matches.away_source_kind is
  'Whether the WINNER or LOSER of away_source advances into this away slot (winner|loser).';
comment on column matches.penalty_winner is
  'Shootout winner when a knockout match ends level; identifies the advancing team. App-validated to be home_team/away_team (no DB CHECK — teams may be assigned after the winner during backfill).';

-- ----------------------------------------------------------------------------
-- 2. Named CHECK: sources and penalty_winner are KNOCKOUT-ONLY — a group-stage
--    match never wires a bracket source or a shootout winner. Added behind
--    `drop constraint if exists` (the project's idempotent convention).
--    NOTE: no CHECK ties penalty_winner to home_team/away_team — during backfill
--    the winner may be set before the teams are assigned; the app validates it.
-- ----------------------------------------------------------------------------
alter table matches
  drop constraint if exists matches_bracket_knockout_only;

alter table matches
  add constraint matches_bracket_knockout_only
  check (stage <> 'group' or (home_source is null and away_source is null and penalty_winner is null));

-- ----------------------------------------------------------------------------
-- RLS note: `matches` is already readable by all authenticated members and
-- writable only by admins (see 0002_rls.sql: policy `matches_select` USING
-- true; policy `matches_admin_write` FOR ALL USING/ WITH CHECK is_admin()).
-- RLS in Postgres is ROW-level, not column-level, so these new columns ride the
-- existing table policies with no change: admins may write them via
-- matches_admin_write, and the trusted server (service_role key) / SECURITY
-- DEFINER propagation bypasses RLS entirely. All authenticated members can read
-- them (intended — players see the bracket wiring). No new policy needed.
-- ----------------------------------------------------------------------------
