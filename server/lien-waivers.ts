import { db } from "./db";
import { sql } from "drizzle-orm";
import { pgTable, varchar, text, boolean, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { randomUUID } from "node:crypto";

const createId = () => randomUUID();

// ─── Lien Waiver Types ────────────────────────────────────────────────────────

export const lienWaiverTypeEnum = pgEnum("lien_waiver_type", [
    "conditional_progress",
    "unconditional_progress",
    "conditional_final",
    "unconditional_final",
  ]);

export const lienWaiverStatusEnum = pgEnum("lien_waiver_status", [
    "missing",
    "uploaded",
    "approved",
  ]);

// ─── All 50 US States ─────────────────────────────────────────────────────────

export const US_STATES: { code: string; name: string }[] = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
  ];

export const WAIVER_TYPES: { type: string; title: string; description: string }[] = [
  {
        type: "conditional_progress",
        title: "Conditional Waiver and Release on Progress Payment",
        description: "Waives lien rights conditioned on receipt of a specific progress payment. Used during active construction.",
  },
  {
        type: "unconditional_progress",
        title: "Unconditional Waiver and Release on Progress Payment",
        description: "Unconditionally waives lien rights through a specific date upon receipt of progress payment.",
  },
  {
        type: "conditional_final",
        title: "Conditional Waiver and Release on Final Payment",
        description: "Waives all lien rights conditioned on receipt of the final payment upon project completion.",
  },
  {
        type: "unconditional_final",
        title: "Unconditional Waiver and Release on Final Payment",
        description: "Unconditionally waives all lien rights upon receipt of final payment. Project is complete.",
  },
  ];

// ─── Seed: generate all 200 templates (50 states x 4 types) ──────────────────

/**
 * Bring lien_waiver_templates up to the shape this seeder expects.
 *
 * migrations/meta/0010_lien_waivers.sql uses CREATE TABLE IF NOT EXISTS, which
 * is a no-op when an older version of the table is already present. On any
 * database that had a prior lien_waiver_templates, that migration therefore
 * "succeeded" while leaving columns missing, and every boot since has logged:
 *
 *   Failed to seed lien waiver templates: column "tenant_id" does not exist
 *
 * Nothing in this repo runs the .sql files in migrations/meta automatically —
 * they are applied by hand — so the repair has to happen where the seeder can
 * guarantee it runs. Every statement below is idempotent and safe against an
 * already-correct schema.
 */
async function ensureLienWaiverTemplateSchema(): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE lien_waiver_type AS ENUM (
        'conditional_progress',
        'unconditional_progress',
        'conditional_final',
        'unconditional_final'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS lien_waiver_templates (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text
    );
  `);

  // Added without NOT NULL: an existing table may already hold rows, and a
  // NOT NULL add would fail on them. The seeder always supplies these values.
  await db.execute(sql`
    ALTER TABLE lien_waiver_templates
      ADD COLUMN IF NOT EXISTS tenant_id   VARCHAR(100),
      ADD COLUMN IF NOT EXISTS state_code  CHAR(2),
      ADD COLUMN IF NOT EXISTS state_name  VARCHAR(100),
      ADD COLUMN IF NOT EXISTS waiver_type lien_waiver_type,
      ADD COLUMN IF NOT EXISTS title       TEXT,
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS is_active   BOOLEAN   NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS sort_order  INTEGER   NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMP NOT NULL DEFAULT NOW();
  `);

  // The seeder's INSERT relies on ON CONFLICT DO NOTHING, which needs this
  // constraint to make re-seeding idempotent rather than duplicating 200 rows.
  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE lien_waiver_templates
        ADD CONSTRAINT lien_waiver_templates_tenant_state_type_key
        UNIQUE (tenant_id, state_code, waiver_type);
    EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
    END $$;
  `);
}

export async function seedLienWaiverTemplates(tenantId: string): Promise<void> {
    await ensureLienWaiverTemplateSchema();

    const existing = await db.execute(
          sql`SELECT COUNT(*)::int as count FROM lien_waiver_templates WHERE tenant_id = ${tenantId}`
        );
    const count = (existing.rows[0] as any)?.count ?? 0;
    if (count >= 200) return; // already seeded

  const rows: any[] = [];
    let sortOrder = 0;
    for (const state of US_STATES) {
          for (const waiver of WAIVER_TYPES) {
                  rows.push({
                            id: createId(),
                            tenant_id: tenantId,
                            state_code: state.code,
                            state_name: state.name,
                            waiver_type: waiver.type,
                            title: `${state.name} – ${waiver.title}`,
                            description: waiver.description,
                            is_active: true,
                            sort_order: sortOrder++,
                            created_at: new Date(),
                            updated_at: new Date(),
                  });
          }
    }

  for (const row of rows) {
        await db.execute(sql`
              INSERT INTO lien_waiver_templates (
                      id, tenant_id, state_code, state_name, waiver_type,
                              title, description, is_active, sort_order, created_at, updated_at
                                    ) VALUES (
                                            ${row.id}, ${row.tenant_id}, ${row.state_code}, ${row.state_name},
                                                    ${row.waiver_type}::lien_waiver_type, ${row.title}, ${row.description},
                                                            ${row.is_active}, ${row.sort_order}, ${row.created_at}, ${row.updated_at}
                                                                  ) ON CONFLICT DO NOTHING
                                                                      `);
  }
}

// ─── Get templates by state ───────────────────────────────────────────────────

export async function getLienWaiverTemplatesByState(
    tenantId: string,
    stateCode: string
  ): Promise<any[]> {
    const result = await db.execute(sql`
        SELECT * FROM lien_waiver_templates
            WHERE tenant_id = ${tenantId}
                  AND state_code = ${stateCode.toUpperCase()}
                        AND is_active = true
                            ORDER BY sort_order ASC
                              `);
    return result.rows as any[];
}

// ─── Get all templates grouped by state ───────────────────────────────────────

export async function getAllLienWaiverTemplates(tenantId: string): Promise<any[]> {
    const result = await db.execute(sql`
        SELECT * FROM lien_waiver_templates
            WHERE tenant_id = ${tenantId} AND is_active = true
                ORDER BY state_code ASC, sort_order ASC
                  `);
    return result.rows as any[];
}

// ─── Create project lien waiver slots ────────────────────────────────────────

export async function createProjectLienWaivers(
    tenantId: string,
    projectId: string,
    stateCode: string
  ): Promise<any[]> {
    // Ensure lien waivers folder exists in the project jacket
  const folderPath = `/Projects/${projectId}/Lien_Waivers`;

  // Check if folder already exists
  const existingFolder = await db.execute(sql`
      SELECT id FROM jacket_folders
          WHERE tenant_id = ${tenantId}
                AND jacket_type = 'project'
                      AND jacket_id = ${projectId}
                            AND name = '16 - Lien Waivers'
                                LIMIT 1
                                  `);

  let folderId: string;
    if (existingFolder.rows.length > 0) {
          folderId = (existingFolder.rows[0] as any).id;
    } else {
          folderId = createId();
          await db.execute(sql`
                INSERT INTO jacket_folders (
                        id, tenant_id, jacket_type, jacket_id, name, path,
                                sort_order, is_system_folder, created_at, updated_at
                                      ) VALUES (
                                              ${folderId}, ${tenantId}, 'project', ${projectId},
                                                      '16 - Lien Waivers', ${folderPath},
                                                              16, true, NOW(), NOW()
                                                                    ) ON CONFLICT DO NOTHING
                                                                        `);
    }

  // Get templates for this state
  const templates = await getLienWaiverTemplatesByState(tenantId, stateCode);

  // If no state match, use a generic set
  const waiverSets = templates.length === 4 ? templates : WAIVER_TYPES.map((w, i) => ({
        id: `generic-${i}`,
        state_code: stateCode || "US",
        state_name: "All States",
        waiver_type: w.type,
        title: w.title,
        description: w.description,
  }));

  const created: any[] = [];
    for (const template of waiverSets) {
          // Check if already exists
      const existing = await db.execute(sql`
            SELECT id FROM project_lien_waivers
                  WHERE tenant_id = ${tenantId}
                          AND project_id = ${projectId}
                                  AND waiver_type = ${template.waiver_type}::lien_waiver_type
                                        LIMIT 1
                                            `);
          if (existing.rows.length > 0) {
                  created.push(existing.rows[0]);
                  continue;
          }

      const id = createId();
          await db.execute(sql`
                INSERT INTO project_lien_waivers (
                        id, tenant_id, project_id, folder_id, template_id,
                                state_code, state_name, waiver_type, title, description,
                                        status, created_at, updated_at
                                              ) VALUES (
                                                      ${id}, ${tenantId}, ${projectId}, ${folderId}, ${template.id},
                                                              ${template.state_code}, ${template.state_name},
                                                                      ${template.waiver_type}::lien_waiver_type,
                                                                              ${template.title}, ${template.description},
                                                                                      'missing'::lien_waiver_status, NOW(), NOW()
                                                                                            )
                                                                                                `);
          created.push({ id, waiver_type: template.waiver_type, status: "missing" });
    }

  return created;
}

// ─── Get project lien waivers ─────────────────────────────────────────────────

export async function getProjectLienWaivers(
    tenantId: string,
    projectId: string
  ): Promise<any[]> {
    const result = await db.execute(sql`
        SELECT
              plw.*,
                    jf.name as folder_name
                        FROM project_lien_waivers plw
                            LEFT JOIN jacket_folders jf ON jf.id = plw.folder_id
                                WHERE plw.tenant_id = ${tenantId}
                                      AND plw.project_id = ${projectId}
                                          ORDER BY
                                                CASE plw.waiver_type
                                                        WHEN 'conditional_progress' THEN 1
                                                                WHEN 'unconditional_progress' THEN 2
                                                                        WHEN 'conditional_final' THEN 3
                                                                                WHEN 'unconditional_final' THEN 4
                                                                                        ELSE 5
                                                                                              END ASC
                                                                                                `);
    return result.rows as any[];
}

// ─── Update lien waiver status ────────────────────────────────────────────────

export async function updateProjectLienWaiverStatus(
    tenantId: string,
    waiverId: string,
    status: "missing" | "uploaded" | "approved",
    storageKey?: string
  ): Promise<any> {
    await db.execute(sql`
        UPDATE project_lien_waivers
            SET status = ${status}::lien_waiver_status,
                    storage_key = ${storageKey ?? null},
                            updated_at = NOW()
                                WHERE id = ${waiverId} AND tenant_id = ${tenantId}
                                  `);
    const result = await db.execute(sql`
        SELECT * FROM project_lien_waivers WHERE id = ${waiverId}
          `);
    return result.rows[0];
}
