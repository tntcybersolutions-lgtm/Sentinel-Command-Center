// Build marker: deploy retrigger 2026-04-25 (post import.meta polyfill)
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { scheduler } from "./queue/scheduler";
import { worker } from "./queue/worker";
import { websocketService } from "./services/websocket.service";
import { validateBidJacketTaxonomy } from "@shared/schema";
import { sql } from "drizzle-orm";
import { bidJacketAutoFillRouter } from "./bid-jacket-auto-fill-routes.v2";

validateBidJacketTaxonomy();

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
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  // Phase 2 v2.1 — POST /api/bid-projects/:bidProjectId/auto-fill-jacket
  app.use(bidJacketAutoFillRouter);

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

  const isProd = process.env.NODE_ENV === "production";
  // FORCE_VITE_DEV is honored ONLY when NODE_ENV !== "production".
  // Production must always serve the built bundle from dist/public —
  // never the vite dev middleware. This guards against env leakage
  // (e.g. .replit [userenv.shared]) accidentally re-enabling dev mode
  // in the deployed app.
  const forceViteDev =
    !isProd && process.env.FORCE_VITE_DEV === "true";

  const isReplit = Boolean(process.env.REPL_ID);

  if (isProd) {
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
          import.meta.dirname,
          "..",
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
      reusePort: true,
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

      try {
        const { db: backfillDb } = await import("./db");
        const { sql: backfillSql } = await import("drizzle-orm");
        const result: any = await backfillDb.execute(backfillSql`
          UPDATE takeoff_quantities
          SET unit_cost = CASE
            WHEN unit = 'CY' THEN 180.00
            WHEN unit = 'LF' THEN 8.00
            WHEN unit = 'SF' THEN 2.50
            WHEN unit = 'EA' THEN 45.00
            ELSE 25.00
          END
          WHERE unit_cost IS NULL AND tenant_id = 'blackhawk-default'
        `);
        const rows = result?.rowCount ?? result?.rows?.length ?? 0;
        if (rows > 0) {
          log(`Backfilled unit_cost on ${rows} takeoff_quantities row(s)`, "takeoff-heal");
        }

        const extResult: any = await backfillDb.execute(backfillSql`
          UPDATE takeoff_quantities
          SET extended_cost = quantity * unit_cost
          WHERE extended_cost IS NULL
            AND quantity IS NOT NULL
            AND unit_cost IS NOT NULL
            AND tenant_id = 'blackhawk-default'
        `);
        const extRows = extResult?.rowCount ?? extResult?.rows?.length ?? 0;
        if (extRows > 0) {
          log(`Backfilled extended_cost on ${extRows} takeoff_quantities row(s)`, "takeoff-heal");
        }
      } catch (e) {
        console.error("Failed to backfill takeoff costs:", e);
      }

      // Start HERBIE autonomous processing engine
      log("Starting HERBIE autonomous processing engine...", "herbie");
      
      // Start the job queue worker
      await worker.start();
      log("Job queue worker started", "herbie");
      
      // Start the scheduler (enqueues jobs on schedule)
      await scheduler.start();
      log("Scheduler started - HERBIE is now active", "herbie");

      // Lien Waiver reminder monitor — fires due reminders every 60s.
      // Kept lightweight (single setInterval) instead of adding a JobType
      // to avoid mutating the queue enum & touching tenant loops.
      try {
        const { processDueReminders } = await import(
          "./services/lien-waiver.service"
        );
        // In-flight guard prevents the next 60s setInterval tick from
        // starting before the previous one has finished. Without this,
        // a slow tick (e.g. DB backpressure) can stack overlapping
        // executions and process the same reminder twice. Combined with
        // the atomic `markReminderSent` claim in the service, this gives
        // us belt-and-suspenders safety against duplicate firing.
        let reminderTickInFlight = false;
        const tickReminders = async () => {
          if (reminderTickInFlight) return;
          reminderTickInFlight = true;
          try {
            const result = await processDueReminders();
            if (result.processed > 0 || result.skipped > 0) {
              log(
                `Lien waiver reminders: ${result.processed} sent, ${result.skipped} skipped`,
                "lien-waiver",
              );
            }
          } catch (e) {
            console.error("[lien-waiver] reminder tick failed:", e);
          } finally {
            reminderTickInFlight = false;
          }
        };
        setInterval(tickReminders, 60_000);
        // First tick on a small delay so the rest of startup finishes.
        setTimeout(tickReminders, 5_000);
        log("Lien waiver reminder monitor started (60s interval)", "lien-waiver");

        // Seed templates idempotently on boot so /sign/lien-waiver/:token
        // can render the statutory body even on a fresh database.
        const { seedLienWaiverTemplates } = await import(
          "./services/lien-waiver-templates.seed"
        );
        seedLienWaiverTemplates()
          .then((r) =>
            log(
              `Lien waiver templates seeded (inserted=${r.inserted}, skipped=${r.skipped}, total=${r.totalCombinations})`,
              "lien-waiver",
            ),
          )
          .catch((e) =>
            console.error("[lien-waiver] template seed failed:", e),
          );
      } catch (e) {
        console.error("[lien-waiver] failed to start reminder monitor:", e);
      }
    },
  );
})();
