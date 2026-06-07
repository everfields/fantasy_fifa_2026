"use client";

import * as React from "react";

import type { Match, Prediction, Team } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Countdown } from "@/components/Countdown";

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
  jokersRemaining,
  locked,
  action,
}: {
  match: Match;
  homeTeam: Team;
  awayTeam: Team;
  prediction?: Prediction | null;
  jokersRemaining: number;
  locked: boolean;
  action: (formData: FormData) => Promise<void>;
}) {
  const alreadyJoker = prediction?.is_joker ?? false;
  const jokerDisabled = locked || (jokersRemaining <= 0 && !alreadyJoker);

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="match_id" value={match.id} />

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

      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5",
          alreadyJoker && "border-primary/40 bg-primary/5"
        )}
      >
        <div className="flex flex-col">
          <Label htmlFor="is_joker" className="font-semibold">
            Play your Joker
          </Label>
          <span className="text-xs text-muted-foreground">
            Doubles points · {jokersRemaining} left
          </span>
        </div>
        {/* Switch is presentational; the hidden input inside carries the submitted value */}
        <JokerSwitch
          name="is_joker"
          switchId="is_joker"
          defaultChecked={alreadyJoker}
          disabled={jokerDisabled}
        />
      </div>

      <Button type="submit" disabled={locked} className="w-full" size="lg">
        {locked
          ? "Locked"
          : prediction
            ? "Update prediction"
            : "Submit prediction"}
      </Button>
    </form>
  );
}

function JokerSwitch({
  name,
  switchId,
  defaultChecked,
  disabled,
}: {
  name: string;
  switchId: string;
  defaultChecked: boolean;
  disabled: boolean;
}) {
  const [checked, setChecked] = React.useState(defaultChecked);

  return (
    <>
      <input type="hidden" name={name} value={checked ? "on" : "off"} />
      <Switch
        id={switchId}
        checked={checked}
        onCheckedChange={setChecked}
        disabled={disabled}
        aria-label="Play your joker"
      />
    </>
  );
}
