// pure — no I/O
// ============================================================================
// "La Etapa" — animated race-replay timeline of the general classification.
//
// Rebuilds the WHOLE race, jornada by jornada, from the scored ledger — no
// historical snapshot exists in the DB (standings_cache is a MERGE-in-place
// cache), so every stage is recomputed deterministically from data that does
// carry a timeline. See docs/decisions/0024-etapa-animada.md.
//
// One stage per jornada (UTC calendar day of kickoff, same derivation as
// `matchdayKey` in app/_lib/data.ts) with >= 1 finished match. Attribution of
// each points source to a stage:
//
//  - predictions.points_awarded → the jornada of the match's kickoff.
//  - round_awards               → the jornada in which the round's LAST
//    finished match was played (awards settle when the round closes, ADR-0018).
//  - bonus_answers              → the jornada of the question's locks_at
//    (grading has no reliable history; the lock timestamp is stable).
//  - point_adjustments          → the jornada of created_at.
//
// Sources dated before the first stage count from stage 1; sources dated after
// the LAST stage fold into the last stage, so the final stage always matches
// the current standings exactly (coherence guarantee, asserted in the spec).
//
// Known caveat (accepted, documented in the ADR): predictions.points_awarded
// reflects the CURRENT scoring config — a full recalc rewrites history, so the
// race is always retold under today's rules.
// ============================================================================

import { isExact, roundKeyForMatch } from "@/lib/scoring";
import type {
  BonusAnswer,
  BonusQuestion,
  EtapaGroupInfo,
  EtapaHighlight,
  EtapaMatchResult,
  EtapaOvertake,
  EtapaPose,
  EtapaRider,
  EtapaStage,
  EtapaTimeline,
  MaillotKey,
  Match,
  PelotonGroupKey,
  PointAdjustment,
  Prediction,
  RoundAward,
  StandingRow,
  Team,
} from "@/lib/types";
import { groupPeloton, type PelotonOptions } from "./peloton";
import { computeRegularity } from "./regularity";
import { computeMontana } from "./montana";
import { assignAstons, assignMaillots, sortGeneral } from "./maillots";

/**
 * When a rider holds several maillots the scene draws ONE jersey: the first
 * hit in this order. Classification jerseys (amarillo/arcoíris/lunares/verde/
 * blanco) beat the azul (meta volante) — winning a sprint never hides a
 * leader's jersey; roster jerseys and the farolillo close the list. The full
 * set still travels in `EtapaRider.maillots` for chips/legends.
 */
export const MAILLOT_PRIORITY: readonly MaillotKey[] = [
  "amarillo",
  "arcoiris",
  "lunares",
  "verde",
  "blanco",
  "azul",
  "extremadura",
  "monars",
  "rojo",
];

/** Number of default-kit palette slots the scene offers (see EtapaRider.kit). */
export const KIT_PALETTE_SIZE = 8;

// Scene layout constants (road units, 0..100).
const RIDER_DX = 3; // spacing between riders inside a group
const GROUP_GAP_BASE = 7; // minimum visual gap between groups
const GROUP_GAP_SCALE = 1.6; // extra gap per sqrt(point gap)
const GROUP_GAP_MAX = 22; // cap so a huge gap never empties the screen
const ROAD_FRONT = 92; // x of the race leader (room ahead for the finish)
const ROAD_SPAN = 84; // max span front→tail before compressing

type LedgerPrediction = Pick<
  Prediction,
  "user_id" | "match_id" | "home_pred" | "away_pred" | "points_awarded"
>;

export interface EtapaTimelineInput {
  /** Current standings — the roster (names/avatars); totals are NOT trusted. */
  standings: StandingRow[];
  matches: Match[];
  teams: Pick<Team, "id" | "code">[];
  predictions: LedgerPrediction[];
  roundAwards: Pick<RoundAward, "round_key" | "user_id" | "points" | "round_points" | "created_at">[];
  bonusAnswers: Pick<BonusAnswer, "user_id" | "question_id" | "points_awarded">[];
  bonusQuestions: Pick<BonusQuestion, "id" | "locks_at">[];
  adjustments: Pick<PointAdjustment, "user_id" | "points" | "created_at">[];
  emailByUserId: Record<string, string>;
  createdAt: Record<string, string>;
  options?: PelotonOptions;
}

/** Jornada key: UTC calendar date. Mirrors `matchdayKey` (app/_lib/data.ts). */
function jornadaKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Deterministic 0..7 palette index for a rider's default kit. */
export function kitIndex(userId: string): number {
  let h = 5381;
  for (let i = 0; i < userId.length; i++) {
    h = ((h << 5) + h + userId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % KIT_PALETTE_SIZE;
}

/** First stage key >= `key`; sources beyond the last stage fold into the last. */
function bucketStage(stageKeys: string[], key: string): string {
  for (const k of stageKeys) {
    if (key <= k) return k;
  }
  return stageKeys[stageKeys.length - 1];
}

interface UserAgg {
  pred: number;
  exact: number;
  bonus: number;
  meta: number;
  adj: number;
}

export function buildEtapaTimeline(input: EtapaTimelineInput): EtapaTimeline {
  const {
    standings: roster,
    matches,
    teams,
    predictions,
    roundAwards,
    bonusAnswers,
    bonusQuestions,
    adjustments,
    emailByUserId,
    createdAt,
    options,
  } = input;

  const finished = matches.filter(
    (m) =>
      m.status === "finished" && m.home_score !== null && m.away_score !== null,
  );
  if (roster.length === 0 || finished.length === 0) return { stages: [] };

  // Stage keys: unique jornadas with finished matches, chronological.
  const stageKeys = Array.from(
    new Set(finished.map((m) => jornadaKey(m.kickoff_at))),
  ).sort();

  const finishedById = new Map(finished.map((m) => [m.id, m]));
  const teamCode = new Map(teams.map((t) => [t.id, t.code]));

  // --- Bucket every points source into its stage ---------------------------

  // Finished matches per stage (by kickoff jornada — always a stage key).
  const matchesByStage = new Map<string, Match[]>();
  for (const m of finished) {
    const k = jornadaKey(m.kickoff_at);
    const list = matchesByStage.get(k);
    if (list) list.push(m);
    else matchesByStage.set(k, [m]);
  }

  // Predictions per stage (via their match).
  const predsByStage = new Map<string, LedgerPrediction[]>();
  for (const p of predictions) {
    const m = finishedById.get(p.match_id);
    if (!m) continue;
    const k = jornadaKey(m.kickoff_at);
    const list = predsByStage.get(k);
    if (list) list.push(p);
    else predsByStage.set(k, [p]);
  }

  // Round awards → jornada of the round's last finished match; fallback to
  // created_at if the round has no finished match (data oddity).
  const roundLastJornada = new Map<string, string>();
  for (const m of finished) {
    let key: string;
    try {
      key = roundKeyForMatch(m);
    } catch {
      continue;
    }
    const j = jornadaKey(m.kickoff_at);
    const prev = roundLastJornada.get(key);
    if (prev === undefined || j > prev) roundLastJornada.set(key, j);
  }
  const awardsByStage = new Map<string, EtapaTimelineInput["roundAwards"]>();
  for (const a of roundAwards) {
    const j = roundLastJornada.get(a.round_key) ?? jornadaKey(a.created_at);
    const k = bucketStage(stageKeys, j);
    const list = awardsByStage.get(k);
    if (list) list.push(a);
    else awardsByStage.set(k, [a]);
  }

  // Bonus answers → jornada of the question's locks_at.
  const lockByQuestion = new Map(
    bonusQuestions.map((q) => [q.id, jornadaKey(q.locks_at)]),
  );
  const bonusByStage = new Map<string, EtapaTimelineInput["bonusAnswers"]>();
  for (const b of bonusAnswers) {
    if (b.points_awarded === null) continue;
    const lock = lockByQuestion.get(b.question_id);
    const k = bucketStage(stageKeys, lock ?? stageKeys[stageKeys.length - 1]);
    const list = bonusByStage.get(k);
    if (list) list.push(b);
    else bonusByStage.set(k, [b]);
  }

  // Adjustments → jornada of created_at.
  const adjByStage = new Map<string, EtapaTimelineInput["adjustments"]>();
  for (const a of adjustments) {
    const k = bucketStage(stageKeys, jornadaKey(a.created_at));
    const list = adjByStage.get(k);
    if (list) list.push(a);
    else adjByStage.set(k, [a]);
  }

  // --- Walk the stages accumulating the race state -------------------------

  const agg = new Map<string, UserAgg>();
  for (const s of roster) {
    agg.set(s.user_id, { pred: 0, exact: 0, bonus: 0, meta: 0, adj: 0 });
  }
  const touch = (userId: string): UserAgg | undefined => agg.get(userId);

  // Cumulative inputs for the per-stage regularity/montaña recomputation.
  const finishedSoFar = new Set<string>();
  const bonusSoFar: EtapaTimelineInput["bonusAnswers"] = [];
  const awardsSoFar: EtapaTimelineInput["roundAwards"] = [];

  const stages: EtapaStage[] = [];
  let prevPosition: Map<string, number> | null = null;
  let prevTotals: Map<string, { total: number; exact: number }> | null = null;

  for (let i = 0; i < stageKeys.length; i++) {
    const key = stageKeys[i];

    // 1. Fold this jornada's sources into the running aggregates.
    for (const m of matchesByStage.get(key) ?? []) finishedSoFar.add(m.id);
    for (const p of predsByStage.get(key) ?? []) {
      const a = touch(p.user_id);
      if (!a) continue;
      a.pred += p.points_awarded ?? 0;
      const m = finishedById.get(p.match_id)!;
      if (
        isExact(
          p.home_pred,
          p.away_pred,
          m.home_score as number,
          m.away_score as number,
        )
      ) {
        a.exact += 1;
      }
    }
    for (const b of bonusByStage.get(key) ?? []) {
      const a = touch(b.user_id);
      if (a) a.bonus += b.points_awarded ?? 0;
      bonusSoFar.push(b);
    }
    for (const aw of awardsByStage.get(key) ?? []) {
      const a = touch(aw.user_id);
      if (a) a.meta += aw.points;
      awardsSoFar.push(aw);
    }
    for (const ad of adjByStage.get(key) ?? []) {
      const a = touch(ad.user_id);
      if (a) a.adj += ad.points;
    }

    // 2. Standings as-of this stage (same ranking rule as refresh_standings:
    //    total desc → exact desc → bonus desc, competition ranks).
    const rows: StandingRow[] = roster.map((s) => {
      const a = agg.get(s.user_id)!;
      return {
        user_id: s.user_id,
        display_name: s.display_name,
        avatar: s.avatar,
        total_points: a.pred + a.bonus + a.meta + a.adj,
        exact_hits: a.exact,
        bonus_points: a.bonus,
        meta_points: a.meta,
        adjustment_points: a.adj,
        rank: 0,
      };
    });
    rows.sort(
      (a, b) =>
        b.total_points - a.total_points ||
        b.exact_hits - a.exact_hits ||
        b.bonus_points - a.bonus_points,
    );
    for (let r = 0; r < rows.length; r++) {
      const prev = r > 0 ? rows[r - 1] : null;
      rows[r].rank =
        prev &&
        prev.total_points === rows[r].total_points &&
        prev.exact_hits === rows[r].exact_hits &&
        prev.bonus_points === rows[r].bonus_points
          ? prev.rank
          : r + 1;
    }
    const general = sortGeneral(rows, createdAt);
    const positionOf = new Map(general.map((s, idx) => [s.user_id, idx + 1]));

    // 3. Classifications as-of this stage (canonical pure fns over a view of
    //    the world where only matches finished SO FAR count as finished).
    const matchesAsOf = matches.map((m) =>
      m.status === "finished" && !finishedSoFar.has(m.id)
        ? { ...m, status: "scheduled" as const }
        : m,
    );
    const regularity = computeRegularity({
      standings: rows,
      predictions,
      matches: matchesAsOf,
      bonusAnswers: bonusSoFar,
      roundAwards: awardsSoFar,
      createdAt,
    });
    const montana = computeMontana({
      standings: rows,
      matches: matchesAsOf,
      predictions,
      createdAt,
    });
    const maillots = assignMaillots({
      standings: rows,
      regularity,
      montana: montana.rows,
      emailByUserId,
      createdAt,
      roundAwards: awardsSoFar,
    });
    const astons = new Set(assignAstons(general));
    const groups = groupPeloton(general, options);

    // 4. Scene layout: groups front→back along the road, riders in echelon.
    const xByUser = new Map<string, number>();
    const laneByUser = new Map<string, number>();
    const groupByUser = new Map<string, PelotonGroupKey>();
    let raw = 0;
    for (let g = 0; g < groups.length; g++) {
      const group = groups[g];
      if (g > 0) {
        raw +=
          GROUP_GAP_BASE +
          Math.min(GROUP_GAP_MAX, Math.sqrt(group.gapToPrev) * GROUP_GAP_SCALE);
      }
      group.riders.forEach((rider, idx) => {
        xByUser.set(rider.user_id, raw + idx * RIDER_DX);
        laneByUser.set(rider.user_id, idx % 3);
        groupByUser.set(rider.user_id, group.key);
      });
      raw += (group.riders.length - 1) * RIDER_DX;
    }
    const scale = raw > 0 ? Math.min(1, ROAD_SPAN / raw) : 1;

    const rezagados = new Set(
      groups.find((g) => g.key === "rezagados")?.riders.map((r) => r.user_id) ??
        [],
    );

    const riders: EtapaRider[] = general.map((s, idx) => {
      const held = maillots[s.user_id] ?? [];
      const jersey =
        MAILLOT_PRIORITY.find((k) => held.includes(k)) ?? null;
      const pose: EtapaPose =
        idx === 0 && s.total_points > 0
          ? "crono"
          : rezagados.has(s.user_id)
            ? "lengua"
            : "normal";
      return {
        user_id: s.user_id,
        display_name: s.display_name,
        position: idx + 1,
        total_points: s.total_points,
        x: Math.round((ROAD_FRONT - (xByUser.get(s.user_id) ?? 0) * scale) * 100) / 100,
        lane: laneByUser.get(s.user_id) ?? 0,
        group: groupByUser.get(s.user_id) ?? "peloton",
        jersey,
        kit: kitIndex(s.user_id),
        maillots: held,
        pose,
        aston: astons.has(s.user_id),
        farolillo: held.includes("rojo"),
      };
    });

    const groupInfos: EtapaGroupInfo[] = groups.map((g) => ({
      key: g.key,
      size: g.riders.length,
      gapToLeader: g.gapToLeader,
    }));

    // 5. Ticker: the jornada's results + biggest point gains.
    const stageMatches: EtapaMatchResult[] = (matchesByStage.get(key) ?? [])
      .slice()
      .sort((a, b) => (a.kickoff_at < b.kickoff_at ? -1 : 1))
      .map((m) => ({
        id: m.id,
        label: `${teamCode.get(m.home_team) ?? "TBD"} ${m.home_score}-${m.away_score} ${teamCode.get(m.away_team) ?? "TBD"}`,
        is_joker: m.is_joker,
        montana: m.montana_stage !== null,
      }));

    const highlights: EtapaHighlight[] = general
      .map((s) => {
        const prev = prevTotals?.get(s.user_id) ?? { total: 0, exact: 0 };
        return {
          user_id: s.user_id,
          display_name: s.display_name,
          points: s.total_points - prev.total,
          exacts: s.exact_hits - prev.exact,
        };
      })
      .filter((h) => h.points > 0)
      .sort(
        (a, b) =>
          b.points - a.points ||
          b.exacts - a.exacts ||
          (a.display_name < b.display_name ? -1 : 1),
      )
      .slice(0, 3);

    // 6. Overtakes vs the previous stage (positions that improved).
    const overtakes: EtapaOvertake[] = [];
    if (prevPosition) {
      for (const s of general) {
        const from = prevPosition.get(s.user_id);
        const to = positionOf.get(s.user_id)!;
        if (from !== undefined && to < from) {
          overtakes.push({
            user_id: s.user_id,
            display_name: s.display_name,
            from,
            to,
            gained: from - to,
          });
        }
      }
      // Smallest gain first → the movie saves the biggest move for last.
      overtakes.sort((a, b) => a.gained - b.gained || a.to - b.to);
    }

    stages.push({
      key,
      index: i + 1,
      montana: stageMatches.some((m) => m.montana),
      matches: stageMatches,
      highlights,
      riders,
      groups: groupInfos,
      overtakes,
    });

    prevPosition = positionOf;
    prevTotals = new Map(
      general.map((s) => [
        s.user_id,
        { total: s.total_points, exact: s.exact_hits },
      ]),
    );
  }

  return { stages };
}
