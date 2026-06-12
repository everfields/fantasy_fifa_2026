import * as React from "react";

import type { MaillotKey, StandingRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MaillotBadge } from "@/components/MaillotBadge";
import { initials, RankBadge } from "@/components/classifications";

/**
 * Leaderboard, mobile-first. A flat list (no <table>) so every breakpoint gets
 * a layout designed for it: on phones each row is rank · avatar · name with a
 * compact stats subline, and the total stays big and right-aligned; on sm+ the
 * subline is replaced by aligned stat columns.
 *
 * New optional props (back-compat — existing callers unaffected):
 *   maillots    — map of userId → MaillotKey[] to render jersey badges after
 *                 the player name, in canonical order.
 *   hideHeader  — suppress the sm+ column-header row (used by PelotonBoard
 *                 when each group already has its own heading).
 *   header      — optional node rendered inside the card, above the columns
 *                 (pass a <BoardHeader> for the canonical board chrome).
 */
export function RankingTable({
  rows,
  currentUserId,
  className,
  maillots,
  hideHeader = false,
  header,
}: {
  rows: StandingRow[];
  currentUserId?: string;
  className?: string;
  maillots?: Record<string, MaillotKey[]>;
  hideHeader?: boolean;
  header?: React.ReactNode;
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
      {header}
      {/* Column headers — only where the stat columns exist (sm+). */}
      {!hideHeader && (
        <div className="hidden items-center gap-3 border-b bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:flex">
          <span className="w-7 text-center">#</span>
          <span className="flex-1">Corredor</span>
          <span className="w-14 text-right">Exactos</span>
          <span className="w-14 text-right">Bonus</span>
          <span className="w-14 text-right">★ Meta</span>
          <span className="w-16 text-right">Total</span>
        </div>
      )}
      <ol className="divide-y divide-border">
        {rows.map((row) => {
          const isCurrent = currentUserId === row.user_id;
          const jerseys = maillots?.[row.user_id];
          return (
            <li
              key={row.user_id}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 sm:px-4",
                isCurrent && "bg-primary/5 ring-1 ring-inset ring-primary/30"
              )}
            >
              <RankBadge rank={row.rank} accent="bg-amber-400/20 text-amber-600 dark:text-amber-400" />
              <Avatar className="h-8 w-8 shrink-0">
                {row.avatar ? (
                  <AvatarImage src={row.avatar} alt={row.display_name} />
                ) : null}
                <AvatarFallback className="text-xs">
                  {initials(row.display_name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-semibold">
                    {row.display_name}
                  </span>
                  {isCurrent && (
                    <Badge variant="success" className="shrink-0 px-1.5 py-0 text-[10px]">
                      Tú
                    </Badge>
                  )}
                  {jerseys && jerseys.length > 0 && (
                    <span className="flex items-center gap-0.5">
                      {jerseys.map((m) => (
                        <MaillotBadge key={m} maillot={m} size="sm" />
                      ))}
                    </span>
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
