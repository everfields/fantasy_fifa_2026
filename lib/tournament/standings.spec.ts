import { describe, expect, it } from "vitest";

import type { Match, Team } from "@/lib/types";

import { bestThirds, computeGroupTables, isGroupComplete } from "./standings";

function team(id: string, name: string, group: string): Team {
  return { id, name, code: id.toUpperCase(), flag_url: null, group, is_eliminated: false };
}

let seq = 0;
function match(
  home: string,
  away: string,
  hs: number | null,
  as: number | null,
  overrides: Partial<Match> = {},
): Match {
  seq += 1;
  return {
    id: `m${seq}`,
    home_team: home,
    away_team: away,
    stage: "group",
    group: "A",
    matchday: 1,
    kickoff_at: "2026-06-11T19:00:00Z",
    home_score: hs,
    away_score: as,
    status: hs === null ? "scheduled" : "finished",
    locks_at: "2026-06-11T19:00:00Z",
    is_joker: false,
    montana_stage: null,
    provider_match_id: null,
    ...overrides,
  };
}

// Group A fixture: A and B end tied on points (6), GD (+3) and GF (4);
// A beat B head-to-head, so A must rank first.
const TEAMS_A = [
  team("a", "Alpha", "A"),
  team("b", "Bravo", "A"),
  team("c", "Charlie", "A"),
  team("d", "Delta", "A"),
];
const MATCHES_A = [
  match("a", "b", 1, 0),
  match("a", "c", 3, 0),
  match("d", "a", 1, 0),
  match("b", "c", 2, 0),
  match("b", "d", 2, 0),
  match("c", "d", 2, 2),
];

describe("computeGroupTables", () => {
  it("tallies points, goal difference and goals", () => {
    const rows = computeGroupTables(TEAMS_A, MATCHES_A).get("A")!;
    const alpha = rows.find((r) => r.team.id === "a")!;
    expect(alpha).toMatchObject({
      played: 3, won: 2, drawn: 0, lost: 1, gf: 4, ga: 1, gd: 3, points: 6,
    });
    expect(isGroupComplete(rows)).toBe(true);
  });

  it("breaks full ties via head-to-head and does not flag them unresolved", () => {
    const rows = computeGroupTables(TEAMS_A, MATCHES_A).get("A")!;
    expect(rows.map((r) => r.team.id)).toEqual(["a", "b", "d", "c"]);
    expect(rows[0].unresolvedTie).toBe(false);
    expect(rows[1].unresolvedTie).toBe(false);
  });

  it("flags ties the criteria cannot resolve (name fallback)", () => {
    const teams = [team("x", "Xray", "B"), team("y", "Yankee", "B")];
    const rows = computeGroupTables(teams, [
      match("x", "y", 1, 1, { group: "B" }),
    ]).get("B")!;
    expect(rows[0].unresolvedTie).toBe(true);
    expect(rows[1].unresolvedTie).toBe(true);
    expect(rows.map((r) => r.team.id)).toEqual(["x", "y"]); // alphabetical
  });

  it("ignores scheduled matches and counts live ones provisionally", () => {
    const teams = [team("x", "Xray", "B"), team("y", "Yankee", "B")];
    const rows = computeGroupTables(teams, [
      match("x", "y", null, null, { group: "B" }),
      match("x", "y", 2, 0, { group: "B", status: "live" }),
    ]).get("B")!;
    expect(rows[0].team.id).toBe("x");
    expect(rows[0].points).toBe(3);
    expect(rows[0].played).toBe(1);
    expect(isGroupComplete(rows)).toBe(false);
  });
});

describe("bestThirds", () => {
  it("ranks third-placed teams across groups and marks the top 8", () => {
    // 12 groups; group i's third place earns i points (0..11) via synthetic rows.
    const teams: Team[] = [];
    const matches: Match[] = [];
    const letters = "ABCDEFGHIJKL".split("");
    for (const [i, g] of letters.entries()) {
      const ids = [0, 1, 2, 3].map((n) => `${g}${n}`);
      teams.push(...ids.map((id, n) => team(id, `T${id}`, g)));
      // ids[2] (the eventual third) beats ids[3] i-0 … gives it 3 pts + GD i.
      matches.push(match(ids[2], ids[3], i, 0, { group: g }));
      // ids[0] and ids[1] beat both bottom teams to finish above.
      for (const top of [ids[0], ids[1]]) {
        matches.push(match(top, ids[2], 20, 0, { group: g }));
        matches.push(match(top, ids[3], 20, 0, { group: g }));
      }
    }
    const thirds = bestThirds(computeGroupTables(teams, matches));
    expect(thirds).toHaveLength(12);
    // Best third = group L's (GD +11), worst = group A's (GD 0).
    expect(thirds[0].group).toBe("L");
    expect(thirds.filter((t) => t.qualifies)).toHaveLength(8);
    expect(thirds.slice(0, 8).every((t) => t.qualifies)).toBe(true);
    expect(thirds.slice(8).every((t) => !t.qualifies)).toBe(true);
  });
});
