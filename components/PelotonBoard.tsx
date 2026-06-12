import * as React from "react";

import type { MaillotKey, PelotonGroup, PelotonGroupKey, StandingRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MaillotBadge } from "@/components/MaillotBadge";
import {
  AstonBadge,
  initials,
  RankBadge as SharedRankBadge,
} from "@/components/classifications";

/* ─── group metadata ──────────────────────────────────────────────────────── */

interface GroupMeta {
  label: string;
  icon: string;
  accentClass: string; // left-border + icon color
  subtitleClass: string;
}

const GROUP_META: Record<PelotonGroupKey, GroupMeta> = {
  fuga: {
    label: "La fuga",
    icon: "⚡",
    accentClass: "border-l-primary text-primary",
    subtitleClass: "text-primary/80",
  },
  cabeza: {
    label: "Grupo de cabeza",
    icon: "🚴",
    accentClass: "border-l-amber-500 text-amber-600 dark:text-amber-400",
    subtitleClass: "text-amber-600/80 dark:text-amber-400/70",
  },
  perseguidores: {
    label: "Perseguidores",
    icon: "🚴‍♂️",
    accentClass: "border-l-sky-500 text-sky-600 dark:text-sky-400",
    subtitleClass: "text-sky-600/80 dark:text-sky-400/70",
  },
  peloton: {
    label: "El pelotón",
    icon: "👥",
    accentClass: "border-l-muted-foreground text-muted-foreground",
    subtitleClass: "text-muted-foreground/70",
  },
  rezagados: {
    label: "Rezagados",
    icon: "🐢",
    accentClass: "border-l-destructive text-destructive",
    subtitleClass: "text-destructive/70",
  },
};

/* ─── helpers ────────────────────────────────────────────────────────────── */

function RankBadge({ rank }: { rank: number }) {
  return <SharedRankBadge rank={rank} accent="bg-amber-400/20 text-amber-600 dark:text-amber-400" />;
}

/* ─── group banner ───────────────────────────────────────────────────────── */

function GroupBanner({
  group,
  isOnly,
}: {
  group: PelotonGroup;
  isOnly: boolean;
}) {
  const meta = GROUP_META[group.key];
  const count = group.riders.length;

  const gapLabel =
    group.gapToLeader === 0
      ? "en cabeza de carrera"
      : `a ${group.gapToLeader} pts del líder`;

  const prevLabel =
    group.gapToPrev > 0 ? `+${group.gapToPrev} del grupo anterior` : null;

  // When there's only one "peloton" group, rename it
  const displayLabel =
    group.key === "peloton" && isOnly ? "pelotón agrupado" : meta.label;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-l-4 bg-muted/30 px-3 py-2",
        meta.accentClass
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base leading-none" aria-hidden>
          {meta.icon}
        </span>
        <div className="min-w-0">
          <span className="text-[13px] font-bold uppercase tracking-wider leading-none">
            {displayLabel}
          </span>
          {group.key === "rezagados" && (
            <span className={cn("ml-2 text-[11px] font-normal", meta.subtitleClass)}>
              en el pozo
            </span>
          )}
          <span className="ml-2 text-[11px] text-muted-foreground">
            {count} {count === 1 ? "corredor" : "corredores"}
          </span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className={cn("text-[11px] font-semibold tabular-nums", meta.subtitleClass)}>
          {gapLabel}
        </p>
        {prevLabel && (
          <p className="text-[10px] text-muted-foreground/60 tabular-nums">
            {prevLabel}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── rider row ──────────────────────────────────────────────────────────── */

function RiderRow({
  row,
  isCurrent,
  jerseys,
  aston,
}: {
  row: StandingRow;
  isCurrent: boolean;
  jerseys?: MaillotKey[];
  aston?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 sm:px-4",
        isCurrent && "bg-primary/5 ring-1 ring-inset ring-primary/30"
      )}
    >
      <RankBadge rank={row.rank} />
      <Avatar className="h-8 w-8 shrink-0">
        {row.avatar ? (
          <AvatarImage src={row.avatar} alt={row.display_name} />
        ) : null}
        <AvatarFallback className="text-xs">{initials(row.display_name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{row.display_name}</span>
          {isCurrent && (
            <Badge variant="success" className="shrink-0 px-1.5 py-0 text-[10px]">
              Tú
            </Badge>
          )}
          {jerseys && jerseys.length > 0 && (
            <span className="flex items-center gap-0.5">
              {jerseys.map((m) => (
                <MaillotBadge key={m} maillot={m} size="sm" />
              ))}
            </span>
          )}
          {aston && <AstonBadge size="sm" />}
        </div>
        {/* Phone subline */}
        <p className="text-[11px] tabular-nums text-muted-foreground sm:hidden">
          {row.exact_hits} exactos · {row.bonus_points} bonus
          {row.meta_points > 0 && (
            <span className="text-amber-600 dark:text-amber-400"> · ★ {row.meta_points}</span>
          )}
        </p>
      </div>
      <span className="hidden w-14 text-right text-sm tabular-nums text-muted-foreground sm:block">
        {row.exact_hits}
      </span>
      <span className="hidden w-14 text-right text-sm tabular-nums text-muted-foreground sm:block">
        {row.bonus_points}
      </span>
      <span
        className={cn(
          "hidden w-14 text-right text-sm tabular-nums sm:block",
          row.meta_points > 0
            ? "text-amber-600 dark:text-amber-400"
            : "text-muted-foreground/50"
        )}
      >
        {row.meta_points > 0 ? row.meta_points : "—"}
      </span>
      <span className="w-12 shrink-0 text-right text-base font-black tabular-nums sm:w-16">
        {row.total_points}
      </span>
    </li>
  );
}

/* ─── PelotonBoard ──────────────────────────────────────────────────────── */

/**
 * General cycling classification rendered as a race: each group of riders is
 * preceded by a colour-coded banner showing position, gap, and rider count.
 * Mobile-first; column headers visible on sm+.
 */
export function PelotonBoard({
  groups,
  maillots,
  astonUserIds,
  currentUserId,
}: {
  groups: PelotonGroup[];
  maillots: Record<string, MaillotKey[]>;
  /** Riders trailed by the Aston Martin safety car (see assignAstons). */
  astonUserIds?: string[];
  currentUserId?: string;
}) {
  if (groups.length === 0 || groups.every((g) => g.riders.length === 0)) {
    return (
      <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
        El pelotón aún no ha tomado la salida. ¡Que empiece el Mundial!
      </div>
    );
  }

  // Is there exactly one peloton group and no others (solo group edge-case)?
  const onlyPeloton =
    groups.length === 1 && groups[0].key === "peloton";

  const astons = new Set(astonUserIds ?? []);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* Road-stripe decorative header */}
      <div className="flex h-1.5 w-full overflow-hidden">
        <div className="flex-1 bg-amber-400" />
        <div className="flex-1 bg-green-500" />
        <div className="flex-1 bg-red-500" />
        <div className="flex-1 bg-sky-500" />
        <div className="flex-1 bg-primary" />
      </div>

      {/* Column headers — sm+ only */}
      <div className="hidden items-center gap-3 border-b bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:flex">
        <span className="w-7 text-center">#</span>
        <span className="flex-1">Corredor</span>
        <span className="w-14 text-right">Exactos</span>
        <span className="w-14 text-right">Bonus</span>
        <span className="w-14 text-right">★ Meta</span>
        <span className="w-16 text-right">Total</span>
      </div>

      {/* Groups */}
      <div className="divide-y divide-border">
        {groups.map((group, gi) => (
          <div key={group.key}>
            <GroupBanner group={group} isOnly={onlyPeloton} />
            <ol className="divide-y divide-border/60">
              {group.riders.map((row) => (
                <RiderRow
                  key={row.user_id}
                  row={row}
                  isCurrent={currentUserId === row.user_id}
                  jerseys={maillots[row.user_id]}
                  aston={astons.has(row.user_id)}
                />
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}
