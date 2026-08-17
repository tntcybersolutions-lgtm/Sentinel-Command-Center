import { db } from "../db";
import { lazyOpenAI } from "../lib/lazy-openai";
import { 
  opportunities, 
  opportunityScores, 
  bidProjects, 
  bidTasks,
  approvalRequests, 
  fitProfiles,
  users,
  notifications,
  auditEvents,
  jacketFolders,
  bidChecklists,
  bidChecklistItems,
  BID_JACKET_FOLDERS,
  bidJacketFolderDisplayName,
  bidJacketFolderPath,
} from "@shared/schema";
import { eq, and, isNull, desc, gte, lt, sql, count } from "drizzle-orm";
import crypto from "crypto";
import OpenAI from "openai";
import { approvalService } from "../services/approval.service";
import { auditService } from "../services/audit.service";
import { HerbieLearningService } from "../services/herbie-learning.service";

const openai = lazyOpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const DEFAULT_TENANT_ID = "blackhawk-default";

// BlackHawk's target NAICS codes for construction
const BLACKHAWK_NAICS_CODES = [
  "236220", // Commercial and Institutional Building Construction
  "237310", // Highway, Street, and Bridge Construction
  "237990", // Other Heavy and Civil Engineering Construction
  "238110", // Poured Concrete Foundation and Structure Contractors
  "238120", // Structural Steel and Precast Concrete Contractors
  "238190", // Other Foundation, Structure, and Building Exterior Contractors
  "238210", // Electrical Contractors
  "238220", // Plumbing, Heating, and Air-Conditioning Contractors
  "238290", // Other Building Equipment Contractors
  "238310", // Drywall and Insulation Contractors
  "238320", // Painting and Wall Covering Contractors
  "238910", // Site Preparation Contractors
  "238990", // All Other Specialty Trade Contractors
];

// Set-aside preferences
const PREFERRED_SETASIDES = [
  "SDVOSBC", // Service-Disabled Veteran-Owned Small Business
  "SDVOSBS", // SDVOSB Sole Source
  "VOSBC",   // Veteran-Owned Small Business
  "8A",      // 8(a) Program
  "8AN",     // 8(a) Competitive
  "HZC",     // HUBZone
  "SBA",     // Small Business
  "SBP",     // Small Business Set-Aside
];

// Approvers for bid decisions (Dave, Brad, Nolan, Kathy)
const APPROVERS = [
  { name: "Dave", email: "dave@blackhawkconst.com", role: "CEO", minValue: 0, maxValue: Infinity },
  { name: "Brad", email: "brad@blackhawkconst.com", role: "VP Operations", minValue: 0, maxValue: 5000000 },
  { name: "Nolan", email: "nolan@blackhawkconst.com", role: "Project Director", minValue: 0, maxValue: 2000000 },
  { name: "Kathy", email: "kathy@blackhawkconst.com", role: "Contracts Manager", minValue: 0, maxValue: 1000000 },
];

export interface OpportunityEvaluation {
  opportunityId: string;
  score: number;
  recommendedAction: "bid" | "no_bid" | "review";
  reasoning: string;
  strengths: string[];
  weaknesses: string[];
  winProbability: number;
  requiredApprovers: string[];
}

export interface HerbieActivityLog {
  id: string;
  timestamp: Date;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  outcome: "success" | "pending" | "error";
}

export class HerbieAutonomousAgent {
  private tenantId: string;
  private running: boolean = false;
  private activityLog: HerbieActivityLog[] = [];

  constructor(tenantId: string = DEFAULT_TENANT_ID) {
    this.tenantId = tenantId;
  }

  // Main autonomous loop - runs every 5 minutes
  async startAutonomousMode(): Promise<void> {
    if (this.running) {
      console.log("[HERBIE] Autonomous mode already running");
      return;
    }

    this.running = true;
    console.log("[HERBIE] Starting autonomous mode...");

    while (this.running) {
      try {
        await this.runAutonomousCycle();
      } catch (error) {
        console.error("[HERBIE] Error in autonomous cycle:", error);
      }

      // Wait 5 minutes before next cycle
      await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
    }
  }

  async stopAutonomousMode(): Promise<void> {
    this.running = false;
    console.log("[HERBIE] Autonomous mode stopped");
  }

  // Single autonomous cycle - evaluate new opportunities, create approvals, process approved items
  async runAutonomousCycle(): Promise<{
    evaluated: number;
    approvalRequests: number;
    projectsCreated: number;
    errors: number;
  }> {
    console.log("[HERBIE] Running autonomous cycle...");

    const stats = { evaluated: 0, approvalRequests: 0, projectsCreated: 0, errors: 0 };

    try {
      // Step 1: Find unscored opportunities
      const unscoredOpportunities = await this.findUnscoredOpportunities();
      console.log(`[HERBIE] Found ${unscoredOpportunities.length} unscored opportunities`);

      // Step 2: Evaluate and score each opportunity
      for (const opp of unscoredOpportunities) {
        try {
          const evaluation = await this.evaluateOpportunity(opp);
          stats.evaluated++;

          // Step 3: If score is high enough, create approval request
          if (evaluation.recommendedAction === "bid" && evaluation.score >= 70) {
            await this.createBidApprovalRequest(opp, evaluation);
            stats.approvalRequests++;
          }
        } catch (error) {
          console.error(`[HERBIE] Error evaluating opportunity ${opp.id}:`, error);
          stats.errors++;
        }
      }

      // Step 4: Process approved opportunities and create projects
      const newProjects = await this.processApprovedOpportunities();
      stats.projectsCreated = newProjects;

      // Log activity
      await this.logActivity("autonomous_cycle_complete", "system", "herbie", {
        ...stats,
        timestamp: new Date().toISOString(),
      }, stats.errors === 0 ? "success" : "error");

    } catch (error) {
      console.error("[HERBIE] Autonomous cycle failed:", error);
      stats.errors++;
    }

    console.log(`[HERBIE] Cycle complete: ${stats.evaluated} evaluated, ${stats.approvalRequests} approval requests, ${stats.projectsCreated} projects created`);
    return stats;
  }

  // Find opportunities that haven't been scored yet
  private async findUnscoredOpportunities() {
    const scored = db.select({ opportunityId: opportunityScores.opportunityId })
      .from(opportunityScores)
      .where(eq(opportunityScores.tenantId, this.tenantId));

    const unscored = await db.select()
      .from(opportunities)
      .where(and(
        eq(opportunities.tenantId, this.tenantId),
        sql`COALESCE(LOWER(${opportunities.status}), '') NOT IN ('dismissed', 'lost', 'declined')`,
        sql`${opportunities.id} NOT IN (${scored})`
      ))
      .orderBy(desc(opportunities.dueAt))
      .limit(20);

    return unscored;
  }

  // AI-powered opportunity evaluation with historical learning
  async evaluateOpportunity(opp: typeof opportunities.$inferSelect): Promise<OpportunityEvaluation> {
    console.log(`[HERBIE] Evaluating opportunity: ${opp.title}`);

    // Initialize learning service for historical pattern analysis
    const learningService = new HerbieLearningService(this.tenantId);

    // Calculate base score from fit factors
    let score = 0;
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    // NAICS code match (30 points)
    const oppNaics = opp.naicsCodes || [];
    const naicsMatch = oppNaics.some(code => BLACKHAWK_NAICS_CODES.includes(code));
    if (naicsMatch) {
      score += 30;
      strengths.push("NAICS code matches BlackHawk's core capabilities");
    } else {
      weaknesses.push("NAICS code outside core competencies");
    }

    // Set-aside preference (20 points)
    const setAsideMatch = opp.setAside && PREFERRED_SETASIDES.some(sa => 
      opp.setAside?.toUpperCase().includes(sa)
    );
    if (setAsideMatch) {
      score += 20;
      strengths.push(`Favorable set-aside: ${opp.setAside}`);
    }

    // Contract value assessment (20 points)
    const value = parseFloat(opp.contractValue?.toString() || "0");
    if (value > 0 && value <= 10000000) {
      score += 20;
      strengths.push("Contract value within bonding capacity");
    } else if (value > 10000000) {
      score += 10;
      weaknesses.push("Large contract may require joint venture");
    }

    // Timeline assessment (15 points)
    const daysUntilDue = opp.dueAt 
      ? Math.floor((new Date(opp.dueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : 30;
    
    if (daysUntilDue >= 14) {
      score += 15;
      strengths.push("Adequate time for bid preparation");
    } else if (daysUntilDue >= 7) {
      score += 10;
      weaknesses.push("Tight timeline for bid preparation");
    } else {
      score += 5;
      weaknesses.push("Very short deadline - rush bid required");
    }

    // AI analysis for additional insights (15 points)
    try {
      const aiAnalysis = await this.getAIAnalysis(opp);
      if (aiAnalysis.favorableFactors.length > 0) {
        score += Math.min(15, aiAnalysis.favorableFactors.length * 5);
        strengths.push(...aiAnalysis.favorableFactors);
      }
      if (aiAnalysis.unfavorableFactors.length > 0) {
        weaknesses.push(...aiAnalysis.unfavorableFactors);
      }
    } catch (error) {
      console.error("[HERBIE] AI analysis failed:", error);
    }

    // Determine recommended action
    let recommendedAction: "bid" | "no_bid" | "review" = "review";
    if (score >= 70) {
      recommendedAction = "bid";
    } else if (score < 40) {
      recommendedAction = "no_bid";
    }

    // Calculate win probability using historical patterns from learning engine
    // Note: opportunities don't have agency directly, we'd need to join with buyers
    const historicalWinProb = await learningService.getWinProbability(
      "Federal", // Default agency for SAM.gov opportunities
      oppNaics[0] || "",
      opp.setAside || undefined
    );
    
    // Blend current evaluation with historical patterns
    const baseWinProb = Math.min(90, Math.max(10, score * 0.8 + (strengths.length * 5) - (weaknesses.length * 3)));
    const winProbability = historicalWinProb > 0 
      ? Math.round((baseWinProb * 0.6) + (historicalWinProb * 0.4)) // 60% current, 40% historical
      : baseWinProb;
    
    if (historicalWinProb > 50) {
      strengths.push(`Historical win rate for similar opportunities: ${historicalWinProb.toFixed(0)}%`);
    } else if (historicalWinProb > 0 && historicalWinProb < 30) {
      weaknesses.push(`Historical win rate for similar opportunities is low: ${historicalWinProb.toFixed(0)}%`);
    }

    // Determine required approvers based on contract value
    const requiredApprovers = this.getRequiredApprovers(value);

    // Save score to database
    const reasoning = `HERBIE autonomous evaluation: Score ${score}/100. ${strengths.length} strengths identified, ${weaknesses.length} concerns noted. Win probability estimated at ${winProbability.toFixed(0)}%.`;

    await db.insert(opportunityScores).values({
      tenantId: this.tenantId,
      opportunityId: opp.id,
      score,
      recommendedAction,
    });

    // Update opportunity status
    await db.update(opportunities)
      .set({ status: "scored", updatedAt: new Date() })
      .where(eq(opportunities.id, opp.id));

    await this.logActivity("opportunity_evaluated", "opportunity", opp.id, {
      score,
      recommendedAction,
      strengths,
      weaknesses,
      winProbability,
    }, "success");

    return {
      opportunityId: opp.id,
      score,
      recommendedAction,
      reasoning,
      strengths,
      weaknesses,
      winProbability,
      requiredApprovers,
    };
  }

  // Get AI-powered analysis of opportunity
  private async getAIAnalysis(opp: typeof opportunities.$inferSelect): Promise<{
    favorableFactors: string[];
    unfavorableFactors: string[];
    keyInsights: string;
  }> {
    const prompt = `Analyze this federal contracting opportunity for BlackHawk Construction, a commercial and civil construction company specializing in government projects.

Opportunity Details:
- Title: ${opp.title}
- Description: ${opp.synopsis || opp.description || "No description available"}
- NAICS Codes: ${opp.naicsCodes?.join(", ") || "Not specified"}
- Set-Aside: ${opp.setAside || "Full and Open Competition"}
- Contract Value: ${opp.contractValue ? `$${Number(opp.contractValue).toLocaleString()}` : "Not specified"}
- Due Date: ${opp.dueAt ? new Date(opp.dueAt).toLocaleDateString() : "Not specified"}

Provide a brief analysis with:
1. 2-3 favorable factors for pursuing this bid
2. 2-3 unfavorable factors or risks
3. A one-sentence key insight

Format as JSON: {"favorableFactors": [], "unfavorableFactors": [], "keyInsights": ""}`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 500,
      });

      const content = completion.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);
      
      return {
        favorableFactors: parsed.favorableFactors || [],
        unfavorableFactors: parsed.unfavorableFactors || [],
        keyInsights: parsed.keyInsights || "",
      };
    } catch (error) {
      console.error("[HERBIE] AI analysis error:", error);
      return { favorableFactors: [], unfavorableFactors: [], keyInsights: "" };
    }
  }

  // Determine required approvers based on contract value
  private getRequiredApprovers(contractValue: number): string[] {
    const approvers: string[] = [];
    
    for (const approver of APPROVERS) {
      if (contractValue >= approver.minValue && contractValue <= approver.maxValue) {
        approvers.push(approver.name);
      }
    }

    // Always require at least one approver
    if (approvers.length === 0) {
      approvers.push("Dave"); // CEO for unusual cases
    }

    return approvers;
  }

  // Create approval request for bid decision
  async createBidApprovalRequest(
    opp: typeof opportunities.$inferSelect,
    evaluation: OpportunityEvaluation
  ): Promise<string> {
    console.log(`[HERBIE] Creating approval request for: ${opp.title}`);

    const requestId = await approvalService.createRequest({
      tenantId: this.tenantId,
      entityType: "opportunity",
      entityId: opp.id,
      actionType: "bid_decision",
      requestedBy: "herbie-autonomous",
      metadata: {
        title: opp.title,
        score: evaluation.score,
        recommendedAction: evaluation.recommendedAction,
        reasoning: evaluation.reasoning,
        strengths: evaluation.strengths,
        weaknesses: evaluation.weaknesses,
        winProbability: evaluation.winProbability,
        requiredApprovers: evaluation.requiredApprovers,
        contractValue: opp.contractValue,
        dueDate: opp.dueAt,
        setAside: opp.setAside,
        naicsCodes: opp.naicsCodes,
      },
    });

    // Update opportunity status
    await db.update(opportunities)
      .set({ status: "pending_approval", updatedAt: new Date() })
      .where(eq(opportunities.id, opp.id));

    // Create notification for approvers
    for (const approverName of evaluation.requiredApprovers) {
      await db.insert(notifications).values({
        tenantId: this.tenantId,
        type: "approval_request",
        title: `New Bid Opportunity Requires Approval`,
        message: `[HERBIE] ${opp.title} (Score: ${evaluation.score}/100)`,
        priority: evaluation.score >= 85 ? "high" : "normal",
        entityType: "approval_request",
        entityId: requestId,
      });
    }

    await this.logActivity("approval_request_created", "approval_request", requestId, {
      opportunityId: opp.id,
      opportunityTitle: opp.title,
      score: evaluation.score,
      approvers: evaluation.requiredApprovers,
    }, "success");

    return requestId;
  }

  // Process approved opportunities and create bid projects
  async processApprovedOpportunities(): Promise<number> {
    // Find approved bid decisions that don't have projects yet
    const approvedRequests = await db.select()
      .from(approvalRequests)
      .where(and(
        eq(approvalRequests.tenantId, this.tenantId),
        eq(approvalRequests.entityType, "opportunity"),
        eq(approvalRequests.actionType, "bid_decision"),
        eq(approvalRequests.status, "approved")
      ));

    let projectsCreated = 0;

    for (const request of approvedRequests) {
      // Check if project already exists
      const existingProject = await db.select()
        .from(bidProjects)
        .where(and(
          eq(bidProjects.tenantId, this.tenantId),
          eq(bidProjects.opportunityId, request.entityId)
        ))
        .limit(1);

      if (existingProject.length > 0) continue;

      // Get opportunity details
      const [opp] = await db.select()
        .from(opportunities)
        .where(eq(opportunities.id, request.entityId))
        .limit(1);

      if (!opp) continue;

      // Create bid project
      const [project] = await db.insert(bidProjects).values({
        tenantId: this.tenantId,
        opportunityId: opp.id,
        status: "initiated",
      }).returning();

      // Create jacket folder structure
      await this.createBidJacketFolders(project.id);

      // Create default submission checklist
      await this.createBidSubmissionChecklist(project.id, opp);

      // Log the bid jacket creation
      await db.insert(auditEvents).values({
        tenantId: this.tenantId,
        eventType: "herbie_bid_jacket_created",
        actorType: "herbie",
        entityType: "bid_project",
        entityId: project.id,
        action: "create_bid_jacket",
        afterJson: { 
          foldersCreated: BID_JACKET_FOLDERS.length, 
          checklistCreated: true,
          opportunityId: opp.id,
          opportunityTitle: opp.title,
          folderStructure: BID_JACKET_FOLDERS.map(f => bidJacketFolderDisplayName(f.code)),
        },
      });

      // Create initial bid tasks
      await this.createBidProjectTasks(project.id, opp);

      // Update opportunity status
      await db.update(opportunities)
        .set({ status: "bid_in_progress", updatedAt: new Date() })
        .where(eq(opportunities.id, opp.id));

      await this.logActivity("bid_project_created", "bid_project", project.id, {
        opportunityId: opp.id,
        opportunityTitle: opp.title,
        status: "initiated",
      }, "success");

      projectsCreated++;
    }

    return projectsCreated;
  }

  // Create standard bid project tasks
  private async createBidProjectTasks(projectId: string, opp: typeof opportunities.$inferSelect): Promise<void> {
    const dueDate = opp.dueAt ? new Date(opp.dueAt) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    
    const standardTasks = [
      { 
        title: "Review Solicitation Documents", 
        taskType: "document_review",
        daysBeforeDue: 21,
      },
      { 
        title: "Prepare Capability Statement", 
        taskType: "document_prep",
        daysBeforeDue: 18,
      },
      { 
        title: "Identify Subcontractors", 
        taskType: "subcontractor_outreach",
        daysBeforeDue: 16,
      },
      { 
        title: "Site Visit", 
        taskType: "site_visit",
        daysBeforeDue: 14,
      },
      { 
        title: "Develop Pricing", 
        taskType: "pricing",
        daysBeforeDue: 10,
      },
      { 
        title: "Prepare Technical Approach", 
        taskType: "technical_writing",
        daysBeforeDue: 8,
      },
      { 
        title: "Compile Past Performance", 
        taskType: "past_performance",
        daysBeforeDue: 7,
      },
      { 
        title: "Prepare Compliance Matrix", 
        taskType: "compliance",
        daysBeforeDue: 6,
      },
      { 
        title: "Internal Review", 
        taskType: "internal_review",
        daysBeforeDue: 4,
      },
      { 
        title: "Final Approval", 
        taskType: "approval",
        daysBeforeDue: 2,
      },
      { 
        title: "Submit Bid", 
        taskType: "submission",
        daysBeforeDue: 0,
      },
    ];

    for (const task of standardTasks) {
      const taskDueDate = new Date(dueDate.getTime() - task.daysBeforeDue * 24 * 60 * 60 * 1000);
      
      await db.insert(bidTasks).values({
        tenantId: this.tenantId,
        bidProjectId: projectId,
        title: task.title,
        taskType: task.taskType,
        status: "pending",
        dueAt: taskDueDate,
      });
    }

    console.log(`[HERBIE] Created ${standardTasks.length} tasks for bid project ${projectId}`);
  }

  // Log HERBIE activity
  private async logActivity(
    action: string,
    entityType: string,
    entityId: string,
    details: Record<string, unknown>,
    outcome: "success" | "pending" | "error"
  ): Promise<void> {
    const activity: HerbieActivityLog = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      action,
      entityType,
      entityId,
      details,
      outcome,
    };

    this.activityLog.push(activity);

    // Keep only last 1000 activities in memory
    if (this.activityLog.length > 1000) {
      this.activityLog = this.activityLog.slice(-1000);
    }

    // Also log to audit trail
    await auditService.logEvent({
      tenantId: this.tenantId,
      eventType: `herbie_${action}`,
      actor: "herbie-autonomous",
      entityType,
      entityId,
      afterJson: { ...details, outcome },
    });
  }

  // Get recent activity log
  getActivityLog(limit: number = 50): HerbieActivityLog[] {
    return this.activityLog.slice(-limit);
  }

  // Generate daily briefing
  async generateDailyBriefing(): Promise<{
    date: string;
    summary: string;
    newOpportunities: number;
    pendingApprovals: number;
    activeBids: number;
    upcomingDeadlines: Array<{ title: string; dueDate: string; daysRemaining: number }>;
    exceptionsRequiringAttention: string[];
    recommendedActions: string[];
  }> {
    const today = new Date();
    const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    // Count new opportunities (last 24 hours)
    const [newOppCount] = await db.select({ count: count() })
      .from(opportunities)
      .where(and(
        eq(opportunities.tenantId, this.tenantId),
        gte(opportunities.createdAt, yesterday)
      ));

    // Count pending approvals
    const [pendingApprovalCount] = await db.select({ count: count() })
      .from(approvalRequests)
      .where(and(
        eq(approvalRequests.tenantId, this.tenantId),
        eq(approvalRequests.status, "pending")
      ));

    // Count active bids
    const [activeBidCount] = await db.select({ count: count() })
      .from(bidProjects)
      .where(and(
        eq(bidProjects.tenantId, this.tenantId),
        sql`COALESCE(LOWER(${bidProjects.status}), '') NOT IN ('submitted', 'won', 'lost', 'declined', 'cancelled')`
      ));

    // Get upcoming deadlines
    const deadlineOpps = await db.select({
      id: opportunities.id,
      title: opportunities.title,
      dueAt: opportunities.dueAt,
    })
      .from(opportunities)
      .where(and(
        eq(opportunities.tenantId, this.tenantId),
        sql`COALESCE(LOWER(${opportunities.status}), '') NOT IN ('dismissed', 'lost', 'declined', 'awarded')`,
        gte(opportunities.dueAt, today),
        lt(opportunities.dueAt, weekFromNow)
      ))
      .orderBy(opportunities.dueAt)
      .limit(10);

    const upcomingDeadlines = deadlineOpps.map(opp => ({
      title: opp.title,
      dueDate: opp.dueAt?.toISOString() || "",
      daysRemaining: Math.ceil((new Date(opp.dueAt!).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
    }));

    // Identify exceptions
    const exceptionsRequiringAttention: string[] = [];
    
    // Check for bids due within 3 days
    const urgentDeadlines = upcomingDeadlines.filter(d => d.daysRemaining <= 3);
    if (urgentDeadlines.length > 0) {
      exceptionsRequiringAttention.push(`${urgentDeadlines.length} bid(s) due within 3 days`);
    }

    // Check for stale approvals
    const staleApprovals = await db.select({ count: count() })
      .from(approvalRequests)
      .where(and(
        eq(approvalRequests.tenantId, this.tenantId),
        eq(approvalRequests.status, "pending"),
        lt(approvalRequests.createdAt, new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000))
      ));
    
    if ((staleApprovals[0]?.count || 0) > 0) {
      exceptionsRequiringAttention.push(`${staleApprovals[0].count} approval(s) pending for more than 3 days`);
    }

    // Generate recommended actions
    const recommendedActions: string[] = [];
    
    if ((pendingApprovalCount?.count || 0) > 0) {
      recommendedActions.push(`Review ${pendingApprovalCount.count} pending approval request(s)`);
    }
    
    if (urgentDeadlines.length > 0) {
      recommendedActions.push(`Prioritize ${urgentDeadlines.length} urgent bid submission(s)`);
    }
    
    if ((newOppCount?.count || 0) > 5) {
      recommendedActions.push(`Review ${newOppCount.count} new opportunities from today`);
    }

    const summary = `Good morning! HERBIE has identified ${newOppCount?.count || 0} new opportunities, with ${pendingApprovalCount?.count || 0} pending approvals and ${activeBidCount?.count || 0} active bids. ${exceptionsRequiringAttention.length > 0 ? `Attention needed: ${exceptionsRequiringAttention.join("; ")}` : "No critical exceptions."}`;

    return {
      date: today.toISOString(),
      summary,
      newOpportunities: newOppCount?.count || 0,
      pendingApprovals: pendingApprovalCount?.count || 0,
      activeBids: activeBidCount?.count || 0,
      upcomingDeadlines,
      exceptionsRequiringAttention,
      recommendedActions,
    };
  }

  private async createBidJacketFolders(projectId: string): Promise<void> {
    const rows = BID_JACKET_FOLDERS.map(folder => ({
      id: crypto.randomUUID(),
      tenantId: this.tenantId,
      jacketType: "bid" as const,
      jacketId: projectId,
      name: bidJacketFolderDisplayName(folder.code),
      path: `/Bids/${projectId}/${bidJacketFolderPath(folder.code)}`,
      sortOrder: parseInt(folder.code),
      isSystemFolder: true,
    }));

    await db.insert(jacketFolders).values(rows).onConflictDoNothing({
      target: [jacketFolders.tenantId, jacketFolders.jacketType, jacketFolders.jacketId, jacketFolders.sortOrder],
    });
    
    console.log(`[HERBIE] Created ${BID_JACKET_FOLDERS.length} jacket folders for project ${projectId}`);
  }

  // Create default submission checklist for a bid project
  private async createBidSubmissionChecklist(projectId: string, opp: typeof opportunities.$inferSelect): Promise<void> {
    const [checklist] = await db.insert(bidChecklists).values({
      tenantId: this.tenantId,
      bidProjectId: projectId,
      checklistType: "submission",
      name: "Submission Requirements",
      sortOrder: 0,
    }).returning();

    const checklistItems = [
      { itemText: "Solicitation documents downloaded", isRequired: true },
      { itemText: "Capability statement prepared", isRequired: true },
      { itemText: "Price proposal completed", isRequired: true },
      { itemText: "Technical proposal completed", isRequired: !!(opp.contractValue && parseFloat(opp.contractValue) > 500000) },
      { itemText: "Past performance references gathered", isRequired: true },
      { itemText: "Subcontractor quotes collected", isRequired: false },
      { itemText: "All RFIs answered", isRequired: false },
      { itemText: "All addenda acknowledged", isRequired: true },
      { itemText: "Bond/insurance requirements verified", isRequired: true },
      { itemText: "Certifications current", isRequired: true },
      { itemText: "Final review completed", isRequired: true },
      { itemText: "Submission package assembled", isRequired: true },
    ];

    for (let i = 0; i < checklistItems.length; i++) {
      await db.insert(bidChecklistItems).values({
        tenantId: this.tenantId,
        checklistId: checklist.id,
        itemText: checklistItems[i].itemText,
        isRequired: checklistItems[i].isRequired,
        sortOrder: i,
      });
    }
  }
}

// Singleton instance
let herbieInstance: HerbieAutonomousAgent | null = null;

export function getHerbieAutonomousAgent(tenantId: string = DEFAULT_TENANT_ID): HerbieAutonomousAgent {
  if (!herbieInstance) {
    herbieInstance = new HerbieAutonomousAgent(tenantId);
  }
  return herbieInstance;
}

export function createHerbieAutonomousAgent(tenantId: string): HerbieAutonomousAgent {
  return new HerbieAutonomousAgent(tenantId);
}
