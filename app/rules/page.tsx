import type { ReactNode } from "react";

import { requireUser } from "@/lib/auth/guards";
import { formatDistribution } from "@/lib/scoring";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { AppShell } from "../_components/shell";
import { getAppSettings } from "../_lib/data";

export const metadata = { title: "Reglas · Resiporra 26" };
export const dynamic = "force-dynamic";

/**
 * "¿Cómo se puntúa?" — visual explainer of the scoring system. Every point
 * value is read from app_settings (never hardcoded) so the page always
 * matches whatever the admin configures.
 */
export default async function RulesPage() {
  const profile = await requireUser();
  const settings = await getAppSettings();
  const s = settings.scoring;
  // The goal-difference bonus is configurable; hide its card when disabled.
  const showDiff = s.diff_bonus_enabled;

  return (
    <AppShell profile={profile}>
      <div className="space-y-10">
        <header className="space-y-1">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            Las reglas del juego
          </p>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            ¿Cómo se puntúa?
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Pronosticas el marcador exacto de cada partido antes del pitido
            inicial. Cuanto más fino hiles, más puntos.
          </p>
        </header>

        {/* Per-match scoring, by example. */}
        <section className="space-y-4">
          <h2 className="text-xl font-black tracking-tight">
            Partido a partido
          </h2>
          <div
            className={`grid gap-4 sm:grid-cols-2 ${
              showDiff ? "lg:grid-cols-4" : "lg:grid-cols-3"
            }`}
          >
            <ExampleCard
              tone="emerald"
              label="Pleno"
              points={s.exact}
              pred="2 – 1"
              result="2 – 1"
              explain="Clavas el marcador exacto."
            />
            {showDiff && (
              <ExampleCard
                tone="sky"
                label="Signo + diferencia"
                points={s.sign + s.diff_bonus}
                pred="2 – 1"
                result="3 – 2"
                explain={`Aciertas quién gana (${s.sign}) y además la diferencia de goles (+${s.diff_bonus}).`}
              />
            )}
            <ExampleCard
              tone="amber"
              label="Signo"
              points={s.sign}
              pred="2 – 1"
              result="3 – 0"
              explain={
                showDiff
                  ? "Aciertas quién gana (1/X/2), pero no la diferencia."
                  : "Aciertas quién gana o el empate (1/X/2), aunque falles el marcador."
              }
            />
            <ExampleCard
              tone="zinc"
              label="Nada"
              points={0}
              pred="2 – 1"
              result="0 – 0"
              explain="Ni ganador ni empate acertado. A la próxima."
            />
          </div>
        </section>

        {/* Joker multiplier. */}
        <section>
          <Card className="border-amber-500/40 bg-amber-400/10">
            <CardContent className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center">
              <div className="text-5xl font-black tabular-nums text-amber-700 dark:text-amber-300">
                ×{s.joker_multiplier}
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-black tracking-tight">
                  Partidos jóker
                </h2>
                <p className="text-sm text-muted-foreground">
                  La organización marca algunos partidos como jóker. En ellos,
                  los puntos de <b>todos</b> se multiplican ×{s.joker_multiplier}:
                  un pleno pasa de {s.exact} a{" "}
                  <b className="text-foreground">
                    {s.exact * s.joker_multiplier} puntos
                  </b>
                  . Los verás señalados en tu panel y en la lista de partidos —
                  que no se te escape ninguno.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Other ways to score. */}
        <section className="space-y-4">
          <h2 className="text-xl font-black tracking-tight">
            Más puntos en juego
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <span aria-hidden>🏁</span> Meta volante
                  <PointsPill>
                    hasta +{settings.meta_volante_distribution[0] ?? 0}
                  </PointsPill>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                En cada ronda (cada jornada de grupos y cada eliminatoria) se
                reparten puntos extra según tu posición por puntos de
                pronósticos:{" "}
                <b className="text-foreground">
                  {formatDistribution(settings.meta_volante_distribution)}
                </b>
                . Empate: manda quien tenga más plenos en la ronda; si
                persiste, se reparte el premio de las posiciones empatadas.
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <span aria-hidden>🎁</span> Preguntas bonus
                  <PointsPill>hasta +{settings.bonus_default_points}</PointsPill>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Campeones de grupo ({settings.group_winner_points} pts cada
                uno), el primer goleador de España, el pichichi del torneo…
                Cada pregunta indica sus puntos y su fecha de cierre. Gratis no
                hay nada: hay que mojarse antes de que cierren.
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Golden rules. */}
        <section className="space-y-4">
          <h2 className="text-xl font-black tracking-tight">Reglas de oro</h2>
          <Card>
            <CardContent className="py-5">
              <ul className="space-y-3 text-sm">
                <GoldenRule icon="🔒">
                  Los pronósticos se cierran al <b>pitido inicial</b> de cada
                  partido. Sin prórrogas ni llorera: lo que no esté guardado, no
                  puntúa.
                </GoldenRule>
                <GoldenRule icon="🙈">
                  Los pronósticos de los demás son <b>secretos</b> hasta que el
                  partido arranca. Después, todos a la vista.
                </GoldenRule>
                <GoldenRule icon="⚖️">
                  Desempate en la clasificación: <b>puntos totales</b> → número
                  de <b>plenos</b> → puntos <b>bonus</b>.
                </GoldenRule>
                <GoldenRule icon="📡">
                  El AI-tracking system del míster lo ve todo y comparece a
                  diario. Quedas avisado.
                </GoldenRule>
              </ul>
            </CardContent>
          </Card>
        </section>
      </div>
    </AppShell>
  );
}

// ----------------------------------------------------------------------------
// Local presentational bits
// ----------------------------------------------------------------------------

const TONES = {
  emerald: {
    ring: "border-emerald-500/40",
    points: "text-emerald-600 dark:text-emerald-400",
  },
  sky: {
    ring: "border-sky-500/40",
    points: "text-sky-600 dark:text-sky-400",
  },
  amber: {
    ring: "border-amber-500/40",
    points: "text-amber-700 dark:text-amber-300",
  },
  zinc: {
    ring: "border-border",
    points: "text-muted-foreground",
  },
} as const;

function ExampleCard({
  tone,
  label,
  points,
  pred,
  result,
  explain,
}: {
  tone: keyof typeof TONES;
  label: string;
  points: number;
  pred: string;
  result: string;
  explain: string;
}) {
  const t = TONES[tone];
  return (
    <Card className={t.ring}>
      <CardContent className="space-y-3 py-5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-bold uppercase tracking-wide">
            {label}
          </span>
          <span
            className={`text-3xl font-black tabular-nums ${t.points}`}
          >
            +{points}
          </span>
        </div>
        <div className="space-y-1.5 rounded-lg bg-muted/50 p-3 font-mono text-sm tabular-nums">
          <div className="flex items-center justify-between">
            <span className="text-xs font-sans font-semibold uppercase tracking-wide text-muted-foreground">
              Tu pronóstico
            </span>
            <span className="font-bold">{pred}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-sans font-semibold uppercase tracking-wide text-muted-foreground">
              Resultado
            </span>
            <span className="font-bold">{result}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{explain}</p>
      </CardContent>
    </Card>
  );
}

function PointsPill({ children }: { children: ReactNode }) {
  return (
    <span className="ml-auto rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-bold tabular-nums text-primary">
      {children}
    </span>
  );
}

function GoldenRule({
  icon,
  children,
}: {
  icon: string;
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden className="text-base leading-6">
        {icon}
      </span>
      <span className="text-muted-foreground [&_b]:text-foreground">
        {children}
      </span>
    </li>
  );
}
