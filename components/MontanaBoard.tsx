import * as React from "react";

import type { MatchStatus, MontanaRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  BoardHeader,
  initials,
  RankBadge as SharedRankBadge,
} from "@/components/classifications";

/* ─── types ──────────────────────────────────────────────────────────────── */

export interface MontanaEtapaView {
  stage: number;
  finished: boolean;
  matches: {
    id: string;
    label: string;
    kickoff_at: string;
    status: MatchStatus;
    score: string | null;
  }[];
}

/* ─── helpers ────────────────────────────────────────────────────────────── */


function formatKickoff(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Madrid",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function etapaStatus(etapa: MontanaEtapaView): "disputada" | "en juego" | "por disputar" {
  if (etapa.finished) return "disputada";
  const anyLive = etapa.matches.some((m) => m.status === "live");
  if (anyLive) return "en juego";
  return "por disputar";
}

function MatchStatusBadge({ status }: { status: "disputada" | "en juego" | "por disputar" }) {
  if (status === "disputada") {
    return (
      <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
        disputada
      </Badge>
    );
  }
  if (status === "en juego") {
    return (
      <Badge variant="live" className="shrink-0 px-1.5 py-0 text-[10px]">
        en juego
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] text-muted-foreground">
      por disputar
    </Badge>
  );
}

/* ─── rank badge (reused pattern) ──────────────────────────────────────── */

function RankBadge({ rank }: { rank: number }) {
  return <SharedRankBadge rank={rank} accent="bg-red-500/20 text-red-600 dark:text-red-400" />;
}

/* ─── MontanaBoard ───────────────────────────────────────────────────────── */

/**
 * Two-part component:
 *   (a) Clasificación de la montaña — rider table, polka-dot themed.
 *   (b) Las etapas — stage cards with match listings.
 */
export function MontanaBoard({
  rows,
  etapas,
  currentUserId,
}: {
  rows: MontanaRow[];
  etapas: MontanaEtapaView[];
  currentUserId?: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* ── (a) Classification table ─────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <BoardHeader
          maillot="lunares"
          title="Rey de la montaña"
          accentClass="text-red-600 dark:text-red-400"
        />

        {rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            El pelotón aún no ha llegado a la montaña — etapas por anunciar.
          </div>
        ) : (
          <>
            {/* Column headers — sm+ */}
            <div className="hidden items-center gap-3 border-b bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:flex">
              <span className="w-7 text-center">#</span>
              <span className="flex-1">Corredor</span>
              <span className="w-16 text-right">Exactos</span>
              <span className="w-16 text-right">Pts</span>
            </div>
            <ol className="divide-y divide-border">
              {rows.map((row) => {
                const isCurrent = currentUserId === row.user_id;
                return (
                  <li
                    key={row.user_id}
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
                      <AvatarFallback className="text-xs">
                        {initials(row.display_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">
                          {row.display_name}
                        </span>
                        {isCurrent && (
                          <Badge variant="success" className="shrink-0 px-1.5 py-0 text-[10px]">
                            Tú
                          </Badge>
                        )}
                      </div>
                      {/* Phone subline */}
                      <p className="text-[11px] tabular-nums text-muted-foreground sm:hidden">
                        {row.exact_hits} exactos
                      </p>
                    </div>
                    <span className="hidden w-16 text-right text-sm tabular-nums text-muted-foreground sm:block">
                      {row.exact_hits}
                    </span>
                    <span className="w-12 shrink-0 text-right text-base font-black tabular-nums sm:w-16">
                      {row.points}
                    </span>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>

      {/* ── (b) Etapas ───────────────────────────────────────────────────── */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          <span>⛰️</span>
          <span>Las etapas</span>
        </h3>

        {etapas.length === 0 ? (
          <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
            El pelotón aún no ha llegado a la montaña — etapas por anunciar.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {etapas.map((etapa) => {
              const status = etapaStatus(etapa);
              return (
                <div
                  key={etapa.stage}
                  className={cn(
                    "overflow-hidden rounded-xl border bg-card",
                    status === "en juego" && "ring-1 ring-destructive/40"
                  )}
                >
                  {/* Stage header */}
                  <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm" aria-hidden>⛰️</span>
                      <span className="text-[13px] font-bold">
                        Etapa {etapa.stage}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        · {etapa.matches.length}{" "}
                        {etapa.matches.length === 1 ? "partido" : "partidos"}
                      </span>
                    </div>
                    <MatchStatusBadge status={status} />
                  </div>

                  {/* Match list */}
                  <ul className="divide-y divide-border/60">
                    {etapa.matches.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between gap-3 px-4 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="truncate text-sm">{m.label}</span>
                          <p className="text-[11px] text-muted-foreground">
                            {formatKickoff(m.kickoff_at)}
                          </p>
                        </div>
                        {m.score ? (
                          <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-sm font-bold tabular-nums">
                            {m.score}
                          </span>
                        ) : (
                          <span className="shrink-0 text-sm text-muted-foreground/50">
                            —
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
