# ADR-0002: Match results entered manually by admin — no live football-data provider

- **Date:** 2026-06-09
- **Status:** Superseded by 0009
- **Supersedes:** — (narrows the data-ingestion scope of `PROJECT_PLAN.md` and the provider/cron architecture in `CLAUDE.md`)

## Context

The original design ingested results automatically: a `FootballDataProvider` (football-data.org
free, API-Football paid) polled by a Vercel cron (`/api/cron/update-results`, every 2 min) that
matched provider fixtures to our `matches` rows, wrote scores, and rescored idempotently.

Three problems surfaced in production:

1. **Hobby plan can't run a frequent cron.** `*/2 * * * *` is rejected at Vercel build validation
   ("Hobby accounts are limited to daily cron jobs"), which silently failed *every* deploy of new
   code — prod was frozen on an old commit for ~a day. (See the fixes in commit `2be0c64`.)
2. **API-Football free plan has no WC2026 data** — `"Free plans do not have access to this season,
   try from 2022 to 2024."` So the live path couldn't return real fixtures anyway.
3. For a ~15–20 person private pool, automated live ingestion is not worth a paid plan or an
   external scheduler.

## Decision

**No live data provider. The admin enters every match result by hand.**

- Results are set via `saveResult()` in `app/admin/matches/actions.ts` (home/away score + status
  `scheduled | live | finished`), audit-logged.
- Points are distributed by the existing **manual, idempotent recalc** ("Recalcular"), not by any
  automated poll.
- **No scheduled cron.** `vercel.json` carries no `crons` block.

## Alternatives considered

- **Upgrade to Vercel Pro + paid API-Football** — unlocks the 2-min cron and WC2026 data, but a
  recurring cost for a tiny private pool. Rejected.
- **Daily Vercel cron + external scheduler (GitHub Actions / cron-job.org)** — keeps near-live
  polling for free. Briefly implemented (a `poll-results.yml` workflow) then removed: still depends
  on a working provider we don't have, and adds moving parts/noise for no benefit here. Rejected.

## Consequences

- **Operative rule:** scores reach the leaderboard only after an admin saves the result *and* runs
  the recalc. There is no automatic update.
- **Removed:** the `crons` block in `vercel.json`; the `.github/workflows/poll-results.yml` poller.
- **Kept for back-compat / future re-enable (dormant):** the `/api/cron/update-results` route, the
  `getProvider()` selector + provider impls, and the `CRON_SECRET` env var. Flipping live data back
  on later = restore a cron schedule (needs a non-Hobby plan) + a provider/plan with WC2026 access.
- The middleware `/api` matcher bypass (commit `2be0c64`) **stays** regardless — it's correct on its
  own and is required for the admin's `sync-now`/`recalc` API calls to authenticate.

## Changes landed

- **Code:** `vercel.json` — `crons` removed. `.github/workflows/poll-results.yml` — deleted.
  (commit `b9f682b`)
- **Docs:** `CLAUDE.md` — Football-data rule updated to point here; this ADR added; index row added.
