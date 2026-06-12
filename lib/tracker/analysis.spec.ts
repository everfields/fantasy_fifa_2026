// Tests for the PURE "Luis de la Tracker" analysis engine.
// Run with: npm test (vitest).
import { test } from "vitest";
import assert from "node:assert";

import { analyzePredictions, jornadaOf } from "./analysis";
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
    // 21:00 in Spain on the 11th — "anoche" for the June 12 jornada.
    kickoff_at: "2026-06-11T19:00:00Z",
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

test("jornada = Spanish pool day: anoche + madrugada, cut at noon Madrid", () => {
  // 21:00 Spain on the 11th and 04:00 Spain on the 12th → same jornada (06-12).
  assert.equal(jornadaOf("2026-06-11T19:00:00Z"), "2026-06-12");
  assert.equal(jornadaOf("2026-06-12T02:00:00Z"), "2026-06-12");
  // 21:00 Spain on the 12th already belongs to the next morning's report.
  assert.equal(jornadaOf("2026-06-12T19:00:00Z"), "2026-06-13");

  // Both halves of the jornada are analyzed together.
  const evening = match({
    id: "ev",
    status: "finished",
    kickoff_at: "2026-06-11T19:00:00Z",
    home_score: 2,
    away_score: 0,
  });
  const madrugada = match({
    id: "ma",
    status: "finished",
    kickoff_at: "2026-06-12T02:00:00Z",
    home_score: 2,
    away_score: 1,
  });
  const out = analyzePredictions({
    reportDate: "2026-06-12",
    players,
    matches: [evening, madrugada],
    predictions: [
      { user_id: "a", match_id: "ev", home_pred: 2, away_pred: 0, points_awarded: 50 },
      { user_id: "a", match_id: "ma", home_pred: 2, away_pred: 1, points_awarded: 50 },
    ],
  });
  assert.equal(out.matchesAnalyzed, 2);
});

test("SPOILER GUARD: predictions on unfinished matches never reach any finding", () => {
  // Eva has 6 future predictions, all the same exaggerated 5-4 scoreline.
  // Without the guard, the profile findings (artillero / corta-pega / etc.)
  // would publish her pending strategy. None of them may surface.
  const fixture = herdFixture();
  const future = Array.from({ length: 6 }, (_, i) =>
    match({ id: `f${i}`, status: "scheduled", kickoff_at: "2026-07-01T18:00:00Z" }),
  );
  const futurePreds: AnalysisPrediction[] = future.map((m) => ({
    user_id: "e",
    match_id: m.id,
    home_pred: 5,
    away_pred: 4,
    points_awarded: null,
  }));
  const out = analyzePredictions({
    ...fixture,
    matches: [...fixture.matches, ...future],
    predictions: [...fixture.predictions, ...futurePreds],
  });
  const baseline = analyzePredictions(fixture);
  // Identical output to the run without any future predictions…
  assert.equal(
    JSON.stringify(out.candidateFindings),
    JSON.stringify(baseline.candidateFindings),
  );
  // …and no trace of the pending scoreline anywhere in the report.
  assert.ok(!JSON.stringify(out).includes("5-4"));
});

test("ties at the top share the crown: all co-leaders are named", () => {
  // Ana, Bea and Carlos all nail the exact score; Dani misses.
  const m = match({ id: "mt", status: "finished", home_score: 2, away_score: 0 });
  const preds: AnalysisPrediction[] = [
    { user_id: "a", match_id: "mt", home_pred: 2, away_pred: 0, points_awarded: 50 },
    { user_id: "b", match_id: "mt", home_pred: 2, away_pred: 0, points_awarded: 50 },
    { user_id: "c", match_id: "mt", home_pred: 2, away_pred: 0, points_awarded: 50 },
    { user_id: "d", match_id: "mt", home_pred: 0, away_pred: 1, points_awarded: 0 },
  ];
  const out = analyzePredictions({
    reportDate: "2026-06-12",
    players,
    matches: [m],
    predictions: preds,
  });
  const byKey = new Map(out.candidateFindings.map((f) => [f.key, f]));

  const crack = byKey.get("crack_del_dia");
  assert.ok(crack);
  assert.deepEqual(crack!.subjects.sort(), ["Ana", "Bea", "Carlos"]);
  assert.match(crack!.detail, /empatan/);

  const lider = byKey.get("lider_porra");
  assert.ok(lider);
  assert.deepEqual(lider!.subjects.sort(), ["Ana", "Bea", "Carlos"]);

  const best = out.headlineStats.find((s) => s.label.startsWith("Mejor"));
  assert.ok(best);
  assert.equal(best!.label, "Mejores del día");
  assert.match(best!.value, /Ana, Bea, Carlos/);
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
