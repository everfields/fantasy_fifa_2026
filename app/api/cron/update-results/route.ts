// ============================================================================
// GET /api/cron/update-results — live-results poller.
//
// Triggered by a Supabase pg_cron + pg_net job (every ~15 min), NOT a Vercel
// cron (ADR-0009: Vercel Hobby rejects sub-daily crons, so the schedule lives
// in Supabase, reading the URL + secret from Vault). The endpoint itself is
// scheduler-agnostic: any caller presenting the bearer secret works.
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
  propagateKnockoutBracket,
  rescoreMatches,
  settleRoundAwardsAndRefresh,
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

    // 1. Provider live/recent matches. The provider now returns a richer
    //    envelope: the matches array plus how many matches were due a poll this
    //    run (`candidatesInWindow`) and the first upstream failure, if any
    //    (`providerError`). Surfacing these lets a single Supabase
    //    `net._http_response` query detect a silent provider outage — the 2026
    //    incident where the dead Anthropic key made the cron report
    //    `ok:true, providerMatches:0` for 10 days with no error recorded.
    const live = await provider.getLiveMatches();
    const providerMatches = live.matches;
    const candidates = live.candidatesInWindow;
    const providerError = live.providerError;

    // A provider failure does NOT fail the poll (the run itself executed): we
    // still return HTTP 200 / ok:true so pg_net does not record an HTTP failure
    // that would mask the informative body. But we log it and expose the string
    // so the outage is visible in one query.
    if (providerError) {
      console.error("[cron/update-results] provider error:", providerError);
    }

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
    let roundAwardsAffected = 0;
    let bracketPropagated = 0;
    if (finishedChanged.length > 0) {
      const result = await rescoreMatches(
        supabase,
        finishedChanged,
        settings.scoring,
      );
      rescored = result.rescored;
      // A finishing match can complete a meta-volante round → settle its awards
      // automatically (idempotent) and refresh standings if anything changed.
      const awards = await settleRoundAwardsAndRefresh(
        supabase,
        settings,
        result.rescored,
      );
      roundAwardsAffected = awards.awardsAffected;
      // A finishing knockout match may fill the next round's team slots
      // (idempotent; only scheduled dependents are touched).
      const propagated = await propagateKnockoutBracket(finishedChanged);
      bracketPropagated = propagated.updatedMatchIds.length;
    }

    return NextResponse.json({
      ok: true,
      provider: provider.name,
      providerMatches: providerMatches.length,
      candidates,
      providerError,
      matchesUpdated: applied.changedMatchIds.length,
      matchesFinished: applied.finishedMatchIds.length,
      unmatched: applied.unmatched,
      predictionsRescored: rescored,
      roundAwardsAffected,
      bracketPropagated,
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
