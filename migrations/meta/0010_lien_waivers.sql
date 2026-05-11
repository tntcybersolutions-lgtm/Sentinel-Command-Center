-- Migration: 0010_lien_waivers.sql
-- Creates lien waiver tables for 50-state auto-population system

-- ─── Enums ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE lien_waiver_type AS ENUM (
      'conditional_progress',
      'unconditional_progress',
      'conditional_final',
      'unconditional_final'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE lien_waiver_status AS ENUM (
      'missing',
      'uploaded',
      'approved'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── lien_waiver_templates ───────────────────────────────────────────────────
-- Stores the 200 canonical templates (50 states x 4 types) per tenant

CREATE TABLE IF NOT EXISTS lien_waiver_templates (
    id              VARCHAR(36)       PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       VARCHAR(100)      NOT NULL,
    state_code      CHAR(2)           NOT NULL,
    state_name      VARCHAR(100)      NOT NULL,
    waiver_type     lien_waiver_type  NOT NULL,
    title           TEXT              NOT NULL,
    description     TEXT,
    is_active       BOOLEAN           NOT NULL DEFAULT TRUE,
    sort_order      INTEGER           NOT NULL DEFAULT 0,
    created_at      TIMESTAMP         NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP         NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, state_code, waiver_type)
  );

CREATE INDEX IF NOT EXISTS idx_lien_waiver_templates_tenant
  ON lien_waiver_templates (tenant_id);

CREATE INDEX IF NOT EXISTS idx_lien_waiver_templates_state
  ON lien_waiver_templates (tenant_id, state_code);

-- ─── project_lien_waivers ────────────────────────────────────────────────────
-- Tracks per-project lien waiver document slots (auto-created on project create)

CREATE TABLE IF NOT EXISTS project_lien_waivers (
    id              VARCHAR(36)       PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       VARCHAR(100)      NOT NULL,
    project_id      VARCHAR(36)       NOT NULL,
    folder_id       VARCHAR(36),
    template_id     VARCHAR(36),
    state_code      CHAR(2)           NOT NULL,
    state_name      VARCHAR(100)      NOT NULL,
    waiver_type     lien_waiver_type  NOT NULL,
    title           TEXT              NOT NULL,
    description     TEXT,
    status          lien_waiver_status NOT NULL DEFAULT 'missing',
    storage_key     TEXT,
    uploaded_by     VARCHAR(36),
    uploaded_at     TIMESTAMP,
    approved_by     VARCHAR(36),
    approved_at     TIMESTAMP,
    notes           TEXT,
    created_at      TIMESTAMP         NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP         NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, project_id, waiver_type)
  );

CREATE INDEX IF NOT EXISTS idx_project_lien_waivers_project
  ON project_lien_waivers (tenant_id, project_id);

CREATE INDEX IF NOT EXISTS idx_project_lien_waivers_status
  ON project_lien_waivers (tenant_id, status);
