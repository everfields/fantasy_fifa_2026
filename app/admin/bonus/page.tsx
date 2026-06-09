import { createServiceClient } from "@/lib/supabase/server";
import type { BonusQuestion } from "@/lib/types";
import { PageHeader } from "@/components/admin/PageHeader";
import {
  BonusManager,
  type TextAnswerRow,
} from "@/components/admin/BonusManager";

import { getAppSettingsAdmin } from "../_lib";

export const dynamic = "force-dynamic";

/** Raw row shape returned by the joined bonus_answers + profiles query. */
type RawTextAnswer = {
  id: string;
  user_id: string;
  question_id: string;
  answer: string | string[] | number;
  manual_correct: boolean | null;
  profiles: { display_name: string } | { display_name: string }[] | null;
};

export default async function AdminBonusPage() {
  const supabase = createServiceClient();
  const [{ data }, settings] = await Promise.all([
    supabase
      .from("bonus_questions")
      .select("*")
      .order("locks_at", { ascending: true }),
    getAppSettingsAdmin(),
  ]);

  const questions = (data as BonusQuestion[] | null) ?? [];

  // For text questions we list every player's free-text answer (small pool) so
  // the admin can validate each by hand. Fetch them joined with the player's
  // display name via the service client (bypasses RLS).
  const textQuestionIds = questions
    .filter((q) => q.type === "text")
    .map((q) => q.id);

  const answersByQuestion: Record<string, TextAnswerRow[]> = {};
  if (textQuestionIds.length > 0) {
    const { data: answerRows } = await supabase
      .from("bonus_answers")
      .select("id, user_id, question_id, answer, manual_correct, profiles(display_name)")
      .in("question_id", textQuestionIds);

    for (const r of (answerRows as RawTextAnswer[] | null) ?? []) {
      const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      const display_name = profile?.display_name ?? "—";
      const answer =
        typeof r.answer === "string"
          ? r.answer
          : Array.isArray(r.answer)
            ? r.answer.join(", ")
            : String(r.answer);
      (answersByQuestion[r.question_id] ??= []).push({
        id: r.id,
        user_id: r.user_id,
        display_name,
        answer,
        manual_correct: r.manual_correct,
      });
    }
    for (const list of Object.values(answersByQuestion)) {
      list.sort((a, b) => a.display_name.localeCompare(b.display_name, "es"));
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Preguntas extra"
        title="Bonus"
        description="Crea y edita preguntas bonus, fija su respuesta correcta y los puntos. Tras cerrar una pregunta, ejecuta «Recalcular»."
      />
      <BonusManager
        questions={questions}
        answersByQuestion={answersByQuestion}
        bonusDefaultPoints={settings.bonus_default_points}
        groupWinnerPoints={settings.group_winner_points}
      />
    </div>
  );
}
