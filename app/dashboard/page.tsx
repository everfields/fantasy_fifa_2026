import Link from "next/link";

import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { Match, Prediction, StandingRow, TrackerReport } from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Countdown } from "@/components/Countdown";
import { MatchCard } from "@/components/MatchCard";
import { LuisDashboardTeaser } from "@/components/LuisTracker";
import { JokerMatchesCard, type JokerItem } from "@/components/JokerMatchesCard";

import { AppShell } from "../_components/shell";
import {
  getAppSettings,
  getTeamMap,
  matchdayLabel,
  matchdayKey,
  teamOr,
} from "../_lib/data";

export const metadata = { title: "Inicio · Resiporra 26" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const profile = await requireUser();
  const supabase = createClient();
  const nowIso = new Date().toISOString();

  const [
    teamMap,
    appSettings,
    { data: myStanding },
    { count: playerCount },
    { data: upcoming },
    { data: jokerMatches },
    { data: myPredictions },
    { data: latestTracker },
  ] = await Promise.all([
    getTeamMap(),
    getAppSettings(),
    supabase
      .from("standings_cache")
      .select("*")
      .eq("user_id", profile.id)
      .maybeSingle(),
    supabase.from("standings_cache").select("*", { count: "exact", head: true }),
    supabase
      .from("matches")
      .select("*")
      .gte("kickoff_at", nowIso)
      .order("kickoff_at", { ascending: true })
      .limit(12),
    supabase
      .from("matches")
      .select("*")
      .eq("is_joker", true)
      .neq("status", "finished")
      .order("kickoff_at", { ascending: true }),
    supabase
      .from("predictions")
      .select("*")
      .eq("user_id", profile.id),
    supabase
      .from("tracker_reports")
      .select("*")
      .order("report_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const standing = (myStanding as StandingRow | null) ?? null;
  const trackerReport = (latestTracker as TrackerReport | null) ?? null;
  const upcomingMatches = (upcoming as Match[] | null) ?? [];
  const predictionByMatch = new Map<string, Prediction>(
    ((myPredictions as Prediction[] | null) ?? []).map((p) => [p.match_id, p]),
  );

  const jokerMultiplier = appSettings.scoring.joker_multiplier;
  const jokerItems: JokerItem[] = ((jokerMatches as Match[] | null) ?? []).map(
    (m) => ({
      match: m,
      homeName: teamOr(teamMap, m.home_team).name,
      awayName: teamOr(teamMap, m.away_team).name,
      prediction: predictionByMatch.get(m.id) ?? null,
    }),
  );

  // Next matchday = the earliest upcoming kickoff date, and every match on it.
  const nextKey = upcomingMatches[0]
    ? matchdayKey(upcomingMatches[0].kickoff_at)
    : null;
  const nextMatchday = nextKey
    ? upcomingMatches.filter((m) => matchdayKey(m.kickoff_at) === nextKey)
    : [];
  const nextKickoff = nextMatchday[0]?.kickoff_at ?? null;

  const pendingCount = nextMatchday.filter(
    (m) => !predictionByMatch.has(m.id),
  ).length;

  return (
    <AppShell profile={profile}>
      <div className="space-y-8">
        <header className="space-y-1">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            Hola, {profile.display_name}
          </p>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            Tu centro de mando
          </h1>
        </header>

        {/* Stat strip. */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Posición"
            value={standing ? `#${standing.rank}` : "—"}
            sub={playerCount ? `de ${playerCount} jugadores` : "Sin clasificar"}
            accent
          />
          <StatCard
            label="Puntos"
            value={standing ? String(standing.total_points) : "0"}
            sub="totales"
          />
          <StatCard
            label="Aciertos exactos"
            value={standing ? String(standing.exact_hits) : "0"}
            sub="resultados clavados"
          />
          <StatCard
            label="Meta volante"
            value={standing ? String(standing.meta_points) : "0"}
            sub="puntos de campeón de ronda"
          />
        </div>

        {/* Next matchday. */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-black tracking-tight">
                Próxima jornada
              </h2>
              {nextKey && (
                <p className="text-sm capitalize text-muted-foreground">
                  {matchdayLabel(nextKey)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-4">
              {nextKickoff && (
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Cierre
                  </p>
                  <Countdown
                    target={nextKickoff}
                    className="font-mono text-lg font-bold tabular-nums"
                  />
                </div>
              )}
              <Button asChild>
                <Link href="/matches">
                  {pendingCount > 0
                    ? `Pronosticar (${pendingCount})`
                    : "Ver partidos"}
                </Link>
              </Button>
            </div>
          </div>

          {nextMatchday.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No hay partidos próximos. ¡Disfruta del descanso!
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {nextMatchday.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  homeTeam={teamOr(teamMap, m.home_team)}
                  awayTeam={teamOr(teamMap, m.away_team)}
                  prediction={predictionByMatch.get(m.id)}
                  footer={
                    <Link
                      href={`/match/${m.id}`}
                      className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      Detalle del partido →
                    </Link>
                  }
                />
              ))}
            </div>
          )}
        </section>

        {/* Joker matches — right after the next matchday. */}
        {jokerItems.length > 0 && (
          <JokerMatchesCard items={jokerItems} multiplier={jokerMultiplier} />
        )}

        {/* Luis de la Tracker — latest AI report. */}
        {trackerReport && (
          <section className="space-y-4">
            <h2 className="text-xl font-black tracking-tight">AI-tracking system</h2>
            <LuisDashboardTeaser report={trackerReport} />
          </section>
        )}

        {/* Quick links. */}
        <section className="grid gap-4 sm:grid-cols-3">
          <QuickLink
            href="/standings"
            title="Clasificación"
            desc="Ranking global y evolución de puntos."
          />
          <QuickLink
            href="/bonus"
            title="Preguntas bonus"
            desc="Campeón, pichichi y más puntos en juego."
          />
          <QuickLink
            href="/tracker"
            title="AI-tracking system"
            desc="El análisis diario del míster."
          />
        </section>
      </div>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "border-primary/40 bg-primary/5" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-4xl font-black tabular-nums tracking-tight">
          {value}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

function QuickLink({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href} className="group">
      <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:border-primary/50 group-hover:shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            {title}
            <span className="text-primary transition-transform group-hover:translate-x-1">
              →
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{desc}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
