const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const APPLY = process.env.APPLY === 'true';
console.log(APPLY ? '=== APPLYING ALL DB FIXES ===' : '=== DRY RUN ===');

async function main() {
  const client = await pool.connect();
  try {

    // FIX 1: Submittal Copy chains — delete dupes, rename survivor
    const subs = await client.query(
      "SELECT id, submittal_number, project_id FROM submittals WHERE submittal_number LIKE '%(Copy)%' ORDER BY created_at ASC"
    );
    console.log('\n[1] Submittals with Copy chains:', subs.rows.length);
    const seenSubs = new Map();
    for (const row of subs.rows) {
      const base = row.submittal_number.replace(/(\s*\(Copy\))+/g, '').trim();
      const key = (row.project_id || 'none') + '::' + base;
      if (seenSubs.has(key)) {
        console.log('  DELETE dup:', row.submittal_number);
        if (APPLY) await client.query('DELETE FROM submittals WHERE id=$1', [row.id]);
      } else {
        seenSubs.set(key, row.id);
        console.log('  RENAME:', row.submittal_number, '->', base);
        if (APPLY) await client.query('UPDATE submittals SET submittal_number=$1 WHERE id=$2', [base, row.id]);
      }
    }

    // FIX 2: PO numbers with (Copy N)
    const pos = await client.query("SELECT id, po_number FROM purchase_orders WHERE po_number LIKE '%Copy%'");
    console.log('\n[2] POs with Copy:', pos.rows.length);
    for (const row of pos.rows) {
      const base = row.po_number.replace(/\s*\(Copy\s*\d*\)\s*/g, '').replace(/\s*\(Copy\)\s*/g, '').trim();
      console.log(' ', row.po_number, '->', base);
      if (APPLY) await client.query('UPDATE purchase_orders SET po_number=$1 WHERE id=$2', [base, row.id]);
    }

    // FIX 3: Project names that are raw IDs
    const badProj = await client.query(
      "SELECT id, name, project_number FROM projects WHERE name ~ '^[0-9A-Z]{4,}[0-9]+$' OR name ~ '^[A-Z]{1,3}-[0-9]{2}-[0-9]{2}$' OR name ~ '^[0-9]{4,6}$'"
    );
    console.log('\n[3] Projects with raw ID names:', badProj.rows.length);
    for (const row of badProj.rows) {
      const newName = row.project_number && row.project_number !== row.name
        ? 'Project ' + row.project_number : 'Project ' + row.name;
      console.log(' ', '"' + row.name + '"', '->', '"' + newName + '"');
      if (APPLY) await client.query('UPDATE projects SET name=$1 WHERE id=$2', [newName, row.id]);
    }

    // FIX 4: Remove [MONITOR] prefix from project_tasks titles
    const monTasks = await client.query("SELECT id, name FROM project_tasks WHERE name LIKE '[MONITOR]%' LIMIT 200");
    console.log('\n[4] Tasks with [MONITOR] prefix:', monTasks.rows.length);
    let shown = 0;
    for (const row of monTasks.rows) {
      const clean = row.name.replace(/^\[MONITOR\]\s*/, '').trim();
      if (shown++ < 3) console.log('  "' + row.title.substring(0,70) + '" -> "' + clean.substring(0,50) + '"');
      if (APPLY) await client.query('UPDATE project_tasks SET name=$1 WHERE id=$2', [clean, row.id]);
    }

    // FIX 5: bid_tasks [MONITOR] prefix too
    const monBidTasks = await client.query("SELECT id, name FROM bid_tasks WHERE name LIKE '[MONITOR]%' LIMIT 200");
    console.log('[4b] bid_tasks with [MONITOR]:', monBidTasks.rows.length);
    for (const row of monBidTasks.rows) {
      const clean = row.name.replace(/^\[MONITOR\]\s*/, '').trim();
      if (APPLY) await client.query('UPDATE bid_tasks SET name=$1 WHERE id=$2', [clean, row.id]);
    }

    console.log('\n=== Done' + (APPLY ? '' : ' (DRY RUN — use APPLY=true to apply)') + ' ===');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
