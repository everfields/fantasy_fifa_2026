// pure — no I/O
// ============================================================================
// Montaña classification (maillot de lunares) + automatic etapa selection.
//
// Montaña matches are those with `montana_stage != null`. Points = Σ
// points_awarded on the FINISHED ones; exact_hits via `isExact` (imported from
// lib/scoring — never duplicated) over those same matches. One row per user
// present in standings. Order: points desc → exact_hits desc → created_at asc;
// competition ranking (ties share rank).
//
// `pickMontanaStages` auto-selects which matches become montaña etapas. It is
// deterministic, documented inline, and INCREMENTAL: it never touches etapas
// that already have matches, only filling free etapa numbers.
// ============================================================================

import { isExact } from "@/lib/scoring";
import type {
  StandingRow,
  Match,
  Prediction,
  MontanaRow,
  MontanaEtapa,
} from "@/lib/types";

export function computeMontana(input: {
  standings: StandingRow[];
  matches: Match[];
  predictions: Pick<
    Prediction,
    "user_id" | "match_id" | "home_pred" | "away_pred" | "points_awarded"
  >[];
  createdAt: Record<string, string>;
}): { rows: MontanaRow[]; etapas: MontanaEtapa[] } {
  const { standings, matches, predictions, createdAt } = input;

  const montanaMatches = matches.filter((m) => m.montana_stage !== null);
  const finishedById = new Map<string, Match>();
  for (const m of montanaMatches) {
    if (m.status === "finished") finishedById.set(m.id, m);
  }

  const points = new Map<string, number>();
  const exact = new Map<string, number>();

  for (const p of predictions) {
    const m = finishedById.get(p.match_id);
    if (!m) continue;
    if (p.points_awarded !== null) {
      points.set(p.user_id, (points.get(p.user_id) ?? 0) + p.points_awarded);
    }
    if (
      m.home_score !== null &&
      m.away_score !== null &&
      isExact(p.home_pred, p.away_pred, m.home_score, m.away_score)
    ) {
      exact.set(p.user_id, (exact.get(p.user_id) ?? 0) + 1);
    }
  }

  const rows: MontanaRow[] = standings.map((s) => ({
    user_id: s.user_id,
    display_name: s.display_name,
    avatar: s.avatar,
    points: points.get(s.user_id) ?? 0,
    exact_hits: exact.get(s.user_id) ?? 0,
    rank: 0,
  }));

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.exact_hits !== a.exact_hits) return b.exact_hits - a.exact_hits;
    const ca = createdAt[a.user_id] ?? "";
    const cb = createdAt[b.user_id] ?? "";
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  });

  for (let i = 0; i < rows.length; i++) {
    if (i === 0) {
      rows[i].rank = 1;
      continue;
    }
    const prev = rows[i - 1];
    const cur = rows[i];
    rows[i].rank =
      prev.points === cur.points && prev.exact_hits === cur.exact_hits
        ? prev.rank
        : i + 1;
  }

  // etapas: group by montana_stage asc, matches by kickoff asc, finished = all.
  const byStage = new Map<number, Match[]>();
  for (const m of montanaMatches) {
    const s = m.montana_stage as number;
    if (!byStage.has(s)) byStage.set(s, []);
    byStage.get(s)!.push(m);
  }
  const etapas: MontanaEtapa[] = Array.from(byStage.keys())
    .sort((a, b) => a - b)
    .map((stage) => {
      const ms = byStage
        .get(stage)!
        .slice()
        .sort((a, b) =>
          a.kickoff_at < b.kickoff_at ? -1 : a.kickoff_at > b.kickoff_at ? 1 : 0,
        );
      return {
        stage,
        matches: ms,
        finished: ms.every((m) => m.status === "finished"),
      };
    });

  return { rows, etapas };
}

// ----------------------------------------------------------------------------
// Automatic etapa selection
// ----------------------------------------------------------------------------

export interface PickableMatch
  extends Pick<
    Match,
    "id" | "stage" | "status" | "kickoff_at" | "is_joker" | "montana_stage"
  > {
  home_code: string | null; // FIFA code or null if the team is not yet known
  away_code: string | null;
}

// Madrid is UTC+2 in summer (the World Cup is in June/July). We use a fixed
// offset rather than a tz library to stay pure & deterministic.
const MADRID_OFFSET_MS = 2 * 60 * 60 * 1000;

const ELIGIBLE_STAGES = new Set(["group", "round_of_32", "round_of_16"]);

/** Madrid natural day (YYYY-MM-DD) for an ISO timestamp, fixed +2 offset. */
function madridDay(iso: string): string {
  const d = new Date(new Date(iso).getTime() + MADRID_OFFSET_MS);
  return d.toISOString().slice(0, 10);
}

/** Whole days between two YYYY-MM-DD strings (absolute). */
function dayDistance(a: string, b: string): number {
  const da = Date.parse(a + "T00:00:00Z");
  const db = Date.parse(b + "T00:00:00Z");
  return Math.abs(Math.round((da - db) / 86_400_000));
}

/**
 * Select montaña etapas automatically, incrementally and deterministically.
 *
 *  - Respects existing assignments: etapa numbers (1..totalStages) that already
 *    have a match keep them; this function only returns NEW assignments for the
 *    still-free etapa numbers.
 *  - Eligible match: stage ∈ {group, round_of_32, round_of_16} (NEVER
 *    quarter/semi/third_place/final), !is_joker, status === "scheduled", both
 *    team codes known and neither === "ESP" (Spain matches are NEVER montaña),
 *    kickoff >= now + minLeadHours, montana_stage === null.
 *  - Group eligible matches by Madrid natural day (+2 fixed offset).
 *  - Spread the target days uniformly across [first eligible day, last eligible
 *    day] for the remaining etapas; for each target pick the CLOSEST day with
 *    >= matchesPerStage eligible matches that is >= 2 days from any already
 *    chosen/existing etapa day; from that day take the matchesPerStage matches
 *    with the LATEST kickoff (the weird small-hours slots are the fun ones).
 *    If no day qualifies, that etapa stays unassigned (admin re-runs once the
 *    bracket is filled — more eligibles appear).
 *  - Never assigns more than totalStages etapas total, nor duplicate numbers.
 */
export function pickMontanaStages(
  matches: PickableMatch[],
  opts: {
    now: Date;
    totalStages?: number;
    matchesPerStage?: number;
    minLeadHours?: number;
  },
): { match_id: string; montana_stage: number }[] {
  const totalStages = opts.totalStages ?? 7;
  const matchesPerStage = opts.matchesPerStage ?? 3;
  const minLeadHours = opts.minLeadHours ?? 24;
  const now = opts.now;

  // Existing etapa numbers (already assigned) and their Madrid days.
  const usedStages = new Set<number>();
  const existingDays: string[] = [];
  for (const m of matches) {
    if (m.montana_stage !== null) {
      usedStages.add(m.montana_stage);
      existingDays.push(madridDay(m.kickoff_at));
    }
  }

  const freeStages: number[] = [];
  for (let n = 1; n <= totalStages; n++) {
    if (!usedStages.has(n)) freeStages.push(n);
  }
  if (freeStages.length === 0) return [];

  const minKickoff = now.getTime() + minLeadHours * 60 * 60 * 1000;

  const eligible = matches.filter((m) => {
    if (m.montana_stage !== null) return false;
    if (!ELIGIBLE_STAGES.has(m.stage)) return false;
    if (m.is_joker) return false;
    if (m.status !== "scheduled") return false;
    if (!m.home_code || !m.away_code) return false;
    if (m.home_code === "ESP" || m.away_code === "ESP") return false;
    if (new Date(m.kickoff_at).getTime() < minKickoff) return false;
    return true;
  });
  if (eligible.length === 0) return [];

  // Group eligible matches by Madrid day.
  const byDay = new Map<string, PickableMatch[]>();
  for (const m of eligible) {
    const day = madridDay(m.kickoff_at);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(m);
  }
  const candidateDays = Array.from(byDay.keys())
    .filter((d) => byDay.get(d)!.length >= matchesPerStage)
    .sort();
  if (candidateDays.length === 0) return [];

  const firstDay = candidateDays[0];
  const lastDay = candidateDays[candidateDays.length - 1];

  const remaining = freeStages.length;
  const chosenDays: string[] = [...existingDays];
  const assignments: { match_id: string; montana_stage: number }[] = [];

  // Uniformly spread targets across [firstDay, lastDay].
  const span = dayDistance(lastDay, firstDay);
  const firstMs = Date.parse(firstDay + "T00:00:00Z");

  for (let i = 0; i < remaining; i++) {
    const stageNum = freeStages[i];
    const frac = remaining === 1 ? 0 : i / (remaining - 1);
    const targetMs = firstMs + Math.round(frac * span) * 86_400_000;
    const targetDay = new Date(targetMs).toISOString().slice(0, 10);

    // Pick the closest candidate day that is >=2 days from any chosen/existing
    // day and not already used in this run.
    let bestDay: string | null = null;
    let bestDist = Infinity;
    for (const d of candidateDays) {
      if (chosenDays.includes(d)) continue;
      const tooClose = chosenDays.some((cd) => dayDistance(d, cd) < 2);
      if (tooClose) continue;
      const dist = dayDistance(d, targetDay);
      if (dist < bestDist) {
        bestDist = dist;
        bestDay = d;
      }
    }

    if (bestDay === null) continue; // unassigned this run

    const dayMatches = byDay
      .get(bestDay)!
      .slice()
      .sort((a, b) =>
        a.kickoff_at < b.kickoff_at ? 1 : a.kickoff_at > b.kickoff_at ? -1 : 0,
      ) // latest first
      .slice(0, matchesPerStage);

    for (const m of dayMatches) {
      assignments.push({ match_id: m.id, montana_stage: stageNum });
    }
    chosenDays.push(bestDay);
  }

  return assignments;
}
