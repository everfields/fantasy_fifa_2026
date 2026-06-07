import { PageHeader } from "@/components/admin/PageHeader";
import { RecalcPreview } from "@/components/admin/RecalcPreview";

export const dynamic = "force-dynamic";

export default function AdminRecalcPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Mantenimiento"
        title="Recalcular puntos"
        description="Vuelve a aplicar el motor de puntuación a todas las predicciones con la configuración actual. Hazlo tras cambiar reglas, cerrar bonus o corregir resultados."
      />
      <RecalcPreview />
    </div>
  );
}
