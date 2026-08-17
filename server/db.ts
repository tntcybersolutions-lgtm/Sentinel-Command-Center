import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

/**
 * Why this does not throw when DATABASE_URL is missing.
 *
 * server/index.ts imports ./routes, which imports this module, so a throw here
 * executes during module initialization of the bundled server — BEFORE the
 * [STARTUP] banner on the first line of index.ts, before any handler is
 * registered, and before the port is bound. On a deployment that produced a
 * container with literally zero application output and this from the platform:
 *
 *   a port configuration was specified but the required port was never opened,
 *   expected port 5000
 *
 * which is true but names the symptom, not the cause. Several deploys were
 * spent chasing it because nothing the process printed survived.
 *
 * Deployment secrets on Replit are configured separately from the workspace's,
 * so DATABASE_URL being present in the editor says nothing about the deployed
 * container — this is an easy configuration to miss and an expensive one to
 * diagnose when the failure is silent.
 *
 * Constructing a Pool does NOT connect, so building one with a missing
 * connection string is safe: the process starts, binds the port, passes the
 * health check, and every database-backed request fails with a real error the
 * caller can read. A visible, diagnosable degradation beats an invisible death.
 */
if (!process.env.DATABASE_URL) {
  console.error(
    "[DB] FATAL CONFIG: DATABASE_URL is not set. The server will start and " +
      "serve static assets, but every database-backed route will fail. " +
      "On Replit, deployment secrets are configured separately from workspace " +
      "secrets — set DATABASE_URL under Publishing → Adjust settings → Secrets.",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Pool size is env-tunable so the server can run against a single-connection
  // Postgres during local verification. Unset means node-postgres' default.
  ...(process.env.PGPOOL_MAX ? { max: Number(process.env.PGPOOL_MAX) } : {}),
});

// An idle client erroring (a dropped connection, an auth timeout — both of
// which this database has produced) emits 'error' on the pool. With no
// listener, Node treats that as an unhandled 'error' event and terminates the
// process. Logging it keeps a transient database problem from killing the app.
pool.on("error", (err) => {
  console.error("[DB] idle client error (connection will be recycled):", err.message);
});

export const db = drizzle(pool, { schema });
