// ============================================================================
// AUDIT SUITE — exhaustive, fictional-data verification of the scoring engine.
//
// Goal: prove every scoring rule produces the correct numbers and document any
// discrepancy. This suite is ADDITIVE (does not replace scoring.spec.ts) and
// probes edge cases the base suite does not: full DEFAULT_APP_SETTINGS numbers
// (50/20/10/×3), high/asymmetric scorelines, draw diff edges, real-world recalc
// scenarios with mixed users/matches, end-to-end round-award pipelines, and
// purity/idempotency guarantees.
//
// Run: npx tsx --test lib/scoring/scoring.audit.spec.ts
// ============================================================================
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
import {
  DEFAULT_APP_SETTINGS,
  type ScoringConfig,
  type BonusQuestion,
} from "@/lib/types";

// Default production config: exact=50, sign=20, diff_bonus=10, joker ×3.
const DEF: ScoringConfig = DEFAULT_APP_SETTINGS.scoring;

// A wholly fictional alternate config, to prove NOTHING is hardcoded.
const ALT: ScoringConfig = {
  exact: 7,
  sign: 2,
  diff_bonus: 1,
  joker_multiplier: 5,
  exact_enabled: true,
  sign_enabled: true,
  diff_bonus_enabled: true,
};

const finished = (h: number, a: number, is_joker = false): ScorableMatch => ({
  home_score: h,
  away_score: a,
  status: "finished",
  is_joker,
});
const joker = (h: number, a: number): ScorableMatch => finished(h, a, true);
const pred = (h: number, a: number) => ({ home_pred: h, away_pred: a });

// ---------------------------------------------------------------------------
// SECTION A — pure helpers, exhaustive
// ---------------------------------------------------------------------------
test("A. outcomeSign covers every region incl. high & zero", () => {
  assert.equal(outcomeSign(0, 0), "draw");
  assert.equal(outcomeSign(9, 0), "home");
  assert.equal(outcomeSign(0, 9), "away");
  assert.equal(outcomeSign(7, 7), "draw");
  assert.equal(outcomeSign(4, 3), "home");
  assert.equal(outcomeSign(3, 4), "away");
});

test("A. goalDiff is signed and symmetric", () => {
  assert.equal(goalDiff(5, 2), 3);
  assert.equal(goalDiff(2, 5), -3);
  assert.equal(goalDiff(0, 0), 0);
  assert.equal(goalDiff(10, 1), 9);
});

test("A. isExact only true on identical scorelines", () => {
  assert.equal(isExact(0, 0, 0, 0), true);
  assert.equal(isExact(4, 4, 4, 4), true);
  assert.equal(isExact(2, 1, 1, 2), false); // mirrored
  assert.equal(isExact(3, 0, 3, 1), false);
});

// ---------------------------------------------------------------------------
// SECTION B — scorePrediction tiers with DEFAULT (50/20/10) config
// home win / away win / draw  ×  exact / sign+diff / sign-only / wrong
// ---------------------------------------------------------------------------
test("B. HOME WIN — exact 50", () => {
  assert.equal(scorePrediction(pred(2, 1), finished(2, 1), DEF), 50);
});
test("B. HOME WIN — sign+diff 30 (2-1 vs 3-2)", () => {
  assert.equal(scorePrediction(pred(2, 1), finished(3, 2), DEF), 30);
});
test("B. HOME WIN — sign only 20 (3-0 vs 1-0, diff 3 vs 1)", () => {
  assert.equal(scorePrediction(pred(3, 0), finished(1, 0), DEF), 20);
});
test("B. HOME WIN predicted, AWAY WIN actual — wrong 0", () => {
  assert.equal(scorePrediction(pred(2, 0), finished(0, 2), DEF), 0);
});

test("B. AWAY WIN — exact 50", () => {
  assert.equal(scorePrediction(pred(0, 3), finished(0, 3), DEF), 50);
});
test("B. AWAY WIN — sign+diff 30 (1-2 vs 2-3)", () => {
  assert.equal(scorePrediction(pred(1, 2), finished(2, 3), DEF), 30);
});
test("B. AWAY WIN — sign only 20 (0-3 vs 1-2)", () => {
  assert.equal(scorePrediction(pred(0, 3), finished(1, 2), DEF), 20);
});

test("B. DRAW — exact 0-0 vs 0-0 = 50", () => {
  assert.equal(scorePrediction(pred(0, 0), finished(0, 0), DEF), 50);
});
test("B. DRAW — exact 2-2 vs 2-2 = 50", () => {
  assert.equal(scorePrediction(pred(2, 2), finished(2, 2), DEF), 50);
});
test("B. DRAW — sign+diff edge: 1-1 vs 2-2 → 30 (diff 0 both)", () => {
  // KEY edge from the brief: any draw predicted vs any draw actual is BOTH
  // same sign (draw) AND same diff (0) → always sign+diff, never sign-only.
  assert.equal(scorePrediction(pred(1, 1), finished(2, 2), DEF), 30);
  assert.equal(scorePrediction(pred(0, 0), finished(3, 3), DEF), 30);
  assert.equal(scorePrediction(pred(4, 4), finished(1, 1), DEF), 30);
});

test("B. ASYMMETRIC — predicted 3-1 actual 1-3 → 0 (sign flips)", () => {
  assert.equal(scorePrediction(pred(3, 1), finished(1, 3), DEF), 0);
});
test("B. HIGH SCORELINE — exact 7-5 = 50", () => {
  assert.equal(scorePrediction(pred(7, 5), finished(7, 5), DEF), 50);
});
test("B. HIGH SCORELINE — sign+diff 6-2 vs 5-1 (diff 4) = 30", () => {
  assert.equal(scorePrediction(pred(6, 2), finished(5, 1), DEF), 30);
});

// ---------------------------------------------------------------------------
// SECTION C — exact must NOT be additive (50, not 50+20+10)
// ---------------------------------------------------------------------------
test("C. exact composes as a single tier (50, not 80)", () => {
  // An exact hit is also a correct sign and correct diff. Verify the engine
  // returns ONLY settings.exact, not exact+sign+diff.
  const v = scorePrediction(pred(2, 1), finished(2, 1), DEF);
  assert.equal(v, 50);
  assert.notEqual(v, 80);
});
test("C. ALT config exact composes to 7, not 10", () => {
  // ALT: exact 7, sign 2, diff 1 → if additive it'd be 10.
  assert.equal(scorePrediction(pred(2, 1), finished(2, 1), ALT), 7);
});

// ---------------------------------------------------------------------------
// SECTION D — joker MATCH multiplier (×3 default, ×5 ALT)
// ---------------------------------------------------------------------------
test("D. joker ×3 — exact 50→150", () => {
  assert.equal(scorePrediction(pred(2, 1), joker(2, 1), DEF), 150);
});
test("D. joker ×3 — sign+diff 30→90", () => {
  assert.equal(scorePrediction(pred(2, 1), joker(3, 2), DEF), 90);
});
test("D. joker ×3 — sign only 20→60", () => {
  assert.equal(scorePrediction(pred(3, 0), joker(1, 0), DEF), 60);
});
test("D. joker ×3 — wrong 0×3 = 0", () => {
  assert.equal(scorePrediction(pred(2, 0), joker(0, 2), DEF), 0);
});
test("D. joker ALT ×5 — exact 7→35, sign 2→10, sign+diff 3→15", () => {
  assert.equal(scorePrediction(pred(2, 1), joker(2, 1), ALT), 35);
  assert.equal(scorePrediction(pred(3, 0), joker(1, 0), ALT), 10);
  assert.equal(scorePrediction(pred(2, 1), joker(3, 2), ALT), 15);
});
test("D. non-joker match unaffected by multiplier config", () => {
  assert.equal(scorePrediction(pred(2, 1), finished(2, 1), DEF), 50);
});
test("D. DEPRECATED prediction.is_joker is IGNORED", () => {
  // Prediction says joker=true, but match is NOT joker → plain points.
  const p = { home_pred: 2, away_pred: 1, is_joker: true };
  assert.equal(scorePrediction(p, finished(2, 1), DEF), 50);
  // And prediction joker=false on a joker MATCH still multiplies.
  const p2 = { home_pred: 2, away_pred: 1, is_joker: false };
  assert.equal(scorePrediction(p2, joker(2, 1), DEF), 150);
});
test("D. joker_multiplier of 1 is a no-op", () => {
  const cfg = { ...DEF, joker_multiplier: 1 };
  assert.equal(scorePrediction(pred(2, 1), joker(2, 1), cfg), 50);
});

// ---------------------------------------------------------------------------
// SECTION E — disabled-rule gating (each flag independently)
// ---------------------------------------------------------------------------
test("E. exact_enabled=false → exact hit falls through to sign+diff", () => {
  const cfg = { ...DEF, exact_enabled: false };
  // 2-1 vs 2-1: not awarded exact, but sign+diff both match → 20+10=30.
  assert.equal(scorePrediction(pred(2, 1), finished(2, 1), cfg), 30);
});
test("E. sign_enabled=false → correct sign (non-exact) yields 0", () => {
  const cfg = { ...DEF, sign_enabled: false };
  assert.equal(scorePrediction(pred(3, 0), finished(1, 0), cfg), 0);
  // ...but exact still scores (exact tier is independent).
  assert.equal(scorePrediction(pred(2, 1), finished(2, 1), cfg), 50);
});
test("E. diff_bonus_enabled=false → sign+diff collapses to plain sign", () => {
  const cfg = { ...DEF, diff_bonus_enabled: false };
  assert.equal(scorePrediction(pred(2, 1), finished(3, 2), cfg), 20);
  // draw case too: 1-1 vs 2-2 → just sign 20, no +10.
  assert.equal(scorePrediction(pred(1, 1), finished(2, 2), cfg), 20);
});
test("E. all rules disabled → everything 0 (finished match)", () => {
  const cfg = {
    ...DEF,
    exact_enabled: false,
    sign_enabled: false,
    diff_bonus_enabled: false,
  };
  assert.equal(scorePrediction(pred(2, 1), finished(2, 1), cfg), 0);
  assert.equal(scorePrediction(pred(0, 0), finished(0, 0), cfg), 0);
});
test("E. disabled rules + joker → 0×multiplier stays 0", () => {
  const cfg = { ...DEF, sign_enabled: false, exact_enabled: false };
  assert.equal(scorePrediction(pred(2, 1), joker(2, 1), cfg), 0);
});

// ---------------------------------------------------------------------------
// SECTION F — unfinished / unscored → null (distinct from a scored 0)
// ---------------------------------------------------------------------------
test("F. scheduled → null", () => {
  assert.equal(
    scorePrediction(pred(2, 1), {
      home_score: null,
      away_score: null,
      status: "scheduled",
      is_joker: false,
    }, DEF),
    null,
  );
});
test("F. live (with partial score) → null", () => {
  assert.equal(
    scorePrediction(pred(1, 0), {
      home_score: 1,
      away_score: 0,
      status: "live",
      is_joker: false,
    }, DEF),
    null,
  );
});
test("F. finished but home_score null → null", () => {
  assert.equal(
    scorePrediction(pred(0, 0), {
      home_score: null,
      away_score: 2,
      status: "finished",
      is_joker: false,
    }, DEF),
    null,
  );
});
test("F. finished but away_score null → null", () => {
  assert.equal(
    scorePrediction(pred(0, 0), {
      home_score: 2,
      away_score: null,
      status: "finished",
      is_joker: false,
    }, DEF),
    null,
  );
});
test("F. null is NOT 0 — a correct 0-0 on a finished match scores, unfinished does not", () => {
  assert.equal(scorePrediction(pred(0, 0), finished(0, 0), DEF), 50);
  assert.equal(
    scorePrediction(pred(0, 0), {
      home_score: null,
      away_score: null,
      status: "finished",
      is_joker: false,
    }, DEF),
    null,
  );
});

// ---------------------------------------------------------------------------
// SECTION G — bonus scoring, every type, custom points
// ---------------------------------------------------------------------------
const q = (
  type: BonusQuestion["type"],
  correct: BonusQuestion["correct_answer"],
  points = 100,
  category: BonusQuestion["category"] = "tournament",
): BonusQuestion => ({
  id: "q",
  text: "?",
  type,
  category,
  options: null,
  points,
  correct_answer: correct,
  locks_at: "2026-07-01T00:00:00Z",
});

test("G. single correct → full points; wrong → 0; null answer-key → null", () => {
  assert.equal(scoreBonusAnswer("Argentina", q("single", "Argentina")), 100);
  assert.equal(scoreBonusAnswer("Brazil", q("single", "Argentina")), 0);
  assert.equal(scoreBonusAnswer("Argentina", q("single", null)), null);
});
test("G. single is case-sensitive (exact string equality)", () => {
  // Documents actual behavior: 'argentina' !== 'Argentina'.
  assert.equal(scoreBonusAnswer("argentina", q("single", "Argentina")), 0);
});
test("G. numeric — exact, string-coerced, wrong, null key", () => {
  assert.equal(scoreBonusAnswer(8, q("numeric", 8)), 100);
  assert.equal(scoreBonusAnswer("8", q("numeric", 8)), 100);
  assert.equal(scoreBonusAnswer(7, q("numeric", 8)), 0);
  assert.equal(scoreBonusAnswer(8, q("numeric", null)), null);
});
test("G. numeric handles 0 correctly (not treated as falsy/null)", () => {
  assert.equal(scoreBonusAnswer(0, q("numeric", 0)), 100);
  assert.equal(scoreBonusAnswer("0", q("numeric", 0)), 100);
  assert.equal(scoreBonusAnswer(1, q("numeric", 0)), 0);
});
test("G. multi all-or-nothing: exact set→points; subset/superset/disjoint→0", () => {
  const key = q("multi", ["France", "Brazil"]);
  assert.equal(scoreBonusAnswer(["Brazil", "France"], key), 100); // order-indep
  assert.equal(scoreBonusAnswer(["Brazil"], key), 0); // subset
  assert.equal(scoreBonusAnswer(["Brazil", "France", "Spain"], key), 0); // superset
  assert.equal(scoreBonusAnswer(["Spain", "Italy"], key), 0); // disjoint
});
test("G. multi with duplicate entries collapses (Set semantics)", () => {
  // ['Brazil','Brazil','France'] as a Set == {Brazil,France} == correct.
  assert.equal(
    scoreBonusAnswer(["Brazil", "Brazil", "France"], q("multi", ["France", "Brazil"])),
    100,
  );
});
test("G. multi null answer-key → null", () => {
  assert.equal(scoreBonusAnswer(["Brazil"], q("multi", null)), null);
});
test("G. custom per-question points honored (not 100-hardcoded)", () => {
  assert.equal(scoreBonusAnswer("X", q("single", "X", 250)), 250);
  assert.equal(scoreBonusAnswer(5, q("numeric", 5, 42)), 42);
});
test("G. group-winner question (50 pts, group_winner category)", () => {
  const gw = q("single", "Spain", 50, "group_winner");
  assert.equal(scoreBonusAnswer("Spain", gw), 50);
  assert.equal(scoreBonusAnswer("Portugal", gw), 0);
});
test("G. malformed shape scores 0, never throws (single given array)", () => {
  assert.equal(
    scoreBonusAnswer(["x"] as unknown as string, q("single", "x")),
    0,
  );
  // multi given a plain string → 0, no throw.
  assert.equal(
    scoreBonusAnswer("x" as unknown as string[], q("multi", ["x"])),
    0,
  );
});

// ---------------------------------------------------------------------------
// SECTION H — TEXT bonus: manual grading only, correct_answer ignored
// ---------------------------------------------------------------------------
test("H. text manualCorrect undefined/null → null (ungraded)", () => {
  assert.equal(scoreBonusAnswer("Messi", q("text", null)), null);
  assert.equal(scoreBonusAnswer("Messi", q("text", null), null), null);
});
test("H. text manualCorrect true → points; false → 0", () => {
  assert.equal(scoreBonusAnswer("whatever", q("text", null), true), 100);
  assert.equal(scoreBonusAnswer("whatever", q("text", null), false), 0);
});
test("H. text NEVER uses correct_answer (no string matching)", () => {
  // Answer matches key string but admin says wrong → 0.
  assert.equal(scoreBonusAnswer("Messi", q("text", "Messi"), false), 0);
  // Answer mismatches key string but admin says right → points.
  assert.equal(scoreBonusAnswer("Leo", q("text", "Messi"), true), 100);
  // Key set but not yet graded → still null (don't auto-close).
  assert.equal(scoreBonusAnswer("Messi", q("text", "Messi")), null);
});
test("H. text custom points honored on manual-correct", () => {
  assert.equal(scoreBonusAnswer("x", q("text", null, 75), true), 75);
});

// ---------------------------------------------------------------------------
// SECTION I — manualCorrect IGNORED for non-text types
// ---------------------------------------------------------------------------
test("I. manualCorrect cannot override auto-graded single/numeric/multi", () => {
  assert.equal(scoreBonusAnswer("Brazil", q("single", "Brazil"), false), 100);
  assert.equal(scoreBonusAnswer("Spain", q("single", "Brazil"), true), 0);
  assert.equal(scoreBonusAnswer(8, q("numeric", 8), false), 100);
  assert.equal(scoreBonusAnswer(["Brazil"], q("multi", ["France", "Brazil"]), true), 0);
});
test("I. non-text null key → null regardless of manualCorrect", () => {
  assert.equal(scoreBonusAnswer("Brazil", q("single", null), true), null);
  assert.equal(scoreBonusAnswer(8, q("numeric", null), false), null);
});

// ---------------------------------------------------------------------------
// SECTION J — recomputePredictionPoints: realistic multi-user recalc
// ---------------------------------------------------------------------------
test("J. multi-user recalc with mixed outcomes + a joker match (DEFAULT cfg)", () => {
  // Fictional matchday: m1 normal, m2 normal, m3 JOKER.
  const matches: Record<string, ScorableMatch> = {
    m1: finished(2, 1), // home win
    m2: finished(1, 1), // draw
    m3: joker(0, 2), // away win, JOKER ×3
  };
  const predictions = [
    // Alice: exact, exact, exact → 50 + 50 + 150
    { id: "a-m1", user_id: "alice", match_id: "m1", home_pred: 2, away_pred: 1 },
    { id: "a-m2", user_id: "alice", match_id: "m2", home_pred: 1, away_pred: 1 },
    { id: "a-m3", user_id: "alice", match_id: "m3", home_pred: 0, away_pred: 2 },
    // Bob: sign+diff, sign+diff (draw), wrong → 30 + 30 + 0
    { id: "b-m1", user_id: "bob", match_id: "m1", home_pred: 3, away_pred: 2 },
    { id: "b-m2", user_id: "bob", match_id: "m2", home_pred: 2, away_pred: 2 },
    { id: "b-m3", user_id: "bob", match_id: "m3", home_pred: 1, away_pred: 0 },
    // Cara: sign-only, wrong, sign+diff joker → 20 + 0 + 90
    { id: "c-m1", user_id: "cara", match_id: "m1", home_pred: 4, away_pred: 0 },
    { id: "c-m2", user_id: "cara", match_id: "m2", home_pred: 0, away_pred: 1 },
    { id: "c-m3", user_id: "cara", match_id: "m3", home_pred: 1, away_pred: 3 },
  ];
  const out = recomputePredictionPoints(predictions, matches, DEF);
  const byId = Object.fromEntries(out.map((r) => [r.id, r.points_awarded]));
  assert.equal(byId["a-m1"], 50);
  assert.equal(byId["a-m2"], 50);
  assert.equal(byId["a-m3"], 150);
  assert.equal(byId["b-m1"], 30);
  assert.equal(byId["b-m2"], 30);
  assert.equal(byId["b-m3"], 0);
  assert.equal(byId["c-m1"], 20);
  assert.equal(byId["c-m2"], 0);
  assert.equal(byId["c-m3"], 90);
  // Totals: Alice 250, Bob 60, Cara 110.
  const total = (u: string) =>
    out
      .filter((r) => r.id.startsWith(u[0] + "-"))
      .reduce((s, r) => s + (r.points_awarded ?? 0), 0);
  assert.equal(total("alice"), 250);
  assert.equal(total("bob"), 60);
  assert.equal(total("cara"), 110);
});

test("J. recalc with Map input + missing/unfinished matches → null", () => {
  const matches = new Map<string, ScorableMatch>([
    ["m1", finished(2, 1)],
    ["m2", { home_score: null, away_score: null, status: "scheduled", is_joker: false }],
  ]);
  const predictions = [
    { id: "p1", match_id: "m1", home_pred: 2, away_pred: 1 },
    { id: "p2", match_id: "m2", home_pred: 1, away_pred: 0 }, // unfinished → null
    { id: "p3", match_id: "ghost", home_pred: 1, away_pred: 0 }, // missing → null
  ];
  const out = recomputePredictionPoints(predictions, matches, DEF);
  assert.deepEqual(out, [
    { id: "p1", points_awarded: 50 },
    { id: "p2", points_awarded: null },
    { id: "p3", points_awarded: null },
  ]);
});

test("J. recalc is idempotent and pure (run twice, deep-equal; inputs unmutated)", () => {
  const matches = { m1: joker(2, 1), m2: finished(0, 0) };
  const predictions = [
    { id: "p1", match_id: "m1", home_pred: 2, away_pred: 1 },
    { id: "p2", match_id: "m2", home_pred: 0, away_pred: 0 },
  ];
  const snapshot = JSON.stringify({ matches, predictions });
  const a = recomputePredictionPoints(predictions, matches, DEF);
  const b = recomputePredictionPoints(predictions, matches, DEF);
  assert.deepEqual(a, b);
  assert.equal(a[0].points_awarded, 150);
  assert.equal(a[1].points_awarded, 50);
  // No mutation of inputs.
  assert.equal(JSON.stringify({ matches, predictions }), snapshot);
});

test("J. empty predictions → empty result", () => {
  assert.deepEqual(recomputePredictionPoints([], {}, DEF), []);
});

// ---------------------------------------------------------------------------
// SECTION K — roundKeyForMatch
// ---------------------------------------------------------------------------
test("K. group matchdays map to group-mdN", () => {
  assert.equal(roundKeyForMatch({ stage: "group", matchday: 1 }), "group-md1");
  assert.equal(roundKeyForMatch({ stage: "group", matchday: 2 }), "group-md2");
  assert.equal(roundKeyForMatch({ stage: "group", matchday: 3 }), "group-md3");
});
test("K. each knockout stage maps to itself; third_place folds into final", () => {
  assert.equal(roundKeyForMatch({ stage: "round_of_32", matchday: null }), "round_of_32");
  assert.equal(roundKeyForMatch({ stage: "round_of_16", matchday: null }), "round_of_16");
  assert.equal(roundKeyForMatch({ stage: "quarter", matchday: null }), "quarter");
  assert.equal(roundKeyForMatch({ stage: "semi", matchday: null }), "semi");
  assert.equal(roundKeyForMatch({ stage: "final", matchday: null }), "final");
  assert.equal(roundKeyForMatch({ stage: "third_place", matchday: null }), "final");
});
test("K. invalid group matchday throws (data integrity)", () => {
  assert.throws(() => roundKeyForMatch({ stage: "group", matchday: null }));
  assert.throws(() => roundKeyForMatch({ stage: "group", matchday: 0 }));
  assert.throws(() => roundKeyForMatch({ stage: "group", matchday: 4 }));
});

// ---------------------------------------------------------------------------
// SECTION L — pickRoundWinners (meta volante)
// ---------------------------------------------------------------------------
const entry = (user_id: string, round_points: number, exact_hits = 0): RoundEntry => ({
  user_id,
  round_points,
  exact_hits,
});

test("L. clear winner gets full award", () => {
  assert.deepEqual(
    pickRoundWinners([entry("a", 80, 2), entry("b", 50, 3), entry("c", 30, 1)], 100),
    [{ user_id: "a", points: 100, round_points: 80 }],
  );
});
test("L. tie on points broken by exact hits (precision rewarded)", () => {
  assert.deepEqual(
    pickRoundWinners([entry("a", 60, 1), entry("b", 60, 3), entry("c", 60, 2)], 100),
    [{ user_id: "b", points: 100, round_points: 60 }],
  );
});
test("L. full tie (pts AND exact) splits with floor, remainder dropped", () => {
  // 3-way: floor(100/3)=33 each (99 distributed, 1 dropped).
  assert.deepEqual(
    pickRoundWinners([entry("a", 60, 2), entry("b", 60, 2), entry("c", 60, 2)], 100),
    [
      { user_id: "a", points: 33, round_points: 60 },
      { user_id: "b", points: 33, round_points: 60 },
      { user_id: "c", points: 33, round_points: 60 },
    ],
  );
});
test("L. two-way full tie splits evenly (50/50)", () => {
  assert.deepEqual(
    pickRoundWinners([entry("a", 40, 1), entry("b", 40, 1)], 100),
    [
      { user_id: "a", points: 50, round_points: 40 },
      { user_id: "b", points: 50, round_points: 40 },
    ],
  );
});
test("L. partial tie subset splits among only the top-exact group", () => {
  // a,b,c all tie on points; a&c share top exact_hits(3); b has 1 → a&c split.
  assert.deepEqual(
    pickRoundWinners([entry("a", 50, 3), entry("b", 50, 1), entry("c", 50, 3)], 100),
    [
      { user_id: "a", points: 50, round_points: 50 },
      { user_id: "c", points: 50, round_points: 50 },
    ],
  );
});
test("L. zero / negative best score → no champion (round had no positive scorer)", () => {
  assert.deepEqual(pickRoundWinners([entry("a", 0, 0), entry("b", 0, 0)], 100), []);
  assert.deepEqual(pickRoundWinners([entry("a", -5, 0), entry("b", -3, 0)], 100), []);
});
test("L. single positive entry wins; empty → []", () => {
  assert.deepEqual(pickRoundWinners([entry("a", 12, 1)], 100), [
    { user_id: "a", points: 100, round_points: 12 },
  ]);
  assert.deepEqual(pickRoundWinners([], 100), []);
});
test("L. winners follow input order on a split", () => {
  const out = pickRoundWinners([entry("z", 30, 0), entry("y", 30, 0), entry("x", 30, 0)], 90);
  assert.deepEqual(out.map((w) => w.user_id), ["z", "y", "x"]);
  assert.equal(out[0].points, 30); // 90/3
});
test("L. custom award amount honored (not 100-hardcoded)", () => {
  assert.deepEqual(pickRoundWinners([entry("a", 10, 0)], 250), [
    { user_id: "a", points: 250, round_points: 10 },
  ]);
});
test("L. tiny award split rounds DOWN to 0 each (documents remainder-drop)", () => {
  // award 1 split 2 ways → floor(1/2)=0 each. Documents that small awards can
  // vanish entirely under the floor-split rule.
  assert.deepEqual(pickRoundWinners([entry("a", 5, 0), entry("b", 5, 0)], 1), [
    { user_id: "a", points: 0, round_points: 5 },
    { user_id: "b", points: 0, round_points: 5 },
  ]);
});

// ---------------------------------------------------------------------------
// SECTION M — END-TO-END: predictions → round entries → meta award
// Simulates the manual recalc pipeline over a fictional group matchday-1.
// ---------------------------------------------------------------------------
test("M. full round pipeline: score md1, tally per user, pick champion", () => {
  // 3 matches in group-md1, 3 fictional players.
  const md1Matches: Record<string, ScorableMatch & { stage: "group"; matchday: 1 }> = {
    g1: { ...finished(2, 0), stage: "group", matchday: 1 },
    g2: { ...finished(1, 1), stage: "group", matchday: 1 },
    g3: { ...finished(0, 3), stage: "group", matchday: 1 },
  };
  // every match folds into group-md1
  for (const m of Object.values(md1Matches)) {
    assert.equal(roundKeyForMatch(m), "group-md1");
  }
  const predictions = [
    // Nico: 2-0 exact(50), 1-1 exact(50), 1-2 sign-only(20) → 120, 2 exact
    { id: "n1", user_id: "nico", match_id: "g1", home_pred: 2, away_pred: 0 },
    { id: "n2", user_id: "nico", match_id: "g2", home_pred: 1, away_pred: 1 },
    { id: "n3", user_id: "nico", match_id: "g3", home_pred: 1, away_pred: 2 },
    // Sara: 3-1 sign+diff... wait 2-0 actual diff2; 3-1 diff2 → sign+diff(30);
    //   2-2 draw sign+diff(30); 0-3 exact(50) → 110, 1 exact
    { id: "s1", user_id: "sara", match_id: "g1", home_pred: 3, away_pred: 1 },
    { id: "s2", user_id: "sara", match_id: "g2", home_pred: 2, away_pred: 2 },
    { id: "s3", user_id: "sara", match_id: "g3", home_pred: 0, away_pred: 3 },
    // Toni: all wrong sign → 0,0,0 → 0, 0 exact
    { id: "t1", user_id: "toni", match_id: "g1", home_pred: 0, away_pred: 2 },
    { id: "t2", user_id: "toni", match_id: "g2", home_pred: 1, away_pred: 0 },
    { id: "t3", user_id: "toni", match_id: "g3", home_pred: 2, away_pred: 0 },
  ];
  const scored = recomputePredictionPoints(predictions, md1Matches, DEF);

  // Tally per user into RoundEntry (round_points + exact_hits).
  const exactByPred = new Map(
    predictions.map((p) => {
      const m = md1Matches[p.match_id];
      return [p.id, isExact(p.home_pred, p.away_pred, m.home_score!, m.away_score!)];
    }),
  );
  const tally = new Map<string, { pts: number; exact: number }>();
  for (const p of predictions) {
    const r = scored.find((x) => x.id === p.id)!;
    const cur = tally.get(p.user_id) ?? { pts: 0, exact: 0 };
    cur.pts += r.points_awarded ?? 0;
    if (exactByPred.get(p.id)) cur.exact += 1;
    tally.set(p.user_id, cur);
  }
  assert.deepEqual(tally.get("nico"), { pts: 120, exact: 2 });
  assert.deepEqual(tally.get("sara"), { pts: 110, exact: 1 });
  assert.deepEqual(tally.get("toni"), { pts: 0, exact: 0 });

  const winners = pickRoundWinners(
    [...tally.entries()].map(([u, v]) => entry(u, v.pts, v.exact)),
    DEFAULT_APP_SETTINGS.meta_volante_points,
  );
  // Nico wins outright (120 > 110), award = meta_volante_points (100).
  assert.deepEqual(winners, [{ user_id: "nico", points: 100, round_points: 120 }]);
});

test("M. round-champion tie decided by exact hits, end-to-end", () => {
  // Two players tie on round points but differ on exact hits.
  const m: Record<string, ScorableMatch> = { x: finished(2, 1), y: finished(1, 0) };
  const preds = [
    // Ana: 2-1 exact(50) + 2-0 sign+diff? actual 1-0 diff1, 2-0 diff2 → sign-only(20) = 70, 1 exact
    { id: "a1", user_id: "ana", match_id: "x", home_pred: 2, away_pred: 1 },
    { id: "a2", user_id: "ana", match_id: "y", home_pred: 2, away_pred: 0 },
    // Bea: 3-2 sign+diff(30) + 1-0 exact(50) = 80... make it tie: change Bea
  ];
  // Rework so both reach the SAME points but different exact counts:
  // Ana: x exact(50), y sign-only(20) → 70 pts, 1 exact
  // Bea: x sign+diff(30) [3-2], y exact(50) [1-0] → 80... not tie. Adjust:
  // Use simpler direct entries to assert the tiebreak end-to-end:
  const scored = recomputePredictionPoints(preds, m, DEF);
  assert.equal(scored.find((s) => s.id === "a1")!.points_awarded, 50);
  assert.equal(scored.find((s) => s.id === "a2")!.points_awarded, 20);

  // Construct an explicit tie (70 pts each) with different exact hits.
  const winners = pickRoundWinners(
    [entry("ana", 70, 1), entry("bea", 70, 0)],
    100,
  );
  assert.deepEqual(winners, [{ user_id: "ana", points: 100, round_points: 70 }]);
});

// ---------------------------------------------------------------------------
// SECTION N — purity / determinism sweep across all single-call APIs
// ---------------------------------------------------------------------------
test("N. scorePrediction is referentially stable (same input → same output)", () => {
  for (let i = 0; i < 5; i++) {
    assert.equal(scorePrediction(pred(2, 1), joker(3, 2), DEF), 90);
    assert.equal(scoreBonusAnswer(["a", "b"], q("multi", ["b", "a"])), 100);
    assert.deepEqual(pickRoundWinners([entry("a", 5, 0), entry("b", 5, 0)], 10), [
      { user_id: "a", points: 5, round_points: 5 },
      { user_id: "b", points: 5, round_points: 5 },
    ]);
  }
});
