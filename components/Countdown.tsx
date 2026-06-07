"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

function diffParts(target: Date) {
  const total = target.getTime() - Date.now();
  const clamped = Math.max(0, total);
  const days = Math.floor(clamped / 86_400_000);
  const hours = Math.floor((clamped % 86_400_000) / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  return { total, days, hours, minutes, seconds };
}

const pad = (n: number) => n.toString().padStart(2, "0");

export function Countdown({
  target,
  className,
}: {
  target: string | Date;
  className?: string;
}) {
  const targetDate = React.useMemo(
    () => (target instanceof Date ? target : new Date(target)),
    [target]
  );

  const [parts, setParts] = React.useState(() => diffParts(targetDate));

  React.useEffect(() => {
    setParts(diffParts(targetDate));
    const id = setInterval(() => {
      const next = diffParts(targetDate);
      setParts(next);
      if (next.total <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  const locked = parts.total <= 0;

  if (locked) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-destructive",
          className
        )}
        role="timer"
        aria-live="off"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
        Locked
      </span>
    );
  }

  const urgent = parts.total < 3_600_000;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-sm font-semibold tabular-nums",
        urgent ? "text-destructive" : "text-foreground",
        className
      )}
      role="timer"
      aria-live="polite"
      suppressHydrationWarning
    >
      {parts.days > 0 && (
        <span className="tabular-nums">{parts.days}d</span>
      )}
      <span>{pad(parts.hours)}</span>
      <span className="animate-pulse text-muted-foreground">:</span>
      <span>{pad(parts.minutes)}</span>
      <span className="animate-pulse text-muted-foreground">:</span>
      <span>{pad(parts.seconds)}</span>
    </span>
  );
}
