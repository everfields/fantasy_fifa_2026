// pure — no I/O
// ============================================================================
// Dynamic peloton grouping of the general classification.
//
// The general standings are rendered cycling-style: instead of fixed position
// ranges, riders are bundled into groups that emerge from the points
// distribution (escapadas ahead, the bunched-up pelotón, dropped rezagados
// behind). Recomputed on every refresh — purely from the points totals.
//
// HARD RULE (pure scoring): point values come from `app_settings.scoring`,
// passed in via `PelotonOptions` (signPoints / exactPoints). Defaults mirror
// DEFAULT_APP_SETTINGS (20 / 50) only as a fallback; the caller should pass the
// live values.
//
// ALGORITHM (deterministic):
//  1. Sort defensively by rank asc, then total_points desc. N = rows.length.
//     N === 0 → []. N <= 4 OR all totals equal → a single `peloton` group
//     (gaps 0).
//  2. Cut threshold T = max(signPoints, ceil(0.1 × (leader − last))). Scales
//     with the spread but never below the value of one sign hit.
//  3. Initial clusters: cut between consecutive riders where gap >= T.
//  4. The pelotón = the LARGEST cluster. Tie on size → the most rearward of the
//     tied clusters (front groups are escapadas; the pelotón rides behind).
//  5. CONSOLIDATION: while the number of riders AHEAD of the pelotón exceeds
//     maxAhead = max(3, round(N × 0.3)), merge the cluster immediately ahead
//     into the pelotón. (Escapadas are small; if a third of the race is "ahead
//     of the pelotón", that IS the pelotón.)
//  6. Label the clusters AHEAD of the pelotón, front → back A=[c1..ck]:
//      - c1 is `fuga` ⇔ size <= 3 AND its gap to the next cluster >= Tfuga =
//        max(exactPoints, 2×T).
//      - if c1 is fuga and k >= 2 → ck = perseguidores, c2..c(k−1) merge into
//        cabeza. (fuga alone, k===1 → just fuga.)
//      - if c1 is NOT fuga: k === 1 → c1 = cabeza; k >= 2 → ck = perseguidores,
//        c1..c(k−1) merge into cabeza.
//  7. All clusters BEHIND the pelotón merge into a single `rezagados` group.
//  8. gapToPrev = this group's best total − previous group's worst total
//     (0 for the first group); gapToLeader = leader's total − this group's best
//     total. Both non-negative.
// ============================================================================

import type { StandingRow, PelotonGroup, PelotonGroupKey } from "@/lib/types";

export interface PelotonOptions {
  /** Points for a correct sign — the floor for the cut threshold. Default 20. */
  signPoints?: number;
  /** Points for an exact scoreline — drives the fuga threshold. Default 50. */
  exactPoints?: number;
}

interface Cluster {
  riders: StandingRow[];
}

function best(c: Cluster): number {
  return c.riders[0].total_points;
}
function worst(c: Cluster): number {
  return c.riders[c.riders.length - 1].total_points;
}

function makeGroup(
  key: PelotonGroupKey,
  riders: StandingRow[],
  leaderTotal: number,
  prevWorst: number | null,
): PelotonGroup {
  const groupBest = riders[0].total_points;
  return {
    key,
    riders,
    gapToPrev: prevWorst === null ? 0 : Math.max(0, prevWorst - groupBest),
    gapToLeader: Math.max(0, leaderTotal - groupBest),
  };
}

export function groupPeloton(
  rows: StandingRow[],
  opts: PelotonOptions = {},
): PelotonGroup[] {
  const signPoints = opts.signPoints ?? 20;
  const exactPoints = opts.exactPoints ?? 50;

  const N = rows.length;
  if (N === 0) return [];

  // 1. defensive sort: rank asc, then total_points desc.
  const sorted = [...rows].sort(
    (a, b) => a.rank - b.rank || b.total_points - a.total_points,
  );

  const leaderTotal = sorted[0].total_points;
  const lastTotal = sorted[sorted.length - 1].total_points;
  const allEqual = leaderTotal === lastTotal;

  if (N <= 4 || allEqual) {
    return [makeGroup("peloton", sorted, leaderTotal, null)];
  }

  // 2. cut threshold.
  const spread = leaderTotal - lastTotal;
  const T = Math.max(signPoints, Math.ceil(0.1 * spread));

  // 3. initial clusters: cut where gap >= T.
  const clusters: Cluster[] = [{ riders: [sorted[0]] }];
  for (let i = 1; i < N; i++) {
    const gap = sorted[i - 1].total_points - sorted[i].total_points;
    if (gap >= T) {
      clusters.push({ riders: [sorted[i]] });
    } else {
      clusters[clusters.length - 1].riders.push(sorted[i]);
    }
  }

  if (clusters.length === 1) {
    return [makeGroup("peloton", clusters[0].riders, leaderTotal, null)];
  }

  // 4. pelotón = largest cluster; tie → most rearward.
  let pelotonIdx = 0;
  for (let i = 0; i < clusters.length; i++) {
    if (clusters[i].riders.length >= clusters[pelotonIdx].riders.length) {
      // >= so a later (more rearward) cluster of equal size wins the tie.
      pelotonIdx = i;
    }
  }

  // 5. consolidation: absorb the cluster immediately ahead while too many
  // riders ride ahead of the pelotón.
  const maxAhead = Math.max(3, Math.round(N * 0.3));
  const ridersAhead = (): number => {
    let n = 0;
    for (let i = 0; i < pelotonIdx; i++) n += clusters[i].riders.length;
    return n;
  };
  while (pelotonIdx > 0 && ridersAhead() > maxAhead) {
    const prev = clusters[pelotonIdx - 1];
    const pel = clusters[pelotonIdx];
    // merge prev into pelotón (prev is ahead, so its riders go first).
    const merged: Cluster = { riders: [...prev.riders, ...pel.riders] };
    clusters.splice(pelotonIdx - 1, 2, merged);
    pelotonIdx -= 1;
  }

  // 6. label clusters ahead of the pelotón: A = clusters[0..pelotonIdx-1].
  const ahead = clusters.slice(0, pelotonIdx);
  const behind = clusters.slice(pelotonIdx + 1);

  type Labeled = { key: PelotonGroupKey; riders: StandingRow[] };
  const labeled: Labeled[] = [];

  const Tfuga = Math.max(exactPoints, 2 * T);

  if (ahead.length > 0) {
    const k = ahead.length;
    const c1 = ahead[0];
    let c1IsFuga = false;
    if (c1.riders.length <= 3) {
      if (k >= 2) {
        const gapToNext = worst(c1) - best(ahead[1]);
        c1IsFuga = gapToNext >= Tfuga;
      } else {
        // fuga alone (k === 1): is it a fuga or just cabeza? Its gap to the
        // pelotón decides — a small detached group ahead of the bunch.
        const gapToPel = worst(c1) - best(clusters[pelotonIdx]);
        c1IsFuga = gapToPel >= Tfuga;
      }
    }

    if (c1IsFuga) {
      labeled.push({ key: "fuga", riders: c1.riders });
      if (k >= 2) {
        // c2..c(k-1) → cabeza, ck → perseguidores.
        const mid = ahead.slice(1, k - 1);
        const last = ahead[k - 1];
        if (mid.length > 0) {
          labeled.push({
            key: "cabeza",
            riders: mid.flatMap((c) => c.riders),
          });
        }
        labeled.push({ key: "perseguidores", riders: last.riders });
      }
    } else {
      if (k === 1) {
        labeled.push({ key: "cabeza", riders: c1.riders });
      } else {
        // c1..c(k-1) → cabeza, ck → perseguidores.
        const head = ahead.slice(0, k - 1);
        const last = ahead[k - 1];
        labeled.push({
          key: "cabeza",
          riders: head.flatMap((c) => c.riders),
        });
        labeled.push({ key: "perseguidores", riders: last.riders });
      }
    }
  }

  // pelotón itself.
  labeled.push({ key: "peloton", riders: clusters[pelotonIdx].riders });

  // 7. everything behind → rezagados.
  if (behind.length > 0) {
    labeled.push({
      key: "rezagados",
      riders: behind.flatMap((c) => c.riders),
    });
  }

  // 8. build groups with gaps.
  const groups: PelotonGroup[] = [];
  let prevWorst: number | null = null;
  for (const g of labeled) {
    groups.push(makeGroup(g.key, g.riders, leaderTotal, prevWorst));
    prevWorst = g.riders[g.riders.length - 1].total_points;
  }
  return groups;
}
