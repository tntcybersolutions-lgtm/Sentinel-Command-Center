import { db } from "../db";
import { 
  opportunities, bidProjects, projects, employees, tickets,
  invoices, purchaseOrders, timeEntries, safetyIncidents
} from "@shared/schema";
import { eq, and, sql, desc, gte, lte, count } from "drizzle-orm";

interface DashboardMetrics {
  opportunitiesCount: number;
  activeBidsCount: number;
  activeProjectsCount: number;
  totalEmployees: number;
  openTickets: number;
  winRate: number;
  revenueThisMonth: number;
  pendingInvoices: number;
}

interface TrendData {
  period: string;
  value: number;
}

class AnalyticsService {
  async getDashboardMetrics(tenantId: string): Promise<DashboardMetrics> {
    const [opportunityCount] = await db.select({ count: count() })
      .from(opportunities)
      .where(eq(opportunities.tenantId, tenantId));

    const [bidCount] = await db.select({ count: count() })
      .from(bidProjects)
      .where(and(
        eq(bidProjects.tenantId, tenantId),
        eq(bidProjects.status, "in_progress")
      ));

    const [projectCount] = await db.select({ count: count() })
      .from(projects)
      .where(and(
        eq(projects.tenantId, tenantId),
        eq(projects.status, "active")
      ));

    const [employeeCount] = await db.select({ count: count() })
      .from(employees)
      .where(and(
        eq(employees.tenantId, tenantId),
        eq(employees.status, "active")
      ));

    const [ticketCount] = await db.select({ count: count() })
      .from(tickets)
      .where(and(
        eq(tickets.tenantId, tenantId),
        eq(tickets.status, "open")
      ));

    const allBids = await db.select()
      .from(bidProjects)
      .where(eq(bidProjects.tenantId, tenantId));

    const wonBids = allBids.filter(b => b.status === "won").length;
    const decidedBids = allBids.filter(b => ["won", "lost"].includes(b.status)).length;
    const winRate = decidedBids > 0 ? (wonBids / decidedBids) * 100 : 0;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthInvoices = await db.select()
      .from(invoices)
      .where(and(
        eq(invoices.tenantId, tenantId),
        eq(invoices.invoiceType, "receivable"),
        eq(invoices.status, "paid"),
        gte(invoices.paidDate, startOfMonth)
      ));

    const revenueThisMonth = monthInvoices.reduce((sum, inv) => 
      sum + parseFloat(inv.totalAmount || "0"), 0
    );

    const pendingInvoices = await db.select()
      .from(invoices)
      .where(and(
        eq(invoices.tenantId, tenantId),
        eq(invoices.invoiceType, "receivable"),
        eq(invoices.status, "sent")
      ));

    const pendingTotal = pendingInvoices.reduce((sum, inv) => 
      sum + parseFloat(inv.totalAmount || "0") - parseFloat(inv.paidAmount || "0"), 0
    );

    return {
      opportunitiesCount: opportunityCount?.count || 0,
      activeBidsCount: bidCount?.count || 0,
      activeProjectsCount: projectCount?.count || 0,
      totalEmployees: employeeCount?.count || 0,
      openTickets: ticketCount?.count || 0,
      winRate: Math.round(winRate * 10) / 10,
      revenueThisMonth,
      pendingInvoices: pendingTotal,
    };
  }

  async getOpportunityPipeline(tenantId: string) {
    const allOpportunities = await db.select()
      .from(opportunities)
      .where(eq(opportunities.tenantId, tenantId));

    const byStatus = {
      open: allOpportunities.filter(o => o.status === "open").length,
      qualified: allOpportunities.filter(o => o.status === "qualified").length,
      bidding: allOpportunities.filter(o => o.status === "bidding").length,
      submitted: allOpportunities.filter(o => o.status === "submitted").length,
      won: allOpportunities.filter(o => o.status === "won").length,
      lost: allOpportunities.filter(o => o.status === "lost").length,
    };

    const totalValue = allOpportunities.reduce((sum, o) => 
      sum + parseFloat(o.contractValue || "0"), 0
    );

    return {
      byStatus,
      totalCount: allOpportunities.length,
      totalValue,
    };
  }

  async getBidPerformance(tenantId: string, startDate?: Date, endDate?: Date) {
    let conditions = [eq(bidProjects.tenantId, tenantId)];
    
    if (startDate) {
      conditions.push(gte(bidProjects.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(bidProjects.createdAt, endDate));
    }

    const bids = await db.select()
      .from(bidProjects)
      .where(and(...conditions));

    const submitted = bids.filter(b => b.status !== "draft" && b.status !== "in_progress").length;
    const won = bids.filter(b => b.status === "won").length;
    const lost = bids.filter(b => b.status === "lost").length;
    const pending = bids.filter(b => b.status === "submitted").length;

    return {
      totalBids: bids.length,
      submitted,
      won,
      lost,
      pending,
      winRate: submitted > 0 ? (won / (won + lost)) * 100 : 0,
    };
  }

  async getProjectPerformance(tenantId: string) {
    const allProjects = await db.select()
      .from(projects)
      .where(eq(projects.tenantId, tenantId));

    const byStatus = {
      planning: allProjects.filter(p => p.status === "planning").length,
      active: allProjects.filter(p => p.status === "active").length,
      on_hold: allProjects.filter(p => p.status === "on_hold").length,
      completed: allProjects.filter(p => p.status === "completed").length,
    };

    const totalContractValue = allProjects.reduce((sum, p) => 
      sum + parseFloat(p.contractValue || "0"), 0
    );

    const avgCompletion = allProjects.reduce((sum, p) => 
      sum + (p.completionPercentage || 0), 0
    ) / (allProjects.length || 1);

    const onSchedule = allProjects.filter(p => {
      if (!p.expectedEndDate || p.status === "completed") return true;
      return new Date() <= p.expectedEndDate;
    }).length;

    return {
      byStatus,
      totalCount: allProjects.length,
      totalContractValue,
      averageCompletion: Math.round(avgCompletion),
      onSchedulePercentage: allProjects.length > 0 
        ? (onSchedule / allProjects.length) * 100 
        : 100,
    };
  }

  async getLaborAnalytics(tenantId: string, startDate?: Date, endDate?: Date) {
    let conditions = [eq(timeEntries.tenantId, tenantId)];
    
    if (startDate) {
      conditions.push(gte(timeEntries.entryDate, startDate));
    }
    if (endDate) {
      conditions.push(lte(timeEntries.entryDate, endDate));
    }

    const entries = await db.select()
      .from(timeEntries)
      .where(and(...conditions));

    const totalHours = entries.reduce((sum, e) => 
      sum + parseFloat(e.regularHours || "0") + parseFloat(e.overtimeHours || "0"), 0
    );

    const totalRegular = entries.reduce((sum, e) => 
      sum + parseFloat(e.regularHours || "0"), 0
    );

    const totalOvertime = entries.reduce((sum, e) => 
      sum + parseFloat(e.overtimeHours || "0"), 0
    );

    const uniqueEmployees = new Set(entries.map(e => e.employeeId)).size;

    return {
      totalHours,
      regularHours: totalRegular,
      overtimeHours: totalOvertime,
      overtimePercentage: totalHours > 0 ? (totalOvertime / totalHours) * 100 : 0,
      averageHoursPerEmployee: uniqueEmployees > 0 ? totalHours / uniqueEmployees : 0,
      uniqueEmployees,
    };
  }

  async getSafetyAnalytics(tenantId: string, startDate?: Date, endDate?: Date) {
    let conditions = [eq(safetyIncidents.tenantId, tenantId)];
    
    if (startDate) {
      conditions.push(gte(safetyIncidents.occurredAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(safetyIncidents.occurredAt, endDate));
    }

    const incidents = await db.select()
      .from(safetyIncidents)
      .where(and(...conditions));

    const bySeverity = {
      critical: incidents.filter(i => i.severity === "critical").length,
      major: incidents.filter(i => i.severity === "major").length,
      minor: incidents.filter(i => i.severity === "minor").length,
      near_miss: incidents.filter(i => i.severity === "near_miss").length,
    };

    const byType = incidents.reduce((acc: Record<string, number>, i) => {
      const type = i.incidentType || "other";
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    const openIncidents = incidents.filter(i => 
      i.status === "reported" || i.status === "investigating"
    ).length;

    return {
      totalIncidents: incidents.length,
      bySeverity,
      byType,
      openIncidents,
      closedIncidents: incidents.length - openIncidents,
      recentIncidents: incidents
        .sort((a, b) => (b.occurredAt?.getTime() || 0) - (a.occurredAt?.getTime() || 0))
        .slice(0, 5),
    };
  }

  async getFinancialTrends(tenantId: string, months: number = 6): Promise<TrendData[]> {
    const trends: TrendData[] = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

      const monthInvoices = await db.select()
        .from(invoices)
        .where(and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.invoiceType, "receivable"),
          gte(invoices.invoiceDate, monthStart),
          lte(invoices.invoiceDate, monthEnd)
        ));

      const monthlyRevenue = monthInvoices.reduce((sum, inv) => 
        sum + parseFloat(inv.totalAmount || "0"), 0
      );

      trends.push({
        period: monthStart.toISOString().slice(0, 7),
        value: monthlyRevenue,
      });
    }

    return trends;
  }

  async getExecutiveDashboard(tenantId: string) {
    const metrics = await this.getDashboardMetrics(tenantId);
    const pipeline = await this.getOpportunityPipeline(tenantId);
    const bidPerformance = await this.getBidPerformance(tenantId);
    const projectPerformance = await this.getProjectPerformance(tenantId);
    const revenueTrends = await this.getFinancialTrends(tenantId, 6);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const laborAnalytics = await this.getLaborAnalytics(tenantId, thirtyDaysAgo);
    const safetyAnalytics = await this.getSafetyAnalytics(tenantId, thirtyDaysAgo);

    return {
      metrics,
      pipeline,
      bidPerformance,
      projectPerformance,
      laborAnalytics,
      safetyAnalytics,
      revenueTrends,
      generatedAt: new Date(),
    };
  }

  async getKPIReport(tenantId: string, reportType: string = "monthly") {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const bidPerf = await this.getBidPerformance(tenantId, thirtyDaysAgo);
    const projectPerf = await this.getProjectPerformance(tenantId);
    const laborAnalytics = await this.getLaborAnalytics(tenantId, thirtyDaysAgo);
    const safetyAnalytics = await this.getSafetyAnalytics(tenantId, thirtyDaysAgo);

    return {
      reportType,
      period: {
        start: thirtyDaysAgo,
        end: new Date(),
      },
      kpis: {
        winRate: {
          value: bidPerf.winRate,
          target: 35,
          unit: "%",
        },
        projectOnTimeRate: {
          value: projectPerf.onSchedulePercentage,
          target: 90,
          unit: "%",
        },
        overtimeRate: {
          value: laborAnalytics.overtimePercentage,
          target: 10,
          unit: "%",
        },
        safetyIncidentRate: {
          value: safetyAnalytics.totalIncidents,
          target: 0,
          unit: "incidents",
        },
        activeProjects: {
          value: projectPerf.byStatus.active,
          target: null,
          unit: "projects",
        },
      },
      generatedAt: new Date(),
    };
  }
}

export const analyticsService = new AnalyticsService();
