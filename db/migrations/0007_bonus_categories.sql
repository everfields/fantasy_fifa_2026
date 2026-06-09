-- ============================================================================
-- Mundial 2026 Pool — Bonus question categories + Spain/tournament seeds
-- Migration 0007: adds bonus_questions.category (group_winner | spain_scorer |
-- tournament), backfills existing auto-generated group-winner questions, and
-- seeds the "primer goleador de España" per-match questions plus two
-- tournament-wide questions. Mirrors the UPDATED lib/types.ts
-- (BonusCategory = 'group_winner' | 'spain_scorer' | 'tournament';
--  BonusQuestion.category: BonusCategory).
--
-- Apply order: 0001_schema.sql -> 0002_rls.sql -> 0003_functions.sql
--              -> 0004_scoring_overhaul.sql -> 0006_admin_tools.sql
--              -> seed/seed.sql -> 0007_bonus_categories.sql
--
-- IMPORTANT — scoring MATH still lives in TypeScript (lib/scoring). This file
-- only adds a categorisation column and SEEDS bonus questions; it computes no
-- points and contains no scoring formulas.
--
-- This file has NO explicit begin/commit (autocommit per-statement, matching the
-- project convention). It touches no enum, so it carries none of the `alter
-- type` transaction caveats of 0004.
--
-- !! ORDERING / RE-RUN NOTE !!
-- The Spain-scorer and tournament seeds (steps 3–4) read the `teams` and
-- `matches` tables, so this migration is best applied AFTER seed/seed.sql. It is
-- fully idempotent: every insert is guarded with `where not exists` / null
-- checks, so if you run it BEFORE seeding (empty teams/matches) it simply
-- inserts nothing and does not fail. In that case, RE-RUN 0007 after seeding to
-- materialise the Spain/tournament questions.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. bonus_questions.category — visual/grouping block in /bonus and /admin/bonus.
--    Default 'tournament' so legacy rows get a valid value; group-winner rows are
--    re-tagged in step 2. The CHECK constraint is added via a named constraint
--    behind `drop constraint if exists`, the cleanest idempotent form (re-runnable
--    without "constraint already exists").
-- ----------------------------------------------------------------------------
alter table bonus_questions
  add column if not exists category text not null default 'tournament';

alter table bonus_questions
  drop constraint if exists bonus_questions_category_check;

alter table bonus_questions
  add constraint bonus_questions_category_check
  check (category in ('group_winner', 'spain_scorer', 'tournament'));

-- ----------------------------------------------------------------------------
-- 2. Backfill — existing auto-generated group-winner questions (text marker
--    "¿Campeón del Grupo X?", see app/admin/bonus/actions.ts) → 'group_winner'.
-- ----------------------------------------------------------------------------
update bonus_questions
   set category = 'group_winner'
 where text like '¿Campeón del Grupo%'
   and category <> 'group_winner';

-- ----------------------------------------------------------------------------
-- 3. Seed "Primer goleador de España vs {rival}" — one free-text question per
--    Spain (code 'ESP') GROUP match, rival name looked up dynamically (no
--    hardcoded dates/opponents). Expected 3 matches (vs Cape Verde, Saudi
--    Arabia, Uruguay) but written generically over whatever ESP group matches
--    exist. points = app_settings bonus_default_points (fallback 100);
--    locks_at = match kickoff_at; category 'spain_scorer'.
--    Idempotent: skipped when a question with the same text already exists.
--    Inserts nothing if teams/matches are empty or 'ESP' is absent.
-- ----------------------------------------------------------------------------
insert into bonus_questions (text, type, options, points, correct_answer, locks_at, category)
select
  'Primer goleador de España vs ' || rival.name as text,
  'text'::bonus_type                            as type,
  null::jsonb                                   as options,
  coalesce((s.settings ->> 'bonus_default_points')::int, 100) as points,
  null::jsonb                                   as correct_answer,
  m.kickoff_at                                  as locks_at,
  'spain_scorer'                                as category
from matches m
join teams esp
  on esp.code = 'ESP'
 and (m.home_team = esp.id or m.away_team = esp.id)
join teams rival
  on rival.id = case when m.home_team = esp.id then m.away_team else m.home_team end
cross join app_settings s
where s.id = 1
  and m.stage = 'group'
  and rival.id is not null
  and not exists (
    select 1 from bonus_questions bq
    where bq.text = 'Primer goleador de España vs ' || rival.name
  );

-- ----------------------------------------------------------------------------
-- 4. Seed two tournament-wide questions (category 'tournament'). points =
--    bonus_default_points (fallback 100); locks_at = earliest kickoff_at across
--    ALL matches. Idempotent by text. Inserts nothing if `matches` is empty
--    (no earliest kickoff to anchor locks_at).
-- ----------------------------------------------------------------------------

-- 4a. Pichichi del Mundial (máximo goleador) — free text.
insert into bonus_questions (text, type, options, points, correct_answer, locks_at, category)
select
  'Pichichi del Mundial (máximo goleador)',
  'text'::bonus_type,
  null::jsonb,
  coalesce((s.settings ->> 'bonus_default_points')::int, 100),
  null::jsonb,
  (select min(kickoff_at) from matches),
  'tournament'
from app_settings s
where s.id = 1
  and exists (select 1 from matches)
  and not exists (
    select 1 from bonus_questions bq
    where bq.text = 'Pichichi del Mundial (máximo goleador)'
  );

-- 4b. ¿Cuántos goles encajará Curazao en el Mundial? — single choice.
insert into bonus_questions (text, type, options, points, correct_answer, locks_at, category)
select
  '¿Cuántos goles encajará Curazao en el Mundial?',
  'single'::bonus_type,
  jsonb_build_array('10 o más goles', 'Menos de 10 goles'),
  coalesce((s.settings ->> 'bonus_default_points')::int, 100),
  null::jsonb,
  (select min(kickoff_at) from matches),
  'tournament'
from app_settings s
where s.id = 1
  and exists (select 1 from matches)
  and not exists (
    select 1 from bonus_questions bq
    where bq.text = '¿Cuántos goles encajará Curazao en el Mundial?'
  );
