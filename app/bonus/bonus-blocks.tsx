"use client";

import { useState, type ReactNode } from "react";

import type { BonusCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface BlockMeta {
  category: BonusCategory;
  title: string;
  description: string;
  total: number;
  answered: number;
  /** open (not locked) questions still without an answer */
  pending: number;
}

const ACCENT: Record<
  BonusCategory,
  {
    icon: string;
    /** card base tint + border */
    base: string;
    /** active (selected) state */
    active: string;
    /** progress bar fill */
    bar: string;
    /** pending dot/badge */
    pending: string;
  }
> = {
  group_winner: {
    icon: "🏆",
    base: "border-amber-400/40 bg-amber-400/5 hover:bg-amber-400/10",
    active: "border-amber-500 bg-amber-400/15 ring-2 ring-amber-400/60",
    bar: "bg-amber-500",
    pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  spain_scorer: {
    icon: "⚽",
    base: "border-red-500/40 bg-red-500/5 hover:bg-red-500/10",
    active: "border-red-500 bg-red-500/15 ring-2 ring-red-500/60",
    bar: "bg-red-500",
    pending: "bg-red-500/15 text-red-700 dark:text-red-300",
  },
  tournament: {
    icon: "🌍",
    base: "border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10",
    active: "border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-500/60",
    bar: "bg-emerald-500",
    pending: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
};

export function BonusBlocks({
  blocks,
  initialSelected,
  panels,
}: {
  blocks: BlockMeta[];
  initialSelected: BonusCategory;
  /** server-rendered question lists keyed by category */
  panels: Record<BonusCategory, ReactNode>;
}) {
  const [selected, setSelected] = useState<BonusCategory>(initialSelected);

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {blocks.map((block) => {
          const accent = ACCENT[block.category];
          const empty = block.total === 0;
          const isActive = selected === block.category;
          const pct =
            block.total === 0
              ? 0
              : Math.round((block.answered / block.total) * 100);

          return (
            <button
              key={block.category}
              type="button"
              disabled={empty}
              aria-pressed={isActive}
              onClick={() => setSelected(block.category)}
              className={cn(
                "group flex flex-col gap-3 rounded-xl border p-4 text-left transition-all",
                empty
                  ? "cursor-not-allowed border-dashed border-border bg-muted/30 opacity-70"
                  : accent.base,
                !empty && isActive && accent.active,
                !empty && "focus:outline-none focus-visible:ring-2",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  aria-hidden
                  className="text-2xl leading-none"
                >
                  {accent.icon}
                </span>
                {!empty && block.pending > 0 && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      accent.pending,
                    )}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {block.pending} sin responder
                  </span>
                )}
              </div>

              <div className="space-y-1">
                <h2 className="text-base font-bold leading-snug tracking-tight">
                  {block.title}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {block.description}
                </p>
              </div>

              {empty ? (
                <p className="mt-auto text-xs font-medium text-muted-foreground">
                  Sin preguntas todavía
                </p>
              ) : (
                <div className="mt-auto space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                    <span>
                      {block.answered} de {block.total} respondidas
                    </span>
                    <span className="tabular-nums">{pct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                    <div
                      className={cn("h-full rounded-full transition-all", accent.bar)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid gap-5">{panels[selected]}</div>
    </div>
  );
}
