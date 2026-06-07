"use client";

import { useState } from "react";
import { useFormState } from "react-dom";

import type { BonusQuestion, BonusType } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";

import { SubmitButton } from "./SubmitButton";
import {
  closeBonus,
  upsertBonus,
  type BonusActionState,
} from "@/app/admin/bonus/actions";

const initial: BonusActionState = { ok: false, message: "" };

const TYPE_LABEL: Record<BonusType, string> = {
  single: "Opción única",
  multi: "Opción múltiple",
  numeric: "Numérica",
};

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function Msg({ state }: { state: BonusActionState }) {
  if (!state.message) return null;
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

export function BonusManager({ questions }: { questions: BonusQuestion[] }) {
  return (
    <div className="space-y-6">
      <QuestionForm />

      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500">
          Preguntas ({questions.length})
        </h2>
        {questions.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-zinc-500">
              Aún no hay preguntas bonus.
            </CardContent>
          </Card>
        ) : (
          questions.map((q) => <QuestionCard key={q.id} q={q} />)
        )}
      </div>
    </div>
  );
}

function QuestionForm({ existing }: { existing?: BonusQuestion }) {
  const [state, action] = useFormState(upsertBonus, initial);
  const [type, setType] = useState<BonusType>(existing?.type ?? "single");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{existing ? "Editar pregunta" : "Nueva pregunta bonus"}</CardTitle>
        <CardDescription>
          Define el enunciado, el tipo, los puntos y el bloqueo. La respuesta
          correcta se fija al cerrarla.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          {existing ? <input type="hidden" name="id" value={existing.id} /> : null}

          <div className="space-y-1.5">
            <Label htmlFor={`text-${existing?.id ?? "new"}`}>Enunciado</Label>
            <Textarea
              id={`text-${existing?.id ?? "new"}`}
              name="text"
              rows={2}
              defaultValue={existing?.text ?? ""}
              placeholder="¿Quién será el campeón del Mundial?"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor={`type-${existing?.id ?? "new"}`}>Tipo</Label>
              <select
                id={`type-${existing?.id ?? "new"}`}
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value as BonusType)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="single">Opción única</option>
                <option value="multi">Opción múltiple</option>
                <option value="numeric">Numérica</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`points-${existing?.id ?? "new"}`}>Puntos</Label>
              <Input
                id={`points-${existing?.id ?? "new"}`}
                name="points"
                type="number"
                min={0}
                defaultValue={existing?.points ?? 10}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`locks-${existing?.id ?? "new"}`}>Bloqueo</Label>
              <Input
                id={`locks-${existing?.id ?? "new"}`}
                name="locks_at"
                type="datetime-local"
                defaultValue={
                  existing ? toLocalInput(existing.locks_at) : undefined
                }
                required
              />
            </div>
          </div>

          {type !== "numeric" ? (
            <div className="space-y-1.5">
              <Label htmlFor={`options-${existing?.id ?? "new"}`}>
                Opciones (una por línea o separadas por comas)
              </Label>
              <Textarea
                id={`options-${existing?.id ?? "new"}`}
                name="options"
                rows={3}
                defaultValue={(existing?.options ?? []).join("\n")}
                placeholder={"Argentina\nFrancia\nBrasil\nEspaña"}
              />
            </div>
          ) : null}

          <div className="flex items-center justify-between">
            <Msg state={state} />
            <SubmitButton>{existing ? "Guardar cambios" : "Crear pregunta"}</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function QuestionCard({ q }: { q: BonusQuestion }) {
  const closed = q.correct_answer !== null;
  const locked = new Date(q.locks_at).getTime() <= Date.now();

  return (
    <Card>
      <CardContent className="flex flex-wrap items-start justify-between gap-4 py-5">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{TYPE_LABEL[q.type]}</Badge>
            <Badge variant="secondary">{q.points} pts</Badge>
            {closed ? (
              <Badge>Cerrada</Badge>
            ) : locked ? (
              <Badge variant="destructive">Bloqueada · sin respuesta</Badge>
            ) : (
              <Badge variant="outline">Abierta</Badge>
            )}
          </div>
          <p className="font-medium text-zinc-900">{q.text}</p>
          {q.options?.length ? (
            <p className="mt-1 text-xs text-zinc-400">
              {q.options.join(" · ")}
            </p>
          ) : null}
          {closed ? (
            <p className="mt-1 text-xs text-primary">
              Correcta:{" "}
              {Array.isArray(q.correct_answer)
                ? q.correct_answer.join(", ")
                : String(q.correct_answer)}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <EditQuestionDialog q={q} />
          <CloseQuestionDialog q={q} />
        </div>
      </CardContent>
    </Card>
  );
}

function EditQuestionDialog({ q }: { q: BonusQuestion }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar pregunta</DialogTitle>
          <DialogDescription>{q.text}</DialogDescription>
        </DialogHeader>
        <QuestionForm existing={q} />
      </DialogContent>
    </Dialog>
  );
}

function CloseQuestionDialog({ q }: { q: BonusQuestion }) {
  const [state, action] = useFormState(closeBonus, initial);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm">{q.correct_answer !== null ? "Cambiar respuesta" : "Cerrar"}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Respuesta correcta</DialogTitle>
          <DialogDescription>{q.text}</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={q.id} />
          <input type="hidden" name="type" value={q.type} />

          {q.type === "numeric" ? (
            <div className="space-y-1.5">
              <Label htmlFor={`ca-${q.id}`}>Valor correcto</Label>
              <Input
                id={`ca-${q.id}`}
                name="correct_answer"
                type="number"
                step="any"
                defaultValue={
                  typeof q.correct_answer === "number" ? q.correct_answer : undefined
                }
                required
              />
            </div>
          ) : q.type === "single" ? (
            <div className="space-y-1.5">
              <Label htmlFor={`ca-${q.id}`}>Opción correcta</Label>
              <select
                id={`ca-${q.id}`}
                name="correct_answer"
                defaultValue={
                  typeof q.correct_answer === "string" ? q.correct_answer : ""
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                required
              >
                <option value="" disabled>
                  Selecciona…
                </option>
                {(q.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                Opciones correctas (varias)
              </legend>
              {(q.options ?? []).map((o) => {
                const checked = Array.isArray(q.correct_answer)
                  ? q.correct_answer.includes(o)
                  : false;
                return (
                  <label key={o} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="correct_answer"
                      value={o}
                      defaultChecked={checked}
                      className="h-4 w-4 rounded border-input"
                    />
                    {o}
                  </label>
                );
              })}
            </fieldset>
          )}

          <div className="flex items-center justify-between">
            <Msg state={state} />
            <SubmitButton>Guardar respuesta</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
