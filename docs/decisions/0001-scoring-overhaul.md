# ADR-0001: Scoring system overhaul

- **Date:** 2026-06-09
- **Status:** Accepted — code merged & green (typecheck, 53/53 scoring tests, build). ⚠️ Migration `0004` not yet applied to any live DB; nothing committed to git yet.
- **Supersedes:** Baseline scoring in `PROJECT_PLAN.md` §3 (and the joker model in §2/§4/§7).

## Context

The baseline scoring (`PROJECT_PLAN.md` §3) was inherited from the football-pool plugin: exact = 5,
sign = 3, diff_bonus = 1, joker ×2, and **user-chosen jokers** (each player spends N jokers on
matches of their choice). After talking it through with the group we wanted a bigger, more
"event"-driven game:

- Points felt small and unscaled — wanted an order-of-magnitude bump for aesthetics/scale.
- Jokers should be a **shared, pre-agreed** lever (decided once with the friends), never left to
  individual users — that's how this group has always played.
- More ways to score and stay in the race: round-by-round mini-competitions, group-winner picks, and
  fun side bets (first scorer, "farolillo rojo", Pichichi).

## Decision

**1. Point magnitudes (defaults in `app_settings.scoring`, admin-editable):**
exact = **50**, sign = **20**, diff_bonus = **10**, `joker_multiplier` = **×3**.

**2. Jokers are admin-assigned per match, not user-chosen.** New `matches.is_joker` flag; a joker
match multiplies **every** user's points on it by `joker_multiplier`. Scoring reads `match.is_joker`
(not `prediction.is_joker`). Recommended distribution (admin marks freely): group **1 per matchday =
3**, round_of_32 = **2**, round_of_16 = **2**, quarter = **1**, semi = **1**, final = **1** (10 total).

**3. Bonus questions** default to **100** pts (`bonus_default_points`). New free-text type **`text`**
(case-insensitive exact match) for player-name answers (first scorer, Pichichi, farolillo).

**4. Group winner = auto-generated bonus questions.** Admin button creates one `single` question per
group A–L, options = that group's teams, **50** pts (`group_winner_points`), graded by admin at
stage end. (Chosen over a dedicated auto-graded predictions UI — see alternatives.)

**5. Meta volante (round champion).** Whoever scores the most *prediction* points within a round
earns **100** pts (`meta_volante_points`). Rounds = group matchdays 1/2/3 (`matches.matchday`) + each
knockout stage; `third_place` folds into `final`. **Ties** break by exact hits in that round, then
split (`floor(points/n)`). Stored in new `round_awards` table, summed into total + `standings_cache.meta_points`
by `refresh_standings()`. Computed only in the **manual** recalc (`pickRoundWinners` in `lib/scoring`).

## Alternatives considered

- **Group winner as a dedicated interactive, auto-graded system** (pick winners on a grid, compute
  group tables from results). Rejected: requires implementing group tie-breakers (pts → GD → GF) and
  new UI/table for marginal gain. Bonus questions reuse all existing grading/locking/scoring.
- **Meta volante ties → all tied players get full 100**, or **split evenly into decimals**. Rejected
  in favor of exact-hits tiebreak (rewards precision) with integer floor-split fallback (keeps
  `points_awarded` integer — no schema change).
- **Keep user-chosen jokers but cap centrally.** Rejected: the whole point is that jokers are a
  group decision, not an individual one.
- **Free-text bonus via `single` with admin-typed options.** Rejected as tedious for player names; a
  `text` type is a tiny enum/scoring/UI addition.

## Consequences

- **New operative rules** now live in `CLAUDE.md` → "Scoring" section (kept concise; this ADR holds the why).
- **Deprecated, kept for back-compat (ignored by scoring):** `predictions.is_joker`,
  `app_settings.jokers_per_user`, `profiles.joker_count`. Per-user joker UI removed; the admin
  `/admin/users` joker-grant control is gone/obsolete.
- `points_awarded` stays integer; meta-volante split uses floor (remainder dropped) — documented.
- **Pending:** apply migration `0004_scoring_overhaul.sql` to Supabase (don't wrap the
  `bonus_type` `ALTER TYPE … ADD VALUE 'text'` in a txn that also uses it); admin must designate
  joker matches and generate group-winner questions before the tournament; commit the work.

## Changes landed

- **Contract:** `lib/types.ts` — `Match.matchday` + `Match.is_joker`; `BonusType` += `'text'`;
  new `RoundAward` + `RoundKey`; `AppSettings` += `bonus_default_points`/`group_winner_points`/`meta_volante_points`;
  `StandingRow.meta_points`; new `DEFAULT_APP_SETTINGS` (50/20/10/×3, 100/50/100, jokers_per_user 0).
- **DB:** `db/migrations/0004_scoring_overhaul.sql` — `matches.is_joker`/`matchday`, `round_awards`
  table + RLS (public-read/admin-write), `standings_cache.meta_points`, `bonus_type` `'text'`,
  `refresh_standings()` sums `round_awards`; seed defaults + group matchday tagging (`db/seed/*`).
- **Scoring:** `lib/scoring/index.ts` — joker from match; `text` bonus; `roundKeyForMatch`;
  `pickRoundWinners` (+ tests, 53/53).
- **API:** `app/api/admin/recalc` — computes/persists round awards idempotently, returns
  `roundAwardsAffected`; `app/api/_lib.ts` passes `is_joker` into scoring. Cron stays manual-recalc-only.
- **Admin:** per-match joker toggle (`MatchRow` + `saveJoker`); `ScoringForm` new fields;
  `BonusManager` `text` type + `generateGroupWinnerQuestions`; recalc preview shows round awards.
- **Player:** removed joker switch/budget from `/matches` + `savePrediction`; joker ×N badge;
  `text` bonus input; `meta_points` surfaced on dashboard/standings.
- **UI:** `MatchCard`/`PredictionForm` joker badge; `RankingTable` meta column.
- **Docs:** `CLAUDE.md` Scoring + Project-memory sections; `PROJECT_PLAN.md` marked frozen baseline;
  this ADR added.
