-- Migration 0013: extend calendar_events table
-- Adds kind enum, record_type, record_id columns so events can be linked to any record
-- calendar_events table already exists in schema.ts (line 450); this ALTER is idempotent

DO $$ BEGIN
  CREATE TYPE calendar_event_kind AS ENUM ('item', 'meeting', 'note');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS kind          TEXT NOT NULL DEFAULT 'note'
                                         CHECK (kind IN ('item', 'meeting', 'note')),
  ADD COLUMN IF NOT EXISTS record_type   TEXT NULL,
  ADD COLUMN IF NOT EXISTS record_id     UUID NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_events_tenant_date
  ON calendar_events (tenant_id, event_date);

CREATE INDEX IF NOT EXISTS idx_calendar_events_record
  ON calendar_events (tenant_id, record_type, record_id)
  WHERE record_type IS NOT NULL;
