import { Router, Request, Response } from "express";
import { db } from "../db";
import { bidProjects, opportunities, vendors, vendorBidSubmissions,
  bidForms, bidFormSections, bidFormLineItems,
  bidResponses, bidResponseLineItems, bidInvitations, costCodes,
  awardDecisions,
} from "@shared/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import {
  resolveInvitationByToken,
  checkRateLimit,
  checkTokenAttempt,
  recordFailedTokenAttempt,
  markOpened,
  getVendorVisibleFolders,
  getVendorVisibleDocuments,
  verifyDocumentAccess,
  logInvitationEvent,
  setIntendsToBid,
  saveBidDraft,
  submitBid,
} from "../services/bid-invitation.service";

const vendorRouter = Router();

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const forwardedStr = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return forwardedStr?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
}

function getUA(req: Request): string {
  const ua = req.headers["user-agent"];
  const uaStr = Array.isArray(ua) ? ua[0] : (ua || "unknown");
  return uaStr.substring(0, 500);
}

vendorRouter.use((req: Request, res: Response, next) => {
  const ip = getClientIp(req);
  if (!checkTokenAttempt(ip)) {
    return res.status(429).json({ error: "Too many failed attempts. Try again later." });
  }
  const tokenParam = (req.params.token as string) || req.path.split("/")[2] || "global";
  const rateLimitKey = `vendor:${ip}:${tokenParam}`;
  if (!checkRateLimit(rateLimitKey, 120, 60000)) {
    return res.status(429).json({ error: "Rate limit exceeded. Please slow down." });
  }
  next();
});

async function resolveAndValidate(req: Request, res: Response) {
  const token = req.params.token as string;
  if (!token || token.length < 20) {
    recordFailedTokenAttempt(getClientIp(req));
    return null;
  }
  const invitation = await resolveInvitationByToken(token);
  if (!invitation) {
    recordFailedTokenAttempt(getClientIp(req));
    res.status(404).json({ error: "Invalid or expired bid invitation" });
    return null;
  }
  return invitation;
}

vendorRouter.get("/bid/:token", async (req: Request, res: Response) => {
  try {
    const invitation = await resolveAndValidate(req, res);
    if (!invitation) return;

    const ip = getClientIp(req);
    const ua = getUA(req);
    await markOpened(invitation.id, ip, ua);

    const bidProject = await db.select().from(bidProjects).where(
      eq(bidProjects.id, invitation.bidProjectId)
    ).then(r => r[0]);

    let opportunity = null;
    if (bidProject?.opportunityId) {
      opportunity = await db.select().from(opportunities).where(
        eq(opportunities.id, bidProject.opportunityId)
      ).then(r => r[0]);
    }

    const vendor = await db.select().from(vendors).where(
      eq(vendors.id, invitation.vendorId)
    ).then(r => r[0]);

    const visibleFolders = await getVendorVisibleFolders(invitation.tenantId, invitation.bidProjectId);
    const visibleDocs = await getVendorVisibleDocuments(invitation.tenantId, invitation.bidProjectId);

    const foldersWithDocs = visibleFolders.map(f => ({
      ...f,
      documents: visibleDocs.filter(d => d.folderId === f.id).map(d => ({
        id: d.id,
        title: d.title,
        fileName: d.fileName,
        fileType: d.fileType,
        fileSizeBytes: d.fileSizeBytes,
        documentType: d.documentType,
        uploadedAt: d.uploadedAt,
      })),
    }));

    res.json({
      invitation: {
        id: invitation.id,
        status: invitation.status,
        deadlineSnapshot: invitation.dueAt,
        sentAt: invitation.sentAt,
        openedAt: invitation.openedAt,
        respondedAt: invitation.respondedAt,
        submittedAt: invitation.submittedAt,
      },
      bidProject: {
        id: bidProject?.id || "",
        opportunityTitle: opportunity?.title || "Untitled Bid",
        status: bidProject?.status || "unknown",
        agency: (opportunity as any)?.agency || "",
        noticeId: opportunity?.externalId || "",
        naicsCode: opportunity?.naicsCodes || "",
      },
      vendor: vendor ? {
        companyName: vendor.companyName,
        contactName: vendor.contactName,
        email: vendor.email,
      } : null,
      folders: foldersWithDocs,
    });
  } catch (err: any) {
    console.error("Vendor portal error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

vendorRouter.get("/bid/:token/documents/:docId/download", async (req: Request, res: Response) => {
  try {
    const invitation = await resolveAndValidate(req, res);
    if (!invitation) return;

    const docId = req.params.docId as string;
    const ip = getClientIp(req);
    const ua = getUA(req);

    const access = await verifyDocumentAccess(invitation.tenantId, invitation.bidProjectId, docId);
    if (!access.allowed) {
      return res.status(403).json({ error: "Access denied" });
    }

    const doc = access.document;

    await logInvitationEvent(invitation.id, "downloaded_doc", {
      documentId: docId,
      ip,
      userAgent: ua,
    });

    try {
      const { ObjectStorageService } = await import("../replit_integrations/object_storage");
      const storageService = new ObjectStorageService();
      const file = await storageService.getObjectEntityFile(doc.storageKey);
      const contentType = doc.mimeType || "application/octet-stream";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(doc.fileName)}"`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (doc.fileSizeBytes) {
        res.setHeader("Content-Length", String(doc.fileSizeBytes));
      }
      await storageService.downloadObject(file, res, 300);
    } catch (storageErr: any) {
      console.error("Storage download error:", storageErr.message);
      res.status(404).json({ error: "Document file not found" });
    }
  } catch (err: any) {
    console.error("Vendor download error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

vendorRouter.post("/bid/:token/intends", async (req: Request, res: Response) => {
  try {
    const invitation = await resolveAndValidate(req, res);
    if (!invitation) return;

    const { intends } = req.body;
    if (typeof intends !== "boolean") {
      return res.status(400).json({ error: "intends must be a boolean" });
    }

    const ip = getClientIp(req);
    const ua = getUA(req);
    await setIntendsToBid(invitation.id, intends, ip, ua);

    res.json({ success: true, status: intends ? "intends_to_bid" : "declined" });
  } catch (err: any) {
    console.error("Vendor intends error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

vendorRouter.get("/bid/:token/bid-form", async (req: Request, res: Response) => {
  try {
    const invitation = await resolveAndValidate(req, res);
    if (!invitation) return;

    const form = await db.select().from(bidForms).where(
      and(
        eq(bidForms.bidProjectId, invitation.bidProjectId),
        eq(bidForms.status, "published")
      )
    ).then(r => r[0]);

    if (!form) {
      const legacySub = await db.select().from(vendorBidSubmissions).where(
        eq(vendorBidSubmissions.invitationId, invitation.id)
      ).then(r => r[0]);
      return res.json({
        legacy: true,
        submission: legacySub || null,
        form: null,
        sections: [],
        response: null,
        responseLineItems: [],
        dueAt: invitation.dueAt,
        isOverdue: invitation.dueAt ? new Date() > invitation.dueAt : false,
      });
    }

    const sections = await db.select().from(bidFormSections)
      .where(eq(bidFormSections.bidFormId, form.id))
      .orderBy(asc(bidFormSections.sortOrder));
    const sectionIds = sections.map(s => s.id);
    let allItems: any[] = [];
    if (sectionIds.length > 0) {
      allItems = await db.select().from(bidFormLineItems)
        .where(sql`${bidFormLineItems.bidFormSectionId} IN (${sql.join(sectionIds.map(id => sql`${id}`), sql`, `)})`)
        .orderBy(asc(bidFormLineItems.sortOrder));
    }

    const allCostCodeIds = Array.from(new Set(allItems.filter(i => i.costCodeId).map(i => i.costCodeId!)));
    let costCodeMap: Record<string, any> = {};
    if (allCostCodeIds.length > 0) {
      const codes = await db.select().from(costCodes).where(
        sql`${costCodes.id} IN (${sql.join(allCostCodeIds.map(id => sql`${id}`), sql`, `)})`
      );
      codes.forEach(c => { costCodeMap[c.id] = c; });
    }

    const sectionsWithItems = sections.map(s => ({
      ...s,
      lineItems: allItems.filter(i => i.bidFormSectionId === s.id).map(i => ({
        ...i,
        costCode: i.costCodeId ? costCodeMap[i.costCodeId] || null : null,
      })),
    }));

    const existingResponse = await db.select().from(bidResponses).where(
      and(eq(bidResponses.invitationId, invitation.id), eq(bidResponses.bidFormId, form.id))
    ).then(r => r[0]);

    let responseLineItems: any[] = [];
    if (existingResponse) {
      responseLineItems = await db.select().from(bidResponseLineItems)
        .where(eq(bidResponseLineItems.bidResponseId, existingResponse.id));
    }

    res.json({
      legacy: false,
      form: { id: form.id, instructions: form.instructions, allowUnitPricing: form.allowUnitPricing, status: form.status },
      sections: sectionsWithItems,
      response: existingResponse || null,
      responseLineItems,
      dueAt: invitation.dueAt,
      isOverdue: invitation.dueAt ? new Date() > invitation.dueAt : false,
    });
  } catch (err: any) {
    console.error("Vendor bid form get error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

vendorRouter.post("/bid/:token/bid-form", async (req: Request, res: Response) => {
  try {
    const invitation = await resolveAndValidate(req, res);
    if (!invitation) return;

    const activeAward = await db.select().from(awardDecisions).where(
      and(
        eq(awardDecisions.bidProjectId, invitation.bidProjectId),
        eq(awardDecisions.status, "awarded")
      )
    ).then(r => r[0]);
    if (activeAward) {
      return res.status(403).json({ error: "This bid has been awarded. Submissions are closed." });
    }

    const ip = getClientIp(req);
    const ua = getUA(req);
    const { action, ...data } = req.body;

    const form = await db.select().from(bidForms).where(
      and(
        eq(bidForms.bidProjectId, invitation.bidProjectId),
        eq(bidForms.status, "published")
      )
    ).then(r => r[0]);

    if (!form) {
      if (action === "submit") {
        const result = await submitBid(invitation.id, data, ip, ua);
        return res.json({ success: true, submission: result, status: "submitted" });
      }
      const result = await saveBidDraft(invitation.id, data);
      await logInvitationEvent(invitation.id, "draft_saved", { ip, userAgent: ua });
      return res.json({ success: true, submission: result, status: "draft" });
    }

    if (invitation.dueAt && new Date() > invitation.dueAt) {
      return res.status(400).json({ error: "Bid submission deadline has passed" });
    }

    const { lineItems: itemsData, notes } = data;
    if (!itemsData || !Array.isArray(itemsData)) {
      return res.status(400).json({ error: "lineItems array is required" });
    }

    let existingResponse = await db.select().from(bidResponses).where(
      and(eq(bidResponses.invitationId, invitation.id), eq(bidResponses.bidFormId, form.id))
    ).then(r => r[0]);

    if (existingResponse && existingResponse.status === "submitted" && action !== "withdraw") {
      return res.status(400).json({ error: "Bid already submitted. Withdraw first to make changes." });
    }

    if (!existingResponse) {
      const [created] = await db.insert(bidResponses).values({
        tenantId: invitation.tenantId,
        bidProjectId: invitation.bidProjectId,
        bidFormId: form.id,
        invitationId: invitation.id,
        vendorId: invitation.vendorId,
        status: "draft",
        notes: notes || null,
      }).returning();
      existingResponse = created;
    } else {
      await db.update(bidResponses).set({ notes: notes || existingResponse.notes, updatedAt: new Date() })
        .where(eq(bidResponses.id, existingResponse.id));
    }

    await db.delete(bidResponseLineItems).where(eq(bidResponseLineItems.bidResponseId, existingResponse.id));
    if (itemsData.length > 0) {
      await db.insert(bidResponseLineItems).values(
        itemsData.map((item: any) => ({
          tenantId: invitation.tenantId,
          bidResponseId: existingResponse!.id,
          bidFormLineItemId: item.bidFormLineItemId,
          unitPrice: item.unitPrice ? String(item.unitPrice) : null,
          totalPrice: item.totalPrice ? String(item.totalPrice) : null,
          included: item.included !== false,
          comment: item.comment || null,
        }))
      );
    }

    if (action === "submit") {
      const formSections = await db.select().from(bidFormSections)
        .where(eq(bidFormSections.bidFormId, form.id));
      const requiredSectionIds = formSections.filter(s => s.isRequired).map(s => s.id);
      const formLineItems = await db.select().from(bidFormLineItems)
        .where(sql`${bidFormLineItems.bidFormSectionId} IN (${sql.join(requiredSectionIds.map(id => sql`${id}`), sql`, `)})`);
      const requiredItemIds = formLineItems.filter(i => i.isRequired).map(i => i.id);
      const submittedItemIds = itemsData
        .filter((i: any) => i.included !== false && i.totalPrice)
        .map((i: any) => i.bidFormLineItemId);
      const missingRequired = requiredItemIds.filter(id => !submittedItemIds.includes(id));
      if (missingRequired.length > 0) {
        return res.status(400).json({
          error: `Missing ${missingRequired.length} required line item(s)`,
          missingLineItemIds: missingRequired,
        });
      }

      await db.update(bidResponses).set({
        status: "submitted",
        submittedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(bidResponses.id, existingResponse.id));

      await db.update(bidInvitations).set({
        status: "submitted",
        submittedAt: new Date(),
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(bidInvitations.id, invitation.id));

      await logInvitationEvent(invitation.id, "submitted", { ip, userAgent: ua });
      return res.json({ success: true, status: "submitted" });
    }

    await logInvitationEvent(invitation.id, "draft_saved", { ip, userAgent: ua });
    res.json({ success: true, status: "draft" });
  } catch (err: any) {
    if (err.message === "Bid submission deadline has passed") {
      return res.status(400).json({ error: err.message });
    }
    console.error("Vendor bid form post error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { vendorRouter };
