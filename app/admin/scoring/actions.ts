"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  APP_SETTINGS_ID,
  adminActor,
  getAppSettingsAdmin,
  saveAppSettings,
  writeAudit,
} from "../_lib";

const scoringSchema = z.object({
  exact: z.coerce.number().int().min(0).max(1000),
  sign: z.coerce.number().int().min(0).max(1000),
  diff_bonus: z.coerce.number().int().min(0).max(1000),
  joker_multiplier: z.coerce.number().min(1).max(10),
  exact_enabled: z.coerce.boolean(),
  sign_enabled: z.coerce.boolean(),
  diff_bonus_enabled: z.coerce.boolean(),
  bonus_default_points: z.coerce.number().int().min(0).max(100_000),
  group_winner_points: z.coerce.number().int().min(0).max(100_000),
  // Comma-separated prizes per round position ("100, 50, 50, 20, 20, 20, 20").
  meta_volante_distribution: z
    .string()
    .transform((v) => v.split(/[,;\s]+/).filter(Boolean).map(Number))
    .pipe(
      z
        .array(
          z
            .number({ invalid_type_error: "Solo números separados por comas." })
            .int()
            .min(0)
            .max(100_000),
        )
        .min(1, "Indica al menos un premio.")
        .max(30),
    ),
  pot_amount: z.coerce.number().min(0).max(1_000_000),
  season_locked: z.coerce.boolean(),
});

export type ScoringActionState = {
  ok: boolean;
  message: string;
  errors?: Record<string, string>;
};

/** Read a switch's value from FormData ("on" when checked, absent otherwise). */
function checkbox(form: FormData, name: string): boolean {
  const v = form.get(name);
  return v === "on" || v === "true" || v === "1";
}

export async function saveScoring(
  _prev: ScoringActionState,
  form: FormData,
): Promise<ScoringActionState> {
  const actor = await adminActor();

  const parsed = scoringSchema.safeParse({
    exact: form.get("exact"),
    sign: form.get("sign"),
    diff_bonus: form.get("diff_bonus"),
    joker_multiplier: form.get("joker_multiplier"),
    exact_enabled: checkbox(form, "exact_enabled"),
    sign_enabled: checkbox(form, "sign_enabled"),
    diff_bonus_enabled: checkbox(form, "diff_bonus_enabled"),
    bonus_default_points: form.get("bonus_default_points"),
    group_winner_points: form.get("group_winner_points"),
    meta_volante_distribution: form.get("meta_volante_distribution"),
    pot_amount: form.get("pot_amount"),
    season_locked: checkbox(form, "season_locked"),
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[String(issue.path[0])] = issue.message;
    }
    return { ok: false, message: "Revisa los campos marcados.", errors };
  }

  const d = parsed.data;
  const before = await getAppSettingsAdmin();

  // Preserve admin extension arrays (bans / payments) and unknown keys the form
  // does not touch (spread `before`). `jokers_per_user` is deprecated — its input
  // was removed from the form (jokers are per-match) — so carry the stored value forward.
  const after = {
    ...before,
    scoring: {
      exact: d.exact,
      sign: d.sign,
      diff_bonus: d.diff_bonus,
      joker_multiplier: d.joker_multiplier,
      exact_enabled: d.exact_enabled,
      sign_enabled: d.sign_enabled,
      diff_bonus_enabled: d.diff_bonus_enabled,
    },
    bonus_default_points: d.bonus_default_points,
    group_winner_points: d.group_winner_points,
    // meta_volante_points is deprecated — kept mirrored to the 1º prize for
    // back-compat with any stale reader of the blob.
    meta_volante_points: d.meta_volante_distribution[0],
    meta_volante_distribution: d.meta_volante_distribution,
    pot_amount: d.pot_amount,
    season_locked: d.season_locked,
  };

  const { error } = await saveAppSettings(after);
  if (error) {
    return { ok: false, message: `Error al guardar: ${error}` };
  }

  await writeAudit({
    actor,
    action: "update_scoring",
    target_type: "app_settings",
    target_id: String(APP_SETTINGS_ID),
    before,
    after,
  });

  revalidatePath("/admin/scoring");
  revalidatePath("/admin");

  return {
    ok: true,
    message:
      "Ajustes guardados. Recuerda ejecutar «Recalcular» para aplicar los cambios a las predicciones ya puntuadas.",
  };
}
