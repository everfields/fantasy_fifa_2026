// ============================================================================
// Shared bonus presentation constants + helpers, used by the player-facing
// /bonus page and the per-player /bonus/[playerId] reveal page.
// ============================================================================

import type { BonusCategory, BonusQuestion } from "@/lib/types";

export const TYPE_LABEL: Record<BonusQuestion["type"], string> = {
  single: "Una opción",
  multi: "Varias opciones",
  numeric: "Numérica",
  text: "Texto libre",
};

export const BLOCKS: {
  category: BonusCategory;
  title: string;
  description: string;
}[] = [
  {
    category: "group_winner",
    title: "Campeón de grupo",
    description: "Acierta quién gana cada grupo de la fase de grupos.",
  },
  {
    category: "spain_scorer",
    title: "Primer goleador",
    description: "Predice quién marca el primer gol en cada partido de España.",
  },
  {
    category: "tournament",
    title: "Preguntas del torneo",
    description: "Campeón, pichichi, sorpresas… los grandes pronósticos.",
  },
];

/** Human-readable rendering of a saved bonus answer value. */
export function formatBonusAnswer(value: string | string[] | number): string {
  return Array.isArray(value) ? value.join(", ") : String(value);
}
