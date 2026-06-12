// Tests for the regularity classification. Run: npx vitest run lib/classifications

import { test } from "vitest";
import assert from "node:assert";

import { computeRegularity } from "./regularity";
import type { StandingRow } from "@/lib/types";

function standing(
  user_id: string,
  total_points: number,
  rank: number,
): StandingRow {
  return {
    user_id,
    display_name: user_id,
    avatar: null,
    total_points,
    exact_hits: 0,
    bonus_points: 0,
    meta_points: 0,
    adjustment_points: 0,
    rank,
  };
}

// ---------------------------------------------------------------------------
test("2 sign hits == 2 exact hits (one unit per event)", () => {
  const standings = [standing("a", 100, 1), standing("b", 100, 2)];
  const rows = computeRegularity({
    standings,
    predictions: [
      // a: two sign-only hits (lower points each)
      { user_id: "a", match_id: "m1", points_awarded: 20 },
      { user_id: "a", match_id: "m2", points_awarded: 20 },
      // b: two exact hits (higher points each) — still 2 hits
      { user_id: "b", match_id: "m1", points_awarded: 50 },
      { user_id: "b", match_id: "m2", points_awarded: 50 },
    ],
    matches: [
      { id: "m1", status: "finished" },
      { id: "m2", status: "finished" },
    ],
    bonusAnswers: [],
    roundAwards: [],
    createdAt: { a: "2024-01-01", b: "2024-01-02" },
  });
  const a = rows.find((r) => r.user_id === "a")!;
  const b = rows.find((r) => r.user_id === "b")!;
  assert.equal(a.hits, 2);
  assert.equal(b.hits, 2);
});

// ---------------------------------------------------------------------------
test("bonus and meta count one each; unfinished predictions don't count", () => {
  const standings = [standing("a", 100, 1)];
  const rows = computeRegularity({
    standings,
    predictions: [
      { user_id: "a", match_id: "fin", points_awarded: 20 },
      // unfinished match → ignored even though it has points
      { user_id: "a", match_id: "live", points_awarded: 50 },
      // finished but 0 points → ignored
      { user_id: "a", match_id: "fin2", points_awarded: 0 },
    ],
    matches: [
      { id: "fin", status: "finished" },
      { id: "fin2", status: "finished" },
      { id: "live", status: "live" },
    ],
    bonusAnswers: [
      { user_id: "a", points_awarded: 100 },
      { user_id: "a", points_awarded: 0 }, // not a hit
      { user_id: "a", points_awarded: null }, // not graded
    ],
    roundAwards: [{ user_id: "a" }, { user_id: "a" }],
    createdAt: { a: "2024-01-01" },
  });
  const a = rows[0];
  assert.equal(a.prediction_hits, 1);
  assert.equal(a.bonus_hits, 1);
  assert.equal(a.meta_hits, 2);
  assert.equal(a.hits, 4);
});

// ---------------------------------------------------------------------------
test("ordering and competition rank with tie-breaks", () => {
  const standings = [
    standing("a", 50, 1),
    standing("b", 80, 2),
    standing("c", 80, 3),
    standing("z", 0, 4),
  ];
  const rows = computeRegularity({
    standings,
    predictions: [
      // a: 3 hits; b & c: 2 hits each, c higher total wins... but same total
      { user_id: "a", match_id: "m1", points_awarded: 20 },
      { user_id: "a", match_id: "m2", points_awarded: 20 },
      { user_id: "a", match_id: "m3", points_awarded: 20 },
      { user_id: "b", match_id: "m1", points_awarded: 20 },
      { user_id: "b", match_id: "m2", points_awarded: 20 },
      { user_id: "c", match_id: "m1", points_awarded: 20 },
      { user_id: "c", match_id: "m2", points_awarded: 20 },
    ],
    matches: [
      { id: "m1", status: "finished" },
      { id: "m2", status: "finished" },
      { id: "m3", status: "finished" },
    ],
    bonusAnswers: [],
    roundAwards: [],
    createdAt: { a: "2024-01-01", b: "2024-01-03", c: "2024-01-02", z: "2024-01-04" },
  });
  // a:3 hits rank1; b&c:2 hits same total 80 → tie-break created_at: c(02) before b(03).
  assert.equal(rows[0].user_id, "a");
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[1].user_id, "c");
  assert.equal(rows[1].rank, 2);
  assert.equal(rows[2].user_id, "b");
  // b & c share (hits=2, total=80) → competition rank: same rank.
  assert.equal(rows[2].rank, 2);
  assert.equal(rows[3].user_id, "z");
  assert.equal(rows[3].hits, 0);
  assert.equal(rows[3].rank, 4);
});

// ---------------------------------------------------------------------------
test("one row per standings user even with zero hits", () => {
  const standings = [standing("a", 0, 1), standing("b", 0, 2)];
  const rows = computeRegularity({
    standings,
    predictions: [],
    matches: [],
    bonusAnswers: [],
    roundAwards: [],
    createdAt: { a: "2024-01-01", b: "2024-01-02" },
  });
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.hits === 0));
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[1].rank, 1); // both 0 hits, 0 total → share rank
});
