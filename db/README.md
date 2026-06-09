# Database Layer — Mundial 2026 Pool

Postgres (Supabase) schema, Row-Level Security, aggregation functions, and seed
data for the FIFA World Cup 2026 prediction pool. The SQL mirrors `lib/types.ts`
and PROJECT_PLAN.md sections 2, 3, 5 — keep them in sync.

## Layout

```
db/
  migrations/
    0001_schema.sql      tables, enums, updated_at + new-user triggers, default app_settings row
    0002_rls.sql         RLS enabled on every table + explicit policies (the security core)
    0003_functions.sql   refresh_standings() aggregator + log_audit() helper
    0004_scoring_overhaul.sql  admin jokers, ~10x scoring, meta-volante (round_awards),
                               'text' bonus type, group matchday tagging, meta_points
  seed/
    teams.csv            48 teams, groups A–L (PLACEHOLDER data — see warning below)
    matches.csv          72 group matches + 32 knockout placeholders (PLACEHOLDER)
    seed.sql             \copy loader: stages CSVs, resolves codes → UUIDs
  README.md
```

## Apply order

Migrations are ordered and must be applied in sequence, then the seed:

```
0001_schema.sql  →  0002_rls.sql  →  0003_functions.sql  →  0004_scoring_overhaul.sql  →  seed/seed.sql
```

`0002` depends on tables from `0001`; `0003`'s `refresh_standings()` reads the
schema from `0001`. `0004` alters `matches`/`standings_cache`, extends the
`bonus_type` enum, adds `round_awards` (+ its RLS), redefines
`refresh_standings()`, and migrates the `app_settings` row to the new defaults.
The seed depends on the `teams`/`matches` tables and enums.

> **Apply `0004` in autocommit (no enclosing transaction).** It runs
> `alter type bonus_type add value 'text'`, which Postgres forbids inside a
> transaction block. Applied per-file with `psql -f` (or Supabase `db push` /
> dashboard SQL editor), each statement commits on its own — which is correct.
> Never wrap `0004` in an explicit `begin/commit`, and never bundle it into one
> transaction with other migrations.

## Requirements

- Postgres 15+ (Supabase default). `refresh_standings()` uses `MERGE`, which
  requires PG15+.
- `pgcrypto` extension (created by `0001` for `gen_random_uuid()`).
- The seed must run through the **`psql` client** because it uses `\copy`
  (client-side file read). Run it from the **repo root** so the relative paths
  `db/seed/*.csv` resolve.

## Option A — Supabase CLI (local or linked project)

```bash
# Local dev stack
supabase start

# Apply migrations (the CLI runs files in db/ if you place them under
# supabase/migrations, or apply manually with psql against the local db URL):
psql "$(supabase status --output json | jq -r '.DB.url')" -v ON_ERROR_STOP=1 \
  -f db/migrations/0001_schema.sql \
  -f db/migrations/0002_rls.sql \
  -f db/migrations/0003_functions.sql \
  -f db/migrations/0004_scoring_overhaul.sql

# Seed (run from repo root for the \copy relative paths):
psql "$(supabase status --output json | jq -r '.DB.url')" -v ON_ERROR_STOP=1 -f db/seed/seed.sql
```

If you prefer the CLI migration workflow, copy the three migration files into
`supabase/migrations/` (keeping the numeric prefix order) and run
`supabase db push`. The seed still runs via `psql` because of `\copy`.

## Option B — psql against a hosted Supabase project

Get the connection string from **Supabase Dashboard → Project Settings →
Database → Connection string** (use the `postgres` / service connection so the
migrations can create objects in `auth`-adjacent schemas and triggers on
`auth.users`).

```bash
export DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"

# From the repo root:
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0001_schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0002_rls.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0003_functions.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0004_scoring_overhaul.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seed/seed.sql   # run from repo root
```

> The new-user trigger (`on_auth_user_created` on `auth.users`) requires
> permission to create triggers on the `auth` schema. The Supabase `postgres`
> superuser role has this; the anon/authenticated roles do not.

## What each file does

### 0001_schema.sql
- Enums `role`, `match_status`, `stage`, `bonus_type` matching the TS unions.
- Tables: `profiles`, `teams`, `matches`, `predictions`, `bonus_questions`,
  `bonus_answers`, `standings_cache`, `app_settings` (single jsonb row),
  `audit_log`.
- `profiles.id` → `auth.users(id)`; UNIQUE `(user_id, match_id)` on predictions
  and `(user_id, question_id)` on bonus_answers.
- `handle_new_user()` trigger auto-creates a `profiles` row on signup
  (`role='player'`, `joker_count` read from `app_settings.jokers_per_user`).
- Seeds the single `app_settings` row with `DEFAULT_APP_SETTINGS` from
  `lib/types.ts`.

### 0002_rls.sql — the security core
- RLS enabled on **every** table; explicit policies for each.
- Predictions: a user reads/writes only their **own** rows, and writes are
  allowed **only while `now() < matches.locks_at`** (freeze at kickoff). Other
  users' predictions become readable **only after** that match's `locks_at`.
- `bonus_answers` follows the identical lock+ownership model against
  `bonus_questions.locks_at`.
- `teams`, `matches`, `standings_cache`, `app_settings`, `bonus_questions`
  readable by all authenticated members; all writes restricted to `role='admin'`
  via the `is_admin()` helper.
- `audit_log` is admin-read only.
- The trusted server (Supabase **service_role** key) and `SECURITY DEFINER`
  functions bypass RLS — that is how the scoring engine / cron writes
  `points_awarded`, match results, and `standings_cache`.

### 0003_functions.sql
- `refresh_standings()` — **aggregation only**. Sums the already-computed
  `predictions.points_awarded` and `bonus_answers.points_awarded` per user into
  `standings_cache` (`total_points`, `exact_hits`, `bonus_points`) and assigns
  `rank` with tie-breakers `total_points → exact_hits → bonus_points`.
  **No scoring math here** — that lives in TypeScript (`lib/scoring`).
  Idempotent (full `MERGE` rewrite). Call it after a recalc:
  ```sql
  select refresh_standings();
  ```
- `log_audit(action, target_type, target_id, before, after, actor)` — appends an
  `audit_log` entry; defaults actor to `auth.uid()`.

### 0004_scoring_overhaul.sql
The scoring-system overhaul. Mirrors the updated `lib/types.ts`:
- **`matches`**: adds `is_joker boolean not null default false` (admin-designated
  joker match → `×joker_multiplier` for ALL users — *no* seeded defaults, admin
  picks in the UI) and `matchday smallint` (`1..3` group-stage matchday, null for
  knockouts).
- **`bonus_type` enum**: adds value `'text'` (free-text answer, matched
  case-insensitively by the app). Runs as its own committed statement.
- **`round_awards`** (new table, `RoundAward`): meta-volante / round-champion
  awards. `unique (round_key, user_id)`; `round_key ∈ {group-md1..group-md3,
  round_of_32, round_of_16, quarter, semi, final}`. **Public-read** to all
  authenticated members; writes only via service role / `is_admin()` (same
  pattern as `standings_cache`). Players cannot write.
- **`standings_cache`**: adds `meta_points integer not null default 0`.
- **`app_settings`**: migrates the single config row to the new defaults
  (scoring `exact:50, sign:20, diff_bonus:10, joker_multiplier:3`;
  `bonus_default_points:100, group_winner_points:50, meta_volante_points:100`;
  `jokers_per_user:0` deprecated). Idempotent upsert on `id=1`.
- **Matchday tagging**: a SQL `UPDATE` sets `matchday` 1/2/3 for the 72 group
  matches by ordering each group's 6 matches by `kickoff_at` (chronological
  pairs → matchdays 1,2,3).
- **`refresh_standings()`** (`create or replace`): unchanged aggregation contract
  but `total_points` now also sums `round_awards.points`, and
  `standings_cache.meta_points` is populated with each user's round-award total.
  Tie-breakers unchanged (`total_points → exact_hits → bonus_points`). Still
  idempotent `MERGE`, still **no scoring math**.

> Jokers are now **admin-assigned per match** (`matches.is_joker`), not
> user-chosen. `predictions.is_joker` and `app_settings.jokers_per_user` are kept
> for back-compat but ignored by scoring.

## Seed data — PLACEHOLDER WARNING

`teams.csv` and `matches.csv` are **structurally correct placeholders**:

- 48 teams across 12 groups (A–L), 4 per group, realistic FIFA 3-letter codes.
- 72 group-stage matches (each group plays a full 3-matchday round-robin); the
  seed tags each with `matchday` 1/2/3 (chronological pairs per group).
- 32 knockout placeholder matches (Round of 32 → Final) with **null teams** and
  **null `matchday`**, to be populated once qualifiers/draw are known.

They are **NOT** the official FIFA World Cup 2026 qualified teams, group draw,
pairings, or kickoff times. **Verify and re-seed against the official FIFA
fixture before launch.** Tournament window used: 2026-06-11 … 2026-07-19.

## Re-seeding

`seed.sql` upserts teams by `code`. Group matches are inserted fresh, so to
re-seed cleanly run `truncate matches cascade; truncate teams cascade;` first
(this also clears predictions — only do it pre-launch / in dev).
