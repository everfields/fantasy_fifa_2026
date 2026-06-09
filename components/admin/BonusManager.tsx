"use client";

import { useState, useTransition } from "react";
import { useFormState } from "react-dom";

import type { BonusCategory, BonusQuestion, BonusType } from "@/lib/types";
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
  deleteBonus,
  generateGroupWinnerQuestions,
  gradeTextAnswer,
  upsertBonus,
  type BonusActionState,
} from "@/app/admin/bonus/actions";

const initial: BonusActionState = { ok: false, message: "" };

/** One player's free-text answer to a text question, for manual validation. */
export interface TextAnswerRow {
  id: string;
  user_id: string;
  display_name: string;
  answer: string;
  manual_correct: boolean | null;
}

const TYPE_LABEL: Record<BonusType, string> = {
  single: "Opción única",
  multi: "Opción múltiple",
  numeric: "Numérica",
  text: "Texto libre",
};

/** The three visual blocks, in display order, with their section headings. */
const CATEGORY_SECTIONS: { category: BonusCategory; label: string }[] = [
  { category: "group_winner", label: "Campeón de grupo" },
  { category: "spain_scorer", label: "Primer goleador — partidos de España" },
  { category: "tournament", label: "Preguntas del torneo" },
];

/** Short labels for the "Bloque" select in the question form. */
const CATEGORY_FORM_LABEL: Record<BonusCategory, string> = {
  group_winner: "Campeón de grupo",
  spain_scorer: "Primer goleador (España)",
  tournament: "Preguntas del torneo",
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

export function BonusManager({
  questions,
  answersByQuestion = {},
  bonusDefaultPoints,
  groupWinnerPoints,
}: {
  questions: BonusQuestion[];
  answersByQuestion?: Record<string, TextAnswerRow[]>;
  bonusDefaultPoints: number;
  groupWinnerPoints: number;
}) {
  return (
    <div className="space-y-6">
      <GroupWinnerGenerator points={groupWinnerPoints} />

      <QuestionForm defaultPoints={bonusDefaultPoints} />

      {questions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-zinc-500">
            Aún no hay preguntas bonus.
          </CardContent>
        </Card>
      ) : (
        CATEGORY_SECTIONS.map(({ category, label }) => {
          const inSection = questions
            .filter((q) => q.category === category)
            .sort(
              (a, b) =>
                new Date(a.locks_at).getTime() - new Date(b.locks_at).getTime(),
            );
          if (inSection.length === 0) return null;
          return (
            <div key={category} className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                {label} ({inSection.length})
              </h2>
              {inSection.map((q) => (
                <QuestionCard
                  key={q.id}
                  q={q}
                  answers={answersByQuestion[q.id] ?? []}
                />
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}

function GroupWinnerGenerator({ points }: { points: number }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<BonusActionState | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Campeón de grupo (auto)</CardTitle>
        <CardDescription>
          Genera una pregunta de opción única por grupo (A–L) con los equipos del
          grupo como opciones, {points} pts cada una y bloqueo en el primer
          partido del grupo. Omite los grupos que ya tengan su pregunta.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setResult(await generateGroupWinnerQuestions());
            })
          }
        >
          {pending ? "Generando…" : "Generar preguntas de grupo"}
        </Button>
        {result ? <Msg state={result} /> : null}
      </CardContent>
    </Card>
  );
}

function QuestionForm({
  existing,
  defaultPoints,
}: {
  existing?: BonusQuestion;
  defaultPoints?: number;
}) {
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

          <div className="space-y-1.5">
            <Label htmlFor={`category-${existing?.id ?? "new"}`}>Bloque</Label>
            <select
              id={`category-${existing?.id ?? "new"}`}
              name="category"
              defaultValue={existing?.category ?? "tournament"}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="group_winner">
                {CATEGORY_FORM_LABEL.group_winner}
              </option>
              <option value="spain_scorer">
                {CATEGORY_FORM_LABEL.spain_scorer}
              </option>
              <option value="tournament">
                {CATEGORY_FORM_LABEL.tournament}
              </option>
            </select>
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
                <option value="text">Texto libre</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`points-${existing?.id ?? "new"}`}>Puntos</Label>
              <Input
                id={`points-${existing?.id ?? "new"}`}
                name="points"
                type="number"
                min={0}
                defaultValue={existing?.points ?? defaultPoints ?? 10}
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

          {type === "single" || type === "multi" ? (
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

function QuestionCard({
  q,
  answers,
}: {
  q: BonusQuestion;
  answers: TextAnswerRow[];
}) {
  const isText = q.type === "text";
  const locked = new Date(q.locks_at).getTime() <= Date.now();

  // Text questions are graded per-answer, not by closing the question. Their
  // status is derived from the answers: fully validated vs. pending count.
  const pendingCount = answers.filter((a) => a.manual_correct === null).length;
  const allValidated = answers.length > 0 && pendingCount === 0;

  // single/multi/numeric still "close" by recording a correct answer.
  const closed = !isText && q.correct_answer !== null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{TYPE_LABEL[q.type]}</Badge>
              <Badge variant="secondary">{q.points} pts</Badge>
              {isText ? (
                allValidated ? (
                  <Badge>Validada</Badge>
                ) : answers.length === 0 ? (
                  <Badge variant="outline">Sin respuestas</Badge>
                ) : (
                  <Badge variant="destructive">
                    {pendingCount} sin validar
                  </Badge>
                )
              ) : closed ? (
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
            {/* Text questions are graded per-answer below, not via a close dialog. */}
            {!isText ? <CloseQuestionDialog q={q} /> : null}
            <DeleteQuestionDialog q={q} answerCount={answers.length} />
          </div>
        </div>

        {isText ? <TextValidationPanel q={q} answers={answers} /> : null}
      </CardContent>
    </Card>
  );
}

function TextValidationPanel({
  q,
  answers,
}: {
  q: BonusQuestion;
  answers: TextAnswerRow[];
}) {
  const [open, setOpen] = useState(false);

  if (answers.length === 0) {
    return (
      <p className="text-xs text-zinc-400">
        Todavía no hay respuestas de jugadores para validar.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-semibold text-zinc-700"
      >
        <span>Validar respuestas ({answers.length})</span>
        <span className="text-zinc-400">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <ul className="divide-y divide-zinc-200 border-t border-zinc-200">
          {answers.map((a) => (
            <TextAnswerItem key={a.id} questionPoints={q.points} answer={a} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function TextAnswerItem({
  answer,
  questionPoints,
}: {
  answer: TextAnswerRow;
  questionPoints: number;
}) {
  const [state, action] = useFormState(gradeTextAnswer, initial);

  const state_label =
    answer.manual_correct === true ? (
      <span className="text-xs font-semibold text-primary">✓ correcta</span>
    ) : answer.manual_correct === false ? (
      <span className="text-xs font-semibold text-destructive">
        ✗ incorrecta
      </span>
    ) : (
      <span className="text-xs font-medium text-zinc-400">sin validar</span>
    );

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-900">
          {answer.display_name}
        </p>
        <p className="text-sm text-zinc-600">“{answer.answer}”</p>
        <div className="mt-0.5 flex items-center gap-2">
          {state_label}
          {answer.manual_correct === true ? (
            <span className="text-xs text-zinc-400">+{questionPoints} pts</span>
          ) : null}
          {state.message ? (
            <span
              className={
                state.ok
                  ? "text-xs text-primary"
                  : "text-xs text-destructive"
              }
            >
              {state.message}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <form action={action}>
          <input type="hidden" name="answer_id" value={answer.id} />
          <input type="hidden" name="correct" value="true" />
          <SubmitButton
            size="sm"
            variant={answer.manual_correct === true ? "default" : "outline"}
            pendingLabel="…"
          >
            Correcta
          </SubmitButton>
        </form>
        <form action={action}>
          <input type="hidden" name="answer_id" value={answer.id} />
          <input type="hidden" name="correct" value="false" />
          <SubmitButton
            size="sm"
            variant={
              answer.manual_correct === false ? "destructive" : "outline"
            }
            pendingLabel="…"
          >
            Incorrecta
          </SubmitButton>
        </form>
      </div>
    </li>
  );
}

function DeleteQuestionDialog({
  q,
  answerCount,
}: {
  q: BonusQuestion;
  answerCount: number;
}) {
  const [state, action] = useFormState(deleteBonus, initial);
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Eliminar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar pregunta</DialogTitle>
          <DialogDescription>{q.text}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Esta acción es <strong>irreversible</strong>. Se borrará también
            todas las respuestas de los jugadores
            {answerCount > 0 ? ` (${answerCount} respuesta(s))` : ""} y los
            puntos ya repartidos por esta pregunta desaparecerán de la
            clasificación.
          </p>
          <form action={action} className="flex items-center justify-between gap-3">
            <input type="hidden" name="id" value={q.id} />
            <Msg state={state} />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <SubmitButton size="sm" variant="destructive" pendingLabel="Eliminando…">
                Sí, eliminar
              </SubmitButton>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
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
          ) : q.type === "text" ? (
            <div className="space-y-1.5">
              <Label htmlFor={`ca-${q.id}`}>Respuesta correcta (texto)</Label>
              <Input
                id={`ca-${q.id}`}
                name="correct_answer"
                type="text"
                defaultValue={
                  typeof q.correct_answer === "string" ? q.correct_answer : ""
                }
                placeholder="Se compara sin distinguir mayúsculas ni espacios"
                required
              />
              <p className="text-xs text-zinc-400">
                La comparación ignora mayúsculas/minúsculas y espacios sobrantes.
              </p>
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
