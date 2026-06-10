"use client";

import { useState } from "react";
import { useFormState } from "react-dom";

import type { PointAdjustment, Profile } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { SubmitButton } from "./SubmitButton";
import {
  addPointAdjustment,
  adjustJokers,
  deletePointAdjustment,
  setBan,
  setRole,
  type UserActionState,
} from "@/app/admin/users/actions";

const initial: UserActionState = { ok: false, message: "" };

export interface AdminUserRow extends Profile {
  banned: boolean;
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

export function UserManager({
  users,
  adjustmentsByUser = {},
  currentAdminId,
}: {
  users: AdminUserRow[];
  adjustmentsByUser?: Record<string, PointAdjustment[]>;
  currentAdminId: string;
}) {
  if (users.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No hay jugadores registrados.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {users.map((u) => (
        <UserCard
          key={u.id}
          user={u}
          adjustments={adjustmentsByUser[u.id] ?? []}
          isSelf={u.id === currentAdminId}
        />
      ))}
    </div>
  );
}

function UserCard({
  user,
  adjustments,
  isSelf,
}: {
  user: AdminUserRow;
  adjustments: PointAdjustment[];
  isSelf: boolean;
}) {
  const [jokerState, jokerAction] = useFormState(adjustJokers, initial);
  const [roleState, roleAction] = useFormState(setRole, initial);
  const [banState, banAction] = useFormState(setBan, initial);

  const msg = [jokerState, roleState, banState].find((s) => s.message);

  const adjustmentTotal = adjustments.reduce((a, x) => a + x.points, 0);

  return (
    <Card className={user.banned ? "border-destructive/40" : undefined}>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex flex-wrap items-center gap-4">
        <Avatar className="h-10 w-10">
          {user.avatar ? <AvatarImage src={user.avatar} alt="" /> : null}
          <AvatarFallback>{initials(user.display_name)}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-foreground">{user.display_name}</p>
            {user.role === "admin" ? <Badge>Admin</Badge> : null}
            {user.banned ? <Badge variant="destructive">Baneado</Badge> : null}
            {isSelf ? <Badge variant="outline">Tú</Badge> : null}
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {user.joker_count} joker{user.joker_count === 1 ? "" : "s"}
            {adjustmentTotal !== 0 ? (
              <span
                className={
                  adjustmentTotal > 0 ? " text-primary" : " text-destructive"
                }
              >
                {" · "}
                {adjustmentTotal > 0 ? "+" : ""}
                {adjustmentTotal} pts ajuste
              </span>
            ) : null}
          </p>
          {msg?.message ? (
            <p
              className={
                msg.ok
                  ? "mt-1 text-xs font-medium text-primary"
                  : "mt-1 text-xs font-medium text-destructive"
              }
            >
              {msg.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Jokers -1 / +1 */}
          <form action={jokerAction}>
            <input type="hidden" name="user_id" value={user.id} />
            <input type="hidden" name="delta" value={-1} />
            <SubmitButton
              size="sm"
              variant="outline"
              pendingLabel="…"
              disabled={user.joker_count === 0}
            >
              −1 joker
            </SubmitButton>
          </form>
          <form action={jokerAction}>
            <input type="hidden" name="user_id" value={user.id} />
            <input type="hidden" name="delta" value={1} />
            <SubmitButton size="sm" variant="outline" pendingLabel="…">
              +1 joker
            </SubmitButton>
          </form>

          {/* Role toggle */}
          <form action={roleAction}>
            <input type="hidden" name="user_id" value={user.id} />
            <input
              type="hidden"
              name="role"
              value={user.role === "admin" ? "player" : "admin"}
            />
            <SubmitButton
              size="sm"
              variant="secondary"
              pendingLabel="…"
              disabled={isSelf && user.role === "admin"}
            >
              {user.role === "admin" ? "Quitar admin" : "Hacer admin"}
            </SubmitButton>
          </form>

          {/* Ban toggle */}
          <form action={banAction}>
            <input type="hidden" name="user_id" value={user.id} />
            <input
              type="hidden"
              name="banned"
              value={user.banned ? "false" : "true"}
            />
            <SubmitButton
              size="sm"
              variant={user.banned ? "outline" : "destructive"}
              pendingLabel="…"
              disabled={isSelf}
            >
              {user.banned ? "Readmitir" : "Banear"}
            </SubmitButton>
          </form>
        </div>
        </div>

        <AdjustmentsPanel userId={user.id} adjustments={adjustments} />
      </CardContent>
    </Card>
  );
}

function AdjustmentsPanel({
  userId,
  adjustments,
}: {
  userId: string;
  adjustments: PointAdjustment[];
}) {
  const [open, setOpen] = useState(false);
  const [addState, addAction] = useFormState(addPointAdjustment, initial);

  return (
    <div className="rounded-lg border border-border bg-muted/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-semibold text-secondary-foreground"
      >
        <span>Ajustes de puntos ({adjustments.length})</span>
        <span className="text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-border px-4 py-3">
          {adjustments.length > 0 ? (
            <ul className="divide-y divide-border">
              {adjustments.map((adj) => (
                <AdjustmentItem key={adj.id} adjustment={adj} />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Sin ajustes registrados.</p>
          )}

          <form action={addAction} className="space-y-2 border-t border-border pt-3">
            <input type="hidden" name="user_id" value={userId} />
            <p className="text-xs text-muted-foreground">
              Concede o resta puntos por si ha sucedido algún evento no previsto.
              Acepta números negativos. El motivo es obligatorio.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor={`adj-points-${userId}`} className="text-xs">
                  Puntos
                </Label>
                <Input
                  id={`adj-points-${userId}`}
                  name="points"
                  type="number"
                  step="1"
                  placeholder="±"
                  className="w-24"
                  required
                />
              </div>
              <div className="min-w-[12rem] flex-1 space-y-1">
                <Label htmlFor={`adj-reason-${userId}`} className="text-xs">
                  Motivo
                </Label>
                <Input
                  id={`adj-reason-${userId}`}
                  name="reason"
                  type="text"
                  placeholder="Motivo del ajuste"
                  required
                />
              </div>
              <SubmitButton size="sm" pendingLabel="Aplicando…">
                Aplicar ajuste
              </SubmitButton>
            </div>
            {addState.message ? (
              <p
                className={
                  addState.ok
                    ? "text-xs font-medium text-primary"
                    : "text-xs font-medium text-destructive"
                }
              >
                {addState.message}
              </p>
            ) : null}
          </form>
        </div>
      ) : null}
    </div>
  );
}

function AdjustmentItem({ adjustment }: { adjustment: PointAdjustment }) {
  const [state, action] = useFormState(deletePointAdjustment, initial);

  return (
    <li className="flex items-center gap-3 py-2">
      <span
        className={`font-mono text-sm font-bold tabular-nums ${
          adjustment.points > 0 ? "text-primary" : "text-destructive"
        }`}
      >
        {adjustment.points > 0 ? "+" : ""}
        {adjustment.points}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-secondary-foreground">{adjustment.reason}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(adjustment.created_at).toLocaleString("es-ES")}
          {state.message ? (
            <span
              className={
                state.ok ? " text-primary" : " text-destructive"
              }
            >
              {" · "}
              {state.message}
            </span>
          ) : null}
        </p>
      </div>
      <form action={action}>
        <input type="hidden" name="id" value={adjustment.id} />
        <SubmitButton size="sm" variant="outline" pendingLabel="…">
          Quitar
        </SubmitButton>
      </form>
    </li>
  );
}
