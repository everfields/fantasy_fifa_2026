// Tests for the PURE "Luis de la Tracker" analysis engine.
// Run with: node --test --import tsx  (same as lib/scoring/scoring.spec.ts).
import { test } from "node:test";
import assert from "node:assert";

import { analyzePredictions } from "./analysis";
import type {
  AnalysisInput,
  AnalysisMatch,
  AnalysisPrediction,
} from "./analysis";

const players = [
  { user_id: "a", display_name: "Ana" },
  { user_id: "b", display_name: "Bea" },
  { user_id: "c", display_name: "Carlos" },
  { user_id: "d", display_name: "Dani" },
  { user_id: "e", display_name: "Eva" },
];

function match(over: Partial<AnalysisMatch> & { id: string }): AnalysisMatch {
  return {
    home_label: "España",
    away_label: "Brasil",
    stage: "group",
    matchday: 1,
    kickoff_at: "2026-06-12T18:00:00Z",
    home_score: null,
    away_score: null,
    status: "scheduled",
    is_joker: false,
    ...over,
  };
}

// A day where Ana/Bea/Carlos/Dani all backed the home win (1-0) and Eva alone
// nailed the 0-2 away win. Herd caught; Eva is the contrarian + the clavada.
function herdFixture(): AnalysisInput {
  const m1 = match({
    id: "m1",
    status: "finished",
    home_score: 0,
    away_score: 2,
  });
  const preds: AnalysisPrediction[] = [
    { user_id: "a", match_id: "m1", home_pred: 1, away_pred: 0, points_awarded: 0 },
    { user_id: "b", match_id: "m1", home_pred: 1, away_pred: 0, points_awarded: 0 },
    { user_id: "c", match_id: "m1", home_pred: 1, away_pred: 0, points_awarded: 0 },
    { user_id: "d", match_id: "m1", home_pred: 2, away_pred: 1, points_awarded: 0 },
    { user_id: "e", match_id: "m1", home_pred: 0, away_pred: 2, points_awarded: 50 },
  ];
  return { reportDate: "2026-06-12", players, matches: [m1], predictions: preds };
}

test("empty input does not throw and yields no candidates", () => {
  const out = analyzePredictions({
    reportDate: "2026-06-12",
    players: [],
    matches: [],
    predictions: [],
  });
  assert.equal(out.candidateFindings.length, 0);
  assert.equal(out.matchesAnalyzed, 0);
  assert.ok(Array.isArray(out.headlineStats));
});

test("herd day: crack, clavada, herd-caught and contrarian are surfaced", () => {
  const out = analyzePredictions(herdFixture());
  assert.equal(out.matchesAnalyzed, 1);

  const byKey = new Map(out.candidateFindings.map((f) => [f.key, f]));

  // Eva was the only scorer → crack of the day.
  const crack = byKey.get("crack_del_dia");
  assert.ok(crack, "expected crack_del_dia");
  assert.deepEqual(crack!.subjects, ["Eva"]);
  assert.match(crack!.detail, /50 puntos/);

  // One exact scoreline → clavadas finding mentioning Eva.
  const clavadas = byKey.get("clavadas_del_dia");
  assert.ok(clavadas, "expected clavadas_del_dia");
  assert.ok(clavadas!.subjects.includes("Eva"));

  // 80% backed the home win but the away win happened → herd caught.
  const herd = out.candidateFindings.find((f) => f.key.startsWith("rebano_"));
  assert.ok(herd, "expected a rebaño finding");
  assert.match(herd!.detail, /80%/);

  // Eva was the contrarian who got the actual sign.
  const contrarian = out.candidateFindings.find((f) => f.key.startsWith("contrarian_"));
  assert.ok(contrarian, "expected a contrarian finding");
  assert.deepEqual(contrarian!.subjects, ["Eva"]);
});

test("output is deterministic for identical input", () => {
  const a = analyzePredictions(herdFixture());
  const b = analyzePredictions(herdFixture());
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("at most two findings per category (diversity cap)", () => {
  const out = analyzePredictions(herdFixture());
  const counts = new Map<string, number>();
  for (const f of out.candidateFindings) {
    counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
  }
  for (const [, n] of counts) assert.ok(n <= 2);
});

test("nobody-right match is flagged when no prediction hits the sign", () => {
  // All five predict a home win; the match ends in a draw.
  const m = match({ id: "mx", status: "finished", home_score: 1, away_score: 1 });
  const preds: AnalysisPrediction[] = players.map((p) => ({
    user_id: p.user_id,
    match_id: "mx",
    home_pred: 2,
    away_pred: 0,
    points_awarded: 0,
  }));
  const out = analyzePredictions({
    reportDate: "2026-06-12",
    players,
    matches: [m],
    predictions: preds,
  });
  assert.ok(out.candidateFindings.some((f) => f.key === "nadie_mx"));
});
