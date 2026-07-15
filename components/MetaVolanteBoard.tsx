import * as React from "react";

import type { RoundAward, StandingRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MaillotBadge } from "@/components/MaillotBadge";
import { BoardHeader, initials, RankBadge } from "@/components/classifications";

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

/** "1º 100 · 2º–3º 50 · 4º–7º 20" — compresses consecutive equal prizes. */
function formatDistribution(distribution: number[]): string {
  let last = distribution.length;
  while (last > 0 && distribution[last - 1] <= 0) last--;
  const paid = distribution.slice(0, last);
  const parts: string[] = [];
  let i = 0;
  while (i < paid.length) {
    let j = i;
    while (j + 1 < paid.length && paid[j + 1] === paid[i]) j++;
    parts.push(
      i === j ? `${i + 1}º ${paid[i]}` : `${i + 1}º–${j + 1}º ${paid[i]}`
    );
    i = j + 1;
  }
  return parts.join(" · ");
}

/**
 * Meta-volante standings: who has won each round (most prediction points in
 * it) and the accumulated award ranking. Player identity (name/avatar) comes
 * from the standings rows; `awards` are the raw round_awards rows.
 */
export interface LiveRound {
  roundKey: string;
  entries: { user_id: string; round_points: number; exact_hits: number }[];
  /** # of finished (scored) matches in the round vs total. */
  finished: number;
  total: number;
}

export function MetaVolanteBoard({
  awards,
  standings,
  currentUserId,
  distribution,
  live,
  className,
}: {
  awards: RoundAward[];
  standings: StandingRow[];
  currentUserId?: string;
  distribution: number[];
  live?: LiveRound | null;
  className?: string;
}) {
  const players = new Map(standings.map((s) => [s.user_id, s]));
  const prizeLadder = formatDistribution(distribution);

  if (awards.length === 0 && (!live || live.entries.length === 0)) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground",
          className
        )}
      >
        Todavía no hay metas volantes. Al cierre de cada ronda, los primeros
        puestos reparten premio ({prizeLadder} pts). Aquí verás el palmarés.
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
  for (const list of awardsByRound.values()) {
    list.sort((a, b) => b.points - a.points || b.round_points - a.round_points);
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* ── Live (provisional) standing of the round in progress ─────────── */}
      {live && live.entries.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2 px-1">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Ronda en curso · {ROUND_LABELS[live.roundKey] ?? live.roundKey}
            </h2>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {live.finished}/{live.total} partidos
            </span>
          </div>
          <ol className="divide-y divide-border overflow-hidden rounded-xl border bg-card">
            {live.entries.map((e, i) => {
              const p = players.get(e.user_id);
              const isCurrent = currentUserId === e.user_id;
              const leader =
                e.round_points === live.entries[0].round_points &&
                e.exact_hits === live.entries[0].exact_hits;
              return (
                <li
                  key={e.user_id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 sm:px-4",
                    isCurrent && "bg-primary/5 ring-1 ring-inset ring-primary/30"
                  )}
                >
                  <RankBadge
                    rank={i + 1}
                    accent="bg-blue-500/20 text-blue-600 dark:text-blue-400"
                  />
                  <Avatar className="h-8 w-8 shrink-0">
                    {p?.avatar ? (
                      <AvatarImage src={p.avatar} alt={p.display_name} />
                    ) : null}
                    <AvatarFallback className="text-xs">
                      {initials(p?.display_name ?? "?")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">
                      {p?.display_name ?? "Corredor"}
                    </span>
                    {leader ? (
                      <MaillotBadge
                        maillot="azul"
                        size="sm"
                        className="opacity-60"
                      />
                    ) : null}
                    {isCurrent && (
                      <Badge
                        variant="success"
                        className="shrink-0 px-1.5 py-0 text-[10px]"
                      >
                        Tú
                      </Badge>
                    )}
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {e.exact_hits} plenos
                  </span>
                  <span className="w-10 shrink-0 text-right text-base font-black tabular-nums">
                    {e.round_points}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="px-1 text-[11px] text-muted-foreground">
            Provisional: los premios ({prizeLadder} pts) se otorgan al cierre
            de la ronda.
          </p>
        </section>
      ) : null}

      {/* ── Accumulated meta-volante ranking ─────────────────────────────── */}
      {awards.length > 0 ? (
        <div className="flex flex-col gap-0">
          <div className="overflow-hidden rounded-t-xl border-x border-t bg-card">
            <BoardHeader
              maillot="azul"
              title="Metas volantes"
              accentClass="text-blue-700 dark:text-blue-400"
            />

            <ol className="divide-y divide-border">
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
                    <RankBadge
                      rank={i + 1}
                      accent="bg-blue-500/20 text-blue-600 dark:text-blue-400"
                    />
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
                          {p?.display_name ?? "Corredor"}
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
                            className="rounded-full border border-blue-500/40 bg-blue-500/10 px-1.5 py-px text-[10px] font-semibold text-blue-700 dark:text-blue-300"
                          >
                            {ROUND_SHORT[r] ?? r}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="shrink-0 text-right text-base font-black tabular-nums text-blue-600 dark:text-blue-400">
                      {entry.points}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Footer explainer — visually attached below the ranking */}
          <div className="rounded-b-xl border-x border-b border-blue-500/20 bg-blue-500/5 px-4 py-2.5">
            <p className="text-[11px] text-muted-foreground">
              <span className="font-semibold text-blue-700 dark:text-blue-400">
                La meta volante
              </span>{" "}
              reparte premios por posición en cada ronda hasta cuartos (semis
              y final no reparten) según los puntos de pronósticos (
              {prizeLadder} pts). Empates: más plenos en la ronda; si
              persiste, los empatados se reparten la suma de sus premios.
            </p>
          </div>
        </div>
      ) : null}

      {/* ── Round-by-round winners ────────────────────────────────────────── */}
      {awards.length > 0 ? (
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
                    {winners.map((w, i) => (
                      <p
                        key={w.id}
                        className="flex items-center gap-2 text-sm font-semibold"
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                          {i === 0 ? (
                            <MaillotBadge maillot="azul" size="sm" />
                          ) : null}
                          <span className="truncate">
                            {players.get(w.user_id)?.display_name ?? "Corredor"}
                          </span>
                          <span className="text-xs font-normal tabular-nums text-muted-foreground">
                            · {w.round_points} pts en la ronda
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-bold tabular-nums text-blue-600 dark:text-blue-400">
                          +{w.points}
                        </span>
                      </p>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
