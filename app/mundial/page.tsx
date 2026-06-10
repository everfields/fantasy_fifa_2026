import Link from "next/link";

import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
  bestThirds,
  computeGroupTables,
  isGroupComplete,
  type GroupRow,
} from "@/lib/tournament";
import type { Match, Stage, Team } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { AppShell } from "../_components/shell";
import { getTeamMap, teamOr } from "../_lib/data";

export const metadata = { title: "Mundial · Resiporra 26" };
export const dynamic = "force-dynamic";

const KNOCKOUT_STAGES: { stage: Stage; label: string }[] = [
  { stage: "round_of_32", label: "Dieciseisavos" },
  { stage: "round_of_16", label: "Octavos" },
  { stage: "quarter", label: "Cuartos" },
  { stage: "semi", label: "Semifinales" },
  { stage: "third_place", label: "3er puesto" },
  { stage: "final", label: "Final" },
];

export default async function MundialPage() {
  const profile = await requireUser();
  const supabase = createClient();

  const [teamMap, { data: matchData }] = await Promise.all([
    getTeamMap(),
    supabase
      .from("matches")
      .select("*")
      .order("kickoff_at", { ascending: true }),
  ]);

  const matches = (matchData as Match[] | null) ?? [];
  const teams = Array.from(teamMap.values());

  const tables = computeGroupTables(teams, matches);
  const thirds = bestThirds(tables);
  const allComplete = Array.from(tables.values()).every(isGroupComplete);

  const knockout = new Map<Stage, Match[]>();
  for (const m of matches) {
    if (m.stage === "group") continue;
    const list = knockout.get(m.stage) ?? [];
    list.push(m);
    knockout.set(m.stage, list);
  }

  return (
    <AppShell profile={profile}>
      <div className="space-y-8">
        <header className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            Mundial 2026
          </h1>
          <p className="text-muted-foreground">
            Clasificación de los grupos y cuadro final, calculados con los
            resultados del torneo.
          </p>
        </header>

        {/* Group tables. */}
        <section className="space-y-4">
          <h2 className="text-xl font-black tracking-tight">Fase de grupos</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from(tables.entries()).map(([group, rows]) => (
              <GroupCard key={group} group={group} rows={rows} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Criterios FIFA: puntos → diferencia de goles → goles → enfrentamiento
            directo. Los empates que solo el fair play o el sorteo resuelven se
            marcan con <span className="font-semibold">*</span>. Pasan los dos
            primeros de cada grupo y los 8 mejores terceros.
          </p>
        </section>

        {/* Best thirds. */}
        <section className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mejores terceros</CardTitle>
              <CardDescription>
                Los 8 primeros se clasifican para dieciseisavos.
                {!allComplete &&
                  " Clasificación provisional hasta que acabe la fase de grupos."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {thirds.map((t, i) => (
                  <div
                    key={t.group}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm",
                      t.qualifies
                        ? "bg-primary/10 font-semibold"
                        : "text-muted-foreground",
                    )}
                  >
                    <span className="w-5 font-mono text-xs tabular-nums">
                      {i + 1}.
                    </span>
                    <TeamLabel team={t.row.team} />
                    <Badge variant="outline" className="ml-auto">
                      {t.group}
                    </Badge>
                    <span className="w-10 text-right font-mono text-xs tabular-nums">
                      {t.row.points} pts
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Knockout bracket. */}
        <section className="space-y-4">
          <h2 className="text-xl font-black tracking-tight">Cuadro final</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {KNOCKOUT_STAGES.map(({ stage, label }) => {
              const stageMatches = knockout.get(stage) ?? [];
              if (stageMatches.length === 0) return null;
              return (
                <Card
                  key={stage}
                  className={stage === "final" ? "border-primary/40" : undefined}
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{label}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {stageMatches.map((m) => (
                      <BracketMatch
                        key={m.id}
                        match={m}
                        home={teamOr(teamMap, m.home_team)}
                        away={teamOr(teamMap, m.away_team)}
                      />
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Los cruces se actualizan cuando se confirman los clasificados de
            cada ronda.
          </p>
        </section>
      </div>
    </AppShell>
  );
}

function TeamLabel({ team, muted }: { team: Team; muted?: boolean }) {
  const tbd = team.code === "TBD";
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-2",
        (muted || tbd) && "text-muted-foreground",
      )}
    >
      <span className="grid h-4 w-6 shrink-0 place-items-center overflow-hidden rounded-[2px] border border-border/60 bg-muted text-[8px] font-bold">
        {team.flag_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={team.flag_url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          "?"
        )}
      </span>
      <span className="truncate">{tbd ? "Por definir" : team.name}</span>
    </span>
  );
}

function GroupCard({ group, rows }: { group: string; rows: GroupRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Grupo {group}</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="pb-1 font-semibold" colSpan={2}>
                Equipo
              </th>
              <th className="pb-1 text-center font-semibold">PJ</th>
              <th className="pb-1 text-center font-semibold">DG</th>
              <th className="pb-1 text-right font-semibold">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.team.id}
                className={cn(
                  "border-t border-border/60",
                  i < 2 && "bg-primary/5 font-semibold",
                )}
              >
                <td className="w-5 py-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                  {i + 1}
                </td>
                <td className="py-1.5 pr-2">
                  <TeamLabel team={r.team} muted={i >= 2} />
                  {r.unresolvedTie ? (
                    <span className="ml-0.5 text-muted-foreground">*</span>
                  ) : null}
                </td>
                <td className="py-1.5 text-center font-mono text-xs tabular-nums">
                  {r.played}
                </td>
                <td className="py-1.5 text-center font-mono text-xs tabular-nums">
                  {r.gd > 0 ? `+${r.gd}` : r.gd}
                </td>
                <td className="py-1.5 text-right font-mono text-xs font-bold tabular-nums">
                  {r.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function BracketMatch({
  match,
  home,
  away,
}: {
  match: Match;
  home: Team;
  away: Team;
}) {
  const played = match.home_score !== null && match.away_score !== null;
  const homeWins = played && match.home_score! > match.away_score!;
  const awayWins = played && match.away_score! > match.home_score!;

  return (
    <Link
      href={`/match/${match.id}`}
      className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm transition-colors hover:border-primary/50 hover:bg-muted/40"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={cn(homeWins && "font-bold")}>
          <TeamLabel team={home} />
        </span>
        <span className={cn(awayWins && "font-bold")}>
          <TeamLabel team={away} />
        </span>
      </span>
      <span className="flex flex-col items-end gap-1 font-mono text-sm tabular-nums">
        {played ? (
          <>
            <span className={cn(homeWins && "font-bold")}>{match.home_score}</span>
            <span className={cn(awayWins && "font-bold")}>{match.away_score}</span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            {new Date(match.kickoff_at).toLocaleDateString("es-ES", {
              day: "2-digit",
              month: "short",
            })}
          </span>
        )}
      </span>
      {match.status === "live" ? <Badge>En vivo</Badge> : null}
    </Link>
  );
}
