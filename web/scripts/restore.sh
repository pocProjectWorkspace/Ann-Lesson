#!/bin/sh
# Restore a backup made by backup.sh.
#   DATABASE_URL=postgresql://... ./scripts/restore.sh /backups/db-20260101-020000.dump [/backups/uploads-20260101-020000.tar.gz /app/uploads]
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
DB_FILE="${1:?path to db-*.dump}"
FILES_FILE="${2:-}"
UPLOAD_DIR="${3:-}"

echo "Restoring database from $DB_FILE (existing objects are dropped first)"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$DB_FILE"

if [ -n "$FILES_FILE" ] && [ -n "$UPLOAD_DIR" ]; then
  echo "Restoring uploads into $UPLOAD_DIR"
  mkdir -p "$UPLOAD_DIR"
  tar -xzf "$FILES_FILE" -C "$UPLOAD_DIR"
fi
echo "Restore complete"
