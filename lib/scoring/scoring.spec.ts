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
  type ScorableMatch,
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

const finished = (h: number, a: number): ScorableMatch => ({
  home_score: h,
  away_score: a,
  status: "finished",
});

const pred = (h: number, a: number, is_joker = false) => ({
  home_pred: h,
  away_pred: a,
  is_joker,
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
// joker multiplier
// ---------------------------------------------------------------------------
test("joker multiplies exact", () => {
  assert.equal(scorePrediction(pred(2, 1, true), finished(2, 1), CFG), 5 * 2);
});

test("joker multiplies sign + diff bonus", () => {
  assert.equal(scorePrediction(pred(2, 1, true), finished(3, 2), CFG), (3 + 1) * 2);
});

test("joker on a wrong prediction is still 0", () => {
  assert.equal(scorePrediction(pred(2, 0, true), finished(0, 2), CFG), 0);
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
  assert.equal(scorePrediction(pred(2, 1, true), finished(2, 1), cfg), 15);
});

// ---------------------------------------------------------------------------
// unfinished / unscored → null
// ---------------------------------------------------------------------------
test("scheduled match → null", () => {
  const m: ScorableMatch = { home_score: null, away_score: null, status: "scheduled" };
  assert.equal(scorePrediction(pred(2, 1), m, CFG), null);
});

test("live match → null", () => {
  const m: ScorableMatch = { home_score: 1, away_score: 0, status: "live" };
  assert.equal(scorePrediction(pred(1, 0), m, CFG), null);
});

test("finished but null score → null", () => {
  const m: ScorableMatch = { home_score: null, away_score: null, status: "finished" };
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

test("recompute is idempotent", () => {
  const matches = { m1: finished(2, 1) };
  const predictions = [
    { id: "p1", match_id: "m1", home_pred: 2, away_pred: 1, is_joker: true },
  ];
  const a = recomputePredictionPoints(predictions, matches, CFG);
  const b = recomputePredictionPoints(predictions, matches, CFG);
  assert.deepEqual(a, b);
  assert.equal(a[0].points_awarded, 10);
});
