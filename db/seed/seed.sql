-- ============================================================================
-- Mundial 2026 Pool — Seed loader
--
-- !! PLACEHOLDER DATA WARNING !!
-- The 48 teams in teams.csv and the fixtures in matches.csv are STRUCTURALLY
-- CORRECT placeholders (12 groups A-L x 4 teams = 48; 72 group matches;
-- 32 knockout placeholders R32 -> Final). They are NOT the official FIFA
-- World Cup 2026 qualified teams / draw / fixture list. EXACT team
-- qualifications, group draw, pairings, and kickoff dates/times MUST be
-- verified against the official FIFA fixture before launch and re-seeded.
-- Tournament window used here: 2026-06-11 .. 2026-07-19.
--
-- Loading method: this script uses psql \copy to stage the CSVs into TEMP
-- tables, then INSERTs into the real tables, resolving team CODES -> UUIDs.
-- This means you MUST run it with the psql client (see db/README.md), e.g.:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seed/seed.sql
-- (\copy reads files relative to your current shell directory; run from
--  the repo root, or adjust the paths below.)
--
-- Idempotency: re-running upserts teams by code. Matches are inserted fresh
-- every run, so TRUNCATE matches before re-seeding to avoid duplicates
-- (see db/README.md "Re-seeding").
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Teams
-- ---------------------------------------------------------------------------
create temp table _teams_stage (
  name      text,
  code      text,
  "group"   text,
  flag_url  text
) on commit drop;

\copy _teams_stage (name, code, "group", flag_url) from 'db/seed/teams.csv' with (format csv, header true)

insert into teams (name, code, "group", flag_url, is_eliminated)
select name, code, nullif("group", ''), nullif(flag_url, ''), false
from _teams_stage
on conflict (code) do update set
  name     = excluded.name,
  "group"  = excluded."group",
  flag_url = excluded.flag_url;

-- ---------------------------------------------------------------------------
-- Matches
-- ---------------------------------------------------------------------------
create temp table _matches_stage (
  home_code    text,
  away_code    text,
  stage        text,
  "group"      text,
  kickoff_at   timestamptz
) on commit drop;

\copy _matches_stage (home_code, away_code, stage, "group", kickoff_at) from 'db/seed/matches.csv' with (format csv, header true)

-- Resolve team codes to UUIDs. Knockout placeholders have empty codes -> NULL
-- home_team / away_team (to be filled once qualifiers are known).
-- locks_at = kickoff_at per the design (predictions freeze at kickoff).
insert into matches (home_team, away_team, stage, "group", kickoff_at, locks_at, status)
select
  ht.id,
  at.id,
  s.stage::stage,
  nullif(s."group", ''),
  s.kickoff_at,
  s.kickoff_at,            -- locks_at = kickoff
  'scheduled'::match_status
from _matches_stage s
left join teams ht on ht.code = nullif(s.home_code, '')
left join teams at on at.code = nullif(s.away_code, '');

commit;

-- Sanity report
do $$
declare
  t_count int; m_group int; m_ko int;
begin
  select count(*) into t_count from teams;
  select count(*) into m_group from matches where stage = 'group';
  select count(*) into m_ko    from matches where stage <> 'group';
  raise notice 'Seeded % teams, % group matches, % knockout placeholders.', t_count, m_group, m_ko;
end $$;
