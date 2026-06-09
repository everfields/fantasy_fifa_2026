# ADR-0006: Bonus questions grouped in 3 visual blocks (categories)

- **Date:** 2026-06-10
- **Status:** Accepted
- **Supersedes:** —

## Context

The bonus page (player and admin) rendered one flat list. The group wants three clearly separated
blocks: the auto-generated group-champion questions, a "first scorer" question per Spain match, and
general tournament questions (pichichi, Curaçao goals conceded).

## Decision

- New column `bonus_questions.category text not null default 'tournament'`
  (`group_winner | spain_scorer | tournament`), mirrored as `BonusCategory` in `lib/types.ts`.
  A real column, not text heuristics — the admin picks the block in the question form ("Bloque").
- `/bonus` and `/admin/bonus` render three sections in fixed order, sorted by `locks_at` inside
  each: **Campeón de grupo** → **Primer goleador — partidos de España** → **Preguntas del torneo**.
  Empty blocks are hidden.
- `generateGroupWinnerQuestions` tags its rows `group_winner`; migration backfills existing ones by
  the `¿Campeón del Grupo` text marker.
- Migration **0007 seeds the requested questions idempotently** (by exact text, reading real dates
  from `matches`): one free-text "Primer goleador de España vs {rival}" per ESP group match
  (locks at that match's kickoff), plus two tournament questions locking at the tournament's first
  kickoff: "Pichichi del Mundial (máximo goleador)" (text) and "¿Cuántos goles encajará Curazao en
  el Mundial?" (`single`: "10 o más goles" / "Menos de 10 goles"). All at `bonus_default_points`.
  If run before the seed, it inserts nothing — re-run after seeding.

## Alternatives considered

- **Derive blocks from text patterns in the UI** — rejected: brittle, and the admin couldn't move a
  question between blocks.
- **Create the seeded questions by hand in the admin** — rejected for the Spain/tournament set the
  group already agreed on: the migration pins correct lock times from the calendar and is
  idempotent across environments.

## Consequences

- Operative rule: new bonus questions carry a `category`; default is `tournament`.
- Migration `0007_bonus_categories.sql` must be applied **after** the seed (and after 0006).
- Spain-scorer and pichichi questions are `text` type → graded manually per answer (ADR-0004).

## Changes landed

- **Contract:** `lib/types.ts` — `BonusCategory`, `BonusQuestion.category`.
- **DB:** `db/migrations/0007_bonus_categories.sql`; `db/README.md`.
- **Admin:** `components/admin/BonusManager.tsx` (3 sections + "Bloque" select),
  `app/admin/bonus/actions.ts` (category in upsert + generator).
- **Player:** `app/bonus/page.tsx` (3 sections).
- **Docs:** CLAUDE.md bonus line updated; this ADR added.
