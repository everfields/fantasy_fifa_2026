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

import {
  recomputePredictionPoints,
  pickRoundWinners,
  roundKeyForMatch,
} from "@/lib/scoring";
import type {
  IdentifiablePrediction,
  ScorableMatch,
  RoundEntry,
  RoundWinner,
} from "@/lib/scoring";
import type { ProviderMatch } from "@/lib/providers";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AppSettings,
  DEFAULT_APP_SETTINGS,
  MatchStatus,
  RoundKey,
  Stage,
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
  byDbId: Map<string, MatchRow>;
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
  const byDbId = new Map<string, MatchRow>();
  const byProviderId = new Map<string, MatchRow>();
  const byCodeDay = new Map<string, MatchRow[]>();

  for (const m of rows) {
    byDbId.set(m.id, m);
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

  return { byDbId, byProviderId, byCodeDay };
}

/**
 * Resolve a provider match to one of our `matches` rows.
 * Primary key: our own `matches.id` (providers like LlmWebSearchProvider set
 * `providerId` to the DB row id directly — ADR-0009). Then `provider_match_id`
 * (external providers). Fallback: home/away team codes on the same calendar day
 * as kickoff (handles rows seeded before a provider id was known).
 */
function resolveMatch(
  pm: ProviderMatch,
  index: MatchIndex,
): MatchRow | null {
  const byId = index.byDbId.get(pm.providerId);
  if (byId) return byId;

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

  // Load the matches (need score/status/is_joker for scoring).
  const { data: matchRows, error: mErr } = await supabase
    .from("matches")
    .select("id, home_score, away_score, status, is_joker")
    .in("id", matchIds);
  if (mErr || !matchRows) return empty;

  const matchesById = new Map<string, ScorableMatch>();
  for (const m of matchRows as Array<{ id: string } & ScorableMatch>) {
    matchesById.set(m.id, {
      home_score: m.home_score,
      away_score: m.away_score,
      status: m.status,
      is_joker: m.is_joker,
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

// ----------------------------------------------------------------------------
// Meta-volante (round-champion) round awards — IDEMPOTENT recompute
// ----------------------------------------------------------------------------

/** Minimal `matches` shape needed to bucket matches into rounds + score them. */
interface RoundMatchRow {
  id: string;
  stage: Stage;
  matchday: number | null;
  status: MatchStatus;
  home_score: number | null;
  away_score: number | null;
}

/** Minimal `predictions` shape needed to tally per-user round performance. */
interface RoundPredictionRow {
  user_id: string;
  match_id: string;
  home_pred: number;
  away_pred: number;
  points_awarded: number | null;
}

/** A single desired round_awards row (after recompute). */
export interface DesiredRoundAward {
  round_key: RoundKey;
  user_id: string;
  points: number;
  round_points: number;
}

export interface RoundAwardsResult {
  /** Desired award rows across all ELIGIBLE (fully-finished) rounds. */
  desired: DesiredRoundAward[];
  /** round_keys that are eligible (all their matches are finished). */
  eligibleRounds: RoundKey[];
  /**
   * Number of award rows that would change vs. what's currently stored:
   * additions + removals + points/round_points changes. Restricted to the
   * eligible rounds we recompute (we never touch rounds that aren't complete).
   */
  awardsAffected: number;
  /** Per-round diff detail (preview-friendly, bounded by caller if needed). */
  changes: Array<{
    round_key: RoundKey;
    user_id: string;
    kind: "add" | "remove" | "change";
    from: { points: number; round_points: number } | null;
    to: { points: number; round_points: number } | null;
  }>;
}

/**
 * Recompute the "meta volante" round-champion awards across ALL rounds and,
 * unless `dryRun`, persist them IDEMPOTENTLY.
 *
 * Eligibility: a round contributes awards ONLY when every one of its matches is
 * `status = 'finished'` (the round is complete). Incomplete rounds award
 * nothing yet AND are left untouched in the DB (we never delete awards for a
 * round we are not recomputing — although a complete round can never become
 * incomplete in normal operation).
 *
 * Per eligible round we build per-user entries:
 *   round_points = sum of the user's points_awarded over the round's finished
 *                  matches; exact_hits = count of exact-scoreline predictions
 *   in those matches. `pickRoundWinners` then selects the champion(s).
 *
 * IDEMPOTENT persistence: for each eligible round we compare desired winners to
 * the stored rows. We upsert changed/added rows and delete stragglers. Running
 * twice with no underlying change writes nothing — never double-counts.
 */
export async function recomputeRoundAwards(
  supabase: ServiceClient,
  scoring: ScoringConfig,
  metaVolantePoints: number,
  opts: { dryRun?: boolean } = {},
): Promise<RoundAwardsResult> {
  const empty: RoundAwardsResult = {
    desired: [],
    eligibleRounds: [],
    awardsAffected: 0,
    changes: [],
  };

  // 1. Load all matches (need stage/matchday for round-keying + score/status).
  const { data: matchData, error: mErr } = await supabase
    .from("matches")
    .select("id, stage, matchday, status, home_score, away_score");
  if (mErr || !matchData) return empty;
  const matches = matchData as RoundMatchRow[];

  if (matches.length === 0) return empty;

  // 2. Bucket matches by round key; track completeness.
  const roundMatches = new Map<RoundKey, RoundMatchRow[]>();
  for (const m of matches) {
    let key: RoundKey;
    try {
      key = roundKeyForMatch({ stage: m.stage, matchday: m.matchday });
    } catch {
      // A group match with a missing matchday is a data error; skip it rather
      // than corrupt an entire round bucket.
      continue;
    }
    const bucket = roundMatches.get(key);
    if (bucket) bucket.push(m);
    else roundMatches.set(key, [m]);
  }

  // 3. Determine eligible rounds (ALL matches finished with recorded scores).
  const eligibleRounds: RoundKey[] = [];
  const eligibleMatchIds = new Set<string>();
  const matchIdToRound = new Map<string, RoundKey>();
  for (const [key, ms] of roundMatches) {
    const allFinished = ms.every(
      (m) =>
        m.status === "finished" &&
        m.home_score !== null &&
        m.away_score !== null,
    );
    if (!allFinished) continue;
    eligibleRounds.push(key);
    for (const m of ms) {
      eligibleMatchIds.add(m.id);
      matchIdToRound.set(m.id, key);
    }
  }

  if (eligibleRounds.length === 0) {
    // No complete rounds → no awards to compute; nothing to write.
    return { ...empty, eligibleRounds: [] };
  }

  // Score lookup for exact-hit detection per match.
  const scoreById = new Map<
    string,
    { home_score: number; away_score: number }
  >();
  for (const m of matches) {
    if (
      eligibleMatchIds.has(m.id) &&
      m.home_score !== null &&
      m.away_score !== null
    ) {
      scoreById.set(m.id, {
        home_score: m.home_score,
        away_score: m.away_score,
      });
    }
  }

  // 4. Load predictions for the eligible matches.
  const { data: predData, error: pErr } = await supabase
    .from("predictions")
    .select("user_id, match_id, home_pred, away_pred, points_awarded")
    .in("match_id", Array.from(eligibleMatchIds));
  if (pErr) return empty;
  const predictions = (predData ?? []) as RoundPredictionRow[];

  // 5. Tally per-round, per-user entries.
  //    round -> user -> { round_points, exact_hits }
  const perRound = new Map<
    RoundKey,
    Map<string, { round_points: number; exact_hits: number }>
  >();
  for (const key of eligibleRounds) {
    perRound.set(key, new Map());
  }

  for (const p of predictions) {
    const key = matchIdToRound.get(p.match_id);
    if (!key) continue;
    const userMap = perRound.get(key)!;
    let entry = userMap.get(p.user_id);
    if (!entry) {
      entry = { round_points: 0, exact_hits: 0 };
      userMap.set(p.user_id, entry);
    }
    entry.round_points += p.points_awarded ?? 0;
    const score = scoreById.get(p.match_id);
    if (
      score &&
      p.home_pred === score.home_score &&
      p.away_pred === score.away_score
    ) {
      entry.exact_hits += 1;
    }
  }

  // 6. Pick winners per eligible round → desired award rows.
  const desired: DesiredRoundAward[] = [];
  for (const key of eligibleRounds) {
    const userMap = perRound.get(key)!;
    const entries: RoundEntry[] = Array.from(userMap.entries()).map(
      ([user_id, v]) => ({
        user_id,
        round_points: v.round_points,
        exact_hits: v.exact_hits,
      }),
    );
    const winners: RoundWinner[] = pickRoundWinners(entries, metaVolantePoints);
    for (const w of winners) {
      desired.push({
        round_key: key,
        user_id: w.user_id,
        points: w.points,
        round_points: w.round_points,
      });
    }
  }

  // 7. Load existing round_awards for the eligible rounds and diff.
  const { data: existingData, error: eErr } = await supabase
    .from("round_awards")
    .select("round_key, user_id, points, round_points")
    .in("round_key", eligibleRounds);
  if (eErr) return empty;
  const existing = (existingData ?? []) as DesiredRoundAward[];

  const keyOf = (r: { round_key: string; user_id: string }) =>
    `${r.round_key}|${r.user_id}`;

  const existingByKey = new Map<string, DesiredRoundAward>();
  for (const r of existing) existingByKey.set(keyOf(r), r);

  const desiredByKey = new Map<string, DesiredRoundAward>();
  for (const r of desired) desiredByKey.set(keyOf(r), r);

  const changes: RoundAwardsResult["changes"] = [];

  // Adds / changes.
  for (const [k, d] of desiredByKey) {
    const prev = existingByKey.get(k);
    if (!prev) {
      changes.push({
        round_key: d.round_key,
        user_id: d.user_id,
        kind: "add",
        from: null,
        to: { points: d.points, round_points: d.round_points },
      });
    } else if (
      prev.points !== d.points ||
      prev.round_points !== d.round_points
    ) {
      changes.push({
        round_key: d.round_key,
        user_id: d.user_id,
        kind: "change",
        from: { points: prev.points, round_points: prev.round_points },
        to: { points: d.points, round_points: d.round_points },
      });
    }
  }

  // Removals (existing rows in eligible rounds that are no longer winners).
  for (const [k, prev] of existingByKey) {
    if (!desiredByKey.has(k)) {
      changes.push({
        round_key: prev.round_key,
        user_id: prev.user_id,
        kind: "remove",
        from: { points: prev.points, round_points: prev.round_points },
        to: null,
      });
    }
  }

  const result: RoundAwardsResult = {
    desired,
    eligibleRounds,
    awardsAffected: changes.length,
    changes,
  };

  if (opts.dryRun || changes.length === 0) return result;

  // 8. Persist IDEMPOTENTLY.
  //    a. Upsert all desired rows (unique on (round_key, user_id)).
  if (desired.length > 0) {
    await supabase
      .from("round_awards")
      .upsert(
        desired.map((d) => ({
          round_key: d.round_key,
          user_id: d.user_id,
          points: d.points,
          round_points: d.round_points,
        })),
        { onConflict: "round_key,user_id" },
      );
  }

  //    b. Delete stragglers: existing rows in eligible rounds no longer desired.
  const toDelete = changes.filter((c) => c.kind === "remove");
  for (const c of toDelete) {
    await supabase
      .from("round_awards")
      .delete()
      .eq("round_key", c.round_key)
      .eq("user_id", c.user_id);
  }

  return result;
}
