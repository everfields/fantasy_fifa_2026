"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { scoreBonusAnswer } from "@/lib/scoring";
import type { BonusAnswer, BonusQuestion, Match, Team } from "@/lib/types";

import { adminActor, getAppSettingsAdmin, writeAudit } from "../_lib";

/** Marker embedded in auto-generated group-winner questions for idempotency. */
const GROUP_WINNER_PREFIX = "¿Campeón del Grupo";

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
    type: z.enum(["single", "multi", "numeric", "text"]),
    category: z
      .enum(["group_winner", "spain_scorer", "tournament"])
      .default("tournament"),
    points: z.coerce.number().int().min(0).max(100_000),
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
    category: (form.get("category") as string) || undefined,
    points: form.get("points"),
    locks_at: form.get("locks_at"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const { id, text, type, category, points, locks_at } = parsed.data;
  // single/multi carry options; numeric/text have none.
  const options =
    type === "numeric" || type === "text"
      ? null
      : parseOptions(form.get("options"));

  if ((type === "single" || type === "multi") && !options) {
    return { ok: false, message: "Las preguntas de opción requieren opciones." };
  }

  const iso = new Date(locks_at).toISOString();
  const supabase = createServiceClient();

  if (id) {
    const before = await loadQuestion(id);
    const payload = { text, type, category, points, options, locks_at: iso };
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
    category,
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
    type: z.enum(["single", "multi", "numeric", "text"]),
  })
  .passthrough();

/**
 * "Close" a question by recording its correct answer. For `multi`, several
 * `correct_answer` values may be submitted. Setting the correct answer lets the
 * scoring engine grade it, so we grade this question's answers IN PLACE (same
 * idempotent engine as the full recalc) and refresh standings immediately —
 * mirroring `gradeTextAnswer`. This closes the footgun where closing a
 * group-winner / option question left every `points_awarded` null until the
 * admin remembered to run the separate manual recalc.
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

  // Grade this question's answers in place with the pure scoring engine and
  // refresh standings — same idempotent path the full recalc uses, scoped to
  // this question. Only rows whose recomputed points differ are written.
  const question: BonusQuestion = {
    ...(before as BonusQuestion),
    correct_answer,
  };
  const { data: answerRows } = await supabase
    .from("bonus_answers")
    .select("*")
    .eq("question_id", id);
  const answers = (answerRows as BonusAnswer[] | null) ?? [];

  let graded = 0;
  for (const a of answers) {
    const next = scoreBonusAnswer(a.answer, question, a.manual_correct);
    if (next === a.points_awarded) continue;
    const { error: gradeError } = await supabase
      .from("bonus_answers")
      .update({ points_awarded: next })
      .eq("id", a.id);
    if (gradeError) {
      return { ok: false, message: `Error al puntuar: ${gradeError.message}` };
    }
    graded++;
  }

  const { error: rpcError } = await supabase.rpc("refresh_standings");
  if (rpcError) {
    return {
      ok: false,
      message: `Respuesta guardada, pero falló refresh_standings: ${rpcError.message}`,
    };
  }

  await writeAudit({
    actor,
    action: "close_bonus_question",
    target_type: "bonus_question",
    target_id: id,
    before: { correct_answer: before?.correct_answer ?? null },
    after: { correct_answer, graded },
  });

  revalidatePath("/admin/bonus");
  revalidatePath("/standings");
  return {
    ok: true,
    message: `Respuesta correcta guardada y ${graded} respuesta(s) puntuada(s). Clasificación actualizada.`,
  };
}

/**
 * Auto-generate one "¿Campeón del Grupo X?" bonus question per group (A–L).
 *
 * For each group it creates a `single` question whose options are that group's
 * team names, `points` = settings.group_winner_points, `locks_at` = the earliest
 * kickoff among that group's matches, and `correct_answer` = null (graded later
 * by closing it). Idempotent-ish: groups that ALREADY have a generated question
 * (detected by the "¿Campeón del Grupo X?" text marker) are skipped, so re-running
 * does not duplicate. The whole batch is audit-logged once.
 */
export async function generateGroupWinnerQuestions(): Promise<BonusActionState> {
  const actor = await adminActor();
  const supabase = createServiceClient();
  const settings = await getAppSettingsAdmin();

  const [{ data: teamRows }, { data: matchRows }, { data: existingRows }] =
    await Promise.all([
      supabase.from("teams").select("*"),
      supabase.from("matches").select("*"),
      supabase
        .from("bonus_questions")
        .select("text")
        .ilike("text", `${GROUP_WINNER_PREFIX}%`),
    ]);

  const teams = (teamRows as Team[] | null) ?? [];
  const matches = (matchRows as Match[] | null) ?? [];
  const existing = (existingRows as { text: string }[] | null) ?? [];
  const existingTexts = new Set(existing.map((r) => r.text));

  // Bucket teams + earliest kickoff by group label (A..L).
  const teamsByGroup = new Map<string, string[]>();
  for (const t of teams) {
    if (!t.group) continue;
    const arr = teamsByGroup.get(t.group) ?? [];
    arr.push(t.name);
    teamsByGroup.set(t.group, arr);
  }

  const earliestKickoffByGroup = new Map<string, string>();
  for (const m of matches) {
    if (!m.group) continue;
    const prev = earliestKickoffByGroup.get(m.group);
    if (!prev || new Date(m.kickoff_at) < new Date(prev)) {
      earliestKickoffByGroup.set(m.group, m.kickoff_at);
    }
  }

  const groups = Array.from(teamsByGroup.keys()).sort();
  if (groups.length === 0) {
    return { ok: false, message: "No hay grupos con equipos cargados." };
  }

  const toInsert: {
    text: string;
    type: "single";
    category: "group_winner";
    points: number;
    options: string[];
    correct_answer: null;
    locks_at: string;
  }[] = [];
  let skipped = 0;

  for (const g of groups) {
    const text = `${GROUP_WINNER_PREFIX} ${g}?`;
    if (existingTexts.has(text)) {
      skipped++;
      continue;
    }
    const options = (teamsByGroup.get(g) ?? []).slice().sort();
    const kickoff = earliestKickoffByGroup.get(g);
    if (options.length === 0 || !kickoff) {
      skipped++;
      continue;
    }
    toInsert.push({
      text,
      type: "single",
      category: "group_winner",
      points: settings.group_winner_points,
      options,
      correct_answer: null,
      locks_at: new Date(kickoff).toISOString(),
    });
  }

  if (toInsert.length === 0) {
    return {
      ok: true,
      message: `Nada que generar: ${skipped} grupo(s) ya tenían su pregunta.`,
    };
  }

  const { data, error } = await supabase
    .from("bonus_questions")
    .insert(toInsert)
    .select("id, text");
  if (error) return { ok: false, message: `Error: ${error.message}` };

  await writeAudit({
    actor,
    action: "generate_group_winner_questions",
    target_type: "bonus_question",
    target_id: null,
    after: {
      created: data?.length ?? toInsert.length,
      skipped,
      points: settings.group_winner_points,
      groups: toInsert.map((q) => q.text),
    },
  });

  revalidatePath("/admin/bonus");
  return {
    ok: true,
    message: `${toInsert.length} pregunta(s) de campeón de grupo creada(s)${
      skipped ? `, ${skipped} omitida(s)` : ""
    }.`,
  };
}

const deleteSchema = z.object({ id: z.string().min(1) }).strict();

/**
 * Permanently delete a bonus question. Its `bonus_answers` rows cascade away via
 * the FK, so any points already awarded for it disappear. We refresh standings
 * afterwards so the leaderboard reflects the removal immediately, and audit the
 * deletion (recording the question plus how many answers it took down with it).
 */
export async function deleteBonus(
  _prev: BonusActionState,
  form: FormData,
): Promise<BonusActionState> {
  const actor = await adminActor();

  const parsed = deleteSchema.safeParse({ id: form.get("id") });
  if (!parsed.success) return { ok: false, message: "Datos inválidos." };

  const { id } = parsed.data;
  const supabase = createServiceClient();

  const before = await loadQuestion(id);
  if (!before) return { ok: false, message: "Pregunta no encontrada." };

  const { count: answerCount } = await supabase
    .from("bonus_answers")
    .select("id", { count: "exact", head: true })
    .eq("question_id", id);

  const { error } = await supabase.from("bonus_questions").delete().eq("id", id);
  if (error) return { ok: false, message: `Error: ${error.message}` };

  await writeAudit({
    actor,
    action: "delete_bonus_question",
    target_type: "bonus_question",
    target_id: id,
    before: { question: before, answer_count: answerCount ?? 0 },
    after: null,
  });

  // Already-awarded points for this question must vanish from the leaderboard.
  const { error: rpcError } = await supabase.rpc("refresh_standings");
  if (rpcError) {
    return {
      ok: false,
      message: `Pregunta borrada, pero falló refresh_standings: ${rpcError.message}`,
    };
  }

  revalidatePath("/admin/bonus");
  return {
    ok: true,
    message: `Pregunta eliminada (${answerCount ?? 0} respuesta(s) borradas).`,
  };
}

const gradeTextSchema = z
  .object({
    answer_id: z.string().min(1),
    // The hidden input submits the literal strings "true"/"false"; map them
    // explicitly (z.coerce.boolean would treat "false" as truthy).
    correct: z.enum(["true", "false"]).transform((v) => v === "true"),
  })
  .strict();

/**
 * Manually grade a single free-text (`text`) bonus answer. The admin marks the
 * answer correct/incorrect; re-grading is allowed (overwrites the prior
 * verdict). We store the verdict in `manual_correct` and set `points_awarded`
 * accordingly (question.points / 0), audit before/after, and refresh standings.
 * Only valid for questions of type `text` — the only manually-graded type.
 */
export async function gradeTextAnswer(
  _prev: BonusActionState,
  form: FormData,
): Promise<BonusActionState> {
  const actor = await adminActor();

  const parsed = gradeTextSchema.safeParse({
    answer_id: form.get("answer_id"),
    correct: form.get("correct"),
  });
  if (!parsed.success) return { ok: false, message: "Datos inválidos." };

  const { answer_id, correct } = parsed.data;
  const supabase = createServiceClient();

  const { data: answerRow } = await supabase
    .from("bonus_answers")
    .select("*")
    .eq("id", answer_id)
    .maybeSingle();
  const answer = (answerRow as BonusAnswer | null) ?? null;
  if (!answer) return { ok: false, message: "Respuesta no encontrada." };

  const question = await loadQuestion(answer.question_id);
  if (!question) return { ok: false, message: "Pregunta no encontrada." };
  if (question.type !== "text") {
    return {
      ok: false,
      message: "Solo las preguntas de texto libre se validan a mano.",
    };
  }

  const points_awarded = correct ? question.points : 0;
  const { error } = await supabase
    .from("bonus_answers")
    .update({ manual_correct: correct, points_awarded })
    .eq("id", answer_id);
  if (error) return { ok: false, message: `Error: ${error.message}` };

  await writeAudit({
    actor,
    action: "grade_text_answer",
    target_type: "bonus_answer",
    target_id: answer_id,
    before: {
      manual_correct: answer.manual_correct,
      points_awarded: answer.points_awarded,
    },
    after: { manual_correct: correct, points_awarded },
  });

  const { error: rpcError } = await supabase.rpc("refresh_standings");
  if (rpcError) {
    return {
      ok: false,
      message: `Validación guardada, pero falló refresh_standings: ${rpcError.message}`,
    };
  }

  revalidatePath("/admin/bonus");
  return {
    ok: true,
    message: correct ? "Respuesta marcada como correcta." : "Respuesta marcada como incorrecta.",
  };
}
