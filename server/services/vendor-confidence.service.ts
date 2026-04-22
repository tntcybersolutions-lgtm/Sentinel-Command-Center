import { db } from "../db";
import { vendors, approvalRequests, approvalActions } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

const AUTO_CREATE_THRESHOLD = 0.85;

interface VendorCandidate {
  name: string;
  trade?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  source?: string;
  sourceReference?: string;
}

interface DedupeMatch {
  vendorId: string;
  vendorName: string;
  confidence: number;
  matchType: "exact" | "fuzzy" | "email" | "phone";
}

class VendorConfidenceService {

  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\b(llc|inc|corp|co|ltd|limited|company|enterprises?|services?|group|holdings?|international)\b\.?/gi, "")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private generateVendorNumber(): string {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = crypto.randomBytes(2).toString("hex").toUpperCase();
    return `VND-${ts}-${rand}`;
  }

  async findDuplicates(tenantId: string, candidate: VendorCandidate): Promise<DedupeMatch[]> {
    const matches: DedupeMatch[] = [];
    const normalized = this.normalizeName(candidate.name);

    const existing = await db.select().from(vendors)
      .where(eq(vendors.tenantId, tenantId));

    for (const v of existing) {
      const existingNorm = this.normalizeName(v.companyName);

      if (existingNorm === normalized) {
        matches.push({ vendorId: v.id, vendorName: v.companyName, confidence: 1.0, matchType: "exact" });
        continue;
      }

      if (existingNorm.includes(normalized) || normalized.includes(existingNorm)) {
        const shorter = Math.min(existingNorm.length, normalized.length);
        const longer = Math.max(existingNorm.length, normalized.length);
        const ratio = shorter / longer;
        if (ratio > 0.5) {
          matches.push({ vendorId: v.id, vendorName: v.companyName, confidence: 0.6 + (ratio * 0.2), matchType: "fuzzy" });
        }
      }

      if (candidate.contactEmail && v.email &&
          candidate.contactEmail.toLowerCase() === v.email.toLowerCase()) {
        matches.push({ vendorId: v.id, vendorName: v.companyName, confidence: 0.9, matchType: "email" });
      }

      if (candidate.contactPhone && v.phone) {
        const cleanPhone = (p: string) => p.replace(/\D/g, "");
        if (cleanPhone(candidate.contactPhone) === cleanPhone(v.phone)) {
          matches.push({ vendorId: v.id, vendorName: v.companyName, confidence: 0.85, matchType: "phone" });
        }
      }
    }

    const seen = new Set<string>();
    return matches
      .sort((a, b) => b.confidence - a.confidence)
      .filter(m => { if (seen.has(m.vendorId)) return false; seen.add(m.vendorId); return true; });
  }

  async createWithConfidenceGating(tenantId: string, candidate: VendorCandidate): Promise<{
    action: "created" | "queued_for_review" | "duplicate_found";
    vendorId?: string;
    approvalId?: string;
    duplicates?: DedupeMatch[];
    confidence: number;
  }> {
    const dupes = await this.findDuplicates(tenantId, candidate);

    if (dupes.length > 0 && dupes[0].confidence >= 0.9) {
      return {
        action: "duplicate_found",
        vendorId: dupes[0].vendorId,
        duplicates: dupes,
        confidence: dupes[0].confidence,
      };
    }

    let confidence = 0.5;
    if (candidate.name && candidate.name.length > 3) confidence += 0.1;
    if (candidate.trade) confidence += 0.1;
    if (candidate.contactName) confidence += 0.1;
    if (candidate.contactEmail) confidence += 0.1;
    if (candidate.contactPhone) confidence += 0.05;
    if (candidate.source) confidence += 0.05;
    confidence = Math.min(confidence, 1.0);

    if (confidence >= AUTO_CREATE_THRESHOLD) {
      const [created] = await db.insert(vendors).values({
        id: crypto.randomUUID(),
        tenantId,
        vendorNumber: this.generateVendorNumber(),
        companyName: candidate.name,
        vendorType: candidate.trade || "supplier",
        contactName: candidate.contactName || null,
        email: candidate.contactEmail || null,
        phone: candidate.contactPhone || null,
        status: "active",
        notesJson: {
          confidenceScore: confidence,
          source: candidate.source || "manual",
          sourceReference: candidate.sourceReference || null,
          autoCreated: true,
        },
      }).returning();

      try {
        const { eventStreamService } = await import("./event-stream.service");
        eventStreamService.emit("APPROVAL_APPROVED", tenantId, {
          entityType: "vendor",
          vendorId: created.id,
          vendorName: created.companyName,
          action: "auto_created",
          confidence,
        });
      } catch {}

      return { action: "created", vendorId: created.id, confidence };
    } else {
      const placeholderId = crypto.randomUUID();
      const reasoning = `Vendor "${candidate.name}" has confidence score ${(confidence * 100).toFixed(0)}% (below ${(AUTO_CREATE_THRESHOLD * 100).toFixed(0)}% threshold). Fields provided: ${Object.entries(candidate).filter(([,v]) => v).map(([k]) => k).join(", ")}`;

      const [approval] = await db.insert(approvalRequests).values({
        id: crypto.randomUUID(),
        tenantId,
        entityType: "vendor",
        entityId: placeholderId,
        actionType: "vendor_create",
        status: "pending",
        requestedBy: "herbie",
        priority: "normal",
        contextJson: {
          candidate,
          confidenceScore: confidence,
          reasoning,
          duplicates: dupes.length > 0 ? dupes : undefined,
        },
      }).returning();

      try {
        const { eventStreamService } = await import("./event-stream.service");
        eventStreamService.emit("APPROVAL_REQUIRED", tenantId, {
          entityType: "vendor",
          candidateName: candidate.name,
          confidence,
          approvalId: approval.id,
        });
      } catch {}

      return {
        action: "queued_for_review",
        approvalId: approval.id,
        confidence,
        duplicates: dupes.length > 0 ? dupes : undefined,
      };
    }
  }

  async getPendingVendorReviews(tenantId: string) {
    return db.select().from(approvalRequests)
      .where(and(
        eq(approvalRequests.tenantId, tenantId),
        eq(approvalRequests.entityType, "vendor"),
        eq(approvalRequests.status, "pending"),
      ));
  }

  async approveVendorCreation(tenantId: string, approvalId: string): Promise<{ vendorId: string }> {
    const [approval] = await db.select().from(approvalRequests)
      .where(and(
        eq(approvalRequests.id, approvalId),
        eq(approvalRequests.tenantId, tenantId),
      ));

    if (!approval) throw new Error("Approval request not found");
    if (approval.status !== "pending") throw new Error(`Approval already ${approval.status}`);

    const context = approval.contextJson as { candidate: VendorCandidate; confidenceScore?: number } | null;
    if (!context?.candidate) throw new Error("No candidate data found in approval context");

    const candidate = context.candidate;
    const confidenceScore = context.confidenceScore ?? 0.5;

    const [created] = await db.insert(vendors).values({
      id: crypto.randomUUID(),
      tenantId,
      vendorNumber: this.generateVendorNumber(),
      companyName: candidate.name,
      vendorType: candidate.trade || "supplier",
      contactName: candidate.contactName || null,
      email: candidate.contactEmail || null,
      phone: candidate.contactPhone || null,
      status: "active",
      notesJson: {
        confidenceScore,
        source: candidate.source || "review_approved",
        sourceReference: candidate.sourceReference || null,
        autoCreated: false,
        approvalId,
      },
    }).returning();

    await db.update(approvalRequests)
      .set({ status: "approved" })
      .where(eq(approvalRequests.id, approvalId));

    await db.insert(approvalActions).values({
      id: crypto.randomUUID(),
      tenantId,
      approvalRequestId: approvalId,
      decision: "approved",
      notes: `Vendor "${candidate.name}" approved and created with ID ${created.id}`,
    });

    try {
      const { eventStreamService } = await import("./event-stream.service");
      eventStreamService.emit("APPROVAL_APPROVED", tenantId, {
        entityType: "vendor",
        vendorId: created.id,
        vendorName: created.companyName,
        action: "review_approved",
        confidence: confidenceScore,
      });
    } catch {}

    return { vendorId: created.id };
  }

  async mergeVendors(tenantId: string, keepId: string, mergeId: string): Promise<void> {
    await db.update(vendors)
      .set({ status: "inactive" })
      .where(and(eq(vendors.id, mergeId), eq(vendors.tenantId, tenantId)));
  }
}

export const vendorConfidenceService = new VendorConfidenceService();
