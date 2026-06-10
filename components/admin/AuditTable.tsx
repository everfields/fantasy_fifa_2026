"use client";

import { useState } from "react";

import type { AuditEntry } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface AuditRow extends AuditEntry {
  actor_name: string | null;
}

const ACTION_LABEL: Record<string, string> = {
  update_scoring: "Editó puntuación",
  override_match_result: "Sobrescribió resultado",
  move_match_lock: "Movió bloqueo",
  sync_now: "Sync manual",
  create_bonus_question: "Creó bonus",
  update_bonus_question: "Editó bonus",
  close_bonus_question: "Cerró bonus",
  grant_jokers: "Concedió jokers",
  remove_jokers: "Retiró jokers",
  promote_admin: "Promovió a admin",
  demote_player: "Degradó a jugador",
  ban_user: "Baneó",
  unban_user: "Readmitió",
  set_pot_amount: "Cambió el bote",
  mark_paid: "Marcó pagado",
  mark_unpaid: "Marcó pendiente",
  recalc_confirm: "Recalculó puntos",
};

function actionLabel(a: string): string {
  return ACTION_LABEL[a] ?? a;
}

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
        Sin registros de auditoría todavía.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cuándo</TableHead>
            <TableHead>Quién</TableHead>
            <TableHead>Acción</TableHead>
            <TableHead>Objetivo</TableHead>
            <TableHead className="text-right">Detalle</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <AuditRowView key={r.id} row={r} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AuditRowView({ row }: { row: AuditRow }) {
  const [open, setOpen] = useState(false);
  const hasDetail = row.before != null || row.after != null;

  return (
    <>
      <TableRow>
        <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
          {new Date(row.created_at).toLocaleString("es-ES", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </TableCell>
        <TableCell className="text-sm font-medium">
          {row.actor_name ?? (
            <span className="text-muted-foreground">desconocido</span>
          )}
        </TableCell>
        <TableCell>
          <Badge variant="secondary">{actionLabel(row.action)}</Badge>
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {row.target_type}
          {row.target_id ? (
            <span className="ml-1 font-mono text-xs text-muted-foreground">
              #{row.target_id.slice(0, 8)}
            </span>
          ) : null}
        </TableCell>
        <TableCell className="text-right">
          {hasDetail ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              {open ? "Ocultar" : "Ver"}
            </button>
          ) : (
            <span className="text-xs text-muted-foreground/70">—</span>
          )}
        </TableCell>
      </TableRow>
      {open && hasDetail ? (
        <TableRow>
          <TableCell colSpan={5} className="bg-muted/50">
            <div className="grid gap-3 sm:grid-cols-2">
              <Diff title="Antes" value={row.before} />
              <Diff title="Después" value={row.after} />
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function Diff({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {/* Fixed dark code block — readable in both light and dark themes. */}
      <pre className="overflow-x-auto rounded-md bg-zinc-900 p-3 font-mono text-xs text-zinc-100">
        {value == null ? "—" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
