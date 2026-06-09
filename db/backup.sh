#!/usr/bin/env bash
# One-command backup of the Mundial 2026 Pool database.
# ALWAYS run this before applying any migration, seed, or manual SQL to prod.
#
# Usage (from repo root):
#   DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres" bash db/backup.sh
#
# Writes two files to db/backups/ (gitignored):
#   full_<UTC>.sql      complete dump (schema + data) — the disaster-recovery restore
#   userdata_<UTC>.sql  data-only dump of the irreplaceable user tables — quick targeted restore
#
# Restore (fresh/empty database):
#   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/backups/full_<UTC>.sql
# Targeted restore of user data only works if matches/teams/bonus_questions UUIDs
# are unchanged — which is exactly why those tables must never be truncated post-launch.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL (Supabase Dashboard -> Settings -> Database -> Connection string)}"

dir="${BACKUP_DIR:-db/backups}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$dir"

pg_dump "$DATABASE_URL" --no-owner --no-privileges \
  -f "$dir/full_$stamp.sql"

pg_dump "$DATABASE_URL" --data-only --no-owner --no-privileges \
  -t public.profiles \
  -t public.predictions \
  -t public.bonus_answers \
  -t public.point_adjustments \
  -t public.round_awards \
  -t public.standings_cache \
  -t public.app_settings \
  -t public.audit_log \
  -f "$dir/userdata_$stamp.sql"

echo "OK — backups written:"
echo "  $dir/full_$stamp.sql"
echo "  $dir/userdata_$stamp.sql"
