"use client";

import { useEffect, useState } from "react";

/**
 * Renders a kickoff timestamp in the VIEWER's timezone without hydration
 * mismatches: the server renders Europe/Madrid (the group's home timezone),
 * and after mount the browser re-formats to its own local time. The brief
 * server value is correct for virtually every player, and the corrected value
 * is exact everywhere.
 */
export function LocalKickoff({
  iso,
  options,
  locale = "es-ES",
  className,
}: {
  iso: string;
  options: Intl.DateTimeFormatOptions;
  locale?: string;
  className?: string;
}) {
  const [text, setText] = useState(() =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: "Europe/Madrid" }).format(
      new Date(iso),
    ),
  );

  useEffect(() => {
    setText(new Intl.DateTimeFormat(locale, options).format(new Date(iso)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso, locale]);

  return (
    <span suppressHydrationWarning className={className}>
      {text}
    </span>
  );
}
