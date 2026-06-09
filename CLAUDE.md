# Mundial 2026 Pool — Project Context

Prediction pool web app for the FIFA World Cup 2026, for a private group of ~15–20 friends.
Users predict match scorelines, earn tiered points (with jokers + bonus questions), and compete
on a live-updating leaderboard. An admin dashboard controls scoring rules, jokers, results, and recalculation.

**Where the truth lives** (read before non-trivial work):
- **`PROJECT_PLAN.md`** — the *frozen baseline* (original v0 vision). Evolve **from** it; don't rewrite it.
- **`docs/decisions/`** — the *living memory*: one decision record (ADR) per significant change. When the baseline is superseded, the latest ADR wins. Start at `docs/decisions/README.md`.
- **This file (`CLAUDE.md`)** — the current operative rules Claude must follow each session. Kept lean; points to the ADRs for the *why* and the history.

## Stack
- **Next.js 14** (App Router) + TypeScript + Tailwind + shadcn/ui-style components
- **Supabase** (Postgres + Auth + Realtime + RLS) — per-user isolation via Row-Level Security
- **Hosting:** Vercel (app) + Supabase (managed DB)
- **Football data:** results are entered **manually by the admin** — no live provider, no polling cron (see `docs/decisions/0002-manual-results-no-live-data.md`). The `FootballDataProvider` interface, impls, the `/api/cron/update-results` route and `CRON_SECRET` are kept **dormant** for a possible future re-enable.

## Architecture rules (non-negotiable)
1. **Shared contract = `lib/types.ts`.** All domain types live there and mirror the DB schema. Keep in sync with `/db/migrations`.
2. **Provider-agnostic core.** App code depends only on `lib/providers/FootballDataProvider.ts`, never on a concrete impl. Select impl via `FOOTBALL_PROVIDER` env var.
3. **Scoring always reads `app_settings`** (the single jsonb config row) — never hardcode point values. `lib/scoring` is pure and unit-testable.
4. **Never trust the client for locks.** Prediction freeze at `kickoff` is enforced server-side / via RLS (`now() < locks_at`).
5. **Recalc is idempotent and MANUAL.** Admin previews impact ("affects X predictions") before executing; re-scoring never double-counts.
6. **Path alias:** `@/*` maps to repo root.

## Directory map
- `app/` — routes. `(auth)`, `dashboard`, `matches`, `standings`, `bonus`, `match/[id]`, `chat`, `admin/*`, `api/*`
- `lib/supabase` — browser (`client.ts`) + server (`server.ts`, incl. `createServiceClient` for cron/admin)
- `lib/providers` — `FootballDataProvider` interface + impls
- `lib/scoring` — pure scoring engine (reads `AppSettings`)
- `lib/auth` — role guards
- `components/` — `ui/` (shadcn), `MatchCard`, `PredictionForm`, `RankingTable`, `PointsChart`, `Countdown`, `admin/*`
- `db/migrations` — schema + RLS + triggers; `db/seed` — teams + WC2026 calendar

## Scoring (defaults, all in `app_settings`) — see `docs/decisions/0001-scoring-overhaul.md`
exact scoreline = 50, correct sign (1/X/2) = 20, correct goal-difference bonus = +10, wrong = 0.
Tie-breakers: total points → exact hits → bonus points.

**Jokers are admin-assigned per match** (`matches.is_joker`), NOT user-chosen. A joker match
multiplies *every* user's points on it by `joker_multiplier` (default ×3). `predictions.is_joker`
and `app_settings.jokers_per_user` are deprecated/back-compat only; scoring reads `match.is_joker`.
Target joker counts (admin picks freely): group 1/matchday = 3, R32 = 2, R16 = 2, QF = 1, SF = 1, F = 1.

**Bonus questions** default to 100 pts; types `single | multi | numeric | text` (text = free-text,
case-insensitive). Group winner = auto-generated `single` bonus per group (admin button, 50 pts).

**Meta volante (round champion):** most prediction points in a round earns `meta_volante_points`
(default 100), stored in `round_awards` and summed into `standings_cache.meta_points` + total by
`refresh_standings()`. Rounds: group-md1/2/3 (`matches.matchday`) + each knockout stage
(third_place folds into final). Ties break by exact hits in the round, then split. Computed in the
MANUAL recalc only (`pickRoundWinners` in `lib/scoring`).

## Build tooling (`.claude/`)
- **`/build-phase [1-8|all]`** — orchestrator command: fans out the specialist agents for a PROJECT_PLAN phase, then reconciles (typecheck → tests → build).
- **Agents** (in `.claude/agents/`, disjoint ownership): `db-migrator` (db/), `provider-engineer` (lib/providers/), `scoring-engineer` (lib/scoring/), `ui-builder` (components/), `pages-builder` (app/ + auth), `admin-builder` (app/admin + components/admin), `api-builder` (app/api). Each codes against the contracts above and writes only inside its directory.
- **`/run-porra [dev|build|verify]`** skill — local launch recipe (local Supabase → migrate → seed → `npm run dev`). Also drives `/run` and `/verify`.

## Project memory (incremental & persistent)
- **PROJECT_PLAN.md = baseline, frozen.** Never edit it to reflect new decisions — it's the v0 reference we evolve from.
- **`docs/decisions/` = the log we evolve into.** After any significant change (new rule, schema change, architectural choice, scope shift), append a new ADR there: copy `docs/decisions/0000-template.md` → next number, fill it in, add a row to the index in `docs/decisions/README.md`.
- **Keep CLAUDE.md current.** When an ADR changes an *operative* rule, update the relevant CLAUDE.md line (the concise current rule) and link the ADR — don't duplicate the full rationale here.
- **Precedence when docs disagree:** latest ADR > CLAUDE.md > PROJECT_PLAN.md.

## Conventions
- Server Components by default; `"use client"` only when needed.
- Validate inputs with `zod` in Server Actions / API routes.
- `npm run typecheck` and `npm run lint` must pass before considering work done.
- Secrets in `.env` (see `.env.example`); never commit them.
