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
} from "./config";

export { groupPeloton } from "./peloton";
export type { PelotonOptions } from "./peloton";

export { computeRegularity } from "./regularity";

export { computeMontana, pickMontanaStages } from "./montana";
export type { PickableMatch } from "./montana";

export { assignAstons, assignMaillots, sortGeneral } from "./maillots";
