// pure — no I/O
// ============================================================================
// Regularity classification (maillot verde).
//
// Counts HOW OFTEN a player scores, not how much. Every scoring event is worth
// exactly ONE hit — an exact scoreline counts the same as a mere sign hit, a
// bonus the same, a meta volante the same.
//
//  - prediction_hits: predictions with points_awarded > 0 whose match is
//    `finished` (defensive: an unscored/unfinished prediction never counts).
//  - bonus_hits: bonus answers with points_awarded > 0.
//  - meta_hits: number of round_awards (one unit each).
//  - hits = sum.
//
// One row per user present in standings (even with 0 hits). Order:
//   hits desc → total_points (from standings) desc → created_at asc.
// Competition ranking (ties share rank: 1, 1, 3, ...).
// ============================================================================

import type {
  StandingRow,
  Prediction,
  Match,
  BonusAnswer,
  RoundAward,
  RegularityRow,
} from "@/lib/types";

export function computeRegularity(input: {
  standings: StandingRow[];
  predictions: Pick<Prediction, "user_id" | "match_id" | "points_awarded">[];
  matches: Pick<Match, "id" | "status">[];
  bonusAnswers: Pick<BonusAnswer, "user_id" | "points_awarded">[];
  roundAwards: Pick<RoundAward, "user_id">[];
  createdAt: Record<string, string>;
}): RegularityRow[] {
  const { standings, predictions, matches, bonusAnswers, roundAwards, createdAt } =
    input;

  const finishedMatch = new Set(
    matches.filter((m) => m.status === "finished").map((m) => m.id),
  );

  const predHits = new Map<string, number>();
  const bonusHits = new Map<string, number>();
  const metaHits = new Map<string, number>();

  for (const p of predictions) {
    if (
      p.points_awarded !== null &&
      p.points_awarded > 0 &&
      finishedMatch.has(p.match_id)
    ) {
      predHits.set(p.user_id, (predHits.get(p.user_id) ?? 0) + 1);
    }
  }
  for (const b of bonusAnswers) {
    if (b.points_awarded !== null && b.points_awarded > 0) {
      bonusHits.set(b.user_id, (bonusHits.get(b.user_id) ?? 0) + 1);
    }
  }
  for (const a of roundAwards) {
    metaHits.set(a.user_id, (metaHits.get(a.user_id) ?? 0) + 1);
  }

  const totalByUser = new Map<string, number>();
  for (const s of standings) totalByUser.set(s.user_id, s.total_points);

  const rows: RegularityRow[] = standings.map((s) => {
    const prediction_hits = predHits.get(s.user_id) ?? 0;
    const bonus_hits = bonusHits.get(s.user_id) ?? 0;
    const meta_hits = metaHits.get(s.user_id) ?? 0;
    return {
      user_id: s.user_id,
      display_name: s.display_name,
      avatar: s.avatar,
      hits: prediction_hits + bonus_hits + meta_hits,
      prediction_hits,
      bonus_hits,
      meta_hits,
      rank: 0,
    };
  });

  rows.sort((a, b) => {
    if (b.hits !== a.hits) return b.hits - a.hits;
    const ta = totalByUser.get(a.user_id) ?? 0;
    const tb = totalByUser.get(b.user_id) ?? 0;
    if (tb !== ta) return tb - ta;
    const ca = createdAt[a.user_id] ?? "";
    const cb = createdAt[b.user_id] ?? "";
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  });

  assignCompetitionRank(rows, totalByUser);
  return rows;
}

/** Competition ranking: rows sharing the same (hits, total_points) share a rank. */
function assignCompetitionRank(
  rows: RegularityRow[],
  totalByUser: Map<string, number>,
): void {
  for (let i = 0; i < rows.length; i++) {
    if (i === 0) {
      rows[i].rank = 1;
      continue;
    }
    const prev = rows[i - 1];
    const cur = rows[i];
    const sameHits = prev.hits === cur.hits;
    const sameTotal =
      (totalByUser.get(prev.user_id) ?? 0) === (totalByUser.get(cur.user_id) ?? 0);
    rows[i].rank = sameHits && sameTotal ? prev.rank : i + 1;
  }
}
