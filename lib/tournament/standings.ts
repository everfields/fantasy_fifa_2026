// ============================================================================
// Tournament group standings — PURE (no I/O), computed from our own `matches`
// rows, never from an external provider. See docs/decisions/0011.
//
// FIFA World Cup 2026 group ranking criteria implemented here:
//   a) points  b) goal difference  c) goals scored
//   d–f) the same three, restricted to the matches between the still-tied teams
//   g) (fair-play points) and h) (drawing of lots) are NOT computable from
//      scorelines — we fall back to team name and flag the rows as tied so the
//      UI can disclose that the order is provisional.
// Best-thirds ranking (8 of 12 advance): points → GD → goals scored, same
// non-computable tail (fair play, lots) → name fallback.
//
// Live matches with a current score count provisionally (the table moves
// during a matchday, like real standings do); only `finished` is definitive.
// ============================================================================

import type { Match, Team } from "@/lib/types";

export interface GroupRow {
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  /** True when the order vs. the neighbour is decided by the name fallback. */
  unresolvedTie: boolean;
}

export interface ThirdPlaceRow {
  group: string;
  row: GroupRow;
  /** Among the 8 best thirds (only meaningful once every group finished). */
  qualifies: boolean;
}

function countable(m: Match): boolean {
  return (
    m.stage === "group" &&
    m.home_score !== null &&
    m.away_score !== null &&
    (m.status === "finished" || m.status === "live")
  );
}

type Tally = Omit<GroupRow, "team" | "unresolvedTie">;

const zero = (): Tally => ({
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  gf: 0,
  ga: 0,
  gd: 0,
  points: 0,
});

function addResult(t: Tally, gf: number, ga: number): void {
  t.played += 1;
  t.gf += gf;
  t.ga += ga;
  t.gd = t.gf - t.ga;
  if (gf > ga) {
    t.won += 1;
    t.points += 3;
  } else if (gf === ga) {
    t.drawn += 1;
    t.points += 1;
  } else {
    t.lost += 1;
  }
}

/** points → GD → GF (descending); 0 when fully tied on the three. */
function byCriteria(a: Tally, b: Tally): number {
  return b.points - a.points || b.gd - a.gd || b.gf - a.gf;
}

/**
 * Group standings for every group ('A'..'L') with at least one team, keyed by
 * group letter, each sorted per the FIFA criteria above.
 */
export function computeGroupTables(
  teams: Team[],
  matches: Match[],
): Map<string, GroupRow[]> {
  const tallies = new Map<string, Tally>();
  const grouped = new Map<string, Team[]>();
  for (const t of teams) {
    if (!t.group) continue;
    tallies.set(t.id, zero());
    const list = grouped.get(t.group) ?? [];
    list.push(t);
    grouped.set(t.group, list);
  }

  const counted = matches.filter(countable);
  for (const m of counted) {
    const home = tallies.get(m.home_team);
    const away = tallies.get(m.away_team);
    if (!home || !away) continue;
    addResult(home, m.home_score!, m.away_score!);
    addResult(away, m.away_score!, m.home_score!);
  }

  const tables = new Map<string, GroupRow[]>();
  for (const [group, members] of Array.from(grouped.entries()).sort()) {
    const rows: GroupRow[] = members
      .map((team) => ({
        team,
        ...tallies.get(team.id)!,
        unresolvedTie: false,
      }))
      .sort(
        (a, b) => byCriteria(a, b) || a.team.name.localeCompare(b.team.name),
      );

    breakTiesHeadToHead(rows, counted);
    tables.set(group, rows);
  }
  return tables;
}

/**
 * Re-orders each run of rows tied on (points, GD, GF) by the head-to-head
 * mini-table among just those teams; rows a name fallback had to order are
 * flagged `unresolvedTie`.
 */
function breakTiesHeadToHead(rows: GroupRow[], counted: Match[]): void {
  let start = 0;
  while (start < rows.length) {
    let end = start + 1;
    while (end < rows.length && byCriteria(rows[start], rows[end]) === 0) {
      end += 1;
    }
    if (end - start > 1) {
      const tiedIds = new Set(rows.slice(start, end).map((r) => r.team.id));
      const mini = new Map<string, Tally>(
        Array.from(tiedIds, (id) => [id, zero()]),
      );
      for (const m of counted) {
        if (!tiedIds.has(m.home_team) || !tiedIds.has(m.away_team)) continue;
        addResult(mini.get(m.home_team)!, m.home_score!, m.away_score!);
        addResult(mini.get(m.away_team)!, m.away_score!, m.home_score!);
      }
      const slice = rows.slice(start, end).sort((a, b) => {
        const h2h = byCriteria(mini.get(a.team.id)!, mini.get(b.team.id)!);
        if (h2h !== 0) return h2h;
        a.unresolvedTie = b.unresolvedTie = true;
        return a.team.name.localeCompare(b.team.name);
      });
      rows.splice(start, end - start, ...slice);
    }
    start = end;
  }
}

/** Every team has played its 3 group matches. */
export function isGroupComplete(rows: GroupRow[]): boolean {
  return rows.length > 0 && rows.every((r) => r.played === 3);
}

/**
 * The 12 third-placed teams ranked; the best 8 marked as qualifying for the
 * round of 32. Order is provisional until every group is complete.
 */
export function bestThirds(
  tables: Map<string, GroupRow[]>,
): ThirdPlaceRow[] {
  const thirds: { group: string; row: GroupRow }[] = [];
  for (const [group, rows] of tables) {
    if (rows.length >= 3) thirds.push({ group, row: rows[2] });
  }
  thirds.sort(
    (a, b) =>
      byCriteria(a.row, b.row) || a.row.team.name.localeCompare(b.row.team.name),
  );
  return thirds.map((t, i) => ({ ...t, qualifies: i < 8 }));
}
