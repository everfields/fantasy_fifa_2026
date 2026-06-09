import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import type { PointAdjustment, Profile } from "@/lib/types";
import { PageHeader } from "@/components/admin/PageHeader";
import {
  UserManager,
  type AdminUserRow,
} from "@/components/admin/UserManager";

import { getAppSettingsAdmin } from "../_lib";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const admin = await requireAdmin();
  const supabase = createServiceClient();

  const [{ data: profiles }, { data: adjustmentRows }, settings] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .order("display_name", { ascending: true }),
      supabase
        .from("point_adjustments")
        .select("*")
        .order("created_at", { ascending: false }),
      getAppSettingsAdmin(),
    ]);

  const banned = new Set(settings.banned_user_ids);
  const adjustmentsByUser: Record<string, PointAdjustment[]> = {};
  for (const a of (adjustmentRows as PointAdjustment[] | null) ?? []) {
    (adjustmentsByUser[a.user_id] ??= []).push(a);
  }

  const users: AdminUserRow[] = ((profiles as Profile[] | null) ?? []).map(
    (p) => ({ ...p, banned: banned.has(p.id) }),
  );

  return (
    <div>
      <PageHeader
        eyebrow="Comunidad"
        title="Jugadores"
        description="Concede o retira jokers, gestiona roles, banea jugadores y aplica ajustes de puntos. Cada acción queda registrada en la auditoría."
      />
      <UserManager
        users={users}
        adjustmentsByUser={adjustmentsByUser}
        currentAdminId={admin.id}
      />
    </div>
  );
}
