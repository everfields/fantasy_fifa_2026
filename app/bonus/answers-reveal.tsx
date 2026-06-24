import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { initials } from "@/components/classifications";
import type { BonusAnswer, Profile } from "@/lib/types";

import { formatBonusAnswer } from "./blocks";

export interface RevealRow {
  answer: BonusAnswer;
  player: Profile | null;
  isMe: boolean;
}

/**
 * Collapsible "group answers" panel shown under a LOCKED bonus question. The
 * rows are server-resolved (RLS already guarantees other players' answers are
 * only readable post-lock — see db/migrations/0002_rls.sql). Native <details>
 * so this stays a server component.
 */
export function AnswersReveal({ rows }: { rows: RevealRow[] }) {
  if (rows.length === 0) return null;

  return (
    <details className="group rounded-md border border-border bg-secondary/30">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
        <span>Respuestas del grupo ({rows.length})</span>
        <span className="text-xs transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <ul className="divide-y divide-border border-t border-border px-3">
        {rows.map(({ answer, player, isMe }) => {
          const name = player?.display_name ?? "Jugador";
          return (
            <li key={answer.id} className="flex items-center gap-3 py-2">
              <Avatar className="h-7 w-7">
                {player?.avatar && (
                  <AvatarImage src={player.avatar} alt={name} />
                )}
                <AvatarFallback className="text-[11px]">
                  {initials(name)}
                </AvatarFallback>
              </Avatar>
              <span className="flex-1 truncate text-sm font-medium">
                {name}
                {isMe && (
                  <span className="ml-1.5 text-xs font-medium text-primary">
                    (tú)
                  </span>
                )}
              </span>
              <span className="text-sm font-semibold">
                {formatBonusAnswer(answer.answer)}
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
