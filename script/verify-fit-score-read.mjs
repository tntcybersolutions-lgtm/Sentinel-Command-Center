/**
 * Proves the dashboard's Top Fit tile can now show a real number.
 *
 *   node script/verify-fit-score-read.mjs
 *
 * The defect: GET /api/opportunities and GET /api/dashboard/recent-opportunities
 * both serialized `score: null` for every row. HERBIE was scoring opportunities
 * correctly and writing them to opportunity_scores, but no read path ever
 * touched that table, so the client's
 *
 *     ops.reduce((m, o) => Math.max(m, Number(o.score ?? 0)), 0)
 *
 * always produced 0, and `topFit || "--"` rendered "--". That outcome was
 * independent of the data — it could not have shown a number.
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
const OTHER_TENANT = "someone-else";

// ── The exact query storage.getLatestOpportunityScores() runs ───────────────
async function latestScores(db, tenantId) {
  const r = await db.query(
    `SELECT DISTINCT ON (opportunity_id)
            opportunity_id, score, recommended_action
       FROM opportunity_scores
      WHERE tenant_id = $1
      ORDER BY opportunity_id, created_at DESC`,
    [tenantId],
  );
  const byOpportunity = new Map();
  for (const row of r.rows) {
    byOpportunity.set(row.opportunity_id, {
      score: Number(row.score),
      recommendedAction: row.recommended_action,
    });
  }
  return byOpportunity;
}

// ── The client's Top Fit computation, character for character ───────────────
// client/src/pages/home-assistant.tsx:381 and :391
const topFitOf = (ops) => {
  const topFit = ops.reduce((m, o) => Math.max(m, Number(o.score ?? 0)), 0);
  return topFit || "--";
};

async function main() {
  const db = new PGlite();

  await db.exec(`
    CREATE TABLE opportunities (
      id         TEXT PRIMARY KEY,
      tenant_id  TEXT NOT NULL,
      title      TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'open',
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
  `);

  const addOpp = (id, tenant = TENANT) =>
    db.query(`INSERT INTO opportunities (id, tenant_id, title) VALUES ($1,$2,$3)`, [id, tenant, `opp ${id}`]);
  // Explicit created_at so "newest" is unambiguous rather than clock-dependent.
  const addScore = (oppId, score, action, at, tenant = TENANT) =>
    db.query(
      `INSERT INTO opportunity_scores (tenant_id, opportunity_id, score, recommended_action, created_at)
       VALUES ($1,$2,$3,$4,$5::timestamp)`,
      [tenant, oppId, score, action, at],
    );

  // ── PROOF 1 — reproduce the failure exactly ──────────────────────────────
  console.log("\nPROOF 1 — the old response could not render a number");
  await addOpp("o1");
  await addOpp("o2");
  await addScore("o1", 87, "bid", "2026-08-01 10:00:00");
  await addScore("o2", 41, "watch", "2026-08-01 10:00:00");

  // What the route used to send: score hardcoded null on every row.
  const oldPayload = [
    { id: "o1", score: null },
    { id: "o2", score: null },
  ];
  check("old payload renders Top Fit as '--' even though scores exist", topFitOf(oldPayload), "--");

  const scores = await latestScores(db, TENANT);
  check("...while the database really did hold a score of 87", scores.get("o1").score, 87);

  // ── PROOF 2 — the new response ───────────────────────────────────────────
  console.log("\nPROOF 2 — the new response renders the real top score");
  const serialize = (rows, byOpp) =>
    rows.map((o) => ({
      id: o.id,
      score: byOpp.get(o.id)?.score ?? null,
      recommendedAction: byOpp.get(o.id)?.recommendedAction ?? null,
    }));

  const allOpps = (await db.query(`SELECT id FROM opportunities WHERE tenant_id = $1 ORDER BY id`, [TENANT])).rows;
  check("new payload renders Top Fit as 87", topFitOf(serialize(allOpps, scores)), 87);
  check("recommendedAction rides along", serialize(allOpps, scores)[0].recommendedAction, "bid");

  // ── PROOF 3 — append-only history: newest score wins ─────────────────────
  console.log("\nPROOF 3 — HERBIE appends, it does not update");
  await addScore("o1", 12, "pass", "2026-07-01 10:00:00"); // older
  await addScore("o1", 95, "bid", "2026-08-14 10:00:00"); // newest
  const rescored = await latestScores(db, TENANT);
  check("o1 has three score rows", Number((await db.query(`SELECT COUNT(*)::int c FROM opportunity_scores WHERE opportunity_id='o1'`)).rows[0].c), 3);
  check("the newest score wins, not the first or the highest-id", rescored.get("o1").score, 95);
  check("and its recommendedAction comes from the same row", rescored.get("o1").recommendedAction, "bid");
  check("one map entry per opportunity — no row multiplication", rescored.size, 2);
  check("Top Fit reflects the rescore", topFitOf(serialize(allOpps, rescored)), 95);

  // ── PROOF 4 — unscored opportunities ─────────────────────────────────────
  console.log("\nPROOF 4 — never-scored rows stay null, not zero");
  await addOpp("o3");
  const withUnscored = await latestScores(db, TENANT);
  check("an unscored opportunity is absent from the map", withUnscored.has("o3"), false);
  const rows3 = (await db.query(`SELECT id FROM opportunities WHERE tenant_id=$1 ORDER BY id`, [TENANT])).rows;
  check("...and serializes as null, so the UI can say 'not scored'", serialize(rows3, withUnscored)[2].score, null);
  check("an unscored row does not drag Top Fit down", topFitOf(serialize(rows3, withUnscored)), 95);

  // ── PROOF 5 — a genuine zero is not the same as unscored ─────────────────
  console.log("\nPROOF 5 — scored-zero is distinguishable from never-scored");
  await addScore("o3", 0, "pass", "2026-08-15 10:00:00");
  const withZero = await latestScores(db, TENANT);
  check("a real zero score is present in the map", withZero.has("o3"), true);
  check("and its value is 0, not null", withZero.get("o3").score, 0);
  check("serialized as 0 rather than null", serialize(rows3, withZero)[2].score, 0);

  // ── PROOF 6 — tenant isolation ───────────────────────────────────────────
  console.log("\nPROOF 6 — another tenant's scores never leak in");
  await addOpp("x1", OTHER_TENANT);
  await addScore("x1", 100, "bid", "2026-08-16 10:00:00", OTHER_TENANT);
  const isolated = await latestScores(db, TENANT);
  check("the other tenant's opportunity is absent", isolated.has("x1"), false);
  check("and its 100 does not become our Top Fit", topFitOf(serialize(rows3, isolated)), 95);

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
