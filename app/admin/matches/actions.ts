"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import type { Match } from "@/lib/types";

import { adminActor, writeAudit } from "../_lib";

export type MatchActionState = { ok: boolean; message: string };

const resultSchema = z
  .object({
    match_id: z.string().min(1),
    home_score: z.coerce.number().int().min(0).max(99),
    away_score: z.coerce.number().int().min(0).max(99),
    status: z.enum(["scheduled", "live", "finished"]),
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
  });
  if (!parsed.success) {
    return { ok: false, message: "Datos inválidos. Revisa el marcador y el estado." };
  }

  const { match_id, home_score, away_score, status } = parsed.data;
  const before = await loadMatch(match_id);
  if (!before) return { ok: false, message: "Partido no encontrado." };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("matches")
    .update({ home_score, away_score, status })
    .eq("id", match_id);

  if (error) return { ok: false, message: `Error: ${error.message}` };

  await writeAudit({
    actor,
    action: "override_match_result",
    target_type: "match",
    target_id: match_id,
    before: {
      home_score: before.home_score,
      away_score: before.away_score,
      status: before.status,
    },
    after: { home_score, away_score, status },
  });

  revalidatePath("/admin/matches");
  return {
    ok: true,
    message:
      status === "finished"
        ? "Resultado guardado. Ejecuta «Recalcular» para repartir los puntos."
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

  if (error) return { ok: false, message: `Error: ${error.message}` };

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
      body: JSON.stringify({ match_id: parsed.data.match_id }),
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
