"use client";

import { useFormState } from "react-dom";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { SubmitButton } from "./SubmitButton";
import {
  setPaid,
  setPotAmount,
  type PotActionState,
} from "@/app/admin/pot/actions";

const initial: PotActionState = { ok: false, message: "" };

export interface PotPlayer {
  id: string;
  display_name: string;
  avatar: string | null;
  paid: boolean;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const eur = (n: number) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });

/** Default suggested payout split: 60% / 30% / 10% to the top three. */
const SPLIT = [0.6, 0.3, 0.1];

export function PotManager({
  potAmount,
  players,
  topThree,
}: {
  potAmount: number;
  players: PotPlayer[];
  topThree: { display_name: string; rank: number }[];
}) {
  const [potState, potAction] = useFormState(setPotAmount, initial);

  const paidCount = players.filter((p) => p.paid).length;
  const collected = players.length
    ? (potAmount / players.length) * paidCount
    : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Bote total</CardTitle>
            <CardDescription>
              Importe global del bote del grupo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={potAction} className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="pot_amount">Importe (€)</Label>
                <Input
                  id="pot_amount"
                  name="pot_amount"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={potAmount}
                />
              </div>
              <SubmitButton>Guardar</SubmitButton>
            </form>
            {potState.message ? (
              <p
                className={
                  potState.ok
                    ? "mt-2 text-xs font-medium text-primary"
                    : "mt-2 text-xs font-medium text-destructive"
                }
              >
                {potState.message}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reparto sugerido</CardTitle>
            <CardDescription>60 % / 30 % / 10 % al pódium actual.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {SPLIT.map((pct, i) => {
              const player = topThree[i];
              return (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <Badge variant={i === 0 ? "default" : "secondary"}>
                      {i + 1}º
                    </Badge>
                    <span className="font-medium text-secondary-foreground">
                      {player?.display_name ?? "—"}
                    </span>
                  </span>
                  <span className="font-mono text-sm font-bold tabular-nums">
                    {eur(potAmount * pct)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({Math.round(pct * 100)} %)
                    </span>
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Pagos
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {paidCount} / {players.length} pagados · recaudado ≈ {eur(collected)}
            </span>
          </CardTitle>
          <CardDescription>
            Marca quién ha aportado su parte al bote.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {players.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No hay jugadores.
            </p>
          ) : (
            players.map((p) => <PaidRow key={p.id} player={p} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PaidRow({ player }: { player: PotPlayer }) {
  const [state, action] = useFormState(setPaid, initial);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
      <Avatar className="h-8 w-8">
        {player.avatar ? <AvatarImage src={player.avatar} alt="" /> : null}
        <AvatarFallback>{initials(player.display_name)}</AvatarFallback>
      </Avatar>
      <span className="flex-1 text-sm font-medium text-secondary-foreground">
        {player.display_name}
      </span>
      {player.paid ? (
        <Badge variant="secondary">Pagado</Badge>
      ) : (
        <Badge variant="outline">Pendiente</Badge>
      )}
      {state.message && !state.ok ? (
        <span className="text-xs text-destructive">{state.message}</span>
      ) : null}
      <form action={action}>
        <input type="hidden" name="user_id" value={player.id} />
        <input
          type="hidden"
          name="paid"
          value={player.paid ? "false" : "true"}
        />
        <SubmitButton
          size="sm"
          variant={player.paid ? "outline" : "default"}
          pendingLabel="…"
        >
          {player.paid ? "Marcar pendiente" : "Marcar pagado"}
        </SubmitButton>
      </form>
    </div>
  );
}
