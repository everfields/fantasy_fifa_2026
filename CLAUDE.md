# Mundial 2026 Pool — Project Context

Prediction pool web app for the FIFA World Cup 2026, for a private group of ~15–20 friends.
Users predict match scorelines, earn tiered points (with jokers + bonus questions), and compete
on a live-updating leaderboard. An admin dashboard controls scoring rules, jokers, results, and recalculation.

Full product spec lives in **PROJECT_PLAN.md** — read it before non-trivial work.

## Stack
- **Next.js 14** (App Router) + TypeScript + Tailwind + shadcn/ui-style components
- **Supabase** (Postgres + Auth + Realtime + RLS) — per-user isolation via Row-Level Security
- **Hosting:** Vercel (app) + Supabase (managed DB)
- **Football data:** `FootballDataProvider` interface; start with football-data.org (free), optional API-Football (paid, live data)

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

## Scoring (defaults, all in `app_settings`)
exact scoreline = 5, correct sign (1/X/2) = 3, correct goal-difference bonus = +1, wrong = 0.
Joker multiplier doubles a chosen match. Tie-breakers: total points → exact hits → bonus points.

## Build tooling (`.claude/`)
- **`/build-phase [1-8|all]`** — orchestrator command: fans out the specialist agents for a PROJECT_PLAN phase, then reconciles (typecheck → tests → build).
- **Agents** (in `.claude/agents/`, disjoint ownership): `db-migrator` (db/), `provider-engineer` (lib/providers/), `scoring-engineer` (lib/scoring/), `ui-builder` (components/), `pages-builder` (app/ + auth), `admin-builder` (app/admin + components/admin), `api-builder` (app/api). Each codes against the contracts above and writes only inside its directory.
- **`/run-porra [dev|build|verify]`** skill — local launch recipe (local Supabase → migrate → seed → `npm run dev`). Also drives `/run` and `/verify`.

## Conventions
- Server Components by default; `"use client"` only when needed.
- Validate inputs with `zod` in Server Actions / API routes.
- `npm run typecheck` and `npm run lint` must pass before considering work done.
- Secrets in `.env` (see `.env.example`); never commit them.
