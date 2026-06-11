# ADR-0012: Matchday ops — auto-rescore on manual result save + live meta volante view

- **Date:** 2026-06-11
- **Status:** Accepted
- **Supersedes:** — (refines 0001/0009; the global manual recalc rule stands)

## Context

First real matchday (2026-06-11) surfaced three friction points while the group watched the game:

1. The admin "Sync ahora" button (`/admin/matches` → Editar) had been broken since launch: the
   server action posted `{ match_id }` but `/api/admin/sync-now` validates `{ matchId }` → every
   click failed with 400. Nobody noticed because the pg_cron path worked.
2. Manually saving a final result (`saveResult`) only wrote the score and told the admin to go run
   the full recalc in `/admin/recalc`. Meanwhile the *automatic* path (cron / sync-now) already
   rescored that match on finish — two inconsistent behaviours for the same event. The admin wants
   points to flow immediately from the phone, mid-watch.
3. The "Meta volante" tab on `/standings` only showed granted `round_awards` rows — empty until the
   first round closes and the manual recalc runs. Players couldn't see who was leading the round.

## Decision

1. **Fix the sync body**: `syncNow` posts `{ matchId }`. (`app/admin/matches/actions.ts`)
2. **`saveResult` rescores its match in place**: after writing score/status it runs the idempotent
   single-match `rescoreMatches` + `refreshStandings` (same helpers the cron uses), and the audit
   row records `rescored`. Setting a non-finished status clears points back to null (consistent).
   The user explicitly accepted this rule change ("quizás así es más consistente"). The **full**
   manual recalc (preview → confirm) remains the only path for jokers toggled after scoring, bonus
   grading and meta volante — CLAUDE.md rule 5 is unchanged for the global operation.
3. **Live meta volante view**: the Meta volante tab shows a *provisional* standing of the round in
   progress (earliest started round without a granted award), computed at render time from already
   `points_awarded` predictions on finished matches (ties: round points → exact hits). Display
   only — `round_awards` is still written exclusively by the manual recalc at round close.

## Alternatives considered

- **Keep saveResult write-only** — rejected: inconsistent with the automatic finish path and forces
  a full-recalc round-trip for a one-match event during live viewing.
- **Grant meta volante awards live/incrementally** — rejected: awards depend on the *complete*
  round (ties, splits); partial grants would need reverting. A provisional view costs nothing.

## Consequences

- Admin matchday workflow from the phone: «Sync ahora» (provider fetch + rescore) or manual
  «Guardar resultado» as *Finalizado* (immediate rescore) — both one tap, both idempotent.
- `/standings` → Meta volante shows the current-round leader from the first finished match.
- The full recalc is no longer needed for routine result corrections — only for joker/bonus/meta
  volante changes.

## Changes landed

- **Code:** `app/admin/matches/actions.ts` (`syncNow` body fix; `saveResult` rescore +
  standings refresh + revalidates), `app/standings/page.tsx` (`buildLiveRound`),
  `components/MetaVolanteBoard.tsx` (`live` prop, provisional section).
- **DB:** none (additive-only rule respected; no schema change).
- **Docs:** this ADR; `docs/decisions/README.md` index row.
