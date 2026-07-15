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
 * Returns `null` when nothing can be awarded yet (not graded), otherwise
 * `question.points` on a correct answer, else 0.
 *
 * Per `BonusType`:
 *  - `"single"`  : string equality. Null `correct_answer` → null.
 *  - `"numeric"` : numeric equality (coerces string/number). Null
 *    `correct_answer` → null.
 *  - `"multi"`   : ALL-OR-NOTHING set equality — full points only when the
 *    answer set equals the correct set exactly (order-independent, duplicates
 *    ignored). No partial credit is awarded. Null `correct_answer` → null.
 *  - `"text"`    : MANUALLY graded. `correct_answer` is IGNORED entirely.
 *    Grading is driven solely by the optional `manualCorrect` argument
 *    (sourced from `BonusAnswer.manual_correct`):
 *      - `null`/`undefined` → `null` (not yet graded — even if `correct_answer`
 *        happens to be set; manual grading doesn't require closing the question).
 *      - `true`             → `question.points`.
 *      - `false`            → 0.
 *
 * DECISION — text questions are manually graded (no string matching):
 * free-text answers are too varied for reliable automatic comparison (synonyms,
 * spelling, partial names, phrasing). With a small player pool (~15–20), the
 * admin simply validates each free-text answer by hand from the admin panel and
 * stores the verdict in `bonus_answers.manual_correct`. The engine stays pure
 * and deterministic by reading that stored verdict rather than guessing.
 *
 * DECISION — multi-type partial credit: the `"multi"` type is intentionally
 * all-or-nothing. A correct answer set must equal the expected set exactly;
 * any missing or extra option yields 0. We chose this over fractional credit
 * to keep the leaderboard math integer-only, deterministic, and easy to
 * explain to players, and to avoid ambiguity about how to weight partials.
 *
 * `manualCorrect` is IGNORED for all non-text types (they grade automatically).
 *
 * A malformed answer (wrong runtime shape for a non-text question type) scores
 * 0 rather than throwing.
 */
export function scoreBonusAnswer(
  answer: BonusAnswerValue,
  question: BonusQuestion,
  manualCorrect?: boolean | null,
): number | null {
  if (question.type === "text") {
    if (manualCorrect === null || manualCorrect === undefined) return null;
    return manualCorrect ? question.points : 0;
  }

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
 * Pick the meta-volante awardees for a single round given a prize
 * DISTRIBUTION per position (e.g. `[100, 50, 50, 20, 20, 20, 20]` →
 * 1º=100, 2º=3º=50, 4º–7º=20; positions beyond the array earn nothing).
 *
 * Selection:
 *  1. Only entries with `round_points > 0` compete — a player who scored
 *     nothing in the round never occupies a paying position (so a round where
 *     nobody scored positively awards nothing, as before).
 *  2. Rank by `round_points` desc, ties broken by `exact_hits` desc.
 *  3. Entries STILL tied (same round_points AND same exact_hits, n entries)
 *     occupy n consecutive positions and SPLIT the sum of those positions'
 *     prizes: each gets `Math.floor(sum / n)`. Integer points only; any
 *     remainder is dropped (documented behavior — keeps standings integer and
 *     avoids fractional awards / rounding disputes).
 *  4. A tie group whose positions fall entirely beyond the distribution earns
 *     nothing and produces no rows.
 *
 * Pure & deterministic: output depends only on the inputs. Order follows the
 * ranking; within a full tie it follows the input order of the tied entries.
 */
export function pickRoundAwards(
  entries: readonly RoundEntry[],
  distribution: readonly number[],
): RoundWinner[] {
  // Stable sort: round_points desc, then exact_hits desc; full ties keep input order.
  const ranked = entries
    .filter((e) => e.round_points > 0)
    .sort((a, b) => b.round_points - a.round_points || b.exact_hits - a.exact_hits);

  const awards: RoundWinner[] = [];
  let position = 0;
  while (position < ranked.length && position < distribution.length) {
    // Collect the full-tie group occupying positions [position, position + n).
    const head = ranked[position];
    let n = 1;
    while (
      position + n < ranked.length &&
      ranked[position + n].round_points === head.round_points &&
      ranked[position + n].exact_hits === head.exact_hits
    ) {
      n += 1;
    }

    let prizeSum = 0;
    for (const p of distribution.slice(position, position + n)) prizeSum += p;
    const share = Math.floor(prizeSum / n);

    for (let i = 0; i < n; i++) {
      const w = ranked[position + i];
      awards.push({
        user_id: w.user_id,
        points: share,
        round_points: w.round_points,
      });
    }
    position += n;
  }

  return awards;
}

/**
 * Single-prize meta volante (the pre-distribution rule): only the round
 * champion(s) earn `awardPoints`. Equivalent to `pickRoundAwards` with a
 * one-position distribution — kept for back-compat and as the simplest case.
 */
export function pickRoundWinners(
  entries: readonly RoundEntry[],
  awardPoints: number,
): RoundWinner[] {
  return pickRoundAwards(entries, [awardPoints]);
}

/**
 * Resolve the prize distribution that applies to a SPECIFIC round.
 *
 * The pool eased into the prize ladder (ADR-0018): the very first sprint
 * (`group-md1`) pays ONLY its winner (`distribution[0]` — the 1º prize), while
 * every later round pays the full ladder. The ladder ENDS at the quarters
 * (ADR-0025): `semi` and `final` pay nothing — an empty distribution, which
 * also makes `recomputeRoundAwards` remove any previously-granted awards for
 * those rounds. Centralising the rule here keeps the automatic round-close
 * settlement (`recomputeRoundAwards`) and the manual recalc perfectly
 * consistent — both ask this function which ladder to use.
 *
 * Pure: derives the per-round ladder from the base distribution; no point
 * values originate here.
 */
export function distributionForRound(
  roundKey: RoundKey,
  distribution: readonly number[],
): readonly number[] {
  // group-md1 = winner-takes-all: just the first (1º) prize.
  if (roundKey === "group-md1") return distribution.slice(0, 1);
  // semis & final: no meta volante (ADR-0025).
  if (roundKey === "semi" || roundKey === "final") return [];
  return distribution;
}

/**
 * Human-readable summary of a meta-volante prize distribution, grouping
 * consecutive positions with the same prize:
 * `[100, 50, 50, 20, 20, 20, 20]` → `"1º +100 · 2º–3º +50 · 4º–7º +20"`.
 * Pure formatting — no point values originate here.
 */
export function formatDistribution(distribution: readonly number[]): string {
  const parts: string[] = [];
  let start = 0;
  while (start < distribution.length) {
    let end = start;
    while (
      end + 1 < distribution.length &&
      distribution[end + 1] === distribution[start]
    ) {
      end += 1;
    }
    const label =
      start === end ? `${start + 1}º` : `${start + 1}º–${end + 1}º`;
    parts.push(`${label} +${distribution[start]}`);
    start = end + 1;
  }
  return parts.join(" · ");
}
