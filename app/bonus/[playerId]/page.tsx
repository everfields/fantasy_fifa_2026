import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type {
  BonusAnswer,
  BonusCategory,
  BonusQuestion,
  Profile,
} from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { initials } from "@/components/classifications";

import { AppShell } from "../../_components/shell";
import { BLOCKS, TYPE_LABEL, formatBonusAnswer } from "../blocks";

export const dynamic = "force-dynamic";

export default async function PlayerBonusPage({
  params,
}: {
  params: { playerId: string };
}) {
  const profile = await requireUser();
  const supabase = createClient();
  const now = Date.now();
  const isMe = params.playerId === profile.id;

  // RLS: for another player, only answers to ALREADY-LOCKED questions come
  // back (own answers always). We additionally filter to locked questions so
  // the page never reveals a pending pick — no spoilers.
  const [{ data: target }, { data: qData }, { data: aData }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, avatar, role, joker_count, created_at")
        .eq("id", params.playerId)
        .maybeSingle(),
      supabase
        .from("bonus_questions")
        .select("*")
        .order("locks_at", { ascending: true }),
      supabase
        .from("bonus_answers")
        .select("*")
        .eq("user_id", params.playerId),
    ]);

  const player = target as Profile | null;
  if (!player) notFound();

  const questions = (qData as BonusQuestion[] | null) ?? [];
  const answers = (aData as BonusAnswer[] | null) ?? [];
  const answerByQ = new Map(answers.map((a) => [a.question_id, a]));

  // Only locked questions the player actually answered are revealable.
  const revealable = questions.filter(
    (q) => new Date(q.locks_at).getTime() <= now && answerByQ.has(q.id),
  );

  const byCategory = (category: BonusCategory) =>
    revealable.filter((q) => q.category === category);

  return (
    <AppShell profile={profile}>
      <div className="space-y-8">
        <Link
          href="/bonus"
          className="inline-flex text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          ← Volver a bonus
        </Link>

        <header className="flex items-center gap-4">
          <Avatar className="h-12 w-12">
            {player.avatar && (
              <AvatarImage src={player.avatar} alt={player.display_name} />
            )}
            <AvatarFallback>{initials(player.display_name)}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              Respuestas bonus · {player.display_name}
              {isMe && (
                <span className="ml-2 text-base font-medium text-primary">
                  (tú)
                </span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              Solo se muestran las preguntas ya cerradas.
            </p>
          </div>
        </header>

        {revealable.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Todavía no hay respuestas que mostrar. Se revelan a medida que
              cada pregunta cierra.
            </CardContent>
          </Card>
        ) : (
          BLOCKS.map((block) => {
            const bq = byCategory(block.category);
            if (bq.length === 0) return null;
            return (
              <section key={block.category} className="space-y-3">
                <h2 className="text-lg font-bold tracking-tight">
                  {block.title}
                </h2>
                <Card>
                  <CardContent className="divide-y divide-border p-0">
                    {bq.map((q) => {
                      const a = answerByQ.get(q.id)!;
                      return (
                        <div
                          key={q.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium leading-snug">{q.text}</p>
                            <span className="text-xs text-muted-foreground">
                              {TYPE_LABEL[q.type]} · {q.points} pts
                            </span>
                          </div>
                          <Badge variant="secondary" className="shrink-0">
                            {formatBonusAnswer(a.answer)}
                          </Badge>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </section>
            );
          })
        )}
      </div>
    </AppShell>
  );
}
