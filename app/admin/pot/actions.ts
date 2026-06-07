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

const potSchema = z
  .object({ pot_amount: z.coerce.number().min(0).max(1_000_000) })
  .strict();

/** Set the total pot amount. */
export async function setPotAmount(
  _prev: PotActionState,
  form: FormData,
): Promise<PotActionState> {
  const actor = await adminActor();
  const parsed = potSchema.safeParse({ pot_amount: form.get("pot_amount") });
  if (!parsed.success) return { ok: false, message: "Importe inválido." };

  const settings = await getAppSettingsAdmin();
  const after = { ...settings, pot_amount: parsed.data.pot_amount };
  const { error } = await saveAppSettings(after);
  if (error) return { ok: false, message: `Error: ${error}` };

  await writeAudit({
    actor,
    action: "set_pot_amount",
    target_type: "app_settings",
    target_id: "1",
    before: { pot_amount: settings.pot_amount },
    after: { pot_amount: parsed.data.pot_amount },
  });

  revalidatePath("/admin/pot");
  revalidatePath("/admin");
  return { ok: true, message: "Importe del bote actualizado." };
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

  const after = { ...settings, paid_user_ids: Array.from(current) };
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
  return { ok: true, message: paid ? "Marcado como pagado." : "Marcado como pendiente." };
}
