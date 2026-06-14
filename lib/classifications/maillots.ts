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
//  - extremadura / monars → same fixed-roster rule as blanco, keyed by
//    MAILLOT_EXTREMADURA_EMAILS / MAILLOT_MONARS_EMAILS. A rider can wear
//    several of these at once.
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
import {
  MAILLOT_ARCOIRIS_EMAIL,
  MAILLOT_BLANCO_EMAILS,
  MAILLOT_EXTREMADURA_EMAILS,
  MAILLOT_MONARS_EMAILS,
} from "./config";

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

/**
 * Riders shadowed by the Aston Martin safety car: the third-to-last and
 * second-to-last of the general (display order — pass a sortGeneral result).
 * The very last is NOT included (he wears the farolillo rojo alone). Only
 * once the race has data: >= 4 riders and the leader has points.
 */
export function assignAstons(general: StandingRow[]): string[] {
  if (general.length < 4 || general[0].total_points <= 0) return [];
  return general.slice(-3, -1).map((s) => s.user_id);
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

  // Fixed-roster jerseys — best-placed roster member in the general (always if
  // any roster member is present, even at 0 points). blanco = jóvenes,
  // extremadura = corredores extremeños, monars = familia Monar.
  const awardBestRosterMember = (emails: string[], key: MaillotKey) => {
    const roster = new Set(emails.map((e) => e.toLowerCase()));
    const best = general.find((s) =>
      roster.has((emailByUserId[s.user_id] ?? "").toLowerCase()),
    );
    if (best) add(best.user_id, key);
  };
  awardBestRosterMember(MAILLOT_BLANCO_EMAILS, "blanco");
  awardBestRosterMember(MAILLOT_EXTREMADURA_EMAILS, "extremadura");
  awardBestRosterMember(MAILLOT_MONARS_EMAILS, "monars");

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
