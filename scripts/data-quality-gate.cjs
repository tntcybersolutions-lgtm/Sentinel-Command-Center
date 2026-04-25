#!/usr/bin/env node
const { Client } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("[DATA QUALITY GATE] SKIPPED (no DATABASE_URL at build time)");
    process.exit(0);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

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
