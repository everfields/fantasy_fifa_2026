// Tests for maillot assignment. Run: npx vitest run lib/classifications

import { test } from "vitest";
import assert from "node:assert";

import { assignMaillots, sortGeneral } from "./maillots";
import { MAILLOT_ARCOIRIS_EMAIL, MAILLOT_BLANCO_EMAILS } from "./config";
import type {
  StandingRow,
  RegularityRow,
  MontanaRow,
} from "@/lib/types";

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
function reg(user_id: string, hits: number, rank: number): RegularityRow {
  return {
    user_id,
    display_name: user_id,
    avatar: null,
    hits,
    prediction_hits: hits,
    bonus_hits: 0,
    meta_hits: 0,
    rank,
  };
}
function mont(user_id: string, points: number, rank: number): MontanaRow {
  return {
    user_id,
    display_name: user_id,
    avatar: null,
    points,
    exact_hits: 0,
    rank,
  };
}

// ---------------------------------------------------------------------------
test("each maillot to its leader", () => {
  const out = assignMaillots({
    standings: [standing("a", 100, 1), standing("b", 80, 2), standing("c", 0, 3)],
    regularity: [reg("b", 5, 1), reg("a", 4, 2), reg("c", 0, 3)],
    montana: [mont("c", 30, 1), mont("a", 0, 2)],
    emailByUserId: { a: "a@x.com", b: "b@x.com", c: "c@x.com" },
    createdAt: { a: "2024-01-01", b: "2024-01-02", c: "2024-01-03" },
  });
  assert.ok(out["a"].includes("amarillo"));
  assert.ok(out["b"].includes("verde"));
  assert.ok(out["c"].includes("lunares"));
  assert.ok(out["c"].includes("rojo")); // last, leader has points
});

// ---------------------------------------------------------------------------
test("accumulation: leader who also leads regularity wears amarillo + verde", () => {
  const out = assignMaillots({
    standings: [standing("a", 100, 1), standing("b", 80, 2)],
    regularity: [reg("a", 5, 1), reg("b", 3, 2)],
    montana: [mont("a", 50, 1)],
    emailByUserId: { a: "a@x.com", b: "b@x.com" },
    createdAt: { a: "2024-01-01", b: "2024-01-02" },
  });
  assert.deepEqual(out["a"].sort(), ["amarillo", "lunares", "verde"]);
});

// ---------------------------------------------------------------------------
test("arcoiris is fixed by email, regardless of position", () => {
  const out = assignMaillots({
    standings: [standing("a", 100, 1), standing("jm", 0, 2)],
    regularity: [reg("a", 5, 1), reg("jm", 0, 2)],
    montana: [mont("a", 10, 1)],
    emailByUserId: { a: "a@x.com", jm: MAILLOT_ARCOIRIS_EMAIL },
    createdAt: { a: "2024-01-01", jm: "2024-01-02" },
  });
  assert.ok(out["jm"].includes("arcoiris"));
});

// ---------------------------------------------------------------------------
test("blanco to best-placed roster member, even at 0 points", () => {
  // roster member 'young' is last with 0 points; still gets blanco.
  const out = assignMaillots({
    standings: [
      standing("a", 100, 1),
      standing("other", 50, 2),
      standing("young", 0, 3),
    ],
    regularity: [reg("a", 5, 1)],
    montana: [mont("a", 10, 1)],
    emailByUserId: {
      a: "a@x.com",
      other: "other@x.com",
      young: MAILLOT_BLANCO_EMAILS[0],
    },
    createdAt: { a: "2024-01-01", other: "2024-01-02", young: "2024-01-03" },
  });
  assert.ok(out["young"].includes("blanco"));
});

test("blanco picks the best-placed among several roster members", () => {
  const out = assignMaillots({
    standings: [
      standing("y2", 90, 1),
      standing("a", 80, 2),
      standing("y1", 70, 3),
    ],
    regularity: [reg("y2", 5, 1)],
    montana: [mont("y2", 10, 1)],
    emailByUserId: {
      y2: MAILLOT_BLANCO_EMAILS[1],
      a: "a@x.com",
      y1: MAILLOT_BLANCO_EMAILS[0],
    },
    createdAt: { y2: "2024-01-01", a: "2024-01-02", y1: "2024-01-03" },
  });
  assert.ok(out["y2"].includes("blanco"));
  assert.ok(!out["y1"] || !out["y1"].includes("blanco"));
});

// ---------------------------------------------------------------------------
test("rojo with tie at the tail → largest created_at", () => {
  const out = assignMaillots({
    standings: [
      standing("a", 100, 1),
      standing("x", 0, 2),
      standing("y", 0, 2),
    ],
    regularity: [reg("a", 5, 1)],
    montana: [mont("a", 10, 1)],
    emailByUserId: { a: "a@x.com", x: "x@x.com", y: "y@x.com" },
    createdAt: { a: "2024-01-01", x: "2024-01-02", y: "2024-01-09" },
  });
  // x and y tied at 0; y has the larger created_at → y is farolillo rojo.
  assert.ok(out["y"].includes("rojo"));
  assert.ok(!out["x"] || !out["x"].includes("rojo"));
});

// ---------------------------------------------------------------------------
test("no amarillo/rojo when nobody has points; arcoiris still given", () => {
  const out = assignMaillots({
    standings: [standing("a", 0, 1), standing("jm", 0, 2)],
    regularity: [reg("a", 0, 1)],
    montana: [mont("a", 0, 1)],
    emailByUserId: { a: "a@x.com", jm: MAILLOT_ARCOIRIS_EMAIL },
    createdAt: { a: "2024-01-01", jm: "2024-01-02" },
  });
  assert.ok(!out["a"] || !out["a"].includes("amarillo"));
  assert.ok(Object.values(out).every((ks) => !ks.includes("rojo")));
  assert.ok(out["jm"].includes("arcoiris"));
});

// ---------------------------------------------------------------------------
test("sortGeneral: rank ties order by created_at — amarillo first, rojo last", () => {
  const standings = [
    standing("nando", 100, 1),
    standing("alvaro", 100, 1),
    standing("juan", 100, 1),
  ];
  const createdAt = {
    nando: "2024-01-03",
    alvaro: "2024-01-01",
    juan: "2024-01-05",
  };
  const sorted = sortGeneral(standings, createdAt);
  assert.deepEqual(
    sorted.map((s) => s.user_id),
    ["alvaro", "nando", "juan"],
  );
  const out = assignMaillots({
    standings,
    regularity: [],
    montana: [],
    emailByUserId: {},
    createdAt,
  });
  // The display order agrees with the jerseys: first row = amarillo, last = rojo.
  assert.ok(out[sorted[0].user_id].includes("amarillo"));
  assert.ok(out[sorted[sorted.length - 1].user_id].includes("rojo"));
});

// ---------------------------------------------------------------------------
test("no rojo when only one rider", () => {
  const out = assignMaillots({
    standings: [standing("a", 100, 1)],
    regularity: [reg("a", 5, 1)],
    montana: [mont("a", 10, 1)],
    emailByUserId: { a: "a@x.com" },
    createdAt: { a: "2024-01-01" },
  });
  assert.ok(!out["a"].includes("rojo"));
  assert.ok(out["a"].includes("amarillo"));
});
