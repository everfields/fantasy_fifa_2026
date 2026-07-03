import { createServiceClient } from "@/lib/supabase/server";
import type { Match, Team } from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/admin/PageHeader";
import { MatchRow, type KnockoutOption } from "@/components/admin/MatchRow";
import { MontanaAutoAssign } from "@/components/admin/MontanaAutoAssign";

export const dynamic = "force-dynamic";

function teamOr(map: Map<string, Team>, id: string): Team {
  return (
    map.get(id) ?? {
      id,
      name: "Por definir",
      code: "TBD",
      flag_url: null,
      group: null,
      is_eliminated: false,
    }
  );
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function dayLabel(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export default async function AdminMatchesPage() {
  const supabase = createServiceClient();

  const [{ data: matches }, { data: teams }] = await Promise.all([
    supabase.from("matches").select("*").order("kickoff_at", { ascending: true }),
    supabase.from("teams").select("*"),
  ]);

  const teamList = ((teams as Team[] | null) ?? [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const teamMap = new Map<string, Team>(teamList.map((t) => [t.id, t]));

  const all = (matches as Match[] | null) ?? [];

  // Lean list of knockout matches for the "Cruce" (bracket source) picker in
  // each row — team names resolved server-side, «Por definir» when still empty.
  const knockoutOptions: KnockoutOption[] = all
    .filter((m) => m.stage !== "group")
    .map((m) => ({
      id: m.id,
      stage: m.stage,
      kickoff_at: m.kickoff_at,
      home: teamMap.get(m.home_team)?.name ?? "Por definir",
      away: teamMap.get(m.away_team)?.name ?? "Por definir",
    }));

  const jokerCount = all.filter((m) => m.is_joker).length;
  const montanaCount = all.filter((m) => m.montana_stage !== null).length;
  const montanaStages = new Set(
    all
      .map((m) => m.montana_stage)
      .filter((s): s is number => s !== null),
  ).size;

  // Group by calendar day (the natural "matchday" grouping), preserving order.
  const groups: { key: string; matches: Match[] }[] = [];
  const indexByKey = new Map<string, number>();
  for (const m of all) {
    const k = dayKey(m.kickoff_at);
    const idx = indexByKey.get(k);
    if (idx === undefined) {
      indexByKey.set(k, groups.length);
      groups.push({ key: k, matches: [m] });
    } else {
      groups[idx].matches.push(m);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Calendario"
        title="Gestión de partidos"
        description="Sobrescribe resultados cuando el proveedor falla, fuerza estados, mueve bloqueos y sincroniza bajo demanda. Cada cambio queda auditado."
      />

      <Card className="mb-6 border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/30">
        <CardContent className="py-4 text-sm text-amber-900 dark:text-amber-200">
          <p className="font-semibold">
            Jokers asignados: {jokerCount}
            <span className="font-normal text-amber-700 dark:text-amber-400"> (recomendado: 10)</span>
          </p>
          <p className="mt-1 text-amber-800 dark:text-amber-300">
            Un partido joker multiplica los puntos de todos los jugadores en ese
            partido. El admin elige libremente; reparto recomendado:
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-amber-800 dark:text-amber-300">
            <li>Fase de grupos: 1 joker por jornada (3 en total)</li>
            <li>Dieciseisavos (round_of_32): 2</li>
            <li>Octavos (round_of_16): 2</li>
            <li>Cuartos: 1 · Semifinales: 1 · Final: 1</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="mb-6 border-rose-200 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/30">
        <CardContent className="space-y-3 py-4 text-sm text-rose-900 dark:text-rose-200">
          <div>
            <p className="font-semibold">
              ⛰️ Etapas de montaña: {montanaCount} partidos en {montanaStages}{" "}
              de 7 etapas
            </p>
            <p className="mt-1 text-rose-800 dark:text-rose-300">
              Cada etapa agrupa ~3 partidos que puntúan para la clasificación de
              la montaña (maillot de lunares). El auto-asignador es incremental:
              respeta las etapas ya puestas y solo añade las nuevas, excluyendo
              jókers, España, cuartos en adelante y partidos pasados. Un partido
              no puede ser jóker y etapa a la vez.
            </p>
          </div>
          <MontanaAutoAssign />
        </CardContent>
      </Card>

      {all.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No hay partidos cargados todavía.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(({ key, matches: dayMatches }) => (
            <Card key={key}>
              <CardHeader>
                <CardTitle className="text-base capitalize">
                  {dayLabel(key)}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {dayMatches.length} partido
                    {dayMatches.length === 1 ? "" : "s"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="pb-2 pr-3 font-semibold">Hora</th>
                      <th className="pb-2 pr-3 font-semibold">Partido</th>
                      <th className="pb-2 pr-3 text-center font-semibold">Marcador</th>
                      <th className="pb-2 pr-3 font-semibold">Estado</th>
                      <th className="pb-2 text-right font-semibold">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayMatches.map((m: Match) => (
                      <MatchRow
                        key={m.id}
                        match={m}
                        home={teamOr(teamMap, m.home_team)}
                        away={teamOr(teamMap, m.away_team)}
                        teams={teamList}
                        knockoutOptions={knockoutOptions}
                      />
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
