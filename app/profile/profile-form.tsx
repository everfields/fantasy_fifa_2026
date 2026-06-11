"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { updateNickname, type UpdateNicknameState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Guardando…" : "Guardar"}
    </Button>
  );
}

export function ProfileForm({ currentName }: { currentName: string }) {
  const [state, formAction] = useFormState<UpdateNicknameState, FormData>(
    updateNickname,
    { ok: false, error: null },
  );

  return (
    <form action={formAction} className="space-y-2">
      <Label htmlFor="displayName">Apodo</Label>
      <Input
        id="displayName"
        name="displayName"
        defaultValue={currentName}
        minLength={2}
        maxLength={24}
        required
        autoComplete="nickname"
        className="max-w-xs"
      />
      <p className="text-xs text-muted-foreground">
        Así te verán los demás en la clasificación y en los partes de Luis.
      </p>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && !state.error && (
        <p className="text-sm text-primary">Apodo actualizado.</p>
      )}
      <SubmitButton />
    </form>
  );
}
