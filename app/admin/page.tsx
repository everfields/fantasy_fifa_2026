import Link from "next/link";

import { createServiceClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/admin/PageHeader";

import { getAppSettingsAdmin } from "./_lib";

export const dynamic = "force-dynamic";

async function getOverview() {
  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();

  const [players, matchesTotal, matchesFinished, predTotal, predScored, openBonus] =
    await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("matches").select("*", { count: "exact", head: true }),
      supabase
        .from("matches")
        .select("*", { count: "exact", head: true })
        .eq("status", "finished"),
      supabase.from("predictions").select("*", { count: "exact", head: true }),
      supabase
        .from("predictions")
        .select("*", { count: "exact", head: true })
        .not("points_awarded", "is", null),
      supabase
        .from("bonus_questions")
        .select("*", { count: "exact", head: true })
        .gt("locks_at", nowIso),
    ]);

  return {
    players: players.count ?? 0,
    matchesTotal: matchesTotal.count ?? 0,
    matchesFinished: matchesFinished.count ?? 0,
    predTotal: predTotal.count ?? 0,
    predScored: predScored.count ?? 0,
    openBonus: openBonus.count ?? 0,
  };
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {label}
        </p>
        <p className="mt-1 font-mono text-3xl font-black tabular-nums text-zinc-900">
          {value}
        </p>
        {hint ? <p className="mt-1 text-xs text-zinc-400">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

const SHORTCUTS = [
  { href: "/admin/scoring", title: "Editar puntuación", body: "Reglas, jokers y multiplicadores." },
  { href: "/admin/matches", title: "Gestionar partidos", body: "Resultados, estados, locks y sync." },
  { href: "/admin/recalc", title: "Recalcular puntos", body: "Preview del impacto antes de aplicar." },
  { href: "/admin/users", title: "Jugadores", body: "Jokers, roles y baneos." },
];

export default async function AdminHomePage() {
  const [stats, settings] = await Promise.all([
    getOverview(),
    getAppSettingsAdmin(),
  ]);

  const pendingScore = stats.predTotal - stats.predScored;

  return (
    <div>
      <PageHeader
        eyebrow="Panel de control"
        title="Resumen"
        description="Estado actual de la porra y accesos rápidos a la gestión."
        action={
          settings.season_locked ? (
            <Badge variant="destructive">Temporada bloqueada</Badge>
          ) : (
            <Badge variant="secondary">Temporada abierta</Badge>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Jugadores" value={stats.players} />
        <Stat
          label="Partidos finalizados"
          value={`${stats.matchesFinished} / ${stats.matchesTotal}`}
        />
        <Stat label="Bonus abiertas" value={stats.openBonus} />
        <Stat label="Predicciones" value={stats.predTotal} />
        <Stat
          label="Predicciones puntuadas"
          value={stats.predScored}
          hint={pendingScore > 0 ? `${pendingScore} sin puntuar` : "todo al día"}
        />
        <Stat
          label="Bote actual"
          value={`${settings.pot_amount.toLocaleString("es-ES")} €`}
        />
      </div>

      <h2 className="mb-3 mt-10 text-sm font-bold uppercase tracking-wider text-zinc-500">
        Accesos rápidos
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {SHORTCUTS.map((s) => (
          <Link key={s.href} href={s.href} className="group">
            <Card className="h-full transition-all group-hover:border-primary group-hover:shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  {s.title}
                  <span
                    aria-hidden
                    className="text-zinc-300 transition-transform group-hover:translate-x-1 group-hover:text-primary"
                  >
                    →
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-zinc-500">{s.body}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
