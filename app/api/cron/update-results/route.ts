// ============================================================================
// GET /api/cron/update-results — Vercel cron poller.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (rejected otherwise).
// Steps:
//   1. fetch live/recently-finished matches from the provider
//   2. match them to our `matches` rows (provider_match_id, fallback codes+day)
//   3. update home_score/away_score/status (only changed rows)
//   4. for matches that became 'finished', recompute points_awarded for their
//      predictions IDEMPOTENTLY (never re-score / double-count), then refresh
//      standings.
// Returns a JSON summary. Never throws raw — everything is wrapped.
// ============================================================================

import { NextResponse } from "next/server";

import { getProvider } from "@/lib/providers";
import { createServiceClient } from "@/lib/supabase/server";

import {
  applyProviderMatches,
  loadAppSettings,
  loadMatchRows,
  loadTeamCodeById,
  refreshStandings,
  rescoreMatches,
} from "../../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // --- Auth ---------------------------------------------------------------
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const provider = getProvider();

    // 1. Provider live/recent matches.
    const providerMatches = await provider.getLiveMatches();

    // 2. Our rows + team-code index for matching.
    const [teamCodeById, dbMatches, settings] = await Promise.all([
      loadTeamCodeById(supabase),
      loadMatchRows(supabase),
      loadAppSettings(supabase),
    ]);

    // 3. Apply provider results (idempotent: only changed rows are written).
    const applied = await applyProviderMatches(
      supabase,
      providerMatches,
      dbMatches,
      teamCodeById,
    );

    // 4. Rescore predictions for finished matches (idempotent) + refresh.
    //    Limit to matches that actually CHANGED and are finished, so a steady
    //    state poll does no writes at all.
    const finishedChanged = applied.finishedMatchIds.filter((id) =>
      applied.changedMatchIds.includes(id),
    );

    let rescored = 0;
    if (finishedChanged.length > 0) {
      const result = await rescoreMatches(
        supabase,
        finishedChanged,
        settings.scoring,
      );
      rescored = result.rescored;
      // Only touch standings when something actually changed.
      if (result.rescored > 0) {
        await refreshStandings(supabase);
      }
    }

    return NextResponse.json({
      ok: true,
      provider: provider.name,
      providerMatches: providerMatches.length,
      matchesUpdated: applied.changedMatchIds.length,
      matchesFinished: applied.finishedMatchIds.length,
      unmatched: applied.unmatched,
      predictionsRescored: rescored,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
