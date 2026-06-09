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
  Stage,
  RoundKey,
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

/**
 * Minimal shape of a prediction the engine needs to score.
 *
 * NOTE: jokers are now a property of the MATCH (`ScorableMatch.is_joker`), not
 * the prediction. `is_joker` is kept here as an OPTIONAL field for DB
 * back-compat only — the engine never reads it. The multiplier is driven by
 * `match.is_joker`.
 */
export interface ScorablePrediction {
  home_pred: number;
  away_pred: number;
  is_joker?: boolean; // DEPRECATED / ignored by the engine — see ScorableMatch.is_joker
}

/** Minimal shape of a match result the engine needs to score against. */
export interface ScorableMatch {
  home_score: number | null;
  away_score: number | null;
  status: MatchStatus;
  is_joker: boolean; // admin-designated joker match → ×joker_multiplier for ALL users
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
 * The final total is multiplied by `settings.joker_multiplier` when the MATCH
 * is a joker (`match.is_joker`) — the joker is admin-designated per match and
 * applies to every user's prediction on that match.
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

  if (match.is_joker) {
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
 *  - `"text"`    : case-insensitive, trimmed string equality. Both the answer
 *    and the correct answer are coerced to string, then `.trim().toLowerCase()`
 *    before comparison.
 *  - `"multi"`   : ALL-OR-NOTHING set equality — full points only when the
 *    answer set equals the correct set exactly (order-independent, duplicates
 *    ignored). No partial credit is awarded. This keeps scoring simple and
 *    unambiguous; a partial-credit scheme can be layered on later if desired.
 *
 * DECISION — multi-type partial credit: the `"multi"` type is intentionally
 * all-or-nothing. A correct answer set must equal the expected set exactly;
 * any missing or extra option yields 0. We chose this over fractional credit
 * to keep the leaderboard math integer-only, deterministic, and easy to
 * explain to players, and to avoid ambiguity about how to weight partials.
 *
 * A malformed answer (wrong runtime shape for the question type, including
 * null/undefined for text) scores 0 rather than throwing.
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
    case "text": {
      if (answer === null || answer === undefined) return false;
      if (correct === null || correct === undefined) return false;
      if (Array.isArray(answer) || Array.isArray(correct)) return false;
      const a = String(answer).trim().toLowerCase();
      const c = String(correct).trim().toLowerCase();
      return a === c;
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

// ============================================================================
// Meta-volante (round-champion) scoring
// ============================================================================

/**
 * Map a match to its meta-volante round key.
 *
 *  - `"group"`        → `"group-md${matchday}"` (matchday must be 1, 2 or 3).
 *  - `"round_of_32"`  → `"round_of_32"`
 *  - `"round_of_16"`  → `"round_of_16"`
 *  - `"quarter"`      → `"quarter"`
 *  - `"semi"`         → `"semi"`
 *  - `"final"`        → `"final"`
 *  - `"third_place"`  → `"final"` (third-place folds into the final round).
 *
 * Group matches always carry a matchday (1..3) after the schema migration, so a
 * null/invalid matchday for a group match is a data error: we THROW rather than
 * silently bucketing into a wrong round, which would corrupt round standings.
 */
export function roundKeyForMatch(match: {
  stage: Stage;
  matchday: number | null;
}): RoundKey {
  switch (match.stage) {
    case "group": {
      const md = match.matchday;
      if (md !== 1 && md !== 2 && md !== 3) {
        throw new Error(
          `roundKeyForMatch: group match requires matchday 1|2|3, got ${String(md)}`,
        );
      }
      return `group-md${md}`;
    }
    case "round_of_32":
      return "round_of_32";
    case "round_of_16":
      return "round_of_16";
    case "quarter":
      return "quarter";
    case "semi":
      return "semi";
    case "third_place":
      return "final";
    case "final":
      return "final";
    default: {
      // Exhaustiveness guard — unreachable for valid Stage values.
      const _exhaustive: never = match.stage;
      throw new Error(`roundKeyForMatch: unknown stage ${String(_exhaustive)}`);
    }
  }
}

/** One player's tallied prediction performance within a single round. */
export interface RoundEntry {
  user_id: string;
  round_points: number;
  exact_hits: number;
}

/** A meta-volante award row produced for a round. */
export interface RoundWinner {
  user_id: string;
  points: number;
  round_points: number;
}

/**
 * Pick the round champion(s) (meta volante) for a single round.
 *
 * Selection:
 *  1. Find the max `round_points`. Candidates = all entries with that max.
 *  2. If the max is <= 0 (nobody scored positively in the round), there is no
 *     champion → return [].
 *  3. Single candidate → it wins `awardPoints`.
 *  4. Tie on `round_points` → break by max `exact_hits` among the candidates.
 *     A single entry with the most exact hits wins `awardPoints`.
 *  5. STILL tied (same round_points AND same exact_hits, n entries) → SPLIT:
 *     each tied winner gets `Math.floor(awardPoints / n)`. Integer points only;
 *     any remainder is dropped (documented behavior — keeps standings integer
 *     and avoids fractional awards / rounding disputes).
 *
 * Pure & deterministic: output depends only on the inputs. Winner order follows
 * the input order of the tied entries.
 */
export function pickRoundWinners(
  entries: readonly RoundEntry[],
  awardPoints: number,
): RoundWinner[] {
  if (entries.length === 0) return [];

  let maxPoints = -Infinity;
  for (const e of entries) {
    if (e.round_points > maxPoints) maxPoints = e.round_points;
  }

  // A round with no positive score has no champion.
  if (maxPoints <= 0) return [];

  const topByPoints = entries.filter((e) => e.round_points === maxPoints);

  if (topByPoints.length === 1) {
    const w = topByPoints[0];
    return [
      { user_id: w.user_id, points: awardPoints, round_points: w.round_points },
    ];
  }

  // Tie on round_points → break by exact_hits.
  let maxExact = -Infinity;
  for (const e of topByPoints) {
    if (e.exact_hits > maxExact) maxExact = e.exact_hits;
  }
  const winners = topByPoints.filter((e) => e.exact_hits === maxExact);

  if (winners.length === 1) {
    const w = winners[0];
    return [
      { user_id: w.user_id, points: awardPoints, round_points: w.round_points },
    ];
  }

  // Full tie → split, integer floor, remainder dropped.
  const share = Math.floor(awardPoints / winners.length);
  return winners.map((w) => ({
    user_id: w.user_id,
    points: share,
    round_points: w.round_points,
  }));
}
