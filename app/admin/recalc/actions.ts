"use server";

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
  generatedAt: string;
}

export type RecalcState =
  | { phase: "idle"; message?: string }
  | { phase: "preview"; preview: RecalcPreview; message?: string }
  | { phase: "done"; applied: number; message: string }
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

/** Build a non-destructive preview of what a recalc would change. */
export async function previewRecalc(): Promise<RecalcState> {
  // Outside try/catch: a non-admin triggers a redirect (a thrown control-flow
  // signal that must propagate, not be swallowed into an error message).
  await adminActor();
  try {
    const { changes, total } = await computeChanges();

    const totalDelta = changes.reduce((acc, c) => acc + c.delta, 0);
    return {
      phase: "preview",
      preview: {
        totalPredictions: total,
        changedCount: changes.length,
        totalDelta,
        changes: changes.slice(0, 100),
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

    // Refresh the standings cache (aggregates the just-written points).
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
      },
    });

    revalidatePath("/admin/recalc");
    revalidatePath("/admin");

    return {
      phase: "done",
      applied: changes.length,
      message:
        changes.length === 0
          ? "Nada que recalcular: las puntuaciones ya estaban al día."
          : `Recalculo aplicado: ${changes.length} predicción(es) actualizadas y clasificación refrescada.`,
    };
  } catch (e) {
    return {
      phase: "error",
      message: e instanceof Error ? e.message : "Error al aplicar el recálculo.",
    };
  }
}
