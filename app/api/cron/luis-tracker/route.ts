// ============================================================================
// GET /api/cron/luis-tracker — daily "Luis de la Tracker" report generator.
//
// Triggered by a DAILY Vercel cron (Hobby-legal — see vercel.json), once the
// day's matches are over. Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`.
//
// Steps:
//   1. Auth (CRON_SECRET bearer).
//   2. Pick the report day: ?date=YYYY-MM-DD, else the latest calendar day with
//      finished matches.
//   3. Idempotency: if a report already exists for that day and ?force is not
//      set, return it without re-spending LLM tokens.
//   4. Load teams/matches/predictions/profiles (service role) → build the PURE
//      analysis input → analyzePredictions().
//   5. Verbalize with the LLM (Luis persona). On no key / API failure, fall back
//      to a deterministic "analysis_only" report so the cron never hard-fails.
//   6. Upsert the row (unique on report_date).
//
// Never throws raw — everything is wrapped in a JSON summary.
// ============================================================================

import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { analyzePredictions, jornadaOf } from "@/lib/tracker/analysis";
import type {
  AnalysisMatch,
  AnalysisPlayer,
  AnalysisPrediction,
} from "@/lib/tracker/analysis";
import {
  fallbackVerbalization,
  generateLuisReport,
  hasLuisLlm,
  trackerModel,
} from "@/lib/tracker/luis";
import type { Stage, MatchStatus, TrackerStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // LLM call headroom

// ----------------------------------------------------------------------------

interface MatchRow {
  id: string;
  home_team: string | null;
  away_team: string | null;
  stage: Stage;
  matchday: number | null;
  kickoff_at: string;
  home_score: number | null;
  away_score: number | null;
  status: MatchStatus;
  is_joker: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  // --- Auth ---------------------------------------------------------------
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date");
    const force = url.searchParams.has("force");
    if (dateParam && !DATE_RE.test(dateParam)) {
      return NextResponse.json(
        { ok: false, error: "Invalid date (expected YYYY-MM-DD)" },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();

    // --- Load everything we need (service role; bypasses RLS) --------------
    const [teamsRes, matchesRes, predsRes, profilesRes] = await Promise.all([
      supabase.from("teams").select("id, name, code"),
      supabase
        .from("matches")
        .select(
          "id, home_team, away_team, stage, matchday, kickoff_at, home_score, away_score, status, is_joker",
        ),
      supabase
        .from("predictions")
        .select("user_id, match_id, home_pred, away_pred, points_awarded"),
      // All profiles — admins play the pool too; the analysis only ever sees
      // whoever actually has predictions, so non-playing accounts are inert.
      supabase.from("profiles").select("id, display_name"),
    ]);

    if (matchesRes.error) throw matchesRes.error;

    const teamLabel = new Map<string, string>();
    for (const t of (teamsRes.data ?? []) as Array<{
      id: string;
      name: string | null;
      code: string | null;
    }>) {
      teamLabel.set(t.id, t.name || t.code || "Por definir");
    }
    const labelOf = (id: string | null): string =>
      (id && teamLabel.get(id)) || "Por definir";

    const matchRows = (matchesRes.data ?? []) as MatchRow[];
    const matches: AnalysisMatch[] = matchRows.map((m) => ({
      id: m.id,
      home_label: labelOf(m.home_team),
      away_label: labelOf(m.away_team),
      stage: m.stage,
      matchday: m.matchday,
      kickoff_at: m.kickoff_at,
      home_score: m.home_score,
      away_score: m.away_score,
      status: m.status,
      is_joker: m.is_joker,
    }));

    // --- Pick the report day ----------------------------------------------
    // A "jornada" is the Spanish pool day (anoche + madrugada), not the UTC
    // calendar day of the kickoff — see jornadaOf in lib/tracker/analysis.
    const finishedDays = matches
      .filter(
        (m) =>
          m.status === "finished" && m.home_score !== null && m.away_score !== null,
      )
      .map((m) => jornadaOf(m.kickoff_at));

    const reportDate = dateParam ?? (finishedDays.length ? finishedDays.sort().at(-1)! : null);

    if (!reportDate) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "No finished matches yet — nothing to report.",
      });
    }

    // --- Idempotency: don't re-spend tokens on an existing day -------------
    const { data: existing } = await supabase
      .from("tracker_reports")
      .select("id, status, created_at")
      .eq("report_date", reportDate)
      .maybeSingle();

    if (existing && !force) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "Report already exists for this day (pass ?force to regenerate).",
        reportDate,
        existing,
      });
    }

    // --- Analyze (PURE) ----------------------------------------------------
    const players: AnalysisPlayer[] = (
      (profilesRes.data ?? []) as Array<{ id: string; display_name: string }>
    ).map((p) => ({ user_id: p.id, display_name: p.display_name }));

    // Spoiler guard (defense in depth — analyzePredictions filters too):
    // never hand the pipeline predictions for matches that aren't finished.
    const finishedIds = new Set(
      matches
        .filter(
          (m) =>
            m.status === "finished" && m.home_score !== null && m.away_score !== null,
        )
        .map((m) => m.id),
    );
    const predictions: AnalysisPrediction[] = (
      (predsRes.data ?? []) as AnalysisPrediction[]
    )
      .filter((p) => finishedIds.has(p.match_id))
      .map((p) => ({
        user_id: p.user_id,
        match_id: p.match_id,
        home_pred: p.home_pred,
        away_pred: p.away_pred,
        points_awarded: p.points_awarded,
      }));

    const analysis = analyzePredictions({
      reportDate,
      players,
      matches,
      predictions,
    });

    // --- Verbalize (LLM, with graceful fallback) ---------------------------
    let status: TrackerStatus = "generated";
    let model: string | null = trackerModel();
    let verbalization = null as Awaited<ReturnType<typeof generateLuisReport>>;

    if (hasLuisLlm()) {
      try {
        verbalization = await generateLuisReport(analysis);
      } catch (err) {
        // API failure — degrade to the deterministic report rather than 500.
        console.error("[luis-tracker] LLM failed, falling back:", err);
        verbalization = null;
      }
    }

    if (!verbalization || verbalization.findings.length === 0) {
      verbalization = fallbackVerbalization(analysis);
      status = "analysis_only";
      model = null;
    }

    // --- Persist (idempotent upsert on report_date) ------------------------
    const { error: upErr } = await supabase.from("tracker_reports").upsert(
      {
        report_date: reportDate,
        headline: verbalization.headline,
        findings: verbalization.findings,
        analysis,
        model,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "report_date" },
    );
    if (upErr) throw upErr;

    return NextResponse.json({
      ok: true,
      reportDate,
      status,
      model,
      findings: verbalization.findings.length,
      matchesAnalyzed: analysis.matchesAnalyzed,
      candidates: analysis.candidateFindings.length,
      regenerated: Boolean(existing),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
