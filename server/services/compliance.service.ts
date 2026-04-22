import { db } from "../db";
import { 
  complianceFrameworks, complianceControls, complianceEvidence,
  securityPosture, securityIncidents
} from "@shared/schema";
import { eq, and, sql, desc, gte, lte } from "drizzle-orm";
import { auditService } from "./audit.service";

interface ComplianceScore {
  frameworkId: string;
  frameworkName: string;
  totalControls: number;
  implementedControls: number;
  partiallyImplementedControls: number;
  notImplementedControls: number;
  compliancePercentage: number;
}

class ComplianceService {
  async listFrameworks(tenantId: string) {
    return db.select()
      .from(complianceFrameworks)
      .where(eq(complianceFrameworks.tenantId, tenantId))
      .orderBy(complianceFrameworks.name);
  }

  async getFramework(tenantId: string, frameworkId: string) {
    const [framework] = await db.select()
      .from(complianceFrameworks)
      .where(and(
        eq(complianceFrameworks.tenantId, tenantId),
        eq(complianceFrameworks.id, frameworkId)
      ));
    return framework;
  }

  async createFramework(tenantId: string, data: {
    frameworkCode: string;
    name: string;
    version?: string;
    description?: string;
  }, actorId?: string) {
    const [framework] = await db.insert(complianceFrameworks)
      .values({
        tenantId,
        ...data,
        status: "active",
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "compliance_framework.created",
      actor: actorId || "system",
      entityType: "compliance_framework",
      entityId: framework.id,
      afterJson: framework as Record<string, unknown>,
    });

    return framework;
  }

  async listControls(tenantId: string, frameworkId?: string) {
    let conditions = [eq(complianceControls.tenantId, tenantId)];
    
    if (frameworkId) {
      conditions.push(eq(complianceControls.frameworkId, frameworkId));
    }

    return db.select()
      .from(complianceControls)
      .where(and(...conditions))
      .orderBy(complianceControls.controlCode);
  }

  async getControl(tenantId: string, controlId: string) {
    const [control] = await db.select()
      .from(complianceControls)
      .where(and(
        eq(complianceControls.tenantId, tenantId),
        eq(complianceControls.id, controlId)
      ));
    return control;
  }

  async createControl(tenantId: string, data: {
    frameworkId: string;
    controlCode: string;
    title: string;
    description?: string;
    category?: string;
    priority?: string;
    evidenceRequirements?: string;
    responsibleUserId?: string;
  }, actorId?: string) {
    const [control] = await db.insert(complianceControls)
      .values({
        tenantId,
        ...data,
        implementationStatus: "not_implemented",
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "compliance_control.created",
      actor: actorId || "system",
      entityType: "compliance_control",
      entityId: control.id,
      afterJson: control as Record<string, unknown>,
    });

    return control;
  }

  async updateControlStatus(tenantId: string, controlId: string, data: {
    implementationStatus: string;
    notesJson?: unknown;
  }, actorId?: string) {
    const [before] = await db.select()
      .from(complianceControls)
      .where(and(eq(complianceControls.tenantId, tenantId), eq(complianceControls.id, controlId)));

    const [control] = await db.update(complianceControls)
      .set({
        implementationStatus: data.implementationStatus,
        notesJson: data.notesJson,
        lastAssessedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(complianceControls.tenantId, tenantId), eq(complianceControls.id, controlId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "compliance_control.status_updated",
      actor: actorId || "system",
      entityType: "compliance_control",
      entityId: controlId,
      beforeJson: before as Record<string, unknown>,
      afterJson: control as Record<string, unknown>,
    });

    return control;
  }

  async addEvidence(tenantId: string, data: {
    controlId: string;
    evidenceType: string;
    title: string;
    description?: string;
    documentUrl?: string;
    expiresAt?: Date;
    collectedByUserId?: string;
  }) {
    const [evidence] = await db.insert(complianceEvidence)
      .values({
        tenantId,
        ...data,
        status: "valid",
        collectedAt: new Date(),
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "compliance_evidence.added",
      actor: data.collectedByUserId || "system",
      entityType: "compliance_evidence",
      entityId: evidence.id,
      afterJson: evidence as Record<string, unknown>,
    });

    return evidence;
  }

  async getControlEvidence(tenantId: string, controlId: string) {
    return db.select()
      .from(complianceEvidence)
      .where(and(
        eq(complianceEvidence.tenantId, tenantId),
        eq(complianceEvidence.controlId, controlId)
      ))
      .orderBy(desc(complianceEvidence.collectedAt));
  }

  async calculateComplianceScore(tenantId: string, frameworkId?: string): Promise<ComplianceScore[]> {
    const frameworks = frameworkId 
      ? [await this.getFramework(tenantId, frameworkId)].filter(Boolean)
      : await this.listFrameworks(tenantId);

    const scores: ComplianceScore[] = [];

    for (const framework of frameworks) {
      if (!framework) continue;
      
      const controls = await this.listControls(tenantId, framework.id);
      
      const implemented = controls.filter(c => c.implementationStatus === "implemented").length;
      const partial = controls.filter(c => c.implementationStatus === "partially_implemented").length;
      const notImplemented = controls.filter(c => c.implementationStatus === "not_implemented").length;

      const percentage = controls.length > 0 
        ? ((implemented + partial * 0.5) / controls.length) * 100 
        : 0;

      scores.push({
        frameworkId: framework.id,
        frameworkName: framework.name,
        totalControls: controls.length,
        implementedControls: implemented,
        partiallyImplementedControls: partial,
        notImplementedControls: notImplemented,
        compliancePercentage: Math.round(percentage * 10) / 10,
      });
    }

    return scores;
  }

  async getSecurityPosture(tenantId: string) {
    return db.select()
      .from(securityPosture)
      .where(eq(securityPosture.tenantId, tenantId))
      .orderBy(securityPosture.category, securityPosture.metric);
  }

  async updateSecurityMetric(tenantId: string, metricId: string, data: {
    currentValue: string;
    status?: string;
    detailsJson?: unknown;
  }, actorId?: string) {
    const [before] = await db.select()
      .from(securityPosture)
      .where(and(eq(securityPosture.tenantId, tenantId), eq(securityPosture.id, metricId)));

    const [metric] = await db.update(securityPosture)
      .set({
        currentValue: data.currentValue,
        status: data.status,
        detailsJson: data.detailsJson,
        lastCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(securityPosture.tenantId, tenantId), eq(securityPosture.id, metricId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "security_metric.updated",
      actor: actorId || "system",
      entityType: "security_posture",
      entityId: metricId,
      beforeJson: before as Record<string, unknown>,
      afterJson: metric as Record<string, unknown>,
    });

    return metric;
  }

  async createSecurityIncident(tenantId: string, data: {
    incidentNumber: string;
    incidentType: string;
    severity?: string;
    title: string;
    description?: string;
    affectedSystemsJson?: unknown;
    detectedAt: Date;
    reportedByUserId?: string;
    assignedToUserId?: string;
  }) {
    const [incident] = await db.insert(securityIncidents)
      .values({
        tenantId,
        ...data,
        status: "open",
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "security_incident.created",
      actor: data.reportedByUserId || "system",
      entityType: "security_incident",
      entityId: incident.id,
      afterJson: incident as Record<string, unknown>,
    });

    return incident;
  }

  async updateSecurityIncident(tenantId: string, incidentId: string, data: Partial<{
    status: string;
    containedAt: Date;
    resolvedAt: Date;
    rootCauseJson: unknown;
    remediationJson: unknown;
    lessonsLearnedJson: unknown;
  }>, actorId?: string) {
    const [before] = await db.select()
      .from(securityIncidents)
      .where(and(eq(securityIncidents.tenantId, tenantId), eq(securityIncidents.id, incidentId)));

    const [incident] = await db.update(securityIncidents)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(securityIncidents.tenantId, tenantId), eq(securityIncidents.id, incidentId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "security_incident.updated",
      actor: actorId || "system",
      entityType: "security_incident",
      entityId: incidentId,
      beforeJson: before as Record<string, unknown>,
      afterJson: incident as Record<string, unknown>,
    });

    return incident;
  }

  async listSecurityIncidents(tenantId: string, filters?: {
    status?: string;
    severity?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    let conditions = [eq(securityIncidents.tenantId, tenantId)];
    
    if (filters?.status) {
      conditions.push(eq(securityIncidents.status, filters.status));
    }
    if (filters?.severity) {
      conditions.push(eq(securityIncidents.severity, filters.severity));
    }
    if (filters?.startDate) {
      conditions.push(gte(securityIncidents.detectedAt, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(securityIncidents.detectedAt, filters.endDate));
    }

    return db.select()
      .from(securityIncidents)
      .where(and(...conditions))
      .orderBy(desc(securityIncidents.detectedAt));
  }

  async getComplianceDashboard(tenantId: string) {
    const frameworks = await this.listFrameworks(tenantId);
    const scores = await this.calculateComplianceScore(tenantId);
    const securityMetrics = await this.getSecurityPosture(tenantId);
    const recentIncidents = await this.listSecurityIncidents(tenantId, {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    });

    const overallCompliance = scores.length > 0
      ? scores.reduce((sum, s) => sum + s.compliancePercentage, 0) / scores.length
      : 0;

    const criticalMetrics = securityMetrics.filter(m => m.status === "non_compliant");
    const openIncidents = recentIncidents.filter(i => i.status === "open" || i.status === "investigating");

    return {
      frameworksCount: frameworks.length,
      overallCompliancePercentage: Math.round(overallCompliance * 10) / 10,
      scores,
      criticalFindings: criticalMetrics.length,
      openIncidents: openIncidents.length,
      recentIncidents: recentIncidents.slice(0, 5),
    };
  }
}

export const complianceService = new ComplianceService();
