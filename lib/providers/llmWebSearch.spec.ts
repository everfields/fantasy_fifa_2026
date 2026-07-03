// Unit tests for llmWebSearch provider.
//
// isDueForPoll — pure window-selection predicate, no mocking needed.
// getLiveMatches providerError propagation — mocks Anthropic + Supabase.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Mocks (hoisted before imports of the module under test)
// ============================================================================

// Supabase mock: returns one match kicked off 30 minutes ago (primer tiempo window).
vi.mock("@/lib/supabase/server", () => {
  // Compute kickoff inside the factory so it's relative to module-load time.
  const kickoffAt = new Date(Date.now() - 30 * 60_000).toISOString();

  return {
    createServiceClient: () => ({
      from: (table: string) => {
        if (table === "teams") {
          return {
            select: () =>
              Promise.resolve({
                data: [
                  { id: "home-id", code: "HOM", name: "Home Team" },
                  { id: "away-id", code: "AWY", name: "Away Team" },
                ],
                error: null,
              }),
          };
        }
        // matches: .select().neq().gte() chain
        return {
          select: () => ({
            neq: () => ({
              gte: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "match-1",
                      home_team: "home-id",
                      away_team: "away-id",
                      stage: "group",
                      group: "A",
                      kickoff_at: kickoffAt,
                      home_score: null,
                      away_score: null,
                      status: "scheduled",
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        };
      },
    }),
  };
});

// Anthropic mock: messages.create always rejects with a 401.
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = {
      create: () => {
        const err = Object.assign(new Error("invalid_api_key"), { status: 401 });
        return Promise.reject(err);
      },
    };
  },
}));

// ============================================================================
// Import module under test AFTER mocks are registered.
// ============================================================================

import { isDueForPoll } from "./llmWebSearch";
import { LlmWebSearchProvider } from "./llmWebSearch";

// ============================================================================
// isDueForPoll — 4-window boundary tests
// ============================================================================

const MIN = 60_000;

function at(kickoffIso: string, plusMinutes: number): Date {
  return new Date(new Date(kickoffIso).getTime() + plusMinutes * MIN);
}

describe("isDueForPoll — poll window membership", () => {
  const kickoff = "2026-07-01T18:00:00.000Z";

  // Required cases from the task spec
  it("+10 → not in any window", () =>
    expect(isDueForPoll(kickoff, at(kickoff, 10))).toBe(false));

  it("+30 → primer tiempo [20, 45)", () =>
    expect(isDueForPoll(kickoff, at(kickoff, 30))).toBe(true));

  it("+50 → descanso [45, 70)", () =>
    expect(isDueForPoll(kickoff, at(kickoff, 50))).toBe(true));

  it("+75 → gap between descanso and segundo tiempo", () =>
    expect(isDueForPoll(kickoff, at(kickoff, 75))).toBe(false));

  it("+90 → segundo tiempo [80, 110)", () =>
    expect(isDueForPoll(kickoff, at(kickoff, 90))).toBe(true));

  it("+112 → gap before final window", () =>
    expect(isDueForPoll(kickoff, at(kickoff, 112))).toBe(false));

  it("+120 → final [115, ∞)", () =>
    expect(isDueForPoll(kickoff, at(kickoff, 120))).toBe(true));

  // Boundary edge cases
  it("+20 → primer tiempo start (inclusive)", () =>
    expect(isDueForPoll(kickoff, at(kickoff, 20))).toBe(true));

  it("+45 → primer tiempo end exclusive / descanso start inclusive", () =>
    expect(isDueForPoll(kickoff, at(kickoff, 45))).toBe(true));

  it("+115 → final start (inclusive)", () =>
    expect(isDueForPoll(kickoff, at(kickoff, 115))).toBe(true));

  it("+44 → last minute of primer tiempo", () =>
    expect(isDueForPoll(kickoff, at(kickoff, 44))).toBe(true));

  it("+19 → before primer tiempo", () =>
    expect(isDueForPoll(kickoff, at(kickoff, 19))).toBe(false));

  it("+110 → segundo tiempo end exclusive (not in window 3 or 4)", () =>
    expect(isDueForPoll(kickoff, at(kickoff, 110))).toBe(false));
});

// ============================================================================
// getLiveMatches — providerError propagation
// ============================================================================

describe("getLiveMatches — providerError propagation on thrown LLM call", () => {
  let savedKey: string | undefined;

  beforeEach(() => {
    savedKey = process.env.ANTHROPIC_API_KEY;
    // Provide a key so callLlm proceeds past the missing-key guard
    // and actually hits the mocked client (which throws 401).
    process.env.ANTHROPIC_API_KEY = "test-key-mocked";
  });

  afterEach(() => {
    if (savedKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = savedKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it("returns providerError and empty matches when the LLM call throws", async () => {
    const provider = new LlmWebSearchProvider();
    const result = await provider.getLiveMatches();

    // candidatesInWindow must be > 0 (the mocked Supabase returns one match
    // kicked off 30 min ago, which is in the primer tiempo window)
    expect(result.candidatesInWindow).toBeGreaterThan(0);

    // matches should be empty because the LLM failed
    expect(result.matches).toEqual([]);

    // providerError must be set and mention "anthropic 401"
    expect(result.providerError).not.toBeNull();
    expect(result.providerError).toMatch(/anthropic 401/i);
  });

  it("never throws — always returns LiveMatchesResult shape", async () => {
    const provider = new LlmWebSearchProvider();
    // Should resolve (not reject) even with a broken API
    const result = await expect(provider.getLiveMatches()).resolves.toBeDefined();
    void result;
  });
});
