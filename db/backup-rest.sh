#!/usr/bin/env bash
# Daily backup without a DB connection string: exports every player-data table
# (plus the config/state tables needed to make sense of them) as JSON via the
# Supabase REST API, using the service-role key from .env.local.
#
# If DATABASE_URL is present in .env.local, it ALSO runs db/backup.sh for a
# full pg_dump (schema + data) — the proper disaster-recovery dump.
#
# Scheduled daily by the Windows Task Scheduler job "ResiporraDailyBackup"
# (see db/backup-daily.cmd). Output: db/backups/rest_<UTC>/ (gitignored).
set -euo pipefail
cd "$(dirname "$0")/.."

URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- | tr -d '\r"')
SRK=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2- | tr -d '\r"')

stamp=$(date -u +%Y%m%dT%H%M%SZ)
dir="db/backups/rest_$stamp"
mkdir -p "$dir"

TABLES="profiles predictions bonus_answers point_adjustments round_awards \
standings_cache matches teams bonus_questions app_settings tracker_reports"

for t in $TABLES; do
  curl -sf "$URL/rest/v1/$t?select=*" \
    -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
    -o "$dir/$t.json"
done

# Full pg_dump too, when the connection string is available.
DBURL=$(grep '^DATABASE_URL=' .env.local 2>/dev/null | cut -d= -f2- | tr -d '\r"' || true)
if [ -n "${DBURL:-}" ]; then
  PATH="/c/Program Files/PostgreSQL/17/bin:$PATH" \
    DATABASE_URL="$DBURL" bash db/backup.sh
fi

echo "[$(date -u +%FT%TZ)] backup ok: $dir (pg_dump: $([ -n "${DBURL:-}" ] && echo yes || echo no — DATABASE_URL not set))"
