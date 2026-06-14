// Tests for maillot assignment. Run: npx vitest run lib/classifications

import { test } from "vitest";
import assert from "node:assert";

import { assignAstons, assignMaillots, sortGeneral } from "./maillots";
import {
  MAILLOT_ARCOIRIS_EMAIL,
  MAILLOT_BLANCO_EMAILS,
  MAILLOT_EXTREMADURA_EMAILS,
  MAILLOT_MONARS_EMAILS,
} from "./config";
import type {
  StandingRow,
  RegularityRow,
  MontanaRow,
  RoundAward,
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

test("extremadura + monars to best-placed roster member; independent of blanco", () => {
  const out = assignMaillots({
    standings: [
      standing("ext", 90, 1),
      standing("a", 80, 2),
      standing("mon", 70, 3),
    ],
    regularity: [reg("ext", 5, 1)],
    montana: [mont("ext", 10, 1)],
    emailByUserId: {
      ext: MAILLOT_EXTREMADURA_EMAILS[0],
      a: "a@x.com",
      mon: MAILLOT_MONARS_EMAILS[0],
    },
    createdAt: { ext: "2024-01-01", a: "2024-01-02", mon: "2024-01-03" },
  });
  assert.ok(out["ext"].includes("extremadura"));
  assert.ok(out["mon"].includes("monars"));
  // The Extremadura roster includes JM, who can also wear other jerseys; the
  // pick is purely the best-placed roster member in the general.
  assert.ok(!out["a"] || !out["a"].includes("extremadura"));
});

test("extremadura/monars: none when no roster member is present", () => {
  const out = assignMaillots({
    standings: [standing("a", 100, 1), standing("b", 80, 2)],
    regularity: [reg("a", 5, 1)],
    montana: [mont("a", 10, 1)],
    emailByUserId: { a: "a@x.com", b: "b@x.com" },
    createdAt: { a: "2024-01-01", b: "2024-01-02" },
  });
  assert.ok(
    Object.values(out).every(
      (ks) => !ks.includes("extremadura") && !ks.includes("monars"),
    ),
  );
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
function award(
  user_id: string,
  round_key: RoundAward["round_key"],
  round_points: number,
  points = 100,
): RoundAward {
  return {
    id: `${round_key}-${user_id}`,
    round_key,
    user_id,
    points,
    round_points,
    created_at: "2026-06-12",
  };
}

test("azul to every round winner, ties included; placed riders get none", () => {
  const out = assignMaillots({
    standings: [standing("a", 100, 1), standing("b", 80, 2), standing("c", 60, 3)],
    regularity: [reg("a", 5, 1)],
    montana: [mont("a", 10, 1)],
    emailByUserId: {},
    createdAt: { a: "2024-01-01", b: "2024-01-02", c: "2024-01-03" },
    roundAwards: [
      // md1: 'b' wins, 'a' second (still gets a prize, but no azul)
      award("b", "group-md1", 120),
      award("a", "group-md1", 90, 50),
      // md2: full tie at the top → both 'a' and 'c' wear azul
      award("a", "group-md2", 70, 75),
      award("c", "group-md2", 70, 75),
    ],
  });
  assert.ok(out["b"].includes("azul"));
  assert.ok(out["a"].includes("azul"));
  assert.ok(out["c"].includes("azul"));
});

test("no azul without round awards", () => {
  const out = assignMaillots({
    standings: [standing("a", 100, 1), standing("b", 80, 2)],
    regularity: [reg("a", 5, 1)],
    montana: [mont("a", 10, 1)],
    emailByUserId: {},
    createdAt: { a: "2024-01-01", b: "2024-01-02" },
  });
  assert.ok(Object.values(out).every((ks) => !ks.includes("azul")));
});

// ---------------------------------------------------------------------------
test("astons: third- and second-to-last, never the farolillo rojo", () => {
  const general = [
    standing("a", 100, 1),
    standing("b", 80, 2),
    standing("c", 60, 3),
    standing("d", 40, 4),
    standing("e", 20, 5),
  ];
  assert.deepEqual(assignAstons(general), ["c", "d"]);
});

test("astons: none with fewer than 4 riders or a scoreless race", () => {
  assert.deepEqual(
    assignAstons([standing("a", 9, 1), standing("b", 5, 2), standing("c", 1, 3)]),
    [],
  );
  assert.deepEqual(
    assignAstons([
      standing("a", 0, 1),
      standing("b", 0, 1),
      standing("c", 0, 1),
      standing("d", 0, 1),
    ]),
    [],
  );
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
