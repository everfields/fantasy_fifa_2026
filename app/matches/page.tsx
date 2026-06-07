import Link from "next/link";

import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { Match, Prediction } from "@/lib/types";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MatchCard } from "@/components/MatchCard";
import { PredictionForm } from "@/components/PredictionForm";

import { AppShell } from "../_components/shell";
import {
  getAppSettings,
  getTeamMap,
  matchdayKey,
  matchdayLabel,
  teamOr,
} from "../_lib/data";
import { savePrediction } from "./actions";

export const metadata = { title: "Partidos · Mundial 26" };
export const dynamic = "force-dynamic";

function groupByMatchday(matches: Match[]): [string, Match[]][] {
  const groups = new Map<string, Match[]>();
  for (const m of matches) {
    const key = matchdayKey(m.kickoff_at);
    const arr = groups.get(key) ?? [];
    arr.push(m);
    groups.set(key, arr);
  }
  return Array.from(groups.entries());
}

export default async function MatchesPage() {
  const profile = await requireUser();
  const supabase = createClient();
  const now = Date.now();
  const nowIso = new Date().toISOString();

  const [teamMap, settings, { data: matchData }, { data: predData }] =
    await Promise.all([
      getTeamMap(),
      getAppSettings(),
      supabase.from("matches").select("*").order("kickoff_at", { ascending: true }),
      supabase
        .from("predictions")
        .select("*")
        .eq("user_id", profile.id),
    ]);

  const matches = (matchData as Match[] | null) ?? [];
  const predictions = (predData as Prediction[] | null) ?? [];
  const predByMatch = new Map(predictions.map((p) => [p.match_id, p]));

  // Joker budget: allowance minus jokers already spent (across all matches).
  const allowance = Math.min(profile.joker_count, settings.jokers_per_user);
  const jokersUsed = predictions.filter((p) => p.is_joker).length;
  const jokersRemaining = Math.max(0, allowance - jokersUsed);

  const upcoming = matches.filter((m) => new Date(m.locks_at).getTime() > now);
  const past = matches
    .filter((m) => new Date(m.locks_at).getTime() <= now)
    .reverse();

  const upcomingDays = groupByMatchday(upcoming);
  const pastDays = groupByMatchday(past);

  return (
    <AppShell profile={profile}>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              Partidos
            </h1>
            <p className="text-muted-foreground">
              Pronostica antes del pitido inicial. El cierre es a la hora del
              saque.
            </p>
          </div>
          <Badge variant="secondary" className="text-sm">
            🃏 {jokersRemaining} joker{jokersRemaining === 1 ? "" : "s"}{" "}
            disponible{jokersRemaining === 1 ? "" : "s"}
          </Badge>
        </header>

        <Tabs defaultValue="upcoming" className="space-y-6">
          <TabsList>
            <TabsTrigger value="upcoming">
              Próximos ({upcoming.length})
            </TabsTrigger>
            <TabsTrigger value="past">Jugados ({past.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-10">
            {upcomingDays.length === 0 ? (
              <EmptyState text="No hay partidos próximos." />
            ) : (
              upcomingDays.map(([key, dayMatches]) => (
                <MatchdaySection key={key} mdKey={key}>
                  <div className="grid gap-4 md:grid-cols-2">
                    {dayMatches.map((m) => {
                      const prediction = predByMatch.get(m.id);
                      const locked =
                        settings.season_locked ||
                        new Date(m.locks_at).getTime() <= now;
                      // A match that already carries the user's joker should not
                      // count against the remaining budget for its own form.
                      const formJokers =
                        prediction?.is_joker
                          ? jokersRemaining + 1
                          : jokersRemaining;
                      return (
                        <PredictionForm
                          key={m.id}
                          match={m}
                          homeTeam={teamOr(teamMap, m.home_team)}
                          awayTeam={teamOr(teamMap, m.away_team)}
                          prediction={prediction}
                          jokersRemaining={formJokers}
                          locked={locked}
                          action={savePrediction}
                        />
                      );
                    })}
                  </div>
                </MatchdaySection>
              ))
            )}
          </TabsContent>

          <TabsContent value="past" className="space-y-10">
            {pastDays.length === 0 ? (
              <EmptyState text="Todavía no se ha jugado ningún partido." />
            ) : (
              pastDays.map(([key, dayMatches]) => (
                <MatchdaySection key={key} mdKey={key}>
                  <div className="grid gap-4 md:grid-cols-2">
                    {dayMatches.map((m) => (
                      <MatchCard
                        key={m.id}
                        match={m}
                        homeTeam={teamOr(teamMap, m.home_team)}
                        awayTeam={teamOr(teamMap, m.away_team)}
                        prediction={predByMatch.get(m.id)}
                        locked
                        footer={
                          <Link
                            href={`/match/${m.id}`}
                            className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
                          >
                            Ver pronósticos del grupo →
                          </Link>
                        }
                      />
                    ))}
                  </div>
                </MatchdaySection>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function MatchdaySection({
  mdKey,
  children,
}: {
  mdKey: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground capitalize">
          {matchdayLabel(mdKey)}
        </h2>
        <span className="h-px flex-1 bg-border" />
      </div>
      {children}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-muted-foreground">
        {text}
      </CardContent>
    </Card>
  );
}
