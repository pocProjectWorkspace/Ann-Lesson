#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set" >&2
  exit 1
fi
if [ -z "$AUTH_SECRET" ] || [ ${#AUTH_SECRET} -lt 32 ]; then
  echo "AUTH_SECRET must be set to at least 32 characters" >&2
  exit 1
fi

PRISMA="node /app/tools/node_modules/prisma/build/index.js"

# Apply pending migrations. Safe to run on every start; it is a no-op when up to date.
if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  echo "Applying database migrations..."
  $PRISMA migrate deploy
fi

# Create the platform owner if no super admin exists yet (idempotent).
if [ "${SKIP_SEED:-0}" != "1" ] && [ -n "$SUPER_ADMIN_PASSWORD" ]; then
  echo "Ensuring the platform owner account exists..."
  NODE_PATH=/app/tools/node_modules node /app/tools/node_modules/tsx/dist/cli.mjs /app/prisma/seed.ts || echo "Seed skipped or failed; continuing."
fi

exec "$@"
