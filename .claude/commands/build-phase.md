---
description: Fan out the porra build agents to implement a phase from PROJECT_PLAN.md, then reconcile (typecheck, tests, build).
argument-hint: "[phase number 1-8 | all]"
model: opus
---

You are the **build orchestrator** for the Mundial 2026 Pool. Implement phase **$ARGUMENTS** of `PROJECT_PLAN.md` by fanning out specialist subagents, then reconciling their output.

## Steps

1. **Read** `PROJECT_PLAN.md` (section 8 = phase plan) and `CLAUDE.md`. Confirm the foundation contracts exist: `lib/types.ts`, `lib/providers/FootballDataProvider.ts`, `lib/supabase/*`. If they don't, build them first — every agent codes against them.

2. **Select agents** for the phase, then dispatch the relevant ones **in parallel** with the `Agent` tool (one message, multiple calls). Their ownership boundaries are disjoint, so they compose without collision. Map:
   - **Phase 1 — Setup:** `db-migrator` (schema, RLS, auth trigger, app_settings).
   - **Phase 2 — Data:** `provider-engineer` + `db-migrator` (seed teams + WC2026 calendar).
   - **Phase 3 — Core gameplay:** `scoring-engineer`, `ui-builder`, `pages-builder`.
   - **Phase 4 — Admin (core):** `admin-builder` + `api-builder` (recalc preview/execute, sync-now).
   - **Phase 5 — Bonus + jokers + pot:** `pages-builder` (bonus form + joker mechanic) + `admin-builder` (bonus/pot pages).
   - **Phase 6 — Live & realtime:** `api-builder` (update-results cron) + `provider-engineer` (apiFootball for live data) + `pages-builder`/`ui-builder` (live scoreboards, projected points, charts).
   - **Phase 7 — Social:** `pages-builder` + `ui-builder` (chat/shoutbox, badges/streaks, matchday mini-league).
   - **Phase 8 — Polish:** no fan-out — you do responsive/UX passes and the prod deploy checklist directly.
   - **`all`:** run phases in order; do not start a phase until the previous reconciles clean.

   In each agent prompt, name the specific phase deliverables and restate that they must (a) code against `lib/types.ts` + the documented component-prop contracts, (b) write only inside their owned directory, (c) NOT run `npm`.

3. **Do NOT write feature code yourself.** Your job is to dispatch and then reconcile. The only files you author are cross-cutting glue if an agent flags a missing contract.

4. **Reconcile** once agents return:
   - `npx tsc --noEmit` — fix any cross-agent type mismatches (these are the expected friction points; resolve them, don't re-dispatch for trivial fixes).
   - `npx tsx --test lib/scoring/scoring.spec.ts` if scoring changed.
   - `npm run build` — must compile and pass lint.
   - Watch for the known traps: `app_settings` config lives under the `settings` jsonb column (not flat); inline `eslint-disable` of unloaded TS rules fails lint; iterators need `target: es2022`.

5. **Report** per agent: files written, key decisions, and assumptions (especially placeholder data or unverified provider APIs). End with the green/red status of typecheck, tests, and build.
