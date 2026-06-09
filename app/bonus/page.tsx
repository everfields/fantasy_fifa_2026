import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { BonusAnswer, BonusCategory, BonusQuestion } from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Countdown } from "@/components/Countdown";

import { AppShell } from "../_components/shell";
import { BonusForm } from "./bonus-form";

export const metadata = { title: "Bonus · Mundial 26" };
export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<BonusQuestion["type"], string> = {
  single: "Una opción",
  multi: "Varias opciones",
  numeric: "Numérica",
  text: "Texto libre",
};

const BLOCKS: {
  category: BonusCategory;
  title: string;
  description: string;
}[] = [
  {
    category: "group_winner",
    title: "Campeón de grupo",
    description: "Acierta quién gana cada grupo de la fase de grupos.",
  },
  {
    category: "spain_scorer",
    title: "Primer goleador — partidos de España",
    description: "Predice quién marca el primer gol en cada partido de España.",
  },
  {
    category: "tournament",
    title: "Preguntas del torneo",
    description: "Campeón, pichichi, sorpresas… los grandes pronósticos.",
  },
];

export default async function BonusPage() {
  const profile = await requireUser();
  const supabase = createClient();
  const now = Date.now();

  const [{ data: qData }, { data: aData }] = await Promise.all([
    supabase
      .from("bonus_questions")
      .select("*")
      .order("locks_at", { ascending: true }),
    supabase.from("bonus_answers").select("*").eq("user_id", profile.id),
  ]);

  const questions = (qData as BonusQuestion[] | null) ?? [];
  const answers = (aData as BonusAnswer[] | null) ?? [];
  const answerByQ = new Map(answers.map((a) => [a.question_id, a]));

  // Questions are already ordered by locks_at ascending from the query, so
  // grouping below preserves that order within each block.
  const byCategory = (category: BonusCategory) =>
    questions.filter((q) => q.category === category);

  function renderCard(q: BonusQuestion) {
    const locked = new Date(q.locks_at).getTime() <= now;
    const answer = answerByQ.get(q.id) ?? null;
    // Reveal the correct answer ONLY after lock. The select above
    // pulls correct_answer, so blank it out client-side pre-lock too;
    // RLS should also restrict it, this is defense in depth.
    const revealCorrect =
      locked && q.correct_answer !== null
        ? Array.isArray(q.correct_answer)
          ? q.correct_answer.join(", ")
          : String(q.correct_answer)
        : null;

    return (
      <Card key={q.id} className="overflow-hidden">
        <CardHeader className="gap-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle className="text-lg leading-snug">{q.text}</CardTitle>
            <Badge variant="secondary" className="shrink-0">
              {q.points} pts
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="rounded-full bg-secondary px-2 py-0.5 font-medium">
              {TYPE_LABEL[q.type]}
            </span>
            {locked ? (
              <span className="font-semibold text-destructive">Cerrada</span>
            ) : (
              <span className="flex items-center gap-1.5">
                Cierra en{" "}
                <Countdown
                  target={q.locks_at}
                  className="font-mono font-semibold text-foreground"
                />
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <BonusForm question={q} answer={answer} locked={locked} />
          {revealCorrect && (
            <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              Respuesta correcta:{" "}
              <span className="font-semibold">{revealCorrect}</span>
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <AppShell profile={profile}>
      <div className="space-y-8">
        <header className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            Preguntas bonus
          </h1>
          <p className="text-muted-foreground">
            Campeón, pichichi, sorpresa de grupo… puntos extra que pueden
            decidir la porra. Cierran al empezar el torneo.
          </p>
        </header>

        {questions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Todavía no hay preguntas bonus publicadas.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-10">
            {BLOCKS.map((block) => {
              const blockQuestions = byCategory(block.category);
              if (blockQuestions.length === 0) return null;
              return (
                <section key={block.category} className="space-y-4">
                  <div className="flex flex-wrap items-end justify-between gap-2 border-b pb-2">
                    <div className="space-y-1">
                      <h2 className="text-xl font-bold tracking-tight">
                        {block.title}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {block.description}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">
                      {blockQuestions.length}{" "}
                      {blockQuestions.length === 1 ? "pregunta" : "preguntas"}
                    </span>
                  </div>
                  <div className="grid gap-5">
                    {blockQuestions.map((q) => renderCard(q))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
