// Build marker: 2026-05-20T02:36:08Z (bump to force fresh esbuild + vite output)
// Runtime marker: DEPLOY_SENTINEL_LIENWAIVERS_FIX active
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { scheduler } from "./queue/scheduler";
import { worker } from "./queue/worker";
import { websocketService } from "./services/websocket.service";
import { validateBidJacketTaxonomy } from "@shared/schema";
import { sql } from "drizzle-orm";
import { lienWaiverRouter } from "./lien-waiver-routes";
import { takeoffItemsRouter } from "./takeoff-items-routes";
import { deliverableGeneratorRouter } from "./deliverable-generator-routes";
import { documentContentRouter } from "./document-content-routes";
import { bidJacketAutoFillRouter } from "./bid-jacket-auto-fill-routes.v2";
import { registerHomeRoutes } from "./home-routes";
import { registerSprint3Routes } from "./sprint3-routes";
import { registerSprint4Routes } from "./sprint4-routes";
import { registerSprint6Routes } from "./sprint6-routes";
import { registerSprint7Routes } from "./sprint7-routes";
import punchItemsRouter from "./routes/punch-items.routes";
import dailyLogsRouter from "./routes/daily-logs.routes";
import transcribeRouter from "./routes/transcribe.routes";

console.log("[STARTUP] DEPLOY_SENTINEL_LIENWAIVERS_FIX active · " + new Date().toISOString());
validateBidJacketTaxonomy();

/**
 * Report whether the database is reachable, without blocking startup.
 *
 * Route registration happens before the port is bound, so a database that
 * accepts a TCP connection but never answers leaves this process alive, silent,
 * and not listening. A deployment health check then times out and reports only
 * "built successfully but failed to start" — with nothing in the logs to act on.
 *
 * Failing here turns that into one actionable line. The timeout matters as much
 * as the query: without it an unreachable host hangs rather than throwing, which
 * is precisely the failure this exists to surface.
 */
async function reportDatabaseReachability(timeoutMs = 10000): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error(
      "[BOOT] WARNING: DATABASE_URL is not set. Deployment secrets are configured separately from the workspace; every database-backed route will fail until it is."
    );
    return;
  }

  // Host only — never log the connection string itself, it carries the password.
  let host = "unknown host";
  try {
    host = new URL(process.env.DATABASE_URL).host;
  } catch {
    /* a malformed URL is itself the answer */
  }

  const { pool } = await import("./db");
  let timer: NodeJS.Timeout | undefined;

  try {
    await Promise.race([
      pool.query("SELECT 1"),
      new Promise((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`no response within ${timeoutMs}ms`)),
          timeoutMs
        );
      }),
    ]);
    log(`database reachable (${host})`, "boot");
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(
      `[BOOT] WARNING: database at ${host} did not answer — ${detail}. ` +
        "Starting anyway; database-backed routes will error until it recovers."
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Above this, a response body is summarised by size rather than printed. 2 KB
// keeps ordinary payloads readable in the log without ever letting a large one
// through.
const BODY_LOG_LIMIT_BYTES = 2048;

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (!path.startsWith("/api")) return;

    // Response size comes from the header Express already set, so a large body
    // is never serialised a second time just to be logged. This used to
    // JSON.stringify() every /api response in full: GET /api/opportunities
    // returns about 6 MB, so each call paid for a second full serialisation on
    // the event loop and wrote all 6 MB into the deployment log, where it
    // showed up as a single unreadable entry.
    const size = Number(res.getHeader("content-length")) || 0;
    let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
    if (size) logLine += ` (${size}b)`;

    // A small body is worth seeing while debugging; a large one is not worth
    // the cost. Auth-ish routes are skipped entirely — their small responses
    // are exactly the ones that carry tokens.
    const sensitive = /auth|login|logout|token|secret|password|session|register/i.test(path);
    if (capturedJsonResponse && !sensitive && size > 0 && size <= BODY_LOG_LIMIT_BYTES) {
      logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
    }

    log(logLine);
  });

  next();
});

(async () => {
  // Before anything that touches the database. A failure here is reported in
  // one line rather than as a silent boot that never binds the port.
  await reportDatabaseReachability();

  await registerRoutes(httpServer, app);
    app.use("/api/lien-waivers", lienWaiverRouter);
        app.use(takeoffItemsRouter);
    app.use(deliverableGeneratorRouter);
  app.use(documentContentRouter);
  // Phase 2 v2.1 — POST /api/bid-projects/:bidProjectId/auto-fill-jacket
  app.use(bidJacketAutoFillRouter);
  registerHomeRoutes(app);
  registerSprint3Routes(app);
  registerSprint4Routes(app);
  registerSprint6Routes(app);
  registerSprint7Routes(app); // __sprint7_5_wired__
  app.use("/api/punch-items", punchItemsRouter);
  app.use("/api/daily-logs", dailyLogsRouter);
  app.use("/api/transcribe", transcribeRouter);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // Serve files from object storage - must be BEFORE static catch-all
  app.use('/replit-objstore-:bucketId', async (req, res, next) => {
    const { bucketId } = req.params;
    const filePath = req.path;
    const bucketName = `replit-objstore-${bucketId}`;
    const objectName = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    
    try {
      // Use the existing object storage client from integrations
      const { objectStorageClient } = await import("./replit_integrations/object_storage/objectStorage");
      
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        console.log(`Object not found: ${bucketName}/${objectName}`);
        return res.status(404).json({ error: 'Object not found', path: `${bucketName}/${objectName}` });
      }
      
      // Get file metadata for content type
      const [metadata] = await file.getMetadata();
      
      res.set({
        'Content-Type': metadata.contentType || 'application/octet-stream',
        'Content-Length': metadata.size?.toString() || '',
        'Cache-Control': 'public, max-age=31536000',
      });
      
      // Stream the file to response
      const stream = file.createReadStream();
      stream.on('error', (err) => {
        console.error(`Stream error for ${bucketName}/${objectName}:`, err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error streaming file' });
        }
      });
      stream.pipe(res);
    } catch (error) {
      console.error(`Object storage error for ${bucketName}/${objectName}:`, error);
      return res.status(500).json({ error: 'Failed to fetch object', path: `${bucketName}/${objectName}` });
    }
  });

  const forceViteDev = process.env.FORCE_VITE_DEV === "true";
  const isProd = process.env.NODE_ENV === "production";

  const isReplit = Boolean(process.env.REPL_ID);

  if (isProd && !forceViteDev) {
    app.get("/__mode", (_req, res) => res.json({ mode: "static" }));
    serveStatic(app);
    log("STATIC mode: serving dist/public", "ui");
  } else if (isReplit) {
    app.get("/__mode", (_req, res) => res.json({ mode: "dev" }));
    const { createServer: createViteServer } = await import("vite");
    const viteConfig = (await import("../vite.config")).default;
    const fs = await import("fs");
    const path = await import("path");
    const { nanoid } = await import("nanoid");

    const vite = await createViteServer({
      ...viteConfig,
      configFile: false,
      server: {
        middlewareMode: true,
        hmr: false,
        allowedHosts: true as const,
      },
      appType: "custom",
    });

    app.use(vite.middlewares);

    app.use("/{*path}", async (req, res, next) => {
      try {
        const clientTemplate = path.resolve(
          process.cwd(),
          "client",
          "index.html",
        );
        let html = await fs.promises.readFile(clientTemplate, "utf-8");
        html = html.replace(
          `src="/src/main.tsx"`,
          `src="/src/main.tsx?v=${nanoid()}"`,
        );
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (e) {
        next(e);
      }
    });

    log("DEV mode: Vite middleware active (HMR OFF on Replit)", "ui");
  } else {
    app.get("/__mode", (_req, res) => res.json({ mode: "dev" }));
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
    log("DEV mode: Vite middleware active (HMR ON)", "ui");
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  
  // Initialize WebSocket service for real-time updates
  websocketService.initialize(httpServer);
  log("WebSocket service initialized on /ws", "websocket");
  
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      // SO_REUSEPORT is not implemented on Windows: passing it there fails the
      // listen outright with ENOTSUP, so the server cannot start for local
      // development or verification. Linux deployment is unaffected.
      ...(process.platform === "win32" ? {} : { reusePort: true }),
    },
    async () => {
      log(`serving on port ${port}`);
      
      try {
        const { writeAllSnapshotsForAllTenants } = await import("./services/metric-snapshot.service");
        const snapshotResult = await writeAllSnapshotsForAllTenants();
        const tenantCount = Object.keys(snapshotResult).length;
        log(`Metric snapshots written for ${tenantCount} tenant(s)`, "metrics");
      } catch (e) {
        console.error("Failed to write initial metric snapshots:", e);
      }
      
      try {
        const { startNightlyHigherGovScheduler } = await import("./services/highergov-sync.service");
        startNightlyHigherGovScheduler(async () => {
          const { db } = await import("./db");
          const result = await db.execute(sql`SELECT DISTINCT tenant_id FROM highergov_watch_profiles WHERE is_active = true`);
          const tenantIds = ((result as any).rows || []).map((r: any) => String(r.tenant_id));
          return tenantIds.length > 0 ? tenantIds : ["blackhawk-default"];
        });
        log("HigherGov nightly scheduler started", "highergov");
      } catch (e) {
        console.error("Failed to start HigherGov scheduler:", e);
      }

      try {
        const { seedMyDayScoringRules } = await import("./services/my-day-seed.service");
        await seedMyDayScoringRules();
        log("My Day scoring rules seeded", "my-day");
      } catch (e) {
        console.error("Failed to seed My Day scoring rules:", e);
      }

      try {
        const { runBidJacketSeeds } = await import("./seeds/bid-jacket-seeds");
        await runBidJacketSeeds();
        log("Bid jacket seeds completed", "bid-jacket");
      } catch (e) {
        console.error("Failed to seed bid jacket data:", e);
      }

              // Seed 50-state lien waiver templates (200 total: 50 states x 4 types)
        try {
          const { seedLienWaiverTemplates } = await import("./lien-waivers");
          await seedLienWaiverTemplates("blackhawk-default");
          log("Lien waiver templates seeded (200 templates across 50 states)", "lien-waivers");
        } catch (e) {
          console.error("Failed to seed lien waiver templates:", e);
        }

      // Start HERBIE autonomous processing engine
      log("Starting HERBIE autonomous processing engine...", "herbie");
      
      // Start the job queue worker
      await worker.start();
      log("Job queue worker started", "herbie");
      
      // Start the scheduler (enqueues jobs on schedule)
      await scheduler.start();
      log("Scheduler started - HERBIE is now active", "herbie");
    },
  );
})().catch((err) => {
  // Everything above runs before the port is bound. Without this, a rejection
  // here exits the process with a bare stack trace and the deployment reports
  // only "the required port was never opened" — true, but not a cause.
  console.error("[BOOT] FATAL: startup failed before the server could listen.");
  console.error(err);
  process.exit(1);
});

// A rejected promise or a thrown callback anywhere in startup would otherwise
// take the process down with no attribution. Naming it is the difference
// between a five-minute fix and an afternoon.
process.on("unhandledRejection", (reason) => {
  console.error("[BOOT] Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[BOOT] Uncaught exception:", err);
});
