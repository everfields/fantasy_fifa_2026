// ============================================================================
// Spec for buildEtapaTimeline — the pure race-replay timeline behind
// /standings/etapa. One synthetic 6-rider, 3-jornada race exercises the whole
// contract: ledger attribution per jornada, per-stage classifications,
// overtake diffs, scene layout and the coherence guarantee (final stage ==
// current standings).
// ============================================================================

import { test } from "vitest";
import assert from "node:assert";

import {
  buildEtapaTimeline,
  kitIndex,
  KIT_PALETTE_SIZE,
  MAILLOT_PRIORITY,
} from "./etapa";
import { MAILLOT_ARCOIRIS_EMAIL } from "./config";
import type {
  EtapaRider,
  MaillotKey,
  Match,
  Prediction,
  StandingRow,
} from "@/lib/types";

// --- fixtures ---------------------------------------------------------------

const RIDERS = [
  ["u-ana", "Ana"],
  ["u-bea", "Bea"],
  ["u-carl", "Carl"],
  ["u-dani", "Dani"],
  ["u-eva", "Eva"],
  ["u-fran", "Fran"],
] as const;

const roster: StandingRow[] = RIDERS.map(([user_id, display_name]) => ({
  user_id,
  display_name,
  avatar: null,
  total_points: 0,
  exact_hits: 0,
  bonus_points: 0,
  meta_points: 0,
  adjustment_points: 0,
  rank: 0,
}));

// Sign-up order = roster order (drives tie-breaks: earliest wins the top spot).
const createdAt: Record<string, string> = Object.fromEntries(
  RIDERS.map(([id], i) => [id, `2026-01-0${i + 1}T00:00:00Z`]),
);

function mkMatch(
  id: string,
  kickoff_at: string,
  home_score: number | null,
  away_score: number | null,
  over: Partial<Match> = {},
): Match {
  return {
    id,
    home_team: `${id}h`,
    away_team: `${id}a`,
    stage: "group",
    group: "A",
    matchday: 1,
    kickoff_at,
    home_score,
    away_score,
    status: "finished",
    locks_at: kickoff_at,
    is_joker: false,
    montana_stage: null,
    provider_match_id: null,
    home_source: null,
    away_source: null,
    home_source_kind: "winner",
    away_source_kind: "winner",
    penalty_winner: null,
    ...over,
  };
}

// Jornadas: j1 = 06-11 (m1, m2) · j2 = 06-12 (m3) · j3 = 06-14 (m5 montaña,
// m6 jóker). m4 is scheduled → creates NO stage.
const matches: Match[] = [
  mkMatch("m1", "2026-06-11T16:00:00Z", 2, 1),
  mkMatch("m2", "2026-06-11T19:00:00Z", 0, 0),
  mkMatch("m3", "2026-06-12T16:00:00Z", 1, 0),
  mkMatch("m4", "2026-06-13T16:00:00Z", null, null, { status: "scheduled" }),
  mkMatch("m5", "2026-06-14T16:00:00Z", 1, 1, {
    matchday: 2,
    montana_stage: 1,
  }),
  mkMatch("m6", "2026-06-14T19:00:00Z", 3, 0, { matchday: 2, is_joker: true }),
];

const teams = [
  { id: "m5h", code: "EEE" },
  { id: "m5a", code: "FFF" },
];

type LedgerPred = Pick<
  Prediction,
  "user_id" | "match_id" | "home_pred" | "away_pred" | "points_awarded"
>;
const mkPred = (
  user_id: string,
  match_id: string,
  home_pred: number,
  away_pred: number,
  points_awarded: number,
): LedgerPred => ({ user_id, match_id, home_pred, away_pred, points_awarded });

const predictions: LedgerPred[] = [
  // j1 — ana doubles exact (100), carl 30, bea/dani sign hits (20).
  mkPred("u-ana", "m1", 2, 1, 50),
  mkPred("u-ana", "m2", 0, 0, 50),
  mkPred("u-bea", "m1", 1, 0, 20),
  mkPred("u-carl", "m1", 3, 2, 30),
  mkPred("u-dani", "m2", 1, 1, 20),
  // j2 — bea nails the exact.
  mkPred("u-bea", "m3", 1, 0, 50),
  // j3 — dani exact on the montaña match; fran sign on the ×3 jóker.
  mkPred("u-dani", "m5", 1, 1, 50),
  mkPred("u-fran", "m6", 1, 0, 60),
];

// group-md1 completes at j2 (m3 is its last match) → ana's award lands there.
const roundAwards = [
  {
    round_key: "group-md1",
    user_id: "u-ana",
    points: 100,
    round_points: 100,
    created_at: "2026-06-12T22:00:00Z",
  },
];

// q1 locks on j2 → eva's 100 bonus points appear at stage 2, not stage 1.
const bonusQuestions = [{ id: "q1", locks_at: "2026-06-12T10:00:00Z" }];
const bonusAnswers = [
  { user_id: "u-eva", question_id: "q1", points_awarded: 100 },
];

// Granted AFTER the last jornada → must fold into the final stage.
const adjustments = [
  { user_id: "u-carl", points: 5, created_at: "2026-06-20T09:00:00Z" },
];

const emailByUserId = { "u-eva": MAILLOT_ARCOIRIS_EMAIL };

function build(over: Partial<Parameters<typeof buildEtapaTimeline>[0]> = {}) {
  return buildEtapaTimeline({
    standings: roster,
    matches,
    teams,
    predictions,
    roundAwards,
    bonusAnswers,
    bonusQuestions,
    adjustments,
    emailByUserId,
    createdAt,
    ...over,
  });
}

const positions = (stage: { riders: { user_id: string; position: number }[] }) =>
  stage.riders.map((r) => r.user_id);

const rider = (stage: { riders: EtapaRider[] }, id: string): EtapaRider => {
  const r = stage.riders.find((x) => x.user_id === id);
  assert.ok(r, `rider ${id} missing`);
  return r!;
};

// --- stages & attribution ----------------------------------------------------

test("one stage per jornada with finished matches, chronological", () => {
  const { stages } = build();
  assert.deepStrictEqual(
    stages.map((s) => s.key),
    ["2026-06-11", "2026-06-12", "2026-06-14"],
  );
  assert.deepStrictEqual(stages.map((s) => s.index), [1, 2, 3]);
  // m4 (scheduled) never creates a stage.
});

test("prediction points accumulate at the kickoff jornada", () => {
  const { stages } = build();
  assert.strictEqual(rider(stages[0], "u-ana").total_points, 100);
  assert.strictEqual(rider(stages[0], "u-carl").total_points, 30);
  assert.strictEqual(rider(stages[1], "u-bea").total_points, 70);
});

test("round awards land on the jornada the round completes", () => {
  const { stages } = build();
  // group-md1 closes at j2 (m3), NOT at j1 nor at the award's created_at bucket.
  assert.strictEqual(rider(stages[0], "u-ana").total_points, 100);
  assert.strictEqual(rider(stages[1], "u-ana").total_points, 200);
});

test("bonus points land on the question's lock jornada", () => {
  const { stages } = build();
  assert.strictEqual(rider(stages[0], "u-eva").total_points, 0);
  assert.strictEqual(rider(stages[1], "u-eva").total_points, 100);
});

test("late adjustments fold into the final stage (coherence)", () => {
  const { stages } = build();
  assert.strictEqual(rider(stages[1], "u-carl").total_points, 30);
  assert.strictEqual(rider(stages[2], "u-carl").total_points, 35);
});

test("final stage equals the current standings (order + totals)", () => {
  const { stages } = build();
  const last = stages[stages.length - 1];
  assert.deepStrictEqual(positions(last), [
    "u-ana",
    "u-eva",
    "u-bea",
    "u-dani",
    "u-fran",
    "u-carl",
  ]);
  assert.deepStrictEqual(
    last.riders.map((r) => r.total_points),
    [200, 100, 70, 70, 60, 35],
  );
  // bea/dani full tie (70 pts, 1 exact, 0 bonus) → created_at orders them.
});

// --- overtakes ----------------------------------------------------------------

test("stage 1 is a parade: no overtakes", () => {
  const { stages } = build();
  assert.deepStrictEqual(stages[0].overtakes, []);
});

test("overtakes diff positions vs the previous stage", () => {
  const { stages } = build();
  assert.deepStrictEqual(stages[1].overtakes, [
    { user_id: "u-eva", display_name: "Eva", from: 5, to: 2, gained: 3 },
  ]);
});

test("overtakes order: smallest gain first, ties by target position", () => {
  const { stages } = build();
  assert.deepStrictEqual(
    stages[2].overtakes.map((o) => [o.user_id, o.from, o.to]),
    [
      ["u-dani", 5, 4],
      ["u-fran", 6, 5],
    ],
  );
});

// --- casting: poses, jerseys, accessories --------------------------------------

test("leader rides the crono; rezagados stick the tongue out", () => {
  const { stages } = build();
  assert.strictEqual(rider(stages[2], "u-ana").pose, "crono");
  assert.strictEqual(rider(stages[2], "u-ana").group, "fuga");
  assert.strictEqual(rider(stages[2], "u-carl").pose, "lengua");
  assert.strictEqual(rider(stages[2], "u-carl").group, "rezagados");
  // stage 1: the two zero-point riders trail as rezagados.
  assert.strictEqual(rider(stages[0], "u-eva").pose, "lengua");
  assert.strictEqual(rider(stages[0], "u-fran").pose, "lengua");
});

test("astons wear the F1 helmet; the last rider carries the lantern", () => {
  const { stages } = build();
  const last = stages[2];
  assert.deepStrictEqual(
    last.riders.filter((r) => r.aston).map((r) => r.user_id),
    ["u-dani", "u-fran"],
  );
  assert.strictEqual(rider(last, "u-carl").farolillo, true);
  assert.ok(rider(last, "u-carl").maillots.includes("rojo"));
  // stage 1 farolillo: tail tied at 0 → LARGEST created_at (fran).
  assert.strictEqual(rider(stages[0], "u-fran").farolillo, true);
  assert.strictEqual(rider(stages[0], "u-eva").farolillo, false);
});

test("jersey priority: classification jerseys always beat the azul", () => {
  const idx = (k: MaillotKey) => MAILLOT_PRIORITY.indexOf(k);
  const leaders: MaillotKey[] = ["amarillo", "arcoiris", "lunares", "verde", "blanco"];
  for (const k of leaders) {
    assert.ok(idx(k) !== -1 && idx(k) < idx("azul"), `${k} must rank over azul`);
  }
});

test("jerseys: priority pick per stage + stable default kit", () => {
  const { stages } = build();
  assert.strictEqual(rider(stages[2], "u-ana").jersey, "amarillo");
  assert.strictEqual(rider(stages[2], "u-eva").jersey, "arcoiris");
  assert.strictEqual(rider(stages[2], "u-dani").jersey, "lunares"); // montaña leader
  assert.strictEqual(rider(stages[2], "u-carl").jersey, "rojo");
  const bea = rider(stages[2], "u-bea");
  assert.strictEqual(bea.jersey, null);
  assert.strictEqual(bea.kit, kitIndex("u-bea"));
  assert.ok(bea.kit >= 0 && bea.kit < KIT_PALETTE_SIZE);
});

// --- scene layout ----------------------------------------------------------------

test("layout: x strictly decreases with position, within the road, lanes 0..2", () => {
  const { stages } = build();
  for (const s of stages) {
    for (let i = 0; i < s.riders.length; i++) {
      const r = s.riders[i];
      assert.strictEqual(r.position, i + 1);
      assert.ok(r.x >= 0 && r.x <= 100, `x out of road: ${r.x}`);
      assert.ok(r.lane >= 0 && r.lane <= 2);
      if (i > 0) {
        assert.ok(
          r.x < s.riders[i - 1].x,
          `x not decreasing at position ${r.position} of stage ${s.index}`,
        );
      }
    }
  }
});

test("groups travel front→back with sizes and gaps", () => {
  const { stages } = build();
  assert.deepStrictEqual(
    stages[2].groups.map((g) => [g.key, g.size]),
    [
      ["fuga", 1],
      ["perseguidores", 1],
      ["peloton", 3],
      ["rezagados", 1],
    ],
  );
  assert.strictEqual(stages[2].groups[0].gapToLeader, 0);
});

// --- ticker -------------------------------------------------------------------

test("stage matches: kickoff order, FIFA-code labels, jóker/montaña flags", () => {
  const { stages } = build();
  assert.deepStrictEqual(
    stages[2].matches.map((m) => [m.label, m.is_joker, m.montana]),
    [
      ["EEE 1-1 FFF", false, true],
      ["TBD 3-0 TBD", true, false],
    ],
  );
  assert.strictEqual(stages[2].montana, true);
  assert.strictEqual(stages[0].montana, false);
});

test("highlights: top point gains of the stage, ties by exacts then name", () => {
  const { stages } = build();
  assert.deepStrictEqual(
    stages[1].highlights.map((h) => [h.user_id, h.points]),
    [
      ["u-ana", 100], // meta volante
      ["u-eva", 100], // bonus (name tie-break after equal exacts)
      ["u-bea", 50],
    ],
  );
  assert.deepStrictEqual(
    stages[2].highlights.map((h) => [h.user_id, h.points, h.exacts]),
    [
      ["u-fran", 60, 0],
      ["u-dani", 50, 1],
      ["u-carl", 5, 0],
    ],
  );
});

// --- edge cases -----------------------------------------------------------------

test("no finished matches → empty timeline", () => {
  const scheduled = matches.map((m) => ({
    ...m,
    status: "scheduled" as const,
    home_score: null,
    away_score: null,
  }));
  assert.deepStrictEqual(build({ matches: scheduled }).stages, []);
});

test("empty roster → empty timeline", () => {
  assert.deepStrictEqual(build({ standings: [] }).stages, []);
});
