#!/usr/bin/env node
// Data quality gate.
//
// Runs against the production DB to catch bad PO records before they ship.
// MUST gracefully skip when DATABASE_URL is unset or unreachable (e.g. inside
// Replit Autoscale's deploy build container, which has no DB access). Without
// this skip, a connection refused error in the gate kills the entire build
// and Replit silently serves the previous bundle.

const { Client } = require("pg");

const DB_URL = process.env.DATABASE_URL;

// Hard skip: no DB configured at all. Treat as "not applicable in this env."
if (!DB_URL) {
  console.log("[DATA QUALITY GATE] SKIPPED — DATABASE_URL not set (deploy build env).");
  process.exit(0);
}

async function main() {
  const client = new Client({ connectionString: DB_URL });

  // Connect with a short timeout. If the DB is unreachable in this environment
  // (e.g. deploy build container), skip cleanly rather than killing the build.
  try {
    await Promise.race([
      client.connect(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("connect-timeout")), 4000)),
    ]);
  } catch (e) {
    const msg = String(e && e.message || e);
    const isNetworkLevel =
      msg.includes("ECONNREFUSED") ||
      msg.includes("ENOTFOUND") ||
      msg.includes("ETIMEDOUT") ||
      msg.includes("connect-timeout") ||
      msg.includes("no pg_hba");
    if (isNetworkLevel) {
      console.log(`[DATA QUALITY GATE] SKIPPED — DB unreachable in this env (${msg.slice(0, 80)}).`);
      process.exit(0);
    }
    // Anything else (auth failure on a reachable DB, etc.) is a real problem.
    console.error("[DATA QUALITY GATE ERROR]", e);
    process.exit(1);
  }

  let totalViolations = 0;

  // 1) Repeated (Copy) chains in PO numbers
  const { rows: copyChainsRows } = await client.query(`
    SELECT id, po_number
    FROM purchase_orders
    WHERE po_number ~* '\\(copy\\).*\\(copy\\)'
  `);
  if (copyChainsRows.length > 0) {
    console.error("\n[DATA QUALITY] FAILED: POs with repeated (Copy) chains:");
    for (const r of copyChainsRows) {
      console.error(`  ID: ${r.id} | poNumber: ${r.po_number}`);
    }
    totalViolations += copyChainsRows.length;
  }

  // 2) Placeholder/TBD strings in PO numbers
  const { rows: placeholderRows } = await client.query(`
    SELECT id, po_number
    FROM purchase_orders
    WHERE po_number ~* '(placeholder|TBD|fake|lorem)'
  `);
  if (placeholderRows.length > 0) {
    console.error("\n[DATA QUALITY] FAILED: POs with placeholder strings:");
    for (const r of placeholderRows) {
      console.error(`  ID: ${r.id} | poNumber: ${r.po_number}`);
    }
    totalViolations += placeholderRows.length;
  }

  // 3) Issued POs with null order_date or zero total
  const { rows: issuedBadRows } = await client.query(`
    SELECT id, po_number, status, order_date, total_amount
    FROM purchase_orders
    WHERE status = 'issued'
      AND (order_date IS NULL OR CAST(total_amount AS numeric) = 0)
  `);
  if (issuedBadRows.length > 0) {
    console.error("\n[DATA QUALITY] WARNING: Issued POs with null date or zero total:");
    for (const r of issuedBadRows) {
      console.error(`  ID: ${r.id} | poNumber: ${r.po_number} | orderDate: ${r.order_date} | total: ${r.total_amount}`);
    }
    // These are warnings, not hard failures — they get flagged with needs_review
  }

  await client.end();

  if (totalViolations > 0) {
    console.error(`\n[DATA QUALITY GATE] FAILED — ${totalViolations} critical violation(s).`);
    console.error("Run: node scripts/repair-purchase-orders.cjs to fix.\n");
    process.exit(1);
  } else {
    console.log("[DATA QUALITY GATE] PASSED");
    if (issuedBadRows.length > 0) {
      console.log(`  (${issuedBadRows.length} issued POs flagged for review — not blocking)`);
    }
  }
}

main().catch(err => {
  console.error("[DATA QUALITY GATE ERROR]", err);
  process.exit(1);
});
