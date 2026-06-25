# ADR-0020: Bonus scores never persisted — `security definer` broke the protect trigger's exemption

- **Date:** 2026-06-25
- **Status:** Accepted
- **Supersedes:** — (fixes a defect introduced in ADR-0007 / migration `0006_admin_tools.sql`)

## Context

Group-winner ("¿Campeón del Grupo X?") bonus points were never reaching the leaderboard.
Groups A and B had finished, their questions were closed with the correct champion
(`correct_answer` = `Mexico` / `Switzerland`), and the players' answers matched — yet every
`bonus_answers.points_awarded` stayed `null`, so `refresh_standings()` (which sums
`points_awarded`) added 0 bonus points.

The investigation found two problems, one cosmetic and one fundamental:

1. **Footgun (minor):** `closeBonus` only wrote `correct_answer` and told the admin to "run
   Recalcular" — it did not grade the question's answers or refresh standings (unlike
   `gradeTextAnswer`, which grades + refreshes in place).

2. **Defect (root cause):** `bonus_answers_protect_admin_cols()` (migration `0006`) is a
   BEFORE UPDATE trigger that pins `manual_correct` / `points_awarded` back to their OLD values
   for any caller that is not the service role or an admin, so ordinary players can't self-grade.
   Its exemption is `current_user = 'service_role' or is_admin()`. **But the function was declared
   `security definer`**, and inside a SECURITY DEFINER routine `current_user` is the function
   OWNER (the migration role, e.g. `postgres`) — never the session's `service_role`. For a keyed
   service call `is_admin()` is also false (`auth.uid()` is null). So both exemption branches fail
   and the else-branch runs **for the scoring engine itself**: every `recalc` / `closeBonus` /
   `gradeTextAnswer` write to `points_awarded` was silently reverted to its prior value.

   Confirmed empirically: a `service_role` REST `PATCH` of another user's answer row bumped
   `updated_at` (so it passed RLS — i.e. it *was* service_role) yet `points_awarded` came back
   unchanged — only possible if the trigger's `current_user` check failed.

## Decision

Recreate `bonus_answers_protect_admin_cols()` as **`security invoker`** (migration `0012`). Under
SECURITY INVOKER, `current_user` reflects PostgREST's per-request `SET ROLE`, so it correctly
equals `service_role` for service calls and `authenticated` for players. `is_admin()` stays
`security definer` and keeps working. The guard only reads OLD/NEW + `is_admin()`, so it needs no
elevated privilege — INVOKER is safe. This matches the function's original stated intent ("run as
a privileged role, not 'authenticated'").

Additionally, `closeBonus` now grades the closed question's answers in place with the pure
`scoreBonusAnswer` engine and calls `refresh_standings()` immediately — mirroring
`gradeTextAnswer`, so closing a group-winner/option question awards points without a separate
manual recalc.

## Alternatives considered

- **Change the check to `session_user`** — rejected: under PostgREST, `session_user` is the
  `authenticator` connection role for *every* request (it doesn't follow `SET ROLE`), so it can't
  distinguish service_role from a player. `current_user` under INVOKER is the correct signal.
- **Drop the trigger, use column REVOKE** — rejected: the original ADR-0007 note explains
  Supabase's blanket UPDATE grant to `authenticated` makes column-level REVOKE brittle.
- **Leave grading to the manual recalc only** — rejected: it would still be blocked by the same
  trigger defect, and the recalc-after-close step is an easily-forgotten footgun.

## Consequences

- The scoring engine (recalc, closeBonus, gradeTextAnswer) can again persist
  `bonus_answers.points_awarded`. Bonus points now flow into `refresh_standings()`.
- Closing a single/multi/numeric bonus question now awards points + refreshes standings in one
  step; the separate manual recalc is no longer required for bonus grading.
- **Pending:** migration `0012` must be applied to prod (`psql -v ON_ERROR_STOP=1 -f
  db/migrations/0012_fix_bonus_protect_trigger.sql`). Until then, no bonus score can be written.
- **Backfill:** after applying `0012`, re-close groups A & B (or run the full recalc) to award the
  already-earned group-winner points. The pre-fix state of those answer rows was snapshotted to
  `db/backups/bonus_answers_AB_before.json`.

## Changes landed

- **DB:** `db/migrations/0012_fix_bonus_protect_trigger.sql` — recreate
  `bonus_answers_protect_admin_cols()` as `security invoker`.
- **Code:** `app/admin/bonus/actions.ts` — `closeBonus` grades the question's answers in place and
  refreshes standings.
- **Docs:** this ADR; `CLAUDE.md` bonus line note.
