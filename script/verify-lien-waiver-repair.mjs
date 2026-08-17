/**
 * Proves the lien_waiver_templates schema repair works on a table that is
 * already present in the broken shape.
 *
 *   node script/verify-lien-waiver-repair.mjs
 *
 * Reproduces the exact production condition: a lien_waiver_templates table that
 * predates migration 0010, so `CREATE TABLE IF NOT EXISTS` was a no-op and the
 * columns the seeder needs were never added. That is what produced
 * "column tenant_id does not exist" on every boot.
 *
 * Runs against a real Postgres engine (PGlite, in-process). No DATABASE_URL.
 */
import { PGlite } from "@electric-sql/pglite";

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`  PASS  ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}\n          expected ${e}\n          actual   ${a}`);
  }
}

// The same statements ensureLienWaiverTemplateSchema() runs, in order.
const REPAIR = [
  `DO $$ BEGIN
     CREATE TYPE lien_waiver_type AS ENUM (
       'conditional_progress','unconditional_progress','conditional_final','unconditional_final'
     );
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  `CREATE TABLE IF NOT EXISTS lien_waiver_templates (
     id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text
   );`,

  `ALTER TABLE lien_waiver_templates
     ADD COLUMN IF NOT EXISTS tenant_id   VARCHAR(100),
     ADD COLUMN IF NOT EXISTS state_code  CHAR(2),
     ADD COLUMN IF NOT EXISTS state_name  VARCHAR(100),
     ADD COLUMN IF NOT EXISTS waiver_type lien_waiver_type,
     ADD COLUMN IF NOT EXISTS title       TEXT,
     ADD COLUMN IF NOT EXISTS description TEXT,
     ADD COLUMN IF NOT EXISTS is_active   BOOLEAN   NOT NULL DEFAULT TRUE,
     ADD COLUMN IF NOT EXISTS sort_order  INTEGER   NOT NULL DEFAULT 0,
     ADD COLUMN IF NOT EXISTS created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
     ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMP NOT NULL DEFAULT NOW();`,

  `DO $$ BEGIN
     ALTER TABLE lien_waiver_templates
       ADD CONSTRAINT lien_waiver_templates_tenant_state_type_key
       UNIQUE (tenant_id, state_code, waiver_type);
   EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;`,
];

async function repair(db) {
  for (const stmt of REPAIR) await db.exec(stmt);
}

async function columns(db) {
  const r = await db.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'lien_waiver_templates' ORDER BY column_name`
  );
  return r.rows.map((x) => x.column_name);
}

async function main() {
  const db = new PGlite();

  // ── The broken production shape: table exists, tenant_id does not ─────────
  console.log("\nPROOF 1 — reproduce the failure");
  await db.exec(`
    CREATE TABLE lien_waiver_templates (
      id    VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      title TEXT
    );
  `);

  let failedAsProduction = false;
  try {
    await db.query(
      `SELECT COUNT(*)::int AS count FROM lien_waiver_templates WHERE tenant_id = 'blackhawk-default'`
    );
  } catch (e) {
    failedAsProduction = /tenant_id/.test(e.message);
  }
  check("the seeder's count query fails exactly as it does in production", failedAsProduction, true);
  check("CREATE TABLE IF NOT EXISTS would not fix it (table already exists)", (await columns(db)).includes("tenant_id"), false);

  // ── Repair ───────────────────────────────────────────────────────────────
  console.log("\nPROOF 2 — the repair");
  await repair(db);

  const cols = await columns(db);
  check("every column the seeder writes now exists", [
    "created_at", "description", "id", "is_active", "sort_order",
    "state_code", "state_name", "tenant_id", "title", "updated_at", "waiver_type",
  ].every((c) => cols.includes(c)), true);

  const countAfter = await db.query(
    `SELECT COUNT(*)::int AS count FROM lien_waiver_templates WHERE tenant_id = 'blackhawk-default'`
  );
  check("the seeder's count query now succeeds", Number(countAfter.rows[0].count), 0);

  // ── The seeder's actual INSERT, including ON CONFLICT ────────────────────
  console.log("\nPROOF 3 — seeding is idempotent");
  const insert = async () =>
    db.query(
      `INSERT INTO lien_waiver_templates
         (id, tenant_id, state_code, state_name, waiver_type, title, description, is_active, sort_order, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5::lien_waiver_type,$6,$7,$8,$9,NOW(),NOW())
       ON CONFLICT DO NOTHING`,
      ["id-1", "blackhawk-default", "AZ", "Arizona", "conditional_progress", "Arizona – Conditional Progress", "desc", true, 0]
    );

  await insert();
  const first = await db.query(`SELECT COUNT(*)::int AS c FROM lien_waiver_templates`);
  check("first insert lands", Number(first.rows[0].c), 1);

  // Same (tenant, state, type) with a different id — the UNIQUE constraint is
  // what makes ON CONFLICT DO NOTHING work. Without it this would duplicate.
  await db.query(
    `INSERT INTO lien_waiver_templates
       (id, tenant_id, state_code, state_name, waiver_type, title, description, is_active, sort_order, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5::lien_waiver_type,$6,$7,$8,$9,NOW(),NOW())
     ON CONFLICT DO NOTHING`,
    ["id-2", "blackhawk-default", "AZ", "Arizona", "conditional_progress", "dupe", "desc", true, 0]
  );
  const second = await db.query(`SELECT COUNT(*)::int AS c FROM lien_waiver_templates`);
  check("re-seeding the same state/type does NOT duplicate", Number(second.rows[0].c), 1);

  // ── Running the repair twice must be harmless ─────────────────────────────
  console.log("\nPROOF 4 — repair is idempotent");
  let secondRunThrew = false;
  try {
    await repair(db);
  } catch (e) {
    secondRunThrew = true;
    console.log("      ", e.message);
  }
  check("running the repair again does not throw", secondRunThrew, false);
  check("and does not disturb existing rows", Number((await db.query(`SELECT COUNT(*)::int AS c FROM lien_waiver_templates`)).rows[0].c), 1);

  // ── And on a database that never had the table at all ─────────────────────
  console.log("\nPROOF 5 — works from nothing");
  const fresh = new PGlite();
  await repair(fresh);
  const freshCols = await (async () => {
    const r = await fresh.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'lien_waiver_templates'`
    );
    return r.rows.map((x) => x.column_name);
  })();
  check("a brand new database gets the full table", freshCols.includes("tenant_id") && freshCols.includes("waiver_type"), true);
  await fresh.close();

  await db.close();

  console.log(`\n${checks - failures}/${checks} checks passed.`);
  if (failures > 0) {
    console.error(`${failures} FAILED`);
    process.exit(1);
  }
  console.log("ALL CHECKS PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
