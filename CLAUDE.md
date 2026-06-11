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
- **Football data:** results update **automatically** via `LlmWebSearchProvider` (`FOOTBALL_PROVIDER=llm`, Anthropic Haiku + web_search tool) feeding the idempotent `/api/cron/update-results` route, triggered every 15 min by **Supabase pg_cron + pg_net** (Vault secrets `app_base_url`/`cron_secret`) — not by a Vercel cron. Two polls per match (half-time +45–70′, full-time from +115′ with retry-until-FT); `finished` only on explicit full-time confirmation; auto-rescore on finish. Admin manual entry + recalc remain authoritative overrides. See `docs/decisions/0009-live-results-llm-web-search.md` (supersedes 0002).
- **AI ("Luis de la Tracker"):** Anthropic SDK (`@anthropic-ai/sdk`, `ANTHROPIC_API_KEY`, model `TRACKER_MODEL` ?? `claude-opus-4-8`) verbalizes a daily prediction-strategy analysis in persona. Daily Vercel cron. See `docs/decisions/0003-luis-de-la-tracker.md`.

## Architecture rules (non-negotiable)
1. **Shared contract = `lib/types.ts`.** All domain types live there and mirror the DB schema. Keep in sync with `/db/migrations`.
2. **Provider-agnostic core.** App code depends only on `lib/providers/FootballDataProvider.ts`, never on a concrete impl. Select impl via `FOOTBALL_PROVIDER` env var.
3. **Scoring always reads `app_settings`** (the single jsonb config row) — never hardcode point values. `lib/scoring` is pure and unit-testable.
4. **Never trust the client for locks.** Prediction freeze at `kickoff` is enforced server-side / via RLS (`now() < locks_at`).
5. **Recalc is idempotent and MANUAL.** Admin previews impact ("affects X predictions") before executing; re-scoring never double-counts. Exception (ADR-0012): a *single match* is rescored automatically when it finishes — via cron, «Sync ahora», or the admin saving a result as `finished` — using the same idempotent helpers; jokers/bonus/meta volante still require the full manual recalc.
6. **Path alias:** `@/*` maps to repo root.
7. **Player data is sacred — never lose predictions.** `predictions`, `bonus_answers`, `point_adjustments`, `round_awards`, `profiles` must never be hit by `drop`/`truncate`/`delete` — directly or via FK cascade (deleting a `matches`/`teams`/`bonus_questions` row cascade-deletes predictions/answers: always `UPDATE` in place, never delete+reinsert). Migrations are **additive-only** post-launch; seeds self-abort if player data exists; **backup before any prod SQL** with `bash db/backup.sh`. Full guide: `db/README.md` → "Data safety" (ADR-0007).

## Directory map
- `app/` — routes. `(auth)`, `dashboard`, `matches`, `standings`, `mundial`, `bonus`, `match/[id]`, `tracker`, `admin/*`, `api/*` (incl. `api/cron/luis-tracker`) — no chat (see `docs/decisions/0005-remove-chat.md`)
- `lib/supabase` — browser (`client.ts`) + server (`server.ts`, incl. `createServiceClient` for cron/admin)
- `lib/providers` — `FootballDataProvider` interface + impls
- `lib/scoring` — pure scoring engine (reads `AppSettings`)
- `lib/tournament` — pure group-standings + best-thirds (FIFA criteria) for `/mundial`; bracket renders from `matches` rows, knockout teams assigned by the admin — no LLM (ADR-0011)
- `lib/tracker` — "Luis de la Tracker": `analysis.ts` (pure), `persona.ts`, `luis.ts` (LLM), `brand.ts`
- `lib/auth` — role guards
- `components/` — `ui/` (shadcn), `MatchCard`, `PredictionForm`, `RankingTable`, `PointsChart`, `Countdown`, `LuisTracker`, `admin/*`
- `db/migrations` — schema + RLS + triggers; `db/seed` — teams + WC2026 calendar

## Scoring (defaults, all in `app_settings`) — see `docs/decisions/0001-scoring-overhaul.md`
exact scoreline = 50, correct sign (1/X/2) = 20, correct goal-difference bonus = +10, wrong = 0.
Tie-breakers: total points → exact hits → bonus points.

**Jokers are admin-assigned per match** (`matches.is_joker`), NOT user-chosen. A joker match
multiplies *every* user's points on it by `joker_multiplier` (default ×3). `predictions.is_joker`
and `app_settings.jokers_per_user` are deprecated/back-compat only; scoring reads `match.is_joker`.
Target joker counts (admin picks freely): group 1/matchday = 3, R32 = 2, R16 = 2, QF = 1, SF = 1, F = 1.

**Bonus questions** default to 100 pts; types `single | multi | numeric | text`. `text` (free-text)
is graded **manually per answer by the admin** (`bonus_answers.manual_correct`, panel in
`/admin/bonus`) — never by string comparison (see `docs/decisions/0004`). Questions can be deleted
from the admin (cascade + audit + standings refresh). Group winner = auto-generated `single` bonus
per group (admin button, 50 pts). The manual recalc grades predictions AND bonus answers.
Questions carry a `category` (`group_winner | spain_scorer | tournament`) rendered as 3 visual
blocks in `/bonus` and `/admin/bonus` (see `docs/decisions/0006-bonus-categories.md`).

**Point adjustments:** arbitrary ± points per player for unforeseen events live in
`point_adjustments` (reason required, admin-only writes, UI in `/admin/users`); summed into
standings by `refresh_standings()`. Never hand-edit `points_awarded` — recalc reverts it.

**Meta volante (round champion):** most prediction points in a round earns `meta_volante_points`
(default 100), stored in `round_awards` and summed into `standings_cache.meta_points` + total by
`refresh_standings()`. Rounds: group-md1/2/3 (`matches.matchday`) + each knockout stage
(third_place folds into final). Ties break by exact hits in the round, then split. Computed in the
MANUAL recalc only (`pickRoundWinners` in `lib/scoring`).

**Pot (money):** `entry_fee` 20 €/player; 2º gets the stake back; 20 € `pot_expenses` (domain + infra)
reimbursed to the organizer; 1º takes the rest. Math in `lib/pot.ts`; `pot_amount` is derived
(`entry_fee × paid`), never hand-entered. Players see only the two prizes on `/standings`
(see `docs/decisions/0010-pot-payout-model.md`).

## Luis de la Tracker (AI tracker) — see `docs/decisions/0003-luis-de-la-tracker.md`
Daily AI "parte" parodying Spain coach Luis de la Fuente (seco, chulesco, sobrado). Pipeline:
**pure analysis** (`lib/tracker/analysis.ts`, deterministic, unit-tested — detects cracks,
batacazos, rebaño, perfiles de riesgo, jóker, clasificación) → **LLM verbalization**
(`lib/tracker/luis.ts`, Anthropic SDK, persona in `lib/tracker/persona.ts`) → **`tracker_reports`**
(one row/day) → `/tracker` page + dashboard teaser. **HARD RULE: the LLM only verbalizes, never
invents numbers/names** — new insights = new patterns in `analysis.ts` (+ a test), not prompt
embellishment. Trigger: daily Vercel cron `GET /api/cron/luis-tracker` (`CRON_SECRET`; idempotent
upsert; `?date=`/`?force`). No key / API failure → deterministic `analysis_only` report. The single
daily `crons` entry is Hobby-legal and does **not** resurrect live-data polling (ADR-0002 stands).

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
- **Dark mode:** `next-themes` (class-based) — UI colors must use the semantic tokens (`bg-background`, `text-muted-foreground`, `border-border`…), never hardcoded palette colors, so both themes work (see `docs/decisions/0008-dark-mode.md`).
- Validate inputs with `zod` in Server Actions / API routes.
- `npm run typecheck`, `npm run lint` and `npm test` (vitest) must pass before considering work done.
- Secrets in `.env` (see `.env.example`); never commit them.
