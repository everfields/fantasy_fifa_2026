// Tests for the dynamic peloton grouping. Run: npx vitest run lib/classifications

import { test } from "vitest";
import assert from "node:assert";

import { groupPeloton } from "./peloton";
import type { StandingRow, PelotonGroupKey } from "@/lib/types";

let seq = 0;
function row(total: number, rank: number): StandingRow {
  seq += 1;
  return {
    user_id: `u${seq}`,
    display_name: `P${seq}`,
    avatar: null,
    total_points: total,
    exact_hits: 0,
    bonus_points: 0,
    meta_points: 0,
    adjustment_points: 0,
    rank,
  };
}

/** Build standings from totals (rank asc = order). */
function fromTotals(totals: number[]): StandingRow[] {
  return totals.map((t, i) => row(t, i + 1));
}

function sizes(groups: { key: PelotonGroupKey; riders: StandingRow[] }[]) {
  return groups.map((g) => ({ key: g.key, n: g.riders.length }));
}

const CFG = { signPoints: 20, exactPoints: 50 };

// ---------------------------------------------------------------------------
// Canonical prod snapshot (2026-06-12) — MUST match exactly.
// totals (rank asc): [100,100,100,70,50×5,20×8]; sign=20, exact=50.
// Expected: cabeza = 3×100, perseguidores = 70, peloton = 13 (50s absorbed by
// consolidation), NO fuga, NO rezagados.
// ---------------------------------------------------------------------------
test("canonical prod snapshot 2026-06-12", () => {
  const totals = [
    100, 100, 100, 70, 50, 50, 50, 50, 50, 20, 20, 20, 20, 20, 20, 20, 20,
  ];
  assert.equal(totals.length, 17);
  const groups = groupPeloton(fromTotals(totals), CFG);

  assert.deepEqual(sizes(groups), [
    { key: "cabeza", n: 3 },
    { key: "perseguidores", n: 1 },
    { key: "peloton", n: 13 },
  ]);

  const cabeza = groups[0];
  assert.deepEqual(
    cabeza.riders.map((r) => r.total_points),
    [100, 100, 100],
  );
  assert.equal(cabeza.gapToPrev, 0);
  assert.equal(cabeza.gapToLeader, 0);

  const persec = groups[1];
  assert.equal(persec.riders[0].total_points, 70);
  assert.equal(persec.gapToPrev, 30); // 100 (cabeza worst) − 70
  assert.equal(persec.gapToLeader, 30);

  const pel = groups[2];
  assert.equal(pel.riders[0].total_points, 50);
  assert.equal(pel.gapToPrev, 20); // 70 − 50
  assert.equal(pel.gapToLeader, 50);
});

// ---------------------------------------------------------------------------
test("clear solo fuga (+60 leader alone)", () => {
  // leader at 110, then a bunch at 50/50/50/45/45/40/40/40.
  const totals = [110, 50, 50, 50, 45, 45, 40, 40, 40];
  const groups = groupPeloton(fromTotals(totals), CFG);
  // leader alone, gap 60 >= Tfuga (max(50, 2*T)). T = max(20, ceil(0.1*70))=20.
  // Tfuga = max(50,40)=50. 110−50=60 >= 50 → fuga.
  assert.equal(groups[0].key, "fuga");
  assert.equal(groups[0].riders.length, 1);
  assert.equal(groups[0].riders[0].total_points, 110);
  assert.equal(groups[groups.length - 1].key, "peloton");
});

// ---------------------------------------------------------------------------
test("rezagados: detached tail", () => {
  // bunch up front, a couple dropped way behind.
  const totals = [80, 78, 76, 75, 74, 72, 70, 20, 10];
  const groups = groupPeloton(fromTotals(totals), CFG);
  const keys = groups.map((g) => g.key);
  assert.ok(keys.includes("peloton"));
  assert.ok(keys.includes("rezagados"));
  const rez = groups.find((g) => g.key === "rezagados")!;
  assert.deepEqual(
    rez.riders.map((r) => r.total_points),
    [20, 10],
  );
});

// ---------------------------------------------------------------------------
test("all tied → single peloton", () => {
  const groups = groupPeloton(fromTotals([30, 30, 30, 30, 30, 30]), CFG);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, "peloton");
  assert.equal(groups[0].riders.length, 6);
  assert.equal(groups[0].gapToPrev, 0);
  assert.equal(groups[0].gapToLeader, 0);
});

// ---------------------------------------------------------------------------
test("N <= 4 → single peloton", () => {
  const groups = groupPeloton(fromTotals([100, 50, 20, 0]), CFG);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, "peloton");
  assert.equal(groups[0].riders.length, 4);
});

// ---------------------------------------------------------------------------
test("empty list → []", () => {
  assert.deepEqual(groupPeloton([], CFG), []);
});

// ---------------------------------------------------------------------------
test("scaled gaps: large range grows T", () => {
  // spread 1000 → T = max(20, ceil(100)) = 100. Small 30-pt gaps don't cut.
  const totals = [1000, 970, 950, 500, 480, 460, 50, 30, 10];
  const groups = groupPeloton(fromTotals(totals), CFG);
  // 1000/970/950 within 30 < 100 → one cluster; 500/480/460 one cluster;
  // 50/30/10 one cluster. cuts at 950→500 (450) and 460→50 (410).
  // Largest tie (all size 3) → most rearward = the 50/30/10 cluster.
  // N=9 → maxAhead=max(3,round(2.7))=3; ridersAhead 3+3=6>3 → absorb the
  // 500-cluster into the pelotón. cabeza = the 1000-cluster stays ahead.
  const pel = groups.find((g) => g.key === "peloton")!;
  assert.deepEqual(
    pel.riders.map((r) => r.total_points).sort((a, b) => b - a),
    [500, 480, 460, 50, 30, 10],
  );
  // The 1000-cluster (size 3) is far ahead of the pelotón (gap 450 >= Tfuga
  // = max(50, 2*100)=200) → it's a fuga, not just cabeza.
  assert.equal(groups[0].key, "fuga");
  assert.deepEqual(
    groups[0].riders.map((r) => r.total_points),
    [1000, 970, 950],
  );
});

// ---------------------------------------------------------------------------
test("default opts fall back to 20/50", () => {
  // No opts passed — should behave identically to CFG on the canonical case.
  const totals = [
    100, 100, 100, 70, 50, 50, 50, 50, 50, 20, 20, 20, 20, 20, 20, 20, 20,
  ];
  const a = groupPeloton(fromTotals(totals));
  const b = groupPeloton(fromTotals(totals), CFG);
  assert.deepEqual(sizes(a), sizes(b));
});
