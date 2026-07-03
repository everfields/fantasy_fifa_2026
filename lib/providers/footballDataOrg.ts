// ============================================================================
// football-data.org v4 provider (free tier).
//
// !!! VERIFY BEFORE LAUNCH on https://www.football-data.org/ !!!
//  - Exact endpoint paths under /v4 (competitions/{code}/teams, /matches,
//    and the global /matches?competitions=... live filter used below).
//  - The World Cup 2026 competition code. The historic World Cup code on
//    football-data.org is "WC"; CONFIRM it is the 2026 edition (and whether a
//    `season` query param is required) before trusting any data.
//  - Rate limits: free tier is heavily throttled (historically ~10 req/min)
//    and many competitions are NOT in the free plan. Confirm WC2026 coverage
//    and the request budget the polling cron is allowed to spend.
//  - Field availability: `tla` (3-letter code), `crest`, group strings and
//    score shapes can be null/absent depending on plan — handled defensively.
// ============================================================================

import type {
  FootballDataProvider,
  LiveMatchesResult,
  ProviderMatch,
  ProviderTeam,
} from "@/lib/providers/FootballDataProvider";
import type { MatchStatus, Stage } from "@/lib/types";

const BASE_URL = "https://api.football-data.org/v4";
// VERIFY: competition code for the 2026 World Cup.
const COMPETITION_CODE = "WC";

function authHeaders(): Record<string, string> {
  const token = process.env.FOOTBALL_DATA_ORG_TOKEN;
  if (!token) {
    throw new Error(
      "FOOTBALL_DATA_ORG_TOKEN is not set; cannot call football-data.org"
    );
  }
  return { "X-Auth-Token": token };
}

async function fdoFetch<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: authHeaders(),
      cache: "no-store",
    });
  } catch (err) {
    throw new Error(
      `football-data.org network error on ${path}: ${(err as Error).message}`
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `football-data.org ${res.status} on ${path}: ${body.slice(0, 300)}`
    );
  }
  try {
    return (await res.json()) as T;
  } catch (err) {
    throw new Error(
      `football-data.org invalid JSON on ${path}: ${(err as Error).message}`
    );
  }
}

// --- mapping helpers --------------------------------------------------------

function mapStatus(raw: string | null | undefined): MatchStatus {
  switch (raw) {
    case "IN_PLAY":
    case "PAUSED":
      return "live";
    case "FINISHED":
      return "finished";
    case "SCHEDULED":
    case "TIMED":
    default:
      // POSTPONED / SUSPENDED / CANCELLED / unknown -> treat as scheduled.
      return "scheduled";
  }
}

// football-data.org stage strings (v4). VERIFY the exact set used for WC2026.
function mapStage(raw: string | null | undefined): Stage {
  switch (raw) {
    case "GROUP_STAGE":
    case "GROUP":
      return "group";
    case "LAST_32":
    case "ROUND_OF_32":
      return "round_of_32";
    case "LAST_16":
    case "ROUND_OF_16":
      return "round_of_16";
    case "QUARTER_FINALS":
    case "QUARTER_FINAL":
      return "quarter";
    case "SEMI_FINALS":
    case "SEMI_FINAL":
      return "semi";
    case "THIRD_PLACE":
    case "PLAY_OFF_FOR_THIRD_PLACE":
      return "third_place";
    case "FINAL":
      return "final";
    default:
      return "group";
  }
}

function deriveCode(name: string | null | undefined, tla?: string | null): string {
  if (tla && typeof tla === "string" && tla.trim().length >= 2) {
    return tla.trim().toUpperCase().slice(0, 3);
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

function normalizeGroup(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // e.g. "GROUP_A" -> "A", "Group A" -> "A"
  const m = String(raw).match(/group[_\s]*([a-l])/i);
  if (m) return m[1].toUpperCase();
  return null;
}

interface FdoTeamRef {
  id?: number | null;
  name?: string | null;
  shortName?: string | null;
  tla?: string | null;
  crest?: string | null;
}

interface FdoTeam extends FdoTeamRef {
  // teams endpoint may also expose group depending on plan.
}

interface FdoMatch {
  id?: number | null;
  utcDate?: string | null;
  status?: string | null;
  stage?: string | null;
  group?: string | null;
  homeTeam?: FdoTeamRef | null;
  awayTeam?: FdoTeamRef | null;
  score?: {
    fullTime?: { home?: number | null; away?: number | null } | null;
    halfTime?: { home?: number | null; away?: number | null } | null;
  } | null;
}

function mapTeam(t: FdoTeam): ProviderTeam {
  return {
    providerId: t.id != null ? String(t.id) : (t.tla ?? t.name ?? "unknown"),
    name: t.name ?? t.shortName ?? "Unknown",
    code: deriveCode(t.name ?? t.shortName, t.tla),
    flagUrl: t.crest ?? null,
    group: null,
  };
}

function mapMatch(m: FdoMatch): ProviderMatch {
  const home = m.homeTeam ?? {};
  const away = m.awayTeam ?? {};
  const ft = m.score?.fullTime ?? {};
  return {
    providerId: m.id != null ? String(m.id) : "",
    homeTeamCode: deriveCode(home.name ?? home.shortName, home.tla),
    awayTeamCode: deriveCode(away.name ?? away.shortName, away.tla),
    stage: mapStage(m.stage),
    group: normalizeGroup(m.group),
    kickoffAt: m.utcDate ?? new Date(0).toISOString(),
    homeScore: typeof ft.home === "number" ? ft.home : null,
    awayScore: typeof ft.away === "number" ? ft.away : null,
    status: mapStatus(m.status),
  };
}

export class FootballDataOrgProvider implements FootballDataProvider {
  readonly name = "footballDataOrg";

  async getTeams(): Promise<ProviderTeam[]> {
    const data = await fdoFetch<{ teams?: FdoTeam[] }>(
      `/competitions/${COMPETITION_CODE}/teams`
    );
    const teams = Array.isArray(data.teams) ? data.teams : [];
    return teams.map(mapTeam);
  }

  async getMatches(): Promise<ProviderMatch[]> {
    const data = await fdoFetch<{ matches?: FdoMatch[] }>(
      `/competitions/${COMPETITION_CODE}/matches`
    );
    const matches = Array.isArray(data.matches) ? data.matches : [];
    return matches.map(mapMatch);
  }

  async getLiveMatches(): Promise<LiveMatchesResult> {
    // Global matches feed filtered to live statuses for this competition.
    // VERIFY: the `status`/`competitions` filter combo on the free plan.
    try {
      const data = await fdoFetch<{ matches?: FdoMatch[] }>(
        `/matches?competitions=${COMPETITION_CODE}&status=IN_PLAY,PAUSED,FINISHED`
      );
      const matches = (Array.isArray(data.matches) ? data.matches : []).map(mapMatch);
      return { matches, candidatesInWindow: matches.length, providerError: null };
    } catch (err) {
      const providerError = ((err as Error).message ?? String(err)).slice(0, 200);
      return { matches: [], candidatesInWindow: 0, providerError };
    }
  }

  async getMatch(providerId: string): Promise<ProviderMatch | null> {
    if (!providerId) return null;
    try {
      const m = await fdoFetch<FdoMatch>(
        `/matches/${encodeURIComponent(providerId)}`
      );
      if (!m || m.id == null) return null;
      return mapMatch(m);
    } catch {
      return null;
    }
  }
}
