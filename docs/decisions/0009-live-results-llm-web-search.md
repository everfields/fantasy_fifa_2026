# ADR-0009: Live results via LLM web-search provider + external scheduler

- **Date:** 2026-06-10
- **Status:** Accepted
- **Supersedes:** ADR-0002 (manual results — no live data provider)

## Context

ADR-0002 turned off live data because (1) Vercel Hobby rejects sub-daily crons and (2) no free
football-data provider has WC2026 data. Both blockers now have cheap workarounds:

1. The schedule can live **outside Vercel** (Supabase `pg_cron` + `pg_net` hitting the existing
   `CRON_SECRET`-protected endpoint) — the Hobby limit only applies to Vercel-managed crons.
2. The data can come from an **LLM with web search** (Anthropic API, already in the stack for Luis
   de la Tracker). World Cup scores are massively reported; a cheap model (Haiku 4.5) with the
   server-side `web_search` tool retrieves them reliably for cents.

The dormant infrastructure from ADR-0002 (the `FootballDataProvider` interface, `getProvider()`,
the idempotent `/api/cron/update-results` route) is reused as-is.

## Decision

**Re-enable automatic match results, with an LLM web-search provider and a low-frequency
two-poll-per-match strategy. Auto-scoring on confirmed full-time.**

### Provider: `LlmWebSearchProvider` (`lib/providers/llmWebSearch.ts`)

- Implements `FootballDataProvider`; selected via `FOOTBALL_PROVIDER=llm`.
- `getLiveMatches()`:
  1. Loads **candidate matches from the DB** (service client): `status != 'finished'` and *now*
     inside a poll window (below). **No candidates → returns `[]` without calling the LLM** (zero
     cost on non-match days / between windows).
  2. One Anthropic call (`RESULTS_MODEL` ?? `claude-haiku-4-5`) with the `web_search_20250305`
     server tool + a strict custom tool for structured output. The prompt lists the exact candidate
     fixtures (teams, kickoff); the LLM **only fills in scores/status for those fixtures — it never
     invents matches**.
  3. **`finished` only on explicit full-time confirmation** by the sources. If sources are
     ambiguous or the match is still running (long stoppage, extra time, penalties), it reports
     `live` and the next tick retries — this retry-until-FT loop replaces dense polling and acts as
     the hallucination guard before auto-scoring.
- `getTeams()` / `getMatches()` return `[]` (calendar is seeded); `getMatch()` reuses the same
  pipeline for one match (force-sync).
- API failure / missing `ANTHROPIC_API_KEY` → `[]` (never throws into the cron).

### Poll windows (per match, evaluated against `kickoff_at`)

- **Half-time:** kickoff +45′ … +70′ → one tick lands here → half-time score, status `live`.
- **Full-time:** from kickoff +115′ until status becomes `finished` (capped at kickoff +6h to
  cover extra time + penalties) → first tick usually confirms FT; otherwise retries every tick.

Result: ~2–4 LLM calls per match (~300 calls total tournament, a few $ with Haiku). Simultaneous
matches (last group matchday) share a single call.

### Scheduler: Supabase `pg_cron` + `pg_net`

- A `pg_cron` job every **15 minutes** does an HTTP `GET {app_base_url}/api/cron/update-results`
  with `Authorization: Bearer {cron_secret}`. URL + secret are read from **Supabase Vault**
  (`app_base_url`, `cron_secret` secrets), never hardcoded in the migration.
- The endpoint is the existing idempotent route: in steady state (no candidates) it does **zero
  writes and zero LLM calls**.
- The single Vercel cron (Luis) stays, moved to **06:30 España** = `30 4 * * *` UTC.

### Auto-scoring policy

When a match transitions to `finished`, the cron route rescores its predictions idempotently and
refreshes standings (existing behavior). The admin keeps full override power: `saveResult()` +
manual recalc remain authoritative and revert anything wrong. **Meta volante (`round_awards`) and
bonus grading remain MANUAL-recalc-only** — the admin runs "Recalcular" at the end of each round as
before.

## Alternatives considered

- **Paid provider (API-Football) + Vercel Pro** — recurring cost for a 15-person pool. Rejected (same as ADR-0002).
- **Dense polling (every 10 min during match windows)** — more LLM calls for live-score UX nobody asked for. Rejected in favor of the two-poll strategy.
- **GitHub Actions / cron-job.org as scheduler** — works, but adds a vendor; Supabase is already in the stack and pg_cron is free. Rejected.
- **Provisional results + admin one-click confirm** — safer but reintroduces manual work; the FT-confirmation rule + idempotent recalc + admin override give enough safety. Rejected.

## Consequences

- **Operative rule change:** match scores and prediction points update automatically; the admin no
  longer needs to type results (but still can — manual entry + recalc override everything).
- Data safety unchanged: the pipeline only `UPDATE`s `matches` and `predictions.points_awarded`
  (rule 7 intact).
- New env vars: `FOOTBALL_PROVIDER=llm`, `RESULTS_MODEL` (optional), plus existing
  `ANTHROPIC_API_KEY` / `CRON_SECRET`. Supabase Vault needs `app_base_url` + `cron_secret` set
  once (documented in `db/README.md`).
- ADR-0002's "no scheduled polling" rule is superseded; ADR-0003's note that the Luis cron "does
  not resurrect live-data polling" is overtaken by this ADR.
- Risk: a hallucinated final score would award points until the next correct poll/manual recalc —
  mitigated by the explicit-FT rule, fixture allowlist, and admin override.

## Changes landed

- **Code:** `lib/providers/llmWebSearch.ts` (new) + registration in `lib/providers/index.ts`;
  `vercel.json` Luis cron → `30 4 * * *`.
- **DB:** `db/migrations/0008_live_results_cron.sql` — enables `pg_cron`/`pg_net`, schedules the
  15-min poll reading Vault secrets; additive-only, no player-data risk.
- **Docs:** `CLAUDE.md` football-data + cron rules updated; `db/README.md` Vault setup; this ADR;
  index row; ADR-0002 marked Superseded.
