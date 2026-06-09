"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/lib/supabase/server";
import {
  recomputePredictionPoints,
  type IdentifiablePrediction,
  type ScorableMatch,
} from "@/lib/scoring";
import type { Match, Prediction } from "@/lib/types";

import { adminActor, getAppSettingsAdmin, writeAudit } from "../_lib";

/** A single prediction whose recomputed points differ from the stored value. */
export interface RecalcChange {
  id: string;
  old: number | null;
  new: number | null;
  delta: number;
}

export interface RecalcPreview {
  totalPredictions: number;
  changedCount: number;
  totalDelta: number; // sum of (new - old) over changed rows
  changes: RecalcChange[]; // capped sample for display
  // Number of "meta volante" (round-champion) awards that would change. The
  // actual computation/persistence is owned by the /api/admin/recalc endpoint
  // (api agent); we surface its count here. `null` = the endpoint did not (yet)
  // report it, so the UI shows "pendiente" rather than a misleading 0.
  roundAwardsAffected: number | null;
  generatedAt: string;
}

export type RecalcState =
  | { phase: "idle"; message?: string }
  | { phase: "preview"; preview: RecalcPreview; message?: string }
  | {
      phase: "done";
      applied: number;
      roundAwardsAffected: number | null;
      message: string;
    }
  | { phase: "error"; message: string };

/**
 * Load every prediction + the matches they reference, run the PURE TS scoring
 * engine (the single source of truth) against the CURRENT app_settings, and
 * diff the result against the stored `points_awarded`. WRITES NOTHING.
 */
async function computeChanges(): Promise<{
  changes: RecalcChange[];
  total: number;
}> {
  const supabase = createServiceClient();
  const settings = await getAppSettingsAdmin();

  const [{ data: preds }, { data: matches }] = await Promise.all([
    supabase.from("predictions").select("*"),
    supabase.from("matches").select("*"),
  ]);

  const predictions = (preds as Prediction[] | null) ?? [];
  const matchList = (matches as Match[] | null) ?? [];

  const matchesById = new Map<string, ScorableMatch>();
  for (const m of matchList) {
    matchesById.set(m.id, {
      home_score: m.home_score,
      away_score: m.away_score,
      status: m.status,
      is_joker: m.is_joker,
    });
  }

  const scorable: IdentifiablePrediction[] = predictions.map((p) => ({
    id: p.id,
    match_id: p.match_id,
    home_pred: p.home_pred,
    away_pred: p.away_pred,
    is_joker: p.is_joker,
  }));

  const recomputed = recomputePredictionPoints(
    scorable,
    matchesById,
    settings.scoring,
  );
  const newById = new Map(recomputed.map((r) => [r.id, r.points_awarded]));

  const changes: RecalcChange[] = [];
  for (const p of predictions) {
    const next = newById.get(p.id) ?? null;
    const old = p.points_awarded;
    if (next !== old) {
      changes.push({
        id: p.id,
        old,
        new: next,
        delta: (next ?? 0) - (old ?? 0),
      });
    }
  }

  return { changes, total: predictions.length };
}

/**
 * Ask the /api/admin/recalc endpoint (owned by the api agent) how many meta
 * volante (round-champion) awards a recalc would touch. The endpoint owns the
 * round-award computation; we only surface its count. Tolerant of the response
 * shape: returns `null` (→ "pendiente" in the UI) when the endpoint does not
 * report a round-award count or is unreachable, so we never show a misleading 0.
 */
async function fetchRoundAwardsAffected(
  mode: "preview" | "execute",
): Promise<number | null> {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const cookie = h.get("cookie") ?? "";
  const base = host ? `${proto}://${host}` : "";
  if (!base) return null;

  try {
    const res = await fetch(`${base}/api/admin/recalc`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ mode }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, unknown>;
    // Accept any of the field names the endpoint might settle on.
    const candidate =
      body.roundAwardsAffected ??
      body.roundAwardsChanged ??
      body.roundAwardsGranted ??
      body.metaAwardsAffected;
    return typeof candidate === "number" ? candidate : null;
  } catch {
    return null;
  }
}

/** Build a non-destructive preview of what a recalc would change. */
export async function previewRecalc(): Promise<RecalcState> {
  // Outside try/catch: a non-admin triggers a redirect (a thrown control-flow
  // signal that must propagate, not be swallowed into an error message).
  await adminActor();
  try {
    const { changes, total } = await computeChanges();
    const roundAwardsAffected = await fetchRoundAwardsAffected("preview");

    const totalDelta = changes.reduce((acc, c) => acc + c.delta, 0);
    return {
      phase: "preview",
      preview: {
        totalPredictions: total,
        changedCount: changes.length,
        totalDelta,
        changes: changes.slice(0, 100),
        roundAwardsAffected,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (e) {
    return {
      phase: "error",
      message: e instanceof Error ? e.message : "Error al generar la preview.",
    };
  }
}

/**
 * Apply the recalc. Idempotent: only rows whose recomputed value DIFFERS from
 * the stored value are updated. Then refreshes standings via the DB RPC and
 * records an audit entry. Re-running with no further changes writes nothing.
 */
export async function confirmRecalc(): Promise<RecalcState> {
  // Outside try/catch: lets requireAdmin's redirect propagate untouched.
  const actor = await adminActor();

  try {
    const { changes, total } = await computeChanges();
    const supabase = createServiceClient();

    // Update only the differing rows (idempotent).
    for (const c of changes) {
      const { error } = await supabase
        .from("predictions")
        .update({ points_awarded: c.new })
        .eq("id", c.id);
      if (error) {
        return { phase: "error", message: `Fallo al escribir: ${error.message}` };
      }
    }

    // Grant/refresh meta volante (round-champion) awards via the api-agent's
    // endpoint, which owns that computation. Idempotent on its side; it also
    // refreshes standings. Returns the number of awards touched (or null).
    const roundAwardsAffected = await fetchRoundAwardsAffected("execute");

    // Refresh the standings cache (aggregates the just-written points + awards).
    const { error: rpcError } = await supabase.rpc("refresh_standings");
    if (rpcError) {
      return {
        phase: "error",
        message: `Puntos escritos, pero falló refresh_standings: ${rpcError.message}`,
      };
    }

    await writeAudit({
      actor,
      action: "recalc_confirm",
      target_type: "predictions",
      target_id: null,
      before: { changed: changes.length, total },
      after: {
        applied: changes.length,
        total_delta: changes.reduce((a, c) => a + c.delta, 0),
        round_awards_affected: roundAwardsAffected,
      },
    });

    revalidatePath("/admin/recalc");
    revalidatePath("/admin");

    const awardsNote =
      roundAwardsAffected && roundAwardsAffected > 0
        ? ` Premios meta volante actualizados: ${roundAwardsAffected}.`
        : "";

    return {
      phase: "done",
      applied: changes.length,
      roundAwardsAffected,
      message:
        (changes.length === 0
          ? "Nada que recalcular: las puntuaciones ya estaban al día."
          : `Recalculo aplicado: ${changes.length} predicción(es) actualizadas y clasificación refrescada.`) +
        awardsNote,
    };
  } catch (e) {
    return {
      phase: "error",
      message: e instanceof Error ? e.message : "Error al aplicar el recálculo.",
    };
  }
}
