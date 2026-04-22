import { Router, Request, Response } from "express";
import { db } from "../db";
import { 
  herbieActions, knowledgeDocuments, teamingPartners, conversationMemory,
  connectorStatus, featureFlags, opportunities, bidProjects, approvalRequests,
  captureStages, opportunityCapture, users
} from "@shared/schema";
import { eq, and, desc, gte, sql, count } from "drizzle-orm";
import { ToolRouterService } from "../services/tool-router.service";
import { RAGService } from "../services/rag.service";
import { MemoryService } from "../services/memory.service";
import { ConnectorService } from "../services/connectors.service";
import { approvalService } from "../services/approval.service";
import { auditService } from "../services/audit.service";
import { seedDatabase } from "../seed-data";

export const herbieCommandRoutes = Router();

const DEFAULT_TENANT_ID = "blackhawk-default";

herbieCommandRoutes.post("/chat", async (req: Request, res: Response) => {
  try {
    const { message, userId = "default-user" } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const toolRouter = new ToolRouterService(DEFAULT_TENANT_ID, userId);
    const response = await toolRouter.routeRequest(message);

    return res.json(response);
  } catch (error) {
    console.error("HERBIE chat error:", error);
    return res.status(500).json({ error: "Failed to process request" });
  }
});

herbieCommandRoutes.get("/actions", async (req: Request, res: Response) => {
  try {
    const { category, status, limit = "20" } = req.query;
    
    let query = db.select().from(herbieActions).where(eq(herbieActions.tenantId, DEFAULT_TENANT_ID));
    
    const actions = await db
      .select()
      .from(herbieActions)
      .where(eq(herbieActions.tenantId, DEFAULT_TENANT_ID))
      .orderBy(desc(herbieActions.createdAt))
      .limit(parseInt(limit as string));

    return res.json(actions);
  } catch (error) {
    console.error("Get actions error:", error);
    return res.status(500).json({ error: "Failed to fetch actions" });
  }
});

herbieCommandRoutes.get("/actions/pending", async (req: Request, res: Response) => {
  try {
    const pendingActions = await db
      .select()
      .from(herbieActions)
      .where(and(
        eq(herbieActions.tenantId, DEFAULT_TENANT_ID),
        eq(herbieActions.status, "pending")
      ))
      .orderBy(desc(herbieActions.createdAt))
      .limit(10);

    return res.json(pendingActions);
  } catch (error) {
    console.error("Get pending actions error:", error);
    return res.status(500).json({ error: "Failed to fetch pending actions" });
  }
});

herbieCommandRoutes.post("/actions/:actionId/approve", async (req: Request, res: Response) => {
  try {
    const { actionId } = req.params;
    const { userId = "system", notes } = req.body;

    const existing = await db
      .select()
      .from(herbieActions)
      .where(sql`${herbieActions.id} = ${actionId}`);
    
    if (existing.length === 0) {
      return res.status(404).json({ error: "Action not found" });
    }

    const beforeState = existing[0];

    const [updated] = await db
      .update(herbieActions)
      .set({ 
        status: "completed",
      })
      .where(sql`${herbieActions.id} = ${actionId}`)
      .returning();

    // Log audit event with before/after snapshots
    await auditService.logEvent({
      tenantId: DEFAULT_TENANT_ID,
      eventType: "herbie_action_approved",
      actor: userId,
      entityType: "herbie_action",
      entityId: actionId as string,
      beforeJson: beforeState as unknown as Record<string, unknown>,
      afterJson: { ...updated, approvedBy: userId, approvedAt: new Date(), notes } as unknown as Record<string, unknown>,
    });

    // If there's a linked approval request, also process it
    if ((beforeState as any).toolName === "draft_email" || (beforeState as any).toolName === "schedule_meeting") {
      try {
        await approvalService.processDecision({
          requestId: actionId as string,
          actor: userId,
          decision: "approved",
          notes,
        }, DEFAULT_TENANT_ID);
      } catch {
        // Approval request may not exist, continue
      }
    }

    return res.json({ 
      ...updated, 
      message: "Action approved successfully",
      auditLogged: true 
    });
  } catch (error) {
    console.error("Approve action error:", error);
    return res.status(500).json({ error: "Failed to approve action" });
  }
});

herbieCommandRoutes.post("/actions/:actionId/reject", async (req: Request, res: Response) => {
  try {
    const { actionId } = req.params;
    const { userId = "system", reason } = req.body;

    const existing = await db
      .select()
      .from(herbieActions)
      .where(sql`${herbieActions.id} = ${actionId}`);
    
    if (existing.length === 0) {
      return res.status(404).json({ error: "Action not found" });
    }

    const beforeState = existing[0];

    const [updated] = await db
      .update(herbieActions)
      .set({ 
        status: "rejected",
      })
      .where(sql`${herbieActions.id} = ${actionId}`)
      .returning();

    // Log audit event with before/after snapshots
    await auditService.logEvent({
      tenantId: DEFAULT_TENANT_ID,
      eventType: "herbie_action_rejected",
      actor: userId,
      entityType: "herbie_action",
      entityId: actionId as string,
      beforeJson: beforeState as unknown as Record<string, unknown>,
      afterJson: { ...updated, rejectedBy: userId, rejectedAt: new Date(), reason } as unknown as Record<string, unknown>,
    });

    // If there's a linked approval request, also process it
    if ((beforeState as any).toolName === "draft_email" || (beforeState as any).toolName === "schedule_meeting") {
      try {
        await approvalService.processDecision({
          requestId: actionId as string,
          actor: userId,
          decision: "denied",
          notes: reason,
        }, DEFAULT_TENANT_ID);
      } catch {
        // Approval request may not exist, continue
      }
    }

    return res.json({ 
      ...updated, 
      message: "Action rejected",
      auditLogged: true 
    });
  } catch (error) {
    console.error("Reject action error:", error);
    return res.status(500).json({ error: "Failed to reject action" });
  }
});

herbieCommandRoutes.get("/knowledge", async (req: Request, res: Response) => {
  try {
    const { type, limit = "20" } = req.query;
    
    const docs = await db
      .select()
      .from(knowledgeDocuments)
      .where(and(
        eq(knowledgeDocuments.tenantId, DEFAULT_TENANT_ID),
        eq(knowledgeDocuments.status, "active")
      ))
      .orderBy(desc(knowledgeDocuments.createdAt))
      .limit(parseInt(limit as string));

    return res.json(docs);
  } catch (error) {
    console.error("Get knowledge error:", error);
    return res.status(500).json({ error: "Failed to fetch knowledge documents" });
  }
});

herbieCommandRoutes.post("/knowledge/search", async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    const ragService = new RAGService(DEFAULT_TENANT_ID);
    const result = await ragService.searchWithSources(query);

    return res.json(result);
  } catch (error) {
    console.error("Knowledge search error:", error);
    return res.status(500).json({ error: "Failed to search knowledge" });
  }
});

herbieCommandRoutes.post("/knowledge", async (req: Request, res: Response) => {
  try {
    const { title, content, documentType, sourceUrl, sourceSystem, createdBy } = req.body;
    
    if (!title || !content || !documentType) {
      return res.status(400).json({ error: "Title, content, and documentType are required" });
    }

    const ragService = new RAGService(DEFAULT_TENANT_ID);
    const doc = await ragService.createKnowledgeDocument({
      title,
      content,
      documentType,
      sourceUrl,
      sourceSystem,
      createdBy,
    });

    return res.json(doc);
  } catch (error) {
    console.error("Create knowledge error:", error);
    return res.status(500).json({ error: "Failed to create knowledge document" });
  }
});

herbieCommandRoutes.get("/teaming-partners", async (req: Request, res: Response) => {
  try {
    const partners = await db
      .select()
      .from(teamingPartners)
      .where(and(
        eq(teamingPartners.tenantId, DEFAULT_TENANT_ID),
        eq(teamingPartners.relationshipStatus, "active")
      ))
      .orderBy(desc(teamingPartners.createdAt))
      .limit(50);

    return res.json(partners);
  } catch (error) {
    console.error("Get teaming partners error:", error);
    return res.status(500).json({ error: "Failed to fetch teaming partners" });
  }
});

herbieCommandRoutes.post("/teaming-partners", async (req: Request, res: Response) => {
  try {
    const data = req.body;
    
    const [partner] = await db
      .insert(teamingPartners)
      .values({
        tenantId: DEFAULT_TENANT_ID,
        ...data,
      })
      .returning();

    return res.json(partner);
  } catch (error) {
    console.error("Create teaming partner error:", error);
    return res.status(500).json({ error: "Failed to create teaming partner" });
  }
});

herbieCommandRoutes.get("/memory", async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || "default-user";
    const memoryService = new MemoryService(DEFAULT_TENANT_ID, userId);
    const memory = await memoryService.getAllMemory();

    return res.json(memory);
  } catch (error) {
    console.error("Get memory error:", error);
    return res.status(500).json({ error: "Failed to fetch memory" });
  }
});

herbieCommandRoutes.post("/memory/learn", async (req: Request, res: Response) => {
  try {
    const { key, value, context, userId = "default-user" } = req.body;
    
    if (!key || value === undefined) {
      return res.status(400).json({ error: "Key and value are required" });
    }

    const memoryService = new MemoryService(DEFAULT_TENANT_ID, userId);
    await memoryService.learnFact(key, value, context || "User provided");

    return res.json({ success: true });
  } catch (error) {
    console.error("Learn fact error:", error);
    return res.status(500).json({ error: "Failed to learn fact" });
  }
});

herbieCommandRoutes.get("/connectors", async (req: Request, res: Response) => {
  try {
    const connectorService = new ConnectorService(DEFAULT_TENANT_ID);
    const statuses = await connectorService.getAllConnectorStatuses();

    return res.json(statuses);
  } catch (error) {
    console.error("Get connectors error:", error);
    return res.status(500).json({ error: "Failed to fetch connector statuses" });
  }
});

herbieCommandRoutes.post("/connectors/:type/enable", async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    
    const connectorService = new ConnectorService(DEFAULT_TENANT_ID);
    await connectorService.enableConnector(type as any);

    return res.json({ success: true, message: `${type} connector enabled` });
  } catch (error) {
    console.error("Enable connector error:", error);
    return res.status(500).json({ error: "Failed to enable connector" });
  }
});

herbieCommandRoutes.post("/connectors/:type/disable", async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    
    const connectorService = new ConnectorService(DEFAULT_TENANT_ID);
    await connectorService.disableConnector(type as any);

    return res.json({ success: true, message: `${type} connector disabled` });
  } catch (error) {
    console.error("Disable connector error:", error);
    return res.status(500).json({ error: "Failed to disable connector" });
  }
});

herbieCommandRoutes.post("/connectors/:type/sync", async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    
    const connectorService = new ConnectorService(DEFAULT_TENANT_ID);
    const connector = connectorService.getConnector(type as any);
    const result = await connector.sync();

    return res.json(result);
  } catch (error) {
    console.error("Sync connector error:", error);
    return res.status(500).json({ error: "Failed to sync connector" });
  }
});

herbieCommandRoutes.get("/dashboard-stats", async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalOpportunities,
      activeBids,
      pendingApprovals,
      recentActions,
    ] = await Promise.all([
      db.select().from(opportunities).where(eq(opportunities.tenantId, DEFAULT_TENANT_ID)),
      db.select().from(bidProjects).where(and(
        eq(bidProjects.tenantId, DEFAULT_TENANT_ID),
        eq(bidProjects.status, "in_progress")
      )),
      db.select().from(approvalRequests).where(and(
        eq(approvalRequests.tenantId, DEFAULT_TENANT_ID),
        eq(approvalRequests.status, "pending")
      )),
      db.select().from(herbieActions).where(and(
        eq(herbieActions.tenantId, DEFAULT_TENANT_ID),
        gte(herbieActions.createdAt, sevenDaysAgo)
      )),
    ]);

    return res.json({
      opportunities: {
        total: totalOpportunities.length,
        open: totalOpportunities.filter(o => o.status === "open").length,
      },
      bids: {
        active: activeBids.length,
      },
      approvals: {
        pending: pendingApprovals.length,
        urgent: pendingApprovals.filter(a => a.priority === "urgent").length,
      },
      actions: {
        thisWeek: recentActions.length,
        pending: recentActions.filter(a => a.status === "pending").length,
      },
    });
  } catch (error) {
    console.error("Get dashboard stats error:", error);
    return res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
});

herbieCommandRoutes.get("/daily-briefing", async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || "default-user";
    const toolRouter = new ToolRouterService(DEFAULT_TENANT_ID, userId);
    const briefing = await toolRouter.routeRequest("Get my daily briefing");

    return res.json(briefing);
  } catch (error) {
    console.error("Get daily briefing error:", error);
    return res.status(500).json({ error: "Failed to get daily briefing" });
  }
});

herbieCommandRoutes.post("/seed-database", async (req: Request, res: Response) => {
  try {
    await seedDatabase();
    return res.json({ 
      success: true, 
      message: "Database seeded successfully with HERBIE Command Dashboard data" 
    });
  } catch (error) {
    console.error("Seed database error:", error);
    return res.status(500).json({ error: "Failed to seed database" });
  }
});

// Get capture stage analytics for Reports tab
herbieCommandRoutes.get("/capture-analytics", async (req: Request, res: Response) => {
  try {
    // Get capture stages with counts
    const stages = await db
      .select({
        id: captureStages.id,
        name: captureStages.name,
        stageOrder: captureStages.stageOrder,
        color: captureStages.color,
      })
      .from(captureStages)
      .where(eq(captureStages.tenantId, DEFAULT_TENANT_ID))
      .orderBy(captureStages.stageOrder);

    // Get opportunities in each stage with their pwin scores and owner info
    const captureData = await db
      .select({
        stageId: opportunityCapture.stageId,
        pwinScore: opportunityCapture.pwinScore,
        ownerId: opportunityCapture.ownerId,
        ownerName: users.displayName,
        ownerEmail: users.email,
      })
      .from(opportunityCapture)
      .leftJoin(users, eq(opportunityCapture.ownerId, users.id))
      .where(eq(opportunityCapture.tenantId, DEFAULT_TENANT_ID));

    // Get owner info for stage owners - group by stage and owner
    const ownerCounts: Record<string, { ownerName: string; count: number }> = {};
    for (const capture of captureData) {
      if (capture.stageId) {
        const ownerName = capture.ownerName || capture.ownerEmail || "Unassigned";
        if (!ownerCounts[capture.stageId]) {
          ownerCounts[capture.stageId] = { ownerName, count: 0 };
        }
        ownerCounts[capture.stageId].count++;
        // Use first owner found for the stage
        if (ownerCounts[capture.stageId].ownerName === "Unassigned" && ownerName !== "Unassigned") {
          ownerCounts[capture.stageId].ownerName = ownerName;
        }
      }
    }

    // Calculate stage counts
    const stageCounts = stages.map(stage => ({
      ...stage,
      count: captureData.filter(c => c.stageId === stage.id).length,
      ownerName: ownerCounts[stage.id]?.ownerName || "Unassigned",
    }));

    // Calculate Pwin distribution
    const pwinScores = captureData.filter(c => c.pwinScore !== null).map(c => c.pwinScore!);
    const pwinDistribution = {
      high: pwinScores.filter(s => s >= 70).length,
      medium: pwinScores.filter(s => s >= 40 && s < 70).length,
      low: pwinScores.filter(s => s < 40).length,
    };

    // Get bid projects for win rate and time calculations
    const allBids = await db
      .select()
      .from(bidProjects)
      .where(eq(bidProjects.tenantId, DEFAULT_TENANT_ID));

    const wonBids = allBids.filter(b => b.status === "won");
    const lostBids = allBids.filter(b => b.status === "lost");
    const activeBids = allBids.filter(b => !["won", "lost", "cancelled"].includes(b.status || ""));

    // Calculate metrics
    const completedBids = wonBids.length + lostBids.length;
    const winRate = completedBids > 0 ? Math.round((wonBids.length / completedBids) * 100) : 0;

    // Estimate pipeline value based on opportunities
    const activeOpps = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.tenantId, DEFAULT_TENANT_ID));

    const totalPipelineValue = activeOpps.reduce((sum, opp) => sum + (parseFloat(opp.contractValue || "0")), 0);

    // Calculate weighted pipeline value
    const avgPwin = pwinScores.length > 0 ? pwinScores.reduce((a, b) => a + b, 0) / pwinScores.length : 50;
    const weightedPipelineValue = totalPipelineValue * (avgPwin / 100);

    return res.json({
      stages: stageCounts,
      pwinDistribution,
      metrics: {
        winRate,
        completedBids,
        activeBids: activeBids.length,
        totalPipelineValue,
        weightedPipelineValue,
        avgPwin: Math.round(avgPwin),
        avgTimeToBid: 18, // Would calculate from actual timestamps
      },
      stageOwners: stages.map(stage => ({
        stage: stage.name,
        owner: ownerCounts[stage.id]?.ownerName || "BD Team",
        count: ownerCounts[stage.id]?.count || 0,
      })),
    });
  } catch (error) {
    console.error("Get capture analytics error:", error);
    return res.status(500).json({ error: "Failed to fetch capture analytics" });
  }
});
