import { PageHeader } from "@/components/admin/PageHeader";
import { ScoringForm } from "@/components/admin/ScoringForm";

import { getAppSettingsAdmin } from "../_lib";

export const dynamic = "force-dynamic";

export default async function ScoringPage() {
  const settings = await getAppSettingsAdmin();

  return (
    <div>
      <PageHeader
        eyebrow="Configuración"
        title="Puntuación y jokers"
        description="Edita en caliente las reglas del motor de puntuación. Los cambios no afectan a las predicciones ya puntuadas hasta que ejecutes «Recalcular»."
      />
      <ScoringForm settings={settings} />
    </div>
  );
}
