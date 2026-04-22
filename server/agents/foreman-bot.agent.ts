import { db } from "../db";
import { 
  opportunities, 
  awardNotifications,
  amendmentTracking,
  agentActivities,
  projects,
  bidProjects,
  materialForecasts,
  crewBriefings,
  notifications
} from "@shared/schema";
import { eq, and, desc, gte, isNull } from "drizzle-orm";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const DEFAULT_TENANT_ID = "blackhawk-default";

export interface AwardCheckResult {
  opportunityId: string;
  awardFound: boolean;
  isOurAward: boolean;
  awardDetails?: {
    contractNumber: string;
    awardAmount: number;
    awardeeCompany: string;
    awardDate: Date;
  };
}

export interface AmendmentCheckResult {
  opportunityId: string;
  amendmentFound: boolean;
  amendmentNumber?: number;
  changeType?: string;
  impactLevel?: string;
  affectsDeadline?: boolean;
  changeSummary?: string;
}

export class ForemanBotAgent {
  private tenantId: string;
  private companyName: string = "BlackHawk Construction";

  constructor(tenantId: string = DEFAULT_TENANT_ID) {
    this.tenantId = tenantId;
  }

  async checkForAwards(): Promise<AwardCheckResult[]> {
    const startTime = Date.now();
    const results: AwardCheckResult[] = [];

    try {
      const activeOpps = await db.select()
        .from(opportunities)
        .where(and(
          eq(opportunities.tenantId, this.tenantId),
          eq(opportunities.status, "bid_submitted")
        ))
        .orderBy(desc(opportunities.dueAt));

      for (const opp of activeOpps) {
        const result = await this.checkOpportunityForAward(opp);
        results.push(result);

        if (result.awardFound && result.isOurAward) {
          await this.triggerAwardWorkflow(opp, result);
        }
      }

      await this.logActivity("award_check_cycle", "system", "foreman-bot", {
        opportunitiesChecked: activeOpps.length,
        awardsFound: results.filter(r => r.awardFound).length,
        ourAwards: results.filter(r => r.isOurAward).length,
      }, "success", Date.now() - startTime);

      return results;
    } catch (error) {
      await this.logActivity("award_check_cycle", "system", "foreman-bot", {
        error: (error as Error).message,
      }, "error", Date.now() - startTime);
      throw error;
    }
  }

  private async checkOpportunityForAward(opp: typeof opportunities.$inferSelect): Promise<AwardCheckResult> {
    const existingAward = await db.select()
      .from(awardNotifications)
      .where(and(
        eq(awardNotifications.tenantId, this.tenantId),
        eq(awardNotifications.opportunityId, opp.id)
      ))
      .limit(1);

    if (existingAward.length > 0) {
      return {
        opportunityId: opp.id,
        awardFound: true,
        isOurAward: existingAward[0].isOurAward,
        awardDetails: existingAward[0].isOurAward ? {
          contractNumber: existingAward[0].contractNumber || "",
          awardAmount: parseFloat(existingAward[0].awardAmount || "0"),
          awardeeCompany: existingAward[0].awardeeCompany || "",
          awardDate: existingAward[0].awardDate || new Date(),
        } : undefined,
      };
    }

    return {
      opportunityId: opp.id,
      awardFound: false,
      isOurAward: false,
    };
  }

  async triggerAwardWorkflow(
    opp: typeof opportunities.$inferSelect, 
    awardResult: AwardCheckResult
  ): Promise<void> {
    const startTime = Date.now();

    try {
      await db.update(opportunities)
        .set({ status: "awarded", updatedAt: new Date() })
        .where(eq(opportunities.id, opp.id));

      const projectNumber = `PRJ-${Date.now().toString(36).toUpperCase()}`;
      const [project] = await db.insert(projects).values({
        tenantId: this.tenantId,
        projectNumber,
        opportunityId: opp.id,
        name: opp.title,
        status: "mobilization",
        contractValue: awardResult.awardDetails?.awardAmount?.toString(),
      }).returning();

      await this.generateMaterialForecast(project.id, opp);
      await this.generateCrewBriefing(project.id, opp);

      await db.insert(notifications).values({
        tenantId: this.tenantId,
        type: "award_won",
        title: "Contract Award Won!",
        message: `Congratulations! BlackHawk has been awarded: ${opp.title}`,
        priority: "high",
        entityType: "project",
        entityId: project.id,
      });

      await db.update(awardNotifications)
        .set({ workflowTriggered: true, processedAt: new Date() })
        .where(eq(awardNotifications.opportunityId, opp.id));

      await this.logActivity("award_workflow_triggered", "project", project.id, {
        opportunityId: opp.id,
        opportunityTitle: opp.title,
        contractValue: awardResult.awardDetails?.awardAmount,
      }, "success", Date.now() - startTime);

    } catch (error) {
      await this.logActivity("award_workflow_triggered", "opportunity", opp.id, {
        error: (error as Error).message,
      }, "error", Date.now() - startTime);
      throw error;
    }
  }

  private async generateMaterialForecast(projectId: string, opp: typeof opportunities.$inferSelect): Promise<void> {
    const contractValue = parseFloat(opp.contractValue?.toString() || "0");
    
    const standardMaterials = [
      { category: "Concrete", description: "Ready-mix concrete", estimatePercent: 0.15 },
      { category: "Steel", description: "Structural steel and rebar", estimatePercent: 0.20 },
      { category: "Lumber", description: "Framing and forming lumber", estimatePercent: 0.08 },
      { category: "Electrical", description: "Electrical materials and fixtures", estimatePercent: 0.12 },
      { category: "Plumbing", description: "Plumbing materials and fixtures", estimatePercent: 0.10 },
      { category: "HVAC", description: "HVAC equipment and ductwork", estimatePercent: 0.10 },
      { category: "Finishes", description: "Drywall, paint, flooring", estimatePercent: 0.15 },
      { category: "Site Work", description: "Gravel, fill, landscaping", estimatePercent: 0.05 },
      { category: "Equipment", description: "Equipment rental allowance", estimatePercent: 0.05 },
    ];

    for (const material of standardMaterials) {
      const estimatedCost = contractValue * material.estimatePercent;
      
      await db.insert(materialForecasts).values({
        tenantId: this.tenantId,
        projectId,
        opportunityId: opp.id,
        materialCategory: material.category,
        itemDescription: material.description,
        estimatedTotalCost: estimatedCost.toString(),
        status: "forecast",
      });
    }
  }

  private async generateCrewBriefing(projectId: string, opp: typeof opportunities.$inferSelect): Promise<void> {
    const locationJson = opp.locationJson as { city?: string; state?: string; agency?: string } | null;
    const briefingContent = {
      projectName: opp.title,
      contractValue: opp.contractValue,
      agency: locationJson?.agency || "TBD",
      location: `${locationJson?.city || ""}, ${locationJson?.state || ""}`.trim() || "TBD",
      startDate: "TBD - Pending NTP",
      keyContacts: [
        { role: "Project Manager", name: "TBD" },
        { role: "Site Superintendent", name: "TBD" },
        { role: "Safety Officer", name: "TBD" },
      ],
      scopeHighlights: opp.synopsis || opp.description || "See contract documents",
    };

    const safetyChecklist = [
      "Complete site-specific safety orientation",
      "Review OSHA requirements for this project type",
      "Verify all crew certifications are current",
      "Establish emergency contact procedures",
      "Review fall protection requirements",
      "Confirm PPE requirements for all trades",
    ];

    const ppeRequirements = [
      "Hard hat",
      "Safety glasses",
      "Steel-toed boots",
      "High-visibility vest",
      "Hearing protection (as needed)",
      "Gloves (task-appropriate)",
    ];

    await db.insert(crewBriefings).values({
      tenantId: this.tenantId,
      projectId,
      briefingType: "kickoff",
      title: `Project Kickoff Briefing: ${opp.title}`,
      contentJson: briefingContent as unknown as Record<string, unknown>,
      safetyChecklistJson: safetyChecklist as unknown as Record<string, unknown>,
      ppeRequirements,
    });
  }

  async checkForAmendments(): Promise<AmendmentCheckResult[]> {
    const startTime = Date.now();
    const results: AmendmentCheckResult[] = [];

    try {
      const activeOpps = await db.select()
        .from(opportunities)
        .where(and(
          eq(opportunities.tenantId, this.tenantId),
          eq(opportunities.status, "bid_in_progress")
        ));

      for (const opp of activeOpps) {
        const result = await this.checkOpportunityForAmendments(opp);
        if (result.amendmentFound) {
          results.push(result);
          await this.handleAmendment(opp, result);
        }
      }

      await this.logActivity("amendment_check_cycle", "system", "foreman-bot", {
        opportunitiesChecked: activeOpps.length,
        amendmentsFound: results.length,
      }, "success", Date.now() - startTime);

      return results;
    } catch (error) {
      await this.logActivity("amendment_check_cycle", "system", "foreman-bot", {
        error: (error as Error).message,
      }, "error", Date.now() - startTime);
      throw error;
    }
  }

  private async checkOpportunityForAmendments(opp: typeof opportunities.$inferSelect): Promise<AmendmentCheckResult> {
    const latestAmendment = await db.select()
      .from(amendmentTracking)
      .where(and(
        eq(amendmentTracking.tenantId, this.tenantId),
        eq(amendmentTracking.opportunityId, opp.id)
      ))
      .orderBy(desc(amendmentTracking.amendmentNumber))
      .limit(1);

    if (latestAmendment.length > 0 && !latestAmendment[0].reviewedAt) {
      return {
        opportunityId: opp.id,
        amendmentFound: true,
        amendmentNumber: latestAmendment[0].amendmentNumber,
        changeType: latestAmendment[0].changeType || undefined,
        impactLevel: latestAmendment[0].impactLevel || undefined,
        affectsDeadline: latestAmendment[0].affectsDeadline,
        changeSummary: latestAmendment[0].changeSummary || undefined,
      };
    }

    return {
      opportunityId: opp.id,
      amendmentFound: false,
    };
  }

  private async handleAmendment(
    opp: typeof opportunities.$inferSelect,
    amendment: AmendmentCheckResult
  ): Promise<void> {
    const priority = amendment.impactLevel === "critical" || amendment.impactLevel === "high" 
      ? "high" 
      : "normal";

    await db.insert(notifications).values({
      tenantId: this.tenantId,
      type: "amendment_detected",
      title: `Amendment ${amendment.amendmentNumber} Detected`,
      message: `${opp.title}: ${amendment.changeSummary || "Review required"}`,
      priority,
      entityType: "opportunity",
      entityId: opp.id,
    });

    if (amendment.affectsDeadline) {
      await db.insert(notifications).values({
        tenantId: this.tenantId,
        type: "deadline_change",
        title: "Deadline Change Alert",
        message: `Deadline may have changed for: ${opp.title}`,
        priority: "high",
        entityType: "opportunity",
        entityId: opp.id,
      });
    }
  }

  async getRecentAlerts(limit: number = 20): Promise<Array<{
    type: string;
    opportunityId: string;
    opportunityTitle: string;
    message: string;
    timestamp: Date;
    priority: string;
  }>> {
    const recentNotifications = await db.select()
      .from(notifications)
      .where(and(
        eq(notifications.tenantId, this.tenantId),
        eq(notifications.entityType, "opportunity")
      ))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    const results = [];
    for (const notif of recentNotifications) {
      if (notif.entityId) {
        const [opp] = await db.select({ title: opportunities.title })
          .from(opportunities)
          .where(eq(opportunities.id, notif.entityId))
          .limit(1);

        results.push({
          type: notif.type,
          opportunityId: notif.entityId,
          opportunityTitle: opp?.title || "Unknown",
          message: notif.message || "",
          timestamp: notif.createdAt,
          priority: notif.priority,
        });
      }
    }

    return results;
  }

  async recordAward(
    opportunityId: string,
    awardDetails: {
      contractNumber: string;
      awardAmount: number;
      awardeeCompany: string;
      awardDate: Date;
      isOurAward: boolean;
    }
  ): Promise<void> {
    await db.insert(awardNotifications).values({
      tenantId: this.tenantId,
      opportunityId,
      awardType: "award",
      awardDate: awardDetails.awardDate,
      contractNumber: awardDetails.contractNumber,
      awardAmount: awardDetails.awardAmount.toString(),
      awardeeCompany: awardDetails.awardeeCompany,
      isOurAward: awardDetails.isOurAward,
    });

    if (awardDetails.isOurAward) {
      const [opp] = await db.select()
        .from(opportunities)
        .where(eq(opportunities.id, opportunityId))
        .limit(1);

      if (opp) {
        await this.triggerAwardWorkflow(opp, {
          opportunityId,
          awardFound: true,
          isOurAward: true,
          awardDetails,
        });
      }
    }
  }

  async recordAmendment(
    opportunityId: string,
    amendmentDetails: {
      amendmentNumber: number;
      changeType: string;
      changeSummary: string;
      impactLevel: string;
      affectsDeadline: boolean;
      affectsScope: boolean;
      affectsPricing: boolean;
    }
  ): Promise<void> {
    await db.insert(amendmentTracking).values({
      tenantId: this.tenantId,
      opportunityId,
      amendmentNumber: amendmentDetails.amendmentNumber,
      amendmentDate: new Date(),
      changeType: amendmentDetails.changeType,
      changeSummary: amendmentDetails.changeSummary,
      impactLevel: amendmentDetails.impactLevel,
      affectsDeadline: amendmentDetails.affectsDeadline,
      affectsScope: amendmentDetails.affectsScope,
      affectsPricing: amendmentDetails.affectsPricing,
      requiresReview: true,
    });

    const [opp] = await db.select()
      .from(opportunities)
      .where(eq(opportunities.id, opportunityId))
      .limit(1);

    if (opp) {
      await this.handleAmendment(opp, {
        opportunityId,
        amendmentFound: true,
        ...amendmentDetails,
      });
    }
  }

  private async logActivity(
    actionType: string,
    entityType: string,
    entityId: string,
    outputJson: Record<string, unknown>,
    status: "success" | "error" | "pending",
    durationMs: number
  ): Promise<void> {
    await db.insert(agentActivities).values({
      tenantId: this.tenantId,
      agentName: "foreman-bot",
      actionType,
      entityType,
      entityId,
      outputJson,
      status,
      durationMs,
    });
  }
}

export const foremanBotAgent = new ForemanBotAgent();
