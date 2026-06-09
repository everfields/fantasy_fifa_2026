"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { Match } from "@/lib/types";
import { getAppSettings } from "../_lib/data";

// PredictionForm's contract is `action: (formData: FormData) => Promise<void>`,
// a plain Server Action. We therefore signal failure by throwing — Next surfaces
// it to the nearest error boundary — and signal success by revalidating. Field
// names mirror PredictionForm's markup. Jokers are NOT a user choice: a joker
// is a property of the match (`Match.is_joker`, admin-set), so the action never
// reads or writes a joker flag.

class SavePredictionError extends Error {}

const schema = z.object({
  matchId: z.string().uuid("Partido no válido."),
  homePred: z.coerce.number().int().min(0).max(99),
  awayPred: z.coerce.number().int().min(0).max(99),
});

export async function savePrediction(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({
    matchId: formData.get("match_id"),
    homePred: formData.get("home_pred"),
    awayPred: formData.get("away_pred"),
  });
  if (!parsed.success) {
    throw new SavePredictionError(
      parsed.error.errors[0]?.message ?? "Datos no válidos.",
    );
  }

  const { matchId, homePred, awayPred } = parsed.data;

  const profile = await requireUser();
  const supabase = createClient();

  const settings = await getAppSettings();
  if (settings.season_locked) {
    throw new SavePredictionError("La temporada está cerrada.");
  }

  // RE-CHECK the lock server-side. Never trust the client.
  const { data: matchRow } = await supabase
    .from("matches")
    .select("id, locks_at")
    .eq("id", matchId)
    .single();
  const match = matchRow as Pick<Match, "id" | "locks_at"> | null;

  if (!match) throw new SavePredictionError("Partido no encontrado.");
  if (new Date(match.locks_at).getTime() <= Date.now()) {
    throw new SavePredictionError("El partido ya está cerrado.");
  }

  // Upsert the prediction. UNIQUE(user_id, match_id) makes this idempotent.
  // points_awarded is intentionally untouched — only the recalc job writes it.
  // is_joker is NOT written: jokers belong to the match (Match.is_joker), and
  // the predictions.is_joker column keeps its DB default (false).
  const { error } = await supabase.from("predictions").upsert(
    {
      user_id: profile.id,
      match_id: matchId,
      home_pred: homePred,
      away_pred: awayPred,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,match_id" },
  );

  if (error) {
    // RLS (now() < locks_at, own rows only) is the final backstop.
    throw new SavePredictionError("No se pudo guardar el pronóstico.");
  }

  revalidatePath("/matches");
  revalidatePath("/dashboard");
}
