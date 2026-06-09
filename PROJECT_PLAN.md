# Mundial 2026 Pool — Project Plan

> **📌 Baseline (v0) — frozen.** This document is the *original* product vision and the starting
> point we evolve **from**. It is intentionally not kept up to date. Every significant change since
> launch is recorded as a decision record in [`docs/decisions/`](docs/decisions/) — that log (plus
> `CLAUDE.md` for the current operative rules) is the source of truth wherever it contradicts this
> file. Do **not** rewrite this baseline to reflect new decisions; add an ADR instead.

A fantasy/prediction pool web app for the FIFA World Cup 2026, built for a private group of ~15–20 friends. Users predict match outcomes, earn points (with jokers and bonus questions), and compete on a live-updating leaderboard. An admin dashboard controls scoring rules, jokers, results, and recalculation.

---

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui | SSR for ranking & live data |
| Backend | Next.js Server Actions / API routes | No separate backend needed at this scale |
| DB + Auth | Supabase (Postgres + Auth + Realtime + RLS) | Per-user isolation via Row-Level Security |
| Hosting | Vercel (frontend) + Supabase (managed DB) | ~€0 at this scale |
| Football data | `FootballDataProvider` interface (start: football-data.org → optional API-Football) | Swap provider without touching core |

**Provider strategy:** start free with **football-data.org** for the full core build (predictions, results, ranking). For real-time live scoring and "Director Técnico" features (lineups, scorers), evaluate upgrading to a paid **API-Football** plan during the tournament month. The `FootballDataProvider` interface keeps the rest of the app provider-agnostic.

> Note: API pricing, rate limits, and World Cup 2026 coverage should be verified directly on each provider's site before committing — these change over time.

---

## 2. Database schema (core)

```
profiles        id (=auth.uid), display_name, avatar, role ('player'|'admin'), joker_count
teams           id, name, code, flag_url, group, is_eliminated
matches         id, home_team, away_team, stage, group, kickoff_at,
                home_score, away_score, status ('scheduled'|'live'|'finished'),
                locks_at (= kickoff)
predictions     id, user_id, match_id, home_pred, away_pred,
                is_joker (bool), points_awarded, created_at
                UNIQUE(user_id, match_id)
bonus_questions id, text, type ('single'|'multi'|'numeric'), options(jsonb),
                points, correct_answer, locks_at
bonus_answers   id, user_id, question_id, answer, points_awarded
                UNIQUE(user_id, question_id)
standings_cache user_id, total_points, exact_hits, rank   (materialized)
leagues         id, name, owner_id   (+ league_members)   [optional]

app_settings    (single jsonb row, source of truth for the scoring engine)
  scoring: { exact: 5, sign: 3, diff_bonus: 1, joker_multiplier: 2 }
  jokers_per_user: 3
  pot_amount, season_locked (bool), live_polling_seconds

audit_log       id, actor_id, action, target_type, target_id,
                before(jsonb), after(jsonb), created_at
```

**RLS rules:**
- Users can read/write only **their own** predictions, and only while `now() < locks_at`.
- Other users' predictions become visible only **after** a match's `locks_at`.
- Ranking is public to all members.
- `/admin` data and writes restricted to `role = 'admin'`.

---

## 3. Scoring system

Tiered, fully configurable from `app_settings`:

- **Exact result** (scoreline correct): 5 pts
- **Correct sign** (1/X/2 correct): 3 pts
- **Correct goal difference** (sign right, scoreline wrong): +1 bonus
- **Wrong:** 0 pts
- **Joker / multiplier:** each user has N jokers to double (or x3) the points of a chosen match
- **Bonus questions:** champion, top scorer, group surprise, etc. — high points, lock at tournament start

**Tie-breakers (ranking order):** total points → exact hits → bonus points.

> Critical: the scoring engine **always reads from `app_settings`**, never hardcoded values. Admin changes a rule → manual "Recalculate" rewrites `points_awarded` and refreshes `standings_cache`.

---

## 4. Features

### Core (from the football-pool plugin)
- Predict all matches via a form with countdown to lock.
- Automatic ranking with tie-breakers.
- Bonus questions (single / multiple / numeric).
- Auto-calculation of standings when results close.
- Player points-evolution charts (multi-user comparison).
- View other players' predictions (post-lock only).
- Optional leagues/groups.

### New proposed features
- **Live scoring:** live scoreboard + projected points in real time during matches (Supabase Realtime).
- **Money pot:** track the pot and suggested payout split.
- **Shoutbox / pool chat** for friendly trash talk.
- **Streaks & badges:** "3 exact in a row", "matchday king".
- **Matchday mini-league:** who won each matchday, not just the global.
- **Lock reminders:** push/email before each matchday closes.
- **"Director Técnico" mode:** predict lineup or match scorer for extra points (needs a provider with that data, e.g. API-Football).
- **Head-to-head history** between two friends.

---

## 5. Critical design decisions

- **Prediction lock:** predictions freeze exactly at `kickoff`. Never trust the client — validate `now() < locks_at` on the server / via RLS.
- **Auto-update results:** Vercel cron polls the football API every N min, updates `matches`, triggers point recalculation. Must be **idempotent** (never re-score already-scored predictions).
- **Recalculation:** Postgres function (or trigger) that recomputes `points_awarded` and refreshes `standings_cache` when a result changes.
- **Recalc is MANUAL:** admin triggers it with a **preview** ("this will affect X predictions") before executing — avoids mid-tournament surprises.
- **Knockout bracket:** round-of-16+ predictions depend on who qualifies → either predict over confirmed teams, or use placeholders ("Winner Group A").

---

## 6. Project structure

```
/app
  /(auth)
    login
    signup
  /dashboard            ranking + my points + next matchday
  /matches              prediction form + countdown
  /standings            global ranking + evolution chart
  /bonus                bonus questions
  /match/[id]           detail + live + everyone's predictions (post-lock)
  /chat                 shoutbox
  /admin                ← protected by role='admin'
    /scoring            edit scoring rules + jokers
    /matches            edit results, statuses, locks, manual sync
    /bonus              create/edit/close questions
    /users              jokers, roles, ban
    /pot                pot, payments, leagues
    /audit              audit log
    /recalc             preview + confirm manual recalculation
  /api
    /cron
      update-results    poll football API (idempotent)
    /admin
      recalc            manual recalc (preview + execute)
      sync-now          force-sync a match/matchday
/lib
  supabase              client (browser + server)
  scoring               scoring engine (reads from app_settings)
  providers
    FootballDataProvider.ts   ← common interface
    footballDataOrg.ts        ← football-data.org impl
    apiFootball.ts            ← API-Football impl (swap without touching core)
  auth                  guards, role check
/components
  ui                    shadcn
  MatchCard
  PredictionForm
  RankingTable
  PointsChart
  Countdown
  admin/
    ScoringForm
    RecalcPreview
    AuditTable
    UserManager
/db
  migrations            schema + RLS + triggers
  seed                  teams + World Cup 2026 calendar
```

---

## 7. Admin / Manager dashboard

Protected route `/admin`, accessible only to `role = 'admin'` (enforced by RLS).

- **Scoring config (hot-editable):** points per exact / sign / diff bonus; enable-disable each rule; joker multiplier and jokers per user. Save → **manual** "Recalculate all" (idempotent, with preview).
- **Match management:** view calendar, manually edit a result (override when API fails), force status, move `locks_at`, "sync now" button.
- **Bonus questions:** create / edit / close, define correct answer, assign points.
- **User management:** player list, grant/remove jokers, ban, promote to admin.
- **Pot & leagues:** set pot amount, mark who has paid, manage leagues/groups.
- **Audit:** who changed which prediction/setting and when.

---

## 8. Phase plan

1. **Setup** — Repo, Supabase, full schema (incl. `app_settings`, `audit_log`), RLS, basic auth, `role` field.
2. **Data** — Define `FootballDataProvider` interface, implement `footballDataOrg`, seed teams + World Cup 2026 calendar via CSV.
3. **Core gameplay** — Prediction form + lock (server-validated `locks_at`), scoring engine reading from `app_settings`, ranking + tie-breakers, `standings_cache`.
4. **Admin dashboard (core)** — `/admin/scoring`, `/admin/matches` (overrides, manual sync), `/admin/users`, audit log. Manual recalc with preview.
5. **Bonus + jokers + pot** — `/admin/bonus`, joker mechanic in the form, `/admin/pot`.
6. **Live & realtime** — update-results cron, live scoreboards + projected points (Realtime), evolution charts. Evaluate paid API-Football here.
7. **Social** — chat/shoutbox, badges & streaks, matchday mini-league, lock notifications.
8. **Polish** — UI/UX, mobile responsive, deploy to Vercel + Supabase prod, dev/prod separation.

> Admin lands early (phase 4) on purpose: the phase-3 scoring engine already reads from `app_settings`, so you need the UI to tweak those values and test recalculation before adding bonus and live features.
