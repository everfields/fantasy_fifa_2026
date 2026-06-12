/**
 * Shared helpers for cycling-classification boards.
 * Server-safe — no "use client".
 */
import * as React from "react";
import { cn } from "@/lib/utils";

export const ASTON_LABEL =
  "Coche Aston Martin — el safety car le pisa la rueda";

/**
 * Aston Martin F1 safety car (livery variant): bright Aston green body,
 * lime accent stripe, halo, dark wheels. Worn by the third- and
 * second-to-last riders of the general (the last keeps the farolillo rojo
 * alone). Slightly larger than the maillots so the livery reads as an Aston.
 * Server-safe inline SVG, fixed colors (vivid in both themes).
 */
export function AstonBadge({
  size = "sm",
  className,
}: {
  size?: "sm" | "md";
  className?: string;
}) {
  const w = size === "md" ? 38 : 30;
  const h = Math.round((w * 26) / 64);
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 64 26"
      aria-label={ASTON_LABEL}
      role="img"
      className={cn("shrink-0", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{ASTON_LABEL}</title>
      {/* rear wing */}
      <rect x="2" y="6" width="3" height="10" rx="1" fill="#069f8d" />
      <rect x="2" y="5" width="10" height="2.5" rx="1.2" fill="#069f8d" />
      {/* body: rear deck → cockpit hump → nose (facing right) */}
      <path
        d="M6 16 C10 10.5 18 9.5 24 9.5 C27 6.5 34 6.5 36 9.5 C44 10.5 56 13 62 15 C62.5 17 60 18 56 18 L12 18 C8 18 6 17.2 6 16 Z"
        fill="#069f8d"
      />
      {/* halo */}
      <path
        d="M27 9.5 C28 5.8 33 5.8 34 9.5"
        stroke="#069f8d"
        fill="none"
        strokeWidth="1.8"
      />
      {/* lime accent stripe */}
      <path d="M10 15.4 L58 16.2 L58 17.2 L10 16.6 Z" fill="#cedc00" />
      {/* wheels */}
      <circle cx="16" cy="18.5" r="5.5" fill="#18181b" />
      <circle cx="16" cy="18.5" r="2.1" fill="#71717a" />
      <circle cx="47" cy="18.5" r="5.5" fill="#18181b" />
      <circle cx="47" cy="18.5" r="2.1" fill="#71717a" />
      {/* front wing */}
      <rect x="55" y="19.5" width="9" height="2" rx="1" fill="#069f8d" />
    </svg>
  );
}

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
