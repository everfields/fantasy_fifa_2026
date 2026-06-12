"use client";

import { useFormState } from "react-dom";

import { SubmitButton } from "./SubmitButton";
import {
  autoAssignMontanaStages,
  montanaAutoInitial,
} from "@/app/admin/matches/montana-actions";

/**
 * Top-of-page button that runs the pure montaña picker and persists the new
 * etapa assignments. Idempotent — re-running only assigns the matches that
 * still lack an etapa (and are eligible), so it is safe to press repeatedly as
 * knockout teams get defined.
 */
export function MontanaAutoAssign() {
  const [state, action] = useFormState(
    autoAssignMontanaStages,
    montanaAutoInitial,
  );

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <SubmitButton size="sm" variant="secondary" pendingLabel="Asignando…">
        ⛰️ Auto-asignar etapas de montaña
      </SubmitButton>
      {state.message ? (
        <p
          className={
            state.ok
              ? "text-xs font-medium text-primary"
              : "text-xs font-medium text-destructive"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
