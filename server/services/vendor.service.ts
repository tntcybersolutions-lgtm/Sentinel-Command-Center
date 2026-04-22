import { db } from "../db";
import { 
  vendors, subcontractorBids, subcontracts, purchaseOrders
} from "@shared/schema";
import { eq, and, sql, desc, gte, lte } from "drizzle-orm";
import { auditService } from "./audit.service";

class VendorService {
  async listVendors(tenantId: string, filters?: {
    vendorType?: string;
    status?: string;
  }) {
    let conditions = [eq(vendors.tenantId, tenantId)];
    
    if (filters?.vendorType) {
      conditions.push(eq(vendors.vendorType, filters.vendorType));
    }
    if (filters?.status) {
      conditions.push(eq(vendors.status, filters.status));
    }

    return db.select()
      .from(vendors)
      .where(and(...conditions))
      .orderBy(vendors.companyName);
  }

  async getVendor(tenantId: string, vendorId: string) {
    const [vendor] = await db.select()
      .from(vendors)
      .where(and(
        eq(vendors.tenantId, tenantId),
        eq(vendors.id, vendorId)
      ));
    return vendor;
  }

  async createVendor(tenantId: string, data: {
    vendorNumber: string;
    companyName: string;
    vendorType?: string;
    contactName?: string;
    email?: string;
    phone?: string;
    addressJson?: unknown;
    taxId?: string;
    paymentTerms?: string;
    categoriesJson?: unknown;
    insuranceExpiresAt?: Date;
    licenseExpiresAt?: Date;
    bondingCapacity?: string;
    prequalificationStatus?: string;
  }, actorId?: string) {
    const [vendor] = await db.insert(vendors)
      .values({
        tenantId,
        ...data,
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "vendor.created",
      actor: actorId || "system",
      entityType: "vendor",
      entityId: vendor.id,
      afterJson: vendor as Record<string, unknown>,
    });

    return vendor;
  }

  async updateVendor(tenantId: string, vendorId: string, data: Partial<{
    companyName: string;
    vendorType: string;
    contactName: string;
    email: string;
    phone: string;
    addressJson: unknown;
    taxId: string;
    paymentTerms: string;
    categoriesJson: unknown;
    insuranceExpiresAt: Date;
    licenseExpiresAt: Date;
    bondingCapacity: string;
    prequalificationStatus: string;
    status: string;
    performanceRating: string;
    safetyRating: string;
    qualityRating: string;
  }>, actorId?: string) {
    const [before] = await db.select()
      .from(vendors)
      .where(and(eq(vendors.tenantId, tenantId), eq(vendors.id, vendorId)));

    const [vendor] = await db.update(vendors)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(vendors.tenantId, tenantId), eq(vendors.id, vendorId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "vendor.updated",
      actor: actorId || "system",
      entityType: "vendor",
      entityId: vendorId,
      beforeJson: before as Record<string, unknown>,
      afterJson: vendor as Record<string, unknown>,
    });

    return vendor;
  }

  async rateVendor(tenantId: string, vendorId: string, data: {
    performanceRating?: string;
    safetyRating?: string;
    qualityRating?: string;
  }, actorId?: string) {
    const [before] = await db.select()
      .from(vendors)
      .where(and(eq(vendors.tenantId, tenantId), eq(vendors.id, vendorId)));

    const [vendor] = await db.update(vendors)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(vendors.tenantId, tenantId), eq(vendors.id, vendorId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "vendor.rating.updated",
      actor: actorId || "system",
      entityType: "vendor",
      entityId: vendorId,
      beforeJson: before as Record<string, unknown>,
      afterJson: vendor as Record<string, unknown>,
    });

    return vendor;
  }

  async getExpiringInsurance(tenantId: string, daysAhead: number = 30) {
    const futureDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

    return db.select()
      .from(vendors)
      .where(and(
        eq(vendors.tenantId, tenantId),
        eq(vendors.status, "active"),
        lte(vendors.insuranceExpiresAt, futureDate),
        gte(vendors.insuranceExpiresAt, new Date())
      ))
      .orderBy(vendors.insuranceExpiresAt);
  }

  async getExpiringLicenses(tenantId: string, daysAhead: number = 30) {
    const futureDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

    return db.select()
      .from(vendors)
      .where(and(
        eq(vendors.tenantId, tenantId),
        eq(vendors.status, "active"),
        lte(vendors.licenseExpiresAt, futureDate),
        gte(vendors.licenseExpiresAt, new Date())
      ))
      .orderBy(vendors.licenseExpiresAt);
  }

  async listSubcontractorBids(tenantId: string, projectId?: string) {
    let conditions = [eq(subcontractorBids.tenantId, tenantId)];
    
    if (projectId) {
      conditions.push(eq(subcontractorBids.projectId, projectId));
    }

    return db.select({
      bid: subcontractorBids,
      vendor: vendors,
    })
      .from(subcontractorBids)
      .innerJoin(vendors, eq(subcontractorBids.vendorId, vendors.id))
      .where(and(...conditions))
      .orderBy(desc(subcontractorBids.createdAt));
  }

  async createSubcontractorBid(tenantId: string, data: {
    projectId?: string;
    bidProjectId?: string;
    vendorId: string;
    scopeDescription?: string;
    bidAmount?: string;
    submittedAt?: Date;
    expiresAt?: Date;
    attachmentsJson?: unknown;
  }, actorId?: string) {
    const [bid] = await db.insert(subcontractorBids)
      .values({
        tenantId,
        ...data,
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "subcontractor_bid.created",
      actor: actorId || "system",
      entityType: "subcontractor_bid",
      entityId: bid.id,
      afterJson: bid as Record<string, unknown>,
    });

    return bid;
  }

  async evaluateSubcontractorBid(tenantId: string, bidId: string, data: {
    status: string;
    rejectionReason?: string;
  }, actorId?: string) {
    const updateData: Record<string, unknown> = {
      status: data.status,
      updatedAt: new Date(),
    };

    if (data.status === "selected") {
      updateData.selectedAt = new Date();
    } else if (data.status === "rejected") {
      updateData.rejectedAt = new Date();
      updateData.rejectionReason = data.rejectionReason;
    }

    const [bid] = await db.update(subcontractorBids)
      .set(updateData)
      .where(and(eq(subcontractorBids.tenantId, tenantId), eq(subcontractorBids.id, bidId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "subcontractor_bid.evaluated",
      actor: actorId || "system",
      entityType: "subcontractor_bid",
      entityId: bidId,
      afterJson: bid as Record<string, unknown>,
    });

    return bid;
  }

  async listSubcontracts(tenantId: string, filters?: {
    projectId?: string;
    vendorId?: string;
    status?: string;
  }) {
    let conditions = [eq(subcontracts.tenantId, tenantId)];

    if (filters?.projectId) {
      conditions.push(eq(subcontracts.projectId, filters.projectId));
    }
    if (filters?.vendorId) {
      conditions.push(eq(subcontracts.vendorId, filters.vendorId));
    }
    if (filters?.status) {
      conditions.push(eq(subcontracts.status, filters.status));
    }

    return db.select({
      subcontract: subcontracts,
      vendor: vendors,
    })
      .from(subcontracts)
      .innerJoin(vendors, eq(subcontracts.vendorId, vendors.id))
      .where(and(...conditions))
      .orderBy(desc(subcontracts.createdAt));
  }

  async createSubcontract(tenantId: string, data: {
    subcontractNumber: string;
    projectId: string;
    vendorId: string;
    scopeDescription?: string;
    contractAmount: string;
    retainagePercent?: string;
    startDate?: Date;
    endDate?: Date;
    termsJson?: unknown;
  }, actorId?: string) {
    const [subcontract] = await db.insert(subcontracts)
      .values({
        tenantId,
        ...data,
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "subcontract.created",
      actor: actorId || "system",
      entityType: "subcontract",
      entityId: subcontract.id,
      afterJson: subcontract as Record<string, unknown>,
    });

    return subcontract;
  }

  async executeSubcontract(tenantId: string, subcontractId: string, actorId?: string) {
    const [before] = await db.select()
      .from(subcontracts)
      .where(and(eq(subcontracts.tenantId, tenantId), eq(subcontracts.id, subcontractId)));

    const [subcontract] = await db.update(subcontracts)
      .set({
        status: "executed",
        executedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(subcontracts.tenantId, tenantId), eq(subcontracts.id, subcontractId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "subcontract.executed",
      actor: actorId || "system",
      entityType: "subcontract",
      entityId: subcontractId,
      beforeJson: before as Record<string, unknown>,
      afterJson: subcontract as Record<string, unknown>,
    });

    return subcontract;
  }

  async getVendorPurchaseHistory(tenantId: string, vendorId: string) {
    return db.select()
      .from(purchaseOrders)
      .where(and(
        eq(purchaseOrders.tenantId, tenantId),
        eq(purchaseOrders.vendorId, vendorId)
      ))
      .orderBy(desc(purchaseOrders.createdAt));
  }

  async getVendorPerformanceSummary(tenantId: string, vendorId: string) {
    const vendor = await this.getVendor(tenantId, vendorId);
    if (!vendor) return null;

    const purchaseHistory = await this.getVendorPurchaseHistory(tenantId, vendorId);
    const subcontractList = await this.listSubcontracts(tenantId, { vendorId });

    const totalPOValue = purchaseHistory.reduce((sum, po) => 
      sum + parseFloat(po.totalAmount || "0"), 0
    );

    const totalSubcontractValue = subcontractList.reduce((sum, s) => 
      sum + parseFloat(s.subcontract.contractAmount || "0"), 0
    );

    const insuranceExpiring = vendor.insuranceExpiresAt && 
      vendor.insuranceExpiresAt < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const licenseExpiring = vendor.licenseExpiresAt && 
      vendor.licenseExpiresAt < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    return {
      vendor,
      performanceRating: parseFloat(vendor.performanceRating || "0"),
      safetyRating: parseFloat(vendor.safetyRating || "0"),
      qualityRating: parseFloat(vendor.qualityRating || "0"),
      totalPurchaseOrders: purchaseHistory.length,
      totalPOValue,
      totalSubcontracts: subcontractList.length,
      totalSubcontractValue,
      complianceStatus: (insuranceExpiring || licenseExpiring) ? "needs_attention" : "compliant",
      insuranceExpiring,
      licenseExpiring,
    };
  }
}

export const vendorService = new VendorService();
