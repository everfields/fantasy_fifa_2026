"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import type { Match } from "@/lib/types";

import { adminActor, writeAudit } from "../_lib";
import {
  loadAppSettings,
  propagateKnockoutBracket,
  rescoreMatches,
  settleRoundAwardsAndRefresh,
} from "@/app/api/_lib";

export type MatchActionState = { ok: boolean; message: string };

const resultSchema = z
  .object({
    match_id: z.string().min(1),
    home_score: z.coerce.number().int().min(0).max(99),
    away_score: z.coerce.number().int().min(0).max(99),
    status: z.enum(["scheduled", "live", "finished"]),
    // Shootout winner for a level knockout match; null when not applicable.
    penalty_winner: z.string().uuid().nullable(),
  })
  .strict();

async function loadMatch(id: string): Promise<Match | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("matches")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Match | null) ?? null;
}

/** Manually set/override a match result and status (e.g. when the API fails). */
export async function saveResult(
  _prev: MatchActionState,
  form: FormData,
): Promise<MatchActionState> {
  const actor = await adminActor();

  const parsed = resultSchema.safeParse({
    match_id: form.get("match_id"),
    home_score: form.get("home_score"),
    away_score: form.get("away_score"),
    status: form.get("status"),
    penalty_winner: (form.get("penalty_winner") as string) || null,
  });
  if (!parsed.success) {
    return { ok: false, message: "Datos inválidos. Revisa el marcador y el estado." };
  }

  const { match_id, home_score, away_score, status, penalty_winner } =
    parsed.data;
  const before = await loadMatch(match_id);
  if (!before) return { ok: false, message: "Partido no encontrado." };

  // Penalty winner only applies to knockout matches and must name one of the
  // two teams of THIS match. Group matches always store null.
  if (penalty_winner !== null) {
    if (before.stage === "group") {
      return {
        ok: false,
        message: "Solo los partidos eliminatorios tienen ganador en penaltis.",
      };
    }
    if (
      penalty_winner !== before.home_team &&
      penalty_winner !== before.away_team
    ) {
      return {
        ok: false,
        message: "El ganador en penaltis debe ser uno de los dos equipos.",
      };
    }
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("matches")
    .update({ home_score, away_score, status, penalty_winner })
    .eq("id", match_id);

  if (error) return { ok: false, message: `Error: ${error.message}` };

  // Rescore this match's predictions in place (idempotent — only changed rows
  // are written; a non-finished status clears points back to null), then settle
  // the meta-volante round awards automatically if saving this result completed
  // a round (ADR-0018). The full manual recalc remains the tool for jokers/bonus.
  const settings = await loadAppSettings(supabase);
  const rescore = await rescoreMatches(supabase, [match_id], settings.scoring);
  const awards = await settleRoundAwardsAndRefresh(
    supabase,
    settings,
    rescore.rescored,
  );

  // When this match is now finished, auto-fill any knockout slot fed by it
  // (admin-configured home_source/away_source links). Idempotent — only slots
  // whose resolved team changed are written by the propagation helper.
  let propagated: string[] = [];
  if (status === "finished") {
    const prop = await propagateKnockoutBracket([match_id]);
    propagated = prop.updatedMatchIds;
  }

  await writeAudit({
    actor,
    action: "override_match_result",
    target_type: "match",
    target_id: match_id,
    before: {
      home_score: before.home_score,
      away_score: before.away_score,
      status: before.status,
      penalty_winner: before.penalty_winner,
    },
    after: {
      home_score,
      away_score,
      status,
      penalty_winner,
      rescored: rescore.rescored,
      roundAwardsAffected: awards.awardsAffected,
      propagatedMatchIds: propagated,
    },
  });

  revalidatePath("/admin/matches");
  revalidatePath("/standings");
  revalidatePath("/dashboard");
  if (propagated.length > 0) {
    revalidatePath("/mundial");
    revalidatePath("/matches");
  }
  const metaNote =
    awards.awardsAffected > 0
      ? ` Meta volante actualizada (${awards.awardsAffected} premios).`
      : "";
  return {
    ok: true,
    message:
      status === "finished"
        ? `Resultado guardado y puntos repartidos (${rescore.rescored} predicciones actualizadas).${metaNote}`
        : "Partido actualizado.",
  };
}

const locksSchema = z
  .object({
    match_id: z.string().min(1),
    locks_at: z
      .string()
      .min(1)
      .refine((v) => !Number.isNaN(Date.parse(v)), "Fecha inválida"),
  })
  .strict();

/** Move a match's lock time (and kickoff, which mirrors it). */
export async function saveLocksAt(
  _prev: MatchActionState,
  form: FormData,
): Promise<MatchActionState> {
  const actor = await adminActor();

  const parsed = locksSchema.safeParse({
    match_id: form.get("match_id"),
    locks_at: form.get("locks_at"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Fecha de bloqueo inválida." };
  }

  const { match_id, locks_at } = parsed.data;
  const iso = new Date(locks_at).toISOString();
  const before = await loadMatch(match_id);
  if (!before) return { ok: false, message: "Partido no encontrado." };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("matches")
    .update({ locks_at: iso, kickoff_at: iso })
    .eq("id", match_id);

  if (error) return { ok: false, message: `Error: ${error.message}` };

  await writeAudit({
    actor,
    action: "move_match_lock",
    target_type: "match",
    target_id: match_id,
    before: { locks_at: before.locks_at, kickoff_at: before.kickoff_at },
    after: { locks_at: iso, kickoff_at: iso },
  });

  revalidatePath("/admin/matches");
  return { ok: true, message: "Hora de bloqueo actualizada." };
}

const jokerSchema = z
  .object({
    match_id: z.string().min(1),
    // NOT z.coerce.boolean(): Boolean("false") === true, which made it
    // impossible to ever turn a joker OFF from the form.
    is_joker: z.enum(["true", "false"]).transform((v) => v === "true"),
  })
  .strict();

/**
 * Toggle a match's admin-designated joker flag. A joker match multiplies EVERY
 * user's prediction points for that match by `scoring.joker_multiplier` (jokers
 * are no longer chosen per-user). Service-role write, audit-logged like
 * saveResult/saveLocksAt. A recalc must be run afterwards to repoint already
 * scored predictions.
 */
export async function saveJoker(
  _prev: MatchActionState,
  form: FormData,
): Promise<MatchActionState> {
  const actor = await adminActor();

  const parsed = jokerSchema.safeParse({
    match_id: form.get("match_id"),
    is_joker: form.get("is_joker"),
  });
  if (!parsed.success) return { ok: false, message: "Datos inválidos." };

  const { match_id, is_joker } = parsed.data;
  const before = await loadMatch(match_id);
  if (!before) return { ok: false, message: "Partido no encontrado." };

  if (before.is_joker === is_joker) {
    return {
      ok: true,
      message: is_joker ? "Ya era un partido joker." : "Ya no era joker.",
    };
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("matches")
    .update({ is_joker })
    .eq("id", match_id);

  if (error) {
    // A montaña etapa and a joker are mutually exclusive (DB CHECK
    // matches_montana_not_joker). Marking a montaña match as joker trips it —
    // surface a readable message instead of the raw constraint error.
    if (is_joker && error.message.includes("matches_montana_not_joker")) {
      return {
        ok: false,
        message:
          "Este partido es etapa de montaña — quítale la etapa antes de hacerlo jóker.",
      };
    }
    return { ok: false, message: `Error: ${error.message}` };
  }

  await writeAudit({
    actor,
    action: "set_match_joker",
    target_type: "match",
    target_id: match_id,
    before: { is_joker: before.is_joker },
    after: { is_joker },
  });

  revalidatePath("/admin/matches");
  return {
    ok: true,
    message: is_joker
      ? "Partido marcado como joker. Ejecuta «Recalcular» para aplicar el multiplicador."
      : "Joker retirado. Ejecuta «Recalcular» para revertir el multiplicador.",
  };
}

const teamsSchema = z
  .object({
    match_id: z.string().min(1),
    home_team: z.string().uuid().nullable(),
    away_team: z.string().uuid().nullable(),
  })
  .strict();

/**
 * Assign the real teams to a knockout match once the qualifiers are known
 * (seeded knockout rows have NULL teams). UPDATE in place — never delete +
 * reinsert (FK cascades would wipe predictions). Feeds the /mundial bracket.
 */
export async function saveTeams(
  _prev: MatchActionState,
  form: FormData,
): Promise<MatchActionState> {
  const actor = await adminActor();

  const parsed = teamsSchema.safeParse({
    match_id: form.get("match_id"),
    home_team: (form.get("home_team") as string) || null,
    away_team: (form.get("away_team") as string) || null,
  });
  if (!parsed.success) return { ok: false, message: "Equipos inválidos." };

  const { match_id, home_team, away_team } = parsed.data;
  if (home_team && away_team && home_team === away_team) {
    return { ok: false, message: "Un equipo no puede jugar contra sí mismo." };
  }

  const before = await loadMatch(match_id);
  if (!before) return { ok: false, message: "Partido no encontrado." };
  if (before.stage === "group") {
    return { ok: false, message: "Los partidos de grupos no se reasignan." };
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("matches")
    .update({ home_team, away_team })
    .eq("id", match_id);

  if (error) return { ok: false, message: `Error: ${error.message}` };

  await writeAudit({
    actor,
    action: "set_match_teams",
    target_type: "match",
    target_id: match_id,
    before: { home_team: before.home_team, away_team: before.away_team },
    after: { home_team, away_team },
  });

  revalidatePath("/admin/matches");
  revalidatePath("/mundial");
  revalidatePath("/matches");
  revalidatePath("/dashboard");
  return { ok: true, message: "Equipos asignados al cruce." };
}

const sourcesSchema = z
  .object({
    match_id: z.string().min(1),
    home_source: z.string().uuid().nullable(),
    away_source: z.string().uuid().nullable(),
    home_source_kind: z.enum(["winner", "loser"]),
    away_source_kind: z.enum(["winner", "loser"]),
  })
  .strict();

/**
 * Configure a knockout match's bracket sources: which earlier knockout match's
 * outcome (its winner, or its loser for the third-place match) fills each slot.
 * Stores home_source/away_source + *_source_kind — NEVER touches the resolved
 * home_team/away_team (that is done by propagation once the source finishes).
 * Passing null clears a link only. UPDATE in place + audit, like saveTeams.
 */
export async function saveSources(
  _prev: MatchActionState,
  form: FormData,
): Promise<MatchActionState> {
  const actor = await adminActor();

  const parsed = sourcesSchema.safeParse({
    match_id: form.get("match_id"),
    home_source: (form.get("home_source") as string) || null,
    away_source: (form.get("away_source") as string) || null,
    home_source_kind: form.get("home_source_kind") ?? "winner",
    away_source_kind: form.get("away_source_kind") ?? "winner",
  });
  if (!parsed.success) return { ok: false, message: "Cruce inválido." };

  const {
    match_id,
    home_source,
    away_source,
    home_source_kind,
    away_source_kind,
  } = parsed.data;

  const before = await loadMatch(match_id);
  if (!before) return { ok: false, message: "Partido no encontrado." };
  if (before.stage === "group") {
    return { ok: false, message: "Los partidos de grupos no tienen cruce." };
  }

  // Each configured source must be a DIFFERENT knockout match.
  for (const src of [home_source, away_source]) {
    if (src === null) continue;
    if (src === match_id) {
      return { ok: false, message: "Un partido no puede alimentarse de sí mismo." };
    }
    const srcMatch = await loadMatch(src);
    if (!srcMatch) return { ok: false, message: "Partido de origen no encontrado." };
    if (srcMatch.stage === "group") {
      return {
        ok: false,
        message: "El origen de un cruce debe ser otro partido eliminatorio.",
      };
    }
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("matches")
    .update({ home_source, away_source, home_source_kind, away_source_kind })
    .eq("id", match_id);

  if (error) return { ok: false, message: `Error: ${error.message}` };

  await writeAudit({
    actor,
    action: "set_match_sources",
    target_type: "match",
    target_id: match_id,
    before: {
      home_source: before.home_source,
      away_source: before.away_source,
      home_source_kind: before.home_source_kind,
      away_source_kind: before.away_source_kind,
    },
    after: { home_source, away_source, home_source_kind, away_source_kind },
  });

  // If a configured source match already finished, fill this slot immediately.
  const sources = [home_source, away_source].filter(
    (s): s is string => s !== null,
  );
  let propagated: string[] = [];
  if (sources.length > 0) {
    const prop = await propagateKnockoutBracket(sources);
    propagated = prop.updatedMatchIds;
  }

  revalidatePath("/admin/matches");
  revalidatePath("/mundial");
  revalidatePath("/matches");
  revalidatePath("/dashboard");
  return {
    ok: true,
    message:
      propagated.length > 0
        ? "Cruce configurado y equipos propagados."
        : "Cruce configurado.",
  };
}

const syncSchema = z.object({ match_id: z.string().min(1) }).strict();

/**
 * Force a re-sync of a single match from the football provider. Delegates the
 * actual fetch to the /api/admin/sync-now route (owned by the API agent),
 * forwarding the incoming cookies so the route can re-check admin rights.
 */
export async function syncNow(
  _prev: MatchActionState,
  form: FormData,
): Promise<MatchActionState> {
  const actor = await adminActor();
  const parsed = syncSchema.safeParse({ match_id: form.get("match_id") });
  if (!parsed.success) return { ok: false, message: "Partido inválido." };

  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const cookie = h.get("cookie") ?? "";
  const base = host ? `${proto}://${host}` : "";

  try {
    const res = await fetch(`${base}/api/admin/sync-now`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ matchId: parsed.data.match_id }),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        message: `Sync falló (${res.status}). ${text}`.trim(),
      };
    }
  } catch (e) {
    return {
      ok: false,
      message: `No se pudo contactar el servicio de sync: ${
        e instanceof Error ? e.message : "error desconocido"
      }`,
    };
  }

  await writeAudit({
    actor,
    action: "sync_now",
    target_type: "match",
    target_id: parsed.data.match_id,
  });

  revalidatePath("/admin/matches");
  return { ok: true, message: "Sincronización solicitada." };
}
