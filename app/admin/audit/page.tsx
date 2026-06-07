import { createServiceClient } from "@/lib/supabase/server";
import type { AuditEntry, Profile } from "@/lib/types";
import { PageHeader } from "@/components/admin/PageHeader";
import {
  AuditTable,
  type AuditRow,
} from "@/components/admin/AuditTable";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const entries = (data as AuditEntry[] | null) ?? [];

  // Resolve actor display names in one round-trip.
  const actorIds = Array.from(
    new Set(entries.map((e) => e.actor_id).filter(Boolean)),
  );
  const nameById = new Map<string, string>();
  if (actorIds.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", actorIds as string[]);
    for (const p of (profiles as Pick<Profile, "id" | "display_name">[] | null) ??
      []) {
      nameById.set(p.id, p.display_name);
    }
  }

  const rows: AuditRow[] = entries.map((e) => ({
    ...e,
    actor_name: e.actor_id ? nameById.get(e.actor_id) ?? null : null,
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Trazabilidad"
        title="Auditoría"
        description="Registro de todos los cambios administrativos, del más reciente al más antiguo (últimos 200)."
      />
      <AuditTable rows={rows} />
    </div>
  );
}
