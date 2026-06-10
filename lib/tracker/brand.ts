// ============================================================================
// "Luis de la Tracker" — display brand constants.
//
// Kept separate from persona.ts (which carries the big LLM system prompt) so
// player-facing components can import the photo/title without bundling the
// prompt. Safe to import from client or server components.
// ============================================================================

export const TRACKER_TITLE = "Luis de la Tracker";
export const TRACKER_TAGLINE = "El parte del míster";

/**
 * Photo of Luis de la Fuente (Spain NT manager), self-hosted in `public/`
 * (sourced from Wikimedia Commons, CC-licensed — attribution stays in
 * LUIS_PHOTO_CREDIT and is shown in the UI; the licence requires it).
 * Override with NEXT_PUBLIC_LUIS_PHOTO_URL to swap the image without a deploy.
 */
export const LUIS_PHOTO_URL =
  process.env.NEXT_PUBLIC_LUIS_PHOTO_URL ?? "/luis-de-la-fuente.jpg";

/** Attribution shown next to the photo (Wikimedia Commons requires it). */
export const LUIS_PHOTO_CREDIT = "Foto: Wikimedia Commons (CC) — uso paródico";
