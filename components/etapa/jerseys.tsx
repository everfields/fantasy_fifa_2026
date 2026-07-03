import * as React from "react";

import type { MaillotKey } from "@/lib/types";

/**
 * Jersey fills for the etapa cyclist's torso. Mirrors the colors/patterns of
 * `components/MaillotBadge.tsx` (the canonical jersey badge) at rider scale —
 * kept as a separate module so the badge stays untouched.
 *
 * Default kits (riders with no maillot) use the same 8-color palette as
 * PointsChart, indexed by `EtapaRider.kit` (0..7, deterministic per user).
 */
export const KIT_COLORS = [
  "hsl(142.1 76.2% 36.3%)", // primary green
  "hsl(221 83% 53%)", // blue
  "hsl(25 95% 53%)", // orange
  "hsl(330 81% 60%)", // pink
  "hsl(262 83% 58%)", // violet
  "hsl(48 96% 53%)", // amber
  "hsl(173 80% 40%)", // teal
  "hsl(0 84% 60%)", // red
] as const;

const FLAT_FILLS: Partial<Record<MaillotKey, string>> = {
  amarillo: "#fbbf24",
  verde: "#22c55e",
  blanco: "white",
  rojo: "#ef4444",
  azul: "#3b82f6",
};

/** Fill for a rider's torso: flat color, def reference, or default kit. */
export function jerseyFill(
  jersey: MaillotKey | null,
  kit: number,
  prefix: string,
): string {
  if (jersey === null) return KIT_COLORS[Math.abs(kit) % KIT_COLORS.length];
  return FLAT_FILLS[jersey] ?? `url(#${prefix}-fill)`;
}

/**
 * <defs> content for the patterned/striped maillots (lunares, extremadura,
 * monars, arcoíris). Render inside the cyclist's <defs>; no-op for the rest.
 * `prefix` must be SSR-deterministic (derived from the rider id).
 */
export function JerseyTorsoDefs({
  prefix,
  jersey,
}: {
  prefix: string;
  jersey: MaillotKey | null;
}) {
  if (jersey === "lunares") {
    return (
      <pattern
        id={`${prefix}-fill`}
        patternUnits="userSpaceOnUse"
        width="5.5"
        height="5.5"
      >
        <rect width="5.5" height="5.5" fill="white" />
        <circle cx="2.75" cy="2.75" r="1.25" fill="#dc2626" />
      </pattern>
    );
  }
  if (jersey === "extremadura") {
    return (
      <linearGradient id={`${prefix}-fill`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#009639" />
        <stop offset="38%" stopColor="#009639" />
        <stop offset="38%" stopColor="white" />
        <stop offset="68%" stopColor="white" />
        <stop offset="68%" stopColor="#111827" />
        <stop offset="100%" stopColor="#111827" />
      </linearGradient>
    );
  }
  if (jersey === "monars") {
    return (
      <linearGradient id={`${prefix}-fill`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="white" />
        <stop offset="33%" stopColor="white" />
        <stop offset="33%" stopColor="#0072c6" />
        <stop offset="66%" stopColor="#0072c6" />
        <stop offset="66%" stopColor="#ffd100" />
        <stop offset="100%" stopColor="#ffd100" />
      </linearGradient>
    );
  }
  if (jersey === "arcoiris") {
    return (
      <linearGradient id={`${prefix}-fill`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="white" />
        <stop offset="30%" stopColor="white" />
        <stop offset="30%" stopColor="#1d4ed8" />
        <stop offset="42%" stopColor="#1d4ed8" />
        <stop offset="42%" stopColor="#dc2626" />
        <stop offset="54%" stopColor="#dc2626" />
        <stop offset="54%" stopColor="#111827" />
        <stop offset="66%" stopColor="#111827" />
        <stop offset="66%" stopColor="#ca8a04" />
        <stop offset="78%" stopColor="#ca8a04" />
        <stop offset="78%" stopColor="#16a34a" />
        <stop offset="100%" stopColor="#16a34a" />
      </linearGradient>
    );
  }
  return null;
}
