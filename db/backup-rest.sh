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

# --ssl-no-revoke: on corporate networks with TLS inspection, Windows curl
# (schannel) can't reach the CRL/OCSP endpoints and aborts with exit 35, which
# under `set -e` killed the whole nightly backup. The corporate CA is still
# validated against the Windows trust store.
#
# Pagination: PostgREST silently caps every response at 1000 rows (rule 8 /
# ADR-0021) — `predictions` already exceeds it, so a single unpaged GET was
# truncating the backup with no error. Page via the Range header and merge.
fetch_table() {
  local t="$1" from=0 page="$dir/.page.tmp"
  # stable order for pagination; every table has `id` except standings_cache
  local ord="id.asc"
  [ "$t" = "standings_cache" ] && ord="user_id.asc"
  printf '[' > "$dir/$t.json"
  local first=1
  while :; do
    curl -sf --ssl-no-revoke "$URL/rest/v1/$t?select=*&order=$ord" \
      -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
      -H "Range: $from-$((from + 999))" \
      -o "$page"
    local n
    n=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$page','utf8')).length)")
    if [ "$n" -gt 0 ]; then
      [ "$first" -eq 0 ] && printf ',' >> "$dir/$t.json"
      # strip the page's surrounding brackets and append its elements
      node -e "const r=JSON.parse(require('fs').readFileSync('$page','utf8'));process.stdout.write(JSON.stringify(r).slice(1,-1))" >> "$dir/$t.json"
      first=0
    fi
    [ "$n" -lt 1000 ] && break
    from=$((from + 1000))
  done
  printf ']' >> "$dir/$t.json"
  rm -f "$page"
}

for t in $TABLES; do
  fetch_table "$t"
done

# Full pg_dump too, when the connection string is available.
DBURL=$(grep '^DATABASE_URL=' .env.local 2>/dev/null | cut -d= -f2- | tr -d '\r"' || true)
if [ -n "${DBURL:-}" ]; then
  PATH="/c/Program Files/PostgreSQL/17/bin:$PATH" \
    DATABASE_URL="$DBURL" bash db/backup.sh
fi

echo "[$(date -u +%FT%TZ)] backup ok: $dir (pg_dump: $([ -n "${DBURL:-}" ] && echo yes || echo no — DATABASE_URL not set))"
