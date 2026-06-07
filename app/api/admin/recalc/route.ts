// ============================================================================
// POST /api/admin/recalc — admin-triggered FULL recalculation.
//
// Body: { mode: 'preview' | 'execute' }  (zod-validated)
//   - 'preview': compute point deltas across ALL finished matches and return
//                counts WITHOUT writing anything.
//   - 'execute': write only the changed points_awarded (idempotent), refresh
//                standings, and append an audit_log entry.
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

    const result = await rescoreMatches(supabase, finishedIds, settings.scoring, {
      dryRun: mode === "preview",
    });

    if (mode === "preview") {
      return NextResponse.json({
        ok: true,
        mode,
        finishedMatches: finishedIds.length,
        predictionsExamined: result.examined,
        predictionsAffected: result.rescored,
        // Bounded sample so a preview payload stays small.
        sample: result.changes.slice(0, 50),
      });
    }

    // execute
    if (result.rescored > 0) {
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
        scoring: settings.scoring,
      },
      actorId: admin.id,
    });

    return NextResponse.json({
      ok: true,
      mode,
      finishedMatches: finishedIds.length,
      predictionsExamined: result.examined,
      predictionsRescored: result.rescored,
      standingsRefreshed: result.rescored > 0,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
