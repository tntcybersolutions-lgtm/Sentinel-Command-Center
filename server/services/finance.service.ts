import { db } from "../db";
import { 
  invoices, purchaseOrders, projects
} from "@shared/schema";
import { eq, and, sql, desc, gte, lte, sum } from "drizzle-orm";
import { auditService } from "./audit.service";
import { approvalService } from "./approval.service";

interface FinancialSummary {
  totalReceivables: number;
  totalPayables: number;
  cashOnHand: number;
  projectedCashflow: number;
  overdueReceivables: number;
  overduePayables: number;
}

class FinanceService {
  async listInvoices(tenantId: string, filters?: {
    invoiceType?: string;
    status?: string;
    projectId?: string;
    vendorId?: string;
    clientId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    let conditions = [eq(invoices.tenantId, tenantId)];
    
    if (filters?.invoiceType) {
      conditions.push(eq(invoices.invoiceType, filters.invoiceType));
    }
    if (filters?.status) {
      conditions.push(eq(invoices.status, filters.status));
    }
    if (filters?.projectId) {
      conditions.push(eq(invoices.projectId, filters.projectId));
    }
    if (filters?.vendorId) {
      conditions.push(eq(invoices.vendorId, filters.vendorId));
    }
    if (filters?.clientId) {
      conditions.push(eq(invoices.clientId, filters.clientId));
    }
    if (filters?.startDate) {
      conditions.push(gte(invoices.invoiceDate, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(invoices.invoiceDate, filters.endDate));
    }

    return db.select()
      .from(invoices)
      .where(and(...conditions))
      .orderBy(desc(invoices.createdAt));
  }

  async getInvoice(tenantId: string, invoiceId: string) {
    const [invoice] = await db.select()
      .from(invoices)
      .where(and(
        eq(invoices.tenantId, tenantId),
        eq(invoices.id, invoiceId)
      ));
    return invoice;
  }

  async createInvoice(tenantId: string, data: {
    invoiceNumber: string;
    invoiceType: string;
    vendorId?: string;
    clientId?: string;
    projectId?: string;
    subtotal?: string;
    taxAmount?: string;
    totalAmount?: string;
    invoiceDate?: Date;
    dueDate?: Date;
    notesJson?: unknown;
  }, actorId?: string) {
    const [invoice] = await db.insert(invoices)
      .values({
        tenantId,
        ...data,
        status: "draft",
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "invoice.created",
      actor: actorId || "system",
      entityType: "invoice",
      entityId: invoice.id,
      afterJson: invoice as Record<string, unknown>,
    });

    return invoice;
  }

  async updateInvoice(tenantId: string, invoiceId: string, data: Partial<{
    invoiceNumber: string;
    invoiceType: string;
    vendorId: string;
    clientId: string;
    projectId: string;
    subtotal: string;
    taxAmount: string;
    totalAmount: string;
    invoiceDate: Date;
    dueDate: Date;
    status: string;
    notesJson: unknown;
  }>, actorId?: string) {
    const [before] = await db.select()
      .from(invoices)
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, invoiceId)));

    const [invoice] = await db.update(invoices)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, invoiceId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "invoice.updated",
      actor: actorId || "system",
      entityType: "invoice",
      entityId: invoiceId,
      beforeJson: before as Record<string, unknown>,
      afterJson: invoice as Record<string, unknown>,
    });

    return invoice;
  }

  async updateInvoiceStatus(tenantId: string, invoiceId: string, status: string, actorId?: string) {
    const [before] = await db.select()
      .from(invoices)
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, invoiceId)));

    const [invoice] = await db.update(invoices)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, invoiceId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: `invoice.${status}`,
      actor: actorId || "system",
      entityType: "invoice",
      entityId: invoiceId,
      beforeJson: before as Record<string, unknown>,
      afterJson: invoice as Record<string, unknown>,
    });

    return invoice;
  }

  async recordPayment(tenantId: string, invoiceId: string, amount: string, actorId?: string) {
    const invoice = await this.getInvoice(tenantId, invoiceId);
    if (!invoice) throw new Error("Invoice not found");

    const totalPaid = parseFloat(invoice.paidAmount || "0") + parseFloat(amount);
    const totalDue = parseFloat(invoice.totalAmount || "0");
    const newStatus = totalPaid >= totalDue ? "paid" : "partial";

    const [updated] = await db.update(invoices)
      .set({
        paidAmount: totalPaid.toFixed(2),
        status: newStatus,
        paidDate: newStatus === "paid" ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "invoice.payment_recorded",
      actor: actorId || "system",
      entityType: "invoice",
      entityId: invoiceId,
      afterJson: { amount, totalPaid, status: newStatus },
    });

    return updated;
  }

  async getFinancialSummary(tenantId: string): Promise<FinancialSummary> {
    const now = new Date();

    const allInvoices = await this.listInvoices(tenantId);
    
    const receivables = allInvoices.filter(i => 
      i.invoiceType === "receivable" && ["sent", "partial"].includes(i.status)
    );
    const payables = allInvoices.filter(i => 
      i.invoiceType === "payable" && ["pending", "partial"].includes(i.status)
    );

    const totalReceivables = receivables.reduce((sum, i) => 
      sum + parseFloat(i.totalAmount || "0") - parseFloat(i.paidAmount || "0"), 0
    );
    const totalPayables = payables.reduce((sum, i) => 
      sum + parseFloat(i.totalAmount || "0") - parseFloat(i.paidAmount || "0"), 0
    );

    const overdueReceivables = receivables
      .filter(i => i.dueDate && i.dueDate < now)
      .reduce((sum, i) => sum + parseFloat(i.totalAmount || "0") - parseFloat(i.paidAmount || "0"), 0);
    
    const overduePayables = payables
      .filter(i => i.dueDate && i.dueDate < now)
      .reduce((sum, i) => sum + parseFloat(i.totalAmount || "0") - parseFloat(i.paidAmount || "0"), 0);

    return {
      totalReceivables,
      totalPayables,
      cashOnHand: 0,
      projectedCashflow: totalReceivables - totalPayables,
      overdueReceivables,
      overduePayables,
    };
  }

  async getProjectFinancials(tenantId: string, projectId: string) {
    const projectInvoices = await this.listInvoices(tenantId, { projectId });

    const projectPOs = await db.select()
      .from(purchaseOrders)
      .where(and(
        eq(purchaseOrders.tenantId, tenantId),
        eq(purchaseOrders.projectId, projectId)
      ));

    const totalBilled = projectInvoices
      .filter(i => i.invoiceType === "receivable")
      .reduce((sum, i) => sum + parseFloat(i.totalAmount || "0"), 0);

    const totalCollected = projectInvoices
      .filter(i => i.invoiceType === "receivable")
      .reduce((sum, i) => sum + parseFloat(i.paidAmount || "0"), 0);

    const totalCosts = projectPOs.reduce((sum, po) => sum + parseFloat(po.totalAmount || "0"), 0);

    return {
      totalBilled,
      totalCollected,
      outstandingReceivables: totalBilled - totalCollected,
      totalCosts,
      purchaseOrderCount: projectPOs.length,
    };
  }

  async getFinanceDashboard(tenantId: string) {
    const summary = await this.getFinancialSummary(tenantId);
    const recentInvoices = await this.listInvoices(tenantId);

    const overdueInvoices = recentInvoices.filter(i => 
      i.dueDate && i.dueDate < new Date() && ["sent", "partial"].includes(i.status)
    );

    return {
      ...summary,
      recentInvoices: recentInvoices.slice(0, 10),
      overdueInvoicesCount: overdueInvoices.length,
    };
  }
}

export const financeService = new FinanceService();
