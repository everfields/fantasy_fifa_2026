# ADR-0011: "Mundial" section — group standings computed locally, bracket from `matches`

- **Date:** 2026-06-10
- **Status:** Accepted
- **Supersedes:** —

## Context

Players wanted a tournament view: live group tables and the full knockout draw with the
round-of-32/16 pairings as they materialize. Two candidate data paths existed: ask the LLM
web-search provider (like live results, ADR-0009) or compute everything from the results already
stored in `matches`.

## Decision

- **Group standings are computed locally** by a pure, unit-tested module
  (`lib/tournament/standings.ts`): every group match with a score (finished, or live as
  provisional) feeds per-team tallies. Ranking criteria follow the FIFA World Cup regulations:
  points → goal difference → goals scored → the same three restricted to head-to-head among the
  still-tied teams. Fair-play points and drawing of lots are **not computable from scorelines**;
  such residual ties fall back to alphabetical order and are flagged (`unresolvedTie`, rendered
  as `*` with a disclosure note). Best-thirds ranking (8 of 12 advance): points → GD → GF, same
  fallback.
- **The knockout bracket renders straight from `matches`** — the same rows predictions run on.
  Seeded knockout rows have NULL teams ("Por definir"); a new admin action
  (`saveTeams`, `set_match_teams` audit) lets the admin assign the real teams per cross once
  FIFA confirms them, from the existing edit dialog in `/admin/matches` (knockout matches only,
  UPDATE in place — ADR-0007 safe).
- **No LLM involvement for this section.** Rationale: the standings are deterministic from data
  we already trust; and auto-deriving the R32 bracket (FIFA's third-place allocation matrix)
  is complex and error-prone — a wrong pairing would contaminate predictions. The admin assigns
  16 crosses once, manually, which stays consistent with "admin manual entry is authoritative"
  (ADR-0009). An LLM-assisted assignment could be a later enhancement.
- **Frontend:** new `/mundial` page (nav entry "Mundial", Globe icon): 12 group cards
  (top-2 highlighted), best-thirds card (top-8 highlighted, provisional note until groups end),
  and the bracket grouped by stage (Dieciseisavos → Final), each match linking to its detail.

## Alternatives considered

- **LLM web-search for tables/bracket** — rejected: slower, costs tokens, can hallucinate, and
  duplicates data we already have; the provider's job stays results-only.
- **Full FIFA third-place allocation to auto-fill the R32 bracket** — rejected for now (see
  above). **Follow-up (pending, in prod-roadmap backlog):** once group matchday 3 starts
  (~24-jun), implement the FIFA allocation matrix in `lib/tournament` and have it *propose* the
  16 R32 crosses for the admin to confirm via `saveTeams` — automation suggests, admin confirms.

## Consequences

- The group tables are only as correct as the entered results — which the admin already
  controls/overrides; no new trust surface.
- Knockout crosses appear in `/mundial`, `/matches` and predictions as soon as the admin assigns
  them (revalidated paths).
- **Testing infra fixed as a side effect:** `vitest` was never installed, so the existing
  scoring/tracker specs (node:test style) had never run. Added `vitest` + `vitest.config.ts`
  (`@/` alias) + `npm test`; converted the 3 spec files to import `test` from vitest
  (assert from node untouched). 139 tests pass.

## Changes landed

- **Contract:** none (no schema change; `matches.home_team/away_team` were already nullable).
- **Code:** `lib/tournament/{standings.ts,index.ts,standings.spec.ts}`; `app/mundial/page.tsx`;
  nav entry in `app/_components/nav.tsx`; `saveTeams` in `app/admin/matches/actions.ts`;
  team selects in `components/admin/MatchRow.tsx`; `vitest.config.ts`, `package.json` (vitest,
  `npm test`).
- **Docs:** this ADR; CLAUDE.md updated (Mundial section + test command).
