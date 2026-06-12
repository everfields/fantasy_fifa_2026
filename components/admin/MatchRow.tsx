"use client";

import { useFormState } from "react-dom";

import type { Match, MatchStatus, Team } from "@/lib/types";
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
  saveTeams,
  syncNow,
  type MatchActionState,
} from "@/app/admin/matches/actions";
import { setMontanaStage } from "@/app/admin/matches/montana-actions";

/** Etapas the admin picks from the per-match selector (target: 1..7). */
const MONTANA_STAGES = [1, 2, 3, 4, 5, 6, 7] as const;

const initial: MatchActionState = { ok: false, message: "" };

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
}: {
  match: Match;
  home: Team;
  away: Team;
  teams: Team[];
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
        <EditDialog match={match} home={home} away={away} teams={teams} />
      </td>
    </tr>
  );
}

function EditDialog({
  match,
  home,
  away,
  teams,
}: {
  match: Match;
  home: Team;
  away: Team;
  teams: Team[];
}) {
  const [resState, resAction] = useFormState(saveResult, initial);
  const [lockState, lockAction] = useFormState(saveLocksAt, initial);
  const [jokerState, jokerAction] = useFormState(saveJoker, initial);
  const [montanaState, montanaAction] = useFormState(setMontanaStage, initial);
  const [syncState, syncAction] = useFormState(syncNow, initial);
  const [teamsState, teamsAction] = useFormState(saveTeams, initial);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
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
                defaultValue={match.home_score ?? 0}
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
                defaultValue={match.away_score ?? 0}
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
