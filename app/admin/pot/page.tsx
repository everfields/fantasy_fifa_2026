import { createServiceClient } from "@/lib/supabase/server";
import type { Profile, StandingRow } from "@/lib/types";
import { PageHeader } from "@/components/admin/PageHeader";
import {
  PotManager,
  type PotPlayer,
} from "@/components/admin/PotManager";

import { getAppSettingsAdmin } from "../_lib";

export const dynamic = "force-dynamic";

export default async function AdminPotPage() {
  const supabase = createServiceClient();

  const [{ data: profiles }, { data: standings }, settings] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .order("display_name", { ascending: true }),
    supabase
      .from("standings_cache")
      .select("*")
      .order("rank", { ascending: true })
      .limit(3),
    getAppSettingsAdmin(),
  ]);

  const paid = new Set(settings.paid_user_ids);
  const players: PotPlayer[] = ((profiles as Profile[] | null) ?? []).map(
    (p) => ({
      id: p.id,
      display_name: p.display_name,
      avatar: p.avatar,
      paid: paid.has(p.id),
    }),
  );

  const topThree = ((standings as StandingRow[] | null) ?? []).map((s) => ({
    display_name: s.display_name,
    rank: s.rank,
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Dinero"
        title="Bote y pagos"
        description="Define el bote, controla quién ha pagado y consulta el reparto sugerido según la clasificación actual."
      />
      <PotManager
        potAmount={settings.pot_amount}
        players={players}
        topThree={topThree}
      />
    </div>
  );
}
