"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import type { BonusAnswer, BonusQuestion } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { saveBonusAnswer, type SaveBonusState } from "./actions";

function SubmitButton({
  locked,
  hasSaved,
}: {
  locked: boolean;
  hasSaved: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending || locked}>
      {pending
        ? "Guardando…"
        : locked
          ? "Cerrada"
          : hasSaved
            ? "Actualizar"
            : "Guardar"}
    </Button>
  );
}

/** Interactive answer controls for one bonus question. */
export function BonusForm({
  question,
  answer,
  locked,
}: {
  question: BonusQuestion;
  answer: BonusAnswer | null;
  locked: boolean;
}) {
  const [state, formAction] = useFormState<SaveBonusState, FormData>(
    saveBonusAnswer,
    { ok: false, error: null },
  );

  const initial = answer?.answer;
  const [single, setSingle] = useState<string>(
    typeof initial === "string" ? initial : "",
  );
  const [numeric, setNumeric] = useState<string>(
    typeof initial === "number" ? String(initial) : "",
  );
  const [multi, setMulti] = useState<string[]>(
    Array.isArray(initial) ? (initial as string[]) : [],
  );
  const [text, setText] = useState<string>(
    typeof initial === "string" ? initial : "",
  );

  // Keep the inputs in sync with the SAVED answer whenever it changes (after a
  // save → revalidatePath the prop refreshes; without this the controls could
  // sit empty next to a "guardada: X" notice and look like unsaved changes).
  const initialKey = JSON.stringify(initial ?? null);
  useEffect(() => {
    if (initial == null) return;
    if (typeof initial === "string") {
      setSingle(initial);
      setText(initial);
    } else if (typeof initial === "number") {
      setNumeric(String(initial));
    } else if (Array.isArray(initial)) {
      setMulti(initial as string[]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  function toggleMulti(opt: string) {
    setMulti((prev) =>
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt],
    );
  }

  const serializedAnswer =
    question.type === "numeric"
      ? numeric
      : question.type === "multi"
        ? JSON.stringify(multi)
        : question.type === "text"
          ? text.trim()
          : single;

  // Server truth: what is actually saved (the `answer` prop refreshes via
  // revalidatePath after each save). Shown to the user so there is never any
  // doubt about which answer counts.
  const savedDisplay =
    initial == null
      ? null
      : Array.isArray(initial)
        ? (initial as string[]).join(", ")
        : String(initial);

  // Is the current input different from the saved answer?
  const savedSerialized =
    initial == null
      ? null
      : Array.isArray(initial)
        ? JSON.stringify([...(initial as string[])].sort())
        : String(initial);
  const currentSerialized =
    question.type === "multi"
      ? JSON.stringify([...multi].sort())
      : serializedAnswer;
  // "Unsaved changes" only when the user typed/picked something DIFFERENT from
  // the saved answer — an empty/untouched control is not a pending change.
  const currentEmpty =
    question.type === "multi" ? multi.length === 0 : serializedAnswer === "";
  const dirty =
    savedSerialized !== null &&
    !currentEmpty &&
    currentSerialized !== savedSerialized;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="questionId" value={question.id} />
      <input type="hidden" name="answer" value={serializedAnswer} />

      {question.type === "single" && question.options && (
        <div className="flex flex-wrap gap-2">
          {question.options.map((opt) => (
            <button
              key={opt}
              type="button"
              disabled={locked}
              onClick={() => setSingle(opt)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors disabled:opacity-60",
                single === opt
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background hover:bg-secondary",
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {question.type === "multi" && question.options && (
        <div className="flex flex-wrap gap-2">
          {question.options.map((opt) => {
            const on = multi.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                disabled={locked}
                onClick={() => toggleMulti(opt)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors disabled:opacity-60",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-secondary",
                )}
              >
                {on ? "✓ " : ""}
                {opt}
              </button>
            );
          })}
        </div>
      )}

      {question.type === "numeric" && (
        <div className="max-w-[10rem] space-y-1.5">
          <Label htmlFor={`num-${question.id}`} className="sr-only">
            Respuesta
          </Label>
          <Input
            id={`num-${question.id}`}
            type="number"
            inputMode="numeric"
            value={numeric}
            disabled={locked}
            onChange={(e) => setNumeric(e.target.value)}
            placeholder="0"
          />
        </div>
      )}

      {question.type === "text" && (
        <div className="max-w-md space-y-1.5">
          <Label htmlFor={`text-${question.id}`} className="sr-only">
            Respuesta
          </Label>
          <Input
            id={`text-${question.id}`}
            type="text"
            maxLength={200}
            value={text}
            disabled={locked}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe tu respuesta…"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton locked={locked} hasSaved={savedDisplay !== null} />
        {state.error ? (
          <span className="text-sm font-medium text-destructive">
            {state.error}
          </span>
        ) : savedDisplay && dirty && !locked ? (
          <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
            Cambios sin guardar — guardada:{" "}
            <span className="font-semibold">{savedDisplay}</span>
          </span>
        ) : savedDisplay ? (
          <span className="text-sm text-muted-foreground">
            Tu respuesta:{" "}
            <span className="font-semibold text-primary">{savedDisplay}</span>{" "}
            ✓
          </span>
        ) : state.ok ? (
          <span className="text-sm font-medium text-primary">Guardado ✓</span>
        ) : null}
      </div>
    </form>
  );
}
