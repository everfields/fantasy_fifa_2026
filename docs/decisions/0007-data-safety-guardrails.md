# 0007 — Data-safety guardrails: predictions can never be lost

- **Date:** 2026-06-10
- **Status:** Accepted

## Context

The tournament starts 2026-06-11 and ~15–20 friends have entered real predictions.
An audit of loss vectors found that **application code never deletes player data** —
every realistic loss path is SQL run against the prod database:

1. **Re-seeding.** `db/seed/*.sql` requires `truncate matches cascade` first, and
   `predictions.match_id` is `on delete cascade` → re-seeding post-launch silently
   deletes every prediction. This was documented only as a README footnote.
2. **Cascade deletes.** Deleting a `matches` / `teams` / `bonus_questions` row
   (e.g. to "fix" a fixture by delete + reinsert) cascades into `predictions` /
   `bonus_answers` with no warning.
3. **Destructive migrations.** A future migration with `drop` / `truncate` /
   `delete` on user-data tables.
4. **No backups.** Supabase free plan has no automatic backups; there was no
   backup tooling in the repo.

User-data tables (irreplaceable): `predictions`, `bonus_answers`,
`point_adjustments`, `round_awards`, `profiles`. (`points_awarded`,
`standings_cache` are recomputable via the manual recalc — the rows are not.)

## Decision

Defense in depth, kept simple:

1. **Seed guard (mechanical).** Both `db/seed/seed.sql` and
   `db/seed/seed_dashboard.sql` open with a `do $$` block that **raises an
   exception if `predictions` or `bonus_answers` contain rows**. Deliberate
   override only via session setting `app.allow_reseed = 'on'`
   (`PGOPTIONS="-c app.allow_reseed=on"` for psql), intended to be used only
   after a fresh backup.
2. **One-command backup.** `db/backup.sh` (`DATABASE_URL=… bash db/backup.sh`)
   writes a full `pg_dump` + a data-only dump of the user tables to
   `db/backups/` (gitignored — backups contain user data).
3. **Operating rules (procedural).** New "Data safety" section at the top of
   `db/README.md`: backup before any prod SQL; additive-only migrations
   post-launch; never delete/truncate `matches`/`teams`/`bonus_questions`
   (UPDATE in place instead); never re-seed prod; test on local Supabase first;
   daily backup during the tournament.
4. **Operative rule in `CLAUDE.md`** (architecture rule 7) so every session
   enforces this.

## Consequences

- Re-running a seed against a live database now fails loudly instead of setting
  up a silent cascade wipe.
- Any destructive change now requires two deliberate steps (backup + explicit
  override), not one accidental paste.
- Restore path is documented: full dump into a fresh DB, or `userdata_*.sql`
  in place while reference UUIDs (`matches`/`teams`/`bonus_questions`) are
  unchanged — the reason in-place `UPDATE` is mandated over delete + reinsert.
- Cost: one extra command before prod SQL; `pg_dump` must be installed locally.

## Changed

- `db/seed/seed.sql`, `db/seed/seed_dashboard.sql` — data-safety guard block.
- `db/backup.sh` — new backup script.
- `db/README.md` — "Data safety" section (top) + re-seeding note.
- `.gitignore` — `/db/backups/`.
- `CLAUDE.md` — architecture rule 7.
