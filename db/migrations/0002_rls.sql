-- ============================================================================
-- Mundial 2026 Pool — Row-Level Security
-- Migration 0002: enable RLS + policies for every table.
-- Implements PROJECT_PLAN section 2 "RLS rules" + section 5 lock decisions.
--
-- Core security invariants:
--   * A user reads/writes only their OWN predictions/bonus_answers.
--   * Writes (insert/update/delete) to a prediction are allowed ONLY while
--     now() < matches.locks_at  (predictions freeze at kickoff).
--   * Other users' predictions become readable ONLY after that match locks_at.
--   * teams / matches / standings_cache readable by all authenticated members.
--   * All admin writes (and admin-only reads) restricted to role = 'admin'.
--   * Same lock + ownership rules for bonus_answers (vs bonus_questions.locks_at).
--
-- NOTE on bypass: the trusted server (service_role key) and SECURITY DEFINER
-- functions bypass RLS. The Vercel cron / scoring engine should write
-- points_awarded, match results, and standings_cache using the service role;
-- end users never get those write paths through these policies.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper: is the current JWT user an admin?
-- SECURITY DEFINER so it can read profiles regardless of the caller's policies
-- (and so policies referencing profiles don't recurse).
-- ----------------------------------------------------------------------------
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- Enable RLS on every table.
-- ----------------------------------------------------------------------------
alter table profiles        enable row level security;
alter table teams           enable row level security;
alter table matches         enable row level security;
alter table predictions     enable row level security;
alter table bonus_questions enable row level security;
alter table bonus_answers   enable row level security;
alter table standings_cache enable row level security;
alter table app_settings    enable row level security;
alter table audit_log       enable row level security;

-- ============================================================================
-- profiles
--   * Any authenticated member can read profiles (needed for leaderboard,
--     viewing other players, etc.).
--   * A user may update only their own profile, and may NOT change their role
--     or joker_count (those are admin-controlled). Enforced by re-checking the
--     old values in WITH CHECK against the existing row.
--   * Admins can do anything.
-- ============================================================================
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
  for select to authenticated
  using (true);

drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select p.role from profiles p where p.id = auth.uid())
    and joker_count = (select p.joker_count from profiles p where p.id = auth.uid())
  );

drop policy if exists profiles_admin_all on profiles;
create policy profiles_admin_all on profiles
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ============================================================================
-- teams — readable by all authenticated members; only admins write.
-- ============================================================================
drop policy if exists teams_select on teams;
create policy teams_select on teams
  for select to authenticated
  using (true);

drop policy if exists teams_admin_write on teams;
create policy teams_admin_write on teams
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ============================================================================
-- matches — readable by all authenticated members; only admins write
-- (results, status, locks_at overrides, manual sync).
-- ============================================================================
drop policy if exists matches_select on matches;
create policy matches_select on matches
  for select to authenticated
  using (true);

drop policy if exists matches_admin_write on matches;
create policy matches_admin_write on matches
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ============================================================================
-- predictions — THE security core.
--
-- SELECT: a user sees
--   (a) their own predictions (always), OR
--   (b) anyone's prediction once that match has locked (now() >= locks_at), OR
--   (c) anything, if admin.
--
-- INSERT/UPDATE/DELETE: only on OWN rows, and only while the match is still
--   open (now() < matches.locks_at). After lock, predictions are frozen.
--   Admins are exempt from the lock window (manual corrections / audit).
-- ============================================================================
drop policy if exists predictions_select on predictions;
create policy predictions_select on predictions
  for select to authenticated
  using (
    user_id = auth.uid()
    or is_admin()
    or exists (
      select 1 from matches m
      where m.id = predictions.match_id
        and now() >= m.locks_at
    )
  );

-- INSERT: own row, match still open.
drop policy if exists predictions_insert on predictions;
create policy predictions_insert on predictions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from matches m
      where m.id = predictions.match_id
        and now() < m.locks_at
    )
  );

-- UPDATE: own row, match still open (both before and after image).
drop policy if exists predictions_update on predictions;
create policy predictions_update on predictions
  for update to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from matches m
      where m.id = predictions.match_id
        and now() < m.locks_at
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from matches m
      where m.id = predictions.match_id
        and now() < m.locks_at
    )
  );

-- DELETE: own row, match still open.
drop policy if exists predictions_delete on predictions;
create policy predictions_delete on predictions
  for delete to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from matches m
      where m.id = predictions.match_id
        and now() < m.locks_at
    )
  );

-- Admin full control over predictions (corrections, recalc bookkeeping).
drop policy if exists predictions_admin_all on predictions;
create policy predictions_admin_all on predictions
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ============================================================================
-- bonus_questions — readable by all authenticated members; only admins write.
-- (correct_answer is exposed; if you need to hide it pre-lock, do so at the
--  query/column layer in the app — RLS is row-level, not column-level.)
-- ============================================================================
drop policy if exists bonus_questions_select on bonus_questions;
create policy bonus_questions_select on bonus_questions
  for select to authenticated
  using (true);

drop policy if exists bonus_questions_admin_write on bonus_questions;
create policy bonus_questions_admin_write on bonus_questions
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ============================================================================
-- bonus_answers — same lock + ownership model as predictions, vs the
-- question's locks_at.
--
-- SELECT: own answers always; others' answers only after the question locks;
--   admins always.
-- INSERT/UPDATE/DELETE: own rows only, only while now() < question.locks_at.
-- ============================================================================
drop policy if exists bonus_answers_select on bonus_answers;
create policy bonus_answers_select on bonus_answers
  for select to authenticated
  using (
    user_id = auth.uid()
    or is_admin()
    or exists (
      select 1 from bonus_questions q
      where q.id = bonus_answers.question_id
        and now() >= q.locks_at
    )
  );

drop policy if exists bonus_answers_insert on bonus_answers;
create policy bonus_answers_insert on bonus_answers
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from bonus_questions q
      where q.id = bonus_answers.question_id
        and now() < q.locks_at
    )
  );

drop policy if exists bonus_answers_update on bonus_answers;
create policy bonus_answers_update on bonus_answers
  for update to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from bonus_questions q
      where q.id = bonus_answers.question_id
        and now() < q.locks_at
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from bonus_questions q
      where q.id = bonus_answers.question_id
        and now() < q.locks_at
    )
  );

drop policy if exists bonus_answers_delete on bonus_answers;
create policy bonus_answers_delete on bonus_answers
  for delete to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from bonus_questions q
      where q.id = bonus_answers.question_id
        and now() < q.locks_at
    )
  );

drop policy if exists bonus_answers_admin_all on bonus_answers;
create policy bonus_answers_admin_all on bonus_answers
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ============================================================================
-- standings_cache — public ranking: readable by all authenticated members.
-- Writes happen via refresh_standings() (SECURITY DEFINER) or service role;
-- no end-user write policy is granted. Admins may write for manual fixes.
-- ============================================================================
drop policy if exists standings_select on standings_cache;
create policy standings_select on standings_cache
  for select to authenticated
  using (true);

drop policy if exists standings_admin_write on standings_cache;
create policy standings_admin_write on standings_cache
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ============================================================================
-- app_settings — readable by all authenticated members (scoring engine /
-- countdown read it). Only admins may change it.
-- ============================================================================
drop policy if exists app_settings_select on app_settings;
create policy app_settings_select on app_settings
  for select to authenticated
  using (true);

drop policy if exists app_settings_admin_write on app_settings;
create policy app_settings_admin_write on app_settings
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ============================================================================
-- audit_log — admin-only read. No end-user write policy (entries are created
-- by SECURITY DEFINER helper / service role). Admins may also insert directly.
-- ============================================================================
drop policy if exists audit_log_admin_select on audit_log;
create policy audit_log_admin_select on audit_log
  for select to authenticated
  using (is_admin());

drop policy if exists audit_log_admin_insert on audit_log;
create policy audit_log_admin_insert on audit_log
  for insert to authenticated
  with check (is_admin());
