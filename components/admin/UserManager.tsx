"use client";

import { useFormState } from "react-dom";

import type { Profile } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

import { SubmitButton } from "./SubmitButton";
import {
  adjustJokers,
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
  currentAdminId,
}: {
  users: AdminUserRow[];
  currentAdminId: string;
}) {
  if (users.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-zinc-500">
          No hay jugadores registrados.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {users.map((u) => (
        <UserCard key={u.id} user={u} isSelf={u.id === currentAdminId} />
      ))}
    </div>
  );
}

function UserCard({ user, isSelf }: { user: AdminUserRow; isSelf: boolean }) {
  const [jokerState, jokerAction] = useFormState(adjustJokers, initial);
  const [roleState, roleAction] = useFormState(setRole, initial);
  const [banState, banAction] = useFormState(setBan, initial);

  const msg = [jokerState, roleState, banState].find((s) => s.message);

  return (
    <Card className={user.banned ? "border-destructive/40" : undefined}>
      <CardContent className="flex flex-wrap items-center gap-4 py-4">
        <Avatar className="h-10 w-10">
          {user.avatar ? <AvatarImage src={user.avatar} alt="" /> : null}
          <AvatarFallback>{initials(user.display_name)}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-zinc-900">{user.display_name}</p>
            {user.role === "admin" ? <Badge>Admin</Badge> : null}
            {user.banned ? <Badge variant="destructive">Baneado</Badge> : null}
            {isSelf ? <Badge variant="outline">Tú</Badge> : null}
          </div>
          <p className="font-mono text-xs text-zinc-400">
            {user.joker_count} joker{user.joker_count === 1 ? "" : "s"}
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
      </CardContent>
    </Card>
  );
}
