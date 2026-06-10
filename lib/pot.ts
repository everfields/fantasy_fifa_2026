// ============================================================================
// Pot / payout model (pure, shared by admin and player-facing pages).
//
// Rules (June 2026, agreed in the group chat):
//   - Every player pays `entry_fee` (default 20 €) into the pot.
//   - The runner-up gets their stake back (exactly `entry_fee`).
//   - `pot_expenses` (default 20 €, domain + infra costs) is reimbursed to the
//     organizer (el_que_nunca_hace_nada) out of the pot.
//   - The winner takes everything that remains.
// Players only ever see the two prizes; collected/expenses detail is admin-only.
// ============================================================================

export interface PotBreakdown {
  collected: number; // entry_fee × paid players
  winnerPrize: number; // collected − runner-up − expenses (never negative)
  runnerUpPrize: number; // the stake back
  expenses: number; // domain + infra reimbursement to the organizer
}

export function potBreakdown(params: {
  entryFee: number;
  expenses: number;
  paidCount: number;
}): PotBreakdown {
  const collected = params.entryFee * params.paidCount;
  const runnerUpPrize = Math.min(params.entryFee, collected);
  const expenses = Math.min(params.expenses, collected - runnerUpPrize);
  const winnerPrize = Math.max(0, collected - runnerUpPrize - expenses);
  return { collected, winnerPrize, runnerUpPrize, expenses };
}

export const formatEur = (n: number) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
