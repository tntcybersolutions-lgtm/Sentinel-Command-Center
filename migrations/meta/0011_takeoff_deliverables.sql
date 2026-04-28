-- Migration: 0011_takeoff_deliverables.sql
-- Creates takeoff_deliverables table for the 9 Takeoff Engine deliverable generators.
-- Each row is one generated document. UPSERT on (bid_project_id, deliverable_type)
-- ensures idempotent generation — rerunning Generate never creates duplicates.

-- ─── Enum: deliverable type ──────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE takeoff_deliverable_type AS ENUM (
    'trade_scope',
    'bid_package',
    'material_list',
    'cable_schedule',
    'device_schedule',
    'rack_elevation',
    'as_built',
    'owner_handoff',
    'smart_config'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Enum: generation status ─────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE takeoff_deliverable_status AS ENUM (
    'pending',
    'generating',
    'complete',
    'error'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── takeoff_deliverables ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS takeoff_deliverables (
  id                  VARCHAR(36)                     PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id           VARCHAR(36)                     NOT NULL,
  bid_project_id      VARCHAR(36)                     NOT NULL,
  deliverable_type    takeoff_deliverable_type         NOT NULL,
  title               TEXT                            NOT NULL,
  content_markdown    TEXT                            NOT NULL DEFAULT '',
  status              takeoff_deliverable_status      NOT NULL DEFAULT 'complete',
  generation_model    TEXT,
  generation_ms       INTEGER,
  storage_key         TEXT,
  created_at          TIMESTAMP                       NOT NULL DEFAULT now(),
  updated_at          TIMESTAMP                       NOT NULL DEFAULT now()
);

-- Unique constraint enables the ON CONFLICT UPSERT pattern in the generator.
-- One row per (bid_project_id, deliverable_type) — never duplicated.
DO $$ BEGIN
  ALTER TABLE takeoff_deliverables
    ADD CONSTRAINT uq_takeoff_deliverables_project_type
    UNIQUE (bid_project_id, deliverable_type);
EXCEPTION WHEN duplicate_table THEN NULL;
       WHEN duplicate_object THEN NULL;
END $$;

-- Index for tenant-scoped list queries
CREATE INDEX IF NOT EXISTS idx_takeoff_deliverables_tenant_project
  ON takeoff_deliverables (tenant_id, bid_project_id);
