#!/bin/sh
# Nightly backup: pg_dump (custom format, compressed) plus a tarball of local uploads.
# Keeps the last BACKUP_KEEP_DAYS days locally and, if BACKUP_S3_URI is set, copies to S3
# with the aws CLI. Run from cron or the "backup" service in docker-compose.prod.yml.
#
#   DATABASE_URL=postgresql://... UPLOAD_DIR=/app/uploads BACKUP_DIR=/backups ./scripts/backup.sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
UPLOAD_DIR="${UPLOAD_DIR:-}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

DB_FILE="$BACKUP_DIR/db-$STAMP.dump"
echo "Dumping database to $DB_FILE"
pg_dump --format=custom --compress=6 --no-owner --no-privileges --file="$DB_FILE" "$DATABASE_URL"

if [ -n "$UPLOAD_DIR" ] && [ -d "$UPLOAD_DIR" ]; then
  FILES_FILE="$BACKUP_DIR/uploads-$STAMP.tar.gz"
  echo "Archiving uploads to $FILES_FILE"
  tar -czf "$FILES_FILE" -C "$UPLOAD_DIR" .
fi

if [ -n "${BACKUP_S3_URI:-}" ]; then
  echo "Copying to $BACKUP_S3_URI"
  aws s3 cp "$DB_FILE" "$BACKUP_S3_URI/"
  [ -n "${FILES_FILE:-}" ] && aws s3 cp "$FILES_FILE" "$BACKUP_S3_URI/"
fi

echo "Pruning local backups older than $KEEP_DAYS days"
find "$BACKUP_DIR" -type f \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
echo "Backup complete: $STAMP"
