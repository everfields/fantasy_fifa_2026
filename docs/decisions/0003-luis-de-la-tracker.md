# ADR-0003: "Luis de la Tracker" — AI prediction-strategy tracker

- **Date:** 2026-06-10
- **Status:** Accepted
- **Supersedes:** — (re-introduces a single daily `crons` entry narrowed away by ADR-0002)

## Context

The pool needed a recurring, fun "editorial" layer on top of the raw leaderboard: an automatic
read of *how* players predict (their strategies) crossed with the results, surfaced as a few
punchy insights the group can read between matchdays. We wanted real data analysis — pattern
detection, not vibes — but delivered with personality.

ADR-0002 removed all live-data cron and froze the `crons` block (Hobby plan allows **daily** cron
only). That constraint actually *fits* this feature: "una vez finalizados los partidos de cada
día" maps cleanly onto a single daily cron.

## Decision

Add **"Luis de la Tracker"** — a parody of the Spain NT coach Luis de la Fuente (seco, directo,
chulesco, con aire de superioridad sobre las estrategias de los jugadores) — as a player-facing
section fed by a daily pipeline:

1. **Analysis (pure, deterministic).** `lib/tracker/analysis.ts` (`analyzePredictions`) detects
   patterns across every player's predictions vs. results and emits ranked, factual
   `TrackerCandidateFinding`s: crack/desastre del día, clavadas, **rebaño cazado** + contrarian,
   inflación de goles, jóker, perfiles de riesgo (conservador / artillero / empatador /
   corta-pega), acierto global, líder/colista. Diversity-capped (≤2 per category, top 10). Pure,
   unit-tested (`analysis.spec.ts`).
2. **Persona (shared).** `lib/tracker/persona.ts` holds `LUIS_SYSTEM_PROMPT` + `buildLuisBriefing`
   — the single source of truth for his voice, used by both prod and the dev skill.
3. **Verbalization (LLM).** `lib/tracker/luis.ts` calls the **Anthropic SDK directly**
   (`ANTHROPIC_API_KEY`, model `TRACKER_MODEL` ?? `claude-opus-4-8`, adaptive thinking, structured
   JSON output) to turn the candidates into a `headline` + **exactly 5 findings** in character.
   The model only *verbalizes* — it never computes or invents numbers/names.
4. **Storage.** `tracker_reports` (one row per `report_date`): `headline`, `findings` jsonb,
   `analysis` snapshot jsonb, `model`, `status`. Public-read RLS; writes via service role/admin.
5. **Trigger.** Daily Vercel cron `GET /api/cron/luis-tracker` (`CRON_SECRET` bearer), idempotent
   upsert; skips an already-generated day unless `?force`. `?date=YYYY-MM-DD` to backfill.
6. **UI.** `/tracker` page (latest parte + history) and a dashboard teaser. Real photo of Luis de
   la Fuente from Wikimedia Commons (`lib/tracker/brand.ts`, override via
   `NEXT_PUBLIC_LUIS_PHOTO_URL`), with attribution.
7. **Dev skill.** `.claude/skills/luis-de-la-tracker` to generate/preview/tune locally.

## Alternatives considered

- **Claude Code skill only (no in-app feature)** — rejected: `.claude/skills` are dev-time tools
  and can't run on a production cron or be read by players. The literal "skill" ask is satisfied
  by the dev skill *plus* the in-app pipeline (we built both).
- **Vercel AI Gateway (`ai` SDK, `provider/model` strings)** — viable on Vercel, but we chose the
  **Anthropic SDK directly** for a tighter, dependency-light path and exact control of the model.
- **Graceful-fallback-first (build without a key)** — folded in as a safety net: no key / API
  failure → a deterministic `analysis_only` report (raw findings, no persona) so the cron never
  hard-fails. The intended prod path is the real LLM voice.
- **Per-prediction live commentary** — overkill for a 15–20 person pool; a daily parte is the
  right cadence and the only Hobby-legal cron.

## Consequences

- **Operative rule:** the daily cron generates one parte per day from the *current* DB state
  (which depends on the admin having entered results + run the manual recalc — ADR-0002). The
  report covers the latest calendar day with finished matches.
- **`crons` re-introduced** in `vercel.json` with a **single daily** entry (`0 8 * * *`) — within
  Hobby limits. Does not resurrect live-data polling (ADR-0002 stands).
- **New env:** `ANTHROPIC_API_KEY` (required for the real voice), `TRACKER_MODEL` (optional),
  `NEXT_PUBLIC_LUIS_PHOTO_URL` (optional).
- **New dependency:** `@anthropic-ai/sdk`. (Note: the SDK's zod helper targets zod v4; the project
  pins zod v3, so we use a raw JSON-schema structured output + zod-v3 validation, not the helper.)
- **Pending:** migration `0005_luis_tracker.sql` must be applied; set `ANTHROPIC_API_KEY` in Vercel
  (and `CRON_SECRET`, already required). Photo is a CC Wikimedia image used parodically.

## Changes landed

- **Contract:** `lib/types.ts` — `TrackerStat`, `TrackerCandidateFinding`, `TrackerAnalysis`,
  `TrackerFinding`, `TrackerVerbalization`, `TrackerStatus`, `TrackerReport`.
- **DB:** `db/migrations/0005_luis_tracker.sql` — `tracker_reports` table + RLS.
- **Code:** `lib/tracker/{analysis,analysis.spec,persona,luis,brand}.ts`;
  `app/api/cron/luis-tracker/route.ts`; `components/LuisTracker.tsx`; `app/tracker/page.tsx`;
  dashboard teaser; nav link; `vercel.json` cron; `.env.example`; `package.json` (`@anthropic-ai/sdk`).
- **Docs:** `.claude/skills/luis-de-la-tracker/SKILL.md`; `CLAUDE.md` updated; this ADR + index row.
