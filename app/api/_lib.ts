// ============================================================================
// Shared server-side helpers for the API routes (cron + admin).
//
// The single source of truth for the IDEMPOTENT rescore + standings refresh
// logic that both `cron/update-results`, `admin/recalc` and `admin/sync-now`
// reuse. Keeping it here guarantees the three routes can never drift apart on
// the critical correctness property: re-scoring NEVER double-counts.
//
// All writes go through the service-role client (bypasses RLS) — callers are
// either the Vercel cron (bearer-authenticated) or an admin (requireAdmin()).
// ============================================================================

import { recomputePredictionPoints } from "@/lib/scoring";
import type {
  IdentifiablePrediction,
  ScorableMatch,
} from "@/lib/scoring";
import type { ProviderMatch } from "@/lib/providers";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AppSettings,
  DEFAULT_APP_SETTINGS,
  MatchStatus,
  ScoringConfig,
} from "@/lib/types";

// A Supabase service-role client (untyped against generated DB types, which
// this module does not own).
export type ServiceClient = SupabaseClient;

// Minimal shape of a `matches` row we need for matching + scoring.
export interface MatchRow {
  id: string;
  home_team: string | null;
  away_team: string | null;
  kickoff_at: string;
  home_score: number | null;
  away_score: number | null;
  status: MatchStatus;
  provider_match_id: string | null;
}

// ----------------------------------------------------------------------------
// Settings
// ----------------------------------------------------------------------------

/**
 * Load the single `app_settings` row. Falls back to DEFAULT_APP_SETTINGS when
 * the row is missing or malformed so scoring never silently uses wrong values.
 */
export async function loadAppSettings(
  supabase: ServiceClient,
): Promise<AppSettings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("settings")
    .eq("id", 1)
    .single();

  if (error || !data?.settings) return DEFAULT_APP_SETTINGS;

  // Shallow-merge over defaults so a partial row still yields a complete config.
  const s = data.settings as Partial<AppSettings>;
  return {
    ...DEFAULT_APP_SETTINGS,
    ...s,
    scoring: { ...DEFAULT_APP_SETTINGS.scoring, ...(s.scoring ?? {}) },
  };
}

// ----------------------------------------------------------------------------
// Provider <-> DB match matching
// ----------------------------------------------------------------------------

/** Code-pair key for the fallback matcher (team codes are unique per team). */
function codeKey(homeCode: string, awayCode: string): string {
  return `${homeCode.toUpperCase()}|${awayCode.toUpperCase()}`;
}

/** Same-day key tolerant to provider/DB clock skew within the match window. */
function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

interface MatchIndex {
  byProviderId: Map<string, MatchRow>;
  byCodeDay: Map<string, MatchRow[]>;
}

/**
 * Build lookup indexes for our `matches` rows.
 * `teamCodeById` maps team UUID -> 3-letter code so we can match provider rows
 * (which carry codes) to DB rows (which carry team UUIDs).
 */
function indexMatches(
  rows: MatchRow[],
  teamCodeById: Map<string, string>,
): MatchIndex {
  const byProviderId = new Map<string, MatchRow>();
  const byCodeDay = new Map<string, MatchRow[]>();

  for (const m of rows) {
    if (m.provider_match_id) byProviderId.set(m.provider_match_id, m);

    const home = m.home_team ? teamCodeById.get(m.home_team) : undefined;
    const away = m.away_team ? teamCodeById.get(m.away_team) : undefined;
    if (home && away) {
      const k = `${codeKey(home, away)}@${dayKey(m.kickoff_at)}`;
      const bucket = byCodeDay.get(k);
      if (bucket) bucket.push(m);
      else byCodeDay.set(k, [m]);
    }
  }

  return { byProviderId, byCodeDay };
}

/**
 * Resolve a provider match to one of our `matches` rows.
 * Primary key: `provider_match_id`. Fallback: home/away team codes on the same
 * calendar day as kickoff (handles rows seeded before a provider id was known).
 */
function resolveMatch(
  pm: ProviderMatch,
  index: MatchIndex,
): MatchRow | null {
  const direct = index.byProviderId.get(pm.providerId);
  if (direct) return direct;

  const k = `${codeKey(pm.homeTeamCode, pm.awayTeamCode)}@${dayKey(pm.kickoffAt)}`;
  const bucket = index.byCodeDay.get(k);
  if (bucket && bucket.length === 1) return bucket[0];
  // Ambiguous (0 or >1 candidates) -> refuse to guess.
  return null;
}

// ----------------------------------------------------------------------------
// Applying provider results to DB rows (idempotent)
// ----------------------------------------------------------------------------

export interface ApplyResult {
  /** Match rows whose score/status actually changed (need persisting). */
  changedMatchIds: string[];
  /** Match rows that transitioned to (or already are) 'finished' after update. */
  finishedMatchIds: string[];
  /** Provider matches that could not be resolved to a DB row. */
  unmatched: number;
}

/** True when a provider row carries a different score/status than the DB row. */
function differs(row: MatchRow, pm: ProviderMatch): boolean {
  return (
    row.home_score !== pm.homeScore ||
    row.away_score !== pm.awayScore ||
    row.status !== pm.status
  );
}

/**
 * Apply a batch of provider matches onto our `matches` rows.
 *
 * Idempotent: only writes rows whose score/status actually changed. Returns the
 * set of changed rows and which of them are now 'finished' (so the caller knows
 * which matches' predictions to rescore).
 *
 * Also backfills `provider_match_id` on rows matched via the code/day fallback
 * so subsequent polls hit the fast path and never re-match ambiguously.
 */
export async function applyProviderMatches(
  supabase: ServiceClient,
  providerMatches: ProviderMatch[],
  dbMatches: MatchRow[],
  teamCodeById: Map<string, string>,
): Promise<ApplyResult> {
  const index = indexMatches(dbMatches, teamCodeById);
  const changedMatchIds: string[] = [];
  const finishedMatchIds: string[] = [];
  let unmatched = 0;

  for (const pm of providerMatches) {
    const row = resolveMatch(pm, index);
    if (!row) {
      unmatched += 1;
      continue;
    }

    const needsScoreUpdate = differs(row, pm);
    const needsProviderId = !row.provider_match_id;

    if (needsScoreUpdate || needsProviderId) {
      const patch: Record<string, unknown> = {};
      if (needsScoreUpdate) {
        patch.home_score = pm.homeScore;
        patch.away_score = pm.awayScore;
        patch.status = pm.status;
      }
      if (needsProviderId) patch.provider_match_id = pm.providerId;

      const { error } = await supabase
        .from("matches")
        .update(patch)
        .eq("id", row.id);

      if (!error && needsScoreUpdate) {
        changedMatchIds.push(row.id);
        // keep the in-memory row coherent for downstream rescoring
        row.home_score = pm.homeScore;
        row.away_score = pm.awayScore;
        row.status = pm.status;
      }
    }

    if (
      pm.status === "finished" &&
      pm.homeScore !== null &&
      pm.awayScore !== null
    ) {
      finishedMatchIds.push(row.id);
    }
  }

  return { changedMatchIds, finishedMatchIds, unmatched };
}

// ----------------------------------------------------------------------------
// Idempotent rescore — THE critical correctness property
// ----------------------------------------------------------------------------

export interface RescoreResult {
  /** # of predictions whose points_awarded actually changed (and were written). */
  rescored: number;
  /** # of predictions examined across the target matches. */
  examined: number;
  /** Per-prediction deltas (preview-friendly). */
  changes: Array<{
    id: string;
    match_id: string;
    from: number | null;
    to: number | null;
  }>;
}

/**
 * Recompute and (optionally) persist `points_awarded` for every prediction
 * belonging to the given matches.
 *
 * IDEMPOTENT: a prediction is only written when its recomputed value DIFFERS
 * from what is stored. Re-running over already-scored predictions is a no-op,
 * so points are never double-counted. The recompute itself is pure
 * (`recomputePredictionPoints` from lib/scoring) and reads point values from
 * the passed `ScoringConfig` — never hardcoded.
 *
 * @param dryRun when true, compute deltas but DO NOT write (admin 'preview').
 */
export async function rescoreMatches(
  supabase: ServiceClient,
  matchIds: string[],
  scoring: ScoringConfig,
  opts: { dryRun?: boolean } = {},
): Promise<RescoreResult> {
  const empty: RescoreResult = { rescored: 0, examined: 0, changes: [] };
  if (matchIds.length === 0) return empty;

  // Load the matches (need score/status for scoring).
  const { data: matchRows, error: mErr } = await supabase
    .from("matches")
    .select("id, home_score, away_score, status")
    .in("id", matchIds);
  if (mErr || !matchRows) return empty;

  const matchesById = new Map<string, ScorableMatch>();
  for (const m of matchRows as Array<{ id: string } & ScorableMatch>) {
    matchesById.set(m.id, {
      home_score: m.home_score,
      away_score: m.away_score,
      status: m.status,
    });
  }

  // Load predictions for those matches.
  const { data: predRows, error: pErr } = await supabase
    .from("predictions")
    .select("id, match_id, home_pred, away_pred, is_joker, points_awarded")
    .in("match_id", matchIds);
  if (pErr || !predRows) return empty;

  const predictions: IdentifiablePrediction[] = (
    predRows as Array<
      IdentifiablePrediction & { points_awarded: number | null }
    >
  ).map((p) => ({
    id: p.id,
    match_id: p.match_id,
    home_pred: p.home_pred,
    away_pred: p.away_pred,
    is_joker: p.is_joker,
  }));

  const currentById = new Map<string, number | null>();
  for (const p of predRows as Array<{ id: string; points_awarded: number | null }>) {
    currentById.set(p.id, p.points_awarded);
  }

  const recomputed = recomputePredictionPoints(predictions, matchesById, scoring);
  const matchOf = new Map(predictions.map((p) => [p.id, p.match_id] as const));

  const changes: RescoreResult["changes"] = [];
  for (const r of recomputed) {
    const current = currentById.get(r.id) ?? null;
    if (current !== r.points_awarded) {
      changes.push({
        id: r.id,
        match_id: matchOf.get(r.id)!,
        from: current,
        to: r.points_awarded,
      });
    }
  }

  if (opts.dryRun) {
    return { rescored: changes.length, examined: predictions.length, changes };
  }

  // Persist only the changed rows (idempotent write).
  for (const c of changes) {
    await supabase
      .from("predictions")
      .update({ points_awarded: c.to })
      .eq("id", c.id);
  }

  return { rescored: changes.length, examined: predictions.length, changes };
}

// ----------------------------------------------------------------------------
// Standings refresh + audit helpers
// ----------------------------------------------------------------------------

/** Invoke the DB-side `refresh_standings()` RPC (idempotent full rewrite). */
export async function refreshStandings(supabase: ServiceClient): Promise<void> {
  await supabase.rpc("refresh_standings");
}

/** Append an audit_log entry via the `log_audit` RPC. */
export async function logAudit(
  supabase: ServiceClient,
  params: {
    action: string;
    targetType: string;
    targetId?: string | null;
    before?: unknown;
    after?: unknown;
    actorId?: string | null;
  },
): Promise<void> {
  await supabase.rpc("log_audit", {
    p_action: params.action,
    p_target_type: params.targetType,
    p_target_id: params.targetId ?? null,
    p_before: params.before ?? null,
    p_after: params.after ?? null,
    p_actor: params.actorId ?? null,
  });
}

// ----------------------------------------------------------------------------
// Shared loaders
// ----------------------------------------------------------------------------

/** Map of team UUID -> 3-letter code, for provider matching. */
export async function loadTeamCodeById(
  supabase: ServiceClient,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data, error } = await supabase.from("teams").select("id, code");
  if (error || !data) return map;
  for (const t of data as Array<{ id: string; code: string }>) {
    if (t.id && t.code) map.set(t.id, t.code);
  }
  return map;
}

/** Load all `matches` rows we need for matching. */
export async function loadMatchRows(
  supabase: ServiceClient,
  filter?: { ids?: string[] },
): Promise<MatchRow[]> {
  let query = supabase
    .from("matches")
    .select(
      "id, home_team, away_team, kickoff_at, home_score, away_score, status, provider_match_id",
    );
  if (filter?.ids && filter.ids.length > 0) {
    query = query.in("id", filter.ids);
  }
  const { data, error } = await query;
  if (error || !data) return [];
  return data as MatchRow[];
}

/** Ids of all matches currently marked 'finished' with a recorded score. */
export async function loadFinishedMatchIds(
  supabase: ServiceClient,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("id")
    .eq("status", "finished")
    .not("home_score", "is", null)
    .not("away_score", "is", null);
  if (error || !data) return [];
  return (data as Array<{ id: string }>).map((m) => m.id);
}
