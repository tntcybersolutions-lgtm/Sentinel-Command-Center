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
  WAIVER_TYPES,
  WAIVER_STATUSES,
  type WaiverStatus,
  type WaiverType,
} from "./services/lien-waiver.service";

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
}
