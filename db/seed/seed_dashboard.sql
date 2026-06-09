-- ============================================================================
-- Mundial 2026 Pool - Seed (dashboard / SQL Editor version, no \copy)
-- Run AFTER 0001_schema, 0002_rls, 0003_functions, 0004_scoring_overhaul.
-- OFFICIAL FIFA World Cup 2026 draw (5 Dec 2025) + real fixture.
--   Source: football-pool WP plugin fixture CSV, cross-checked vs FIFA/MLS/NBC.
--   Tournament window: 2026-06-11 .. 2026-07-19. Knockout teams are TBD (null).
-- To re-seed later, first run:
--   truncate table matches restart identity cascade;  (also clears predictions)
--   truncate table teams restart identity cascade;
-- ============================================================================

begin;

insert into teams (name, code, "group", flag_url, is_eliminated) values
  ('Czechia', 'CZE', 'A', 'https://flagcdn.com/w320/cz.png', false),
  ('Mexico', 'MEX', 'A', 'https://flagcdn.com/w320/mx.png', false),
  ('South Africa', 'RSA', 'A', 'https://flagcdn.com/w320/za.png', false),
  ('South Korea', 'KOR', 'A', 'https://flagcdn.com/w320/kr.png', false),
  ('Bosnia-Herzegovina', 'BIH', 'B', 'https://flagcdn.com/w320/ba.png', false),
  ('Canada', 'CAN', 'B', 'https://flagcdn.com/w320/ca.png', false),
  ('Qatar', 'QAT', 'B', 'https://flagcdn.com/w320/qa.png', false),
  ('Switzerland', 'SUI', 'B', 'https://flagcdn.com/w320/ch.png', false),
  ('Brazil', 'BRA', 'C', 'https://flagcdn.com/w320/br.png', false),
  ('Haiti', 'HAI', 'C', 'https://flagcdn.com/w320/ht.png', false),
  ('Morocco', 'MAR', 'C', 'https://flagcdn.com/w320/ma.png', false),
  ('Scotland', 'SCO', 'C', 'https://flagcdn.com/w320/gb-sct.png', false),
  ('Australia', 'AUS', 'D', 'https://flagcdn.com/w320/au.png', false),
  ('Paraguay', 'PAR', 'D', 'https://flagcdn.com/w320/py.png', false),
  ('Türkiye', 'TUR', 'D', 'https://flagcdn.com/w320/tr.png', false),
  ('United States', 'USA', 'D', 'https://flagcdn.com/w320/us.png', false),
  ('Curaçao', 'CUW', 'E', 'https://flagcdn.com/w320/cw.png', false),
  ('Ecuador', 'ECU', 'E', 'https://flagcdn.com/w320/ec.png', false),
  ('Germany', 'GER', 'E', 'https://flagcdn.com/w320/de.png', false),
  ('Ivory Coast', 'CIV', 'E', 'https://flagcdn.com/w320/ci.png', false),
  ('Japan', 'JPN', 'F', 'https://flagcdn.com/w320/jp.png', false),
  ('Netherlands', 'NED', 'F', 'https://flagcdn.com/w320/nl.png', false),
  ('Sweden', 'SWE', 'F', 'https://flagcdn.com/w320/se.png', false),
  ('Tunisia', 'TUN', 'F', 'https://flagcdn.com/w320/tn.png', false),
  ('Belgium', 'BEL', 'G', 'https://flagcdn.com/w320/be.png', false),
  ('Egypt', 'EGY', 'G', 'https://flagcdn.com/w320/eg.png', false),
  ('Iran', 'IRN', 'G', 'https://flagcdn.com/w320/ir.png', false),
  ('New Zealand', 'NZL', 'G', 'https://flagcdn.com/w320/nz.png', false),
  ('Cape Verde', 'CPV', 'H', 'https://flagcdn.com/w320/cv.png', false),
  ('Saudi Arabia', 'KSA', 'H', 'https://flagcdn.com/w320/sa.png', false),
  ('Spain', 'ESP', 'H', 'https://flagcdn.com/w320/es.png', false),
  ('Uruguay', 'URU', 'H', 'https://flagcdn.com/w320/uy.png', false),
  ('France', 'FRA', 'I', 'https://flagcdn.com/w320/fr.png', false),
  ('Iraq', 'IRQ', 'I', 'https://flagcdn.com/w320/iq.png', false),
  ('Norway', 'NOR', 'I', 'https://flagcdn.com/w320/no.png', false),
  ('Senegal', 'SEN', 'I', 'https://flagcdn.com/w320/sn.png', false),
  ('Algeria', 'ALG', 'J', 'https://flagcdn.com/w320/dz.png', false),
  ('Argentina', 'ARG', 'J', 'https://flagcdn.com/w320/ar.png', false),
  ('Austria', 'AUT', 'J', 'https://flagcdn.com/w320/at.png', false),
  ('Jordan', 'JOR', 'J', 'https://flagcdn.com/w320/jo.png', false),
  ('Colombia', 'COL', 'K', 'https://flagcdn.com/w320/co.png', false),
  ('DR Congo', 'COD', 'K', 'https://flagcdn.com/w320/cd.png', false),
  ('Portugal', 'POR', 'K', 'https://flagcdn.com/w320/pt.png', false),
  ('Uzbekistan', 'UZB', 'K', 'https://flagcdn.com/w320/uz.png', false),
  ('Croatia', 'CRO', 'L', 'https://flagcdn.com/w320/hr.png', false),
  ('England', 'ENG', 'L', 'https://flagcdn.com/w320/gb-eng.png', false),
  ('Ghana', 'GHA', 'L', 'https://flagcdn.com/w320/gh.png', false),
  ('Panama', 'PAN', 'L', 'https://flagcdn.com/w320/pa.png', false);

insert into matches (home_team, away_team, stage, "group", kickoff_at, locks_at, status)
select t1.id, t2.id, v.stage::stage, nullif(v.grp, ''), v.kickoff, v.kickoff, 'scheduled'::match_status
from (values
  ('MEX', 'RSA', 'group', 'A', timestamptz '2026-06-11T19:00:00Z'),
  ('KOR', 'CZE', 'group', 'A', timestamptz '2026-06-12T02:00:00Z'),
  ('CAN', 'BIH', 'group', 'B', timestamptz '2026-06-12T19:00:00Z'),
  ('USA', 'PAR', 'group', 'D', timestamptz '2026-06-13T01:00:00Z'),
  ('QAT', 'SUI', 'group', 'B', timestamptz '2026-06-13T19:00:00Z'),
  ('BRA', 'MAR', 'group', 'C', timestamptz '2026-06-13T22:00:00Z'),
  ('HAI', 'SCO', 'group', 'C', timestamptz '2026-06-14T01:00:00Z'),
  ('AUS', 'TUR', 'group', 'D', timestamptz '2026-06-14T04:00:00Z'),
  ('GER', 'CUW', 'group', 'E', timestamptz '2026-06-14T17:00:00Z'),
  ('NED', 'JPN', 'group', 'F', timestamptz '2026-06-14T20:00:00Z'),
  ('CIV', 'ECU', 'group', 'E', timestamptz '2026-06-14T23:00:00Z'),
  ('SWE', 'TUN', 'group', 'F', timestamptz '2026-06-15T02:00:00Z'),
  ('ESP', 'CPV', 'group', 'H', timestamptz '2026-06-15T16:00:00Z'),
  ('BEL', 'EGY', 'group', 'G', timestamptz '2026-06-15T19:00:00Z'),
  ('KSA', 'URU', 'group', 'H', timestamptz '2026-06-15T22:00:00Z'),
  ('IRN', 'NZL', 'group', 'G', timestamptz '2026-06-16T01:00:00Z'),
  ('FRA', 'SEN', 'group', 'I', timestamptz '2026-06-16T19:00:00Z'),
  ('IRQ', 'NOR', 'group', 'I', timestamptz '2026-06-16T22:00:00Z'),
  ('ARG', 'ALG', 'group', 'J', timestamptz '2026-06-17T01:00:00Z'),
  ('AUT', 'JOR', 'group', 'J', timestamptz '2026-06-17T04:00:00Z'),
  ('POR', 'COD', 'group', 'K', timestamptz '2026-06-17T17:00:00Z'),
  ('ENG', 'CRO', 'group', 'L', timestamptz '2026-06-17T20:00:00Z'),
  ('GHA', 'PAN', 'group', 'L', timestamptz '2026-06-17T23:00:00Z'),
  ('UZB', 'COL', 'group', 'K', timestamptz '2026-06-18T02:00:00Z'),
  ('CZE', 'RSA', 'group', 'A', timestamptz '2026-06-18T16:00:00Z'),
  ('SUI', 'BIH', 'group', 'B', timestamptz '2026-06-18T19:00:00Z'),
  ('CAN', 'QAT', 'group', 'B', timestamptz '2026-06-18T22:00:00Z'),
  ('MEX', 'KOR', 'group', 'A', timestamptz '2026-06-19T01:00:00Z'),
  ('USA', 'AUS', 'group', 'D', timestamptz '2026-06-19T19:00:00Z'),
  ('SCO', 'MAR', 'group', 'C', timestamptz '2026-06-19T22:00:00Z'),
  ('BRA', 'HAI', 'group', 'C', timestamptz '2026-06-20T01:00:00Z'),
  ('TUR', 'PAR', 'group', 'D', timestamptz '2026-06-20T04:00:00Z'),
  ('NED', 'SWE', 'group', 'F', timestamptz '2026-06-20T17:00:00Z'),
  ('GER', 'CIV', 'group', 'E', timestamptz '2026-06-20T20:00:00Z'),
  ('ECU', 'CUW', 'group', 'E', timestamptz '2026-06-21T00:00:00Z'),
  ('TUN', 'JPN', 'group', 'F', timestamptz '2026-06-21T04:00:00Z'),
  ('ESP', 'KSA', 'group', 'H', timestamptz '2026-06-21T16:00:00Z'),
  ('BEL', 'IRN', 'group', 'G', timestamptz '2026-06-21T19:00:00Z'),
  ('URU', 'CPV', 'group', 'H', timestamptz '2026-06-21T22:00:00Z'),
  ('NZL', 'EGY', 'group', 'G', timestamptz '2026-06-22T01:00:00Z'),
  ('ARG', 'AUT', 'group', 'J', timestamptz '2026-06-22T17:00:00Z'),
  ('FRA', 'IRQ', 'group', 'I', timestamptz '2026-06-22T21:00:00Z'),
  ('NOR', 'SEN', 'group', 'I', timestamptz '2026-06-23T00:00:00Z'),
  ('JOR', 'ALG', 'group', 'J', timestamptz '2026-06-23T03:00:00Z'),
  ('POR', 'UZB', 'group', 'K', timestamptz '2026-06-23T17:00:00Z'),
  ('ENG', 'GHA', 'group', 'L', timestamptz '2026-06-23T20:00:00Z'),
  ('PAN', 'CRO', 'group', 'L', timestamptz '2026-06-23T23:00:00Z'),
  ('COL', 'COD', 'group', 'K', timestamptz '2026-06-24T02:00:00Z'),
  ('SUI', 'CAN', 'group', 'B', timestamptz '2026-06-24T19:00:00Z'),
  ('BIH', 'QAT', 'group', 'B', timestamptz '2026-06-24T19:00:00Z'),
  ('SCO', 'BRA', 'group', 'C', timestamptz '2026-06-24T22:00:00Z'),
  ('MAR', 'HAI', 'group', 'C', timestamptz '2026-06-24T22:00:00Z'),
  ('RSA', 'KOR', 'group', 'A', timestamptz '2026-06-25T01:00:00Z'),
  ('CZE', 'MEX', 'group', 'A', timestamptz '2026-06-25T01:00:00Z'),
  ('CUW', 'CIV', 'group', 'E', timestamptz '2026-06-25T20:00:00Z'),
  ('ECU', 'GER', 'group', 'E', timestamptz '2026-06-25T20:00:00Z'),
  ('JPN', 'SWE', 'group', 'F', timestamptz '2026-06-25T23:00:00Z'),
  ('TUN', 'NED', 'group', 'F', timestamptz '2026-06-25T23:00:00Z'),
  ('TUR', 'USA', 'group', 'D', timestamptz '2026-06-26T02:00:00Z'),
  ('PAR', 'AUS', 'group', 'D', timestamptz '2026-06-26T02:00:00Z'),
  ('NOR', 'FRA', 'group', 'I', timestamptz '2026-06-26T19:00:00Z'),
  ('SEN', 'IRQ', 'group', 'I', timestamptz '2026-06-26T19:00:00Z'),
  ('CPV', 'KSA', 'group', 'H', timestamptz '2026-06-27T00:00:00Z'),
  ('URU', 'ESP', 'group', 'H', timestamptz '2026-06-27T00:00:00Z'),
  ('EGY', 'IRN', 'group', 'G', timestamptz '2026-06-27T03:00:00Z'),
  ('NZL', 'BEL', 'group', 'G', timestamptz '2026-06-27T03:00:00Z'),
  ('CRO', 'GHA', 'group', 'L', timestamptz '2026-06-27T21:00:00Z'),
  ('PAN', 'ENG', 'group', 'L', timestamptz '2026-06-27T21:00:00Z'),
  ('COL', 'POR', 'group', 'K', timestamptz '2026-06-27T23:30:00Z'),
  ('COD', 'UZB', 'group', 'K', timestamptz '2026-06-27T23:30:00Z'),
  ('JOR', 'ARG', 'group', 'J', timestamptz '2026-06-28T02:00:00Z'),
  ('ALG', 'AUT', 'group', 'J', timestamptz '2026-06-28T02:00:00Z'),
  (null::text, null::text, 'round_of_32', '', timestamptz '2026-06-28T19:00:00Z'),
  (null::text, null::text, 'round_of_32', '', timestamptz '2026-06-29T17:00:00Z'),
  (null::text, null::text, 'round_of_32', '', timestamptz '2026-06-29T20:30:00Z'),
  (null::text, null::text, 'round_of_32', '', timestamptz '2026-06-30T01:00:00Z'),
  (null::text, null::text, 'round_of_32', '', timestamptz '2026-06-30T17:00:00Z'),
  (null::text, null::text, 'round_of_32', '', timestamptz '2026-06-30T21:00:00Z'),
  (null::text, null::text, 'round_of_32', '', timestamptz '2026-07-01T01:00:00Z'),
  (null::text, null::text, 'round_of_32', '', timestamptz '2026-07-01T16:00:00Z'),
  (null::text, null::text, 'round_of_32', '', timestamptz '2026-07-01T20:00:00Z'),
  (null::text, null::text, 'round_of_32', '', timestamptz '2026-07-02T00:00:00Z'),
  (null::text, null::text, 'round_of_32', '', timestamptz '2026-07-02T19:00:00Z'),
  (null::text, null::text, 'round_of_32', '', timestamptz '2026-07-02T23:00:00Z'),
  (null::text, null::text, 'round_of_32', '', timestamptz '2026-07-03T03:00:00Z'),
  (null::text, null::text, 'round_of_32', '', timestamptz '2026-07-03T18:00:00Z'),
  (null::text, null::text, 'round_of_32', '', timestamptz '2026-07-03T22:00:00Z'),
  (null::text, null::text, 'round_of_32', '', timestamptz '2026-07-04T01:30:00Z'),
  (null::text, null::text, 'round_of_16', '', timestamptz '2026-07-04T17:00:00Z'),
  (null::text, null::text, 'round_of_16', '', timestamptz '2026-07-04T21:00:00Z'),
  (null::text, null::text, 'round_of_16', '', timestamptz '2026-07-05T20:00:00Z'),
  (null::text, null::text, 'round_of_16', '', timestamptz '2026-07-06T00:00:00Z'),
  (null::text, null::text, 'round_of_16', '', timestamptz '2026-07-07T00:00:00Z'),
  (null::text, null::text, 'round_of_16', '', timestamptz '2026-07-06T19:00:00Z'),
  (null::text, null::text, 'round_of_16', '', timestamptz '2026-07-07T16:00:00Z'),
  (null::text, null::text, 'round_of_16', '', timestamptz '2026-07-07T20:00:00Z'),
  (null::text, null::text, 'quarter', '', timestamptz '2026-07-09T20:00:00Z'),
  (null::text, null::text, 'quarter', '', timestamptz '2026-07-10T19:00:00Z'),
  (null::text, null::text, 'quarter', '', timestamptz '2026-07-11T21:00:00Z'),
  (null::text, null::text, 'quarter', '', timestamptz '2026-07-12T01:00:00Z'),
  (null::text, null::text, 'semi', '', timestamptz '2026-07-14T19:00:00Z'),
  (null::text, null::text, 'semi', '', timestamptz '2026-07-15T19:00:00Z'),
  (null::text, null::text, 'third_place', '', timestamptz '2026-07-18T21:00:00Z'),
  (null::text, null::text, 'final', '', timestamptz '2026-07-19T19:00:00Z')
) as v(home_code, away_code, stage, grp, kickoff)
left join teams t1 on t1.code = v.home_code
left join teams t2 on t2.code = v.away_code;

-- Tag group-stage matchdays (1/2/3). Each group A-L has 6 matches = 3 matchdays
-- of 2 matches; ordering each group by kickoff_at, the chronological pairs map
-- to matchdays 1,2,3. Knockouts keep matchday null. (Mirrors migration 0004.)
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

commit;

do $$
declare t int; g int; k int;
begin
  select count(*) into t from teams;
  select count(*) into g from matches where stage = 'group';
  select count(*) into k from matches where stage <> 'group';
  raise notice 'Seeded % teams, % group matches, % knockout placeholders.', t, g, k;
end $$;
