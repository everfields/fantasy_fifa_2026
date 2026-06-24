import Link from "next/link";
import type { ReactNode } from "react";

import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type {
  BonusAnswer,
  BonusCategory,
  BonusQuestion,
  Profile,
} from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { initials } from "@/components/classifications";
import { Countdown } from "@/components/Countdown";

import { AppShell } from "../_components/shell";
import { BonusForm } from "./bonus-form";
import { BonusBlocks, type BlockMeta } from "./bonus-blocks";
import { AnswersReveal, type RevealRow } from "./answers-reveal";
import { BLOCKS, TYPE_LABEL } from "./blocks";

export const metadata = { title: "Bonus · Resiporra 26" };
export const dynamic = "force-dynamic";

export default async function BonusPage() {
  const profile = await requireUser();
  const supabase = createClient();
  const now = Date.now();

  // RLS returns: my own answers (always) + everyone's answers to LOCKED
  // questions. Pre-lock, others' picks stay hidden (no spoilers).
  const [{ data: qData }, { data: aData }, { data: pData }] = await Promise.all([
    supabase
      .from("bonus_questions")
      .select("*")
      .order("locks_at", { ascending: true }),
    supabase.from("bonus_answers").select("*"),
    supabase
      .from("profiles")
      .select("id, display_name, avatar, role, joker_count, created_at")
      .order("display_name", { ascending: true }),
  ]);

  const questions = (qData as BonusQuestion[] | null) ?? [];
  const allAnswers = (aData as BonusAnswer[] | null) ?? [];
  const players = (pData as Profile[] | null) ?? [];
  const profilesById = new Map(players.map((p) => [p.id, p]));

  // My own answers drive the editable form.
  const answers = allAnswers.filter((a) => a.user_id === profile.id);
  const answerByQ = new Map(answers.map((a) => [a.question_id, a]));

  // Every readable answer, grouped by question, for the post-lock reveal.
  const answersByQ = new Map<string, BonusAnswer[]>();
  for (const a of allAnswers) {
    const list = answersByQ.get(a.question_id);
    if (list) list.push(a);
    else answersByQ.set(a.question_id, [a]);
  }

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

    // Group answers, revealed only once the question has locked. Sorted by
    // display name with the current user flagged "(tú)".
    const revealRows: RevealRow[] = locked
      ? (answersByQ.get(q.id) ?? [])
          .map((a) => ({
            answer: a,
            player: profilesById.get(a.user_id) ?? null,
            isMe: a.user_id === profile.id,
          }))
          .sort((x, y) =>
            (x.player?.display_name ?? "").localeCompare(
              y.player?.display_name ?? "",
            ),
          )
      : [];

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
          {locked && <AnswersReveal rows={revealRows} />}
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

        {(() => {
          if (questions.length === 0) {
            return (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Todavía no hay preguntas bonus publicadas.
                </CardContent>
              </Card>
            );
          }

          // Per-block metadata (counts, answered, still-open unanswered).
          const blockMeta: BlockMeta[] = BLOCKS.map((block) => {
            const bq = byCategory(block.category);
            const answered = bq.filter((q) => answerByQ.has(q.id)).length;
            const pending = bq.filter(
              (q) =>
                !answerByQ.has(q.id) &&
                new Date(q.locks_at).getTime() > now,
            ).length;
            return {
              category: block.category,
              title: block.title,
              description: block.description,
              total: bq.length,
              answered,
              pending,
            };
          });

          // Server-render each block's question cards, keyed by category.
          const panels = {} as Record<BonusCategory, ReactNode>;
          for (const block of BLOCKS) {
            panels[block.category] = byCategory(block.category).map((q) =>
              renderCard(q),
            );
          }

          // Default: first block with an OPEN unanswered question; else first
          // non-empty block; else first block (all empty handled above).
          const initialSelected =
            blockMeta.find((b) => b.pending > 0)?.category ??
            blockMeta.find((b) => b.total > 0)?.category ??
            BLOCKS[0].category;

          return (
            <BonusBlocks
              blocks={blockMeta}
              initialSelected={initialSelected}
              panels={panels}
            />
          );
        })()}

        {(() => {
          // Per-player reveal picker: only players with at least one answer to
          // an already-locked question (i.e. something readable to show).
          const lockedQ = new Set(
            questions
              .filter((q) => new Date(q.locks_at).getTime() <= now)
              .map((q) => q.id),
          );
          const revealableIds = new Set(
            allAnswers
              .filter((a) => lockedQ.has(a.question_id))
              .map((a) => a.user_id),
          );
          const roster = players.filter((p) => revealableIds.has(p.id));
          if (roster.length === 0) return null;

          return (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Respuestas por jugador
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Cotillea las respuestas (ya cerradas) de cada corredor.
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {roster.map((p) => {
                    const isMe = p.id === profile.id;
                    return (
                      <Link
                        key={p.id}
                        href={`/bonus/${p.id}`}
                        className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:bg-secondary"
                      >
                        <Avatar className="h-8 w-8">
                          {p.avatar && (
                            <AvatarImage src={p.avatar} alt={p.display_name} />
                          )}
                          <AvatarFallback className="text-xs">
                            {initials(p.display_name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="flex-1 truncate text-sm font-semibold">
                          {p.display_name}
                          {isMe && (
                            <span className="ml-1.5 text-xs font-medium text-primary">
                              (tú)
                            </span>
                          )}
                        </span>
                        <span aria-hidden className="text-muted-foreground">
                          →
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })()}
      </div>
    </AppShell>
  );
}
