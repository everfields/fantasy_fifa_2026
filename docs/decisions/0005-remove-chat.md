# ADR-0005: Remove the in-app chat — the group chats on WhatsApp

- **Date:** 2026-06-10
- **Status:** Accepted
- **Supersedes:** —

## Context

`PROJECT_PLAN.md` envisioned an in-app group chat ("shoutbox"). What shipped was a static
placeholder at `/chat` (seed messages, disabled input) with a TODO to wire a Supabase `messages`
table + Realtime later. The group already coordinates and trash-talks on WhatsApp, so the in-app
chat would duplicate an existing habit with zero adoption upside — and finishing it (table, RLS,
Realtime subscription, server action) is non-trivial work.

## Decision

Remove the chat section entirely. WhatsApp is the group's chat; the app focuses on predictions,
standings, bonus and the Luis tracker.

## Alternatives considered

- **Finish the realtime chat** — rejected: competes with WhatsApp, predictable dead feature.
- **Keep the placeholder** — rejected: a permanently-"próximamente" tab erodes trust in the app.

## Consequences

- One less nav item (mobile bottom tab bar goes 6 → 5 tabs; desktop pill nav loses Chat).
- The dashboard quick-link that pointed to `/chat` now points to `/tracker`.
- Nothing to remove in the DB — the `messages` table was never created.
- Re-adding chat later would be a fresh feature (new ADR), not a revert.

## Changes landed

- **Code:** `app/chat/` deleted; `app/_components/nav.tsx` (link + icon removed, mobile grid
  `grid-cols-5`); `app/dashboard/page.tsx` quick link → `/tracker`.
- **DB:** none.
- **Docs:** `CLAUDE.md` directory map updated; this ADR added.
