# ADR-0021: Page past PostgREST's 1000-row cap on prediction reads

- **Date:** 2026-06-26
- **Status:** Accepted
- **Supersedes:** —

## Context

A player (alberandu) hit a 50-point exact scoreline on Curaçao–Ivory Coast (group matchday 3),
yet the meta-volante "ronda en curso" board on `/standings` showed his round total as 40 with 0
plenos — lower than that single game. His stored `predictions.points_awarded` was correct (50);
the **display** was wrong, and not only for him: the whole live board was off.

Root cause: PostgREST (Supabase) caps **every** response at `max-rows` (1000). An unbounded
`.select("*")` therefore returns only the first 1000 rows and gives **no error** — it just
silently truncates. The `predictions` table had grown to **1116 rows** (17 players × ~64 matches).
The standings page loaded `from("predictions").select("*")` and summed `points_awarded` over the
**first 1000 rows only**; whichever players' rows fell in the dropped 116-row tail under-counted.
`refresh_standings()` runs server-side in SQL (no PostgREST cap), which is why `total_points` was
correct while the TS-side live board was not.

The same truncation lurked in two correctness-critical paths that read predictions through
PostgREST:

- **Manual recalc** (`app/admin/recalc/actions.ts`) — `select("*")` over all predictions; would
  rescore only 1000/1116 and never touch the overflow, breaking the "recalc is idempotent and
  authoritative" invariant.
- **Round-award settlement** (`recomputeRoundAwards` / `rescoreMatches` in `app/api/_lib.ts`) —
  `.in("match_id", …)` over eligible/finished matches. Already at ~950 rows for groups md1+md2;
  the moment md3 settles (72 group matches × 17 ≈ 1224) it would exceed 1000 and mis-award the
  meta volante.

## Decision

Introduce a single pagination helper and route every **aggregate read of a table that can exceed
1000 rows** through it:

`lib/supabase/paginate.ts` → `selectAll<T>(makeQuery, pageSize = 1000)`: takes a **factory**
(a PostgREST builder is single-use once ranged/awaited) and pages with `.range(from, from+size-1)`
until a short page (`< pageSize`) signals the end. Throws on the first query error.

Applied at all four sites that read predictions/bonus answers in bulk:

- `app/standings/page.tsx` — predictions + bonus_answers.
- `app/admin/recalc/actions.ts` — predictions (`computeChanges`) + bonus_answers (`computeBonusChanges`).
- `app/api/_lib.ts` — `rescoreMatches` and `recomputeRoundAwards` prediction loads.

## Alternatives considered

- **Raise the server `max-rows` limit** — global config knob, affects every query, still finite,
  and doesn't protect against the next ceiling. Rejected: papers over the bug, doesn't scale.
- **`.limit(10000)` at each call site** — a magic number that becomes a silent truncation again
  the day the table outgrows it; no signal when it does. Rejected.
- **Push every aggregation into SQL RPCs** — robust but heavyweight for read-time display logic
  that already lives in pure TS; the live board needs match/round context the TS code holds.
  Deferred; pagination is the minimal correct fix.

## Consequences

- New operative rule: **never read a growable table with an unbounded `.select()` for an
  aggregation** — use `selectAll`. `predictions` is already over 1000; `bonus_answers` will follow.
- The live meta-volante board, manual recalc, and round-award settlement are now correct above
  1000 rows. alberandu's md3 board entry is back to 110 pts / 1 pleno.
- Stored data was never corrupted — this was a read-time truncation — so no backfill/migration is
  needed. Re-rendering `/standings` shows correct numbers immediately; a recalc run is now safe.
- Low-volume reads kept untouched (e.g. `matches` ≈ 104, `profiles` 17, single-player prediction
  reads) — they cannot approach the cap.

## Changes landed

- **Code:** `lib/supabase/paginate.ts` (new `selectAll`); call sites in `app/standings/page.tsx`,
  `app/admin/recalc/actions.ts`, `app/api/_lib.ts`.
- **Tests:** `lib/supabase/paginate.spec.ts` — paging past 1000, short single page, exact-multiple
  extra probe, error propagation.
- **Docs:** `CLAUDE.md` architecture rule added; this ADR; index row in `docs/decisions/README.md`.
