import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
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

  const [{ data: profiles }, settings] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .order("display_name", { ascending: true }),
    getAppSettingsAdmin(),
  ]);

  const banned = new Set(settings.banned_user_ids);
  const users: AdminUserRow[] = ((profiles as Profile[] | null) ?? []).map(
    (p) => ({ ...p, banned: banned.has(p.id) }),
  );

  return (
    <div>
      <PageHeader
        eyebrow="Comunidad"
        title="Jugadores"
        description="Concede o retira jokers, gestiona roles y banea jugadores. Cada acción queda registrada en la auditoría."
      />
      <UserManager users={users} currentAdminId={admin.id} />
    </div>
  );
}
