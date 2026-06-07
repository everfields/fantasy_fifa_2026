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
export type BonusType = "single" | "multi" | "numeric";

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
  kickoff_at: string; // ISO timestamp
  home_score: number | null;
  away_score: number | null;
  status: MatchStatus;
  locks_at: string; // ISO; = kickoff
  provider_match_id: string | null; // id in the external football provider
}

export interface Prediction {
  id: string;
  user_id: string;
  match_id: string;
  home_pred: number;
  away_pred: number;
  is_joker: boolean;
  points_awarded: number | null; // null = not yet scored
  created_at: string;
  updated_at: string;
}

export interface BonusQuestion {
  id: string;
  text: string;
  type: BonusType;
  options: string[] | null; // for single/multi
  points: number;
  correct_answer: string | string[] | number | null;
  locks_at: string;
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
  jokers_per_user: number;
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
    exact: 5,
    sign: 3,
    diff_bonus: 1,
    joker_multiplier: 2,
    exact_enabled: true,
    sign_enabled: true,
    diff_bonus_enabled: true,
  },
  jokers_per_user: 3,
  pot_amount: 0,
  season_locked: false,
  live_polling_seconds: 60,
};
