/**
 * Shared helpers for cycling-classification boards.
 * Server-safe — no "use client".
 */
import * as React from "react";
import { cn } from "@/lib/utils";

/** Two-letter uppercase initials from a display name. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Circular rank badge, h-7 w-7.
 * `accent` is the Tailwind class string for rank-1 styling; ranks 2/3/rest
 * use shared silver/bronze/muted colours.
 */
export function RankBadge({
  rank,
  accent,
}: {
  rank: number;
  /** Tailwind classes for rank === 1, e.g. "bg-amber-400/20 text-amber-600 dark:text-amber-400" */
  accent: string;
}) {
  const medal =
    rank === 1
      ? accent
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
