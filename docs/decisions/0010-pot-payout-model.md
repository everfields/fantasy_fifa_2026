# ADR-0010: Pot payout model — winner takes all minus stake-back and domain cost

- **Date:** 2026-06-10
- **Status:** Accepted
- **Supersedes:** —

## Context

The pot UI shipped with a placeholder model: an admin-entered free-form `pot_amount` and a
suggested 60/30/10 split over the top three. The group agreed on the real money rules in the
WhatsApp chat (June 2026), and the admin "recaudado" figure was computed as
`pot_amount / players × paid`, which was wrong whenever `pot_amount` wasn't set or the player
count changed.

## Decision

- **Entry fee:** 20 € per player (`app_settings.entry_fee`, admin-editable in `/admin/pot`).
- **Runner-up (2º):** gets exactly their stake back (`entry_fee`).
- **Expenses:** 15 € (`app_settings.pot_expenses`) deducted from the pot to reimburse the
  organizer (el_que_nunca_hace_nada) for the resiporra.es domain cost.
- **Winner (1º):** takes everything else — `entry_fee × paid − entry_fee − pot_expenses`.
- **`pot_amount` is now derived, not hand-entered:** kept in sync as `entry_fee × paid players`
  by the `setPaid` and `setPotConfig` server actions. The admin Resumen reads it as before.
- **User-facing:** players see ONLY the two prizes (winner + runner-up) in a card on
  `/standings` (hidden until the winner prize is > 0). Collected total, paid list, and the
  expenses line are admin-only.

## Alternatives considered

- **Keep manual `pot_amount`** — rejected: two sources of truth; the recaudado figure drifts
  from reality as payments are marked.
- **60/30/10 split** — rejected by the group; the agreed deal is stake-back for 2nd, rest to 1st.
- **Storing money config in a new table** — overkill; the single `app_settings` jsonb row already
  holds the admin-owned blob (incl. `paid_user_ids`), and the change is additive (no migration).

## Consequences

- Marking/unmarking payments instantly updates the recaudado figure, the admin Resumen pot stat,
  and the prizes shown to players (`revalidatePath("/standings")`).
- The pure payout math lives in `lib/pot.ts` (`potBreakdown`), shared by admin and player pages —
  prizes clamp at 0 so a half-collected pot never shows negative numbers.
- `setPotAmount` action replaced by `setPotConfig` (entry fee + expenses); audited as
  `set_pot_config`.

## Changes landed

- **Contract:** `lib/types.ts` — `AppSettings.entry_fee` (20) and `AppSettings.pot_expenses` (15);
  `pot_amount` documented as derived. New `lib/pot.ts` (`potBreakdown`, `formatEur`).
- **DB:** none — additive keys in the existing `app_settings.settings` jsonb blob.
- **Code:** `app/admin/pot/{page,actions}.tsx`, `components/admin/PotManager.tsx` (config card +
  new reparto card), `app/admin/_lib.ts` + `app/_lib/data.ts` (settings shaping,
  `getPotPrizes()`), `app/standings/page.tsx` (two prize cards).
- **Docs:** this ADR; CLAUDE.md "Pot" line added.
