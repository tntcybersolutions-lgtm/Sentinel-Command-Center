import { db } from "../db";
import {
  approvalRequests,
  bidProjects,
  opportunities,
  projects,
  jacketFolders,
  jacketDocuments,
  bidForms,
  workPackages,
  workPackageTasks,
  BID_JACKET_FOLDERS,
  type DecisionPacket,
  type WorkPackageProject,
  type WorkPackageSummary,
  type WorkPackageTaskData,
  type WorkPackageArtifact,
  type WorkPackageRouting,
  type WorkPackageRisk,
  type WorkPackageStatus,
  type WorkPackagePriority,
  type WorkPackageTaskStatus,
} from "@shared/schema";
import { eq, and, sql, inArray, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

const READINESS_SORT_ORDERS: Record<string, number> = {
  INTAKE: 0,
  SOLICITATION: 1,
  AMENDMENTS: 2,
  SITE_VISIT: 3,
  RFIS_QA: 4,
  ESTIMATING: 5,
  SUB_QUOTES: 6,
  INSURANCE_BONDING: 7,
  FORMS_CERTS: 8,
  PAST_PERFORMANCE: 9,
  TECHNICAL: 10,
  PRICING: 11,
  SUBMISSION: 12,
  COMPLIANCE: 13,
  POST_AWARD: 14,
  CLOSEOUT: 15,
  TEMPLATES: 98,
  ARCHIVE: 99,
};

const REQUIRED_ARTIFACT_FOLDERS = [
  { sortOrder: 1, name: "Solicitation", docType: "RFP" },
  { sortOrder: 8, name: "Forms & Certs", docType: "Forms" },
  { sortOrder: 10, name: "Technical", docType: "Technical Volume" },
  { sortOrder: 11, name: "Pricing", docType: "Pricing Sheet" },
  { sortOrder: 6, name: "Sub Quotes", docType: "Sub Quotes" },
  { sortOrder: 9, name: "Past Performance", docType: "Past Performance" },
];

interface PackageTemplate {
  packageType: string;
  category: string;
  headlineTemplate: string;
  whyTemplate: string;
  tasks: TaskTemplate[];
  downstreamWorkflows: string[];
}

interface TaskTemplate {
  taskType: string;
  ownerRole: string;
  dependsOn: string[];
  artifactKind: WorkPackageArtifact["kind"];
  artifactSection?: string;
  artifactDocType?: string;
  checkSortOrder?: number;
}

const PACKAGE_TEMPLATES: Record<string, PackageTemplate> = {
  jacket_build: {
    packageType: "JACKET_BUILD",
    category: "Bid Setup",
    headlineTemplate: "Build Bid Jacket + initialize required folders",
    whyTemplate: "Bid created from SAM.gov opportunity; jacket missing required canonical folders.",
    tasks: [
      { taskType: "CreateFolders", ownerRole: "system", dependsOn: [], artifactKind: "folder" },
      { taskType: "IngestSolicitation", ownerRole: "estimator", dependsOn: ["CreateFolders"], artifactKind: "document", artifactSection: "Solicitation", artifactDocType: "RFP", checkSortOrder: 1 },
      { taskType: "AutoClassifyDocuments", ownerRole: "system", dependsOn: ["IngestSolicitation"], artifactKind: "classification" },
      { taskType: "ComputeReadiness", ownerRole: "system", dependsOn: ["AutoClassifyDocuments"], artifactKind: "compliance" },
      { taskType: "GenerateBinder", ownerRole: "system", dependsOn: ["ComputeReadiness"], artifactKind: "binder" },
    ],
    downstreamWorkflows: ["Documents", "Bid Form", "Sub Quotes", "Binder", "Compliance"],
  },
  bid_submission: {
    packageType: "BID_SUBMISSION",
    category: "Bid Submission",
    headlineTemplate: "Verify & submit bid package",
    whyTemplate: "Bid package requires final verification before submission deadline.",
    tasks: [
      { taskType: "VerifyPricing", ownerRole: "estimator", dependsOn: [], artifactKind: "document", artifactSection: "Pricing", artifactDocType: "Pricing Sheet", checkSortOrder: 11 },
      { taskType: "VerifyTechnical", ownerRole: "pm", dependsOn: [], artifactKind: "document", artifactSection: "Technical", artifactDocType: "Technical Volume", checkSortOrder: 10 },
      { taskType: "ComplianceCheck", ownerRole: "compliance", dependsOn: [], artifactKind: "compliance" },
      { taskType: "FinalizeBinder", ownerRole: "system", dependsOn: ["VerifyPricing", "VerifyTechnical", "ComplianceCheck"], artifactKind: "binder" },
      { taskType: "SubmitPackage", ownerRole: "pm", dependsOn: ["FinalizeBinder"], artifactKind: "document", artifactSection: "Submission" },
    ],
    downstreamWorkflows: ["Binder", "Submission", "Post-Award"],
  },
  bid: {
    packageType: "BID_DECISION",
    category: "Bid Decision",
    headlineTemplate: "Review and decide on bid opportunity",
    whyTemplate: "Opportunity scored for bid/no-bid decision based on fit analysis.",
    tasks: [
      { taskType: "ReviewOpportunity", ownerRole: "pm", dependsOn: [], artifactKind: "document", artifactSection: "Solicitation" },
      { taskType: "AssessCapacity", ownerRole: "estimator", dependsOn: [], artifactKind: "compliance" },
      { taskType: "MakeDecision", ownerRole: "executive", dependsOn: ["ReviewOpportunity", "AssessCapacity"], artifactKind: "form" },
    ],
    downstreamWorkflows: ["Bid Setup", "Jacket Build", "Estimating"],
  },
  vendor_create: {
    packageType: "VENDOR_CREATE",
    category: "Vendor Management",
    headlineTemplate: "Review and approve new vendor",
    whyTemplate: "New vendor detected; requires verification before adding to directory.",
    tasks: [
      { taskType: "VerifyVendor", ownerRole: "pm", dependsOn: [], artifactKind: "compliance" },
      { taskType: "ApproveVendor", ownerRole: "executive", dependsOn: ["VerifyVendor"], artifactKind: "form" },
    ],
    downstreamWorkflows: ["Vendor Directory", "Sub Quotes"],
  },
  send_email: {
    packageType: "SEND_EMAIL",
    category: "Communication",
    headlineTemplate: "Review and approve outbound email",
    whyTemplate: "HERBIE drafted an email that requires human approval before sending.",
    tasks: [
      { taskType: "ReviewDraft", ownerRole: "pm", dependsOn: [], artifactKind: "document" },
      { taskType: "ApproveSend", ownerRole: "pm", dependsOn: ["ReviewDraft"], artifactKind: "form" },
    ],
    downstreamWorkflows: ["Communications Log"],
  },
};

const DEFAULT_TEMPLATE: PackageTemplate = {
  packageType: "GENERAL",
  category: "General",
  headlineTemplate: "Review and approve action",
  whyTemplate: "Action requires human review.",
  tasks: [
    { taskType: "Review", ownerRole: "pm", dependsOn: [], artifactKind: "form" },
    { taskType: "Approve", ownerRole: "executive", dependsOn: ["Review"], artifactKind: "form" },
  ],
  downstreamWorkflows: [],
};

export class WorkPackageService {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  async getDecisionPackets(statusFilter?: string, limit?: number): Promise<DecisionPacket[]> {
    const approvals = await db
      .select()
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.tenantId, this.tenantId),
          statusFilter ? eq(approvalRequests.status, statusFilter) : undefined
        )
      )
      .orderBy(desc(approvalRequests.createdAt))
      .limit(limit || 50);

    const seenEntities = new Set<string>();
    const packets: DecisionPacket[] = [];

    for (const approval of approvals) {
      const dedupeKey = `${approval.actionType}:${approval.entityId}`;
      if (seenEntities.has(dedupeKey)) continue;
      seenEntities.add(dedupeKey);

      try {
        const packet = await this.buildDecisionPacket(approval);
        packets.push(packet);
      } catch (err) {
        console.error(`[work-package] Error building packet for ${approval.id}:`, err);
      }
    }

    return packets;
  }

  private async buildDecisionPacket(approval: typeof approvalRequests.$inferSelect): Promise<DecisionPacket> {
    const context = (approval.contextJson as Record<string, any>) || {};
    const template = PACKAGE_TEMPLATES[approval.actionType] || DEFAULT_TEMPLATE;

    const project = await this.resolveProject(approval, context);
    const artifactStatus = project.id ? await this.getArtifactStatus(project.id) : null;
    const folderIntegrity = project.id ? await this.getFolderIntegrity(project.id) : null;
    const tasks = await this.buildTasks(template, project.id, artifactStatus, folderIntegrity);
    const risk = this.computeRisk(context, artifactStatus, approval);
    const missingArtifacts = artifactStatus ? this.computeMissingArtifacts(artifactStatus) : [];

    const summary: WorkPackageSummary = {
      headline: template.headlineTemplate,
      why: context.reason || template.whyTemplate,
      risk,
      impact: {
        financialDelta: 0,
        scheduleImpactDays: 0,
        downstreamWorkflows: template.downstreamWorkflows,
      },
    };

    const routing: WorkPackageRouting = this.buildRouting(approval, project.id);

    const priority = (approval.priority || "normal") as WorkPackagePriority;
    const dueDate = project.dueDate ? new Date(project.dueDate) : null;
    const isOverdue = dueDate && dueDate < new Date();
    const effectivePriority: WorkPackagePriority = isOverdue ? "urgent" : priority;

    return {
      id: approval.id,
      status: (approval.status || "pending") as WorkPackageStatus,
      priority: effectivePriority,
      category: template.category,
      actionType: approval.actionType,
      entityType: approval.entityType,
      entityId: approval.entityId,
      project,
      summary,
      tasks,
      missingArtifacts,
      routing,
      audit: {
        requestedBy: approval.requestedBy || "herbie",
        requestedAt: approval.createdAt.toISOString(),
      },
    };
  }

  private async resolveProject(
    approval: typeof approvalRequests.$inferSelect,
    context: Record<string, any>
  ): Promise<WorkPackageProject> {
    let name = context.opportunityTitle || null;
    let client: string | null = null;
    let naicsCode = context.naicsCode || null;
    let setAside = context.setAside || null;
    let stage: string | null = null;
    let dueDate: string | null = null;
    let estimatedValue: number | null = null;
    let projectId = approval.entityId;

    if (approval.entityType === "bid_project" || approval.actionType === "jacket_build" || approval.actionType === "bid_submission") {
      try {
        const bid = await db
          .select()
          .from(bidProjects)
          .where(eq(bidProjects.id, approval.entityId))
          .limit(1);

        if (bid.length > 0) {
          const b = bid[0];
          projectId = b.id;
          stage = b.status || "Initiated";

          if (b.opportunityId) {
            const opp = await db
              .select()
              .from(opportunities)
              .where(eq(opportunities.id, b.opportunityId))
              .limit(1);

            if (opp.length > 0) {
              const o = opp[0];
              name = name || o.title;
              client = o.setAside || null;
              naicsCode = naicsCode || (o.naicsCodes && o.naicsCodes.length > 0 ? o.naicsCodes[0] : null);
              setAside = setAside || o.setAside || null;
              dueDate = o.dueAt?.toISOString() || null;
              estimatedValue = o.contractValue ? Number(o.contractValue) : null;
            }
          }
        }
      } catch {}
    }

    if (approval.entityType === "project") {
      try {
        const proj = await db
          .select()
          .from(projects)
          .where(eq(projects.id, approval.entityId))
          .limit(1);

        if (proj.length > 0) {
          const p = proj[0];
          projectId = p.id;
          name = p.name || name;
          client = p.clientId || null;
          stage = p.status || "active";
          dueDate = p.expectedEndDate ? new Date(p.expectedEndDate).toISOString() : null;
          estimatedValue = p.contractValue ? Number(p.contractValue) : null;

          if (p.opportunityId) {
            const opp = await db
              .select()
              .from(opportunities)
              .where(eq(opportunities.id, p.opportunityId))
              .limit(1);
            if (opp.length > 0) {
              const o = opp[0];
              naicsCode = naicsCode || (o.naicsCodes && o.naicsCodes.length > 0 ? o.naicsCodes[0] : null);
              setAside = setAside || o.setAside || null;
              dueDate = dueDate || (o.dueAt?.toISOString() || null);
            }
          }
        }
      } catch {}
    }

    if (approval.entityType === "opportunity") {
      try {
        const opp = await db
          .select()
          .from(opportunities)
          .where(eq(opportunities.id, approval.entityId))
          .limit(1);

        if (opp.length > 0) {
          const o = opp[0];
          projectId = o.id;
          name = o.title || name;
          naicsCode = naicsCode || (o.naicsCodes && o.naicsCodes.length > 0 ? o.naicsCodes[0] : null);
          setAside = setAside || o.setAside || null;
          dueDate = o.dueAt?.toISOString() || null;
          estimatedValue = o.contractValue ? Number(o.contractValue) : null;
          stage = o.status || null;
        }
      } catch {}
    }

    if (approval.entityType === "vendor") {
      name = context.candidate?.name || "New Vendor";
      client = null;
    }

    if (approval.entityType === "email") {
      name = context.subject || "Email Draft";
      client = context.to || null;
    }

    return {
      id: projectId,
      name: name || "Unknown Project",
      client,
      naicsCode,
      setAside,
      stage,
      dueDate,
      estimatedValue,
    };
  }

  private async getArtifactStatus(bidProjectId: string) {
    const sortOrders = REQUIRED_ARTIFACT_FOLDERS.map(f => f.sortOrder);

    const rows = await db
      .select({
        sortOrder: jacketFolders.sortOrder,
        docCount: sql<number>`count(${jacketDocuments.id})`.mapWith(Number),
      })
      .from(jacketFolders)
      .leftJoin(
        jacketDocuments,
        and(
          eq(jacketDocuments.folderId, jacketFolders.id),
          eq(jacketDocuments.status, "active")
        )
      )
      .where(
        and(
          eq(jacketFolders.tenantId, this.tenantId),
          eq(jacketFolders.jacketType, "bid"),
          eq(jacketFolders.jacketId, bidProjectId),
          inArray(jacketFolders.sortOrder, sortOrders)
        )
      )
      .groupBy(jacketFolders.sortOrder);

    const docsBySortOrder = new Map<number, number>();
    for (const r of rows) docsBySortOrder.set(r.sortOrder, r.docCount);

    const formCheck = await db
      .select({ id: bidForms.id })
      .from(bidForms)
      .where(
        and(
          eq(bidForms.tenantId, this.tenantId),
          eq(bidForms.bidProjectId, bidProjectId)
        )
      )
      .limit(1);

    return {
      docsBySortOrder,
      hasSolicitation: (docsBySortOrder.get(1) ?? 0) > 0,
      hasForms: (docsBySortOrder.get(8) ?? 0) > 0 || formCheck.length > 0,
      hasTechnical: (docsBySortOrder.get(10) ?? 0) > 0,
      hasPricing: (docsBySortOrder.get(11) ?? 0) > 0,
      hasSubQuotes: (docsBySortOrder.get(6) ?? 0) > 0,
      hasPastPerformance: (docsBySortOrder.get(9) ?? 0) > 0,
      hasAddendaAck: (docsBySortOrder.get(2) ?? 0) > 0,
    };
  }

  private async getFolderIntegrity(bidProjectId: string) {
    const existingFolders = await db
      .select({ sortOrder: jacketFolders.sortOrder, name: jacketFolders.name })
      .from(jacketFolders)
      .where(
        and(
          eq(jacketFolders.tenantId, this.tenantId),
          eq(jacketFolders.jacketType, "bid"),
          eq(jacketFolders.jacketId, bidProjectId)
        )
      );

    const canonicalSortOrders = BID_JACKET_FOLDERS.map(f => f.code.split(" ")[0]).map(Number).filter(n => !isNaN(n));
    const existingSortOrders = existingFolders.map(f => f.sortOrder);
    const missingSortOrders = canonicalSortOrders.filter(so => !existingSortOrders.includes(so));

    return {
      existingCount: existingFolders.length,
      expectedCount: BID_JACKET_FOLDERS.length,
      missingSortOrders,
      isComplete: missingSortOrders.length === 0,
    };
  }

  private async buildTasks(
    template: PackageTemplate,
    projectId: string,
    artifactStatus: Awaited<ReturnType<typeof this.getArtifactStatus>> | null,
    folderIntegrity: Awaited<ReturnType<typeof this.getFolderIntegrity>> | null
  ): Promise<WorkPackageTaskData[]> {
    const taskMap = new Map<string, WorkPackageTaskData>();

    for (const tmpl of template.tasks) {
      const taskId = `t_${tmpl.taskType.toLowerCase()}`;
      let status: WorkPackageTaskStatus = "ready";

      if (tmpl.taskType === "CreateFolders" && folderIntegrity) {
        status = folderIntegrity.isComplete ? "done" : "ready";
      }

      if (tmpl.checkSortOrder !== undefined && artifactStatus) {
        const hasDoc = (artifactStatus.docsBySortOrder.get(tmpl.checkSortOrder) ?? 0) > 0;
        status = hasDoc ? "done" : "blocked";
      }

      if (tmpl.taskType === "AutoClassifyDocuments" && artifactStatus) {
        status = artifactStatus.hasSolicitation ? "ready" : "blocked";
      }

      if (tmpl.taskType === "ComputeReadiness") {
        status = "blocked";
        if (artifactStatus && (artifactStatus.hasSolicitation || artifactStatus.hasPricing)) {
          status = "ready";
        }
      }

      if (tmpl.taskType === "GenerateBinder") {
        status = "blocked";
        if (artifactStatus && artifactStatus.hasPricing && artifactStatus.hasTechnical) {
          status = "ready";
        }
      }

      if (tmpl.taskType === "FinalizeBinder") {
        status = "blocked";
        if (artifactStatus && artifactStatus.hasPricing && artifactStatus.hasTechnical) {
          status = "ready";
        }
      }

      if (tmpl.taskType === "SubmitPackage") {
        status = "blocked";
      }

      if (tmpl.taskType === "ComplianceCheck") {
        status = artifactStatus?.hasForms ? "ready" : "blocked";
      }

      const blockedByIds = tmpl.dependsOn.map(d => `t_${d.toLowerCase()}`);
      const isBlockedByIncomplete = blockedByIds.some(depId => {
        const dep = taskMap.get(depId);
        return dep && dep.status !== "done";
      });

      if (isBlockedByIncomplete && status !== "done") {
        status = "blocked";
      }

      const artifacts: WorkPackageArtifact[] = [];
      if (tmpl.taskType === "CreateFolders" && folderIntegrity) {
        for (const so of folderIntegrity.missingSortOrders.slice(0, 5)) {
          const folder = BID_JACKET_FOLDERS.find(f => {
            const code = parseInt(f.code.split(" ")[0]);
            return code === so;
          });
          artifacts.push({
            kind: "folder",
            sortOrder: so,
            name: folder ? `${folder.code} - ${folder.name}` : `Folder ${so}`,
            required: true,
          });
        }
        if (folderIntegrity.missingSortOrders.length > 5) {
          artifacts.push({
            kind: "folder",
            name: `+ ${folderIntegrity.missingSortOrders.length - 5} more folders`,
            required: true,
          });
        }
      } else {
        artifacts.push({
          kind: tmpl.artifactKind,
          section: tmpl.artifactSection,
          docType: tmpl.artifactDocType,
          required: true,
          sortOrder: tmpl.checkSortOrder,
        });
      }

      const task: WorkPackageTaskData = {
        taskId,
        taskType: tmpl.taskType,
        status,
        ownerRole: tmpl.ownerRole,
        blockedBy: blockedByIds,
        artifacts,
      };

      taskMap.set(taskId, task);
    }

    return Array.from(taskMap.values());
  }

  private computeRisk(
    context: Record<string, any>,
    artifactStatus: Awaited<ReturnType<typeof this.getArtifactStatus>> | null,
    approval: typeof approvalRequests.$inferSelect
  ): WorkPackageRisk {
    const score = context.score || 50;
    const flags: string[] = [];

    if (artifactStatus) {
      if (!artifactStatus.hasPricing) flags.push("Missing pricing artifacts");
      if (!artifactStatus.hasTechnical) flags.push("No technical volume");
      if (!artifactStatus.hasSolicitation) flags.push("Solicitation not ingested");
      if (!artifactStatus.hasForms) flags.push("Forms incomplete");
      if (!artifactStatus.hasSubQuotes) flags.push("No sub quotes");
    }

    if (!artifactStatus && (approval.actionType === "jacket_build" || approval.actionType === "bid_submission")) {
      flags.push("Missing folders");
      flags.push("No pricing artifacts");
      flags.push("No technical volume");
    }

    let level: WorkPackageRisk["level"] = "low";
    if (flags.length >= 4 || score < 50) level = "critical";
    else if (flags.length >= 3 || score < 60) level = "high";
    else if (flags.length >= 1 || score < 70) level = "medium";

    return { level, score, flags };
  }

  private computeMissingArtifacts(
    artifactStatus: Awaited<ReturnType<typeof this.getArtifactStatus>>
  ): string[] {
    const missing: string[] = [];
    if (!artifactStatus.hasPricing) missing.push("Pricing Sheet (folder 11)");
    if (!artifactStatus.hasTechnical) missing.push("Technical Volume (folder 10)");
    if (!artifactStatus.hasForms) missing.push("Forms & Certs (folder 08)");
    if (!artifactStatus.hasSolicitation) missing.push("Solicitation / RFP (folder 01)");
    if (!artifactStatus.hasSubQuotes) missing.push("Sub Quotes (folder 06)");
    if (!artifactStatus.hasPastPerformance) missing.push("Past Performance (folder 09)");
    if (!artifactStatus.hasAddendaAck) missing.push("Addenda Acknowledgement (folder 02)");
    return missing;
  }

  private buildRouting(
    approval: typeof approvalRequests.$inferSelect,
    projectId: string
  ): WorkPackageRouting {
    const tabMap: Record<string, string> = {
      jacket_build: "documents",
      bid_submission: "overview",
      approve_document: "documents",
      start_bid: "overview",
    };

    const tab = tabMap[approval.actionType] || "overview";
    const isBidRelated = ["jacket_build", "bid_submission", "approve_document", "start_bid"].includes(approval.actionType);

    let reviewUrl: string;
    let projectUrl: string;

    if (isBidRelated) {
      reviewUrl = `/capture/pursuits/${projectId}?tab=${tab}`;
      projectUrl = `/capture/pursuits/${projectId}`;
    } else if (approval.entityType === "project") {
      reviewUrl = `/projects/${approval.entityId}`;
      projectUrl = `/projects/${approval.entityId}`;
    } else if (approval.entityType === "opportunity" || approval.actionType === "bid_decision") {
      reviewUrl = `/capture/opportunity/${approval.entityId}`;
      projectUrl = `/capture/opportunity/${approval.entityId}`;
    } else {
      const entityTypeMap: Record<string, string> = {
        vendor: "vendor",
        task: "task",
        submittal: "submittal",
        rfi: "rfi",
        purchase_order: "purchaseOrder",
        change_order: "changeOrder",
        invoice: "invoice",
        ticket: "ticket",
        company: "company",
        competitor: "competitor",
        bid_project: "bidProject",
      };
      const mappedType = entityTypeMap[approval.entityType] || approval.entityType;
      reviewUrl = `/entity/${mappedType}/${approval.entityId}`;
      projectUrl = `/entity/${mappedType}/${approval.entityId}`;
    }

    return {
      reviewUrl,
      projectUrl,
      batchKey: projectId,
    };
  }

  async approvePackage(approvalId: string, notes?: string): Promise<void> {
    const [approval] = await db
      .select()
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.id, approvalId),
          eq(approvalRequests.tenantId, this.tenantId)
        )
      );

    if (!approval) {
      throw new Error(`Approval request ${approvalId} not found`);
    }

    if (approval.actionType === "jacket_build" || approval.actionType === "start_bid") {
      if (approval.entityType !== "bid_project") {
        throw new Error(`GUARD: jacket_build approval ${approvalId} has entityType='${approval.entityType}', expected 'bid_project'. Refusing to heal wrong entity.`);
      }

      const bidProjectId = approval.entityId;
      const [bidExists] = await db
        .select({ id: bidProjects.id })
        .from(bidProjects)
        .where(eq(bidProjects.id, bidProjectId))
        .limit(1);

      if (!bidExists) {
        throw new Error(`GUARD: bid_project ${bidProjectId} not found in database. Cannot heal non-existent bid.`);
      }
    }

    await db
      .update(approvalRequests)
      .set({ status: "approved" })
      .where(
        and(
          eq(approvalRequests.id, approvalId),
          eq(approvalRequests.tenantId, this.tenantId)
        )
      );

    await db
      .update(workPackages)
      .set({ status: "approved", updatedAt: new Date() })
      .where(
        and(
          eq(workPackages.approvalRequestId, approvalId),
          eq(workPackages.tenantId, this.tenantId)
        )
      );

    if (approval.actionType === "jacket_build" || approval.actionType === "start_bid") {
      const { jacketService } = await import("./jacket.service");
      const bidProjectId = approval.entityId;
      const result = await jacketService.ensureCanonicalBidJacket(this.tenantId, bidProjectId);
      console.log(`[ensure-canonical] tenant=${this.tenantId} bidProjectId=${bidProjectId} packageId=${approvalId} created=${result.createdFolders} renamed=${result.renamedFolders} healthy=${result.isHealthy}`);
    }
  }

  async rejectPackage(approvalId: string, reason: string): Promise<void> {
    await db
      .update(approvalRequests)
      .set({ status: "rejected" })
      .where(
        and(
          eq(approvalRequests.id, approvalId),
          eq(approvalRequests.tenantId, this.tenantId)
        )
      );

    await db
      .update(workPackages)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(
        and(
          eq(workPackages.approvalRequestId, approvalId),
          eq(workPackages.tenantId, this.tenantId)
        )
      );
  }

  async batchApprove(approvalIds: string[]): Promise<{ approved: number; failed: string[] }> {
    let approved = 0;
    const failed: string[] = [];

    for (const id of approvalIds) {
      try {
        await this.approvePackage(id);
        approved++;
      } catch (err) {
        failed.push(id);
      }
    }

    return { approved, failed };
  }
}
