import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { Match, Prediction, Profile, Team } from "@/lib/types";
import { scorePrediction } from "@/lib/scoring";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Countdown } from "@/components/Countdown";
import { LocalKickoff } from "@/components/LocalKickoff";
import { MatchCard } from "@/components/MatchCard";

import { AppShell } from "../../_components/shell";
import { getAppSettings, getTeamMap, teamOr } from "../../_lib/data";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<Match["status"], string> = {
  scheduled: "Programado",
  live: "En directo",
  finished: "Finalizado",
};

function teamName(t: Team | undefined, fallback: string) {
  return t?.name ?? fallback;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function MatchDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await requireUser();
  const supabase = createClient();

  const [teamMap, settings, { data: matchRow }] = await Promise.all([
    getTeamMap(),
    getAppSettings(),
    supabase.from("matches").select("*").eq("id", params.id).maybeSingle(),
  ]);

  const match = matchRow as Match | null;
  if (!match) notFound();

  const locked = new Date(match.locks_at).getTime() <= Date.now();
  const home = teamMap.get(match.home_team);
  const away = teamMap.get(match.away_team);

  // Everyone's predictions only AFTER lock. Before lock, only the current
  // user's own pick (RLS enforces this too; we mirror it in the query).
  let predictions: Prediction[] = [];
  let profilesById = new Map<string, Profile>();

  if (locked) {
    const { data: preds } = await supabase
      .from("predictions")
      .select("*")
      .eq("match_id", match.id);
    predictions = (preds as Prediction[] | null) ?? [];

    if (predictions.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, avatar, role, joker_count, created_at")
        .in(
          "id",
          predictions.map((p) => p.user_id),
        );
      profilesById = new Map(
        ((profs as Profile[] | null) ?? []).map((p) => [p.id, p]),
      );
    }
  } else {
    const { data: mine } = await supabase
      .from("predictions")
      .select("*")
      .eq("match_id", match.id)
      .eq("user_id", profile.id);
    predictions = (mine as Prediction[] | null) ?? [];
    profilesById = new Map([[profile.id, profile]]);
  }

  const finished =
    match.status === "finished" &&
    match.home_score !== null &&
    match.away_score !== null;

  // Sort by (live/projected) points desc when finished, else by name.
  const enriched = predictions
    .map((p) => {
      const player = profilesById.get(p.user_id);
      const pts = finished
        ? scorePrediction(
            {
              home_pred: p.home_pred,
              away_pred: p.away_pred,
            },
            {
              home_score: match.home_score,
              away_score: match.away_score,
              status: match.status,
              is_joker: match.is_joker,
            },
            settings.scoring,
          )
        : null;
      return { p, player, pts };
    })
    .sort((a, b) => {
      if (finished) return (b.pts ?? -1) - (a.pts ?? -1);
      return (a.player?.display_name ?? "").localeCompare(
        b.player?.display_name ?? "",
      );
    });

  return (
    <AppShell profile={profile}>
      <div className="space-y-6">
        <Link
          href="/matches"
          className="inline-flex text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          ← Volver a partidos
        </Link>

        {/* Hero scoreboard. */}
        <Card className="overflow-hidden border-primary/30">
          <div className="bg-[radial-gradient(40rem_20rem_at_50%_-6rem,hsl(var(--primary)/0.18),transparent_70%)]">
            <CardContent className="py-8">
              <div className="mb-4 flex items-center justify-center gap-3 text-sm">
                <Badge
                  variant={match.status === "live" ? "destructive" : "secondary"}
                >
                  {match.status === "live" && (
                    <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
                  )}
                  {STATUS_LABEL[match.status]}
                </Badge>
                {match.group && (
                  <span className="text-muted-foreground">
                    Grupo {match.group}
                  </span>
                )}
                {match.is_joker && (
                  <Badge
                    variant="default"
                    title="Partido joker: puntos multiplicados"
                  >
                    🃏 JOKER
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                <TeamSide team={home} fallback="Local" align="end" />
                <div className="text-center">
                  {match.home_score !== null && match.away_score !== null ? (
                    <div className="font-mono text-5xl font-black tabular-nums">
                      {match.home_score}
                      <span className="mx-2 text-muted-foreground">-</span>
                      {match.away_score}
                    </div>
                  ) : (
                    <div className="font-mono text-3xl font-black text-muted-foreground">
                      vs
                    </div>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    <LocalKickoff
                      iso={match.kickoff_at}
                      options={{ dateStyle: "medium", timeStyle: "short" }}
                    />
                  </p>
                </div>
                <TeamSide team={away} fallback="Visitante" align="start" />
              </div>

              {!locked && (
                <div className="mt-6 text-center text-sm text-muted-foreground">
                  Cierra en{" "}
                  <Countdown
                    target={match.locks_at}
                    className="font-mono font-bold text-foreground"
                  />
                </div>
              )}
            </CardContent>
          </div>
        </Card>

        {/* Predictions. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-lg">
              Pronósticos
              <Badge variant="secondary">{predictions.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!locked ? (
              <div className="space-y-4">
                <p className="rounded-md border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
                  🔒 Los pronósticos del resto del grupo se revelan al cierre del
                  partido. Mientras tanto, solo ves el tuyo.
                </p>
                {predictions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aún no has pronosticado este partido.{" "}
                    <Link
                      href="/matches"
                      className="font-semibold text-primary hover:underline"
                    >
                      Hazlo aquí →
                    </Link>
                  </p>
                ) : (
                  <MatchCard
                    match={match}
                    homeTeam={teamOr(teamMap, match.home_team)}
                    awayTeam={teamOr(teamMap, match.away_team)}
                    prediction={predictions[0]}
                  />
                )}
              </div>
            ) : enriched.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nadie pronosticó este partido.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {enriched.map(({ p, player, pts }) => {
                  const name = player?.display_name ?? "Jugador";
                  const isMe = p.user_id === profile.id;
                  return (
                    <li
                      key={p.id}
                      className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      <Avatar className="h-9 w-9">
                        {player?.avatar && (
                          <AvatarImage src={player.avatar} alt={name} />
                        )}
                        <AvatarFallback>{initials(name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 truncate">
                        <span className="font-semibold">
                          {name}
                          {isMe && (
                            <span className="ml-2 text-xs font-medium text-primary">
                              (tú)
                            </span>
                          )}
                        </span>
                      </div>
                      <span className="font-mono text-lg font-bold tabular-nums">
                        {p.home_pred}-{p.away_pred}
                      </span>
                      {pts !== null && (
                        <Badge
                          variant={pts > 0 ? "default" : "secondary"}
                          className="w-12 justify-center"
                        >
                          {pts} pt
                        </Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function TeamSide({
  team,
  fallback,
  align,
}: {
  team: Team | undefined;
  fallback: string;
  align: "start" | "end";
}) {
  return (
    <div
      className={`flex items-center gap-3 ${
        align === "end" ? "flex-row-reverse text-right" : "text-left"
      }`}
    >
      <span className="text-3xl">{team?.flag_url ? "" : "🏳️"}</span>
      {team?.flag_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={team.flag_url}
          alt=""
          className="h-8 w-12 rounded object-cover shadow-sm"
        />
      )}
      <span className="text-lg font-black leading-tight">
        {teamName(team, fallback)}
      </span>
    </div>
  );
}
