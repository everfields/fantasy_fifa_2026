// ============================================================================
// POST /api/admin/recalc — admin-triggered FULL recalculation.
//
// Body: { mode: 'preview' | 'execute' }  (zod-validated)
//   - 'preview': compute prediction-point deltas across ALL finished matches AND
//                the meta-volante round-award deltas, returning counts WITHOUT
//                writing anything.
//   - 'execute': write only the changed points_awarded (idempotent), recompute
//                + persist round_awards (idempotent), refresh standings, and
//                append an audit_log entry.
//
// Reads point values from app_settings (never hardcoded). Writes go through the
// service-role client. Guarded by requireAdmin(). Never throws raw.
// ============================================================================

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";

import {
  loadAppSettings,
  loadFinishedMatchIds,
  logAudit,
  recomputeRoundAwards,
  refreshStandings,
  rescoreMatches,
} from "../../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  mode: z.enum(["preview", "execute"]),
});

export async function POST(req: Request) {
  // requireAdmin() redirects (throws NEXT_REDIRECT) for non-admins; in an API
  // context Next surfaces that as a redirect response, which is acceptable.
  const admin = await requireAdmin();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { mode } = parsed.data;

  try {
    const supabase = createServiceClient();
    const settings = await loadAppSettings(supabase);
    const finishedIds = await loadFinishedMatchIds(supabase);

    // 1. Recompute prediction points (idempotent; dryRun in preview).
    const result = await rescoreMatches(supabase, finishedIds, settings.scoring, {
      dryRun: mode === "preview",
    });

    // 2. Recompute meta-volante round awards.
    //    EXECUTE: this runs AFTER predictions are persisted, so it reads the
    //    freshly-written points_awarded. PREVIEW: nothing was written, so the
    //    round-award diff is computed against the CURRENTLY-STORED points. If
    //    scoring rules changed, the prediction deltas above are exact while the
    //    roundAwardsAffected count is an estimate vs. current points (it becomes
    //    exact once execute persists points). Documented for the admin UI.
    const awards = await recomputeRoundAwards(
      supabase,
      settings.scoring,
      settings.meta_volante_points,
      { dryRun: mode === "preview" },
    );

    if (mode === "preview") {
      return NextResponse.json({
        ok: true,
        mode,
        finishedMatches: finishedIds.length,
        predictionsExamined: result.examined,
        predictionsAffected: result.rescored,
        roundAwardsAffected: awards.awardsAffected,
        eligibleRounds: awards.eligibleRounds,
        // Bounded samples so a preview payload stays small.
        sample: result.changes.slice(0, 50),
        roundAwardSample: awards.changes.slice(0, 50),
      });
    }

    // execute — refresh standings if EITHER predictions or awards changed
    // (round_awards.points feed standings via refresh_standings()).
    const standingsRefreshed = result.rescored > 0 || awards.awardsAffected > 0;
    if (standingsRefreshed) {
      await refreshStandings(supabase);
    }

    await logAudit(supabase, {
      action: "recalc.execute",
      targetType: "standings",
      targetId: null,
      before: null,
      after: {
        finishedMatches: finishedIds.length,
        predictionsExamined: result.examined,
        predictionsAffected: result.rescored,
        roundAwardsAffected: awards.awardsAffected,
        eligibleRounds: awards.eligibleRounds,
        scoring: settings.scoring,
        metaVolantePoints: settings.meta_volante_points,
      },
      actorId: admin.id,
    });

    return NextResponse.json({
      ok: true,
      mode,
      finishedMatches: finishedIds.length,
      predictionsExamined: result.examined,
      predictionsRescored: result.rescored,
      roundAwardsAffected: awards.awardsAffected,
      eligibleRounds: awards.eligibleRounds,
      standingsRefreshed,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
