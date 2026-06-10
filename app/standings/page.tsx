import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { Match, Prediction, RoundAward, StandingRow } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RankingTable } from "@/components/RankingTable";
import { MetaVolanteBoard } from "@/components/MetaVolanteBoard";
import { PointsChart } from "@/components/PointsChart";

import { PotDialog } from "@/components/PotDialog";

import { AppShell } from "../_components/shell";
import { getAppSettings, getPotPrizes, matchdayKey } from "../_lib/data";

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

export default async function StandingsPage() {
  const profile = await requireUser();
  const supabase = createClient();

  const [
    { data: standingsData },
    { data: matchData },
    { data: predData },
    { data: awardData },
    pot,
    settings,
  ] = await Promise.all([
    supabase
      .from("standings_cache")
      .select("*")
      .order("rank", { ascending: true }),
    supabase.from("matches").select("*"),
    supabase.from("predictions").select("*"),
    supabase.from("round_awards").select("*"),
    getPotPrizes(),
    getAppSettings(),
  ]);

  const standings = (standingsData as StandingRow[] | null) ?? [];
  const matches = (matchData as Match[] | null) ?? [];
  const predictions = (predData as Prediction[] | null) ?? [];
  const awards = (awardData as RoundAward[] | null) ?? [];

  const series = buildSeries(matches, predictions, standings);

  return (
    <AppShell profile={profile}>
      <div className="space-y-4 sm:space-y-6">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-black tracking-tight sm:text-4xl">
            Clasificación
          </h1>
          {pot.winnerPrize > 0 ? (
            <PotDialog
              winnerPrize={pot.winnerPrize}
              runnerUpPrize={pot.runnerUpPrize}
            />
          ) : null}
        </header>

        <Tabs defaultValue="general">
          <TabsList className="grid w-full grid-cols-3 sm:inline-flex sm:w-auto">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="meta">Meta volante</TabsTrigger>
            <TabsTrigger value="evolucion">Evolución</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4">
            <RankingTable rows={standings} currentUserId={profile.id} />
            {standings.length > 0 && (
              <p className="mt-2 px-1 text-[11px] text-muted-foreground">
                Desempates: puntos → aciertos exactos → bonus.
              </p>
            )}
          </TabsContent>

          <TabsContent value="meta" className="mt-4">
            <MetaVolanteBoard
              awards={awards}
              standings={standings}
              currentUserId={profile.id}
              pointsPerRound={settings.meta_volante_points}
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
