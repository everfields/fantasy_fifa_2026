// pure — no I/O
// ============================================================================
// Maillot (jersey) assignment for the cycling-style classifications.
//
// A user can accumulate several maillots (e.g. the general leader who also
// leads regularity wears amarillo + verde). The arcoíris and blanco jerseys are
// fixed-roster (matched by email via config.ts).
//
//  - amarillo → leader of the general (standings, rank order) with
//    total_points > 0; full tie → smallest created_at.
//  - verde    → first of regularity with hits > 0 (its tie-break is already
//    baked into the row order).
//  - lunares  → first of montaña with points > 0.
//  - blanco   → best-placed rider in the general whose email ∈
//    MAILLOT_BLANCO_EMAILS — always awarded if any roster member is present,
//    even at 0 points; tie-break created_at.
//  - arcoiris → the user whose email === MAILLOT_ARCOIRIS_EMAIL (fixed).
//  - azul     → every rider who has WON at least one meta volante round
//    (top round_points among the round's awards; ties → all winners wear it).
//  - rojo     → farolillo rojo: last of the general, ONLY if standings.length
//    >= 2 AND the leader's total > 0; tail tie → LARGEST created_at.
// ============================================================================

import type {
  StandingRow,
  RegularityRow,
  MontanaRow,
  RoundAward,
  MaillotKey,
} from "@/lib/types";
import { MAILLOT_ARCOIRIS_EMAIL, MAILLOT_BLANCO_EMAILS } from "./config";

/**
 * Canonical display order of the general: rank asc, total desc, then
 * created_at asc to break full ties. This is the SAME tie-break used to award
 * the maillot amarillo (smallest created_at first) and the farolillo rojo
 * (largest created_at last), so the amarillo always renders at the top and the
 * rojo at the bottom.
 */
export function sortGeneral(
  standings: StandingRow[],
  createdAt: Record<string, string>,
): StandingRow[] {
  const createdOf = (u: string): string => createdAt[u] ?? "";
  return [...standings].sort(
    (a, b) =>
      a.rank - b.rank ||
      b.total_points - a.total_points ||
      (createdOf(a.user_id) < createdOf(b.user_id) ? -1 : 1),
  );
}

export function assignMaillots(input: {
  standings: StandingRow[];
  regularity: RegularityRow[];
  montana: MontanaRow[];
  emailByUserId: Record<string, string>;
  createdAt: Record<string, string>;
  roundAwards?: RoundAward[];
}): Record<string, MaillotKey[]> {
  const {
    standings,
    regularity,
    montana,
    emailByUserId,
    createdAt,
    roundAwards = [],
  } = input;

  const result: Record<string, MaillotKey[]> = {};
  const add = (userId: string, key: MaillotKey) => {
    if (!result[userId]) result[userId] = [];
    if (!result[userId].includes(key)) result[userId].push(key);
  };

  const createdOf = (u: string): string => createdAt[u] ?? "";

  // General leader = rank order, ties broken by created_at (see sortGeneral).
  const general = sortGeneral(standings, createdAt);

  // amarillo
  if (general.length > 0 && general[0].total_points > 0) {
    add(general[0].user_id, "amarillo");
  }

  // verde — regularity rows already ordered (hits desc, total desc, created asc)
  if (regularity.length > 0 && regularity[0].hits > 0) {
    add(regularity[0].user_id, "verde");
  }

  // lunares — montaña rows already ordered
  if (montana.length > 0 && montana[0].points > 0) {
    add(montana[0].user_id, "lunares");
  }

  // blanco — best-placed roster member (always if present).
  const rosterSet = new Set(MAILLOT_BLANCO_EMAILS.map((e) => e.toLowerCase()));
  const blancoCandidates = general.filter((s) => {
    const email = (emailByUserId[s.user_id] ?? "").toLowerCase();
    return rosterSet.has(email);
  });
  if (blancoCandidates.length > 0) {
    add(blancoCandidates[0].user_id, "blanco");
  }

  // arcoiris — fixed by email, always.
  for (const s of standings) {
    if (
      (emailByUserId[s.user_id] ?? "").toLowerCase() ===
      MAILLOT_ARCOIRIS_EMAIL.toLowerCase()
    ) {
      add(s.user_id, "arcoiris");
      break;
    }
  }

  // azul — every winner of a meta volante round (best round_points among the
  // round's awards; full ties → every tied winner wears it).
  const bestByRound = new Map<string, number>();
  for (const a of roundAwards) {
    const best = bestByRound.get(a.round_key);
    if (best === undefined || a.round_points > best) {
      bestByRound.set(a.round_key, a.round_points);
    }
  }
  for (const a of roundAwards) {
    if (a.round_points === bestByRound.get(a.round_key)) add(a.user_id, "azul");
  }

  // rojo — last of the general, only if >=2 riders and leader has points.
  if (general.length >= 2 && general[0].total_points > 0) {
    const lastTotal = general[general.length - 1].total_points;
    // tail = everyone tied at the worst total; pick the LARGEST created_at.
    const tail = general.filter((s) => s.total_points === lastTotal);
    let pick = tail[0];
    for (const s of tail) {
      if (createdOf(s.user_id) > createdOf(pick.user_id)) pick = s;
    }
    add(pick.user_id, "rojo");
  }

  return result;
}
