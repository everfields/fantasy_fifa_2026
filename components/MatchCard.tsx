import * as React from "react";

import type { Match, Prediction, Team } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

const STAGE_LABELS: Record<Match["stage"], string> = {
  group: "Group Stage",
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarter: "Quarter-final",
  semi: "Semi-final",
  third_place: "Third place",
  final: "Final",
};

function formatKickoff(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function TeamColumn({
  team,
  align,
}: {
  team: Team;
  align: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2.5",
        align === "right" && "flex-row-reverse text-right"
      )}
    >
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-[10px] font-bold uppercase text-muted-foreground">
        {team.flag_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={team.flag_url}
            alt={`${team.name} flag`}
            className="h-full w-full object-cover"
          />
        ) : (
          team.code
        )}
      </span>
      <div className={cn("min-w-0", align === "right" && "items-end")}>
        <p className="truncate text-sm font-semibold leading-tight">
          {team.name}
        </p>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {team.code}
        </p>
      </div>
    </div>
  );
}

function StatusBadge({ match }: { match: Match }) {
  if (match.status === "live") {
    return (
      <Badge variant="live" className="gap-1.5">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
        Live
      </Badge>
    );
  }
  if (match.status === "finished") {
    return (
      <Badge variant="secondary" className="uppercase tracking-wide">
        Full time
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="font-medium text-muted-foreground">
      {formatKickoff(match.kickoff_at)}
    </Badge>
  );
}

function Centerpiece({ match }: { match: Match }) {
  const hasScore = match.home_score !== null && match.away_score !== null;
  if (hasScore) {
    return (
      <div className="flex shrink-0 items-center gap-2 px-3">
        <span className="text-2xl font-extrabold tabular-nums">
          {match.home_score}
        </span>
        <span className="text-lg font-bold text-muted-foreground">-</span>
        <span className="text-2xl font-extrabold tabular-nums">
          {match.away_score}
        </span>
      </div>
    );
  }
  return (
    <span className="shrink-0 px-3 text-sm font-bold uppercase tracking-widest text-muted-foreground">
      vs
    </span>
  );
}

export function MatchCard({
  match,
  homeTeam,
  awayTeam,
  prediction,
  locked,
  className,
  footer,
}: {
  match: Match;
  homeTeam: Team;
  awayTeam: Team;
  prediction?: Prediction | null;
  locked?: boolean;
  className?: string;
  footer?: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden transition-shadow hover:shadow-md",
        match.status === "live" && "ring-1 ring-destructive/40",
        className
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 border-b bg-muted/30 px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {STAGE_LABELS[match.stage]}
          {match.group ? ` · ${match.group}` : ""}
        </span>
        <StatusBadge match={match} />
      </CardHeader>

      <CardContent className="flex items-center justify-between gap-2 px-4 py-4">
        <TeamColumn team={homeTeam} align="left" />
        <Centerpiece match={match} />
        <TeamColumn team={awayTeam} align="right" />
      </CardContent>

      {prediction ? (
        <div className="flex items-center justify-center gap-2 border-t bg-primary/5 px-4 py-2 text-xs">
          <span className="font-medium uppercase tracking-wide text-muted-foreground">
            Your pick
          </span>
          <span className="font-bold tabular-nums text-foreground">
            {prediction.home_pred}–{prediction.away_pred}
          </span>
          {prediction.is_joker && (
            <Badge variant="success" className="px-1.5 py-0 text-[10px]">
              Joker x2
            </Badge>
          )}
          {prediction.points_awarded !== null && (
            <Badge variant="default" className="px-1.5 py-0 text-[10px]">
              +{prediction.points_awarded} pts
            </Badge>
          )}
        </div>
      ) : locked ? (
        <div className="border-t bg-muted/40 px-4 py-2 text-center text-xs font-medium text-muted-foreground">
          No prediction submitted
        </div>
      ) : null}

      {footer ? (
        <CardFooter className="border-t px-4 py-3">{footer}</CardFooter>
      ) : null}
    </Card>
  );
}
