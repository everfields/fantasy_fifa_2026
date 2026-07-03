-- One-off prod backfill for migration 0013 (ADR-0022) — 2026-07-03
-- Sources: official FIFA bracket (M73–M104), verified vs FIFA.com/Wikipedia/ESPN.
-- Only UPDATEs on matches (sources, penalty_winner, and R16 slots already decided).
begin;

-- Shootout winners (progression only; scorelines untouched)
update matches set penalty_winner = (select id from teams where name = 'Paraguay')
  where id = 'ae5f1bc1-9d81-449e-b392-9459173e57af';  -- GER 0-0 PAR (pens 3-4)
update matches set penalty_winner = (select id from teams where name = 'Morocco')
  where id = '30088150-6168-4e66-9d61-19915dd206e5';  -- NED 1-1 MAR (pens 2-3)

-- Round of 16 sources (+ teams where the feeding matches are finished)
-- M90 Jul 4 17:00 — W(RSA-CAN) vs W(NED-MAR) = Canada vs Morocco
update matches set
  home_source = 'ad7902d4-5fe5-42e4-9ddd-ecd52a6e12df',
  away_source = '30088150-6168-4e66-9d61-19915dd206e5',
  home_team = (select id from teams where name = 'Canada'),
  away_team = (select id from teams where name = 'Morocco')
  where id = 'c02bfc25-a34b-4172-93e0-99c06ef3e51f';
-- M89 Jul 4 21:00 — W(GER-PAR) vs W(FRA-SWE) = Paraguay vs France
update matches set
  home_source = 'ae5f1bc1-9d81-449e-b392-9459173e57af',
  away_source = '4a3fea4b-9e58-4a86-b7f8-c8772c719184',
  home_team = (select id from teams where name = 'Paraguay'),
  away_team = (select id from teams where name = 'France')
  where id = 'f11601be-3285-4697-a328-94a4e49bdeaf';
-- M91 Jul 5 20:00 — W(BRA-JPN) vs W(CIV-NOR) = Brazil vs Norway
update matches set
  home_source = '7c541adb-e31f-42c2-9410-9094ac16f0b6',
  away_source = '50f06144-24ad-4d25-97c1-32d83dc79d11',
  home_team = (select id from teams where name = 'Brazil'),
  away_team = (select id from teams where name = 'Norway')
  where id = '7a81da16-bb92-409e-8947-34fd9a5d4edd';
-- M92 Jul 6 00:00 — W(MEX-ECU) vs W(ENG-COD) = Mexico vs England
update matches set
  home_source = '106afccf-e0fe-4d42-90f9-839870fa7e11',
  away_source = '645c07b1-af36-439f-9b14-63590cb2f9ed',
  home_team = (select id from teams where name = 'Mexico'),
  away_team = (select id from teams where name = 'England')
  where id = 'cdfe8d7e-3f27-41e7-8d8a-c92f355ca125';
-- M93 Jul 6 19:00 — W(POR-CRO) vs W(ESP-AUT) = Portugal vs Spain
update matches set
  home_source = 'dc9e0e1b-61fd-4272-b307-fd31ffc4f0e0',
  away_source = '2cfadd15-55f8-4490-970a-8ba3b2f40aba',
  home_team = (select id from teams where name = 'Portugal'),
  away_team = (select id from teams where name = 'Spain')
  where id = '14a952c4-a8ba-4299-9939-ded55805ef7b';
-- M94 Jul 7 00:00 — W(USA-BIH) vs W(BEL-SEN) = United States vs Belgium
update matches set
  home_source = 'be4ed339-a121-444d-a8c0-4160c931a85b',
  away_source = '7352bf22-92dd-4c61-a109-f32a8e0d3ca1',
  home_team = (select id from teams where name = 'United States'),
  away_team = (select id from teams where name = 'Belgium')
  where id = 'd42c6936-1fdb-4c6c-88d4-333a472f5d4f';
-- M95 Jul 7 16:00 — W(ARG-CPV) vs W(AUS-EGY): both play tonight, teams pending
update matches set
  home_source = '4cd40743-de71-4c5f-a3fa-acea4d1703fe',
  away_source = 'c6926f96-0bf0-4a3f-96d8-a9fcb95dad83'
  where id = '4b049338-f10d-40bb-9e8b-08caa69b7e43';
-- M96 Jul 7 20:00 — W(SUI-ALG) vs W(COL-GHA): Switzerland in, away pending
update matches set
  home_source = 'e433c306-2af2-4013-8aa0-1755ed3901bf',
  away_source = 'e6b35c13-71e6-43d4-86ba-7950e8585ecb',
  home_team = (select id from teams where name = 'Switzerland')
  where id = '95c3f6c6-4a0e-4460-bf56-e5ac68474657';

-- Quarters (FIFA numbering: Jul 9 = M97 [M89 vs M90], Jul 10 = M98 [M93 vs M94],
-- Jul 11 = M99 [M91 vs M92], Jul 12 = M100 [M95 vs M96])
update matches set home_source = 'f11601be-3285-4697-a328-94a4e49bdeaf', away_source = 'c02bfc25-a34b-4172-93e0-99c06ef3e51f'
  where id = 'b0136d3d-62a3-4148-8d88-28fda7708cf7';
update matches set home_source = '14a952c4-a8ba-4299-9939-ded55805ef7b', away_source = 'd42c6936-1fdb-4c6c-88d4-333a472f5d4f'
  where id = '0a7a2a4f-a6b3-473e-a5b6-8e784e5eceb7';
update matches set home_source = '7a81da16-bb92-409e-8947-34fd9a5d4edd', away_source = 'cdfe8d7e-3f27-41e7-8d8a-c92f355ca125'
  where id = '852eeac9-3a56-4310-b0a4-2f432e470a58';
update matches set home_source = '4b049338-f10d-40bb-9e8b-08caa69b7e43', away_source = '95c3f6c6-4a0e-4460-bf56-e5ac68474657'
  where id = '7568a482-07d2-42d3-b2c5-e17b31dc6af5';

-- Semis (M101 = W97 vs W98; M102 = W99 vs W100)
update matches set home_source = 'b0136d3d-62a3-4148-8d88-28fda7708cf7', away_source = '0a7a2a4f-a6b3-473e-a5b6-8e784e5eceb7'
  where id = '1484b4b6-d4a7-40ac-a008-dbb27c963920';
update matches set home_source = '852eeac9-3a56-4310-b0a4-2f432e470a58', away_source = '7568a482-07d2-42d3-b2c5-e17b31dc6af5'
  where id = 'c3863b8d-8524-4828-ab54-b3aae75952b8';

-- Third place = SF losers; final = SF winners
update matches set
  home_source = '1484b4b6-d4a7-40ac-a008-dbb27c963920', home_source_kind = 'loser',
  away_source = 'c3863b8d-8524-4828-ab54-b3aae75952b8', away_source_kind = 'loser'
  where id = '35b35758-cdb4-43e7-9e76-bbbbea8edbbc';
update matches set
  home_source = '1484b4b6-d4a7-40ac-a008-dbb27c963920',
  away_source = 'c3863b8d-8524-4828-ab54-b3aae75952b8'
  where id = '90349c2b-a745-4f6c-8f59-66d03231037d';

commit;

-- Sanity: every knockout match from R16 on must have both sources
select stage, count(*) filter (where home_source is null or away_source is null) as missing_sources,
       count(*) filter (where home_team is not null and away_team is not null) as slots_full,
       count(*) as total
from matches
where stage in ('round_of_16','quarter','semi','third_place','final')
group by stage order by min(kickoff_at);
