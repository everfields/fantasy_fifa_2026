"use client";

import { useState, useTransition } from "react";

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
  confirmRecalc,
  previewRecalc,
  type RecalcState,
} from "@/app/admin/recalc/actions";

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative";
}) {
  const color =
    tone === "positive"
      ? "text-primary"
      : tone === "negative"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 font-mono text-2xl font-black tabular-nums ${color}`}>
        {value}
      </p>
    </div>
  );
}

/**
 * Two-step manual recalculation:
 *   1) "Generar preview" runs the TS scoring engine and reports the diff
 *      (changed predictions + Δ points) WITHOUT writing anything.
 *   2) "Aplicar" persists only the differing rows (idempotent) and refreshes
 *      the standings cache. The confirm button is disabled until a preview
 *      exists and is reset whenever the preview is regenerated.
 */
export function RecalcPreview() {
  const [state, setState] = useState<RecalcState>({ phase: "idle" });
  const [pendingPreview, startPreview] = useTransition();
  const [pendingApply, startApply] = useTransition();

  const preview = state.phase === "preview" ? state.preview : null;
  const fmtDelta = (n: number) => (n > 0 ? `+${n}` : String(n));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Recálculo manual</CardTitle>
          <CardDescription>
            Genera primero una previsualización del impacto. No se escribe nada
            hasta que confirmes. El motor de puntuación de TypeScript es la
            única fuente de verdad y la operación es idempotente.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={pendingPreview}
            onClick={() =>
              startPreview(async () => {
                setState(await previewRecalc());
              })
            }
          >
            {pendingPreview ? "Calculando…" : "Generar preview"}
          </Button>

          <Button
            type="button"
            variant="default"
            disabled={!preview || pendingApply || pendingPreview}
            onClick={() =>
              startApply(async () => {
                const result = await confirmRecalc();
                setState(result);
              })
            }
            className="bg-foreground text-background hover:bg-foreground/90"
          >
            {pendingApply ? "Aplicando…" : "Aplicar recálculo"}
          </Button>

          {state.phase === "done" ? (
            <span className="text-sm font-medium text-primary">
              {state.message}
            </span>
          ) : null}
          {state.phase === "error" ? (
            <span className="text-sm font-medium text-destructive">
              {state.message}
            </span>
          ) : null}
        </CardContent>
      </Card>

      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Previsualización
              <Badge variant="outline">
                {new Date(preview.generatedAt).toLocaleTimeString("es-ES")}
              </Badge>
            </CardTitle>
            <CardDescription>
              {preview.changedCount === 0 && preview.bonusChangedCount === 0
                ? "Todo está al día — aplicar no cambiaría nada."
                : `Aplicar cambiará ${preview.changedCount} predicción(es)` +
                  (preview.bonusChangedCount > 0
                    ? ` y ${preview.bonusChangedCount} respuesta(s) bonus.`
                    : ".")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Stat
                label="Predicciones"
                value={String(preview.totalPredictions)}
              />
              <Stat
                label="A cambiar"
                value={String(preview.changedCount)}
                tone={preview.changedCount > 0 ? "negative" : "default"}
              />
              <Stat
                label="Bonus a cambiar"
                value={String(preview.bonusChangedCount)}
                tone={preview.bonusChangedCount > 0 ? "negative" : "default"}
              />
              <Stat
                label="Δ puntos total"
                value={fmtDelta(preview.totalDelta)}
                tone={
                  preview.totalDelta > 0
                    ? "positive"
                    : preview.totalDelta < 0
                      ? "negative"
                      : "default"
                }
              />
              <Stat
                label="Premios meta volante"
                value={
                  preview.roundAwardsAffected === null
                    ? "pendiente"
                    : String(preview.roundAwardsAffected)
                }
                tone={
                  preview.roundAwardsAffected && preview.roundAwardsAffected > 0
                    ? "positive"
                    : "default"
                }
              />
            </div>

            {preview.changes.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Predicción</th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Antes
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Después
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.changes.map((c) => (
                      <tr key={c.id} className="border-t border-border">
                        <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                          {c.id.slice(0, 8)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                          {c.old ?? "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                          {c.new ?? "—"}
                        </td>
                        <td
                          className={`px-3 py-1.5 text-right font-mono font-bold tabular-nums ${
                            c.delta > 0
                              ? "text-primary"
                              : c.delta < 0
                                ? "text-destructive"
                                : "text-muted-foreground"
                          }`}
                        >
                          {fmtDelta(c.delta)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.changedCount > preview.changes.length ? (
                  <p className="bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    Mostrando {preview.changes.length} de {preview.changedCount}{" "}
                    cambios.
                  </p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
