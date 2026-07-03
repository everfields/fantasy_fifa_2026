// ============================================================================
// LLM web-search provider — uses Anthropic API with the server-side web_search
// tool to fetch live / final World Cup 2026 scores.
//
// Selected via FOOTBALL_PROVIDER=llm.
// Requires ANTHROPIC_API_KEY (already in stack for Luis de la Tracker).
// Optional: RESULTS_MODEL (defaults to claude-haiku-4-5).
//
// Poll windows (per match, minutes after kickoff):
//   1. primer tiempo : [20′, 45′)  — first half in progress
//   2. descanso      : [45′, 70′)  — half-time break / early second half
//   3. segundo tiempo: [80′, 110′) — second half in progress
//   4. final         : [115′, ∞)   — full time / extra time / penalties
//                                     (DB 6h lookback guard limits effective upper bound)
//
// Windows 1-3 may update live scores/status but NEVER mark a match finished.
// Window 4 is the only window that can yield status=finished (explicit FT only).
// Zero LLM calls on non-match days or between windows.
// Any API / parse failure → providerError set, matches [] (never throws into the cron).
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";
import type {
  FootballDataProvider,
  LiveMatchesResult,
  ProviderMatch,
  ProviderTeam,
} from "@/lib/providers/FootballDataProvider";
import type { MatchStatus, Stage } from "@/lib/types";

const DEFAULT_MODEL = "claude-haiku-4-5";

function resultsModel(): string {
  return process.env.RESULTS_MODEL ?? DEFAULT_MODEL;
}

// ----------------------------------------------------------------------------
// DB row types (minimal, only what we need here)
// ----------------------------------------------------------------------------

interface TeamRow {
  id: string;
  code: string;
  name: string;
}

interface MatchRow {
  id: string;
  home_team: string | null;
  away_team: string | null;
  stage: Stage;
  group: string | null;
  kickoff_at: string;
  home_score: number | null;
  away_score: number | null;
  status: MatchStatus;
}

interface CandidateMatch {
  id: string;
  homeCode: string;
  homeName: string;
  awayCode: string;
  awayName: string;
  stage: Stage;
  group: string | null;
  kickoffAt: string;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
}

// ----------------------------------------------------------------------------
// Tool result shape from the model
// ----------------------------------------------------------------------------

interface ReportedResult {
  matchId: string;
  homeScore: number;
  awayScore: number;
  status: "live" | "finished";
  confirmedFullTime: boolean;
}

// ----------------------------------------------------------------------------
// Poll window logic
// ----------------------------------------------------------------------------

const MIN_TO_MS = 60_000;

/**
 * Returns true when the match at kickoffIso should be polled at the given time.
 * Four windows (minutes after kickoff):
 *   1. primer tiempo  [20, 45)  — first half in progress
 *   2. descanso       [45, 70)  — half-time break / early second half
 *   3. segundo tiempo [80, 110) — second half in progress
 *   4. final          [115, ∞)  — full time / extra time / penalties
 * The DB 6h lookback guard in loadNonFinishedMatchesInWindow limits window 4's
 * effective upper bound to kickoff+6h.
 * Exported for unit testing.
 */
export function isDueForPoll(kickoffIso: string, now: Date): boolean {
  const kickoff = new Date(kickoffIso).getTime();
  const t = now.getTime();
  return (
    // Window 1: primer tiempo
    (t >= kickoff + 20 * MIN_TO_MS && t < kickoff + 45 * MIN_TO_MS) ||
    // Window 2: descanso
    (t >= kickoff + 45 * MIN_TO_MS && t < kickoff + 70 * MIN_TO_MS) ||
    // Window 3: segundo tiempo
    (t >= kickoff + 80 * MIN_TO_MS && t < kickoff + 110 * MIN_TO_MS) ||
    // Window 4: final (open-ended; DB guard limits to kickoff+6h)
    t >= kickoff + 115 * MIN_TO_MS
  );
}

// ----------------------------------------------------------------------------
// DB loaders
// ----------------------------------------------------------------------------

async function loadTeamMap(): Promise<Map<string, TeamRow>> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("teams")
    .select("id, code, name");
  if (error || !data) return new Map();
  const map = new Map<string, TeamRow>();
  for (const t of data as TeamRow[]) {
    if (t.id) map.set(t.id, t);
  }
  return map;
}

async function loadNonFinishedMatchesInWindow(
  now: Date,
): Promise<CandidateMatch[]> {
  const supabase = createServiceClient();
  const windowStart = new Date(now.getTime() - 6 * 60 * MIN_TO_MS).toISOString();

  const { data, error } = await supabase
    .from("matches")
    .select(
      "id, home_team, away_team, stage, group, kickoff_at, home_score, away_score, status",
    )
    .neq("status", "finished")
    .gte("kickoff_at", windowStart);

  if (error || !data) return [];

  const teamMap = await loadTeamMap();
  const now_ = now;
  const candidates: CandidateMatch[] = [];

  for (const m of data as MatchRow[]) {
    if (!isDueForPoll(m.kickoff_at, now_)) continue;
    const home = m.home_team ? teamMap.get(m.home_team) : undefined;
    const away = m.away_team ? teamMap.get(m.away_team) : undefined;
    if (!home || !away) continue;
    candidates.push({
      id: m.id,
      homeCode: home.code,
      homeName: home.name,
      awayCode: away.code,
      awayName: away.name,
      stage: m.stage,
      group: m.group,
      kickoffAt: m.kickoff_at,
      homeScore: m.home_score,
      awayScore: m.away_score,
      status: m.status,
    });
  }

  return candidates;
}

async function loadSingleMatch(matchId: string): Promise<CandidateMatch | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("matches")
    .select(
      "id, home_team, away_team, stage, group, kickoff_at, home_score, away_score, status",
    )
    .eq("id", matchId)
    .single();

  if (error || !data) return null;

  const m = data as MatchRow;
  const teamMap = await loadTeamMap();
  const home = m.home_team ? teamMap.get(m.home_team) : undefined;
  const away = m.away_team ? teamMap.get(m.away_team) : undefined;
  if (!home || !away) return null;

  return {
    id: m.id,
    homeCode: home.code,
    homeName: home.name,
    awayCode: away.code,
    awayName: away.name,
    stage: m.stage,
    group: m.group,
    kickoffAt: m.kickoff_at,
    homeScore: m.home_score,
    awayScore: m.away_score,
    status: m.status,
  };
}

// ----------------------------------------------------------------------------
// LLM call
// ----------------------------------------------------------------------------

function buildPrompt(candidates: CandidateMatch[]): string {
  const lines = candidates.map((c) => {
    const groupStr = c.group ? ` (Group ${c.group})` : "";
    return `- ID: ${c.id} | ${c.homeName} (${c.homeCode}) vs ${c.awayName} (${c.awayCode}) | Kickoff: ${c.kickoffAt} | Stage: ${c.stage}${groupStr}`;
  });
  return [
    "You are a football results reporter. Search the web for the current or final scores of EXACTLY these FIFA World Cup 2026 fixtures:",
    "",
    ...lines,
    "",
    "Hard rules:",
    "- Report ONLY scores explicitly confirmed by search results.",
    "- Set status \"finished\" and confirmedFullTime true ONLY if sources explicitly state the match has ended (full-time / FT).",
    "- If a match is in extra time, penalties, or sources are unclear, report status \"live\" with the latest confirmed score.",
    "- If no reliable score is found for a fixture, OMIT it from results.",
    "- Never guess or invent scores.",
    "",
    "When done, call report_match_results exactly once with your findings.",
  ].join("\n");
}

const REPORT_TOOL_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "matchId",
          "homeScore",
          "awayScore",
          "status",
          "confirmedFullTime",
        ],
        properties: {
          matchId: { type: "string" },
          homeScore: { type: "integer" },
          awayScore: { type: "integer" },
          status: { type: "string", enum: ["live", "finished"] },
          confirmedFullTime: { type: "boolean" },
        },
      },
    },
  },
};

async function callLlm(
  candidates: CandidateMatch[],
): Promise<{ results: ReportedResult[]; error: string | null }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const msg = "anthropic: ANTHROPIC_API_KEY not set";
    console.error("[llmWebSearch]", msg);
    return { results: [], error: msg };
  }

  const client = new Anthropic({ apiKey });

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: resultsModel(),
      max_tokens: 2048,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 5,
        } as unknown as Anthropic.Tool,
        {
          name: "report_match_results",
          description:
            "Report the current or final scores for the requested fixtures.",
          input_schema: REPORT_TOOL_SCHEMA,
        },
      ],
      messages: [
        {
          role: "user",
          content: buildPrompt(candidates),
        },
      ],
    });
  } catch (err) {
    const e = err as Error & { status?: number };
    const detail = (e.message ?? String(err)).slice(0, 200);
    const msg =
      e.status != null ? `anthropic ${e.status}: ${detail}` : `anthropic: ${detail}`;
    console.error("[llmWebSearch] Anthropic API error:", (err as Error).message);
    return { results: [], error: msg };
  }

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "report_match_results") {
      const input = block.input as { results?: unknown[] };
      if (!Array.isArray(input?.results)) return { results: [], error: null };
      const results: ReportedResult[] = [];
      for (const r of input.results) {
        const item = r as Record<string, unknown>;
        if (
          typeof item.matchId === "string" &&
          typeof item.homeScore === "number" &&
          typeof item.awayScore === "number" &&
          (item.status === "live" || item.status === "finished") &&
          typeof item.confirmedFullTime === "boolean"
        ) {
          results.push({
            matchId: item.matchId,
            homeScore: item.homeScore,
            awayScore: item.awayScore,
            status: item.status,
            confirmedFullTime: item.confirmedFullTime,
          });
        }
      }
      return { results, error: null };
    }
  }

  return { results: [], error: null };
}

// ----------------------------------------------------------------------------
// Map candidates + LLM results → ProviderMatch[]
// ----------------------------------------------------------------------------

function mapToProviderMatch(
  candidate: CandidateMatch,
  reported: ReportedResult,
): ProviderMatch {
  let status: MatchStatus;
  if (reported.status === "finished" && reported.confirmedFullTime) {
    status = "finished";
  } else {
    status = "live";
  }

  return {
    providerId: candidate.id,
    homeTeamCode: candidate.homeCode,
    awayTeamCode: candidate.awayCode,
    stage: candidate.stage,
    group: candidate.group,
    kickoffAt: candidate.kickoffAt,
    homeScore: reported.homeScore,
    awayScore: reported.awayScore,
    status,
  };
}

function applyResults(
  candidates: CandidateMatch[],
  reported: ReportedResult[],
): ProviderMatch[] {
  const candidateIds = new Set(candidates.map((c) => c.id));
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const results: ProviderMatch[] = [];

  for (const r of reported) {
    if (!candidateIds.has(r.matchId)) continue;
    if (r.homeScore < 0 || r.awayScore < 0) continue;
    if (r.status === "finished" && !r.confirmedFullTime) continue;
    const candidate = byId.get(r.matchId)!;
    results.push(mapToProviderMatch(candidate, r));
  }

  return results;
}

// ----------------------------------------------------------------------------
// Shared LLM pipeline (candidates → ProviderMatch[])
// ----------------------------------------------------------------------------

async function runPipeline(
  candidates: CandidateMatch[],
): Promise<{ matches: ProviderMatch[]; error: string | null }> {
  if (candidates.length === 0) return { matches: [], error: null };
  const { results, error } = await callLlm(candidates);
  return { matches: applyResults(candidates, results), error };
}

// ----------------------------------------------------------------------------
// Provider implementation
// ----------------------------------------------------------------------------

export class LlmWebSearchProvider implements FootballDataProvider {
  readonly name = "llmWebSearch";

  async getTeams(): Promise<ProviderTeam[]> {
    return Promise.resolve([]);
  }

  async getMatches(): Promise<ProviderMatch[]> {
    return Promise.resolve([]);
  }

  async getLiveMatches(): Promise<LiveMatchesResult> {
    try {
      const now = new Date();
      const candidates = await loadNonFinishedMatchesInWindow(now);
      const candidatesInWindow = candidates.length;
      if (candidates.length === 0) {
        return { matches: [], candidatesInWindow: 0, providerError: null };
      }
      const { matches, error } = await runPipeline(candidates);
      return { matches, candidatesInWindow, providerError: error };
    } catch (err) {
      console.error(
        "[llmWebSearch] getLiveMatches error:",
        (err as Error).message,
      );
      return {
        matches: [],
        candidatesInWindow: 0,
        providerError: `getLiveMatches: ${(err as Error).message ?? String(err)}`,
      };
    }
  }

  async getMatch(providerId: string): Promise<ProviderMatch | null> {
    try {
      if (!providerId) return null;
      const candidate = await loadSingleMatch(providerId);
      if (!candidate) return null;

      if (candidate.status === "finished") {
        return {
          providerId: candidate.id,
          homeTeamCode: candidate.homeCode,
          awayTeamCode: candidate.awayCode,
          stage: candidate.stage,
          group: candidate.group,
          kickoffAt: candidate.kickoffAt,
          homeScore: candidate.homeScore,
          awayScore: candidate.awayScore,
          status: "finished",
        };
      }

      const { matches } = await runPipeline([candidate]);
      return matches.length > 0 ? matches[0] : null;
    } catch (err) {
      console.error(
        "[llmWebSearch] getMatch error:",
        (err as Error).message,
      );
      return null;
    }
  }
}
