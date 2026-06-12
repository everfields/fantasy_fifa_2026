// pure — no I/O
// ============================================================================
// Fixed-roster configuration for the cycling-style classifications.
//
// These maillots are NOT earned by points — they are assigned to specific
// people: the reigning champion (arcoíris) and the "young talents" roster
// (blanco). We key them by EMAIL (not user_id / nick) so they survive nick
// changes and re-seeds. The caller resolves user_id → email from `profiles`.
// ============================================================================

/** JM — campeón de la edición anterior. El maillot arcoíris es suyo toda la temporada. */
export const MAILLOT_ARCOIRIS_EMAIL = "aronofski@hotmail.com";

/** Jóvenes talentos (maillot blanco): Juan y Carlo, alberandu, Pablo M.H. Por email para sobrevivir a cambios de nick. */
export const MAILLOT_BLANCO_EMAILS = [
  "juanmolin15@hotmail.com",
  "carlosandujarvaca@gmail.com",
  "pmarher13@gmail.com",
];
