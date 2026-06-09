# ADR-0004: Admin tools — delete bonus questions, arbitrary point adjustments, manual text grading

- **Date:** 2026-06-10
- **Status:** Accepted
- **Supersedes:** — (amends the free-text grading rule of ADR-0001)

## Context

Three operational gaps surfaced while running the pool from the admin panel:

1. A bonus question created by mistake could not be deleted from `/admin/bonus` — only edited or
   closed. The workaround was deleting rows in Supabase by hand (no audit, no standings refresh).
2. There was no way to grant or remove points arbitrarily for a player when an unforeseen event
   happens (side bets, penalties, compensations). Hand-editing `points_awarded` would be silently
   overwritten by the next recalc.
3. ADR-0001 graded `text` bonus questions by case-insensitive string comparison against a single
   `correct_answer`. In practice free-text answers are far too varied ("Mbappé", "Kylian Mbappe",
   "el de Francia") for any string match; with only ~15–20 players, per-answer human validation is
   cheap and exact.

While implementing this we also found that **recalc never graded bonus answers at all**:
`closeBonus` saved `correct_answer` and told the admin to run «Recalcular», but neither the recalc
server action nor `/api/admin/recalc` ever wrote `bonus_answers.points_awarded`. Bonus points were
summed by `refresh_standings()` but never produced.

## Decision

1. **Delete from the admin, not from Supabase.** `deleteBonus` server action: admin-guarded,
   audit-logged (`delete_bonus_question`, including the answer count), FK cascade removes the
   players' answers, then `refresh_standings()` so already-awarded points vanish from the
   leaderboard. UI: destructive «Eliminar» button + confirmation dialog on each question card.
2. **`point_adjustments` table** (`user_id`, `points` int — negatives allowed, `reason` not null,
   `created_by`, `created_at`). RLS: readable by all authenticated (transparency), writable only by
   admins. `refresh_standings()` folds the sum into `total_points` and the new
   `standings_cache.adjustment_points`. Tie-breakers unchanged. UI in `/admin/users`: per-user
   panel listing adjustments (with delete) + add form requiring a reason. Audit-logged both ways.
3. **Manual per-answer validation for `text` questions.** New `bonus_answers.manual_correct
   boolean` (null = ungraded). The admin opens a collapsible «Validar respuestas» panel on the
   question card listing every player's answer and marks each Correcta/Incorrecta (re-gradable).
   `gradeTextAnswer` sets `manual_correct` + `points_awarded` and refreshes standings.
   `scoreBonusAnswer(answer, question, manualCorrect?)` now **ignores `correct_answer` for text**
   and returns null/points/0 from the manual verdict. Text questions no longer use the
   close-with-string flow; their badge derives from how many answers remain unvalidated.
   A BEFORE UPDATE trigger pins `manual_correct`/`points_awarded` against non-admin writes.
4. **Recalc now grades bonus answers** (bug fix): the manual recalc diffs every answer via
   `scoreBonusAnswer` (passing `manual_correct` for text), previews `bonusChangedCount`, writes
   only differing rows, and includes bonus counts in the audit entry. Idempotent like predictions.

## Alternatives considered

- **Delete questions directly in Supabase** — rejected: no audit trail, easy to forget the
  standings refresh, and cascades are invisible to the operator.
- **Adjust points by editing `predictions.points_awarded`** — rejected: the next idempotent recalc
  reverts it. Adjustments must live outside the recomputed surfaces.
- **Fuzzy/normalized string matching for text answers** (accents, aliases) — rejected: still
  guesswork; with a small pool, human validation is exact and takes seconds.
- **Auto-grade text on `closeBonus` with the string compare** (status quo of ADR-0001) — superseded
  by manual validation.

## Consequences

- Operative rule: **text bonus questions are graded per-player by the admin**, never by string
  comparison. `bonus_questions.correct_answer` is unused for `text`.
- Operative rule: **never hand-edit awarded points** — use `/admin/users` point adjustments; they
  survive recalcs and appear in `standings_cache.adjustment_points`.
- The manual recalc is now the single grading path for predictions **and** bonus answers.
- Migration `0006_admin_tools.sql` must be applied before deploying this code.
- `RankingTable` does not yet display `adjustment_points` as its own column (it's inside the
  total) — possible follow-up.

## Changes landed

- **Contract:** `lib/types.ts` — `BonusAnswer.manual_correct`, `PointAdjustment`,
  `StandingRow.adjustment_points`.
- **DB:** `db/migrations/0006_admin_tools.sql` — `manual_correct` column + protect trigger,
  `point_adjustments` (+ RLS), `standings_cache.adjustment_points`, extended
  `refresh_standings()`; `db/README.md` updated.
- **Scoring:** `lib/scoring/index.ts` — `scoreBonusAnswer(answer, question, manualCorrect?)`;
  text branch removed from string matching; tests updated (57 pass).
- **Admin:** `app/admin/bonus/{actions.ts,page.tsx}`, `components/admin/BonusManager.tsx`
  (delete + validation panel); `app/admin/users/{actions.ts,page.tsx}`,
  `components/admin/UserManager.tsx` (adjustments); `app/admin/recalc/actions.ts`,
  `components/admin/RecalcPreview.tsx` (bonus grading in recalc).
- **Docs:** `CLAUDE.md` scoring section updated; this ADR added.
