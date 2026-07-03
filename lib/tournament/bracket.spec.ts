import { describe, expect, it } from "vitest";

import { matchOutcome, resolveSlot, type BracketSource } from "./bracket";

function source(overrides: Partial<BracketSource> = {}): BracketSource {
  return {
    status: "finished",
    home_team: "esp",
    away_team: "arg",
    home_score: null,
    away_score: null,
    penalty_winner: null,
    ...overrides,
  };
}

const NONE = { winner: null, loser: null };

describe("matchOutcome", () => {
  it("home win → home is the winner", () => {
    expect(matchOutcome(source({ home_score: 2, away_score: 1 }))).toEqual({
      winner: "esp",
      loser: "arg",
    });
  });

  it("away win → away is the winner", () => {
    expect(matchOutcome(source({ home_score: 0, away_score: 3 }))).toEqual({
      winner: "arg",
      loser: "esp",
    });
  });

  it("unfinished match is undeterminable, even with a live score", () => {
    expect(
      matchOutcome(source({ status: "live", home_score: 2, away_score: 0 })),
    ).toEqual(NONE);
    expect(matchOutcome(source({ status: "scheduled" }))).toEqual(NONE);
  });

  it("missing scores are undeterminable", () => {
    expect(matchOutcome(source({ home_score: 1 }))).toEqual(NONE);
    expect(matchOutcome(source({ away_score: 1 }))).toEqual(NONE);
  });

  it("missing teams (placeholder rows) are undeterminable", () => {
    expect(
      matchOutcome(source({ home_team: null, home_score: 2, away_score: 1 })),
    ).toEqual(NONE);
    expect(
      matchOutcome(source({ away_team: null, home_score: 2, away_score: 1 })),
    ).toEqual(NONE);
  });

  it("draw without a penalty winner is undeterminable", () => {
    expect(matchOutcome(source({ home_score: 1, away_score: 1 }))).toEqual(
      NONE,
    );
  });

  it("draw decided by penalties for the home team", () => {
    expect(
      matchOutcome(
        source({ home_score: 1, away_score: 1, penalty_winner: "esp" }),
      ),
    ).toEqual({ winner: "esp", loser: "arg" });
  });

  it("draw decided by penalties for the away team", () => {
    expect(
      matchOutcome(
        source({ home_score: 0, away_score: 0, penalty_winner: "arg" }),
      ),
    ).toEqual({ winner: "arg", loser: "esp" });
  });

  it("draw whose penalty winner matches neither team is undeterminable", () => {
    expect(
      matchOutcome(
        source({ home_score: 1, away_score: 1, penalty_winner: "bra" }),
      ),
    ).toEqual(NONE);
  });

  it("penalty winner is ignored when the match was decided in play", () => {
    expect(
      matchOutcome(
        source({ home_score: 2, away_score: 1, penalty_winner: "arg" }),
      ),
    ).toEqual({ winner: "esp", loser: "arg" });
  });
});

describe("resolveSlot", () => {
  const decided = source({ home_score: 3, away_score: 1 });
  const undeterminable = source({ status: "scheduled" });

  it("feeds the winner into a 'winner' slot", () => {
    expect(resolveSlot(decided, "winner")).toBe("esp");
  });

  it("feeds the loser into a 'loser' slot (third-place match)", () => {
    expect(resolveSlot(decided, "loser")).toBe("arg");
  });

  it("returns null for both kinds when the source is undeterminable", () => {
    expect(resolveSlot(undeterminable, "winner")).toBeNull();
    expect(resolveSlot(undeterminable, "loser")).toBeNull();
  });
});
