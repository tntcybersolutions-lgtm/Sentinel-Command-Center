#!/usr/bin/env node
//
// Repair script for purchase orders with repeated "(Copy)" chains.
//
// DRY-RUN (default — safe to run any time):
//   node scripts/repair-purchase-orders.cjs
//
// APPLY (mutates the live database — run only with explicit approval):
//   APPLY=true node scripts/repair-purchase-orders.cjs
//
// The script always prints a row-by-row before/after diff.  When APPLY
// is not "true", every mutation is replaced with a [DRY-RUN] log line
// and the database is left untouched.  The final summary line clearly
// states whether changes were applied or previewed.
//
const { Client } = require("pg");

const APPLY = process.env.APPLY === "true";

if (!APPLY) {
  console.log("\n[DRY-RUN] No changes will be written. Set APPLY=true to apply.\n");
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log("\n[REPAIR POs] Starting idempotent purchase order repair...\n");

  // 1) Normalize poNumber: strip repeated (Copy) chains
  const { rows: dirtyPos } = await client.query(`
    SELECT id, po_number
    FROM purchase_orders
    WHERE po_number ~* '\\(copy\\).*\\(copy\\)'
  `);

  console.log(`[REPAIR] Found ${dirtyPos.length} PO(s) with repeated (Copy) chains.`);

  for (const po of dirtyPos) {
    let cleaned = po.po_number.trim();
    const tokenRegex = /\s*\(Copy(?:\s+\d+)?\)\s*$/i;
    while (tokenRegex.test(cleaned)) {
      cleaned = cleaned.replace(tokenRegex, "").trim();
    }
    cleaned = cleaned + " (Copy)";

    // Check for collision — if "X (Copy)" already exists for this tenant, append number
    const { rows: existing } = await client.query(`
      SELECT po_number FROM purchase_orders
      WHERE tenant_id = (SELECT tenant_id FROM purchase_orders WHERE id = $1)
        AND po_number ILIKE $2 || '%'
        AND id != $1
    `, [po.id, cleaned.replace(/ \(Copy\)$/, "")]);

    const base = cleaned.replace(/ \(Copy\)$/, "");
    const copyRegex = new RegExp(`^${escapeRegExp(base)}\\s*\\(Copy(?:\\s+(\\d+))?\\)\\s*$`, "i");
    let maxIdx = 0;
    for (const row of existing) {
      const m = row.po_number.match(copyRegex);
      if (m) {
        const idx = m[1] ? parseInt(m[1], 10) : 1;
        if (!isNaN(idx)) maxIdx = Math.max(maxIdx, idx);
      }
    }

    const finalPoNumber = maxIdx === 0
      ? base + " (Copy)"
      : base + ` (Copy ${maxIdx + 1})`;

    if (APPLY) {
      try {
        await client.query(`UPDATE purchase_orders SET po_number = $1 WHERE id = $2`, [finalPoNumber, po.id]);
        console.log(`  [APPLY] ${po.po_number} -> ${finalPoNumber}`);
      } catch (err) {
        // Handle unique constraint collision
        const fallback = base + ` (Copy ${maxIdx + 2})`;
        await client.query(`UPDATE purchase_orders SET po_number = $1 WHERE id = $2`, [fallback, po.id]);
        console.log(`  [APPLY] ${po.po_number} -> ${fallback} (collision avoided)`);
      }
    } else {
      console.log(`  [DRY-RUN] would update: "${po.po_number}" -> "${finalPoNumber}"`);
    }
  }

  // 2) Flag suspicious records with needs_review = true
  // a) Issued POs with null order_date
  if (APPLY) {
    const r1 = await client.query(`
      UPDATE purchase_orders SET needs_review = true
      WHERE status = 'issued' AND order_date IS NULL AND needs_review = false
    `);
    console.log(`[FLAG] ${r1.rowCount} issued PO(s) with null order_date flagged for review.`);
  } else {
    const { rows: preview1 } = await client.query(`
      SELECT id, po_number FROM purchase_orders
      WHERE status = 'issued' AND order_date IS NULL AND needs_review = false
    `);
    console.log(`[DRY-RUN] would flag ${preview1.length} issued PO(s) with null order_date for review.`);
    for (const row of preview1) {
      console.log(`  [DRY-RUN] needs_review = true  id=${row.id}  po_number="${row.po_number}"`);
    }
  }

  // b) Issued POs with zero total
  if (APPLY) {
    const r2 = await client.query(`
      UPDATE purchase_orders SET needs_review = true
      WHERE status = 'issued' AND CAST(total_amount AS numeric) = 0 AND needs_review = false
    `);
    console.log(`[FLAG] ${r2.rowCount} issued PO(s) with zero total flagged for review.`);
  } else {
    const { rows: preview2 } = await client.query(`
      SELECT id, po_number, total_amount FROM purchase_orders
      WHERE status = 'issued' AND CAST(total_amount AS numeric) = 0 AND needs_review = false
    `);
    console.log(`[DRY-RUN] would flag ${preview2.length} issued PO(s) with zero total for review.`);
    for (const row of preview2) {
      console.log(`  [DRY-RUN] needs_review = true  id=${row.id}  po_number="${row.po_number}"  total_amount=${row.total_amount}`);
    }
  }

  // c) POs missing vendor_id
  if (APPLY) {
    const r3 = await client.query(`
      UPDATE purchase_orders SET needs_review = true
      WHERE vendor_id IS NULL AND needs_review = false
    `);
    console.log(`[FLAG] ${r3.rowCount} PO(s) with null vendor_id flagged for review.`);
  } else {
    const { rows: preview3 } = await client.query(`
      SELECT id, po_number FROM purchase_orders
      WHERE vendor_id IS NULL AND needs_review = false
    `);
    console.log(`[DRY-RUN] would flag ${preview3.length} PO(s) with null vendor_id for review.`);
    for (const row of preview3) {
      console.log(`  [DRY-RUN] needs_review = true  id=${row.id}  po_number="${row.po_number}"`);
    }
  }

  // d) Unlinked issued POs (project_id null)
  if (APPLY) {
    const r4 = await client.query(`
      UPDATE purchase_orders SET needs_review = true
      WHERE project_id IS NULL AND status = 'issued' AND needs_review = false
    `);
    console.log(`[FLAG] ${r4.rowCount} unlinked issued PO(s) flagged for review.`);
  } else {
    const { rows: preview4 } = await client.query(`
      SELECT id, po_number FROM purchase_orders
      WHERE project_id IS NULL AND status = 'issued' AND needs_review = false
    `);
    console.log(`[DRY-RUN] would flag ${preview4.length} unlinked issued PO(s) for review.`);
    for (const row of preview4) {
      console.log(`  [DRY-RUN] needs_review = true  id=${row.id}  po_number="${row.po_number}"`);
    }
  }

  // 3) Summary
  const { rows: [summary] } = await client.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE needs_review = true) as needs_review,
      COUNT(*) FILTER (WHERE po_number ~* '\\(copy\\).*\\(copy\\)') as still_dirty
    FROM purchase_orders
  `);
  console.log(`\n[REPAIR COMPLETE]`);
  console.log(`  Total POs: ${summary.total}`);
  console.log(`  Needs Review (current): ${summary.needs_review}`);
  console.log(`  Still Dirty (repeated Copy): ${summary.still_dirty}`);

  if (APPLY && parseInt(summary.still_dirty) > 0) {
    console.error("\n[ERROR] Some POs still have repeated (Copy) chains. Manual inspection needed.\n");
    process.exit(1);
  }

  if (APPLY) {
    console.log("\n[REPAIR] Done. Changes applied.\n");
  } else {
    console.log("\n[DRY-RUN] No changes made. Re-run with APPLY=true to apply.\n");
  }

  await client.end();
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

main().catch(err => {
  console.error("[REPAIR ERROR]", err);
  process.exit(1);
});
