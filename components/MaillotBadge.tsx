import * as React from "react";

import type { MaillotKey } from "@/lib/types";
import { cn } from "@/lib/utils";

export const MAILLOT_LABELS: Record<MaillotKey, string> = {
  amarillo: "Maillot amarillo — líder de la general",
  verde: "Maillot verde — la regularidad",
  lunares: "Maillot de lunares — rey de la montaña",
  blanco: "Maillot blanco — mejor joven",
  arcoiris: "Maillot arcoíris — campeón de la pasada edición",
  rojo: "Farolillo rojo — cierra el pelotón",
  extremadura: "Maillot extremeño — mejor corredor de Extremadura",
  monars: "Maillot Monar — mejor corredor de la familia Monar",
  azul: "Maillot azul — ganador de meta volante",
};

/**
 * Inline SVG jersey (torso + sleeves). Server-safe — no "use client".
 * The jersey shape is a single reusable silhouette; fill/pattern differs
 * per maillot variant.
 */
export function MaillotBadge({
  maillot,
  size = "sm",
  className,
}: {
  maillot: MaillotKey;
  size?: "sm" | "md";
  className?: string;
}) {
  const label = MAILLOT_LABELS[maillot];
  const dim = size === "md" ? 28 : 20;
  // Deterministic per variant: SSR/CSR-stable (no hydration mismatch). Repeats
  // of the same id on a page are harmless — they reference identical <defs>.
  const id = `maillot-${maillot}`;

  return (
    <svg
      width={dim}
      height={dim}
      viewBox="0 0 24 24"
      aria-label={label}
      role="img"
      className={cn("shrink-0", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{label}</title>
      <defs>
        <JerseyDefs id={id} maillot={maillot} />
      </defs>
      {/* Jersey body path: collar, shoulders, sleeves, torso */}
      <JerseyShape id={id} maillot={maillot} />
      {/* Monars: the "M" of the Monar family over the Canarias stripes. */}
      {maillot === "monars" && (
        <text
          x="12"
          y="16.5"
          textAnchor="middle"
          fontSize="9"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
          fill="white"
          stroke="#0a3d62"
          strokeWidth="0.35"
          paintOrder="stroke"
        >
          M
        </text>
      )}
    </svg>
  );
}

/* ─── jersey fill defs ─────────────────────────────────────────────────────── */

function JerseyDefs({ id, maillot }: { id: string; maillot: MaillotKey }) {
  if (maillot === "lunares") {
    // White with red polka dots
    return (
      <pattern
        id={`fill-${id}`}
        patternUnits="userSpaceOnUse"
        width="4"
        height="4"
      >
        <rect width="4" height="4" fill="white" />
        <circle cx="2" cy="2" r="0.9" fill="#dc2626" />
      </pattern>
    );
  }
  if (maillot === "extremadura") {
    // Flag of Extremadura: three horizontal bands — green / white / black.
    return (
      <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#009639" />
        <stop offset="38%" stopColor="#009639" />
        <stop offset="38%" stopColor="white" />
        <stop offset="68%" stopColor="white" />
        <stop offset="68%" stopColor="#111827" />
        <stop offset="100%" stopColor="#111827" />
      </linearGradient>
    );
  }
  if (maillot === "monars") {
    // Flag of the Canary Islands: three vertical bands — white / blue / yellow
    // (horizontal gradient → vertical stripes). The "M" is overlaid in <text>.
    return (
      <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="white" />
        <stop offset="33%" stopColor="white" />
        <stop offset="33%" stopColor="#0072c6" />
        <stop offset="66%" stopColor="#0072c6" />
        <stop offset="66%" stopColor="#ffd100" />
        <stop offset="100%" stopColor="#ffd100" />
      </linearGradient>
    );
  }
  if (maillot === "arcoiris") {
    // White body with 5 horizontal UCI bands in the chest area
    return (
      <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
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

function JerseyShape({ id, maillot }: { id: string; maillot: MaillotKey }) {
  /*
   * SVG jersey silhouette — 24×24 viewBox.
   * Collar at top-centre; sleeves extend to sides; torso down to bottom.
   * Path: collar → left shoulder → left sleeve tip → underarm → left side
   *       → bottom-left → bottom-right → right side → underarm
   *       → right sleeve tip → right shoulder → collar.
   */
  const jerseyPath =
    "M9 2 C9 2 9.5 1 12 1 C14.5 1 15 2 15 2 L19 4 L22 4 L22 9 L18 8 L18 21 L6 21 L6 8 L2 9 L2 4 L5 4 Z";

  const strokeColor = "hsl(var(--border))";
  const strokeWidth = "0.6";

  const fillMap: Record<MaillotKey, string> = {
    amarillo: "#fbbf24", // amber-400 — vivid in both themes
    verde: "#22c55e",    // green-500
    lunares: `url(#fill-${id})`,
    blanco: "white",
    arcoiris: `url(#fill-${id})`,
    extremadura: `url(#fill-${id})`,
    monars: `url(#fill-${id})`,
    rojo: "#ef4444",     // red-500
    azul: "#3b82f6",     // blue-500 — vivid in both themes
  };
  const fill = fillMap[maillot];

  return (
    <path
      d={jerseyPath}
      fill={fill}
      stroke={strokeColor}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
}
