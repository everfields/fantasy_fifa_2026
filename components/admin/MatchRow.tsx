"use client";

import { useState } from "react";
import { useFormState } from "react-dom";

import type { Match, MatchStatus, Stage, Team } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { SubmitButton } from "./SubmitButton";
import {
  saveJoker,
  saveLocksAt,
  saveResult,
  saveSources,
  saveTeams,
  syncNow,
  type MatchActionState,
} from "@/app/admin/matches/actions";
import { setMontanaStage } from "@/app/admin/matches/montana-actions";

/** Etapas the admin picks from the per-match selector (target: 1..7). */
const MONTANA_STAGES = [1, 2, 3, 4, 5, 6, 7] as const;

const initial: MatchActionState = { ok: false, message: "" };

/** Terse stage labels for the bracket-source picker. */
const SHORT_STAGE: Record<Stage, string> = {
  group: "Grupos",
  round_of_32: "R32",
  round_of_16: "R16",
  quarter: "QF",
  semi: "SF",
  third_place: "3º",
  final: "Final",
};

/**
 * Lean knockout-match descriptor for the "Cruce" source picker. Built server-
 * side in the admin matches page (team names already resolved, «Por definir»
 * when a slot is still empty).
 */
export type KnockoutOption = {
  id: string;
  stage: Stage;
  kickoff_at: string;
  home: string;
  away: string;
};

function sourceLabel(o: KnockoutOption): string {
  const when = new Date(o.kickoff_at).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${SHORT_STAGE[o.stage]} · ${when} — ${o.home} vs ${o.away}`;
}

const STATUS_META: Record<MatchStatus, { label: string; variant: "secondary" | "default" | "outline" }> = {
  scheduled: { label: "Programado", variant: "outline" },
  live: { label: "En vivo", variant: "default" },
  finished: { label: "Finalizado", variant: "secondary" },
};

function score(m: Match): string {
  if (m.home_score === null || m.away_score === null) return "–";
  return `${m.home_score} - ${m.away_score}`;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function MatchRow({
  match,
  home,
  away,
  teams,
  knockoutOptions,
}: {
  match: Match;
  home: Team;
  away: Team;
  teams: Team[];
  knockoutOptions: KnockoutOption[];
}) {
  const meta = STATUS_META[match.status];

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3 pr-3 text-sm text-muted-foreground">
        {new Date(match.kickoff_at).toLocaleString("es-ES", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </td>
      <td className="py-3 pr-3">
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <span>{home.code}</span>
          <span className="font-mono tabular-nums text-muted-foreground">vs</span>
          <span>{away.code}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {home.name} – {away.name}
        </p>
      </td>
      <td className="py-3 pr-3 text-center font-mono text-sm font-bold tabular-nums">
        {score(match)}
      </td>
      <td className="py-3 pr-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={meta.variant}>{meta.label}</Badge>
          {match.is_joker ? (
            <Badge className="bg-amber-500 hover:bg-amber-500">★ Joker</Badge>
          ) : null}
          {match.montana_stage !== null ? (
            <Badge className="bg-rose-500 hover:bg-rose-500">
              ⛰️ Etapa {match.montana_stage}
            </Badge>
          ) : null}
        </div>
      </td>
      <td className="py-3 text-right">
        <EditDialog
          match={match}
          home={home}
          away={away}
          teams={teams}
          knockoutOptions={knockoutOptions}
        />
      </td>
    </tr>
  );
}

function EditDialog({
  match,
  home,
  away,
  teams,
  knockoutOptions,
}: {
  match: Match;
  home: Team;
  away: Team;
  teams: Team[];
  knockoutOptions: KnockoutOption[];
}) {
  const [resState, resAction] = useFormState(saveResult, initial);
  const [lockState, lockAction] = useFormState(saveLocksAt, initial);
  const [jokerState, jokerAction] = useFormState(saveJoker, initial);
  const [montanaState, montanaAction] = useFormState(setMontanaStage, initial);
  const [syncState, syncAction] = useFormState(syncNow, initial);
  const [teamsState, teamsAction] = useFormState(saveTeams, initial);
  const [sourcesState, sourcesAction] = useFormState(saveSources, initial);

  // Track the score inputs so the penalty-winner selector only shows when the
  // knockout match is level (a shootout only exists on a tie).
  const [homeScore, setHomeScore] = useState<string>(
    String(match.home_score ?? 0),
  );
  const [awayScore, setAwayScore] = useState<string>(
    String(match.away_score ?? 0),
  );
  const isKnockout = match.stage !== "group";
  const level =
    homeScore !== "" &&
    awayScore !== "" &&
    Number(homeScore) === Number(awayScore);
  const candidates = knockoutOptions.filter((o) => o.id !== match.id);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {home.code} vs {away.code}
          </DialogTitle>
          <DialogDescription>
            {home.name} – {away.name}. Sobrescribe el resultado, fuerza el
            estado o mueve el bloqueo.
          </DialogDescription>
        </DialogHeader>

        {/* Knockout team assignment — seeded knockout rows start with no teams. */}
        {match.stage !== "group" ? (
          <form
            action={teamsAction}
            className="space-y-3 border-b border-border pb-5"
          >
            <input type="hidden" name="match_id" value={match.id} />
            <Label>Equipos del cruce</Label>
            <div className="flex items-center gap-2">
              <TeamSelect
                name="home_team"
                current={match.home_team}
                teams={teams}
              />
              <span className="font-mono text-muted-foreground">vs</span>
              <TeamSelect
                name="away_team"
                current={match.away_team}
                teams={teams}
              />
              <SubmitButton size="sm" variant="outline">
                Asignar
              </SubmitButton>
            </div>
            {teamsState.message ? <Message state={teamsState} /> : null}
          </form>
        ) : null}

        {/* Bracket source (cruce) — which earlier match's outcome fills each slot */}
        {isKnockout ? (
          <form
            action={sourcesAction}
            className="space-y-3 border-b border-border pb-5"
          >
            <input type="hidden" name="match_id" value={match.id} />
            <Label>Cruce (origen de los equipos)</Label>
            <div className="space-y-2">
              <SourceSlot
                side="Local"
                sourceName="home_source"
                kindName="home_source_kind"
                currentSource={match.home_source}
                currentKind={match.home_source_kind}
                options={candidates}
              />
              <SourceSlot
                side="Visitante"
                sourceName="away_source"
                kindName="away_source_kind"
                currentSource={match.away_source}
                currentKind={match.away_source_kind}
                options={candidates}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Al finalizar el partido de origen, el equipo se rellena
              automáticamente (ganador, o perdedor para el 3º puesto).
            </p>
            <SubmitButton size="sm" variant="outline">
              Guardar cruce
            </SubmitButton>
            {sourcesState.message ? <Message state={sourcesState} /> : null}
          </form>
        ) : null}

        {/* Result + status */}
        <form action={resAction} className="space-y-4 border-b border-border pb-5">
          <input type="hidden" name="match_id" value={match.id} />
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`home-${match.id}`}>{home.code}</Label>
              <Input
                id={`home-${match.id}`}
                name="home_score"
                type="number"
                min={0}
                value={homeScore}
                onChange={(e) => setHomeScore(e.target.value)}
                className="w-20 text-center font-mono"
              />
            </div>
            <span className="pb-2 font-mono text-muted-foreground">-</span>
            <div className="space-y-1.5">
              <Label htmlFor={`away-${match.id}`}>{away.code}</Label>
              <Input
                id={`away-${match.id}`}
                name="away_score"
                type="number"
                min={0}
                value={awayScore}
                onChange={(e) => setAwayScore(e.target.value)}
                className="w-20 text-center font-mono"
              />
            </div>
            <div className="ml-auto space-y-1.5">
              <Label htmlFor={`status-${match.id}`}>Estado</Label>
              <select
                id={`status-${match.id}`}
                name="status"
                defaultValue={match.status}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="scheduled">Programado</option>
                <option value="live">En vivo</option>
                <option value="finished">Finalizado</option>
              </select>
            </div>
          </div>
          {/* Shootout winner: only for a level knockout match; otherwise submit
              null so a previously-recorded winner is cleared. */}
          {isKnockout && level ? (
            <div className="space-y-1.5">
              <Label htmlFor={`pen-${match.id}`}>Ganador en penaltis</Label>
              <select
                id={`pen-${match.id}`}
                name="penalty_winner"
                defaultValue={match.penalty_winner ?? ""}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Sin definir</option>
                {match.home_team ? (
                  <option value={match.home_team}>{home.name}</option>
                ) : null}
                {match.away_team ? (
                  <option value={match.away_team}>{away.name}</option>
                ) : null}
              </select>
            </div>
          ) : (
            <input type="hidden" name="penalty_winner" value="" />
          )}
          {resState.message ? (
            <Message state={resState} />
          ) : null}
          <SubmitButton size="sm">Guardar resultado</SubmitButton>
        </form>

        {/* Lock time */}
        <form action={lockAction} className="space-y-3 border-b border-border pb-5">
          <input type="hidden" name="match_id" value={match.id} />
          <Label htmlFor={`locks-${match.id}`}>Hora de bloqueo / kickoff</Label>
          <div className="flex items-center gap-2">
            <Input
              id={`locks-${match.id}`}
              name="locks_at"
              type="datetime-local"
              defaultValue={toLocalInput(match.locks_at)}
            />
            <SubmitButton size="sm" variant="outline">
              Mover
            </SubmitButton>
          </div>
          {lockState.message ? <Message state={lockState} /> : null}
        </form>

        {/* Joker toggle */}
        <form action={jokerAction} className="space-y-3 border-b border-border pb-5">
          <input type="hidden" name="match_id" value={match.id} />
          {/* Post the TARGET state: when currently joker, the button removes it. */}
          <input type="hidden" name="is_joker" value={match.is_joker ? "false" : "true"} />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Partido joker{" "}
                {match.is_joker ? (
                  <Badge className="ml-1 bg-amber-500 hover:bg-amber-500">★ Activo</Badge>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground">
                Multiplica los puntos de TODOS los jugadores en este partido por el
                multiplicador de joker.
              </p>
            </div>
            <SubmitButton
              size="sm"
              variant={match.is_joker ? "outline" : "secondary"}
            >
              {match.is_joker ? "Quitar joker" : "Marcar joker"}
            </SubmitButton>
          </div>
          {jokerState.message ? <Message state={jokerState} /> : null}
        </form>

        {/* Montaña etapa (maillot de lunares) */}
        <form
          action={montanaAction}
          className="space-y-3 border-b border-border pb-5"
        >
          <input type="hidden" name="match_id" value={match.id} />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Etapa de montaña{" "}
                {match.montana_stage !== null ? (
                  <Badge className="ml-1 bg-rose-500 hover:bg-rose-500">
                    ⛰️ Etapa {match.montana_stage}
                  </Badge>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground">
                Cuenta para la clasificación de la montaña (maillot de lunares).
                Incompatible con jóker.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                name="stage"
                defaultValue={match.montana_stage ?? ""}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                aria-label="Etapa de montaña"
              >
                <option value="">Sin etapa</option>
                {MONTANA_STAGES.map((s) => (
                  <option key={s} value={s}>
                    Etapa {s}
                  </option>
                ))}
              </select>
              <SubmitButton size="sm" variant="outline">
                Guardar
              </SubmitButton>
            </div>
          </div>
          {montanaState.message ? <Message state={montanaState} /> : null}
        </form>

        {/* Sync now */}
        <form action={syncAction} className="space-y-3">
          <input type="hidden" name="match_id" value={match.id} />
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Forzar sincronización desde el proveedor de datos.
            </p>
            <SubmitButton
              size="sm"
              variant="secondary"
              pendingLabel="Sincronizando…"
            >
              Sync ahora
            </SubmitButton>
          </div>
          {syncState.message ? <Message state={syncState} /> : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TeamSelect({
  name,
  current,
  teams,
}: {
  name: string;
  current: string | null;
  teams: Team[];
}) {
  return (
    <select
      name={name}
      defaultValue={current ?? ""}
      className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
    >
      <option value="">Por definir</option>
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.code} — {t.name}
        </option>
      ))}
    </select>
  );
}

function SourceSlot({
  side,
  sourceName,
  kindName,
  currentSource,
  currentKind,
  options,
}: {
  side: string;
  sourceName: string;
  kindName: string;
  currentSource: string | null;
  currentKind: "winner" | "loser";
  options: KnockoutOption[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{side}</span>
      <select
        name={kindName}
        defaultValue={currentKind}
        className="h-9 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
        aria-label={`${side}: ganador o perdedor`}
      >
        <option value="winner">Ganador de</option>
        <option value="loser">Perdedor de</option>
      </select>
      <select
        name={sourceName}
        defaultValue={currentSource ?? ""}
        className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
        aria-label={`${side}: partido de origen`}
      >
        <option value="">Sin origen</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {sourceLabel(o)}
          </option>
        ))}
      </select>
    </div>
  );
}

function Message({ state }: { state: MatchActionState }) {
  return (
    <p
      className={
        state.ok
          ? "text-xs font-medium text-primary"
          : "text-xs font-medium text-destructive"
      }
    >
      {state.message}
    </p>
  );
}
