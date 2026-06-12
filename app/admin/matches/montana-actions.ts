"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { pickMontanaStages, type PickableMatch } from "@/lib/classifications";
import type { Match, Team } from "@/lib/types";

import { adminActor, writeAudit } from "../_lib";
import type { MatchActionState } from "./actions";

/**
 * Postgres raises this CHECK ("matches_montana_not_joker") when a row would end
 * up being both a joker AND a montaña etapa — the two are mutually exclusive.
 * Supabase surfaces the constraint name in `error.message`, so we sniff it to
 * return a human-readable Spanish message instead of a raw DB error.
 */
const MONTANA_NOT_JOKER_CHECK = "matches_montana_not_joker";

/** Result of the auto-assign action, used to drive the toast/message. */
export type MontanaAutoState = {
  ok: boolean;
  message: string;
  assigned: number;
  totalAssigned: number;
};

const autoInitial: MontanaAutoState = {
  ok: false,
  message: "",
  assigned: 0,
  totalAssigned: 0,
};

/**
 * Load all matches joined with their teams' 3-letter codes, shaped as the
 * `PickableMatch` contract the pure picker consumes. Knockout rows that have no
 * team assigned yet (`home_team`/`away_team` null, or pointing at a placeholder
 * with no row in `teams`) get a `null` code — the picker excludes those.
 */
async function loadPickableMatches(): Promise<{
  pickable: PickableMatch[];
  totalAssigned: number;
}> {
  const supabase = createServiceClient();

  const [{ data: matches }, { data: teams }] = await Promise.all([
    supabase
      .from("matches")
      .select(
        "id, stage, status, kickoff_at, is_joker, montana_stage, home_team, away_team",
      )
      .order("kickoff_at", { ascending: true }),
    supabase.from("teams").select("id, code"),
  ]);

  const codeById = new Map<string, string>(
    ((teams as Pick<Team, "id" | "code">[] | null) ?? []).map((t) => [
      t.id,
      t.code,
    ]),
  );

  const rows = (matches as (Pick<
    Match,
    "id" | "stage" | "status" | "kickoff_at" | "is_joker" | "montana_stage"
  > & { home_team: string | null; away_team: string | null })[] | null) ?? [];

  const pickable: PickableMatch[] = rows.map((m) => ({
    id: m.id,
    stage: m.stage,
    status: m.status,
    kickoff_at: m.kickoff_at,
    is_joker: m.is_joker,
    montana_stage: m.montana_stage,
    home_code: m.home_team ? codeById.get(m.home_team) ?? null : null,
    away_code: m.away_team ? codeById.get(m.away_team) ?? null : null,
  }));

  const totalAssigned = pickable.filter(
    (m) => m.montana_stage !== null,
  ).length;

  return { pickable, totalAssigned };
}

/**
 * Auto-assign montaña etapas across the calendar. Pure picker
 * (`pickMontanaStages`) decides the NEW assignments — it is incremental
 * (respects etapas already assigned, only returns new ones) and already
 * excludes jokers / Spain / quarter+ / past matches. We persist each new
 * assignment with an in-place UPDATE (never delete + reinsert — that would
 * cascade-wipe predictions), audit the batch, and revalidate.
 */
export async function autoAssignMontanaStages(
  _prev: MontanaAutoState,
  _form: FormData,
): Promise<MontanaAutoState> {
  const actor = await adminActor();

  const { pickable, totalAssigned: before } = await loadPickableMatches();

  const assignments = pickMontanaStages(pickable, { now: new Date() });

  if (assignments.length === 0) {
    return {
      ...autoInitial,
      ok: true,
      totalAssigned: before,
      message:
        before > 0
          ? `No hay nuevas etapas que asignar. ${before} partidos ya tienen etapa.`
          : "No hay partidos elegibles para etapas de montaña todavía (faltan cruces por definir).",
    };
  }

  const supabase = createServiceClient();
  for (const a of assignments) {
    const { error } = await supabase
      .from("matches")
      .update({ montana_stage: a.montana_stage })
      .eq("id", a.match_id);
    if (error) {
      // A montaña/joker collision shouldn't happen (picker excludes jokers),
      // but surface it cleanly rather than half-applying silently.
      if (error.message.includes(MONTANA_NOT_JOKER_CHECK)) {
        return {
          ...autoInitial,
          ok: false,
          totalAssigned: before,
          message:
            "Un partido jóker no puede ser etapa de montaña — quita antes el jóker.",
        };
      }
      return {
        ...autoInitial,
        ok: false,
        totalAssigned: before,
        message: `Error al asignar etapas: ${error.message}`,
      };
    }
  }

  await writeAudit({
    actor,
    action: "montana.auto_assign",
    target_type: "match",
    target_id: null,
    before: { totalAssigned: before },
    after: {
      assigned: assignments.length,
      totalAssigned: before + assignments.length,
      assignments,
    },
  });

  revalidatePath("/admin/matches");
  revalidatePath("/standings");

  const totalAssigned = before + assignments.length;
  const stagesSeen = new Set(
    pickable
      .map((m) => m.montana_stage)
      .filter((s): s is number => s !== null)
      .concat(assignments.map((a) => a.montana_stage)),
  );
  const complete = stagesSeen.size >= 7;

  return {
    ok: true,
    assigned: assignments.length,
    totalAssigned,
    message: complete
      ? `${assignments.length} partidos asignados — etapas de montaña completas.`
      : `${assignments.length} partidos asignados — quedan etapas pendientes de los cruces.`,
  };
}

const setStageSchema = z
  .object({
    match_id: z.string().min(1),
    // 1..21 mirrors the DB CHECK range; empty string / "null" clears the etapa.
    stage: z
      .union([
        z.literal(""),
        z.literal("null"),
        z.coerce.number().int().min(1).max(21),
      ])
      .transform((v) => (v === "" || v === "null" ? null : v)),
  })
  .strict();

/**
 * Manually set or clear a single match's montaña etapa. Captures the
 * `matches_montana_not_joker` CHECK violation (a joker match cannot also be a
 * montaña etapa) and returns a readable message. In-place UPDATE; audited.
 */
export async function setMontanaStage(
  _prev: MatchActionState,
  form: FormData,
): Promise<MatchActionState> {
  const actor = await adminActor();

  const parsed = setStageSchema.safeParse({
    match_id: form.get("match_id"),
    stage: form.get("stage") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, message: "Etapa inválida (debe ser 1–21 o vacío)." };
  }

  const { match_id, stage } = parsed.data;

  const supabase = createServiceClient();
  const { data: before } = await supabase
    .from("matches")
    .select("montana_stage")
    .eq("id", match_id)
    .maybeSingle();
  if (!before) return { ok: false, message: "Partido no encontrado." };

  const beforeStage = (before as { montana_stage: number | null }).montana_stage;
  if (beforeStage === stage) {
    return {
      ok: true,
      message:
        stage === null ? "El partido ya no tenía etapa." : `Ya era la etapa ${stage}.`,
    };
  }

  const { error } = await supabase
    .from("matches")
    .update({ montana_stage: stage })
    .eq("id", match_id);

  if (error) {
    if (error.message.includes(MONTANA_NOT_JOKER_CHECK)) {
      return {
        ok: false,
        message:
          "Un partido jóker no puede ser etapa de montaña — quita antes el jóker.",
      };
    }
    return { ok: false, message: `Error: ${error.message}` };
  }

  await writeAudit({
    actor,
    action: "montana.set_stage",
    target_type: "match",
    target_id: match_id,
    before: { montana_stage: beforeStage },
    after: { montana_stage: stage },
  });

  revalidatePath("/admin/matches");
  revalidatePath("/standings");

  return {
    ok: true,
    message:
      stage === null
        ? "Etapa de montaña retirada."
        : `Partido marcado como etapa de montaña ${stage}.`,
  };
}

export { autoInitial as montanaAutoInitial };
