#!/usr/bin/env bash
#
# DigitalOcean Postgres → Neon data migration.
#
# Prerequisites (set in your shell):
#   DO_DATABASE_URL   — source (the live droplet's managed-pg connection string)
#   NEON_DATABASE_URL — destination (Neon connection string with WRITE access)
#
# What it does:
#   1. Dumps the 14 droplet-only tables to /tmp/do_dump.sql (data + schema)
#   2. Restores into Neon
#   3. Runs sanity row-count comparisons for each table
#
# Tables migrated (DigitalOcean → Neon):
#   admins, realtors, audit_log, giveaways, giveaway_rules, giveaway_entries,
#   subscribers, magic_links, password_reset_tokens, admin_password_resets,
#   email_log, webauthn_credentials, notification_preferences, webauthn_challenges
#
# Run this AFTER deploying the api-merge branch but BEFORE flipping prod traffic
# so live writes during cutover are minimal. Brief read-only window required
# for the dump phase (typically <60s for our data volume).

set -euo pipefail

: "${DO_DATABASE_URL:?DO_DATABASE_URL must be set}"
: "${NEON_DATABASE_URL:?NEON_DATABASE_URL must be set}"

DUMP=/tmp/do_dump.sql
TABLES=(
  admins
  realtors
  audit_log
  giveaways
  giveaway_rules
  giveaway_entries
  subscribers
  magic_links
  password_reset_tokens
  admin_password_resets
  email_log
  webauthn_credentials
  notification_preferences
  webauthn_challenges
)

echo "==> Dumping ${#TABLES[@]} tables from DO Postgres..."
TBL_FLAGS=()
for t in "${TABLES[@]}"; do
  TBL_FLAGS+=("-t" "$t")
done

pg_dump \
  --no-owner \
  --no-privileges \
  --if-exists \
  --clean \
  "${TBL_FLAGS[@]}" \
  "$DO_DATABASE_URL" \
  > "$DUMP"

echo "    Dump size: $(du -h "$DUMP" | cut -f1)"

echo "==> Restoring into Neon..."
psql "$NEON_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$DUMP"

echo "==> Comparing row counts..."
printf "%-30s %12s %12s %s\n" TABLE DO NEON STATUS
for t in "${TABLES[@]}"; do
  do_count=$(psql "$DO_DATABASE_URL" -tAc "SELECT count(*) FROM $t" 2>/dev/null || echo "ERR")
  neon_count=$(psql "$NEON_DATABASE_URL" -tAc "SELECT count(*) FROM $t" 2>/dev/null || echo "ERR")
  if [ "$do_count" = "$neon_count" ]; then
    status="✓"
  else
    status="✗ MISMATCH"
  fi
  printf "%-30s %12s %12s %s\n" "$t" "$do_count" "$neon_count" "$status"
done

echo
echo "==> Done. If all rows match, you can now:"
echo "    1. Update Vercel env: drop DO_DATABASE_URL"
echo "    2. Redeploy"
echo "    3. Verify with /api/ready"
echo "    4. Decommission the droplet + DO managed-pg"
