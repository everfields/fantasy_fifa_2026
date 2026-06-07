"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import type { BonusQuestion } from "@/lib/types";

import { adminActor, writeAudit } from "../_lib";

export type BonusActionState = { ok: boolean; message: string };

/** Split a textarea of newline/comma-separated options into a clean array. */
function parseOptions(raw: FormDataEntryValue | null): string[] | null {
  if (typeof raw !== "string") return null;
  const opts = raw
    .split(/[\n,]/)
    .map((o) => o.trim())
    .filter(Boolean);
  return opts.length ? opts : null;
}

const upsertSchema = z
  .object({
    id: z.string().optional(),
    text: z.string().min(3, "Texto demasiado corto").max(500),
    type: z.enum(["single", "multi", "numeric"]),
    points: z.coerce.number().int().min(0).max(1000),
    locks_at: z
      .string()
      .min(1)
      .refine((v) => !Number.isNaN(Date.parse(v)), "Fecha inválida"),
  })
  .strict();

async function loadQuestion(id: string): Promise<BonusQuestion | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("bonus_questions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as BonusQuestion | null) ?? null;
}

/** Create a new bonus question or update an existing one (when `id` present). */
export async function upsertBonus(
  _prev: BonusActionState,
  form: FormData,
): Promise<BonusActionState> {
  const actor = await adminActor();

  const parsed = upsertSchema.safeParse({
    id: (form.get("id") as string) || undefined,
    text: form.get("text"),
    type: form.get("type"),
    points: form.get("points"),
    locks_at: form.get("locks_at"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const { id, text, type, points, locks_at } = parsed.data;
  const options = type === "numeric" ? null : parseOptions(form.get("options"));

  if ((type === "single" || type === "multi") && !options) {
    return { ok: false, message: "Las preguntas de opción requieren opciones." };
  }

  const iso = new Date(locks_at).toISOString();
  const supabase = createServiceClient();

  if (id) {
    const before = await loadQuestion(id);
    const payload = { text, type, points, options, locks_at: iso };
    const { error } = await supabase
      .from("bonus_questions")
      .update(payload)
      .eq("id", id);
    if (error) return { ok: false, message: `Error: ${error.message}` };

    await writeAudit({
      actor,
      action: "update_bonus_question",
      target_type: "bonus_question",
      target_id: id,
      before,
      after: { id, ...payload },
    });
    revalidatePath("/admin/bonus");
    return { ok: true, message: "Pregunta actualizada." };
  }

  const payload = {
    text,
    type,
    points,
    options,
    correct_answer: null,
    locks_at: iso,
  };
  const { data, error } = await supabase
    .from("bonus_questions")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { ok: false, message: `Error: ${error.message}` };

  await writeAudit({
    actor,
    action: "create_bonus_question",
    target_type: "bonus_question",
    target_id: data?.id ?? null,
    after: { id: data?.id, ...payload },
  });
  revalidatePath("/admin/bonus");
  return { ok: true, message: "Pregunta creada." };
}

const closeSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(["single", "multi", "numeric"]),
  })
  .passthrough();

/**
 * "Close" a question by recording its correct answer. For `multi`, several
 * `correct_answer` values may be submitted. Setting the correct answer is what
 * lets the scoring engine grade it; recalc still has to be run afterwards.
 */
export async function closeBonus(
  _prev: BonusActionState,
  form: FormData,
): Promise<BonusActionState> {
  const actor = await adminActor();

  const parsed = closeSchema.safeParse({
    id: form.get("id"),
    type: form.get("type"),
  });
  if (!parsed.success) return { ok: false, message: "Datos inválidos." };

  const { id, type } = parsed.data;

  let correct_answer: string | string[] | number;
  if (type === "multi") {
    const values = form.getAll("correct_answer").map(String).filter(Boolean);
    if (values.length === 0) {
      return { ok: false, message: "Selecciona al menos una opción correcta." };
    }
    correct_answer = values;
  } else if (type === "numeric") {
    const n = Number(form.get("correct_answer"));
    if (Number.isNaN(n)) return { ok: false, message: "Valor numérico inválido." };
    correct_answer = n;
  } else {
    const v = String(form.get("correct_answer") ?? "").trim();
    if (!v) return { ok: false, message: "Indica la respuesta correcta." };
    correct_answer = v;
  }

  const before = await loadQuestion(id);
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("bonus_questions")
    .update({ correct_answer })
    .eq("id", id);
  if (error) return { ok: false, message: `Error: ${error.message}` };

  await writeAudit({
    actor,
    action: "close_bonus_question",
    target_type: "bonus_question",
    target_id: id,
    before: { correct_answer: before?.correct_answer ?? null },
    after: { correct_answer },
  });

  revalidatePath("/admin/bonus");
  return {
    ok: true,
    message: "Respuesta correcta guardada. Ejecuta «Recalcular» para repartir los puntos.",
  };
}
