import type { MatchStatus, Stage } from "@/lib/types";

// ============================================================================
// Provider-agnostic contract for fetching World Cup data.
// Core app code depends ONLY on this interface, never on a concrete provider.
// Implementations: footballDataOrg.ts (free), apiFootball.ts (paid, live data).
// ============================================================================

export interface ProviderTeam {
  providerId: string;
  name: string;
  code: string; // 3-letter code, best effort
  flagUrl: string | null;
  group: string | null;
}

export interface ProviderMatch {
  providerId: string;
  homeTeamCode: string;
  awayTeamCode: string;
  stage: Stage;
  group: string | null;
  kickoffAt: string; // ISO
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
}

export interface FootballDataProvider {
  /** Stable provider name for logging/audit. */
  readonly name: string;
  /** All participating teams (for seeding). */
  getTeams(): Promise<ProviderTeam[]>;
  /** Full tournament schedule. */
  getMatches(): Promise<ProviderMatch[]>;
  /** Matches that are live or recently finished — used by the polling cron. */
  getLiveMatches(): Promise<ProviderMatch[]>;
  /** Single match by provider id (force-sync). */
  getMatch(providerId: string): Promise<ProviderMatch | null>;
}
