import { requireUser } from "@/lib/auth/guards";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type {
  BonusAnswer,
  MaillotKey,
  Match,
  Prediction,
  RoundAward,
  StandingRow,
  Team,
} from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isExact, roundKeyForMatch } from "@/lib/scoring";
import { RankingTable } from "@/components/RankingTable";
import { MetaVolanteBoard, type LiveRound } from "@/components/MetaVolanteBoard";
import { PointsChart } from "@/components/PointsChart";
import { PelotonBoard } from "@/components/PelotonBoard";
import {
  MontanaBoard,
  type MontanaEtapaView,
} from "@/components/MontanaBoard";
import { RegularityBoard } from "@/components/RegularityBoard";
import { MaillotBadge, MAILLOT_LABELS } from "@/components/MaillotBadge";
import { AstonBadge, ASTON_LABEL } from "@/components/classifications";

import {
  groupPeloton,
  computeRegularity,
  computeMontana,
  assignAstons,
  assignMaillots,
  sortGeneral,
} from "@/lib/classifications";
import { MAILLOT_BLANCO_EMAILS } from "@/lib/classifications/config";

import { AppShell } from "../_components/shell";
import { getAppSettings, matchdayKey } from "../_lib/data";

export const metadata = { title: "Clasificación · Resiporra 26" };
export const dynamic = "force-dynamic";

type Series = {
  userId: string;
  displayName: string;
  data: { matchday: number; total: number }[];
};

/**
 * Build cumulative points-by-matchday series for every player.
 *
 * Matchdays are derived from the calendar date of each match's kickoff and
 * mapped to sequential integers (1..N) in chronological order — that integer is
 * the `matchday` the PointsChart contract expects. For each user we accumulate
 * `points_awarded` (treating null/unscored as 0) and emit a running total at
 * every matchday, so the lines are always defined across the full x-axis even
 * when data is sparse.
 */
function buildSeries(
  matches: Match[],
  predictions: Prediction[],
  standings: StandingRow[],
): Series[] {
  // Ordered unique matchday keys → 1-based index.
  const orderedKeys = Array.from(
    new Set(
      matches
        .slice()
        .sort(
          (a, b) =>
            new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime(),
        )
        .map((m) => matchdayKey(m.kickoff_at)),
    ),
  );
  const mdIndex = new Map(orderedKeys.map((k, i) => [k, i + 1]));
  const matchMd = new Map(
    matches.map((m) => [m.id, mdIndex.get(matchdayKey(m.kickoff_at)) ?? 0]),
  );

  // Per-user: points earned at each matchday index.
  const perUserPerMd = new Map<string, Map<number, number>>();
  for (const p of predictions) {
    const md = matchMd.get(p.match_id);
    if (!md) continue;
    const byMd = perUserPerMd.get(p.user_id) ?? new Map<number, number>();
    byMd.set(md, (byMd.get(md) ?? 0) + (p.points_awarded ?? 0));
    perUserPerMd.set(p.user_id, byMd);
  }

  const totalMds = orderedKeys.length;

  return standings.map((row) => {
    const byMd = perUserPerMd.get(row.user_id) ?? new Map<number, number>();
    let running = 0;
    const data: { matchday: number; total: number }[] = [];
    for (let md = 1; md <= totalMds; md++) {
      running += byMd.get(md) ?? 0;
      data.push({ matchday: md, total: running });
    }
    return { userId: row.user_id, displayName: row.display_name, data };
  });
}

// Chronological order of meta-volante rounds (third_place folds into final).
const ROUND_SEQ = [
  "group-md1",
  "group-md2",
  "group-md3",
  "round_of_32",
  "round_of_16",
  "quarter",
  "semi",
  "final",
] as const;

/**
 * Provisional standing of the round currently in progress: the earliest
 * started round without a granted award. Sums already-awarded prediction
 * points per user (display only — the real award is granted by the manual
 * recalc at round close, ADR rule 5 untouched).
 */
function buildLiveRound(
  matches: Match[],
  predictions: Prediction[],
  awards: RoundAward[],
): LiveRound | null {
  const keyOf = (m: Match): string | null => {
    try {
      return roundKeyForMatch(m);
    } catch {
      return null;
    }
  };

  const awarded = new Set(awards.map((a) => a.round_key));
  const started = new Set(
    matches
      .filter((m) => m.status !== "scheduled")
      .map(keyOf)
      .filter(Boolean) as string[],
  );
  const roundKey = ROUND_SEQ.find((k) => started.has(k) && !awarded.has(k));
  if (!roundKey) return null;

  const roundMatches = matches.filter((m) => keyOf(m) === roundKey);
  const byId = new Map(roundMatches.map((m) => [m.id, m]));

  const perUser = new Map<string, { round_points: number; exact_hits: number }>();
  for (const p of predictions) {
    const m = byId.get(p.match_id);
    if (!m || m.status !== "finished") continue;
    const agg = perUser.get(p.user_id) ?? { round_points: 0, exact_hits: 0 };
    agg.round_points += p.points_awarded ?? 0;
    if (
      m.home_score !== null &&
      m.away_score !== null &&
      isExact(p.home_pred, p.away_pred, m.home_score, m.away_score)
    ) {
      agg.exact_hits += 1;
    }
    perUser.set(p.user_id, agg);
  }

  const entries = Array.from(perUser.entries())
    .map(([user_id, agg]) => ({ user_id, ...agg }))
    .sort(
      (a, b) => b.round_points - a.round_points || b.exact_hits - a.exact_hits,
    );

  return {
    roundKey,
    entries,
    finished: roundMatches.filter((m) => m.status === "finished").length,
    total: roundMatches.length,
  };
}

/**
 * Resolve player emails server-side via the privileged `profile_emails()` RPC,
 * needed to assign the fixed maillots (arcoíris champion + blanco roster) and
 * to filter the "Jóvenes" tab. Emails are PII: they NEVER reach client-component
 * props or the rendered HTML — they are only used here to derive opaque
 * user_id → MaillotKey[] maps. Degrades to `{}` (no fixed maillots, hidden
 * Jóvenes tab) if the RPC/migration is not yet available.
 */
async function loadEmailMap(): Promise<Record<string, string>> {
  try {
    const svc = createServiceClient();
    const { data, error } = await svc.rpc("profile_emails");
    if (error || !data) return {};
    const map: Record<string, string> = {};
    for (const row of data as { id: string; email: string }[]) {
      if (row?.id && row?.email) map[row.id] = row.email.toLowerCase();
    }
    return map;
  } catch {
    return {};
  }
}

export default async function StandingsPage() {
  const profile = await requireUser();
  const supabase = createClient();

  const [
    { data: standingsData },
    { data: matchData },
    { data: predData },
    { data: awardData },
    { data: bonusData },
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
    supabase.from("predictions").select("*"),
    supabase.from("round_awards").select("*"),
    supabase.from("bonus_answers").select("user_id, points_awarded"),
    supabase.from("profiles").select("id, created_at"),
    supabase.from("teams").select("id, name, code"),
    loadEmailMap(),
    getAppSettings(),
  ]);

  const rawStandings = (standingsData as StandingRow[] | null) ?? [];
  const matches = (matchData as Match[] | null) ?? [];
  const predictions = (predData as Prediction[] | null) ?? [];
  const awards = (awardData as RoundAward[] | null) ?? [];
  const bonusAnswers = (bonusData as Pick<
    BonusAnswer,
    "user_id" | "points_awarded"
  >[] | null) ?? [];
  const profiles = (profileData as { id: string; created_at: string }[] | null) ?? [];
  const teams = (teamData as Pick<Team, "id" | "name" | "code">[] | null) ?? [];

  // user_id → profiles.created_at (drives the young-rider/maillot tie-breaks).
  const createdAt: Record<string, string> = {};
  for (const p of profiles) createdAt[p.id] = p.created_at;

  // Order rank ties by created_at — same tie-break as the maillots, so the
  // amarillo renders first and the farolillo rojo last.
  const standings = sortGeneral(rawStandings, createdAt);

  // teams lookup for montaña etapa labels.
  const teamName = new Map(teams.map((t) => [t.id, t.name]));

  const series = buildSeries(matches, predictions, standings);
  const liveRound = buildLiveRound(matches, predictions, awards);

  // --- Cycling classifications (pure) -------------------------------------
  const peloton = groupPeloton(standings, {
    signPoints: settings.scoring.sign,
    exactPoints: settings.scoring.exact,
  });
  const regularity = computeRegularity({
    standings,
    predictions,
    matches,
    bonusAnswers: bonusAnswers as BonusAnswer[],
    roundAwards: awards,
    createdAt,
  });
  const montana = computeMontana({ standings, matches, predictions, createdAt });
  const maillots = assignMaillots({
    standings,
    regularity,
    montana: montana.rows,
    roundAwards: awards,
    emailByUserId,
    createdAt,
  });
  const astonUserIds = assignAstons(standings);

  // Map montaña etapas (raw Match[]) → client-safe views (no raw predictions).
  const montanaEtapas: MontanaEtapaView[] = montana.etapas.map((e) => ({
    stage: e.stage,
    finished: e.finished,
    matches: e.matches
      .slice()
      .sort(
        (a, b) =>
          new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime(),
      )
      .map((m) => ({
        id: m.id,
        label: `${teamName.get(m.home_team) ?? "Por definir"} – ${
          teamName.get(m.away_team) ?? "Por definir"
        }`,
        kickoff_at: m.kickoff_at,
        status: m.status,
        score:
          m.home_score !== null && m.away_score !== null
            ? `${m.home_score}-${m.away_score}`
            : null,
      })),
  }));

  // Distinct maillots present in the current standings, for a compact legend.
  const presentMaillots = Array.from(
    new Set(Object.values(maillots).flat()),
  ) as MaillotKey[];

  // --- Jóvenes (maillot blanco) tab ---------------------------------------
  // Filter to the fixed young-rider roster (matched by email, server-side),
  // re-rank 1..n preserving the general order. Hidden if the email map is empty
  // (RPC unavailable) — never leak the roster or break the page.
  const blancoSet = new Set(MAILLOT_BLANCO_EMAILS);
  const youngRows: StandingRow[] = standings
    .filter((r) => {
      const email = emailByUserId[r.user_id];
      return email ? blancoSet.has(email) : false;
    })
    .map((r, i) => ({ ...r, rank: i + 1 }));
  const showYoung = Object.keys(emailByUserId).length > 0;

  return (
    <AppShell profile={profile}>
      <div className="space-y-4 sm:space-y-6">
        <h1 className="hidden text-2xl font-black tracking-tight sm:block sm:text-4xl">
          Clasificación
        </h1>

        <Tabs defaultValue="general">
          {/* 6 tabs — single swipeable row on phones (scrollbar hidden), inline on sm+. */}
          <div className="-mx-8 overflow-x-auto px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:overflow-visible sm:px-0">
            <TabsList className="w-max justify-start">
              <TabsTrigger value="general" className="shrink-0">
                General
              </TabsTrigger>
              <TabsTrigger value="montana" className="shrink-0">
                Montaña
              </TabsTrigger>
              <TabsTrigger value="regularidad" className="shrink-0">
                Regularidad
              </TabsTrigger>
              <TabsTrigger value="jovenes" className="shrink-0">
                Jóvenes
              </TabsTrigger>
              <TabsTrigger value="meta" className="shrink-0">
                Meta volante
              </TabsTrigger>
              <TabsTrigger value="evolucion" className="shrink-0">
                Evolución
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="general" className="mt-4 space-y-3">
            <PelotonBoard
              groups={peloton}
              maillots={maillots}
              astonUserIds={astonUserIds}
              currentUserId={profile.id}
            />
            {(presentMaillots.length > 0 || astonUserIds.length > 0) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1 text-[11px] text-muted-foreground">
                {presentMaillots.map((k) => (
                  <span key={k} className="inline-flex items-center gap-1.5">
                    <MaillotBadge maillot={k} />
                    {MAILLOT_LABELS[k]}
                  </span>
                ))}
                {astonUserIds.length > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <AstonBadge size="sm" />
                    {ASTON_LABEL}
                  </span>
                )}
              </div>
            )}
            {standings.length > 0 && (
              <p className="px-1 text-[11px] text-muted-foreground">
                Desempates: puntos → aciertos exactos → bonus.
              </p>
            )}
          </TabsContent>

          <TabsContent value="montana" className="mt-4">
            <MontanaBoard
              rows={montana.rows}
              etapas={montanaEtapas}
              currentUserId={profile.id}
            />
          </TabsContent>

          <TabsContent value="regularidad" className="mt-4">
            <RegularityBoard rows={regularity} currentUserId={profile.id} />
          </TabsContent>

          <TabsContent value="jovenes" className="mt-4 space-y-3">
            <header className="px-1">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <MaillotBadge maillot="blanco" />
                Mejor joven
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Los tres jóvenes talentos de la porra.
              </p>
            </header>
            {showYoung ? (
              <RankingTable
                rows={youngRows}
                currentUserId={profile.id}
                maillots={maillots}
              />
            ) : (
              <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                Clasificación por estrenar.
              </div>
            )}
          </TabsContent>

          <TabsContent value="meta" className="mt-4">
            <MetaVolanteBoard
              awards={awards}
              standings={standings}
              currentUserId={profile.id}
              distribution={settings.meta_volante_distribution}
              live={liveRound}
            />
          </TabsContent>

          <TabsContent value="evolucion" className="mt-4">
            {series.length === 0 ? (
              <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                Sin datos todavía.
              </div>
            ) : (
              <div className="rounded-xl border bg-card p-3 sm:p-4">
                <PointsChart series={series} />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
