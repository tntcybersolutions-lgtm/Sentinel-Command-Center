-- Migration 0012: create record_notes table
-- Stores notes/comments attached to any record (takeoff_item, bid_artifact, project, etc.)

CREATE TABLE IF NOT EXISTS record_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id   UUID NOT NULL,
  body        TEXT NOT NULL,
  created_by  TEXT NOT NULL DEFAULT 'system',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_record_notes_lookup
  ON record_notes (tenant_id, record_type, record_id);

CREATE INDEX IF NOT EXISTS idx_record_notes_tenant
  ON record_notes (tenant_id, created_at DESC);
