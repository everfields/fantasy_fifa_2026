"use client";

import Link from "next/link";
import { useFormState } from "react-dom";

import type { AppSettings } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { SubmitButton } from "./SubmitButton";
import {
  saveScoring,
  type ScoringActionState,
} from "@/app/admin/scoring/actions";

const initialState: ScoringActionState = { ok: false, message: "" };

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-semibold">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-zinc-400">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Hot-edit form for `app_settings`. Each scoring rule has a points input and an
 * enable switch (the switch posts its state via a hidden mirror so disabled
 * switches still send a value). Values are never hardcoded — they are seeded
 * from the current settings and validated server-side with zod.
 */
export function ScoringForm({ settings }: { settings: AppSettings }) {
  const [state, formAction] = useFormState(saveScoring, initialState);
  const s = settings.scoring;
  const err = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      {state.message ? (
        <div
          role="status"
          className={
            state.ok
              ? "rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary"
              : "rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          }
        >
          {state.message}
          {state.ok ? (
            <>
              {" "}
              <Link href="/admin/recalc" className="font-semibold underline">
                Ir a Recalcular →
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Reglas de puntuación</CardTitle>
          <CardDescription>
            Puntos por acierto. Cada regla puede activarse o desactivarse de
            forma independiente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <RuleRow
            id="exact"
            label="Resultado exacto"
            hint="Marcador clavado (p. ej. 2-1 = 2-1)."
            defaultValue={s.exact}
            defaultEnabled={s.exact_enabled}
            error={err.exact}
          />
          <RuleRow
            id="sign"
            label="Signo correcto (1/X/2)"
            hint="Acierto del ganador o empate."
            defaultValue={s.sign}
            defaultEnabled={s.sign_enabled}
            error={err.sign}
          />
          <RuleRow
            id="diff_bonus"
            label="Bonus diferencia de goles"
            hint="Suma extra cuando el signo y la diferencia coinciden."
            defaultValue={s.diff_bonus}
            defaultEnabled={s.diff_bonus_enabled}
            error={err.diff_bonus}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Jokers</CardTitle>
          <CardDescription>
            Los jokers se asignan POR PARTIDO desde «Gestión de partidos»; este
            multiplicador se aplica a los partidos designados por el admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field
            id="joker_multiplier"
            label="Multiplicador del joker"
            hint="Factor aplicado a los partidos joker designados por el admin (p. ej. 3 = triple)."
            error={err.joker_multiplier}
          >
            <Input
              id="joker_multiplier"
              name="joker_multiplier"
              type="number"
              step="0.5"
              min={1}
              defaultValue={s.joker_multiplier}
            />
          </Field>
          <Field
            id="jokers_per_user"
            label="Jokers por jugador (obsoleto)"
            hint="DEPRECADO: los jokers ya no son por jugador, se asignan por partido. Se conserva por compatibilidad."
            error={err.jokers_per_user}
          >
            <Input
              id="jokers_per_user"
              name="jokers_per_user"
              type="number"
              min={0}
              defaultValue={settings.jokers_per_user}
              disabled
              className="opacity-60"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Puntos por defecto</CardTitle>
          <CardDescription>
            Valores usados al crear preguntas bonus, en las preguntas de campeón
            de grupo y en los premios «meta volante» (campeón de ronda).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-3">
          <Field
            id="bonus_default_points"
            label="Puntos bonus por defecto"
            hint="Puntos sugeridos al crear una nueva pregunta bonus."
            error={err.bonus_default_points}
          >
            <Input
              id="bonus_default_points"
              name="bonus_default_points"
              type="number"
              min={0}
              defaultValue={settings.bonus_default_points}
            />
          </Field>
          <Field
            id="group_winner_points"
            label="Puntos campeón de grupo"
            hint="Puntos por cada pregunta auto-generada de campeón de grupo."
            error={err.group_winner_points}
          >
            <Input
              id="group_winner_points"
              name="group_winner_points"
              type="number"
              min={0}
              defaultValue={settings.group_winner_points}
            />
          </Field>
          <Field
            id="meta_volante_points"
            label="Puntos meta volante"
            hint="Premio al campeón de cada ronda (mejor puntuación de la ronda)."
            error={err.meta_volante_points}
          >
            <Input
              id="meta_volante_points"
              name="meta_volante_points"
              type="number"
              min={0}
              defaultValue={settings.meta_volante_points}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bote y temporada</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field
            id="pot_amount"
            label="Bote (€)"
            hint="Importe total del bote del grupo."
            error={err.pot_amount}
          >
            <Input
              id="pot_amount"
              name="pot_amount"
              type="number"
              step="0.01"
              min={0}
              defaultValue={settings.pot_amount}
            />
          </Field>

          <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Temporada bloqueada</p>
              <p className="text-xs text-zinc-500">
                Impide nuevas predicciones y cambios de los jugadores.
              </p>
            </div>
            <ToggleField name="season_locked" defaultChecked={settings.season_locked} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <SubmitButton size="lg">Guardar ajustes</SubmitButton>
      </div>
    </form>
  );
}

function RuleRow({
  id,
  label,
  hint,
  defaultValue,
  defaultEnabled,
  error,
}: {
  id: string;
  label: string;
  hint: string;
  defaultValue: number;
  defaultEnabled: boolean;
  error?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-100 pb-4 last:border-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <Label htmlFor={id} className="text-sm font-semibold">
          {label}
        </Label>
        <p className="text-xs text-zinc-400">{hint}</p>
        {error ? (
          <p className="mt-1 text-xs font-medium text-destructive">{error}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Input
            id={id}
            name={id}
            type="number"
            min={0}
            defaultValue={defaultValue}
            className="w-20 text-center font-mono tabular-nums"
          />
          <span className="text-xs text-zinc-400">pts</span>
        </div>
        <ToggleField name={`${id}_enabled`} defaultChecked={defaultEnabled} />
      </div>
    </div>
  );
}

/**
 * A Switch backed by a hidden checkbox so its on/off state is always submitted
 * (a Radix Switch alone does not participate in native form submission).
 */
function ToggleField({
  name,
  defaultChecked,
}: {
  name: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center">
      <Switch
        name={name}
        defaultChecked={defaultChecked}
        aria-label={name}
      />
    </label>
  );
}
