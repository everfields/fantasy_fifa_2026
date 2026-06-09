// Tests for the pure scoring engine. Run with: node --test (after TS build)
// or a TS-aware loader (e.g. `node --test --import tsx`).
import { test } from "node:test";
import assert from "node:assert";

import {
  outcomeSign,
  goalDiff,
  isExact,
  scorePrediction,
  scoreBonusAnswer,
  recomputePredictionPoints,
  roundKeyForMatch,
  pickRoundWinners,
  type ScorableMatch,
  type RoundEntry,
} from "./index";
import type { ScoringConfig, BonusQuestion } from "@/lib/types";

const CFG: ScoringConfig = {
  exact: 5,
  sign: 3,
  diff_bonus: 1,
  joker_multiplier: 2,
  exact_enabled: true,
  sign_enabled: true,
  diff_bonus_enabled: true,
};

// Joker is now a property of the MATCH, not the prediction.
const finished = (h: number, a: number, is_joker = false): ScorableMatch => ({
  home_score: h,
  away_score: a,
  status: "finished",
  is_joker,
});

const jokerMatch = (h: number, a: number): ScorableMatch =>
  finished(h, a, true);

const pred = (h: number, a: number) => ({
  home_pred: h,
  away_pred: a,
});

// ---------------------------------------------------------------------------
// pure helpers
// ---------------------------------------------------------------------------
test("outcomeSign", () => {
  assert.equal(outcomeSign(2, 1), "home");
  assert.equal(outcomeSign(1, 2), "away");
  assert.equal(outcomeSign(1, 1), "draw");
});

test("goalDiff is signed", () => {
  assert.equal(goalDiff(3, 1), 2);
  assert.equal(goalDiff(1, 3), -2);
  assert.equal(goalDiff(2, 2), 0);
});

test("isExact", () => {
  assert.equal(isExact(2, 1, 2, 1), true);
  assert.equal(isExact(2, 1, 1, 0), false);
});

// ---------------------------------------------------------------------------
// scorePrediction — core tiers
// ---------------------------------------------------------------------------
test("exact hit awards exact points", () => {
  assert.equal(scorePrediction(pred(2, 1), finished(2, 1), CFG), 5);
});

test("sign-only (wrong score, wrong diff) awards sign points", () => {
  // predicted home win 3-0 (diff 3), actual home win 1-0 (diff 1)
  assert.equal(scorePrediction(pred(3, 0), finished(1, 0), CFG), 3);
});

test("sign + diff bonus when goal difference also matches", () => {
  // predicted 2-1 (diff 1, home), actual 3-2 (diff 1, home) — not exact
  assert.equal(scorePrediction(pred(2, 1), finished(3, 2), CFG), 3 + 1);
});

test("draw sign + diff bonus", () => {
  // predicted 1-1, actual 2-2 — same sign (draw) and same diff (0)
  assert.equal(scorePrediction(pred(1, 1), finished(2, 2), CFG), 4);
});

test("wrong prediction scores 0", () => {
  // predicted home win, actual away win
  assert.equal(scorePrediction(pred(2, 0), finished(0, 2), CFG), 0);
});

// ---------------------------------------------------------------------------
// joker multiplier — driven by MATCH.is_joker, not prediction
// ---------------------------------------------------------------------------
test("joker MATCH multiplies exact", () => {
  assert.equal(scorePrediction(pred(2, 1), jokerMatch(2, 1), CFG), 5 * 2);
});

test("joker MATCH multiplies sign + diff bonus", () => {
  assert.equal(scorePrediction(pred(2, 1), jokerMatch(3, 2), CFG), (3 + 1) * 2);
});

test("non-joker match applies no multiplier", () => {
  assert.equal(scorePrediction(pred(2, 1), finished(2, 1), CFG), 5);
  assert.equal(scorePrediction(pred(3, 0), finished(1, 0), CFG), 3);
});

test("joker MATCH on a wrong prediction is still 0", () => {
  assert.equal(scorePrediction(pred(2, 0), jokerMatch(0, 2), CFG), 0);
});

test("prediction.is_joker is ignored — only the match drives the multiplier", () => {
  // prediction flagged joker, but match is NOT a joker → no multiplier
  const p = { home_pred: 2, away_pred: 1, is_joker: true };
  assert.equal(scorePrediction(p, finished(2, 1), CFG), 5);
});

test("joker MATCH ×3 from config: exact 50→150, sign 20→60", () => {
  const cfg: ScoringConfig = {
    ...CFG,
    exact: 50,
    sign: 20,
    diff_bonus: 0,
    joker_multiplier: 3,
  };
  // exact: 50 × 3 = 150
  assert.equal(scorePrediction(pred(2, 1), jokerMatch(2, 1), cfg), 150);
  // sign only (wrong diff): 20 × 3 = 60
  assert.equal(scorePrediction(pred(3, 0), jokerMatch(1, 0), cfg), 60);
});

// ---------------------------------------------------------------------------
// disabled rules
// ---------------------------------------------------------------------------
test("exact disabled falls through to sign + diff", () => {
  const cfg = { ...CFG, exact_enabled: false };
  // exact 2-1 would be 5, but exact disabled → sign(3) + diff bonus(1)
  assert.equal(scorePrediction(pred(2, 1), finished(2, 1), cfg), 3 + 1);
});

test("sign disabled yields 0 on a correct sign (non-exact)", () => {
  const cfg = { ...CFG, sign_enabled: false };
  assert.equal(scorePrediction(pred(3, 0), finished(1, 0), cfg), 0);
});

test("sign disabled still allows exact", () => {
  const cfg = { ...CFG, sign_enabled: false };
  assert.equal(scorePrediction(pred(2, 1), finished(2, 1), cfg), 5);
});

test("diff bonus disabled yields plain sign points", () => {
  const cfg = { ...CFG, diff_bonus_enabled: false };
  assert.equal(scorePrediction(pred(2, 1), finished(3, 2), cfg), 3);
});

test("joker multiplier of 3 honored from config", () => {
  const cfg = { ...CFG, joker_multiplier: 3 };
  assert.equal(scorePrediction(pred(2, 1), jokerMatch(2, 1), cfg), 15);
});

// ---------------------------------------------------------------------------
// unfinished / unscored → null
// ---------------------------------------------------------------------------
test("scheduled match → null", () => {
  const m: ScorableMatch = {
    home_score: null,
    away_score: null,
    status: "scheduled",
    is_joker: false,
  };
  assert.equal(scorePrediction(pred(2, 1), m, CFG), null);
});

test("live match → null", () => {
  const m: ScorableMatch = {
    home_score: 1,
    away_score: 0,
    status: "live",
    is_joker: false,
  };
  assert.equal(scorePrediction(pred(1, 0), m, CFG), null);
});

test("finished but null score → null", () => {
  const m: ScorableMatch = {
    home_score: null,
    away_score: null,
    status: "finished",
    is_joker: false,
  };
  assert.equal(scorePrediction(pred(0, 0), m, CFG), null);
});

// ---------------------------------------------------------------------------
// scoreBonusAnswer — each type
// ---------------------------------------------------------------------------
const q = (
  type: BonusQuestion["type"],
  correct: BonusQuestion["correct_answer"],
  points = 10,
): BonusQuestion => ({
  id: "q1",
  text: "?",
  type,
  options: null,
  points,
  correct_answer: correct,
  locks_at: "2026-06-11T00:00:00Z",
});

test("single correct awards points", () => {
  assert.equal(scoreBonusAnswer("Brazil", q("single", "Brazil")), 10);
});

test("single wrong awards 0", () => {
  assert.equal(scoreBonusAnswer("Spain", q("single", "Brazil")), 0);
});

test("numeric correct (number) awards points", () => {
  assert.equal(scoreBonusAnswer(8, q("numeric", 8)), 10);
});

test("numeric coerces string answer", () => {
  assert.equal(scoreBonusAnswer("8", q("numeric", 8)), 10);
});

test("numeric wrong awards 0", () => {
  assert.equal(scoreBonusAnswer(7, q("numeric", 8)), 0);
});

test("multi full set match (order-independent) awards points", () => {
  assert.equal(
    scoreBonusAnswer(["Brazil", "France"], q("multi", ["France", "Brazil"])),
    10,
  );
});

test("multi partial match awards 0 (all-or-nothing)", () => {
  assert.equal(
    scoreBonusAnswer(["Brazil"], q("multi", ["France", "Brazil"])),
    0,
  );
});

test("multi superset awards 0", () => {
  assert.equal(
    scoreBonusAnswer(["Brazil", "France", "Spain"], q("multi", ["France", "Brazil"])),
    0,
  );
});

test("bonus null correct_answer → null", () => {
  assert.equal(scoreBonusAnswer("Brazil", q("single", null)), null);
});

test("bonus malformed answer shape scores 0, not throw", () => {
  // single question but array answer
  assert.equal(scoreBonusAnswer(["x"] as unknown as string, q("single", "x")), 0);
});

// ---------------------------------------------------------------------------
// recomputePredictionPoints — idempotent, map + record lookup
// ---------------------------------------------------------------------------
test("recompute maps predictions to points (Record lookup)", () => {
  const matches = {
    m1: finished(2, 1),
    m2: finished(0, 0),
  };
  const predictions = [
    { id: "p1", match_id: "m1", home_pred: 2, away_pred: 1, is_joker: false },
    { id: "p2", match_id: "m2", home_pred: 1, away_pred: 0, is_joker: false },
  ];
  const out = recomputePredictionPoints(predictions, matches, CFG);
  assert.deepEqual(out, [
    { id: "p1", points_awarded: 5 },
    { id: "p2", points_awarded: 0 },
  ]);
});

test("recompute works with a Map and missing match → null", () => {
  const matches = new Map<string, ScorableMatch>([["m1", finished(2, 1)]]);
  const predictions = [
    { id: "p1", match_id: "m1", home_pred: 2, away_pred: 1, is_joker: false },
    { id: "p2", match_id: "missing", home_pred: 1, away_pred: 0, is_joker: false },
  ];
  const out = recomputePredictionPoints(predictions, matches, CFG);
  assert.deepEqual(out, [
    { id: "p1", points_awarded: 5 },
    { id: "p2", points_awarded: null },
  ]);
});

test("recompute is idempotent (joker comes from the match)", () => {
  const matches = { m1: jokerMatch(2, 1) };
  const predictions = [
    { id: "p1", match_id: "m1", home_pred: 2, away_pred: 1 },
  ];
  const a = recomputePredictionPoints(predictions, matches, CFG);
  const b = recomputePredictionPoints(predictions, matches, CFG);
  assert.deepEqual(a, b);
  assert.equal(a[0].points_awarded, 10);
});

// ---------------------------------------------------------------------------
// scoreBonusAnswer — text type (MANUALLY graded; correct_answer ignored)
// ---------------------------------------------------------------------------
test("text ungraded (manualCorrect omitted) → null", () => {
  assert.equal(scoreBonusAnswer("Messi", q("text", null)), null);
});

test("text ungraded (manualCorrect null) → null", () => {
  assert.equal(scoreBonusAnswer("Messi", q("text", null), null), null);
});

test("text with correct_answer set but no manualCorrect → still null", () => {
  // correct_answer is IGNORED for text — grading is manual only.
  assert.equal(scoreBonusAnswer("Messi", q("text", "Messi")), null);
});

test("text manualCorrect true awards points", () => {
  assert.equal(scoreBonusAnswer("anything", q("text", null), true), 10);
});

test("text manualCorrect false awards 0", () => {
  assert.equal(scoreBonusAnswer("anything", q("text", null), false), 0);
});

test("text manual grading ignores correct_answer entirely", () => {
  // answer mismatches correct_answer string, but admin marked it correct.
  assert.equal(scoreBonusAnswer("Lio", q("text", "Messi"), true), 10);
  // answer matches correct_answer string, but admin marked it wrong.
  assert.equal(scoreBonusAnswer("Messi", q("text", "Messi"), false), 0);
});

test("text manual grading does not require closing the question", () => {
  // correct_answer null (question not "closed") yet still graded true.
  assert.equal(scoreBonusAnswer("Messi", q("text", null), true), 10);
});

// ---------------------------------------------------------------------------
// scoreBonusAnswer — manualCorrect is ignored for non-text types
// ---------------------------------------------------------------------------
test("manualCorrect is ignored for single (auto-graded)", () => {
  // manualCorrect=false must NOT override an auto-correct single answer.
  assert.equal(scoreBonusAnswer("Brazil", q("single", "Brazil"), false), 10);
  // manualCorrect=true must NOT rescue a wrong single answer.
  assert.equal(scoreBonusAnswer("Spain", q("single", "Brazil"), true), 0);
});

test("manualCorrect is ignored for numeric and multi", () => {
  assert.equal(scoreBonusAnswer(8, q("numeric", 8), false), 10);
  assert.equal(
    scoreBonusAnswer(["Brazil"], q("multi", ["France", "Brazil"]), true),
    0,
  );
});

test("non-text null correct_answer still → null regardless of manualCorrect", () => {
  assert.equal(scoreBonusAnswer("Brazil", q("single", null), true), null);
  assert.equal(scoreBonusAnswer(8, q("numeric", null), false), null);
});

// ---------------------------------------------------------------------------
// roundKeyForMatch
// ---------------------------------------------------------------------------
test("roundKeyForMatch maps group matchdays", () => {
  assert.equal(roundKeyForMatch({ stage: "group", matchday: 1 }), "group-md1");
  assert.equal(roundKeyForMatch({ stage: "group", matchday: 2 }), "group-md2");
  assert.equal(roundKeyForMatch({ stage: "group", matchday: 3 }), "group-md3");
});

test("roundKeyForMatch maps each knockout stage", () => {
  assert.equal(
    roundKeyForMatch({ stage: "round_of_32", matchday: null }),
    "round_of_32",
  );
  assert.equal(
    roundKeyForMatch({ stage: "round_of_16", matchday: null }),
    "round_of_16",
  );
  assert.equal(roundKeyForMatch({ stage: "quarter", matchday: null }), "quarter");
  assert.equal(roundKeyForMatch({ stage: "semi", matchday: null }), "semi");
  assert.equal(roundKeyForMatch({ stage: "final", matchday: null }), "final");
});

test("roundKeyForMatch folds third_place into final", () => {
  assert.equal(
    roundKeyForMatch({ stage: "third_place", matchday: null }),
    "final",
  );
});

test("roundKeyForMatch throws on group match with no matchday", () => {
  assert.throws(() => roundKeyForMatch({ stage: "group", matchday: null }));
  assert.throws(() => roundKeyForMatch({ stage: "group", matchday: 4 }));
});

// ---------------------------------------------------------------------------
// pickRoundWinners
// ---------------------------------------------------------------------------
const entry = (
  user_id: string,
  round_points: number,
  exact_hits = 0,
): RoundEntry => ({ user_id, round_points, exact_hits });

test("pickRoundWinners: single clear winner", () => {
  const out = pickRoundWinners(
    [entry("a", 30, 2), entry("b", 20, 1), entry("c", 10, 0)],
    100,
  );
  assert.deepEqual(out, [{ user_id: "a", points: 100, round_points: 30 }]);
});

test("pickRoundWinners: tie on points resolved by exact hits", () => {
  const out = pickRoundWinners(
    [entry("a", 30, 1), entry("b", 30, 3), entry("c", 30, 2)],
    100,
  );
  assert.deepEqual(out, [{ user_id: "b", points: 100, round_points: 30 }]);
});

test("pickRoundWinners: full tie splits with floor (remainder dropped)", () => {
  const out = pickRoundWinners(
    [entry("a", 30, 2), entry("b", 30, 2), entry("c", 30, 2)],
    100,
  );
  // floor(100 / 3) = 33 each, remainder 1 dropped
  assert.deepEqual(out, [
    { user_id: "a", points: 33, round_points: 30 },
    { user_id: "b", points: 33, round_points: 30 },
    { user_id: "c", points: 33, round_points: 30 },
  ]);
});

test("pickRoundWinners: two-way full tie splits evenly", () => {
  const out = pickRoundWinners([entry("a", 30, 2), entry("b", 30, 2)], 100);
  assert.deepEqual(out, [
    { user_id: "a", points: 50, round_points: 30 },
    { user_id: "b", points: 50, round_points: 30 },
  ]);
});

test("pickRoundWinners: all-zero → no champion", () => {
  const out = pickRoundWinners(
    [entry("a", 0, 0), entry("b", 0, 0)],
    100,
  );
  assert.deepEqual(out, []);
});

test("pickRoundWinners: negative-everyone → no champion", () => {
  const out = pickRoundWinners([entry("a", -5, 0), entry("b", -3, 0)], 100);
  assert.deepEqual(out, []);
});

test("pickRoundWinners: single entry with positive points wins", () => {
  const out = pickRoundWinners([entry("a", 12, 1)], 100);
  assert.deepEqual(out, [{ user_id: "a", points: 100, round_points: 12 }]);
});

test("pickRoundWinners: empty entries → []", () => {
  assert.deepEqual(pickRoundWinners([], 100), []);
});
