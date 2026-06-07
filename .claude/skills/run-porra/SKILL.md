---
name: run-porra
description: Launch recipe for the Mundial 2026 Pool dev app — start a local Supabase, apply migrations + seed, set env, and run the Next.js dev server. Use when asked to run, start, serve, preview, or verify the porra app locally.
argument-hint: "[dev | build | verify]"
allowed-tools: Bash, Read, Edit, Write
---

# Run the Mundial 2026 Pool locally

Project: Next.js 14 (App Router) + Supabase, at the repo root. The app needs a Postgres/Supabase backend with the schema + seed applied and env vars set, then `npm run dev`.

Mode = `$ARGUMENTS` (default `dev`): `dev` = full local run; `build` = compile only; `verify` = typecheck + tests + build, no server.

## 0. Prerequisites (once)
```bash
node --version          # expect >= 20
npm install             # if node_modules is missing
```
The app reads env from `.env.local` (gitignored). `.env.example` lists the keys.

## 1. Backend — local Supabase (recommended for dev/verify)
Uses the Supabase CLI to run Postgres + Auth in Docker locally (no cloud account needed). Docker must be running.
```bash
npx supabase init        # once — creates ./supabase (safe if it already exists)
npx supabase start       # boots local stack; prints API URL, anon key, service_role key, and DB URL
```
Copy the printed values into `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=<API URL, e.g. http://127.0.0.1:54321>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
FOOTBALL_PROVIDER=footballDataOrg
FOOTBALL_DATA_ORG_TOKEN=<optional for dev; cron/sync need it>
CRON_SECRET=<any string for local>
```
> Remote alternative: create a project at supabase.com and use its URL + keys instead of `supabase start`.

## 2. Apply schema + seed
Apply our migrations (in `db/migrations/`, numeric order) and seed against the DB URL from step 1. Run from the **repo root** — the seed uses `\copy` with paths relative to cwd.
```bash
DB_URL="$(npx supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')"
psql "$DB_URL" -f db/migrations/0001_schema.sql
psql "$DB_URL" -f db/migrations/0002_rls.sql
psql "$DB_URL" -f db/migrations/0003_functions.sql
psql "$DB_URL" -f db/seed/seed.sql
```
See `db/README.md` for details. ⚠ Seed teams/fixtures are PLACEHOLDER — the real FIFA WC2026 draw and kickoff times must be substituted before launch.

## 3. Run / verify by mode
- **dev:** `npm run dev` → open http://localhost:3000 (redirects to /login). Create an account via /signup; the DB trigger makes a `profiles` row (role `player`). Promote yourself to admin with `psql "$DB_URL" -c "update profiles set role='admin' where display_name='<you>';"` to reach `/admin`.
- **build:** `npm run build` (must compile + pass lint).
- **verify:** `npx tsc --noEmit && npx tsx --test lib/scoring/scoring.spec.ts && npm run build`.

## Notes & gotchas
- First sign-in needs local Supabase Auth running (step 1).
- To test the polling cron locally: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/update-results` (needs a real `FOOTBALL_DATA_ORG_TOKEN`).
- `app_settings` is one row (`id=1`) with config under its `settings` jsonb column — already seeded by `0001_schema.sql`.
- If `npm run build` is only meant to type/lint-check without a backend, placeholder env values are enough (pages are dynamic and don't hit the DB at build time).
