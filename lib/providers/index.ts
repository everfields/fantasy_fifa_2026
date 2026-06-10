// ============================================================================
// Provider selection entry point.
// The rest of the app imports ONLY getProvider() / the interface types from
// here, never a concrete provider — keeps data sources swappable.
// ============================================================================

import { ApiFootballProvider } from "@/lib/providers/apiFootball";
import type { FootballDataProvider } from "@/lib/providers/FootballDataProvider";
import { FootballDataOrgProvider } from "@/lib/providers/footballDataOrg";
import { LlmWebSearchProvider } from "@/lib/providers/llmWebSearch";

export type {
  FootballDataProvider,
  ProviderMatch,
  ProviderTeam,
} from "@/lib/providers/FootballDataProvider";

export { FootballDataOrgProvider } from "@/lib/providers/footballDataOrg";
export { ApiFootballProvider } from "@/lib/providers/apiFootball";
export { LlmWebSearchProvider } from "@/lib/providers/llmWebSearch";

export type ProviderName = "footballDataOrg" | "apiFootball" | "llm";

/**
 * Returns the configured provider instance based on FOOTBALL_PROVIDER.
 * Defaults to the free football-data.org provider.
 */
export function getProvider(): FootballDataProvider {
  const name = (process.env.FOOTBALL_PROVIDER ?? "footballDataOrg") as ProviderName;
  switch (name) {
    case "apiFootball":
      return new ApiFootballProvider();
    case "llm":
      return new LlmWebSearchProvider();
    case "footballDataOrg":
      return new FootballDataOrgProvider();
    default:
      // Unknown value -> safe default.
      return new FootballDataOrgProvider();
  }
}
