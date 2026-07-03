"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";

import type { Match, Prediction, Team } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Countdown } from "@/components/Countdown";

type FormStatus = "idle" | "pending" | "success" | "error";

function TeamScoreField({
  team,
  name,
  defaultValue,
  disabled,
}: {
  team: Team;
  name: string;
  defaultValue: number | undefined;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border bg-muted text-[9px] font-bold uppercase text-muted-foreground">
          {team.flag_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={team.flag_url}
              alt={`${team.name} flag`}
              className="h-full w-full object-cover"
            />
          ) : (
            team.code
          )}
        </span>
        <span className="text-sm font-semibold">{team.code}</span>
      </div>
      <input
        type="number"
        name={name}
        min={0}
        max={99}
        inputMode="numeric"
        required
        disabled={disabled}
        defaultValue={defaultValue ?? ""}
        aria-label={`${team.name} score`}
        className="h-16 w-16 rounded-lg border-2 border-input bg-background text-center text-3xl font-extrabold tabular-nums ring-offset-background transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

export function PredictionForm({
  match,
  homeTeam,
  awayTeam,
  prediction,
  locked,
  jokerMultiplier,
  action,
}: {
  match: Match;
  homeTeam: Team;
  awayTeam: Team;
  prediction?: Prediction | null;
  locked: boolean;
  jokerMultiplier: number;
  action: (formData: FormData) => Promise<void>;
}) {
  const [status, setStatus] = React.useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = React.useState("");
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the auto-reset timer when the component unmounts.
  React.useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Guard against accidental double-submit while in flight.
    if (status === "pending") return;
    if (timerRef.current !== null) clearTimeout(timerRef.current);

    setStatus("pending");
    setErrorMessage("");

    const formData = new FormData(e.currentTarget);

    action(formData)
      .then(() => {
        setStatus("success");
        timerRef.current = setTimeout(() => setStatus("idle"), 2000);
      })
      .catch((err: unknown) => {
        setStatus("error");
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Error al guardar. Inténtalo de nuevo."
        );
      });
  }

  const isDisabled = locked || status === "pending";

  let buttonContent: React.ReactNode;
  if (status === "pending") {
    buttonContent = (
      <>
        <Loader2 className="animate-spin" />
        Guardando…
      </>
    );
  } else if (status === "success") {
    buttonContent = (
      <>
        <Check />
        ¡Guardado!
      </>
    );
  } else if (locked) {
    buttonContent = "Locked";
  } else if (prediction) {
    buttonContent = "Update prediction";
  } else {
    buttonContent = "Submit prediction";
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <input type="hidden" name="match_id" value={match.id} />

      {match.is_joker && (
        <div className="flex items-center justify-center gap-2 rounded-lg border-2 border-amber-400/60 bg-gradient-to-r from-amber-400/10 via-amber-300/15 to-amber-400/10 px-4 py-2.5">
          <span
            className="text-base"
            role="img"
            aria-label="joker"
          >
            ★
          </span>
          <Badge
            className={cn(
              "border-amber-400/80 bg-amber-400/20 px-3 py-1 text-sm font-extrabold uppercase tracking-widest text-amber-700 dark:text-amber-300"
            )}
          >
            JOKER ×{jokerMultiplier}
          </Badge>
          <span className="text-xs font-medium text-amber-700/80 dark:text-amber-400/80">
            Points multiplied for everyone
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {locked ? "Predictions closed" : "Closes in"}
        </span>
        <Countdown target={match.locks_at} />
      </div>

      <div className="flex items-center justify-center gap-4">
        <TeamScoreField
          team={homeTeam}
          name="home_pred"
          defaultValue={prediction?.home_pred}
          disabled={locked}
        />
        <span className="pt-7 text-2xl font-bold text-muted-foreground">
          –
        </span>
        <TeamScoreField
          team={awayTeam}
          name="away_pred"
          defaultValue={prediction?.away_pred}
          disabled={locked}
        />
      </div>

      {status === "error" && errorMessage && (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
          role="alert"
        >
          {errorMessage}
        </p>
      )}

      <Button
        type="submit"
        disabled={isDisabled}
        className={cn(
          "w-full duration-300",
          status === "success" &&
            "bg-emerald-500 hover:bg-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-600"
        )}
        size="lg"
      >
        {buttonContent}
      </Button>
    </form>
  );
}
