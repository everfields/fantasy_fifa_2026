import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { TrackerReport } from "@/lib/types";
import { TRACKER_TAGLINE, TRACKER_TITLE } from "@/lib/tracker/brand";
import { Card, CardContent } from "@/components/ui/card";
import { LuisReportCard } from "@/components/LuisTracker";

import { AppShell } from "../_components/shell";

export const metadata = { title: "Luis de la Tracker · Mundial 26" };
export const dynamic = "force-dynamic";

function reportDayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export default async function TrackerPage() {
  const profile = await requireUser();
  const supabase = createClient();

  const { data } = await supabase
    .from("tracker_reports")
    .select("*")
    .order("report_date", { ascending: false })
    .limit(60);

  const reports = (data as TrackerReport[] | null) ?? [];
  const latest = reports[0] ?? null;
  const older = reports.slice(1);

  return (
    <AppShell profile={profile}>
      <div className="space-y-8">
        <header className="space-y-1">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            {TRACKER_TAGLINE}
          </p>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            {TRACKER_TITLE}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            El míster repasa cada día la estrategia de la porra: aciertos, batacazos
            y las quinielas que no le convencen. Sin pelos en la lengua.
          </p>
        </header>

        {!latest ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              El míster todavía no ha comparecido. Cuando se jueguen los primeros
              partidos, aquí tendrás su parte. Paciencia.
            </CardContent>
          </Card>
        ) : (
          <>
            <LuisReportCard report={latest} />

            {older.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-xl font-black tracking-tight">Partes anteriores</h2>
                <div className="space-y-2">
                  {older.map((r) => (
                    <details
                      key={r.id}
                      className="group rounded-xl border border-border bg-card"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <span className="capitalize">{reportDayLabel(r.report_date)}</span>
                          </p>
                          <p className="truncate font-bold italic">“{r.headline}”</p>
                        </div>
                        <span className="shrink-0 text-primary transition-transform group-open:rotate-90">
                          ›
                        </span>
                      </summary>
                      <ol className="space-y-3 border-t border-border p-4">
                        {r.findings.map((f, i) => (
                          <li key={i} className="flex gap-3">
                            <span className="text-sm font-black text-primary">{i + 1}.</span>
                            <div className="space-y-0.5">
                              <h3 className="text-sm font-bold tracking-tight">{f.title}</h3>
                              <p className="text-sm text-muted-foreground">{f.body}</p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </details>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
