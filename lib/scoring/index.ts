// ============================================================================
// Scoring engine for the Mundial 2026 Pool.
//
// PURE module: no IO, no DB, no fetch, no Date.now(). Every point value is read
// from the `ScoringConfig` (a slice of `AppSettings`) passed in by the caller.
// HARD RULE: never hardcode point values here — the admin edits them in
// `app_settings` and a manual recalc re-runs these functions.
// ============================================================================

import type {
  MatchStatus,
  ScoringConfig,
  BonusQuestion,
  BonusType,
} from "@/lib/types";

/** Match outcome from the perspective of the 1/X/2 sign. */
export type OutcomeSign = "home" | "draw" | "away";

/**
 * Compute the 1/X/2 sign of a scoreline.
 * @returns `"home"` (1) if home wins, `"away"` (2) if away wins, `"draw"` (X) otherwise.
 */
export function outcomeSign(home: number, away: number): OutcomeSign {
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

/** Goal difference (home minus away). Sign-carrying. */
export function goalDiff(home: number, away: number): number {
  return home - away;
}

/** True when both scorelines match exactly. */
export function isExact(
  homePred: number,
  awayPred: number,
  homeScore: number,
  awayScore: number,
): boolean {
  return homePred === homeScore && awayPred === awayScore;
}

/** Minimal shape of a prediction the engine needs to score. */
export interface ScorablePrediction {
  home_pred: number;
  away_pred: number;
  is_joker: boolean;
}

/** Minimal shape of a match result the engine needs to score against. */
export interface ScorableMatch {
  home_score: number | null;
  away_score: number | null;
  status: MatchStatus;
}

/**
 * Score a single match prediction against a result.
 *
 * Returns `null` when the match is not finished or has no recorded score
 * (i.e. nothing to award yet — distinct from a scored 0). Otherwise:
 *  - exact scoreline (if `exact_enabled`)            → `settings.exact`
 *  - else correct sign (if `sign_enabled`)           → `settings.sign`
 *      + `settings.diff_bonus` when `diff_bonus_enabled` and the goal
 *        difference also matches
 *  - else                                            → 0
 * The final total is multiplied by `settings.joker_multiplier` when the
 * prediction is a joker.
 *
 * Each rule is independently gated by its `*_enabled` flag, so a disabled
 * exact rule falls through to the sign rule, and a disabled sign rule yields 0
 * even on a correct sign.
 */
export function scorePrediction(
  prediction: ScorablePrediction,
  match: ScorableMatch,
  settings: ScoringConfig,
): number | null {
  if (
    match.status !== "finished" ||
    match.home_score === null ||
    match.away_score === null
  ) {
    return null;
  }

  const { home_score, away_score } = match;
  const { home_pred, away_pred } = prediction;

  let points = 0;

  if (
    settings.exact_enabled &&
    isExact(home_pred, away_pred, home_score, away_score)
  ) {
    points = settings.exact;
  } else if (
    settings.sign_enabled &&
    outcomeSign(home_pred, away_pred) === outcomeSign(home_score, away_score)
  ) {
    points = settings.sign;
    if (
      settings.diff_bonus_enabled &&
      goalDiff(home_pred, away_pred) === goalDiff(home_score, away_score)
    ) {
      points += settings.diff_bonus;
    }
  }

  if (prediction.is_joker) {
    points *= settings.joker_multiplier;
  }

  return points;
}

/** Minimal shape of an answer the bonus scorer needs. */
export type BonusAnswerValue = string | string[] | number;

/**
 * Score a bonus-question answer against its correct answer.
 *
 * Returns `null` when `question.correct_answer` is null (not yet graded).
 * Otherwise awards `question.points` on a correct answer, else 0.
 *
 * Per `BonusType`:
 *  - `"single"`  : string equality.
 *  - `"numeric"` : numeric equality (coerces string/number).
 *  - `"multi"`   : ALL-OR-NOTHING set equality — full points only when the
 *    answer set equals the correct set exactly (order-independent, duplicates
 *    ignored). No partial credit is awarded. This keeps scoring simple and
 *    unambiguous; a partial-credit scheme can be layered on later if desired.
 *
 * A malformed answer (wrong runtime shape for the question type) scores 0
 * rather than throwing.
 */
export function scoreBonusAnswer(
  answer: BonusAnswerValue,
  question: BonusQuestion,
): number | null {
  if (question.correct_answer === null) return null;

  const correct = matchesBonus(answer, question.correct_answer, question.type);
  return correct ? question.points : 0;
}

function matchesBonus(
  answer: BonusAnswerValue,
  correct: string | string[] | number,
  type: BonusType,
): boolean {
  switch (type) {
    case "numeric": {
      const a = Number(answer);
      const c = Number(correct);
      return !Number.isNaN(a) && !Number.isNaN(c) && a === c;
    }
    case "single": {
      if (typeof answer !== "string" || typeof correct !== "string") {
        return false;
      }
      return answer === correct;
    }
    case "multi": {
      if (!Array.isArray(answer) || !Array.isArray(correct)) return false;
      const a = new Set(answer);
      const c = new Set(correct);
      if (a.size !== c.size) return false;
      for (const v of Array.from(c)) if (!a.has(v)) return false;
      return true;
    }
    default:
      return false;
  }
}

/** A prediction row carrying its id, used by the recalc helper. */
export interface IdentifiablePrediction extends ScorablePrediction {
  id: string;
  match_id: string;
}

/** Result of recomputing one prediction's awarded points. */
export interface RecomputedPoints {
  id: string;
  points_awarded: number | null;
}

/**
 * Pure helper backing the admin "Recalculate" action.
 *
 * Maps each prediction to `{ id, points_awarded }` by looking up its match in
 * `matchesById` and calling `scorePrediction`. A prediction whose match is
 * missing or unscored yields `points_awarded: null` (nothing awarded yet).
 *
 * Deterministic and idempotent: the output depends only on the inputs, so
 * re-running it over already-scored predictions produces identical results.
 */
export function recomputePredictionPoints(
  predictions: readonly IdentifiablePrediction[],
  matchesById: ReadonlyMap<string, ScorableMatch> | Record<string, ScorableMatch>,
  settings: ScoringConfig,
): RecomputedPoints[] {
  const lookup = (id: string): ScorableMatch | undefined => {
    if (matchesById instanceof Map) return matchesById.get(id);
    return (matchesById as Record<string, ScorableMatch>)[id];
  };

  return predictions.map((p) => {
    const match = lookup(p.match_id);
    return {
      id: p.id,
      points_awarded: match ? scorePrediction(p, match, settings) : null,
    };
  });
}
