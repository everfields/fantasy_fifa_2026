# Database Layer — Mundial 2026 Pool

Postgres (Supabase) schema, Row-Level Security, aggregation functions, and seed
data for the FIFA World Cup 2026 prediction pool. The SQL mirrors `lib/types.ts`
and PROJECT_PLAN.md sections 2, 3, 5 — keep them in sync.

## ⛔ Data safety — predictions are sacred (READ FIRST)

Player data lives in **`predictions`, `bonus_answers`, `point_adjustments`,
`round_awards`, `profiles`**. These rows are irreplaceable — `points_awarded`
can always be recomputed by the manual recalc, the rows themselves cannot.
App code never deletes them; **the only way to lose them is SQL run against
prod**. So the rules apply to anything under `db/` (see ADR-0007):

1. **Backup before ANY prod SQL** — migration, seed, or manual statement:
   ```bash
   DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres" bash db/backup.sh
   ```
   Writes a full dump + a user-data dump to `db/backups/` (gitignored). Takes
   seconds. No backup ⇒ no SQL.
2. **Migrations are additive-only post-launch.** New tables, new nullable/
   defaulted columns, `create or replace function` — yes. `drop table`,
   `drop column`, `truncate`, or `delete` touching the tables above — never.
   A rename = add new column + backfill; drop the old one after the tournament.
3. **Never delete or truncate `matches`, `teams`, or `bonus_questions` after
   launch.** `predictions.match_id` and `bonus_answers.question_id` are
   `on delete cascade` — deleting a match **silently deletes every prediction
   on it**. To fix a wrong match/kickoff/team, `UPDATE` the row in place
   (UUID unchanged); never delete + reinsert. (Deleting a bonus question from
   the admin is the one sanctioned cascade — it's audited and intentional.)
4. **Never re-run seeds against prod after launch.** Both seed files now carry
   a guard that **aborts if predictions exist**; the override
   (`app.allow_reseed = 'on'`) is only for a deliberate, backed-up reset.
5. **Test on local Supabase first** (`/run-porra dev`), then apply to prod with
   `psql -v ON_ERROR_STOP=1`, one file at a time. Never paste untested SQL
   into the dashboard editor against prod.
6. **During the tournament, run `db/backup.sh` daily** (and always right before
   entering results for a matchday). On the Supabase free plan there are no
   automatic backups — this script is the safety net.

**Restore:** full dump → `psql "$DATABASE_URL" -f db/backups/full_<UTC>.sql`
into a fresh database. The `userdata_*.sql` dump restores user rows in place
provided `matches`/`teams`/`bonus_questions` UUIDs are unchanged — which is
exactly why rule 3 exists.

## Layout

```
db/
  migrations/
    0001_schema.sql      tables, enums, updated_at + new-user triggers, default app_settings row
    0002_rls.sql         RLS enabled on every table + explicit policies (the security core)
    0003_functions.sql   refresh_standings() aggregator + log_audit() helper
    0004_scoring_overhaul.sql  admin jokers, ~10x scoring, meta-volante (round_awards),
                               'text' bonus type, group matchday tagging, meta_points
    0006_admin_tools.sql       manual text-bonus grading (bonus_answers.manual_correct +
                               protect trigger), point_adjustments table + RLS,
                               standings_cache.adjustment_points, refresh_standings() rollup
    0007_bonus_categories.sql  bonus_questions.category (group_winner|spain_scorer|tournament),
                               backfill group-winner rows, seed Spain-scorer + tournament questions
                               (applied AFTER the seed; idempotent — re-run if applied before)
    0008_live_results_cron.sql pg_cron + pg_net scheduler: 15-min poll of the
                               /api/cron/update-results endpoint (ADR-0009). Touches no app tables.
  seed/
    teams.csv            48 teams, groups A–L (PLACEHOLDER data — see warning below)
    matches.csv          72 group matches + 32 knockout placeholders (PLACEHOLDER)
    seed.sql             \copy loader: stages CSVs, resolves codes → UUIDs
  README.md
```

## Apply order

Migrations are ordered and must be applied in sequence, then the seed:

```
0001_schema.sql  →  0002_rls.sql  →  0003_functions.sql  →  0004_scoring_overhaul.sql  →  0006_admin_tools.sql  →  seed/seed.sql  →  0007_bonus_categories.sql  →  0008_live_results_cron.sql
```

> **Note `0007` runs AFTER the seed.** It seeds Spain-scorer and tournament
> bonus questions that read the `teams`/`matches` tables, so it must follow
> `seed/seed.sql`. It is fully idempotent: if you accidentally run it before
> seeding (empty tables) it inserts nothing and does not fail — just **re-run
> `0007` after seeding** to materialise those questions.

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
  -f db/migrations/0004_scoring_overhaul.sql \
  -f db/migrations/0006_admin_tools.sql

# Seed (run from repo root for the \copy relative paths):
psql "$(supabase status --output json | jq -r '.DB.url')" -v ON_ERROR_STOP=1 -f db/seed/seed.sql

# 0007 runs AFTER the seed (it reads teams/matches):
psql "$(supabase status --output json | jq -r '.DB.url')" -v ON_ERROR_STOP=1 -f db/migrations/0007_bonus_categories.sql

# 0008 scheduler (pg_cron/pg_net; degrades gracefully if unavailable):
psql "$(supabase status --output json | jq -r '.DB.url')" -v ON_ERROR_STOP=1 -f db/migrations/0008_live_results_cron.sql
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
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0006_admin_tools.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seed/seed.sql   # run from repo root
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0007_bonus_categories.sql  # AFTER the seed
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0008_live_results_cron.sql # scheduler (ADR-0009)
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

### 0006_admin_tools.sql
Admin operational tooling. Mirrors the updated `lib/types.ts`:
- **`bonus_answers.manual_correct boolean`** (nullable, no default): the admin's
  hand-grading verdict for `'text'`-type bonus answers. `null` = not yet graded.
- **Protect trigger** `bonus_answers_protect_manual_correct` (BEFORE UPDATE):
  players legitimately upsert their own `answer` while a question is open, but
  must not set `manual_correct` or `points_awarded`. RLS is row-level (cannot pin
  columns) and Supabase's blanket UPDATE grant makes column REVOKE brittle, so a
  trigger forces both columns back to their OLD values for any caller that is
  **not** the `service_role` and **not** an admin (`is_admin()`). The scoring
  engine (service role / SECURITY DEFINER) is exempt and still writes them.
- **`point_adjustments`** (new table, `PointAdjustment`): arbitrary admin point
  adjustments for unforeseen events. `points` may be **negative** (no check);
  `reason` is required and non-empty; `created_by` → admin profile (set null on
  removal). **Public-read** to all authenticated members; writes only via service
  role / `is_admin()` (same pattern as `round_awards`). Players cannot write.
- **`standings_cache.adjustment_points integer not null default 0`**: per-user
  sum of `point_adjustments.points` (may be negative).
- **`refresh_standings()`** (`create or replace`): adds an `adj_agg` CTE summing
  `point_adjustments.points`; `total_points` now also adds it and
  `adjustment_points` is populated. Tie-breakers **unchanged**
  (`total_points → exact_hits → bonus_points`). Still idempotent `MERGE`, still
  **no scoring math**.
- **Deleting a bonus question** needs no schema change: `bonus_answers.question_id`
  already `on delete cascade` (from `0001`), so its answers drop automatically.

### 0007_bonus_categories.sql
Bonus-question categorisation + Spain/tournament seeds. Mirrors the updated
`lib/types.ts` (`BonusCategory = 'group_winner' | 'spain_scorer' | 'tournament'`,
`BonusQuestion.category`):
- **`bonus_questions.category text not null default 'tournament'`** with a named
  CHECK constraint `bonus_questions_category_check` (`group_winner | spain_scorer
  | tournament`). The constraint is added behind `drop constraint if exists` so
  the file is fully re-runnable.
- **Backfill**: existing auto-generated group-winner rows (text marker
  `¿Campeón del Grupo X?`) are re-tagged to `group_winner`.
- **Spain-scorer seed**: one `text`-type question
  `Primer goleador de España vs {rival}` per Spain (`code = 'ESP'`) **group**
  match, rival looked up dynamically from `teams` (no hardcoded dates/opponents).
  `points = bonus_default_points` (fallback 100), `locks_at = match.kickoff_at`,
  `category = 'spain_scorer'`. Expected 3 (vs Cape Verde, Saudi Arabia, Uruguay)
  but generic over whatever ESP group matches exist.
- **Tournament seed**: `Pichichi del Mundial (máximo goleador)` (`text`) and
  `¿Cuántos goles encajará Curazao en el Mundial?` (`single`, options
  `["10 o más goles","Menos de 10 goles"]`), both `category = 'tournament'`,
  `points = bonus_default_points`, `locks_at = min(kickoff_at)` across all matches.
- **Idempotent + seed-order-safe**: every insert is guarded by `where not exists`
  on the question text and null/`exists` checks on `teams`/`matches`. Runs AFTER
  `seed/seed.sql`; if applied against empty tables it inserts nothing and does not
  fail — **re-run after seeding** to materialise the Spain/tournament questions.

### 0008_live_results_cron.sql
Live-results scheduler (see `docs/decisions/0009-live-results-llm-web-search.md`).
**Additive-only, touches no app tables** — it only reads `public.matches`
(read-only window guard) and creates a scheduler function + cron job.
- Enables `pg_cron` and `pg_net` (the latter `with schema extensions`, per
  Supabase convention). Both creations are wrapped so a host without them logs a
  notice instead of hard-failing — local `supabase` CLI ships both.
- **`public.poll_match_results()`** (`security definer`, owner postgres,
  `search_path = ''`): cheap guard first — returns immediately unless a
  not-`finished` match in `public.matches` kicked off within the last 6 hours
  (the ADR-0009 poll window), so it costs nothing off-window. Then reads
  `app_base_url` + `cron_secret` from **Supabase Vault** (early return, no error
  spam, if either is unset) and fires a fire-and-forget
  `net.http_get {app_base_url}/api/cron/update-results` with
  `Authorization: Bearer {cron_secret}` (30 s timeout). Execute is revoked from
  `anon`/`authenticated` — scheduler only.
- Schedules job **`live-results-poll`** at `*/15 * * * *`, idempotently
  (unschedule-if-exists, then `cron.schedule`), wrapped so absence of pg_cron
  (dev) is a notice, not a failure.

#### One-time prod setup (Vault secrets)

The job reads two secrets from **Supabase Vault** — set them once per project
(Dashboard → Project Settings → Vault, or via SQL). `cron_secret` **must match**
the Vercel `CRON_SECRET` env var (the endpoint checks the bearer token):

```sql
select vault.create_secret('https://<app>.vercel.app', 'app_base_url');
select vault.create_secret('<same value as Vercel CRON_SECRET>', 'cron_secret');
```

To rotate, update the matching Vercel env and re-create the Vault secret. Until
both exist the job ticks harmlessly (logs a notice, no HTTP call).

#### Managing the schedule

```sql
-- Inspect the job
select jobid, schedule, command, active from cron.job where jobname = 'live-results-poll';
-- Recent runs (success/failure)
select * from cron.job_run_details
  where jobid = (select jobid from cron.job where jobname = 'live-results-poll')
  order by start_time desc limit 20;
-- Pause / stop the poll
select cron.unschedule('live-results-poll');
```

Re-running `0008` re-creates the job (it unschedules any existing
`live-results-poll` first), so the migration is fully idempotent.

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
(this also clears predictions — **only pre-launch / in dev**). Both seed files
abort if `predictions`/`bonus_answers` contain rows; see the **Data safety**
section at the top for the rules and the deliberate override.
