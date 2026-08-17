/**
 * Proves the home page's opportunity summary is both correct and small.
 *
 *   node script/verify-opportunity-summary.mjs
 *
 * The defect: the Bid Opportunities panel needs four counts and five rows, and
 * it got them by fetching GET /api/opportunities — every opportunity, every
 * time. Against production that is ~9,900 rows and a ~6 MB response, parsed and
 * structurally shared by React Query on load and again on every websocket
 * invalidation. It blocked the main thread long enough that a
 * setTimeout(..., 100) in main.tsx logged 56 s and 126 s late, so the boot
 * loader stayed up and all four tiles read "--".
 *
 * The fix moves the arithmetic into Postgres. This script seeds a realistic
 * table and checks the SQL against the exact client-side computation it
 * replaces — the summary must agree with the old code on every count, or the
 * numbers on screen would quietly change meaning.
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

const TENANT = "blackhawk-default";
const OTHER = "someone-else";
const N = 9910; // production row count, measured from the live API

// Deterministic PRNG so a failure is reproducible.
let seed = 20260817;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

const DAY = 86400000;

async function main() {
  const db = new PGlite();

  await db.exec(`
    CREATE TABLE opportunities (
      id         TEXT PRIMARY KEY,
      tenant_id  TEXT NOT NULL,
      title      TEXT NOT NULL,
      agency     TEXT,
      set_aside  TEXT,
      status     TEXT NOT NULL DEFAULT 'open',
      due_at     TIMESTAMP,
      contract_value NUMERIC(15,2),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE opportunity_scores (
      id                 SERIAL PRIMARY KEY,
      tenant_id          TEXT      NOT NULL,
      opportunity_id     TEXT      NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
      score              INTEGER   NOT NULL,
      recommended_action TEXT      NOT NULL,
      created_at         TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX ON opportunities (tenant_id, due_at);
    CREATE INDEX ON opportunity_scores (tenant_id, opportunity_id, created_at DESC);
  `);

  // ── Seed a table shaped like production ──────────────────────────────────
  // Measured from the live API: about half 'scored', most due dates in the
  // past, a small number still open, a handful with a dollar value.
  const now = Date.now();
  const STATUSES = ["scored", "open", "open", "pending_approval", "active", "undecided", ""];
  const rows = [];
  for (let i = 0; i < N; i++) {
    const r = rand();
    // ~1.5% still have a future deadline, matching the live data (63 of 9,910).
    const dueOffsetDays = r < 0.015 ? Math.floor(rand() * 400) + 1 : -Math.floor(rand() * 400) - 1;
    rows.push({
      id: `o${i}`,
      status: STATUSES[Math.floor(rand() * STATUSES.length)],
      dueAt: rand() < 0.99 ? new Date(now + dueOffsetDays * DAY) : null,
      value: rand() < 0.002 ? Math.floor(rand() * 35_000_000) : null,
    });
  }

  const chunk = 500;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const params = [];
    const values = slice
      .map((o, k) => {
        const b = k * 6;
        params.push(o.id, TENANT, `Opportunity ${o.id}`, o.status, o.dueAt, o.value);
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5}::timestamp,$${b + 6})`;
      })
      .join(",");
    await db.query(
      `INSERT INTO opportunities (id, tenant_id, title, status, due_at, contract_value) VALUES ${values}`,
      params,
    );
  }

  // Half the table scored, and a third of those rescored later — append-only,
  // so the newest row must win.
  const scored = rows.filter((_, i) => i % 2 === 0);
  for (let i = 0; i < scored.length; i += chunk) {
    const slice = scored.slice(i, i + chunk);
    const params = [];
    const values = slice
      .map((o, k) => {
        const b = k * 5;
        params.push(TENANT, o.id, Math.floor(rand() * 80) + 1, "watch", new Date(now - 30 * DAY));
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5}::timestamp)`;
      })
      .join(",");
    await db.query(
      `INSERT INTO opportunity_scores (tenant_id, opportunity_id, score, recommended_action, created_at) VALUES ${values}`,
      params,
    );
  }
  // One known winner: rescored most recently, highest score in the table.
  await db.query(
    `INSERT INTO opportunity_scores (tenant_id, opportunity_id, score, recommended_action, created_at)
     VALUES ($1,$2,$3,$4,$5::timestamp)`,
    [TENANT, "o0", 93, "bid", new Date(now - DAY)],
  );
  // A stale higher score for the same opportunity — must LOSE to the newer 93.
  await db.query(
    `INSERT INTO opportunity_scores (tenant_id, opportunity_id, score, recommended_action, created_at)
     VALUES ($1,$2,$3,$4,$5::timestamp)`,
    [TENANT, "o0", 99, "bid", new Date(now - 200 * DAY)],
  );
  // Another tenant with a perfect score, which must never surface.
  await db.query(`INSERT INTO opportunities (id, tenant_id, title) VALUES ('x1',$1,'theirs')`, [OTHER]);
  await db.query(
    `INSERT INTO opportunity_scores (tenant_id, opportunity_id, score, recommended_action) VALUES ($1,'x1',100,'bid')`,
    [OTHER],
  );

  // ── The summary queries, exactly as storage.getOpportunitySummary() runs ──
  const counts = (
    await db.query(
      `SELECT
         (SELECT count(*) FROM opportunities WHERE tenant_id = $1)::int AS total,
         (SELECT count(*) FROM opportunities
           WHERE tenant_id = $1
             AND (status IS NULL OR lower(status) IN ('', 'open', 'undecided')))::int AS needs_triage,
         (SELECT count(*) FROM opportunities
           WHERE tenant_id = $1
             AND due_at >= now() AND due_at <= now() + interval '7 days')::int AS due_this_week,
         (SELECT max(score) FROM (
            SELECT DISTINCT ON (opportunity_id) score
              FROM opportunity_scores WHERE tenant_id = $1
             ORDER BY opportunity_id, created_at DESC
          ) latest)::int AS top_fit`,
      [TENANT],
    )
  ).rows[0];

  const urgent = (
    await db.query(
      `SELECT o.id, o.due_at, latest.score
         FROM opportunities o
         LEFT JOIN (
           SELECT DISTINCT ON (opportunity_id) opportunity_id, score
             FROM opportunity_scores WHERE tenant_id = $1
            ORDER BY opportunity_id, created_at DESC
         ) latest ON latest.opportunity_id = o.id
        WHERE o.tenant_id = $1 AND o.due_at >= now()
        ORDER BY o.due_at ASC
        LIMIT 5`,
      [TENANT],
    )
  ).rows;

  // ── The old client-side computation, character for character ─────────────
  const allRows = (
    await db.query(`SELECT id, status, due_at FROM opportunities WHERE tenant_id = $1`, [TENANT])
  ).rows;
  const ops = allRows.map((r) => ({
    id: r.id,
    status: r.status,
    dueAt: r.due_at ? new Date(r.due_at).toISOString() : null,
  }));
  const nowMs = Date.now();
  const dueDays = (s) => (s ? Math.ceil((new Date(s).getTime() - nowMs) / DAY) : null);
  const oldTotal = ops.length;
  const oldNeedsTriage = ops.filter(
    (o) => !o.status || ["", "open", "undecided"].includes(String(o.status).toLowerCase()),
  ).length;
  const oldUrgent = [...ops]
    .filter((o) => o.dueAt && (dueDays(o.dueAt) ?? -1) >= 0)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
    .slice(0, 5);

  // The five soonest genuinely-future deadlines, computed honestly in JS.
  const trulyFuture = [...ops]
    .filter((o) => o.dueAt && new Date(o.dueAt).getTime() >= nowMs)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

  console.log(`\nPROOF 1 — the summary agrees with the code it replaces (${N} rows)`);
  check("total matches the client-side count", counts.total, oldTotal);
  check("needsTriage matches the client-side predicate", counts.needs_triage, oldNeedsTriage);
  check("urgent is the five soonest future deadlines", urgent.map((u) => u.id), trulyFuture.slice(0, 5).map((o) => o.id));
  check("urgent is capped at five", urgent.length <= 5, true);
  check("every urgent row is actually in the future", urgent.every((u) => new Date(u.due_at).getTime() >= nowMs), true);

  // ── The old predicate was wrong, and this is what it cost ────────────────
  // dueDays() rounded with Math.ceil, so an opportunity that expired twelve
  // hours ago scored ceil(-0.5) === -0, and -0 >= 0 is true. Expired rows were
  // admitted, and because they sort earliest they displaced real deadlines.
  console.log("\nPROOF 1b — the old predicate admitted expired opportunities");
  check("Math.ceil(-0.5) >= 0 is true, which is how they got in", Math.ceil(-0.5) >= 0, true);
  const oldAdmittedExpired = oldUrgent.filter((o) => new Date(o.dueAt).getTime() < nowMs).length;
  check("the old top-five contained expired opportunities", oldAdmittedExpired > 0, true);
  check("...and the new list contains none of them", urgent.filter((u) => new Date(u.due_at).getTime() < nowMs).length, 0);

  console.log("\nPROOF 2 — Top Fit");
  check("top fit is the newest score, not the highest historical one", counts.top_fit, 93);
  check("another tenant's perfect 100 does not leak in", counts.top_fit === 100, false);

  console.log("\nPROOF 3 — dueThisWeek counts only the next seven days");
  const strictDueThisWeek = ops.filter((o) => {
    if (!o.dueAt) return false;
    const t = new Date(o.dueAt).getTime();
    return t >= nowMs && t <= nowMs + 7 * DAY;
  }).length;
  const oldDueThisWeek = ops.filter((o) => {
    const d = dueDays(o.dueAt);
    return d != null && d >= 0 && d <= 7;
  }).length;
  check("matches an honest future-only count", counts.due_this_week, strictDueThisWeek);
  // Same Math.ceil defect: the old count also swept in expired opportunities,
  // inflating the red "Due This Week" tile with deadlines that had passed.
  check("the old count was inflated by expired rows", oldDueThisWeek > strictDueThisWeek, true);

  console.log("\nPROOF 4 — payload size");
  const fullPayload = JSON.stringify(
    (await db.query(`SELECT * FROM opportunities WHERE tenant_id = $1`, [TENANT])).rows,
  );
  const summaryPayload = JSON.stringify({
    total: counts.total,
    needsTriage: counts.needs_triage,
    dueThisWeek: counts.due_this_week,
    topFit: counts.top_fit,
    urgent,
  });
  const ratio = fullPayload.length / summaryPayload.length;
  console.log(`         old: ${(fullPayload.length / 1_000_000).toFixed(2)} MB over ${N} rows`);
  console.log(`         new: ${summaryPayload.length} bytes`);
  console.log(`         ratio: ${Math.round(ratio).toLocaleString()}x smaller`);
  check("summary is under 2 KB", summaryPayload.length < 2048, true);
  check("summary is at least 1000x smaller than the full table", ratio > 1000, true);

  console.log("\nPROOF 5 — an empty tenant reports unknown, not zero");
  const emptyCounts = (
    await db.query(
      `SELECT (SELECT max(score) FROM (
                 SELECT DISTINCT ON (opportunity_id) score
                   FROM opportunity_scores WHERE tenant_id = $1
                  ORDER BY opportunity_id, created_at DESC
               ) l)::int AS top_fit`,
      ["nobody"],
    )
  ).rows[0];
  check("topFit is null when nothing is scored, not 0", emptyCounts.top_fit, null);

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
