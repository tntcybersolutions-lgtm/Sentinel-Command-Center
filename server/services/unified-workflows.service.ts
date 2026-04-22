import { db } from "../db";
import { eventBus } from "./event-bus.service";
import { entityLinkService } from "./entity-link.service";
import {
  projects, projectMilestones, bidProjects, opportunities,
  complianceItems, purchaseOrders, purchaseOrderLines,
  changeOrders, takeoffQuantities, events,
  type OpsEvent,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

const DEFAULT_TENANT_ID = "blackhawk-default";

const KICKOFF_TASKS = [
  { name: "Project Kickoff Meeting", description: "Schedule and conduct kickoff meeting with all stakeholders", dueOffset: 7 },
  { name: "Site Survey & Mobilization Plan", description: "Complete site visit and prepare mobilization plan", dueOffset: 14 },
  { name: "Submittal Schedule", description: "Prepare and submit submittal schedule per contract requirements", dueOffset: 21 },
  { name: "Safety Plan Submission", description: "Develop and submit project-specific safety plan", dueOffset: 14 },
  { name: "Schedule of Values", description: "Prepare schedule of values for pay application billing", dueOffset: 10 },
  { name: "Insurance & Bond Certificates", description: "Submit certificates of insurance and bond documentation", dueOffset: 7 },
  { name: "Quality Control Plan", description: "Develop QC/QA plan per contract specifications", dueOffset: 21 },
  { name: "Subcontractor Prequalification", description: "Review and prequalify subcontractors for major trades", dueOffset: 30 },
];

const DEFAULT_MARGIN_POLICY = {
  overheadPercent: 0.10,
  profitPercent: 0.08,
  contingencyPercent: 0.05,
  bondPercent: 0.02,
};

async function handleOpportunityWon(event: OpsEvent): Promise<void> {
  const payload = event.payload as Record<string, any>;
  const opportunityId = event.entityId;
  const tenantId = event.tenantId;

  const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId));
  if (!opp) return;

  let bidProject: any = null;
  if (payload.bidProjectId) {
    const [bp] = await db.select().from(bidProjects).where(eq(bidProjects.id, payload.bidProjectId));
    bidProject = bp;
  }

  const projectNumber = `PRJ-${Date.now().toString(36).toUpperCase()}`;
  const [project] = await db.insert(projects).values({
    tenantId,
    projectNumber,
    name: opp.title || `Project from ${opportunityId}`,
    description: opp.description || payload.description || "",
    opportunityId,
    bidProjectId: payload.bidProjectId || null,
    status: "planning",
    contractType: payload.contractType || "firm_fixed_price",
    contractValue: bidProject?.value || payload.contractValue || "0",
    startDate: new Date(),
  }).returning();

  const milestones = KICKOFF_TASKS.map((task, idx) => ({
    tenantId,
    projectId: project.id,
    name: task.name,
    description: task.description,
    dueDate: new Date(Date.now() + task.dueOffset * 86400000),
    status: "pending" as const,
    sequenceOrder: idx + 1,
  }));
  await db.insert(projectMilestones).values(milestones);

  await entityLinkService.createLink({
    tenantId,
    sourceType: "opportunity",
    sourceId: opportunityId,
    targetType: "project",
    targetId: project.id,
    relationLabel: "awarded_to",
    createdBy: event.triggeredBy,
  });

  if (payload.bidProjectId) {
    await entityLinkService.createLink({
      tenantId,
      sourceType: "bid_project",
      sourceId: payload.bidProjectId,
      targetType: "project",
      targetId: project.id,
      relationLabel: "converted_to",
      createdBy: event.triggeredBy,
    });
  }

  await eventBus.emit({
    tenantId,
    eventType: "ProjectCreated",
    entityType: "project",
    entityId: project.id,
    payload: { opportunityId, bidProjectId: payload.bidProjectId, projectNumber },
    triggeredBy: "system:workflow",
  });

  await eventBus.emit({
    tenantId,
    eventType: "ProjectKickoff",
    entityType: "project",
    entityId: project.id,
    payload: { tasksCreated: milestones.length },
    triggeredBy: "system:workflow",
  });
}
handleOpportunityWon.handlerName = "handleOpportunityWon";

async function handleSolicitationParsed(event: OpsEvent): Promise<void> {
  const payload = event.payload as Record<string, any>;
  const tenantId = event.tenantId;
  const bidProjectId = event.entityId;

  const clauses = (payload.clauses || []) as Array<{ ref: string; title: string; severity?: string }>;

  if (clauses.length === 0) {
    const defaultClauses = [
      { ref: "FAR 52.219-8", title: "Utilization of Small Business Concerns", severity: "critical" },
      { ref: "FAR 52.222-26", title: "Equal Opportunity", severity: "critical" },
      { ref: "FAR 52.222-35", title: "Equal Opportunity for Veterans", severity: "major" },
      { ref: "FAR 52.222-36", title: "Equal Opportunity for Workers with Disabilities", severity: "major" },
      { ref: "FAR 52.223-6", title: "Drug-Free Workplace", severity: "major" },
      { ref: "FAR 52.225-1", title: "Buy American Supplies", severity: "critical" },
      { ref: "FAR 52.232-33", title: "Payment by Electronic Funds Transfer", severity: "minor" },
    ];
    clauses.push(...defaultClauses);
  }

  const items = clauses.map((clause, idx) => ({
    tenantId,
    bidProjectId,
    title: clause.title,
    clauseRef: clause.ref,
    severity: clause.severity || "major",
    status: "missing" as const,
    folderSortOrder: idx,
    ownerRole: clause.severity === "critical" ? "contracts_manager" : "project_manager",
    dueAt: new Date(Date.now() + (clause.severity === "critical" ? 7 : 14) * 86400000),
  }));

  await db.insert(complianceItems).values(items);

  await eventBus.emit({
    tenantId,
    eventType: "ComplianceMatrixGenerated",
    entityType: "bid_project",
    entityId: bidProjectId,
    payload: { itemCount: items.length },
    triggeredBy: "system:workflow",
  });
}
handleSolicitationParsed.handlerName = "handleSolicitationParsed";

async function handleTakeoffUpdated(event: OpsEvent): Promise<void> {
  const payload = event.payload as Record<string, any>;
  const tenantId = event.tenantId;
  const projectId = payload.projectId;

  if (!projectId) return;

  const quantities = await db.select().from(takeoffQuantities)
    .where(and(
      eq(takeoffQuantities.tenantId, tenantId),
      eq(takeoffQuantities.projectId, projectId),
    ));

  const procurementLines = quantities.filter(q => {
    const cat = (q as any).categoryId;
    const notes = q.notes || "";
    return notes.toLowerCase().includes("procure") || notes.toLowerCase().includes("purchase") || notes.toLowerCase().includes("order");
  });

  if (procurementLines.length === 0) return;

  const poNumber = `PO-${Date.now().toString(36).toUpperCase()}`;
  const subtotal = procurementLines.reduce((sum, line) => {
    const ext = parseFloat(line.extendedCost || "0");
    return sum + ext;
  }, 0);

  const [po] = await db.insert(purchaseOrders).values({
    tenantId,
    poNumber,
    vendorId: "pending-assignment",
    projectId,
    status: "draft",
    subtotal: subtotal.toFixed(2),
    taxAmount: "0",
    totalAmount: subtotal.toFixed(2),
  }).returning();

  for (const line of procurementLines) {
    await db.insert(purchaseOrderLines).values({
      tenantId,
      purchaseOrderId: po.id,
      description: `${line.room || ""} ${line.floor || ""} - ${line.unit} x ${line.quantity}`.trim(),
      quantity: line.quantity,
      unitCost: line.unitCost || "0",
      totalCost: line.extendedCost || "0",
    });
  }

  await entityLinkService.createLink({
    tenantId,
    sourceType: "purchase_order",
    sourceId: po.id,
    targetType: "project",
    targetId: projectId,
    relationLabel: "procurement_for",
    createdBy: "system:workflow",
  });

  await eventBus.emit({
    tenantId,
    eventType: "POCreated",
    entityType: "purchase_order",
    entityId: po.id,
    payload: { projectId, lineCount: procurementLines.length, total: subtotal },
    triggeredBy: "system:workflow",
  });
}
handleTakeoffUpdated.handlerName = "handleTakeoffUpdated";

export function applyMarginPolicy(
  baseCost: number,
  policy: typeof DEFAULT_MARGIN_POLICY = DEFAULT_MARGIN_POLICY
): {
  baseCost: number;
  overhead: number;
  profit: number;
  contingency: number;
  bond: number;
  totalMarkup: number;
  sellPrice: number;
  marginPercent: number;
} {
  const overhead = baseCost * policy.overheadPercent;
  const profit = baseCost * policy.profitPercent;
  const contingency = baseCost * policy.contingencyPercent;
  const bond = baseCost * policy.bondPercent;
  const totalMarkup = overhead + profit + contingency + bond;
  const sellPrice = baseCost + totalMarkup;
  const marginPercent = sellPrice > 0 ? (totalMarkup / sellPrice) * 100 : 0;

  return {
    baseCost: Math.round(baseCost * 100) / 100,
    overhead: Math.round(overhead * 100) / 100,
    profit: Math.round(profit * 100) / 100,
    contingency: Math.round(contingency * 100) / 100,
    bond: Math.round(bond * 100) / 100,
    totalMarkup: Math.round(totalMarkup * 100) / 100,
    sellPrice: Math.round(sellPrice * 100) / 100,
    marginPercent: Math.round(marginPercent * 100) / 100,
  };
}

async function handleTakeoffDelta(event: OpsEvent): Promise<void> {
  const payload = event.payload as Record<string, any>;
  const tenantId = event.tenantId;
  const projectId = payload.projectId;

  if (!projectId) return;

  const previousTotal = parseFloat(payload.previousTotal || "0");
  const currentTotal = parseFloat(payload.currentTotal || "0");
  const delta = currentTotal - previousTotal;

  if (Math.abs(delta) < 0.01) return;

  const pricing = applyMarginPolicy(Math.abs(delta));

  const coNumber = `CO-${Date.now().toString(36).toUpperCase()}`;
  const [co] = await db.insert(changeOrders).values({
    tenantId,
    projectId,
    coNumber,
    title: `Scope Change - Takeoff Delta ${delta > 0 ? "Addition" : "Deduction"}`,
    description: [
      `Auto-generated from takeoff quantity change.`,
      `Previous total: $${previousTotal.toFixed(2)}`,
      `Current total: $${currentTotal.toFixed(2)}`,
      `Delta: $${delta.toFixed(2)}`,
      `Sell price with markup: $${(delta > 0 ? pricing.sellPrice : -pricing.sellPrice).toFixed(2)}`,
      `Margin breakdown: OH ${(DEFAULT_MARGIN_POLICY.overheadPercent * 100).toFixed(0)}% / P ${(DEFAULT_MARGIN_POLICY.profitPercent * 100).toFixed(0)}% / Cont ${(DEFAULT_MARGIN_POLICY.contingencyPercent * 100).toFixed(0)}% / Bond ${(DEFAULT_MARGIN_POLICY.bondPercent * 100).toFixed(0)}%`,
    ].join("\n"),
    changeType: delta > 0 ? "addition" : "deduction",
    status: "draft",
    amount: (delta > 0 ? pricing.sellPrice : -pricing.sellPrice).toFixed(2),
  }).returning();

  await entityLinkService.createLink({
    tenantId,
    sourceType: "change_order",
    sourceId: co.id,
    targetType: "project",
    targetId: projectId,
    relationLabel: "scope_change",
    createdBy: "system:workflow",
  });

  await eventBus.emit({
    tenantId,
    eventType: "ChangeOrderDrafted",
    entityType: "change_order",
    entityId: co.id,
    payload: {
      projectId,
      delta,
      baseCost: pricing.baseCost,
      sellPrice: pricing.sellPrice,
      marginPercent: pricing.marginPercent,
    },
    triggeredBy: "system:workflow",
  });
}
handleTakeoffDelta.handlerName = "handleTakeoffDelta";

export function registerWorkflowHandlers(): void {
  eventBus.register("OpportunityWon", handleOpportunityWon);
  eventBus.register("SolicitationParsed", handleSolicitationParsed);
  eventBus.register("TakeoffUpdated", handleTakeoffUpdated);
  eventBus.register("TakeoffDelta", handleTakeoffDelta);
}
