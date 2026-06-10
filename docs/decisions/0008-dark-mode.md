# ADR-0008: Dark mode (class-based, next-themes)

- **Date:** 2026-06-10
- **Status:** Accepted
- **Supersedes:** —

## Context

The shadcn-style theme already shipped both palettes (`:root` + `.dark` CSS variables in
`app/globals.css`, `darkMode: ["class"]` in Tailwind) but nothing ever set the `.dark` class, so
the app was light-only. The admin area additionally hardcoded a light zinc palette
(`bg-zinc-50`, `text-zinc-900`, `bg-white`…) that would clash with dark shadcn primitives.

## Decision

Enable class-based dark mode with **`next-themes`**: `ThemeProvider`
(`app/_components/theme-provider.tsx`, `attribute="class"`, `defaultTheme="system"`,
`enableSystem`) wraps the app in `app/layout.tsx`; a sun/moon toggle lives in the nav header
(`app/_components/nav.tsx`), with the icon swapped via CSS (`dark:hidden` / `dark:block`) to avoid
hydration mismatch. Theme follows the OS by default and persists the user's explicit choice.

**Operative rule:** UI colors come from the semantic tokens (`bg-background`, `bg-card`,
`text-foreground`, `text-muted-foreground`, `border-border`…). Hardcoded palette colors are
allowed only for (a) fixed-aesthetic surfaces (admin dark sidebar, auth brand panel, AuditTable
JSON block) and (b) semantic status accents (amber joker, red/emerald states) — which must carry
`dark:` variants when they're tint-on-text.

## Alternatives considered

- **Media-query only (`prefers-color-scheme`)** — rejected: no manual override.
- **Hand-rolled localStorage + class toggle** — rejected: next-themes solves FOUC/SSR for free.

## Consequences

- All admin components were converted from hardcoded zinc to semantic tokens (light-mode visuals
  unchanged); the admin sidebar stays intentionally dark in both themes.
- New dependency: `next-themes`.
- New UI must use semantic tokens so it works in both themes without extra effort.

## Changes landed

- **Code:** `app/_components/theme-provider.tsx` (new); `app/layout.tsx` (provider);
  `app/_components/nav.tsx` (toggle); `app/admin/{layout,page,matches/page}.tsx` and
  `components/admin/*` (zinc → tokens, amber `dark:` variants).
- **DB:** none.
- **Docs:** `CLAUDE.md` conventions updated; this ADR added.
