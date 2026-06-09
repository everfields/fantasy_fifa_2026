-- ============================================================================
-- Mundial 2026 Pool — "Luis de la Tracker" (AI prediction-strategy tracker)
-- Migration 0005: one table that stores the daily AI "parte de prensa".
--
-- A daily Vercel cron (`/api/cron/luis-tracker`) runs a PURE deterministic
-- analysis of every player's predictions vs. the day's results
-- (`lib/tracker/analysis.ts`), then an LLM verbalizes the top 5 key findings in
-- the persona of the Spanish NT coach (`lib/tracker/luis.ts`). The verbalized
-- report + the raw analysis snapshot are stored here, one row per day.
--
-- NO scoring math here — this table only stores generated commentary + the
-- analysis JSON it was derived from. Read-only to players; written by the
-- service role (cron) / admin. See docs/decisions/0003-luis-de-la-tracker.md.
--
-- Apply order: 0001 -> 0002 -> 0003 -> 0004 -> 0005 -> seed/seed.sql
-- Autocommit (psql -f / Supabase) — no explicit transaction needed.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- tracker_reports — one AI report per calendar day (TrackerReport in types.ts).
--   report_date : the day the report covers (UTC calendar date of kickoffs).
--   headline    : Luis's punchy one-line intro.
--   findings    : jsonb array of { title, body } — the 5 verbalized key findings.
--   analysis    : jsonb snapshot of the deterministic TrackerAnalysis it used
--                 (audit + lets the UI show the raw stats / regenerate).
--   model       : which LLM produced the verbalization (null when analysis-only).
--   status      : 'generated' (LLM wrote it) | 'analysis_only' (no API key yet).
-- One row per day (unique report_date) so the daily cron upsert is idempotent.
-- ----------------------------------------------------------------------------
create table if not exists tracker_reports (
  id          uuid primary key default gen_random_uuid(),
  report_date date not null,
  headline    text not null default '',
  findings    jsonb not null default '[]'::jsonb,
  analysis    jsonb not null default '{}'::jsonb,
  model       text,
  status      text not null default 'generated'
              check (status in ('generated', 'analysis_only')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (report_date)
);

create index if not exists tracker_reports_date_idx
  on tracker_reports (report_date desc);

-- ----------------------------------------------------------------------------
-- RLS — public-read to all authenticated members (like standings_cache /
-- round_awards); writes only via the service role (cron) or an admin. Players
-- can never insert/update/delete. Mirrors the standings_cache pattern in
-- 0002_rls.sql. (The service-role client bypasses RLS entirely; this policy
-- governs the player-facing anon/auth clients.)
-- ----------------------------------------------------------------------------
alter table tracker_reports enable row level security;

drop policy if exists tracker_reports_select on tracker_reports;
create policy tracker_reports_select on tracker_reports
  for select to authenticated
  using (true);

drop policy if exists tracker_reports_admin_write on tracker_reports;
create policy tracker_reports_admin_write on tracker_reports
  for all to authenticated
  using (is_admin())
  with check (is_admin());
