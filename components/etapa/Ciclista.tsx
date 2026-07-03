import * as React from "react";

import type { EtapaPose, MaillotKey } from "@/lib/types";
import { cn } from "@/lib/utils";

import { jerseyFill, JerseyTorsoDefs } from "./jerseys";
import styles from "./etapa.module.css";

/**
 * THE cyclist of "La Etapa". One single cartoon character — every rider shares
 * the same face and body; identity comes from the JERSEY (maillot fills or the
 * default kit color) and the name chip rendered by the player. Poses and
 * accessories are variants of this same character:
 *
 *  - pose "crono"  → aero tuck a lo Induráin: tilted forward, black speed
 *    sunglasses, speed lines trailing.
 *  - pose "lengua" → rezagado: tongue out, sweat drop, slow cadence.
 *  - shaka         → one arm off the bars doing the 🤙 (overtaking, cocky).
 *  - aston         → F1 full helmet with visor (safety-car escortees).
 *  - farolillo     → red lantern under the saddle (glows on night stages).
 *
 * Pure SVG + CSS keyframes (spokes, pedals, bob, tongue, lantern) — no JS
 * animation. Deterministic ids via `idPrefix` (SSR-safe, no Math.random).
 */
export interface CiclistaProps {
  jersey: MaillotKey | null;
  kit: number;
  pose: EtapaPose;
  aston?: boolean;
  farolillo?: boolean;
  shaka?: boolean;
  cadence?: "slow" | "normal" | "fast";
  /** Disable the idle loops (reduced motion). CSS also guards via media query. */
  animated?: boolean;
  /** Width in px; height keeps the 100:74 ratio. */
  size?: number;
  /** SSR-deterministic id prefix (e.g. the rider's user_id). */
  idPrefix: string;
  className?: string;
}

const CADENCE_S = { slow: 1.5, normal: 0.85, fast: 0.45 } as const;

const SKIN = "#f1c197";

export function Ciclista({
  jersey,
  kit,
  pose,
  aston = false,
  farolillo = false,
  shaka = false,
  cadence = "normal",
  animated = true,
  size = 84,
  idPrefix,
  className,
}: CiclistaProps) {
  const prefix = `etapa-${idPrefix.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const fill = jerseyFill(jersey, kit, prefix);
  const spinStyle: React.CSSProperties = {
    animationDuration: `${CADENCE_S[cadence]}s`,
  };
  const loop = (klass: string) => (animated ? klass : undefined);

  // The whole rider (torso/head/arms) tilts as one piece per pose.
  const riderTilt =
    pose === "crono" ? "rotate(15 45 44)" : pose === "lengua" ? "rotate(-4 45 44)" : undefined;

  return (
    <svg
      width={size}
      height={Math.round(size * 0.74)}
      viewBox="0 0 100 74"
      className={cn("overflow-visible text-slate-800 dark:text-slate-200", className)}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <JerseyTorsoDefs prefix={prefix} jersey={jersey} />
      </defs>

      {/* Speed lines (crono or an overtake in progress) */}
      {(pose === "crono" || shaka) && (
        <g
          className={loop(styles.dash)}
          stroke="#38bdf8"
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity="0.8"
        >
          <line x1="2" y1="28" x2="24" y2="28" />
          <line x1="6" y1="38" x2="26" y2="38" />
          <line x1="2" y1="48" x2="22" y2="48" />
        </g>
      )}

      {/* Wheels */}
      <g stroke="currentColor" fill="none">
        <circle cx="26" cy="56" r="13.5" strokeWidth="3" />
        <circle cx="76" cy="56" r="13.5" strokeWidth="3" />
        <g className={loop(styles.spin)} style={spinStyle} strokeWidth="1.4" opacity="0.7">
          <line x1="26" y1="43.5" x2="26" y2="68.5" />
          <line x1="15.2" y1="49.8" x2="36.8" y2="62.2" />
          <line x1="15.2" y1="62.2" x2="36.8" y2="49.8" />
        </g>
        <g className={loop(styles.spin)} style={spinStyle} strokeWidth="1.4" opacity="0.7">
          <line x1="76" y1="43.5" x2="76" y2="68.5" />
          <line x1="65.2" y1="49.8" x2="86.8" y2="62.2" />
          <line x1="65.2" y1="62.2" x2="86.8" y2="49.8" />
        </g>
      </g>

      {/* Frame */}
      <g stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round">
        <path d="M26 56 L44 36 L68 38 L76 56 M26 56 L50 56 L44 36 M50 56 L68 38" />
        {/* seat + handlebar */}
        <path d="M39 33.5 L47 33.5" strokeWidth="3.4" />
        <path d="M68 38 L70 32.5 L74 31.5" />
      </g>

      {/* Farolillo rojo — lantern under the saddle, swinging; glows at night */}
      {farolillo && (
        <g transform="translate(40.5 35)">
          <g className={loop(styles.swing)}>
            <line x1="0" y1="0" x2="0" y2="5" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="0" cy="9" r="7.5" fill="#ef4444" className="opacity-0 blur-[2px] dark:opacity-50" />
            <rect x="-2.6" y="5" width="5.2" height="7.2" rx="1.6" fill="#dc2626" stroke="#7f1d1d" strokeWidth="0.9" />
            <circle cx="0" cy="8.6" r="1.7" fill="#fde047" />
          </g>
        </g>
      )}

      {/* Pedals (crank) */}
      <g className={loop(styles.spin)} style={spinStyle}>
        <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <line x1="50" y1="49" x2="50" y2="63" />
          <line x1="46.5" y1="49" x2="53.5" y2="49" />
          <line x1="46.5" y1="63" x2="53.5" y2="63" />
        </g>
      </g>

      {/* Legs — static bent silhouette; the crank + bob sell the motion */}
      <path
        d="M44 40 L46 51 L51 57"
        fill="none"
        stroke="#1f2937"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="dark:stroke-slate-600"
      />

      {/* Rider (tilts as one piece per pose) */}
      <g transform={riderTilt} className={loop(styles.bob)}>
        {/* torso = the jersey (outline behind keeps white maillots readable) */}
        <path
          d="M44 42 L59 27"
          stroke="currentColor"
          strokeWidth="14.4"
          strokeLinecap="round"
          fill="none"
          opacity="0.35"
        />
        <path d="M44 42 L59 27" stroke={fill} strokeWidth="12.6" strokeLinecap="round" fill="none" />
        {jersey === "monars" && (
          <text
            x="51"
            y="38.5"
            textAnchor="middle"
            fontSize="8.5"
            fontWeight="900"
            fontFamily="system-ui, sans-serif"
            fill="white"
            stroke="#0a3d62"
            strokeWidth="0.4"
            paintOrder="stroke"
            transform="rotate(-45 51 35)"
          >
            M
          </text>
        )}

        {/* arms: on the bars, or one up doing the shaka 🤙 */}
        {shaka ? (
          <g>
            <path
              d="M56 30 L49 16"
              stroke={SKIN}
              strokeWidth="4.4"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="49" cy="14.5" r="3.4" fill={SKIN} stroke="currentColor" strokeWidth="0.9" />
            {/* thumb + pinky out, the rest a fist */}
            <line x1="47" y1="13" x2="42.5" y2="10.5" stroke={SKIN} strokeWidth="2.6" strokeLinecap="round" />
            <line x1="51" y1="12" x2="53.5" y2="7.5" stroke={SKIN} strokeWidth="2.6" strokeLinecap="round" />
          </g>
        ) : (
          <path
            d="M57 30 L69 34"
            stroke={SKIN}
            strokeWidth="4.4"
            strokeLinecap="round"
            fill="none"
          />
        )}

        {/* head — the SAME face for everyone */}
        <g transform={shaka ? "rotate(-10 62 20)" : undefined}>
          <circle cx="62" cy="20" r="6.8" fill={SKIN} stroke="currentColor" strokeWidth="1.1" />
          {aston ? (
            /* F1 full helmet with visor */
            <g>
              <path
                d="M55 21 A7.6 7.6 0 1 1 69.5 22.5 L68.5 24 L56 23.5 Z"
                fill="#27272a"
                stroke="currentColor"
                strokeWidth="0.9"
              />
              <rect x="63" y="17.5" width="6.4" height="3.6" rx="1.4" fill="#7dd3fc" stroke="#0c4a6e" strokeWidth="0.6" />
              <path d="M56 15 Q62 11.5 68 15" fill="none" stroke="#84cc16" strokeWidth="1.6" />
            </g>
          ) : (
            /* cap in jersey color */
            <g>
              <path d="M55.6 18.4 A6.8 6.8 0 0 1 68.4 18.4 L68 20 L56 20 Z" fill={fill} stroke="currentColor" strokeWidth="0.8" />
              <line x1="66.5" y1="19.5" x2="70.5" y2="18.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </g>
          )}
          {pose === "crono" && !aston ? (
            /* black wraparound speed sunglasses */
            <rect x="59.5" y="18" width="9.6" height="3.6" rx="1.6" fill="#0f172a" />
          ) : (
            !aston && <circle cx="65.3" cy="19.6" r="1" fill="#111827" />
          )}
          {/* smile (hidden behind the visor when aston) */}
          {!aston && pose !== "lengua" && (
            <path d="M64.5 23.2 Q66 24.4 67.6 23.2" fill="none" stroke="#111827" strokeWidth="0.9" strokeLinecap="round" />
          )}
          {/* tongue out (rezagados) */}
          {pose === "lengua" && !aston && (
            <g transform="translate(66.8 23)">
              <ellipse
                cx="2.4"
                cy="1.4"
                rx="2.4"
                ry="1.6"
                fill="#f472b6"
                stroke="#be185d"
                strokeWidth="0.6"
                className={loop(styles.wag)}
              />
            </g>
          )}
        </g>

        {/* sweat drop (rezagados) */}
        {pose === "lengua" && (
          <path d="M56 11 Q57.4 13.6 56 14.6 Q54.6 13.6 56 11 Z" fill="#38bdf8" opacity="0.9" />
        )}
      </g>
    </svg>
  );
}
