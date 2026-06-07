import { createServiceClient } from "@/lib/supabase/server";
import type { BonusQuestion } from "@/lib/types";
import { PageHeader } from "@/components/admin/PageHeader";
import { BonusManager } from "@/components/admin/BonusManager";

export const dynamic = "force-dynamic";

export default async function AdminBonusPage() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("bonus_questions")
    .select("*")
    .order("locks_at", { ascending: true });

  const questions = (data as BonusQuestion[] | null) ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Preguntas extra"
        title="Bonus"
        description="Crea y edita preguntas bonus, fija su respuesta correcta y los puntos. Tras cerrar una pregunta, ejecuta «Recalcular»."
      />
      <BonusManager questions={questions} />
    </div>
  );
}
