// ============================================================================
// "Luis de la Tracker" — player-facing report UI.
//
// Server component. Renders a persisted TrackerReport as a "rueda de prensa":
// the míster's photo, his cocky headline, and the 5 key findings. Two surfaces:
//   - <LuisReportCard>      full report (the /tracker page) — big press photo
//   - <LuisDashboardTeaser> compact card linking to /tracker (the dashboard)
// ============================================================================

import Link from "next/link";

import type { TrackerReport } from "@/lib/types";
import {
  LUIS_PHOTO_CREDIT,
  LUIS_PHOTO_URL,
  TRACKER_TAGLINE,
  TRACKER_TITLE,
} from "@/lib/tracker/brand";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

/** "2026-06-09" → "lunes, 9 de junio" (UTC, es-ES). */
function reportDayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/**
 * The míster's real photo. `className` controls size/shape (twMerge overrides
 * the Avatar's default circle) — circular for the teaser, a framed rectangular
 * "press photo" for the full report. AvatarImage is a plain <img> serving the
 * self-hosted photo from public/; it falls back to "LF" if it ever fails to load.
 */
function LuisPortrait({ className }: { className?: string }) {
  return (
    <Avatar className={className}>
      <AvatarImage src={LUIS_PHOTO_URL} alt="Luis de la Fuente" />
      <AvatarFallback className="bg-foreground text-background">LF</AvatarFallback>
    </Avatar>
  );
}

/** Title + badge + tagline + date — the text block next to the photo. */
function TitleBlock({
  report,
  compact,
}: {
  report: TrackerReport;
  compact?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className={compact ? "text-lg font-black tracking-tight" : "text-xl font-black tracking-tight sm:text-2xl"}>
          {TRACKER_TITLE}
        </h2>
        {report.status === "analysis_only" && (
          <Badge variant="live">El míster calienta</Badge>
        )}
      </div>
      <p className="text-xs font-semibold uppercase tracking-widest text-primary sm:text-sm">
        {TRACKER_TAGLINE}
      </p>
      <p className="truncate text-xs capitalize text-muted-foreground">
        {reportDayLabel(report.report_date)}
      </p>
    </div>
  );
}

/** Full report — the /tracker page hero, fronted by a big press photo. */
export function LuisReportCard({ report }: { report: TrackerReport }) {
  return (
    <Card className="overflow-hidden border-primary/30">
      <div className="bg-gradient-to-br from-foreground/[0.04] to-primary/[0.06] p-4 sm:p-6">
        <div className="space-y-4">
          {/* Compact header row everywhere: small press photo + title. */}
          <div className="flex items-center gap-3 sm:gap-5">
            <LuisPortrait className="h-16 w-14 shrink-0 rounded-xl shadow-md ring-2 ring-primary/40 sm:h-28 sm:w-24 sm:rounded-2xl" />
            <TitleBlock report={report} />
          </div>
          <blockquote className="border-l-4 border-primary pl-3 text-lg font-bold italic leading-snug tracking-tight sm:pl-4 sm:text-2xl">
            “{report.headline}”
          </blockquote>
          {report.analysis?.headlineStats?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {report.analysis.headlineStats.map((s) => (
                <span
                  key={s.label}
                  className="rounded-full bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground ring-1 ring-border sm:px-3 sm:text-xs"
                >
                  <span className="font-semibold text-foreground">{s.label}:</span> {s.value}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <CardContent className="space-y-4 p-4 sm:p-6">
        <ol className="space-y-4">
          {report.findings.map((f, i) => (
            <li key={i} className="flex gap-3 sm:gap-4">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-sm font-black text-primary sm:h-8 sm:w-8">
                {i + 1}
              </span>
              <div className="space-y-1">
                <h3 className="font-black tracking-tight">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="pt-2 text-[11px] text-muted-foreground/70">{LUIS_PHOTO_CREDIT}</p>
      </CardContent>
    </Card>
  );
}

/** Compact dashboard card — headline + first findings, links to /tracker. */
export function LuisDashboardTeaser({ report }: { report: TrackerReport }) {
  return (
    <Link href="/tracker" className="group block">
      <Card className="h-full overflow-hidden border-primary/30 transition-all group-hover:-translate-y-0.5 group-hover:shadow-md">
        <div className="bg-gradient-to-br from-foreground/[0.04] to-primary/[0.06] p-5">
          <div className="flex items-center gap-4">
            <LuisPortrait className="h-12 w-12 ring-2 ring-primary/30" />
            <TitleBlock report={report} compact />
          </div>
        </div>
        <CardContent className="space-y-3 p-5">
          <p className="line-clamp-3 text-base font-bold italic leading-snug">
            “{report.headline}”
          </p>
          <ul className="space-y-1.5">
            {report.findings.slice(0, 3).map((f, i) => (
              <li key={i} className="flex items-baseline gap-2 text-sm">
                <span className="font-black text-primary">{i + 1}.</span>
                <span className="font-semibold tracking-tight">{f.title}</span>
              </li>
            ))}
          </ul>
          <span className="inline-flex items-center text-sm font-semibold text-primary">
            Leer el parte completo
            <span className="transition-transform group-hover:translate-x-1">&nbsp;→</span>
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
