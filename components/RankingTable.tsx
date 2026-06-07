import * as React from "react";

import type { StandingRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
        "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold tabular-nums",
        medal
      )}
    >
      {rank}
    </span>
  );
}

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
        No standings yet. Predictions will appear here once matches are scored.
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border", className)}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-14 text-center">#</TableHead>
            <TableHead>Player</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="hidden text-right sm:table-cell">
              Exact
            </TableHead>
            <TableHead className="hidden text-right sm:table-cell">
              Bonus
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isCurrent = currentUserId === row.user_id;
            return (
              <TableRow
                key={row.user_id}
                data-state={isCurrent ? "selected" : undefined}
                className={cn(
                  isCurrent &&
                    "bg-primary/5 hover:bg-primary/10 ring-1 ring-inset ring-primary/30"
                )}
              >
                <TableCell className="text-center">
                  <RankBadge rank={row.rank} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      {row.avatar ? (
                        <AvatarImage src={row.avatar} alt={row.display_name} />
                      ) : null}
                      <AvatarFallback className="text-xs">
                        {initials(row.display_name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex items-center gap-2 font-medium">
                      <span className="truncate">{row.display_name}</span>
                      {isCurrent && (
                        <Badge
                          variant="success"
                          className="px-1.5 py-0 text-[10px]"
                        >
                          You
                        </Badge>
                      )}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right text-base font-bold tabular-nums">
                  {row.total_points}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                  {row.exact_hits}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                  {row.bonus_points}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
