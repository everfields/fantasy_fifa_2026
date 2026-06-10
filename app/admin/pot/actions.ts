"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  adminActor,
  getAppSettingsAdmin,
  saveAppSettings,
  writeAudit,
} from "../_lib";

export type PotActionState = { ok: boolean; message: string };

const potConfigSchema = z
  .object({
    entry_fee: z.coerce.number().min(0).max(10_000),
    pot_expenses: z.coerce.number().min(0).max(10_000),
  })
  .strict();

/**
 * Set the pot economics: entry fee per player and expenses (domain cost)
 * deducted from the winner's prize. `pot_amount` is derived — always kept in
 * sync as entry_fee × paid players.
 */
export async function setPotConfig(
  _prev: PotActionState,
  form: FormData,
): Promise<PotActionState> {
  const actor = await adminActor();
  const parsed = potConfigSchema.safeParse({
    entry_fee: form.get("entry_fee"),
    pot_expenses: form.get("pot_expenses"),
  });
  if (!parsed.success) return { ok: false, message: "Importes inválidos." };

  const settings = await getAppSettingsAdmin();
  const after = {
    ...settings,
    ...parsed.data,
    pot_amount: parsed.data.entry_fee * settings.paid_user_ids.length,
  };
  const { error } = await saveAppSettings(after);
  if (error) return { ok: false, message: `Error: ${error}` };

  await writeAudit({
    actor,
    action: "set_pot_config",
    target_type: "app_settings",
    target_id: "1",
    before: {
      entry_fee: settings.entry_fee,
      pot_expenses: settings.pot_expenses,
      pot_amount: settings.pot_amount,
    },
    after: {
      entry_fee: after.entry_fee,
      pot_expenses: after.pot_expenses,
      pot_amount: after.pot_amount,
    },
  });

  revalidatePath("/admin/pot");
  revalidatePath("/admin");
  revalidatePath("/standings");
  return { ok: true, message: "Configuración del bote actualizada." };
}

const paidSchema = z
  .object({
    user_id: z.string().uuid(),
    paid: z.enum(["true", "false"]).transform((v) => v === "true"),
  })
  .strict();

/**
 * Mark / unmark a player as having paid into the pot. There is no `paid` column
 * on `profiles`, so the set of paid user-ids is stored in the admin-owned
 * `app_settings` blob (alongside bans). Documented choice — see admin/_lib.ts.
 * Also keeps `pot_amount` in sync (entry_fee × paid players).
 */
export async function setPaid(
  _prev: PotActionState,
  form: FormData,
): Promise<PotActionState> {
  const actor = await adminActor();
  const parsed = paidSchema.safeParse({
    user_id: form.get("user_id"),
    paid: form.get("paid"),
  });
  if (!parsed.success) return { ok: false, message: "Datos inválidos." };

  const { user_id, paid } = parsed.data;
  const settings = await getAppSettingsAdmin();
  const current = new Set(settings.paid_user_ids);
  if (paid) current.add(user_id);
  else current.delete(user_id);

  const after = {
    ...settings,
    paid_user_ids: Array.from(current),
    pot_amount: settings.entry_fee * current.size,
  };
  const { error } = await saveAppSettings(after);
  if (error) return { ok: false, message: `Error: ${error}` };

  await writeAudit({
    actor,
    action: paid ? "mark_paid" : "mark_unpaid",
    target_type: "profile",
    target_id: user_id,
    before: { paid: settings.paid_user_ids.includes(user_id) },
    after: { paid },
  });

  revalidatePath("/admin/pot");
  revalidatePath("/standings");
  return { ok: true, message: paid ? "Marcado como pagado." : "Marcado como pendiente." };
}
