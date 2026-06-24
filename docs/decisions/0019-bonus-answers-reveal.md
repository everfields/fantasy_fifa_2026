# ADR-0019: Reveal other players' bonus answers after lock

- **Date:** 2026-06-24
- **Status:** Accepted
- **Supersedes:** —

## Context

`/match/[id]` already reveals every player's prediction once a match locks, mirroring the
`predictions` RLS model (own picks always; others' only after `now() >= locks_at`). The exact same
RLS model already existed for `bonus_answers` (vs `bonus_questions.locks_at`, see
`db/migrations/0002_rls.sql`) — others' bonus answers are SELECTable post-lock — but no player-facing
UI surfaced them. Players wanted to see how the group answered the bonus questions, the same way they
can compare scoreline predictions.

## Decision

Surface other players' bonus answers in **two** complementary views, both strictly post-lock (the
no-spoilers rule from the tracker applies: a pending pick is never revealed):

1. **Per-question reveal** in `/bonus`: under each LOCKED question card, a collapsible
   "Respuestas del grupo (N)" panel lists every player's answer (avatar + name + value), sorted by
   display name, current user flagged "(tú)".
2. **Per-player view** at `/bonus/[playerId]`: all of one player's answers to already-locked
   questions, grouped by the three bonus categories. A "Respuestas por jugador" picker on `/bonus`
   links to each player who has at least one revealable answer.

No schema or RLS change — the feature relies entirely on the pre-existing `bonus_answers_select`
policy. The page fetches all readable answers (`select *` with no `user_id` filter); RLS returns the
current user's own answers plus everyone's answers to locked questions. The per-player route
additionally filters to locked questions client-side as defense in depth.

## Alternatives considered

- **Per-question reveal only** — consistent with `/match/[id]`, but no single-player overview.
- **Per-player view only** — good for browsing one rival, but loses the at-a-glance group comparison
  next to each question. Chosen: **both** (user request).
- **New RLS/columns** — unnecessary; the lock-gated SELECT policy already does exactly this.

## Consequences

- New operative rule: bonus answers are visible to the whole group once each question locks, via
  `/bonus` (per-question) and `/bonus/[playerId]` (per-player). Pre-lock, only the owner sees a pick.
- Emails are never exposed — only `display_name`/`avatar` from `profiles` (readable by all
  authenticated members via `profiles_select using(true)`).
- No recalc, migration, or backup needed (read-only feature).

## Changes landed

- **Contract:** none.
- **DB:** none (relies on existing `bonus_answers_select` RLS).
- **Code:** `app/bonus/blocks.ts` (shared `BLOCKS`/`TYPE_LABEL`/`formatBonusAnswer`),
  `app/bonus/answers-reveal.tsx` (collapsible group panel), `app/bonus/page.tsx` (fetch all readable
  answers + profiles, per-question reveal, player picker), `app/bonus/[playerId]/page.tsx`
  (per-player view).
- **Docs:** `CLAUDE.md` bonus line updated; this ADR added; index row in `docs/decisions/README.md`.
