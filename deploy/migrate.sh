#!/usr/bin/env bash
# Applies any new migration files to the self-hosted database, once each.
# Usage: DATABASE_URL=postgres://postgres:PASS@localhost:5432/postgres ./deploy/migrate.sh
set -euo pipefail
cd "$(dirname "$0")/.."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
  "CREATE TABLE IF NOT EXISTS public._deploy_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now());"
for f in supabase/migrations/*.sql drizzle/migrations/0*.sql; do
  done=$(psql "$DATABASE_URL" -tAc "SELECT 1 FROM public._deploy_migrations WHERE name='$f'")
  if [ -z "$done" ]; then
    echo "Applying $f"
    { echo "BEGIN;"; sed 's/--> statement-breakpoint//' "$f"; echo "INSERT INTO public._deploy_migrations(name) VALUES ('$f');"; echo "COMMIT;"; } \
      | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q
  fi
done
echo "Database is up to date."
