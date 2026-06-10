// ============================================================================
// Shared read helpers for the player-facing pages. Server-only.
//
// Centralises a few queries used by more than one page (app settings, team
// lookup) and the "matchday" derivation. The DB schema has no explicit
// `matchday` column, so we derive an ordered matchday from the calendar date of
// `kickoff_at` (the natural World Cup grouping) — see `matchdayKey`.
// ============================================================================

import { potBreakdown, type PotBreakdown } from "@/lib/pot";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_APP_SETTINGS, type AppSettings, type Team } from "@/lib/types";

/** Load the single `app_settings` row, falling back to defaults if absent. */
export async function getAppSettings(): Promise<AppSettings> {
  const supabase = createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("settings")
    .single();

  // Config lives in the `settings` jsonb column (see db/migrations/0001).
  const s = (data?.settings ?? {}) as Partial<AppSettings>;
  return {
    scoring: { ...DEFAULT_APP_SETTINGS.scoring, ...(s.scoring ?? {}) },
    bonus_default_points:
      s.bonus_default_points ?? DEFAULT_APP_SETTINGS.bonus_default_points,
    group_winner_points:
      s.group_winner_points ?? DEFAULT_APP_SETTINGS.group_winner_points,
    meta_volante_points:
      s.meta_volante_points ?? DEFAULT_APP_SETTINGS.meta_volante_points,
    jokers_per_user: s.jokers_per_user ?? DEFAULT_APP_SETTINGS.jokers_per_user,
    pot_amount: s.pot_amount ?? DEFAULT_APP_SETTINGS.pot_amount,
    entry_fee: s.entry_fee ?? DEFAULT_APP_SETTINGS.entry_fee,
    pot_expenses: s.pot_expenses ?? DEFAULT_APP_SETTINGS.pot_expenses,
    season_locked: s.season_locked ?? DEFAULT_APP_SETTINGS.season_locked,
    live_polling_seconds:
      s.live_polling_seconds ?? DEFAULT_APP_SETTINGS.live_polling_seconds,
  };
}

/**
 * Player-facing pot figures. Computed from the settings blob (entry fee,
 * expenses, paid players); players only ever see the two prizes.
 */
export async function getPotPrizes(): Promise<PotBreakdown> {
  const supabase = createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("settings")
    .single();
  const s = (data?.settings ?? {}) as Partial<AppSettings> & {
    paid_user_ids?: string[];
  };
  return potBreakdown({
    entryFee: s.entry_fee ?? DEFAULT_APP_SETTINGS.entry_fee,
    expenses: s.pot_expenses ?? DEFAULT_APP_SETTINGS.pot_expenses,
    paidCount: Array.isArray(s.paid_user_ids) ? s.paid_user_ids.length : 0,
  });
}

/** Fetch all teams as an id→Team map (placeholders included). */
export async function getTeamMap(): Promise<Map<string, Team>> {
  const supabase = createClient();
  const { data } = await supabase.from("teams").select("*");
  const map = new Map<string, Team>();
  for (const t of (data ?? []) as Team[]) map.set(t.id, t);
  return map;
}

/**
 * Resolve a team id to a `Team`, returning a safe placeholder when the team is
 * not (yet) seeded — e.g. knockout slots like "Winner Group A". MatchCard and
 * PredictionForm require a non-null `Team`, so callers use this to never pass
 * `undefined`.
 */
export function teamOr(
  map: Map<string, Team>,
  id: string,
  fallbackName = "Por definir",
): Team {
  return (
    map.get(id) ?? {
      id,
      name: fallbackName,
      code: "TBD",
      flag_url: null,
      group: null,
      is_eliminated: false,
    }
  );
}

/**
 * A stable, sortable matchday key derived from a kickoff timestamp: the UTC
 * calendar date (YYYY-MM-DD). Matches on the same day belong to one matchday.
 */
export function matchdayKey(kickoffAtIso: string): string {
  return kickoffAtIso.slice(0, 10);
}

/** Human label for a derived matchday key. */
export function matchdayLabel(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  return d.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}
