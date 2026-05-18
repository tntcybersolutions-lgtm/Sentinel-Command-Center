#!/usr/bin/env bash
# db-heal.sh — make all DB tables match shared/schema.ts via idempotent ALTERs.
# Run after curl-syncing files from GitHub origin/main.
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL not set; aborting"
  exit 1
fi

echo "== Heal blueprints table =="
psql "$DATABASE_URL" <<'SQL'
CREATE TABLE IF NOT EXISTS blueprints (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(36) NOT NULL,
  bid_project_id varchar(36),
  project_id varchar(36),
  title text NOT NULL,
  file_name text NOT NULL,
  storage_key text NOT NULL,
  file_size integer NOT NULL,
  mime_type text DEFAULT 'application/pdf',
  page_count integer DEFAULT 1,
  scale text,
  pixels_per_foot_by_page jsonb,
  calibrated_at timestamptz,
  category text NOT NULL DEFAULT 'General',
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS pixels_per_foot_by_page jsonb;
ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS calibrated_at timestamptz;
ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'General';
ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS uploaded_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS mime_type text DEFAULT 'application/pdf';
ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS page_count integer DEFAULT 1;
ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS scale text;
ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS bid_project_id varchar(36);
ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS project_id varchar(36);
SQL

echo ""
echo "== Heal punch_items GPS columns =="
psql "$DATABASE_URL" <<'SQL'
ALTER TABLE punch_items ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE punch_items ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE punch_items ADD COLUMN IF NOT EXISTS geo_accuracy double precision;
SQL

echo ""
echo "== Heal field_daily_logs GPS columns =="
psql "$DATABASE_URL" <<'SQL'
ALTER TABLE field_daily_logs ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE field_daily_logs ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE field_daily_logs ADD COLUMN IF NOT EXISTS geo_accuracy double precision;
SQL

echo ""
echo "== Verify blueprints table is queryable =="
psql "$DATABASE_URL" -c "SELECT COUNT(*) AS row_count FROM blueprints;"

echo ""
echo "=== ALL HEALS APPLIED — restart the server (workspace Run button or Republish) ==="
