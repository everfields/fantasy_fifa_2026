import * as React from "react";
import Link from "next/link";

import type { Match, Prediction } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LocalKickoff } from "@/components/LocalKickoff";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface JokerItem {
  match: Match;
  homeName: string;
  awayName: string;
  prediction: Prediction | null;
}

const KICKOFF_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};

function MultiplierBadge({ multiplier }: { multiplier: number }) {
  return (
    <Badge className="shrink-0 border-amber-400/80 bg-amber-400/20 px-2 py-0 text-[11px] font-extrabold uppercase tracking-widest text-amber-700 dark:text-amber-300">
      ×{multiplier}
    </Badge>
  );
}

function PredictionPill({ prediction }: { prediction: Prediction | null }) {
  if (!prediction) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
        Sin pronóstico
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-primary/10 px-2 py-0.5 text-xs font-semibold text-foreground">
      <span className="text-muted-foreground font-normal">Tu pronóstico:</span>
      <span className="tabular-nums">
        {prediction.home_pred}–{prediction.away_pred}
      </span>
      {prediction.points_awarded !== null && (
        <Badge variant="default" className="ml-0.5 px-1.5 py-0 text-[10px]">
          +{prediction.points_awarded} pts
        </Badge>
      )}
    </span>
  );
}

function JokerRow({
  item,
  multiplier,
}: {
  item: JokerItem;
  multiplier: number;
}) {
  const { match, homeName, awayName, prediction } = item;
  const locked = new Date() >= new Date(match.locks_at);

  return (
    <Link
      href={`/match/${match.id}`}
      className={cn(
        "group flex flex-col gap-2 rounded-lg border border-border/60 bg-background px-4 py-3",
        "transition-all hover:border-amber-400/50 hover:bg-amber-400/5 hover:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      {/* Teams row */}
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="truncate text-sm font-semibold text-foreground">
            {homeName}
          </span>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            vs
          </span>
          <span className="truncate text-sm font-semibold text-foreground">
            {awayName}
          </span>
        </div>
        <MultiplierBadge multiplier={multiplier} />
      </div>

      {/* Meta row: kickoff + prediction */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {match.status === "finished" ? (
            <span className="font-medium uppercase tracking-wide text-muted-foreground/70">
              Finalizado ·{" "}
              {match.home_score !== null && match.away_score !== null
                ? `${match.home_score}–${match.away_score}`
                : ""}
            </span>
          ) : match.status === "live" ? (
            <span className="flex items-center gap-1 font-semibold text-destructive">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
              En juego
            </span>
          ) : (
            <LocalKickoff iso={match.kickoff_at} options={KICKOFF_FORMAT} />
          )}
        </span>
        <span className="text-muted-foreground/40">·</span>
        <PredictionPill prediction={locked ? prediction : prediction} />
      </div>
    </Link>
  );
}

export function JokerMatchesCard({
  items,
  multiplier,
}: {
  items: JokerItem[];
  multiplier: number;
}) {
  if (items.length === 0) return null;

  return (
    <Card className="overflow-hidden ring-1 ring-amber-400/40">
      {/* Header: amber gradient matching MatchCard joker header style */}
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b bg-gradient-to-r from-amber-400/15 via-amber-300/10 to-amber-400/15 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="text-lg leading-none"
            role="img"
            aria-label="estrella"
          >
            ★
          </span>
          <CardTitle className="text-sm font-bold uppercase tracking-widest text-amber-700 dark:text-amber-300">
            Partidos jóker
          </CardTitle>
        </div>
        <Badge className="shrink-0 border-amber-400/80 bg-amber-400/20 px-2.5 py-1 text-xs font-extrabold uppercase tracking-widest text-amber-700 dark:text-amber-300">
          ×{multiplier} en juego
        </Badge>
      </CardHeader>

      <CardContent className="flex flex-col gap-2.5 px-3 py-3">
        {items.map((item) => (
          <JokerRow key={item.match.id} item={item} multiplier={multiplier} />
        ))}
      </CardContent>
    </Card>
  );
}
