"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export type UpdateNicknameState = { ok: boolean; error: string | null };

const schema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "El apodo debe tener al menos 2 caracteres.")
    .max(24, "Máximo 24 caracteres."),
});

export async function updateNickname(
  _prev: UpdateNicknameState,
  formData: FormData,
): Promise<UpdateNicknameState> {
  const parsed = schema.safeParse({ displayName: formData.get("displayName") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Apodo no válido." };
  }

  const profile = await requireUser();
  const supabase = createClient();

  // RLS (profiles_self_update) only allows touching the caller's own row and
  // blocks role/joker changes; the 0009 trigger refreshes standings_cache.
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName })
    .eq("id", profile.id);

  if (error) return { ok: false, error: "No se pudo guardar el apodo." };

  // The nickname shows in the nav on every page.
  revalidatePath("/", "layout");
  return { ok: true, error: null };
}
