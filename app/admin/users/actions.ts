"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";

import {
  adminActor,
  getAppSettingsAdmin,
  saveAppSettings,
  writeAudit,
} from "../_lib";

export type UserActionState = { ok: boolean; message: string };

async function loadProfile(id: string): Promise<Profile | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

const jokerSchema = z
  .object({
    user_id: z.string().uuid(),
    delta: z.coerce.number().int().min(-50).max(50),
  })
  .strict();

/** Grant (positive) or remove (negative) jokers, clamped at 0. */
export async function adjustJokers(
  _prev: UserActionState,
  form: FormData,
): Promise<UserActionState> {
  const actor = await adminActor();
  const parsed = jokerSchema.safeParse({
    user_id: form.get("user_id"),
    delta: form.get("delta"),
  });
  if (!parsed.success) return { ok: false, message: "Datos inválidos." };

  const { user_id, delta } = parsed.data;
  const before = await loadProfile(user_id);
  if (!before) return { ok: false, message: "Jugador no encontrado." };

  const next = Math.max(0, before.joker_count + delta);
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("profiles")
    .update({ joker_count: next })
    .eq("id", user_id);
  if (error) return { ok: false, message: `Error: ${error.message}` };

  await writeAudit({
    actor,
    action: delta >= 0 ? "grant_jokers" : "remove_jokers",
    target_type: "profile",
    target_id: user_id,
    before: { joker_count: before.joker_count },
    after: { joker_count: next },
  });

  revalidatePath("/admin/users");
  return { ok: true, message: `Jokers de ${before.display_name}: ${next}.` };
}

const roleSchema = z
  .object({
    user_id: z.string().uuid(),
    role: z.enum(["player", "admin"]),
  })
  .strict();

/** Promote to admin or demote to player. */
export async function setRole(
  _prev: UserActionState,
  form: FormData,
): Promise<UserActionState> {
  const actor = await adminActor();
  const parsed = roleSchema.safeParse({
    user_id: form.get("user_id"),
    role: form.get("role"),
  });
  if (!parsed.success) return { ok: false, message: "Datos inválidos." };

  const { user_id, role } = parsed.data;

  // Guardrail: never let an admin demote themselves (avoids lockout).
  if (user_id === actor.id && role !== "admin") {
    return { ok: false, message: "No puedes quitarte tu propio rol de admin." };
  }

  const before = await loadProfile(user_id);
  if (!before) return { ok: false, message: "Jugador no encontrado." };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role: role as Role })
    .eq("id", user_id);
  if (error) return { ok: false, message: `Error: ${error.message}` };

  await writeAudit({
    actor,
    action: role === "admin" ? "promote_admin" : "demote_player",
    target_type: "profile",
    target_id: user_id,
    before: { role: before.role },
    after: { role },
  });

  revalidatePath("/admin/users");
  return {
    ok: true,
    message: `${before.display_name} es ahora ${role === "admin" ? "admin" : "jugador"}.`,
  };
}

const banSchema = z
  .object({
    user_id: z.string().uuid(),
    banned: z.enum(["true", "false"]).transform((v) => v === "true"),
  })
  .strict();

/**
 * Ban / unban a player. There is no `banned` column on `profiles`, so the set
 * of banned user-ids lives in the admin-owned `app_settings` blob.
 */
export async function setBan(
  _prev: UserActionState,
  form: FormData,
): Promise<UserActionState> {
  const actor = await adminActor();
  const parsed = banSchema.safeParse({
    user_id: form.get("user_id"),
    banned: form.get("banned"),
  });
  if (!parsed.success) return { ok: false, message: "Datos inválidos." };

  const { user_id, banned } = parsed.data;
  if (user_id === actor.id && banned) {
    return { ok: false, message: "No puedes banearte a ti mismo." };
  }

  const settings = await getAppSettingsAdmin();
  const current = new Set(settings.banned_user_ids);
  if (banned) current.add(user_id);
  else current.delete(user_id);

  const after = { ...settings, banned_user_ids: Array.from(current) };
  const { error } = await saveAppSettings(after);
  if (error) return { ok: false, message: `Error: ${error}` };

  await writeAudit({
    actor,
    action: banned ? "ban_user" : "unban_user",
    target_type: "profile",
    target_id: user_id,
    before: { banned: settings.banned_user_ids.includes(user_id) },
    after: { banned },
  });

  revalidatePath("/admin/users");
  return { ok: true, message: banned ? "Jugador baneado." : "Baneo retirado." };
}
