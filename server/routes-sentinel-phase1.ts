// Roadmap Phase 1 — Sentinel Command Center routes.
//
// All new HTTP surface for the demo lives here so we don't keep growing
// the 24k-line server/routes.ts. Wired from registerRoutes() near the
// bottom of routes.ts via registerSentinelPhase1Routes(app).
//
// Endpoints:
//   POST   /api/projects/:projectId/daily-logs/voice
//   POST   /api/herbie/draft-rfi
//   POST   /api/herbie/draft-submittal
//   PATCH  /api/approvals/:id/approve
//   PATCH  /api/approvals/:id/reject
//   POST   /api/portal/shares
//   GET    /api/portal/shares
//   DELETE /api/portal/shares/:id
//   DELETE /api/portal/:token            (alias — UI uses token, not id)
//   GET    /api/portal/:token
//   GET    /api/portal/:token/documents

import type { Express, Request, Response } from "express";
import multer from "multer";
import { randomBytes } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import {
  approvalRequests,
  portalShares,
  projectDocuments,
  projects,
} from "@shared/schema";
import { upsertVoiceDailyLog } from "./services/voice-daily-log.service";
import {
  draftRFI,
  draftSubmittalWithHerbie,
} from "./services/herbie-draft.service";
import { approvalService } from "./services/approval.service";
import { storage } from "./storage";

const DEFAULT_TENANT_ID = "blackhawk-default";

// Multer for the voice upload — memory storage so we hand a Buffer
// straight to the transcriber. 25 MB cap covers a long site walk.
const voiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function p(v: unknown, name = "param"): string {
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(`${name} required`);
  }
  return v;
}

export function registerSentinelPhase1Routes(app: Express): void {
  // ============================================================
  // Voice Daily Log (Roadmap Feature 4 b2-3)
  // ============================================================
  app.post(
    "/api/projects/:projectId/daily-logs/voice",
    voiceUpload.single("audio"),
    async (req: Request, res: Response) => {
      try {
        const projectId = p(req.params.projectId, "projectId");
        const file = req.file;
        if (!file?.buffer?.length) {
          return res.status(400).json({ error: "audio file required" });
        }
        const logDate = req.body?.logDate
          ? new Date(req.body.logDate)
          : new Date();
        if (Number.isNaN(logDate.getTime())) {
          return res.status(400).json({ error: "invalid logDate" });
        }

        const result = await upsertVoiceDailyLog({
          tenantId: DEFAULT_TENANT_ID,
          projectId,
          logDate,
          audio: file.buffer,
          authorUserId: typeof req.body?.authorUserId === "string"
            ? req.body.authorUserId
            : undefined,
        });

        res.json({
          dailyLogId: result.dailyLogId,
          transcript: result.transcript,
          structured: result.draft,
          stubbed: result.stubbed,
        });
      } catch (err) {
        console.error("[voice-daily-log] error:", err);
        res.status(500).json({
          error: err instanceof Error ? err.message : "voice log failed",
        });
      }
    },
  );

  // ============================================================
  // Herbie LLM-backed RFI / Submittal drafts (Roadmap Feature 5)
  // ============================================================
  app.post("/api/herbie/draft-rfi", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.body?.projectId, "projectId");
      const prompt = p(req.body?.prompt, "prompt");
      const draftedBy =
        typeof req.body?.draftedBy === "string" ? req.body.draftedBy : "herbie";
      const result = await draftRFI(
        { tenantId: DEFAULT_TENANT_ID, projectId, draftedBy },
        prompt,
      );
      res.json(result);
    } catch (err) {
      console.error("[herbie/draft-rfi] error:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "draft RFI failed",
      });
    }
  });

  app.post(
    "/api/herbie/draft-submittal",
    async (req: Request, res: Response) => {
      try {
        const projectId = p(req.body?.projectId, "projectId");
        const prompt = p(req.body?.prompt, "prompt");
        const draftedBy =
          typeof req.body?.draftedBy === "string"
            ? req.body.draftedBy
            : "herbie";
        const result = await draftSubmittalWithHerbie(
          { tenantId: DEFAULT_TENANT_ID, projectId, draftedBy },
          prompt,
        );
        res.json(result);
      } catch (err) {
        console.error("[herbie/draft-submittal] error:", err);
        res.status(500).json({
          error:
            err instanceof Error ? err.message : "draft Submittal failed",
        });
      }
    },
  );

  // ============================================================
  // PATCH approve/reject aliases (Roadmap Feature 10)
  // Reject normalizes to "denied" through the same 409 guard as
  // PATCH /api/approvals/:id. We reuse the unified PATCH handler by
  // delegating into storage so the dispatcher in approval.service can
  // be invoked downstream when needed.
  // ============================================================
  app.patch(
    "/api/approvals/:id/approve",
    async (req: Request, res: Response) => {
      await decideApproval(req, res, "approved");
    },
  );

  app.patch(
    "/api/approvals/:id/reject",
    async (req: Request, res: Response) => {
      await decideApproval(req, res, "denied");
    },
  );

  // ============================================================
  // Portal Sharing (Roadmap Feature 11)
  // ============================================================
  app.post("/api/portal/shares", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.body?.projectId, "projectId");
      const audience = p(req.body?.audience, "audience"); // client | sub | internal
      if (!["client", "sub", "internal"].includes(audience)) {
        return res
          .status(400)
          .json({ error: "audience must be client | sub | internal" });
      }
      // Accept either `allowedCategories` (canonical) or `categoriesJson`
      // (UI alias from project-cockpit Share dialog) — Phase 1 we want
      // both keys to land on the same column rather than silently
      // expand the share to all categories on key mismatch.
      const rawCats = Array.isArray(req.body?.allowedCategories)
        ? req.body.allowedCategories
        : Array.isArray(req.body?.categoriesJson)
          ? req.body.categoriesJson
          : null;
      const allowedCategories: string[] = Array.isArray(rawCats)
        ? rawCats.filter((x: unknown) => typeof x === "string")
        : [];
      const expiresAt = req.body?.expiresAt
        ? new Date(req.body.expiresAt)
        : null;
      if (expiresAt && Number.isNaN(expiresAt.getTime())) {
        return res.status(400).json({ error: "invalid expiresAt" });
      }
      const notes =
        typeof req.body?.notes === "string" ? req.body.notes : null;

      const token = randomBytes(24).toString("base64url");

      const [row] = await db
        .insert(portalShares)
        .values({
          tenantId: DEFAULT_TENANT_ID,
          projectId,
          token,
          audience,
          allowedCategories,
          expiresAt,
          notes,
        })
        .returning();

      res.json(row);
    } catch (err) {
      console.error("[portal/shares POST] error:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "create share failed",
      });
    }
  });

  app.get("/api/portal/shares", async (req: Request, res: Response) => {
    try {
      const projectId = typeof req.query.projectId === "string"
        ? req.query.projectId
        : null;
      const conditions = [eq(portalShares.tenantId, DEFAULT_TENANT_ID)];
      if (projectId) conditions.push(eq(portalShares.projectId, projectId));
      const rows = await db
        .select()
        .from(portalShares)
        .where(and(...conditions))
        .orderBy(desc(portalShares.createdAt));
      res.json(rows);
    } catch (err) {
      console.error("[portal/shares GET] error:", err);
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : "list failed" });
    }
  });

  app.delete(
    "/api/portal/shares/:id",
    async (req: Request, res: Response) => {
      try {
        const id = p(req.params.id, "id");
        const [row] = await db
          .update(portalShares)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(portalShares.tenantId, DEFAULT_TENANT_ID),
              eq(portalShares.id, id),
            ),
          )
          .returning();
        if (!row) return res.status(404).json({ error: "not found" });
        res.json(row);
      } catch (err) {
        console.error("[portal/shares DELETE] error:", err);
        res.status(500).json({
          error: err instanceof Error ? err.message : "revoke failed",
        });
      }
    },
  );

  // DELETE by token — UI alias used by the project-cockpit Share modal
  // which only knows the token, not the share row id.
  app.delete("/api/portal/:token", async (req: Request, res: Response) => {
    try {
      const token = p(req.params.token, "token");
      const [row] = await db
        .update(portalShares)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(portalShares.tenantId, DEFAULT_TENANT_ID),
            eq(portalShares.token, token),
          ),
        )
        .returning();
      if (!row) return res.status(404).json({ error: "not found" });
      res.json(row);
    } catch (err) {
      console.error("[portal/:token DELETE] error:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "revoke failed",
      });
    }
  });

  // Token-gated portal — read-only. No auth required, the token is the
  // bearer credential. Returns 404 (not 403) on revoked/expired so we
  // don't leak the existence of the share.
  app.get("/api/portal/:token", async (req: Request, res: Response) => {
    try {
      const token = p(req.params.token, "token");
      const share = await loadShareByToken(token);
      if (!share) return res.status(404).json({ error: "share not found" });
      const [project] = await db
        .select({
          id: projects.id,
          name: projects.name,
          projectNumber: projects.projectNumber,
          status: projects.status,
        })
        .from(projects)
        .where(eq(projects.id, share.projectId))
        .limit(1);
      res.json({
        share: {
          id: share.id,
          audience: share.audience,
          allowedCategories: share.allowedCategories,
          expiresAt: share.expiresAt,
        },
        project: project ?? null,
      });
    } catch (err) {
      console.error("[portal/:token GET] error:", err);
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : "load failed" });
    }
  });

  app.get(
    "/api/portal/:token/documents",
    async (req: Request, res: Response) => {
      try {
        const token = p(req.params.token, "token");
        const share = await loadShareByToken(token);
        if (!share) return res.status(404).json({ error: "share not found" });
        const docs = await db
          .select({
            id: projectDocuments.id,
            title: projectDocuments.title,
            fileName: projectDocuments.fileName,
            linkedEntityType: projectDocuments.linkedEntityType,
            mimeType: projectDocuments.mimeType,
            storageKey: projectDocuments.storageKey,
            tagsJson: projectDocuments.tagsJson,
            createdAt: projectDocuments.createdAt,
          })
          .from(projectDocuments)
          .where(
            and(
              eq(projectDocuments.tenantId, share.tenantId),
              eq(projectDocuments.projectId, share.projectId),
            ),
          )
          .orderBy(desc(projectDocuments.createdAt))
          .limit(500);

        const allowed = (share.allowedCategories ?? []) as string[];
        // We treat `linkedEntityType` as the "category" hook (rfis,
        // submittals, drawings, etc.) — projectDocuments has no
        // dedicated category column today, and linkedEntityType is the
        // closest stable surface that tracks which jacket it was filed
        // under. Empty allowedCategories = share everything.
        const filtered = allowed.length === 0
          ? docs
          : docs.filter((d) =>
              d.linkedEntityType
                ? allowed.includes(d.linkedEntityType)
                : false,
            );
        // Reshape to the flat contract the portal page expects.
        // downloadUrl is null for now (Phase 1 demo is read-only metadata
        // only — wiring presigned object-storage URLs is a Phase 2 lift).
        res.json(
          filtered.map((d) => ({
            id: d.id,
            fileName: d.fileName ?? d.title ?? "Untitled",
            category: d.linkedEntityType ?? null,
            mimeType: d.mimeType ?? null,
            fileSize: null,
            createdAt: d.createdAt,
            downloadUrl: null,
          })),
        );
      } catch (err) {
        console.error("[portal/:token/documents GET] error:", err);
        res.status(500).json({
          error:
            err instanceof Error ? err.message : "load documents failed",
        });
      }
    },
  );
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

async function decideApproval(
  req: Request,
  res: Response,
  decision: "approved" | "denied",
): Promise<void> {
  try {
    const id = p(req.params.id, "id");
    const notes = typeof req.body?.notes === "string" ? req.body.notes : null;
    const existing = await storage.getApprovalRequest(id);
    if (!existing) {
      res.status(404).json({ error: "Approval request not found" });
      return;
    }
    if ((existing.status || "").toLowerCase() !== "pending") {
      res.status(409).json({
        error: `Approval already ${existing.status}; only pending approvals can be decided.`,
        current: existing.status,
      });
      return;
    }
    // For outbound drafts, persist the user's edited body into the
    // approval contextJson BEFORE handing off to processDecision so the
    // registered dispatcher (RFI/submittal/external_message) reads the
    // up-to-date draft.
    const draftBody =
      typeof req.body?.draftBody === "string" ? req.body.draftBody : null;
    if (draftBody && draftBody.trim() && decision === "approved") {
      const ctx =
        existing.contextJson && typeof existing.contextJson === "object"
          ? { ...(existing.contextJson as Record<string, any>) }
          : {};
      ctx.draftBody = draftBody;
      ctx.draftBody_editedByUser = true;
      await storage.updateApprovalRequest(id, { contextJson: ctx });
    }
    // Hand off to approvalService.processDecision so the dispatcher
    // registry fires (idempotent on approval_actions). It writes the
    // approval_actions row, status update, audit event, and dispatcher
    // call in one place — keeping legacy POST routes' behavior consistent.
    await approvalService.processDecision(
      {
        requestId: id,
        actor: "user",
        decision,
        notes: notes ?? undefined,
      },
      DEFAULT_TENANT_ID,
    );
    const approval = await storage.getApprovalRequest(id);
    if (!approval) {
      res.status(404).json({ error: "Approval request not found" });
      return;
    }
    res.json(approval);
  } catch (err) {
    console.error(`[approvals decide ${decision}] error:`, err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "decision failed",
    });
  }
}

async function loadShareByToken(token: string) {
  const [row] = await db
    .select()
    .from(portalShares)
    .where(and(eq(portalShares.token, token), isNull(portalShares.revokedAt)))
    .limit(1);
  if (!row) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
  return row;
}
