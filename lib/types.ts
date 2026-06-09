// ============================================================================
// Shared domain contract for the Mundial 2026 Pool.
// Every module (DB, providers, scoring, UI, API) codes against these types.
// Mirrors the database schema in /db/migrations. Keep in sync.
// ============================================================================

export type Role = "player" | "admin";
export type MatchStatus = "scheduled" | "live" | "finished";
export type Stage =
  | "group"
  | "round_of_32"
  | "round_of_16"
  | "quarter"
  | "semi"
  | "third_place"
  | "final";
export type BonusType = "single" | "multi" | "numeric" | "text";

/**
 * Identity of a "round" for meta-volante (round-champion) scoring.
 * Group stage splits into one round per matchday; each knockout stage is its
 * own round. Derived from a match's stage + matchday — see lib/scoring.
 *   "group-md1" | "group-md2" | "group-md3"
 *   "round_of_32" | "round_of_16" | "quarter" | "semi" | "final"
 * (third_place matches fold into the "final" round).
 */
export type RoundKey = string;

export interface Profile {
  id: string; // = auth.uid
  display_name: string;
  avatar: string | null;
  role: Role;
  joker_count: number;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  code: string; // 3-letter FIFA code
  flag_url: string | null;
  group: string | null; // 'A'..'L', null for knockout placeholders
  is_eliminated: boolean;
}

export interface Match {
  id: string;
  home_team: string; // Team.id (or placeholder id)
  away_team: string;
  stage: Stage;
  group: string | null;
  matchday: number | null; // 1..3 within the group stage; null for knockouts
  kickoff_at: string; // ISO timestamp
  home_score: number | null;
  away_score: number | null;
  status: MatchStatus;
  locks_at: string; // ISO; = kickoff
  is_joker: boolean; // admin-designated joker match → ×joker_multiplier for ALL users
  provider_match_id: string | null; // id in the external football provider
}

export interface Prediction {
  id: string;
  user_id: string;
  match_id: string;
  home_pred: number;
  away_pred: number;
  is_joker: boolean; // DEPRECATED: jokers are now assigned per-match (Match.is_joker), not per-user. Column kept for back-compat; scoring ignores it.
  points_awarded: number | null; // null = not yet scored
  created_at: string;
  updated_at: string;
}

export interface BonusQuestion {
  id: string;
  text: string;
  type: BonusType;
  options: string[] | null; // for single/multi; null for numeric/text
  points: number;
  correct_answer: string | string[] | number | null; // text → string (case-insensitive match)
  locks_at: string;
}

/**
 * A "meta volante" (round-champion) award. The player with the most prediction
 * points within a round earns `points` (config: meta_volante_points). Ties
 * break by exact hits in that round, then split. Computed during recalc and
 * summed into standings. Not predicted by users — earned by performance.
 */
export interface RoundAward {
  id: string;
  round_key: RoundKey;
  user_id: string;
  points: number; // award granted (e.g. 100)
  round_points: number; // the player's prediction points within the round (audit/display)
  created_at: string;
}

export interface BonusAnswer {
  id: string;
  user_id: string;
  question_id: string;
  answer: string | string[] | number;
  points_awarded: number | null;
}

export interface StandingRow {
  user_id: string;
  display_name: string;
  avatar: string | null;
  total_points: number;
  exact_hits: number;
  bonus_points: number;
  meta_points: number; // sum of meta-volante (round-champion) awards
  rank: number;
}

export interface ScoringConfig {
  exact: number; // exact scoreline
  sign: number; // correct 1/X/2
  diff_bonus: number; // correct goal difference (sign right, score wrong)
  joker_multiplier: number; // multiplier applied when is_joker
  exact_enabled: boolean;
  sign_enabled: boolean;
  diff_bonus_enabled: boolean;
}

export interface AppSettings {
  scoring: ScoringConfig;
  bonus_default_points: number; // default points for a new bonus question
  group_winner_points: number; // points per auto-generated group-winner bonus question
  meta_volante_points: number; // round-champion (meta volante) award
  jokers_per_user: number; // DEPRECATED: jokers are now assigned per-match by the admin
  pot_amount: number;
  season_locked: boolean;
  live_polling_seconds: number;
}

export interface AuditEntry {
  id: string;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  before: unknown;
  after: unknown;
  created_at: string;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  scoring: {
    exact: 50,
    sign: 20,
    diff_bonus: 10,
    joker_multiplier: 3,
    exact_enabled: true,
    sign_enabled: true,
    diff_bonus_enabled: true,
  },
  bonus_default_points: 100,
  group_winner_points: 50,
  meta_volante_points: 100,
  jokers_per_user: 0,
  pot_amount: 0,
  season_locked: false,
  live_polling_seconds: 60,
};
