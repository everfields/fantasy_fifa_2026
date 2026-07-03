// pure — no I/O
// ============================================================================
// Cycling-style classifications ("la Vuelta de la Resiporra").
//
// Pure, unit-tested functions that derive the general peloton grouping,
// regularity, montaña and maillot assignments from the scored standings.
// No I/O, no DB; all point values come in via options (from app_settings).
// See docs/decisions/0014-cycling-classifications.md.
// ============================================================================

export {
  MAILLOT_ARCOIRIS_EMAIL,
  MAILLOT_BLANCO_EMAILS,
  MAILLOT_EXTREMADURA_EMAILS,
  MAILLOT_MONARS_EMAILS,
} from "./config";

export { groupPeloton } from "./peloton";
export type { PelotonOptions } from "./peloton";

export { computeRegularity } from "./regularity";

export { computeMontana, pickMontanaStages } from "./montana";
export type { PickableMatch } from "./montana";

export { assignAstons, assignMaillots, sortGeneral } from "./maillots";

export {
  buildEtapaTimeline,
  kitIndex,
  KIT_PALETTE_SIZE,
  MAILLOT_PRIORITY,
} from "./etapa";
export type { EtapaTimelineInput } from "./etapa";
