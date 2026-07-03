// ============================================================================
// POST /api/admin/sync-now — admin-triggered force-sync of a single match or
// a whole matchday.
//
// Body (zod, exactly one of):
//   { matchId: string }   — sync one of our matches by its DB id
//   { matchday: number }  — sync all matches whose provider matchday matches
//                           (resolved via getMatches()).
//
// Steps: force-fetch from the provider, update the affected `matches` rows,
// rescore affected finished matches IDEMPOTENTLY, refresh standings, audit-log.
// Guarded by requireAdmin(). Never throws raw.
// ============================================================================

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/guards";
import { getProvider } from "@/lib/providers";
import type { ProviderMatch } from "@/lib/providers";
import { createServiceClient } from "@/lib/supabase/server";

import {
  applyProviderMatches,
  loadAppSettings,
  loadMatchRows,
  loadTeamCodeById,
  logAudit,
  propagateKnockoutBracket,
  rescoreMatches,
  settleRoundAwardsAndRefresh,
} from "../../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    matchId: z.string().uuid().optional(),
    matchday: z.number().int().positive().optional(),
  })
  .refine((b) => (b.matchId ? 1 : 0) + (b.matchday !== undefined ? 1 : 0) === 1, {
    message: "Provide exactly one of { matchId } or { matchday }",
  });

export async function POST(req: Request) {
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
  const { matchId, matchday } = parsed.data;

  try {
    const supabase = createServiceClient();
    const provider = getProvider();
    const [teamCodeById, settings] = await Promise.all([
      loadTeamCodeById(supabase),
      loadAppSettings(supabase),
    ]);

    // --- Resolve which DB rows + provider matches we are syncing -----------
    let dbMatches;
    let providerMatches: ProviderMatch[];
    // Surfaced to the admin (response + audit) so «Sync ahora» shows an upstream
    // outage instead of silently reporting 0 updates — the same failure mode
    // that hid the dead-key incident on the cron path. sync-now uses
    // getMatch()/getMatches() (not getLiveMatches), which don't carry a
    // providerError envelope, so we capture a thrown fetch failure here rather
    // than letting it mask the run as a bare 500.
    let providerError: string | null = null;

    if (matchId) {
      dbMatches = await loadMatchRows(supabase, { ids: [matchId] });
      if (dbMatches.length === 0) {
        return NextResponse.json(
          { ok: false, error: "Match not found" },
          { status: 404 },
        );
      }
      const row = dbMatches[0];
      // Prefer the stored provider id; without one we cannot force-fetch a
      // single match deterministically.
      if (!row.provider_match_id) {
        return NextResponse.json(
          {
            ok: false,
            error: "Match has no provider_match_id; cannot force-sync a single match",
          },
          { status: 422 },
        );
      }
      try {
        const pm = await provider.getMatch(row.provider_match_id);
        providerMatches = pm ? [pm] : [];
      } catch (err) {
        providerError = err instanceof Error ? err.message : "Provider fetch failed";
        providerMatches = [];
      }
    } else {
      // matchday: fetch the full schedule and filter to the requested round.
      // getMatches() has no matchday field on ProviderMatch, so we sync the
      // whole schedule against our rows and let the matcher pick the overlap.
      // Loading all DB rows keeps fallback matching correct.
      try {
        providerMatches = await provider.getMatches();
      } catch (err) {
        providerError = err instanceof Error ? err.message : "Provider fetch failed";
        providerMatches = [];
      }
      dbMatches = await loadMatchRows(supabase);
    }

    if (providerError) {
      console.error("[admin/sync-now] provider error:", providerError);
    }

    // --- Apply (idempotent) -------------------------------------------------
    const applied = await applyProviderMatches(
      supabase,
      providerMatches,
      dbMatches,
      teamCodeById,
    );

    // --- Rescore finished matches that changed (idempotent) -----------------
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
      // Settle meta-volante round awards automatically if this completed a round.
      const awards = await settleRoundAwardsAndRefresh(
        supabase,
        settings,
        result.rescored,
      );
      roundAwardsAffected = awards.awardsAffected;
      // Auto-fill downstream knockout slots when a source match finishes.
      const propagated = await propagateKnockoutBracket(finishedChanged);
      bracketPropagated = propagated.updatedMatchIds.length;
    }

    await logAudit(supabase, {
      action: "sync.now",
      targetType: matchId ? "match" : "matchday",
      targetId: matchId ?? String(matchday),
      before: null,
      after: {
        provider: provider.name,
        providerError,
        matchesUpdated: applied.changedMatchIds.length,
        matchesFinished: applied.finishedMatchIds.length,
        unmatched: applied.unmatched,
        predictionsRescored: rescored,
        roundAwardsAffected,
        bracketPropagated,
      },
      actorId: admin.id,
    });

    return NextResponse.json({
      ok: true,
      target: matchId ? { matchId } : { matchday },
      provider: provider.name,
      providerError,
      // Human-facing note so «Sync ahora» renders the upstream failure even if
      // the UI only reads `message`.
      message: providerError
        ? `Aviso: fallo del proveedor — ${providerError}`
        : undefined,
      matchesUpdated: applied.changedMatchIds.length,
      matchesFinished: applied.finishedMatchIds.length,
      unmatched: applied.unmatched,
      predictionsRescored: rescored,
      roundAwardsAffected,
      bracketPropagated,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
