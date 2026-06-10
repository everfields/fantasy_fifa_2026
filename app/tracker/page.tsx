import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { TrackerReport } from "@/lib/types";
import { TRACKER_TAGLINE, TRACKER_TITLE } from "@/lib/tracker/brand";
import { Card, CardContent } from "@/components/ui/card";
import { LuisReportCard } from "@/components/LuisTracker";

import { AppShell } from "../_components/shell";

export const metadata = { title: "Luis de la Tracker · Resiporra 26" };
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
      <div className="space-y-5 sm:space-y-8">
        {/* The report card is the page hero (it already carries title + tagline);
            a separate page header would just duplicate it — especially on mobile. */}
        {!latest ? (
          <>
            <header className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary sm:text-sm">
                {TRACKER_TAGLINE}
              </p>
              <h1 className="text-2xl font-black tracking-tight sm:text-4xl">
                {TRACKER_TITLE}
              </h1>
            </header>
            <Card>
              <CardContent className="px-6 py-16 text-center text-muted-foreground">
                El míster todavía no ha comparecido. Cuando se jueguen los primeros
                partidos, aquí tendrás su parte: aciertos, batacazos y las quinielas
                que no le convencen. Paciencia.
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <LuisReportCard report={latest} />

            {older.length > 0 && (
              <section className="space-y-3">
                <h2 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Partes anteriores
                </h2>
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
