import * as React from "react";

import type { StandingRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function RankBadge({ rank }: { rank: number }) {
  const medal =
    rank === 1
      ? "bg-amber-400/20 text-amber-600 dark:text-amber-400"
      : rank === 2
        ? "bg-slate-400/20 text-slate-600 dark:text-slate-300"
        : rank === 3
          ? "bg-orange-500/20 text-orange-700 dark:text-orange-400"
          : "text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums",
        medal
      )}
    >
      {rank}
    </span>
  );
}

/**
 * Leaderboard, mobile-first. A flat list (no <table>) so every breakpoint gets
 * a layout designed for it: on phones each row is rank · avatar · name with a
 * compact stats subline, and the total stays big and right-aligned; on sm+ the
 * subline is replaced by aligned stat columns.
 */
export function RankingTable({
  rows,
  currentUserId,
  className,
}: {
  rows: StandingRow[];
  currentUserId?: string;
  className?: string;
}) {
  if (rows.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground",
          className
        )}
      >
        Aún no hay clasificación. ¡Que empiece el Mundial!
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      {/* Column headers — only where the stat columns exist (sm+). */}
      <div className="hidden items-center gap-3 border-b bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:flex">
        <span className="w-7 text-center">#</span>
        <span className="flex-1">Jugador</span>
        <span className="w-14 text-right">Exactos</span>
        <span className="w-14 text-right">Bonus</span>
        <span className="w-14 text-right">★ Meta</span>
        <span className="w-16 text-right">Total</span>
      </div>
      <ol className="divide-y divide-border">
        {rows.map((row) => {
          const isCurrent = currentUserId === row.user_id;
          return (
            <li
              key={row.user_id}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 sm:px-4",
                isCurrent && "bg-primary/5 ring-1 ring-inset ring-primary/30"
              )}
            >
              <RankBadge rank={row.rank} />
              <Avatar className="h-8 w-8 shrink-0">
                {row.avatar ? (
                  <AvatarImage src={row.avatar} alt={row.display_name} />
                ) : null}
                <AvatarFallback className="text-xs">
                  {initials(row.display_name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold">
                    {row.display_name}
                  </span>
                  {isCurrent && (
                    <Badge variant="success" className="shrink-0 px-1.5 py-0 text-[10px]">
                      Tú
                    </Badge>
                  )}
                </div>
                {/* Phone-only stats subline — replaces the hidden columns. */}
                <p className="truncate text-[11px] tabular-nums text-muted-foreground sm:hidden">
                  {row.exact_hits} exactos · {row.bonus_points} bonus
                  {row.meta_points > 0 ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      {" "}
                      · ★ {row.meta_points}
                    </span>
                  ) : null}
                </p>
              </div>
              <span className="hidden w-14 text-right text-sm tabular-nums text-muted-foreground sm:block">
                {row.exact_hits}
              </span>
              <span className="hidden w-14 text-right text-sm tabular-nums text-muted-foreground sm:block">
                {row.bonus_points}
              </span>
              <span
                className={cn(
                  "hidden w-14 text-right text-sm tabular-nums sm:block",
                  row.meta_points > 0
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground/50"
                )}
              >
                {row.meta_points > 0 ? row.meta_points : "—"}
              </span>
              <span className="w-12 shrink-0 text-right text-base font-black tabular-nums sm:w-16">
                {row.total_points}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
