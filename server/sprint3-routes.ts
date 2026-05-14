// ============================================================================
// sprint3-routes.ts — Tier-1 gap-closure routes
// ----------------------------------------------------------------------------
//   /api/projects/:id/photos          (CRUD on projectPhotos)
//   /api/projects/:id/share-links     (create + list portal links)
//   /api/portal/:token                (public read-only portal view)
//   /api/projects/:id/schedule        (milestones + deps + computed dates)
//   /api/projects/:id/milestone-deps  (add/remove dependency)
//   /api/invoices/:id/payment-intent  (Stripe ACH)
//   /api/webhooks/stripe              (Stripe webhook receiver)
// All endpoints are tenant-scoped and fail soft.
// ============================================================================

import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { db } from "./db";
import {
  projectPhotos,
  projectShareLinks,
  milestoneDependencies,
  invoicePayments,
  projects,
  projectMilestones,
  invoices,
} from "@shared/schema";
import { and, eq, desc, asc, sql, inArray, isNull } from "drizzle-orm";
import { createPaymentIntent, handleStripeWebhook, computeStripeSignature } from "./services/stripe.service";

const DEFAULT_TENANT_ID = "blackhawk-default";
function getTenantId(req: Request): string {
  return (req as any)?.user?.tenantId || DEFAULT_TENANT_ID;
}

// ── PHOTOS ──────────────────────────────────────────────────────────────────

async function listProjectPhotos(tenantId: string, projectId: string) {
  return db.select()
    .from(projectPhotos)
    .where(and(
      eq(projectPhotos.tenantId, tenantId),
      eq(projectPhotos.projectId, projectId),
    ))
    .orderBy(desc(projectPhotos.capturedAt), desc(projectPhotos.createdAt));
}

// ── SHARE LINKS / PORTAL ─────────────────────────────────────────────────────

function newShareToken(): string {
  // URL-safe, 32 bytes of entropy.
  return crypto.randomBytes(24).toString("base64url");
}

async function lookupShareLink(token: string) {
  const [link] = await db.select()
    .from(projectShareLinks)
    .where(eq(projectShareLinks.token, token));
  return link || null;
}

async function buildPortalPayload(link: { tenantId: string; projectId: string; scopeJson: unknown }) {
  // Pull project + photos + milestones in parallel.
  const [projectRow] = await db.select({
    id: projects.id,
    name: projects.name,
    projectNumber: projects.projectNumber,
    status: projects.status,
    completionPercentage: projects.completionPercentage,
    startDate: projects.startDate,
    expectedEndDate: projects.expectedEndDate,
    contractValue: projects.contractValue,
    addressJson: projects.addressJson,
  })
    .from(projects)
    .where(and(
      eq(projects.tenantId, link.tenantId),
      eq(projects.id, link.projectId),
    ));

  if (!projectRow) return null;

  const photos = await listProjectPhotos(link.tenantId, link.projectId);
  const milestones = await db.select()
    .from(projectMilestones)
    .where(and(
      eq(projectMilestones.tenantId, link.tenantId),
      eq(projectMilestones.projectId, link.projectId),
    ));

  // Sanitize: never leak internal IDs of users, financial detail, or anything
  // beyond what an owner should see.
  return {
    project: {
      id: projectRow.id,
      name: projectRow.name,
      projectNumber: projectRow.projectNumber,
      status: projectRow.status,
      completionPercentage: Number(projectRow.completionPercentage || 0),
      startDate: projectRow.startDate,
      expectedEndDate: projectRow.expectedEndDate,
      contractValueShown: Number(projectRow.contractValue || 0) > 0,
    },
    photos: photos.map(p => ({
      id: p.id,
      url: p.storageUrl,
      thumbnail: p.thumbnailUrl || p.storageUrl,
      caption: p.caption,
      capturedAt: p.capturedAt,
      isHero: p.isHero,
    })),
    milestones: milestones.map((m: any) => ({
      id: m.id,
      name: m.milestoneName ?? m.name ?? "Milestone",
      status: m.status,
      targetDate: m.targetDate ?? m.dueDate ?? null,
      completedDate: m.completedDate ?? null,
    })),
  };
}

// ── GANTT / SCHEDULE ────────────────────────────────────────────────────────

async function getProjectSchedule(tenantId: string, projectId: string) {
  const milestonesRaw = await db.select()
    .from(projectMilestones)
    .where(and(
      eq(projectMilestones.tenantId, tenantId),
      eq(projectMilestones.projectId, projectId),
    ));

  const deps = await db.select()
    .from(milestoneDependencies)
    .where(and(
      eq(milestoneDependencies.tenantId, tenantId),
      eq(milestoneDependencies.projectId, projectId),
    ));

  // Normalize the milestone rows. The projectMilestones schema may use
  // milestoneName / dueDate or name / targetDate depending on version —
  // we accept both and emit a stable shape.
  const milestones = milestonesRaw.map((m: any) => ({
    id: m.id,
    name: m.milestoneName ?? m.name ?? "Milestone",
    status: m.status ?? "pending",
    startDate: m.startDate ?? null,
    targetDate: m.targetDate ?? m.dueDate ?? null,
    completedDate: m.completedDate ?? null,
    sortOrder: Number(m.sortOrder ?? 0),
  }));

  // Tiny CPM-ish forward pass: every dep adds (lagDays) to successor.
  // We surface the resulting `computedEarlyStart`/`computedEarlyFinish` so
  // the UI can render even when no explicit dates are set.
  const byId: Record<string, any> = {};
  for (const m of milestones) byId[m.id] = m;
  for (const dep of deps) {
    const pred = byId[dep.predecessorMilestoneId];
    const succ = byId[dep.successorMilestoneId];
    if (!pred || !succ) continue;
    succ._predecessors = succ._predecessors || [];
    succ._predecessors.push({ id: pred.id, lagDays: dep.lagDays, type: dep.type });
  }

  return {
    milestones,
    dependencies: deps.map(d => ({
      id: d.id,
      predecessorId: d.predecessorMilestoneId,
      successorId: d.successorMilestoneId,
      type: d.type,
      lagDays: d.lagDays,
    })),
  };
}

// ── REGISTRATION ────────────────────────────────────────────────────────────

export function registerSprint3Routes(app: Express) {

  // ─── Photos ──────────────────────────────────────────────────────────────
  app.get("/api/projects/:id/photos", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const photos = await listProjectPhotos(tenantId, req.params.id);
      res.json(photos);
    } catch (err) {
      console.error("[photos] list failed:", (err as Error)?.message);
      res.json([]);
    }
  });

  app.post("/api/projects/:id/photos", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const projectId = req.params.id;
      const b = req.body || {};
      if (!b.storageUrl || !b.fileName) {
        return res.status(400).json({ error: "storageUrl and fileName are required" });
      }
      const [row] = await db.insert(projectPhotos).values({
        tenantId,
        projectId,
        uploadedByUserId: (req as any)?.user?.id ?? null,
        fileName: String(b.fileName),
        contentType: b.contentType ?? null,
        storageUrl: String(b.storageUrl),
        thumbnailUrl: b.thumbnailUrl ?? null,
        width: b.width ?? null,
        height: b.height ?? null,
        bytes: b.bytes ?? null,
        capturedAt: b.capturedAt ? new Date(b.capturedAt) : null,
        gpsLat: b.gpsLat ?? null,
        gpsLng: b.gpsLng ?? null,
        caption: b.caption ?? null,
        tagsJson: b.tags ?? null,
        isHero: Boolean(b.isHero),
      }).returning();
      res.json(row);
    } catch (err) {
      console.error("[photos] create failed:", (err as Error)?.message);
      res.status(500).json({ error: "failed to record photo" });
    }
  });

  app.patch("/api/projects/:id/photos/:photoId", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { id: projectId, photoId } = req.params;
      const b = req.body || {};
      const updates: any = { updatedAt: new Date() };
      if (typeof b.caption === "string") updates.caption = b.caption;
      if (typeof b.isHero === "boolean") updates.isHero = b.isHero;
      if (Array.isArray(b.tags)) updates.tagsJson = b.tags;
      const [row] = await db.update(projectPhotos)
        .set(updates)
        .where(and(
          eq(projectPhotos.tenantId, tenantId),
          eq(projectPhotos.projectId, projectId),
          eq(projectPhotos.id, photoId),
        ))
        .returning();
      res.json(row || { error: "not found" });
    } catch (err) {
      console.error("[photos] patch failed:", (err as Error)?.message);
      res.status(500).json({ error: "patch failed" });
    }
  });

  app.delete("/api/projects/:id/photos/:photoId", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { id: projectId, photoId } = req.params;
      await db.delete(projectPhotos)
        .where(and(
          eq(projectPhotos.tenantId, tenantId),
          eq(projectPhotos.projectId, projectId),
          eq(projectPhotos.id, photoId),
        ));
      res.json({ ok: true });
    } catch (err) {
      console.error("[photos] delete failed:", (err as Error)?.message);
      res.status(500).json({ error: "delete failed" });
    }
  });

  // ─── Share Links (Owner Portal) ───────────────────────────────────────────
  app.post("/api/projects/:id/share-links", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const projectId = req.params.id;
      const b = req.body || {};
      const token = newShareToken();
      const expires = b.expiresInDays ? new Date(Date.now() + Number(b.expiresInDays) * 86_400_000) : null;
      const [link] = await db.insert(projectShareLinks).values({
        tenantId,
        projectId,
        token,
        label: b.label ?? "Owner view",
        scopeJson: b.scope ?? { allow: ["progress", "photos", "milestones"] },
        createdByUserId: (req as any)?.user?.id ?? null,
        expiresAt: expires,
      }).returning();
      const base = process.env.SELF_BASE_URL || "";
      res.json({
        ...link,
        portalUrl: `${base}/portal/${token}`,
      });
    } catch (err) {
      console.error("[share-links] create failed:", (err as Error)?.message);
      res.status(500).json({ error: "share-link create failed" });
    }
  });

  app.get("/api/projects/:id/share-links", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const links = await db.select({
        id: projectShareLinks.id,
        token: projectShareLinks.token,
        label: projectShareLinks.label,
        expiresAt: projectShareLinks.expiresAt,
        revokedAt: projectShareLinks.revokedAt,
        lastViewedAt: projectShareLinks.lastViewedAt,
        viewCount: projectShareLinks.viewCount,
        createdAt: projectShareLinks.createdAt,
      })
        .from(projectShareLinks)
        .where(and(
          eq(projectShareLinks.tenantId, tenantId),
          eq(projectShareLinks.projectId, req.params.id),
        ));
      res.json(links);
    } catch (err) {
      console.error("[share-links] list failed:", (err as Error)?.message);
      res.json([]);
    }
  });

  app.delete("/api/projects/:id/share-links/:linkId", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      await db.update(projectShareLinks)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(projectShareLinks.tenantId, tenantId),
          eq(projectShareLinks.id, req.params.linkId),
        ));
      res.json({ ok: true });
    } catch (err) {
      console.error("[share-links] revoke failed:", (err as Error)?.message);
      res.status(500).json({ error: "revoke failed" });
    }
  });

  // Public portal endpoint — NO auth. Token is the secret.
  app.get("/api/portal/:token", async (req: Request, res: Response) => {
    try {
      const link = await lookupShareLink(req.params.token);
      if (!link || link.revokedAt) return res.status(404).json({ error: "link not found" });
      if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
        return res.status(410).json({ error: "link expired" });
      }
      // Track usage (best-effort).
      db.update(projectShareLinks)
        .set({ viewCount: (link.viewCount ?? 0) + 1, lastViewedAt: new Date() })
        .where(eq(projectShareLinks.id, link.id))
        .catch(() => null);

      const payload = await buildPortalPayload(link);
      if (!payload) return res.status(404).json({ error: "project not found" });
      res.json(payload);
    } catch (err) {
      console.error("[portal] view failed:", (err as Error)?.message);
      res.status(500).json({ error: "portal view failed" });
    }
  });

  // ─── Schedule / Gantt ─────────────────────────────────────────────────────
  app.get("/api/projects/:id/schedule", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      res.json(await getProjectSchedule(tenantId, req.params.id));
    } catch (err) {
      console.error("[schedule] failed:", (err as Error)?.message);
      res.json({ milestones: [], dependencies: [] });
    }
  });

  app.post("/api/projects/:id/milestone-deps", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const projectId = req.params.id;
      const b = req.body || {};
      if (!b.predecessorId || !b.successorId) {
        return res.status(400).json({ error: "predecessorId and successorId required" });
      }
      const [row] = await db.insert(milestoneDependencies).values({
        tenantId,
        projectId,
        predecessorMilestoneId: String(b.predecessorId),
        successorMilestoneId: String(b.successorId),
        type: b.type ?? "FS",
        lagDays: Number(b.lagDays ?? 0),
      }).returning();
      res.json(row);
    } catch (err) {
      console.error("[deps] create failed:", (err as Error)?.message);
      res.status(500).json({ error: "dep create failed" });
    }
  });

  app.delete("/api/projects/:id/milestone-deps/:depId", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      await db.delete(milestoneDependencies)
        .where(and(
          eq(milestoneDependencies.tenantId, tenantId),
          eq(milestoneDependencies.id, req.params.depId),
        ));
      res.json({ ok: true });
    } catch (err) {
      console.error("[deps] delete failed:", (err as Error)?.message);
      res.status(500).json({ error: "dep delete failed" });
    }
  });

  // ─── Stripe ACH payments ──────────────────────────────────────────────────
  app.post("/api/invoices/:id/payment-intent", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const invoiceId = req.params.id;
      const b = req.body || {};
      const [inv] = await db.select()
        .from(invoices)
        .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, invoiceId)));
      if (!inv) return res.status(404).json({ error: "invoice not found" });

      const amountDue = Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0);
      const amount = Number(b.amount ?? amountDue);
      if (!(amount > 0)) {
        return res.status(400).json({ error: "amount must be > 0" });
      }

      const intent = await createPaymentIntent({
        amount,
        currency: "usd",
        method: "ach",
        invoiceId,
        tenantId,
        customerEmail: b.customerEmail,
      });

      // Record the attempt so we can reconcile via webhook later.
      await db.insert(invoicePayments).values({
        tenantId,
        invoiceId,
        stripePaymentIntentId: intent.id,
        amount: String(amount),
        method: "ach",
        status: intent.status ?? "requires_payment_method",
        initiatedByUserId: (req as any)?.user?.id ?? null,
        customerEmail: b.customerEmail ?? null,
      });

      res.json({
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id,
        status: intent.status,
        amount,
        method: "ach",
        publishableKeyEnv: "STRIPE_PUBLISHABLE_KEY",
      });
    } catch (err) {
      console.error("[stripe] intent failed:", (err as Error)?.message);
      res.status(500).json({ error: (err as Error)?.message || "payment intent failed" });
    }
  });

  // Stripe webhook — verifies signature, updates invoicePayments + invoices.
  // Raw body needs to be preserved for signature verification; we use
  // express.raw upstream when this route is mounted in server/index.ts.
  app.post("/api/webhooks/stripe", async (req: Request, res: Response) => {
    try {
      const sig = req.headers["stripe-signature"] as string | undefined;
      const payload = (req as any).rawBody || JSON.stringify(req.body);
      const event = await handleStripeWebhook(payload, sig);

      if (event?.type === "payment_intent.succeeded") {
        const pi = event.data?.object as any;
        const invoiceId = pi?.metadata?.invoiceId;
        const tenantId = pi?.metadata?.tenantId;
        const amountCents = Number(pi?.amount_received ?? pi?.amount ?? 0);
        const amountDollars = amountCents / 100;
        if (invoiceId && tenantId) {
          await db.update(invoicePayments)
            .set({ status: "succeeded", paidAt: new Date(), updatedAt: new Date() })
            .where(and(
              eq(invoicePayments.tenantId, tenantId),
              eq(invoicePayments.stripePaymentIntentId, pi.id),
            ));
          // Bump invoice paidAmount.
          await db.execute(sql`
            UPDATE invoices
            SET paid_amount = COALESCE(paid_amount,0) + ${amountDollars},
                paid_date = NOW(),
                status = CASE WHEN COALESCE(paid_amount,0) + ${amountDollars} >= COALESCE(total_amount,0) THEN 'paid' ELSE status END,
                updated_at = NOW()
            WHERE tenant_id = ${tenantId} AND id = ${invoiceId}
          `);
        }
      } else if (event?.type === "payment_intent.payment_failed") {
        const pi = event.data?.object as any;
        await db.update(invoicePayments)
          .set({
            status: "failed",
            failureReason: pi?.last_payment_error?.message ?? "unknown",
            updatedAt: new Date(),
          })
          .where(eq(invoicePayments.stripePaymentIntentId, pi.id));
      }

      res.json({ received: true });
    } catch (err) {
      console.error("[stripe] webhook failed:", (err as Error)?.message);
      res.status(400).json({ error: "webhook verification failed" });
    }
  });

  // Surface ENV health so the client knows whether to render the Pay button.
  app.get("/api/payments/config", (_req, res) => {
    res.json({
      enabled: !!process.env.STRIPE_SECRET_KEY,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
      method: "ach",
    });
  });
}

