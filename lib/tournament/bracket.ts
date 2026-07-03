// ============================================================================
// Knockout bracket propagation — PURE (no I/O). Determines the winner/loser of
// a finished knockout match so admin-configured source links
// (matches.home_source / away_source + *_source_kind) can auto-fill the next
// round's slots. Draws are only decided when `penalty_winner` names one of the
// two teams; anything else is undeterminable and propagation skips the match.
// ============================================================================

import type { Match, SlotSourceKind } from "@/lib/types";

/**
 * The slice of a match the bracket logic needs. `home_team`/`away_team` are
 * declared `string` in the Match contract, but DB rows for knockout
 * placeholders can be null — accept null defensively.
 */
export type BracketSource = Pick<
  Match,
  "status" | "home_score" | "away_score" | "penalty_winner"
> & {
  home_team: string | null;
  away_team: string | null;
};

/**
 * Winner and loser (Team.id) of a FINISHED knockout match; both null when
 * undeterminable: not finished, missing scores, placeholder teams, or a draw
 * whose `penalty_winner` is unset / matches neither team.
 */
export function matchOutcome(match: BracketSource): {
  winner: string | null;
  loser: string | null;
} {
  const none = { winner: null, loser: null };
  if (match.status !== "finished") return none;
  if (match.home_score === null || match.away_score === null) return none;
  if (!match.home_team || !match.away_team) return none;

  if (match.home_score > match.away_score) {
    return { winner: match.home_team, loser: match.away_team };
  }
  if (match.away_score > match.home_score) {
    return { winner: match.away_team, loser: match.home_team };
  }

  // Level after full time — only a recorded shootout winner decides it.
  if (match.penalty_winner === match.home_team) {
    return { winner: match.home_team, loser: match.away_team };
  }
  if (match.penalty_winner === match.away_team) {
    return { winner: match.away_team, loser: match.home_team };
  }
  return none;
}

/**
 * The Team.id a bracket slot should receive from its source match: the
 * winner or (for the third-place match) the loser. Null when the source
 * match's outcome is undeterminable — the slot stays as-is.
 */
export function resolveSlot(
  source: BracketSource,
  kind: SlotSourceKind,
): string | null {
  const outcome = matchOutcome(source);
  return kind === "winner" ? outcome.winner : outcome.loser;
}
