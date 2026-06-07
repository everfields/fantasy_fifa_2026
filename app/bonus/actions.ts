"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { BonusQuestion } from "@/lib/types";

export type SaveBonusState = { ok: boolean; error: string | null };

const schema = z.object({
  questionId: z.string().uuid("Pregunta no válida."),
  // single → one option string; multi → JSON array of strings; numeric → number.
  answer: z.string().min(1, "Responde antes de guardar."),
});

export async function saveBonusAnswer(
  _prev: SaveBonusState,
  formData: FormData,
): Promise<SaveBonusState> {
  const parsed = schema.safeParse({
    questionId: formData.get("questionId"),
    answer: formData.get("answer"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Datos no válidos." };
  }

  const { questionId, answer } = parsed.data;
  const profile = await requireUser();
  const supabase = createClient();

  const { data: qRow } = await supabase
    .from("bonus_questions")
    .select("id, type, options, locks_at")
    .eq("id", questionId)
    .single();
  const question = qRow as Pick<
    BonusQuestion,
    "id" | "type" | "options" | "locks_at"
  > | null;

  if (!question) return { ok: false, error: "Pregunta no encontrada." };

  // Lock check server-side.
  if (new Date(question.locks_at).getTime() <= Date.now()) {
    return { ok: false, error: "Esta pregunta ya está cerrada." };
  }

  // Coerce + validate the answer against the question type.
  let value: string | string[] | number;
  switch (question.type) {
    case "numeric": {
      const n = Number(answer);
      if (Number.isNaN(n)) return { ok: false, error: "Introduce un número." };
      value = n;
      break;
    }
    case "multi": {
      let arr: unknown;
      try {
        arr = JSON.parse(answer);
      } catch {
        return { ok: false, error: "Respuesta no válida." };
      }
      if (
        !Array.isArray(arr) ||
        arr.some((x) => typeof x !== "string") ||
        arr.length === 0
      ) {
        return { ok: false, error: "Elige al menos una opción." };
      }
      if (question.options) {
        const allowed = new Set(question.options);
        if ((arr as string[]).some((x) => !allowed.has(x))) {
          return { ok: false, error: "Opción no válida." };
        }
      }
      value = arr as string[];
      break;
    }
    case "single":
    default: {
      if (question.options && !question.options.includes(answer)) {
        return { ok: false, error: "Opción no válida." };
      }
      value = answer;
      break;
    }
  }

  // points_awarded left null — only recalc writes it.
  const { error } = await supabase.from("bonus_answers").upsert(
    {
      user_id: profile.id,
      question_id: questionId,
      answer: value,
    },
    { onConflict: "user_id,question_id" },
  );

  if (error) return { ok: false, error: "No se pudo guardar la respuesta." };

  revalidatePath("/bonus");
  return { ok: true, error: null };
}
