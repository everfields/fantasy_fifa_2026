import * as React from "react";

import type { RoundAward, StandingRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

// Display order + Spanish labels for every meta-volante round
// (see roundKeyForMatch in lib/scoring — third_place folds into "final").
const ROUND_ORDER = [
  "group-md1",
  "group-md2",
  "group-md3",
  "round_of_32",
  "round_of_16",
  "quarter",
  "semi",
  "final",
] as const;

const ROUND_LABELS: Record<string, string> = {
  "group-md1": "Grupos · Jornada 1",
  "group-md2": "Grupos · Jornada 2",
  "group-md3": "Grupos · Jornada 3",
  round_of_32: "Dieciseisavos",
  round_of_16: "Octavos",
  quarter: "Cuartos",
  semi: "Semifinales",
  final: "Final",
};

const ROUND_SHORT: Record<string, string> = {
  "group-md1": "J1",
  "group-md2": "J2",
  "group-md3": "J3",
  round_of_32: "16avos",
  round_of_16: "8vos",
  quarter: "4tos",
  semi: "Semis",
  final: "Final",
};

function roundIndex(key: string): number {
  const i = (ROUND_ORDER as readonly string[]).indexOf(key);
  return i === -1 ? ROUND_ORDER.length : i;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Meta-volante standings: who has won each round (most prediction points in
 * it) and the accumulated award ranking. Player identity (name/avatar) comes
 * from the standings rows; `awards` are the raw round_awards rows.
 */
export function MetaVolanteBoard({
  awards,
  standings,
  currentUserId,
  pointsPerRound,
  className,
}: {
  awards: RoundAward[];
  standings: StandingRow[];
  currentUserId?: string;
  pointsPerRound: number;
  className?: string;
}) {
  const players = new Map(standings.map((s) => [s.user_id, s]));

  if (awards.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground",
          className
        )}
      >
        Todavía no hay metas volantes. Al cierre de cada ronda, quien más puntos
        sume en ella se lleva {pointsPerRound} pts extra. Aquí verás el palmarés.
      </div>
    );
  }

  // Aggregate per player: total award points + rounds won (chronological).
  const byUser = new Map<string, { points: number; rounds: string[] }>();
  for (const a of awards) {
    const agg = byUser.get(a.user_id) ?? { points: 0, rounds: [] };
    agg.points += a.points;
    agg.rounds.push(a.round_key);
    byUser.set(a.user_id, agg);
  }
  const ranking = Array.from(byUser.entries())
    .map(([userId, agg]) => ({
      userId,
      points: agg.points,
      rounds: agg.rounds.sort((a, b) => roundIndex(a) - roundIndex(b)),
    }))
    .sort((a, b) => b.points - a.points || b.rounds.length - a.rounds.length);

  // Rounds with at least one award, chronological; a round can have ties.
  const roundsAwarded = Array.from(new Set(awards.map((a) => a.round_key))).sort(
    (a, b) => roundIndex(a) - roundIndex(b)
  );
  const awardsByRound = new Map<string, RoundAward[]>();
  for (const a of awards) {
    const list = awardsByRound.get(a.round_key) ?? [];
    list.push(a);
    awardsByRound.set(a.round_key, list);
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Accumulated meta-volante ranking */}
      <ol className="divide-y divide-border overflow-hidden rounded-xl border bg-card">
        {ranking.map((entry, i) => {
          const p = players.get(entry.userId);
          const isCurrent = currentUserId === entry.userId;
          return (
            <li
              key={entry.userId}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 sm:px-4",
                isCurrent && "bg-primary/5 ring-1 ring-inset ring-primary/30"
              )}
            >
              <span
                className={cn(
                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums",
                  i === 0
                    ? "bg-amber-400/20 text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground"
                )}
              >
                {i + 1}
              </span>
              <Avatar className="h-8 w-8 shrink-0">
                {p?.avatar ? (
                  <AvatarImage src={p.avatar} alt={p.display_name} />
                ) : null}
                <AvatarFallback className="text-xs">
                  {initials(p?.display_name ?? "?")}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold">
                    {p?.display_name ?? "Jugador"}
                  </span>
                  {isCurrent && (
                    <Badge
                      variant="success"
                      className="shrink-0 px-1.5 py-0 text-[10px]"
                    >
                      Tú
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {entry.rounds.map((r) => (
                    <span
                      key={r}
                      className="rounded-full border border-amber-400/40 bg-amber-400/10 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:text-amber-300"
                    >
                      {ROUND_SHORT[r] ?? r}
                    </span>
                  ))}
                </div>
              </div>
              <span className="shrink-0 text-right text-base font-black tabular-nums text-amber-600 dark:text-amber-400">
                {entry.points}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Round-by-round winners */}
      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Ronda a ronda
        </h2>
        <ol className="divide-y divide-border overflow-hidden rounded-xl border bg-card">
          {roundsAwarded.map((key) => {
            const winners = awardsByRound.get(key) ?? [];
            return (
              <li
                key={key}
                className="flex items-center gap-3 px-3 py-2.5 sm:px-4"
              >
                <span className="w-32 shrink-0 text-xs font-semibold text-muted-foreground sm:w-40 sm:text-sm">
                  {ROUND_LABELS[key] ?? key}
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  {winners.map((w) => (
                    <p key={w.id} className="truncate text-sm font-semibold">
                      <span aria-hidden>★ </span>
                      {players.get(w.user_id)?.display_name ?? "Jugador"}
                      <span className="text-xs font-normal tabular-nums text-muted-foreground">
                        {" "}
                        · {w.round_points} pts en la ronda
                      </span>
                    </p>
                  ))}
                </div>
                <span className="shrink-0 text-sm font-bold tabular-nums text-amber-600 dark:text-amber-400">
                  +{winners[0]?.points ?? pointsPerRound}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        La meta volante premia con {pointsPerRound} pts extra a quien más puntos
        de pronósticos suma en cada ronda. Empates: más plenos en la ronda; si
        persiste, se reparte.
      </p>
    </div>
  );
}
