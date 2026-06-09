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
  syncNow,
  type MatchActionState,
} from "@/app/admin/matches/actions";

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
}: {
  match: Match;
  home: Team;
  away: Team;
}) {
  const meta = STATUS_META[match.status];

  return (
    <tr className="border-b border-zinc-100 last:border-0">
      <td className="py-3 pr-3 text-sm text-zinc-500">
        {new Date(match.kickoff_at).toLocaleString("es-ES", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </td>
      <td className="py-3 pr-3">
        <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-900">
          <span>{home.code}</span>
          <span className="font-mono tabular-nums text-zinc-400">vs</span>
          <span>{away.code}</span>
        </div>
        <p className="text-xs text-zinc-400">
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
        </div>
      </td>
      <td className="py-3 text-right">
        <EditDialog match={match} home={home} away={away} />
      </td>
    </tr>
  );
}

function EditDialog({
  match,
  home,
  away,
}: {
  match: Match;
  home: Team;
  away: Team;
}) {
  const [resState, resAction] = useFormState(saveResult, initial);
  const [lockState, lockAction] = useFormState(saveLocksAt, initial);
  const [jokerState, jokerAction] = useFormState(saveJoker, initial);
  const [syncState, syncAction] = useFormState(syncNow, initial);

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

        {/* Result + status */}
        <form action={resAction} className="space-y-4 border-b border-zinc-100 pb-5">
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
            <span className="pb-2 font-mono text-zinc-400">-</span>
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
        <form action={lockAction} className="space-y-3 border-b border-zinc-100 pb-5">
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
        <form action={jokerAction} className="space-y-3 border-b border-zinc-100 pb-5">
          <input type="hidden" name="match_id" value={match.id} />
          {/* Post the TARGET state: when currently joker, the button removes it. */}
          <input type="hidden" name="is_joker" value={match.is_joker ? "false" : "true"} />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900">
                Partido joker{" "}
                {match.is_joker ? (
                  <Badge className="ml-1 bg-amber-500 hover:bg-amber-500">★ Activo</Badge>
                ) : null}
              </p>
              <p className="text-xs text-zinc-500">
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

        {/* Sync now */}
        <form action={syncAction} className="space-y-3">
          <input type="hidden" name="match_id" value={match.id} />
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-zinc-500">
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
