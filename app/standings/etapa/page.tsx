import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { selectAll } from "@/lib/supabase/paginate";
import type {
  BonusAnswer,
  BonusQuestion,
  Match,
  PointAdjustment,
  Prediction,
  RoundAward,
  StandingRow,
  Team,
} from "@/lib/types";
import { buildEtapaTimeline, sortGeneral } from "@/lib/classifications";
import { EtapaPlayer } from "@/components/etapa/EtapaPlayer";

import { AppShell } from "../../_components/shell";
import { getAppSettings, loadEmailMap } from "../../_lib/data";

export const metadata = { title: "La Etapa · Resiporra 26" };
export const dynamic = "force-dynamic";

type LedgerPrediction = Pick<
  Prediction,
  "user_id" | "match_id" | "home_pred" | "away_pred" | "points_awarded"
>;
type LedgerBonusAnswer = Pick<
  BonusAnswer,
  "user_id" | "question_id" | "points_awarded"
>;
type LedgerAdjustment = Pick<
  PointAdjustment,
  "user_id" | "points" | "created_at"
>;

export default async function EtapaPage() {
  const profile = await requireUser();
  const supabase = createClient();

  const [
    { data: standingsData },
    { data: matchData },
    predictions,
    { data: awardData },
    bonusAnswers,
    { data: bonusQuestionData },
    { data: adjustmentData },
    { data: profileData },
    { data: teamData },
    emailByUserId,
    settings,
  ] = await Promise.all([
    supabase
      .from("standings_cache")
      .select("*")
      .order("rank", { ascending: true }),
    supabase.from("matches").select("*"),
    // predictions can exceed PostgREST's 1000-row cap — page through it, else
    // the timeline under-counts (ADR-0021).
    selectAll<LedgerPrediction>(() =>
      supabase
        .from("predictions")
        .select("user_id, match_id, home_pred, away_pred, points_awarded"),
    ),
    supabase.from("round_awards").select("*"),
    selectAll<LedgerBonusAnswer>(() =>
      supabase
        .from("bonus_answers")
        .select("user_id, question_id, points_awarded"),
    ),
    supabase.from("bonus_questions").select("id, locks_at"),
    // point_adjustments is readable by all authenticated users (RLS, migration
    // 0006); `reason` is never selected — it stays off the page entirely.
    supabase.from("point_adjustments").select("user_id, points, created_at"),
    supabase.from("profiles").select("id, created_at"),
    supabase.from("teams").select("id, code"),
    loadEmailMap(),
    getAppSettings(),
  ]);

  const rawStandings = (standingsData as StandingRow[] | null) ?? [];
  const matches = (matchData as Match[] | null) ?? [];
  const roundAwards = (awardData as RoundAward[] | null) ?? [];
  const bonusQuestions =
    (bonusQuestionData as Pick<BonusQuestion, "id" | "locks_at">[] | null) ?? [];
  const adjustments = (adjustmentData as LedgerAdjustment[] | null) ?? [];
  const profiles =
    (profileData as { id: string; created_at: string }[] | null) ?? [];
  const teams = (teamData as Pick<Team, "id" | "code">[] | null) ?? [];

  // user_id → profiles.created_at (drives the young-rider/maillot tie-breaks).
  const createdAt: Record<string, string> = {};
  for (const p of profiles) createdAt[p.id] = p.created_at;

  // Stable roster ordering, same tie-break as the standings page.
  const standings = sortGeneral(rawStandings, createdAt);

  const timeline = buildEtapaTimeline({
    standings,
    matches,
    teams,
    predictions,
    roundAwards,
    bonusAnswers,
    bonusQuestions,
    adjustments,
    emailByUserId,
    createdAt,
    options: {
      signPoints: settings.scoring.sign,
      exactPoints: settings.scoring.exact,
    },
  });

  return (
    <AppShell profile={profile}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Link
            href="/standings"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Clasificación
          </Link>
          <h1 className="hidden text-2xl font-black tracking-tight sm:block sm:text-4xl">
            La Etapa
          </h1>
        </div>
        <EtapaPlayer timeline={timeline} currentUserId={profile.id} />
      </div>
    </AppShell>
  );
}
