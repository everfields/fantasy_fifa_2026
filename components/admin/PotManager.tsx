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
import { formatEur as eur, potBreakdown } from "@/lib/pot";

import { SubmitButton } from "./SubmitButton";
import {
  setPaid,
  setPotConfig,
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

export function PotManager({
  entryFee,
  potExpenses,
  players,
  topThree,
}: {
  entryFee: number;
  potExpenses: number;
  players: PotPlayer[];
  topThree: { display_name: string; rank: number }[];
}) {
  const [potState, potAction] = useFormState(setPotConfig, initial);

  const paidCount = players.filter((p) => p.paid).length;
  const pot = potBreakdown({
    entryFee,
    expenses: potExpenses,
    paidCount,
  });

  const payouts = [
    { label: "1º", name: topThree[0]?.display_name, amount: pot.winnerPrize },
    { label: "2º", name: topThree[1]?.display_name, amount: pot.runnerUpPrize },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Configuración</CardTitle>
            <CardDescription>
              Cuota por jugador y gastos (dominio) que se descuentan del premio
              del ganador. El bote se calcula solo: cuota × pagados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={potAction} className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="entry_fee">Cuota (€)</Label>
                <Input
                  id="entry_fee"
                  name="entry_fee"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={entryFee}
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="pot_expenses">Gastos (€)</Label>
                <Input
                  id="pot_expenses"
                  name="pot_expenses"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={potExpenses}
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
            <CardTitle>
              Reparto
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                bote {eur(pot.collected)}
              </span>
            </CardTitle>
            <CardDescription>
              El 2º recupera su apuesta; el 1º se lleva el resto tras gastos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {payouts.map((p) => (
              <div
                key={p.label}
                className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2"
              >
                <span className="flex items-center gap-2 text-sm">
                  <Badge variant={p.label === "1º" ? "default" : "secondary"}>
                    {p.label}
                  </Badge>
                  <span className="font-medium text-secondary-foreground">
                    {p.name ?? "—"}
                  </span>
                </span>
                <span className="font-mono text-sm font-bold tabular-nums">
                  {eur(p.amount)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-lg border border-dashed border-border px-3 py-2 text-muted-foreground">
              <span className="text-sm">
                Gastos dominio → el_que_nunca_hace_nada
              </span>
              <span className="font-mono text-sm tabular-nums">
                −{eur(pot.expenses)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Pagos
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {paidCount} / {players.length} pagados · recaudado{" "}
              {eur(pot.collected)}
            </span>
          </CardTitle>
          <CardDescription>
            Marca quién ha aportado su cuota de {eur(entryFee)} al bote.
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
