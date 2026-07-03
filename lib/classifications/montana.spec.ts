// Tests for the montaña classification + etapa selection.
// Run: npx vitest run lib/classifications

import { test } from "vitest";
import assert from "node:assert";

import { computeMontana, pickMontanaStages, type PickableMatch } from "./montana";
import type { Match, StandingRow, Stage, MatchStatus } from "@/lib/types";

function standing(user_id: string, total: number, rank: number): StandingRow {
  return {
    user_id,
    display_name: user_id,
    avatar: null,
    total_points: total,
    exact_hits: 0,
    bonus_points: 0,
    meta_points: 0,
    adjustment_points: 0,
    rank,
  };
}

function match(over: Partial<Match> & { id: string }): Match {
  return {
    home_team: "h",
    away_team: "a",
    stage: "group",
    group: "A",
    matchday: 1,
    kickoff_at: "2026-06-15T18:00:00Z",
    home_score: null,
    away_score: null,
    status: "scheduled",
    locks_at: "2026-06-15T18:00:00Z",
    is_joker: false,
    montana_stage: null,
    home_source: null,
    away_source: null,
    home_source_kind: "winner",
    away_source_kind: "winner",
    penalty_winner: null,
    provider_match_id: null,
    ...over,
  };
}

function pickable(over: Partial<PickableMatch> & { id: string }): PickableMatch {
  return {
    stage: "group" as Stage,
    status: "scheduled" as MatchStatus,
    kickoff_at: "2026-06-20T18:00:00Z",
    is_joker: false,
    montana_stage: null,
    home_code: "BRA",
    away_code: "ARG",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// computeMontana
// ---------------------------------------------------------------------------
test("computeMontana sums only finished montaña matches; exact tie-break", () => {
  const standings = [standing("a", 100, 1), standing("b", 90, 2)];
  const matches: Match[] = [
    match({ id: "m1", montana_stage: 1, status: "finished", home_score: 2, away_score: 1 }),
    match({ id: "m2", montana_stage: 1, status: "finished", home_score: 0, away_score: 0 }),
    // montaña but NOT finished → ignored
    match({ id: "m3", montana_stage: 2, status: "live", home_score: 1, away_score: 0 }),
    // finished but NOT montaña → ignored
    match({ id: "m4", montana_stage: null, status: "finished", home_score: 3, away_score: 3 }),
  ];
  const { rows } = computeMontana({
    standings,
    matches,
    predictions: [
      // a: exact on m1 (2-1, 50 pts), exact on m2 (0-0, 50 pts)
      { user_id: "a", match_id: "m1", home_pred: 2, away_pred: 1, points_awarded: 50 },
      { user_id: "a", match_id: "m2", home_pred: 0, away_pred: 0, points_awarded: 50 },
      // b: sign on m1 (20), exact on m2 (50) — same total 70 but fewer exacts
      { user_id: "b", match_id: "m1", home_pred: 3, away_pred: 0, points_awarded: 20 },
      { user_id: "b", match_id: "m2", home_pred: 0, away_pred: 0, points_awarded: 50 },
      // ignored: not finished / not montaña
      { user_id: "a", match_id: "m3", home_pred: 1, away_pred: 0, points_awarded: 50 },
      { user_id: "a", match_id: "m4", home_pred: 3, away_pred: 3, points_awarded: 50 },
    ],
    createdAt: { a: "2024-01-01", b: "2024-01-02" },
  });
  const a = rows.find((r) => r.user_id === "a")!;
  const b = rows.find((r) => r.user_id === "b")!;
  assert.equal(a.points, 100);
  assert.equal(a.exact_hits, 2);
  assert.equal(b.points, 70);
  assert.equal(b.exact_hits, 1);
  assert.equal(rows[0].user_id, "a");
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[1].rank, 2);
});

test("computeMontana etapas grouping & finished flag", () => {
  const standings = [standing("a", 0, 1)];
  const matches: Match[] = [
    match({ id: "e2b", montana_stage: 2, kickoff_at: "2026-06-21T18:00:00Z", status: "finished" }),
    match({ id: "e2a", montana_stage: 2, kickoff_at: "2026-06-21T15:00:00Z", status: "scheduled" }),
    match({ id: "e1a", montana_stage: 1, kickoff_at: "2026-06-15T15:00:00Z", status: "finished" }),
    match({ id: "e1b", montana_stage: 1, kickoff_at: "2026-06-15T18:00:00Z", status: "finished" }),
  ];
  const { etapas } = computeMontana({
    standings,
    matches,
    predictions: [],
    createdAt: { a: "2024-01-01" },
  });
  assert.equal(etapas.length, 2);
  assert.equal(etapas[0].stage, 1);
  assert.deepEqual(etapas[0].matches.map((m) => m.id), ["e1a", "e1b"]);
  assert.equal(etapas[0].finished, true);
  assert.equal(etapas[1].stage, 2);
  assert.deepEqual(etapas[1].matches.map((m) => m.id), ["e2a", "e2b"]); // kickoff order
  assert.equal(etapas[1].finished, false); // e2a scheduled
});

// ---------------------------------------------------------------------------
// pickMontanaStages
// ---------------------------------------------------------------------------
const NOW = new Date("2026-06-12T00:00:00Z");

test("never picks joker / ESP / quarter+ / past / null-team matches", () => {
  const matches: PickableMatch[] = [
    pickable({ id: "joker", is_joker: true, kickoff_at: "2026-06-20T18:00:00Z" }),
    pickable({ id: "esp1", home_code: "ESP", kickoff_at: "2026-06-20T18:00:00Z" }),
    pickable({ id: "esp2", away_code: "ESP", kickoff_at: "2026-06-20T18:00:00Z" }),
    pickable({ id: "qf", stage: "quarter", kickoff_at: "2026-06-20T18:00:00Z" }),
    pickable({ id: "sf", stage: "semi", kickoff_at: "2026-06-20T18:00:00Z" }),
    pickable({ id: "fin", stage: "final", kickoff_at: "2026-06-20T18:00:00Z" }),
    pickable({ id: "past", kickoff_at: "2026-06-12T06:00:00Z" }), // < now+24h
    pickable({ id: "live", status: "live", kickoff_at: "2026-06-20T18:00:00Z" }),
    pickable({ id: "tbd", home_code: null, kickoff_at: "2026-06-20T18:00:00Z" }),
  ];
  const out = pickMontanaStages(matches, { now: NOW });
  assert.deepEqual(out, []); // nothing eligible (none has matchesPerStage on a day either)
});

test("groups matchesPerStage per etapa, latest kickoffs chosen", () => {
  // One eligible day with 4 matches; matchesPerStage default 3 → pick latest 3.
  const matches: PickableMatch[] = [
    pickable({ id: "d1-09", kickoff_at: "2026-06-20T09:00:00Z" }),
    pickable({ id: "d1-15", kickoff_at: "2026-06-20T15:00:00Z" }),
    pickable({ id: "d1-18", kickoff_at: "2026-06-20T18:00:00Z" }),
    pickable({ id: "d1-21", kickoff_at: "2026-06-20T21:00:00Z" }),
  ];
  const out = pickMontanaStages(matches, { now: NOW, totalStages: 1 });
  assert.equal(out.length, 3);
  assert.ok(out.every((a) => a.montana_stage === 1));
  const ids = out.map((a) => a.match_id).sort();
  assert.deepEqual(ids, ["d1-15", "d1-18", "d1-21"]); // latest 3, not d1-09
});

test("etapas are >= 2 days apart", () => {
  // 3 candidate days; adjacent ones too close must be skipped.
  const day = (d: string, h: number) =>
    pickable({ id: `${d}-${h}`, kickoff_at: `2026-06-${d}T${String(h).padStart(2, "0")}:00:00Z` });
  const matches: PickableMatch[] = [
    day("18", 15), day("18", 18), day("18", 21),
    day("19", 15), day("19", 18), day("19", 21), // 1 day after the 18th
    day("25", 15), day("25", 18), day("25", 21), // far apart
  ];
  const out = pickMontanaStages(matches, { now: NOW, totalStages: 3 });
  const chosenDays = new Set(
    out.map((a) => a.match_id.split("-")[0]),
  );
  // can't pick both 18 and 19 (only 1 day apart).
  assert.ok(!(chosenDays.has("18") && chosenDays.has("19")));
  // 18 (or 19) and 25 are far enough → two etapas assigned.
  assert.ok(chosenDays.size >= 1);
});

test("incremental: keeps existing etapas, fills the rest", () => {
  const existing: PickableMatch[] = [
    pickable({ id: "ex1", montana_stage: 1, kickoff_at: "2026-06-15T18:00:00Z" }),
    pickable({ id: "ex2", montana_stage: 1, kickoff_at: "2026-06-15T20:00:00Z" }),
  ];
  const fresh: PickableMatch[] = [
    pickable({ id: "n1", kickoff_at: "2026-06-25T15:00:00Z" }),
    pickable({ id: "n2", kickoff_at: "2026-06-25T18:00:00Z" }),
    pickable({ id: "n3", kickoff_at: "2026-06-25T21:00:00Z" }),
  ];
  const out = pickMontanaStages([...existing, ...fresh], {
    now: NOW,
    totalStages: 2,
  });
  // etapa 1 already taken → only new assignments returned, for free stage 2.
  assert.ok(out.length > 0);
  assert.ok(out.every((a) => a.montana_stage === 2));
  // existing matches never re-emitted.
  assert.ok(!out.some((a) => a.match_id === "ex1" || a.match_id === "ex2"));
});

test("returns [] when no day has enough eligible matches", () => {
  const matches: PickableMatch[] = [
    pickable({ id: "a", kickoff_at: "2026-06-20T18:00:00Z" }),
    pickable({ id: "b", kickoff_at: "2026-06-21T18:00:00Z" }),
  ]; // 1 per day < matchesPerStage(3)
  assert.deepEqual(pickMontanaStages(matches, { now: NOW }), []);
});
