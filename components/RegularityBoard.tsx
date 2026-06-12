import * as React from "react";

import type { RegularityRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { initials, RankBadge } from "@/components/classifications";

/* ─── RegularityBoard ────────────────────────────────────────────────────── */

/**
 * Regularity (maillot verde) standings.
 * Ranks by total "hits" (how often a player scores, regardless of amount).
 * Shows breakdown on mobile as a subline; on sm+ as separate columns.
 * Footer explains the metric.
 */
export function RegularityBoard({
  rows,
  currentUserId,
}: {
  rows: RegularityRow[];
  currentUserId?: string;
}) {
  return (
    <div className="flex flex-col gap-0">
      <div className="overflow-hidden rounded-t-xl border-x border-t bg-card">
        {/* Green-accented header */}
        <div className="flex items-center gap-2 border-b border-green-500/30 bg-green-500/8 px-4 py-2.5">
          {/* Mini green jersey icon */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            aria-hidden
            className="shrink-0"
          >
            <path
              d="M9 2 C9 2 9.5 1 12 1 C14.5 1 15 2 15 2 L19 4 L22 4 L22 9 L18 8 L18 21 L6 21 L6 8 L2 9 L2 4 L5 4 Z"
              fill="#22c55e"
              stroke="hsl(var(--border))"
              strokeWidth="0.6"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[13px] font-bold uppercase tracking-wider text-green-700 dark:text-green-400">
            La regularidad
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
            Aún no hay datos de regularidad. ¡Que empiece el Mundial!
          </div>
        ) : (
          <>
            {/* Column headers — sm+ */}
            <div className="hidden items-center gap-3 border-b bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:flex">
              <span className="w-7 text-center">#</span>
              <span className="flex-1">Corredor</span>
              <span className="w-16 text-right">Pronóst.</span>
              <span className="w-12 text-right">Bonus</span>
              <span className="w-12 text-right">Metas</span>
              <span className="w-14 text-right text-green-700 dark:text-green-400">
                Hits
              </span>
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
                    <RankBadge rank={row.rank} accent="bg-green-500/20 text-green-700 dark:text-green-400" />
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
                          <Badge
                            variant="success"
                            className="shrink-0 px-1.5 py-0 text-[10px]"
                          >
                            Tú
                          </Badge>
                        )}
                      </div>
                      {/* Phone-only breakdown subline */}
                      <p className="truncate text-[11px] tabular-nums text-muted-foreground sm:hidden">
                        {row.prediction_hits} pronóst.
                        {row.bonus_hits > 0 ? ` · ${row.bonus_hits} bonus` : ""}
                        {row.meta_hits > 0 ? ` · ${row.meta_hits} metas` : ""}
                      </p>
                    </div>
                    {/* sm+ stat columns */}
                    <span className="hidden w-16 text-right text-sm tabular-nums text-muted-foreground sm:block">
                      {row.prediction_hits}
                    </span>
                    <span className="hidden w-12 text-right text-sm tabular-nums text-muted-foreground sm:block">
                      {row.bonus_hits > 0 ? row.bonus_hits : "—"}
                    </span>
                    <span className="hidden w-12 text-right text-sm tabular-nums text-muted-foreground sm:block">
                      {row.meta_hits > 0 ? row.meta_hits : "—"}
                    </span>
                    {/* Big hits number — always visible */}
                    <span className="w-12 shrink-0 text-right text-base font-black tabular-nums text-green-700 dark:text-green-400 sm:w-14">
                      {row.hits}
                    </span>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>

      {/* Footer explainer — visually attached below the table */}
      <div className="rounded-b-xl border-x border-b border-green-500/20 bg-green-500/5 px-4 py-2.5">
        <p className="text-[11px] text-muted-foreground">
          <span className="font-semibold text-green-700 dark:text-green-400">
            La regularidad
          </span>{" "}
          cuenta{" "}
          <span className="font-semibold">CUÁNTAS veces puntúas</span>, no cuánto:
          un signo vale lo mismo que un exacto.
        </p>
      </div>
    </div>
  );
}
