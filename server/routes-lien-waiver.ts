// Lien Waiver REST surface.
//
// All endpoints are tenant-scoped via DEFAULT_TENANT_ID (single-tenant
// demo). State transitions delegate to lien-waiver.service which handles
// validation + audit logging.
//
// Endpoints:
//   GET    /api/lien-waivers
//   GET    /api/lien-waivers/stats
//   GET    /api/lien-waivers/:id
//   GET    /api/lien-waivers/:id/document
//   GET    /api/lien-waivers/:id/events
//   POST   /api/lien-waivers
//   PATCH  /api/lien-waivers/:id
//   POST   /api/lien-waivers/:id/send
//   POST   /api/lien-waivers/:id/sign
//   POST   /api/lien-waivers/:id/receive
//   POST   /api/lien-waivers/:id/void

import type { Express, Request, Response } from "express";
import {
  createWaiver,
  updateWaiver,
  sendWaiver,
  signWaiver,
  receiveWaiver,
  voidWaiver,
  getWaiver,
  listWaivers,
  getStats,
  listEvents,
  generateDocumentText,
  generateSignToken,
  findWaiverBySignToken,
  signByToken,
  scheduleDefaultReminders,
  listReminders,
  cancelPendingReminders,
  processDueReminders,
  autofillWaiver,
  ensureLienWaiverFolder,
  backfillLienWaiverFoldersForAllProjects,
  WAIVER_TYPES,
  WAIVER_STATUSES,
  type WaiverStatus,
  type WaiverType,
} from "./services/lien-waiver.service";
import {
  seedLienWaiverTemplates,
  ALL_STATES,
  WAIVER_TYPE_KEYS,
} from "./services/lien-waiver-templates.seed";
import { db } from "./db";
import { lienWaiverTemplates, vendors, projects } from "@shared/schema";
import { and, eq } from "drizzle-orm";

const DEFAULT_TENANT_ID = "blackhawk-default";

function badRequest(res: Response, msg: string) {
  return res.status(400).json({ error: msg });
}

function asDate(v: unknown, name: string): Date {
  if (v == null) throw new Error(`${name} required`);
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) throw new Error(`${name} invalid date`);
  return d;
}

function pid(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] ?? "");
  return v == null ? "" : String(v);
}

function optDate(v: unknown): Date | null {
  if (v == null) return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

function handleError(res: Response, err: unknown, fallback = "request failed") {
  const status =
    typeof err === "object" && err && "statusCode" in err
      ? Number((err as { statusCode?: number }).statusCode) || 500
      : 500;
  const message = err instanceof Error ? err.message : fallback;
  if (status === 500) console.error("[lien-waiver]", err);
  res.status(status).json({ error: message });
}

export function registerLienWaiverRoutes(app: Express): void {
  app.post("/api/lien-waivers/folders/backfill", async (_req: Request, res: Response) => {
    try {
      const result = await backfillLienWaiverFoldersForAllProjects(DEFAULT_TENANT_ID);
      res.json({ ok: true, ...result });
    } catch (err) { handleError(res, err); }
  });

  app.post("/api/lien-waivers/folders/ensure/:projectId", async (req: Request, res: Response) => {
    try {
      const result = await ensureLienWaiverFolder(DEFAULT_TENANT_ID, String(req.params.projectId));
      res.json({ ok: true, ...result });
    } catch (err) { handleError(res, err); }
  });

  app.get("/api/lien-waivers", async (req: Request, res: Response) => {
    try {
      const { projectId, vendorId, payAppId, status, waiverType } = req.query;
      const rows = await listWaivers(DEFAULT_TENANT_ID, {
        projectId: typeof projectId === "string" ? projectId : undefined,
        vendorId: typeof vendorId === "string" ? vendorId : undefined,
        payAppId: typeof payAppId === "string" ? payAppId : undefined,
        status:
          typeof status === "string" && WAIVER_STATUSES.includes(status as WaiverStatus)
            ? (status as WaiverStatus)
            : undefined,
        waiverType:
          typeof waiverType === "string" && WAIVER_TYPES.includes(waiverType as WaiverType)
            ? (waiverType as WaiverType)
            : undefined,
      });
      res.json(rows);
    } catch (err) {
      handleError(res, err, "list failed");
    }
  });

  app.get("/api/lien-waivers/stats", async (req: Request, res: Response) => {
    try {
      const projectId =
        typeof req.query.projectId === "string" ? req.query.projectId : undefined;
      const stats = await getStats(DEFAULT_TENANT_ID, projectId);
      res.json(stats);
    } catch (err) {
      handleError(res, err, "stats failed");
    }
  });

  app.get("/api/lien-waivers/:id", async (req: Request, res: Response) => {
    try {
      const row = await getWaiver(DEFAULT_TENANT_ID, pid(req.params.id));
      if (!row) return res.status(404).json({ error: "waiver not found" });
      res.json(row);
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get(
    "/api/lien-waivers/:id/document",
    async (req: Request, res: Response) => {
      try {
        const text = await generateDocumentText(DEFAULT_TENANT_ID, pid(req.params.id));
        if (req.query.format === "text") {
          res.type("text/plain").send(text);
        } else {
          res.json({ text });
        }
      } catch (err) {
        handleError(res, err, "document failed");
      }
    },
  );

  app.get(
    "/api/lien-waivers/:id/events",
    async (req: Request, res: Response) => {
      try {
        const rows = await listEvents(DEFAULT_TENANT_ID, pid(req.params.id));
        res.json(rows);
      } catch (err) {
        handleError(res, err, "events failed");
      }
    },
  );

  app.post("/api/lien-waivers", async (req: Request, res: Response) => {
    try {
      const b = req.body ?? {};
      if (!b.projectId) return badRequest(res, "projectId required");
      if (!b.vendorId) return badRequest(res, "vendorId required");
      if (!b.waiverType || !WAIVER_TYPES.includes(b.waiverType)) {
        return badRequest(
          res,
          `waiverType must be one of ${WAIVER_TYPES.join("|")}`,
        );
      }
      if (b.paymentAmount == null) {
        return badRequest(res, "paymentAmount required");
      }
      const created = await createWaiver({
        tenantId: DEFAULT_TENANT_ID,
        projectId: String(b.projectId),
        vendorId: String(b.vendorId),
        subcontractId: b.subcontractId ?? null,
        payAppId: b.payAppId ?? null,
        waiverType: b.waiverType as WaiverType,
        throughDate: asDate(b.throughDate, "throughDate"),
        paymentAmount: b.paymentAmount,
        exceptions: Array.isArray(b.exceptions) ? b.exceptions : undefined,
        signerName: b.signerName ?? null,
        signerTitle: b.signerTitle ?? null,
        signerEmail: b.signerEmail ?? null,
        expiresAt: optDate(b.expiresAt),
        notesText: b.notesText ?? null,
        createdByUserId: b.createdByUserId ?? null,
      });
      res.status(201).json(created);
    } catch (err) {
      handleError(res, err, "create failed");
    }
  });

  app.patch("/api/lien-waivers/:id", async (req: Request, res: Response) => {
    try {
      const b = req.body ?? {};
      const row = await updateWaiver(DEFAULT_TENANT_ID, pid(req.params.id), {
        waiverType: b.waiverType,
        throughDate: b.throughDate ? new Date(b.throughDate) : undefined,
        paymentAmount: b.paymentAmount,
        exceptions: Array.isArray(b.exceptions) ? b.exceptions : undefined,
        signerName: b.signerName,
        signerTitle: b.signerTitle,
        signerEmail: b.signerEmail,
        expiresAt: b.expiresAt === undefined ? undefined : optDate(b.expiresAt),
        notesText: b.notesText,
        payAppId: b.payAppId,
        subcontractId: b.subcontractId,
      });
      res.json(row);
    } catch (err) {
      handleError(res, err, "update failed");
    }
  });

  app.post("/api/lien-waivers/:id/send", async (req: Request, res: Response) => {
    try {
      const row = await sendWaiver(
        DEFAULT_TENANT_ID,
        pid(req.params.id),
        req.body?.actorUserId ?? null,
        req.body?.actorName ?? null,
      );
      res.json(row);
    } catch (err) {
      handleError(res, err, "send failed");
    }
  });

  app.post("/api/lien-waivers/:id/sign", async (req: Request, res: Response) => {
    try {
      const row = await signWaiver(
        DEFAULT_TENANT_ID,
        pid(req.params.id),
        req.body?.actorUserId ?? null,
        req.body?.actorName ?? null,
        req.body?.signedBy ?? null,
      );
      res.json(row);
    } catch (err) {
      handleError(res, err, "sign failed");
    }
  });

  app.post(
    "/api/lien-waivers/:id/receive",
    async (req: Request, res: Response) => {
      try {
        const row = await receiveWaiver(
          DEFAULT_TENANT_ID,
          pid(req.params.id),
          req.body?.actorUserId ?? null,
          req.body?.actorName ?? null,
        );
        res.json(row);
      } catch (err) {
        handleError(res, err, "receive failed");
      }
    },
  );

  app.post("/api/lien-waivers/:id/void", async (req: Request, res: Response) => {
    try {
      const reason =
        typeof req.body?.reason === "string" && req.body.reason.trim()
          ? req.body.reason
          : "voided";
      // voidWaiver service cancels any outstanding reminders inline
      // so the invariant holds for every caller (route, worker, etc).
      const row = await voidWaiver(
        DEFAULT_TENANT_ID,
        pid(req.params.id),
        reason,
        req.body?.actorUserId ?? null,
        req.body?.actorName ?? null,
      );
      res.json(row);
    } catch (err) {
      handleError(res, err, "void failed");
    }
  });

  // ── E-SIGN TOKEN FLOW ────────────────────────────────────────────
  app.post(
    "/api/lien-waivers/:id/sign-token",
    async (req: Request, res: Response) => {
      try {
        const ttlDays =
          typeof req.body?.ttlDays === "number" && req.body.ttlDays > 0
            ? Math.min(365, req.body.ttlDays)
            : undefined;
        const result = await generateSignToken(
          DEFAULT_TENANT_ID,
          pid(req.params.id),
          ttlDays,
        );
        res.json({
          token: result.token,
          expiresAt: result.expiresAt.toISOString(),
          signUrl: `/sign/lien-waiver/${result.token}`,
        });
      } catch (err) {
        handleError(res, err, "sign-token failed");
      }
    },
  );

  // PUBLIC route — no auth, no tenant scope. Looks up purely by token.
  app.get(
    "/api/sign/lien-waivers/:token",
    async (req: Request, res: Response) => {
      try {
        const waiver = await findWaiverBySignToken(pid(req.params.token));
        if (!waiver) return res.status(404).json({ error: "invalid sign link" });
        if (
          waiver.signTokenExpiresAt &&
          waiver.signTokenExpiresAt.getTime() < Date.now()
        ) {
          return res.status(410).json({ error: "sign link expired" });
        }
        // Try to autofill on first visit so the signer sees a complete
        // document. autofill is idempotent — re-running just refreshes.
        let filledBody = waiver.filledBody;
        try {
          if (!filledBody) {
            const filled = await autofillWaiver(waiver.tenantId, waiver.id);
            filledBody = filled.filledBody;
          }
        } catch {
          // fall through with raw waiver — generateDocumentText is the fallback
        }
        if (!filledBody) {
          try {
            filledBody = await generateDocumentText(waiver.tenantId, waiver.id);
          } catch {
            filledBody = "";
          }
        }

        // Resolve a few display fields so the signer can verify context.
        const [project] = waiver.projectId
          ? await db
              .select({ name: projects.name, projectNumber: projects.projectNumber })
              .from(projects)
              .where(eq(projects.id, waiver.projectId))
              .limit(1)
          : [];
        const [vendor] = waiver.vendorId
          ? await db
              .select({ companyName: vendors.companyName })
              .from(vendors)
              .where(eq(vendors.id, waiver.vendorId))
              .limit(1)
          : [];

        res.json({
          waiver: {
            id: waiver.id,
            waiverNumber: waiver.waiverNumber,
            waiverType: waiver.waiverType,
            status: waiver.status,
            paymentAmount: waiver.paymentAmount,
            throughDate: waiver.throughDate,
            signerName: waiver.signerName,
            signerTitle: waiver.signerTitle,
            signerEmail: waiver.signerEmail,
            tokenExpiresAt: waiver.signTokenExpiresAt,
          },
          projectName: project?.name ?? waiver.projectDescription ?? "—",
          projectNumber: project?.projectNumber ?? "—",
          vendorName: vendor?.companyName ?? waiver.vendorName ?? "—",
          filledBody: filledBody ?? "",
        });
      } catch (err) {
        handleError(res, err, "sign lookup failed");
      }
    },
  );

  // PUBLIC route — accepts the captured signature.
  app.post(
    "/api/sign/lien-waivers/:token",
    async (req: Request, res: Response) => {
      try {
        const b = req.body ?? {};
        if (!b.signerName || typeof b.signerName !== "string") {
          return badRequest(res, "signerName required");
        }
        if (!b.signatureDataUrl || typeof b.signatureDataUrl !== "string") {
          return badRequest(res, "signatureDataUrl required");
        }
        const ip =
          (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
          req.socket.remoteAddress ||
          null;
        const row = await signByToken(
          pid(req.params.token),
          {
            name: b.signerName,
            title: b.signerTitle ?? null,
            email: b.signerEmail ?? null,
          },
          b.signatureDataUrl,
          ip,
        );
        res.json({ ok: true, waiverId: row.id, signedAt: row.signedAt });
      } catch (err) {
        handleError(res, err, "sign failed");
      }
    },
  );

  // ── REMINDERS ────────────────────────────────────────────────────
  app.get(
    "/api/lien-waivers/:id/reminders",
    async (req: Request, res: Response) => {
      try {
        const rows = await listReminders(DEFAULT_TENANT_ID, pid(req.params.id));
        res.json(rows);
      } catch (err) {
        handleError(res, err, "reminders list failed");
      }
    },
  );

  app.post(
    "/api/lien-waivers/:id/schedule-reminders",
    async (req: Request, res: Response) => {
      try {
        const channel =
          typeof req.body?.channel === "string" && req.body.channel.trim()
            ? (req.body.channel as "email" | "sms" | "teams")
            : "email";
        // Re-scheduling? Cancel any pending first so we don't stack.
        await cancelPendingReminders(DEFAULT_TENANT_ID, pid(req.params.id));
        const rows = await scheduleDefaultReminders(
          DEFAULT_TENANT_ID,
          pid(req.params.id),
          new Date(),
          channel,
        );
        res.json(rows);
      } catch (err) {
        handleError(res, err, "schedule-reminders failed");
      }
    },
  );

  // Manual fire — useful for ops + tests. The setInterval monitor
  // calls this same service function once per minute.
  app.post(
    "/api/lien-waivers/process-reminders",
    async (_req: Request, res: Response) => {
      try {
        const result = await processDueReminders();
        res.json(result);
      } catch (err) {
        handleError(res, err, "process-reminders failed");
      }
    },
  );

  // ── AUTOFILL ─────────────────────────────────────────────────────
  app.post(
    "/api/lien-waivers/:id/autofill",
    async (req: Request, res: Response) => {
      try {
        const result = await autofillWaiver(
          DEFAULT_TENANT_ID,
          pid(req.params.id),
        );
        res.json(result);
      } catch (err) {
        handleError(res, err, "autofill failed");
      }
    },
  );

  // ── TEMPLATES ────────────────────────────────────────────────────
  app.get(
    "/api/lien-waiver-templates",
    async (req: Request, res: Response) => {
      try {
        const state = typeof req.query.state === "string" ? req.query.state : null;
        const rows = state
          ? await db
              .select()
              .from(lienWaiverTemplates)
              .where(eq(lienWaiverTemplates.state, state))
          : await db.select().from(lienWaiverTemplates).limit(500);
        res.json(rows);
      } catch (err) {
        handleError(res, err, "templates list failed");
      }
    },
  );

  app.post(
    "/api/lien-waiver-templates/seed",
    async (_req: Request, res: Response) => {
      try {
        const result = await seedLienWaiverTemplates();
        res.json({
          ...result,
          allStates: ALL_STATES.length,
          waiverTypes: WAIVER_TYPE_KEYS,
        });
      } catch (err) {
        handleError(res, err, "seed failed");
      }
    },
  );
}
