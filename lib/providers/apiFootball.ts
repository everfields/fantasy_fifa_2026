// ============================================================================
// API-Football v3 provider (paid; used for live data later in the tournament).
//
// !!! VERIFY BEFORE LAUNCH on https://www.api-football.com/documentation-v3 !!!
//  - Exact endpoint paths used below: /teams, /fixtures, /fixtures?live=...
//    and the required query params for the World Cup.
//  - The league id for the FIFA World Cup and the correct `season` value for
//    the 2026 edition (API-Football keys World Cup data by league id + season;
//    BOTH must be confirmed — hardcoded guesses below WILL be wrong).
//  - Rate limits / daily request quota for the purchased plan, so the polling
//    cron stays inside budget.
//  - Coverage: which data (scores, status, lineups, events) is included in the
//    chosen plan for WC2026.
//  - Auth: direct API uses header `x-apisports-key`; the RapidAPI gateway uses
//    different headers/host. This impl targets the DIRECT API host.
// ============================================================================

import type {
  FootballDataProvider,
  ProviderMatch,
  ProviderTeam,
} from "@/lib/providers/FootballDataProvider";
import type { MatchStatus, Stage } from "@/lib/types";

const BASE_URL = "https://v3.football.api-sports.io";
// VERIFY: league id + season for the 2026 World Cup. 1 has historically been
// the FIFA World Cup league id, but confirm it and the season string.
const LEAGUE_ID = "1";
const SEASON = "2026";

function authHeaders(): Record<string, string> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    throw new Error("API_FOOTBALL_KEY is not set; cannot call API-Football");
  }
  return { "x-apisports-key": key };
}

async function afFetch<T>(path: string): Promise<{ response: T[] }> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: authHeaders(),
      cache: "no-store",
    });
  } catch (err) {
    throw new Error(
      `API-Football network error on ${path}: ${(err as Error).message}`
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `API-Football ${res.status} on ${path}: ${body.slice(0, 300)}`
    );
  }
  let json: {
    errors?: unknown;
    response?: T[];
  };
  try {
    json = (await res.json()) as typeof json;
  } catch (err) {
    throw new Error(
      `API-Football invalid JSON on ${path}: ${(err as Error).message}`
    );
  }
  // API-Football returns 200 with an `errors` payload on failures.
  if (
    json.errors &&
    ((Array.isArray(json.errors) && json.errors.length > 0) ||
      (!Array.isArray(json.errors) &&
        typeof json.errors === "object" &&
        Object.keys(json.errors as object).length > 0))
  ) {
    throw new Error(
      `API-Football error on ${path}: ${JSON.stringify(json.errors).slice(0, 300)}`
    );
  }
  return { response: Array.isArray(json.response) ? json.response : [] };
}

// --- mapping helpers --------------------------------------------------------

// API-Football fixture status "short" codes.
function mapStatus(short: string | null | undefined): MatchStatus {
  switch (short) {
    case "1H": // first half
    case "2H": // second half
    case "ET": // extra time
    case "BT": // break time
    case "P": // penalty in progress
    case "LIVE":
    case "HT": // half time (paused)
    case "INT": // interrupted but ongoing
      return "live";
    case "FT": // full time
    case "AET": // after extra time
    case "PEN": // after penalties
      return "finished";
    case "NS": // not started
    case "TBD":
    case "PST": // postponed
    case "CANC":
    case "SUSP":
    case "ABD":
    case "AWD":
    case "WO":
    default:
      return "scheduled";
  }
}

// API-Football encodes stage in fixture.round, e.g. "Group A - 1",
// "Round of 16", "Quarter-finals", "Final".
function mapStage(round: string | null | undefined): Stage {
  const r = (round ?? "").toLowerCase();
  if (r.includes("3rd place") || r.includes("third place")) return "third_place";
  if (r.includes("final") && !r.includes("semi") && !r.includes("quarter")) {
    return "final";
  }
  if (r.includes("semi")) return "semi";
  if (r.includes("quarter")) return "quarter";
  if (r.includes("16")) return "round_of_16";
  if (r.includes("32")) return "round_of_32";
  if (r.includes("group")) return "group";
  return "group";
}

function deriveCode(name: string | null | undefined, code?: string | null): string {
  if (code && typeof code === "string" && code.trim().length >= 2) {
    return code.trim().toUpperCase().slice(0, 3);
  }
  const clean = (name ?? "").replace(/[^a-zA-Z ]/g, "").trim();
  if (!clean) return "UNK";
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 3) {
    return (words[0][0] + words[1][0] + words[2][0]).toUpperCase();
  }
  if (words.length === 2) {
    return (words[0].slice(0, 2) + words[1][0]).toUpperCase();
  }
  return words[0].slice(0, 3).toUpperCase().padEnd(3, "X");
}

function normalizeGroup(round: string | null | undefined): string | null {
  if (!round) return null;
  const m = String(round).match(/group\s*([a-l])/i);
  return m ? m[1].toUpperCase() : null;
}

interface AfTeam {
  id?: number | null;
  name?: string | null;
  code?: string | null;
  logo?: string | null;
  flag?: string | null;
}

interface AfTeamsRow {
  team?: AfTeam | null;
}

interface AfFixtureRow {
  fixture?: {
    id?: number | null;
    date?: string | null;
    status?: { short?: string | null; long?: string | null } | null;
  } | null;
  league?: { round?: string | null } | null;
  teams?: {
    home?: AfTeam | null;
    away?: AfTeam | null;
  } | null;
  goals?: { home?: number | null; away?: number | null } | null;
}

function mapTeam(row: AfTeamsRow): ProviderTeam {
  const t = row.team ?? {};
  return {
    providerId: t.id != null ? String(t.id) : (t.code ?? t.name ?? "unknown"),
    name: t.name ?? "Unknown",
    code: deriveCode(t.name, t.code),
    flagUrl: t.logo ?? t.flag ?? null,
    group: null,
  };
}

function mapFixture(row: AfFixtureRow): ProviderMatch {
  const fx = row.fixture ?? {};
  const round = row.league?.round ?? null;
  const home = row.teams?.home ?? {};
  const away = row.teams?.away ?? {};
  const goals = row.goals ?? {};
  return {
    providerId: fx.id != null ? String(fx.id) : "",
    homeTeamCode: deriveCode(home.name, home.code),
    awayTeamCode: deriveCode(away.name, away.code),
    stage: mapStage(round),
    group: normalizeGroup(round),
    kickoffAt: fx.date ?? new Date(0).toISOString(),
    homeScore: typeof goals.home === "number" ? goals.home : null,
    awayScore: typeof goals.away === "number" ? goals.away : null,
    status: mapStatus(fx.status?.short),
  };
}

export class ApiFootballProvider implements FootballDataProvider {
  readonly name = "apiFootball";

  async getTeams(): Promise<ProviderTeam[]> {
    const { response } = await afFetch<AfTeamsRow>(
      `/teams?league=${LEAGUE_ID}&season=${SEASON}`
    );
    return response.map(mapTeam);
  }

  async getMatches(): Promise<ProviderMatch[]> {
    const { response } = await afFetch<AfFixtureRow>(
      `/fixtures?league=${LEAGUE_ID}&season=${SEASON}`
    );
    return response.map(mapFixture);
  }

  async getLiveMatches(): Promise<ProviderMatch[]> {
    // `live` filter scoped to this league. VERIFY the param form on your plan.
    const { response } = await afFetch<AfFixtureRow>(
      `/fixtures?live=all&league=${LEAGUE_ID}&season=${SEASON}`
    );
    return response.map(mapFixture);
  }

  async getMatch(providerId: string): Promise<ProviderMatch | null> {
    if (!providerId) return null;
    try {
      const { response } = await afFetch<AfFixtureRow>(
        `/fixtures?id=${encodeURIComponent(providerId)}`
      );
      if (response.length === 0) return null;
      return mapFixture(response[0]);
    } catch {
      return null;
    }
  }
}
