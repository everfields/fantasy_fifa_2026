"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import type { BonusAnswer, BonusQuestion } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { saveBonusAnswer, type SaveBonusState } from "./actions";

function SubmitButton({ locked }: { locked: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending || locked}>
      {pending ? "Guardando…" : locked ? "Cerrada" : "Guardar"}
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
        : single;

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

      <div className="flex items-center gap-3">
        <SubmitButton locked={locked} />
        {state.ok && !state.error && (
          <span className="text-sm font-medium text-primary">Guardado ✓</span>
        )}
        {state.error && (
          <span className="text-sm font-medium text-destructive">
            {state.error}
          </span>
        )}
        {answer && !state.error && !state.ok && (
          <span className="text-sm text-muted-foreground">
            Respuesta enviada
          </span>
        )}
      </div>
    </form>
  );
}
