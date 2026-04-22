import { db } from "../db";
import { 
  opportunities, bidProjects, approvalRequests, auditEvents, herbieActions,
  opportunityCapture, teamingPartners, conversationMemory
} from "@shared/schema";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { RAGService } from "./rag.service";
import { MemoryService } from "./memory.service";
import OpenAI from "openai";

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI();
  }
  return openaiClient;
}

export interface ToolResult {
  success: boolean;
  data: unknown;
  evidence: Array<{ type: string; id: string; title: string }>;
  reasoning: string;
  requiresApproval: boolean;
  approvalType?: string;
  recommendedActions: string[];
  risks: string[];
}

export interface StructuredResponse {
  answer: string;
  evidence: Array<{ type: string; id: string; title: string; link: string }>;
  recommendedActions: string[];
  approvalRequired: Array<{ action: string; reason: string }>;
  risks: string[];
  deadlines: Array<{ item: string; date: string; urgency: string }>;
}

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

export class ToolRouterService {
  private tenantId: string;
  private userId: string;
  private ragService: RAGService;
  private memoryService: MemoryService;
  private tools: Map<string, ToolHandler>;

  constructor(tenantId: string, userId: string) {
    this.tenantId = tenantId;
    this.userId = userId;
    this.ragService = new RAGService(tenantId);
    this.memoryService = new MemoryService(tenantId, userId);
    this.tools = new Map();
    this.registerTools();
  }

  private registerTools() {
    this.tools.set("search_opportunities", this.searchOpportunities.bind(this));
    this.tools.set("search_pipeline", this.searchPipeline.bind(this));
    this.tools.set("summarize_opportunity", this.summarizeOpportunity.bind(this));
    this.tools.set("compare_opportunities", this.compareOpportunities.bind(this));
    this.tools.set("generate_capture_plan", this.generateCapturePlan.bind(this));
    this.tools.set("generate_proposal_outline", this.generateProposalOutline.bind(this));
    this.tools.set("identify_teaming_partners", this.identifyTeamingPartners.bind(this));
    this.tools.set("create_tasks_from_template", this.createTasksFromTemplate.bind(this));
    this.tools.set("get_pending_approvals", this.getPendingApprovals.bind(this));
    this.tools.set("get_upcoming_deadlines", this.getUpcomingDeadlines.bind(this));
    this.tools.set("get_daily_briefing", this.getDailyBriefing.bind(this));
    this.tools.set("draft_email", this.draftEmail.bind(this));
    this.tools.set("schedule_meeting", this.scheduleMeeting.bind(this));
    this.tools.set("knowledge_search", this.knowledgeSearch.bind(this));
    this.tools.set("get_bid_pipeline", this.getBidPipeline.bind(this));
    this.tools.set("get_audit_history", this.getAuditHistory.bind(this));
  }

  async routeRequest(userMessage: string): Promise<StructuredResponse> {
    const toolDecision = await this.decideTools(userMessage);
    
    const results: ToolResult[] = [];
    for (const tool of toolDecision.tools) {
      if (this.tools.has(tool.name)) {
        const handler = this.tools.get(tool.name)!;
        const result = await handler(tool.args);
        results.push(result);
        
        await this.logAction(tool.name, result);
      }
    }

    return this.formatStructuredResponse(userMessage, results, toolDecision.reasoning);
  }

  private async decideTools(message: string): Promise<{ tools: Array<{ name: string; args: Record<string, unknown> }>; reasoning: string }> {
    const availableTools = Array.from(this.tools.keys());
    
    try {
      const completion = await getOpenAI().chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are HERBIE's tool router. Analyze the user's request and decide which tools to call.
            
Available tools:
- search_opportunities: Search for opportunities by keywords, NAICS, agency, deadline
- search_pipeline: Search bid pipeline by stage, owner, days until deadline
- summarize_opportunity: Get detailed summary of a specific opportunity
- compare_opportunities: Compare multiple opportunities side by side
- generate_capture_plan: Create a capture plan for an opportunity
- generate_proposal_outline: Generate proposal outline with FAR/DFARS awareness
- identify_teaming_partners: Find potential teaming partners for an opportunity
- create_tasks_from_template: Create bid tasks from a template
- get_pending_approvals: Get list of pending approval requests
- get_upcoming_deadlines: Get upcoming deadlines for bids and opportunities
- get_daily_briefing: Get today's executive briefing
- draft_email: Draft an email (requires approval to send)
- schedule_meeting: Schedule a meeting (requires approval)
- knowledge_search: Search knowledge vault documents
- get_bid_pipeline: Get current bid pipeline status
- get_audit_history: Get audit trail for actions

Respond with JSON: { "tools": [{ "name": "tool_name", "args": { ... } }], "reasoning": "why these tools" }`,
          },
          { role: "user", content: message },
        ],
        response_format: { type: "json_object" },
        max_tokens: 500,
      });

      const content = completion.choices[0]?.message?.content || '{"tools":[],"reasoning":"Unable to determine tools"}';
      return JSON.parse(content);
    } catch (error) {
      return { tools: [{ name: "knowledge_search", args: { query: message } }], reasoning: "Fallback to knowledge search" };
    }
  }

  private async searchOpportunities(args: Record<string, unknown>): Promise<ToolResult> {
    const { keywords, naics, daysUntilDeadline } = args as { keywords?: string; naics?: string; daysUntilDeadline?: number };
    
    const results = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.tenantId, this.tenantId))
      .orderBy(desc(opportunities.createdAt))
      .limit(20);
    
    const filtered = results.filter(opp => {
      if (keywords && !opp.title?.toLowerCase().includes(keywords.toLowerCase())) return false;
      if (naics && !opp.naicsCodes?.includes(naics)) return false;
      if (daysUntilDeadline && opp.dueAt) {
        const deadline = new Date(opp.dueAt);
        const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysLeft > daysUntilDeadline) return false;
      }
      return true;
    });

    return {
      success: true,
      data: filtered,
      evidence: filtered.map(o => ({ type: "opportunity", id: o.id, title: o.title })),
      reasoning: `Found ${filtered.length} opportunities matching criteria`,
      requiresApproval: false,
      recommendedActions: filtered.length > 0 
        ? ["Review high-priority opportunities", "Score opportunities against fit profile", "Create bid projects for promising opportunities"]
        : ["Expand search criteria", "Check SAM.gov for new opportunities"],
      risks: filtered.filter(o => {
        if (!o.dueAt) return false;
        const daysLeft = Math.ceil((new Date(o.dueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return daysLeft <= 7;
      }).map(o => `${o.title} deadline in less than 7 days`),
    };
  }

  private async searchPipeline(args: Record<string, unknown>): Promise<ToolResult> {
    const { status } = args as { status?: string };
    
    const results = await db
      .select()
      .from(bidProjects)
      .where(eq(bidProjects.tenantId, this.tenantId))
      .orderBy(desc(bidProjects.createdAt))
      .limit(50);

    const filtered = results.filter(bid => {
      if (status && bid.status !== status) return false;
      return true;
    });

    const byStatus = filtered.reduce((acc, bid) => {
      const s = bid.status || "unknown";
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      success: true,
      data: { bids: filtered, summary: byStatus },
      evidence: filtered.map(b => ({ type: "bid_project", id: b.id, title: `Bid ${b.id.slice(0, 8)}` })),
      reasoning: `Pipeline has ${filtered.length} bids across statuses`,
      requiresApproval: false,
      recommendedActions: [
        "Review bids in 'drafting' status for blockers",
        "Check deadline compliance for all active bids",
        "Update capture status for stale opportunities",
      ],
      risks: [],
    };
  }

  private async summarizeOpportunity(args: Record<string, unknown>): Promise<ToolResult> {
    const { opportunityId } = args as { opportunityId: string };
    
    const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId));
    
    if (!opp) {
      return {
        success: false,
        data: null,
        evidence: [],
        reasoning: "Opportunity not found",
        requiresApproval: false,
        recommendedActions: ["Verify opportunity ID", "Search for opportunity by title"],
        risks: [],
      };
    }

    const summary = {
      title: opp.title,
      synopsis: opp.synopsis,
      value: opp.contractValue,
      deadline: opp.dueAt,
      naics: opp.naicsCodes,
      setAside: opp.setAside,
      description: opp.description,
      keyDates: {
        posted: opp.postedAt,
        due: opp.dueAt,
      },
    };

    return {
      success: true,
      data: summary,
      evidence: [{ type: "opportunity", id: opp.id, title: opp.title }],
      reasoning: `Summarized opportunity: ${opp.title}`,
      requiresApproval: false,
      recommendedActions: [
        "Score against fit profile",
        "Identify teaming partners",
        "Create capture plan",
        "Generate proposal outline",
      ],
      risks: opp.dueAt && new Date(opp.dueAt) < new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        ? [`Response deadline is within 14 days`]
        : [],
    };
  }

  private async compareOpportunities(args: Record<string, unknown>): Promise<ToolResult> {
    const { opportunityIds } = args as { opportunityIds: string[] };
    
    const opps = [];
    for (const id of opportunityIds || []) {
      const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, id));
      if (opp) opps.push(opp);
    }

    const comparison = opps.map(o => ({
      id: o.id,
      title: o.title,
      synopsis: o.synopsis,
      value: o.contractValue,
      deadline: o.dueAt,
      naics: o.naicsCodes,
      setAside: o.setAside,
    }));

    return {
      success: true,
      data: comparison,
      evidence: opps.map(o => ({ type: "opportunity", id: o.id, title: o.title })),
      reasoning: `Compared ${opps.length} opportunities`,
      requiresApproval: false,
      recommendedActions: ["Prioritize based on fit score", "Allocate resources to highest-value opportunities"],
      risks: [],
    };
  }

  private async generateCapturePlan(args: Record<string, unknown>): Promise<ToolResult> {
    const { opportunityId } = args as { opportunityId: string };
    
    const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId));
    if (!opp) {
      return { success: false, data: null, evidence: [], reasoning: "Opportunity not found", requiresApproval: false, recommendedActions: [], risks: [] };
    }

    const capturePlan = {
      opportunityId: opp.id,
      opportunityTitle: opp.title,
      phases: [
        { phase: "Discovery", duration: "Week 1-2", tasks: ["Review solicitation", "Identify requirements", "Assess competition"] },
        { phase: "Strategy", duration: "Week 2-3", tasks: ["Develop win themes", "Identify teaming partners", "Draft capture strategy"] },
        { phase: "Solution", duration: "Week 3-5", tasks: ["Develop technical approach", "Define management plan", "Build cost model"] },
        { phase: "Proposal", duration: "Week 5-8", tasks: ["Write proposal volumes", "Conduct reviews", "Finalize pricing"] },
        { phase: "Submission", duration: "Week 8", tasks: ["Final compliance check", "Package submission", "Submit on time"] },
      ],
      keyMilestones: [
        { milestone: "Go/No-Go Decision", date: "Week 2" },
        { milestone: "Pink Team Review", date: "Week 5" },
        { milestone: "Red Team Review", date: "Week 7" },
        { milestone: "Submission", date: opp.dueAt },
      ],
    };

    return {
      success: true,
      data: capturePlan,
      evidence: [{ type: "opportunity", id: opp.id, title: opp.title }],
      reasoning: `Generated capture plan for ${opp.title}`,
      requiresApproval: false,
      recommendedActions: ["Assign capture manager", "Schedule kickoff meeting", "Create bid project"],
      risks: [],
    };
  }

  private async generateProposalOutline(args: Record<string, unknown>): Promise<ToolResult> {
    const { opportunityId } = args as { opportunityId: string };
    
    const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId));
    if (!opp) {
      return { success: false, data: null, evidence: [], reasoning: "Opportunity not found", requiresApproval: false, recommendedActions: [], risks: [] };
    }

    const outline = {
      opportunityId: opp.id,
      opportunityTitle: opp.title,
      volumes: [
        {
          name: "Technical Volume",
          sections: [
            "Technical Approach",
            "Management Approach",
            "Quality Control Plan",
            "Risk Management",
            "Schedule and Milestones",
          ],
        },
        {
          name: "Past Performance Volume",
          sections: [
            "Relevant Experience",
            "Past Performance References",
            "Performance Metrics",
          ],
        },
        {
          name: "Cost/Price Volume",
          sections: [
            "Cost Summary",
            "Labor Categories and Rates",
            "Other Direct Costs",
            "Subcontractor Costs",
          ],
        },
      ],
      farDfarsConsiderations: [
        "FAR 52.219-8: Utilization of Small Business Concerns",
        "FAR 52.222-35: Equal Opportunity for Veterans",
        "FAR 52.222-36: Equal Opportunity for Workers with Disabilities",
        "DFARS 252.204-7012: Safeguarding Covered Defense Information",
      ],
    };

    return {
      success: true,
      data: outline,
      evidence: [{ type: "opportunity", id: opp.id, title: opp.title }],
      reasoning: `Generated proposal outline for ${opp.title}`,
      requiresApproval: false,
      recommendedActions: ["Assign volume leads", "Develop compliance matrix", "Start drafting"],
      risks: [],
    };
  }

  private async identifyTeamingPartners(args: Record<string, unknown>): Promise<ToolResult> {
    const { opportunityId } = args as { opportunityId: string };
    
    const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId));
    if (!opp) {
      return { success: false, data: null, evidence: [], reasoning: "Opportunity not found", requiresApproval: false, recommendedActions: [], risks: [] };
    }

    const partners = await db
      .select()
      .from(teamingPartners)
      .where(eq(teamingPartners.tenantId, this.tenantId))
      .limit(10);

    const matchedPartners = partners.filter(p => {
      const oppNaics = opp.naicsCodes || [];
      const partnerNaics = p.naicsCodes || [];
      if (oppNaics.some(n => partnerNaics.includes(n))) return true;
      if (opp.setAside && p.setAsideCertifications?.includes(opp.setAside)) return true;
      return true;
    });

    return {
      success: true,
      data: matchedPartners,
      evidence: matchedPartners.map(p => ({ type: "teaming_partner", id: p.id, title: p.companyName })),
      reasoning: `Found ${matchedPartners.length} potential teaming partners`,
      requiresApproval: false,
      recommendedActions: ["Contact preferred partners", "Request capability statements", "Negotiate teaming agreement"],
      risks: matchedPartners.length === 0 ? ["No suitable teaming partners found - consider outreach"] : [],
    };
  }

  private async createTasksFromTemplate(args: Record<string, unknown>): Promise<ToolResult> {
    const { bidProjectId, templateName } = args as { bidProjectId: string; templateName: string };
    
    const templates: Record<string, Array<{ name: string; description: string; daysFromStart: number }>> = {
      standard_bid: [
        { name: "Review Solicitation", description: "Thoroughly review RFP/RFQ documents", daysFromStart: 1 },
        { name: "Compliance Matrix", description: "Create compliance matrix from requirements", daysFromStart: 3 },
        { name: "Go/No-Go Decision", description: "Executive decision on bid pursuit", daysFromStart: 5 },
        { name: "Technical Approach", description: "Draft technical approach section", daysFromStart: 10 },
        { name: "Past Performance", description: "Compile past performance references", daysFromStart: 12 },
        { name: "Cost Volume", description: "Develop pricing and cost model", daysFromStart: 15 },
        { name: "Pink Team Review", description: "Internal review of draft proposal", daysFromStart: 20 },
        { name: "Red Team Review", description: "Final quality review", daysFromStart: 25 },
        { name: "Final Submission", description: "Package and submit proposal", daysFromStart: 28 },
      ],
    };

    const template = templates[templateName] || templates.standard_bid;

    return {
      success: true,
      data: { bidProjectId, tasks: template },
      evidence: [{ type: "bid_project", id: bidProjectId, title: templateName }],
      reasoning: `Created ${template.length} tasks from ${templateName} template`,
      requiresApproval: false,
      recommendedActions: ["Assign task owners", "Set actual due dates", "Schedule kickoff meeting"],
      risks: [],
    };
  }

  private async getPendingApprovals(args: Record<string, unknown>): Promise<ToolResult> {
    const approvals = await db
      .select()
      .from(approvalRequests)
      .where(and(
        eq(approvalRequests.tenantId, this.tenantId),
        eq(approvalRequests.status, "pending")
      ))
      .orderBy(desc(approvalRequests.createdAt))
      .limit(20);

    const byUrgency = approvals.reduce((acc, a) => {
      const urgency = a.priority === "high" || a.priority === "urgent" ? "urgent" : "normal";
      acc[urgency] = (acc[urgency] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      success: true,
      data: { approvals, summary: byUrgency },
      evidence: approvals.map(a => ({ type: "approval_request", id: a.id, title: a.actionType })),
      reasoning: `Found ${approvals.length} pending approvals`,
      requiresApproval: false,
      recommendedActions: 
        approvals.length > 0 
          ? ["Review urgent approvals first", "Delegate low-priority approvals"]
          : ["No pending approvals - all caught up!"],
      risks: approvals.filter(a => a.priority === "urgent").map(a => `Urgent approval pending: ${a.actionType}`),
    };
  }

  private async getUpcomingDeadlines(args: Record<string, unknown>): Promise<ToolResult> {
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const opps = await db
      .select()
      .from(opportunities)
      .where(and(
        eq(opportunities.tenantId, this.tenantId),
        gte(opportunities.dueAt, now),
        lte(opportunities.dueAt, nextWeek)
      ))
      .orderBy(opportunities.dueAt)
      .limit(20);

    const deadlines = opps.map(o => ({
      type: "opportunity",
      id: o.id,
      title: o.title,
      deadline: o.dueAt,
      daysLeft: o.dueAt ? Math.ceil((new Date(o.dueAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0,
    }));

    return {
      success: true,
      data: deadlines,
      evidence: opps.map(o => ({ type: "opportunity", id: o.id, title: o.title })),
      reasoning: `Found ${deadlines.length} deadlines in the next 7 days`,
      requiresApproval: false,
      recommendedActions: deadlines.length > 0 
        ? ["Prioritize submissions by deadline", "Verify all materials are ready", "Schedule final reviews"]
        : ["No imminent deadlines - focus on pipeline development"],
      risks: deadlines.filter(d => d.daysLeft <= 2).map(d => `${d.title} due in ${d.daysLeft} days!`),
    };
  }

  private async getDailyBriefing(args: Record<string, unknown>): Promise<ToolResult> {
    const pendingApprovals = await this.getPendingApprovals({});
    const deadlines = await this.getUpcomingDeadlines({});
    const pipeline = await this.searchPipeline({});

    const briefing = {
      date: new Date().toISOString().split("T")[0],
      summary: {
        pendingApprovals: (pendingApprovals.data as { approvals: unknown[] }).approvals.length,
        urgentDeadlines: (deadlines.data as Array<{ daysLeft: number }>).filter(d => d.daysLeft <= 3).length,
        activeBids: (pipeline.data as { bids: unknown[] }).bids.length,
      },
      priorities: [
        ...pendingApprovals.risks,
        ...deadlines.risks,
      ],
      recommendations: [
        ...pendingApprovals.recommendedActions.slice(0, 2),
        ...deadlines.recommendedActions.slice(0, 2),
      ],
    };

    return {
      success: true,
      data: briefing,
      evidence: [...pendingApprovals.evidence, ...deadlines.evidence],
      reasoning: "Generated daily executive briefing",
      requiresApproval: false,
      recommendedActions: briefing.recommendations,
      risks: briefing.priorities,
    };
  }

  private async draftEmail(args: Record<string, unknown>): Promise<ToolResult> {
    const { to, subject, body, opportunityId } = args as { to: string; subject: string; body: string; opportunityId?: string };

    return {
      success: true,
      data: {
        draft: { to, subject, body },
        requiresApprovalToSend: true,
      },
      evidence: opportunityId ? [{ type: "opportunity", id: opportunityId, title: subject }] : [],
      reasoning: "Email drafted - requires approval before sending",
      requiresApproval: true,
      approvalType: "email_send",
      recommendedActions: ["Review email content", "Submit for approval", "Wait for approval before sending"],
      risks: ["Email will not be sent until approved"],
    };
  }

  private async scheduleMeeting(args: Record<string, unknown>): Promise<ToolResult> {
    const { title, attendees, dateTime, duration } = args as { title: string; attendees: string[]; dateTime: string; duration: number };

    return {
      success: true,
      data: {
        meeting: { title, attendees, dateTime, duration },
        requiresApprovalToSchedule: true,
      },
      evidence: [],
      reasoning: "Meeting drafted - requires approval before scheduling",
      requiresApproval: true,
      approvalType: "calendar_event",
      recommendedActions: ["Review meeting details", "Submit for approval", "Send invites after approval"],
      risks: ["Meeting will not be scheduled until approved"],
    };
  }

  private async knowledgeSearch(args: Record<string, unknown>): Promise<ToolResult> {
    const { query } = args as { query: string };
    
    const result = await this.ragService.searchWithSources(query);

    return {
      success: true,
      data: result,
      evidence: result.sources.map(s => ({ type: s.type, id: s.id, title: s.title })),
      reasoning: `Searched knowledge vault for: ${query}`,
      requiresApproval: false,
      recommendedActions: result.sources.length > 0 
        ? ["Review source documents for more details"]
        : ["Add relevant documents to knowledge vault"],
      risks: [],
    };
  }

  private async getBidPipeline(args: Record<string, unknown>): Promise<ToolResult> {
    const bids = await db
      .select()
      .from(bidProjects)
      .where(eq(bidProjects.tenantId, this.tenantId))
      .orderBy(desc(bidProjects.createdAt))
      .limit(50);

    const statuses = ["initiated", "in_progress", "submitted", "won", "lost", "cancelled"];
    const pipelineByStatus = statuses.map(status => ({
      status,
      count: bids.filter(b => b.status === status).length,
      bids: bids.filter(b => b.status === status),
    }));

    return {
      success: true,
      data: pipelineByStatus,
      evidence: bids.map(b => ({ type: "bid_project", id: b.id, title: `Bid ${b.id.slice(0, 8)}` })),
      reasoning: `Pipeline has ${bids.length} total bids`,
      requiresApproval: false,
      recommendedActions: [
        "Move initiated bids to in_progress",
        "Review stalled bids for blockers",
        "Celebrate recent wins",
      ],
      risks: [],
    };
  }

  private async getAuditHistory(args: Record<string, unknown>): Promise<ToolResult> {
    const { entityType, entityId, limit = 20 } = args as { entityType?: string; entityId?: string; limit?: number };

    let query = db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.tenantId, this.tenantId))
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit);

    const events = await query;

    return {
      success: true,
      data: events,
      evidence: events.map(e => ({ type: "audit_event", id: e.id, title: e.eventType })),
      reasoning: `Retrieved ${events.length} audit events`,
      requiresApproval: false,
      recommendedActions: [],
      risks: [],
    };
  }

  private async logAction(toolName: string, result: ToolResult): Promise<void> {
    await db.insert(herbieActions).values({
      tenantId: this.tenantId,
      userId: this.userId,
      actionType: result.requiresApproval ? "approval_requested" : "completed",
      actionCategory: this.getActionCategory(toolName),
      title: `${toolName} executed`,
      description: result.reasoning,
      reasoning: result.reasoning,
      evidenceJson: result.evidence,
      status: result.requiresApproval ? "pending" : "completed",
      requiresApproval: result.requiresApproval,
    });
  }

  private getActionCategory(toolName: string): string {
    const categories: Record<string, string> = {
      search_opportunities: "opportunity_discovery",
      search_pipeline: "bid_creation",
      summarize_opportunity: "opportunity_discovery",
      compare_opportunities: "opportunity_discovery",
      generate_capture_plan: "bid_creation",
      generate_proposal_outline: "bid_creation",
      identify_teaming_partners: "opportunity_discovery",
      create_tasks_from_template: "bid_creation",
      get_pending_approvals: "scoring",
      get_upcoming_deadlines: "scoring",
      get_daily_briefing: "scoring",
      draft_email: "email_draft",
      schedule_meeting: "meeting_schedule",
      knowledge_search: "scoring",
      get_bid_pipeline: "bid_creation",
      get_audit_history: "compliance_check",
    };
    return categories[toolName] || "scoring";
  }

  private formatStructuredResponse(query: string, results: ToolResult[], reasoning: string): StructuredResponse {
    const allEvidence = results.flatMap(r => r.evidence.map(e => ({ ...e, link: `/${e.type}/${e.id}` })));
    const allActions = Array.from(new Set(results.flatMap(r => r.recommendedActions)));
    const allRisks = Array.from(new Set(results.flatMap(r => r.risks)));
    const approvalRequired = results
      .filter(r => r.requiresApproval)
      .map(r => ({ action: r.approvalType || "unknown", reason: r.reasoning }));

    const deadlines = results
      .flatMap(r => {
        const data = r.data as { deadline?: string; daysLeft?: number; title?: string } | Array<{ deadline?: string; daysLeft?: number; title?: string }>;
        if (Array.isArray(data)) {
          return data
            .filter(d => d.deadline)
            .map(d => ({
              item: d.title || "Unknown",
              date: d.deadline!,
              urgency: (d.daysLeft || 30) <= 3 ? "high" : (d.daysLeft || 30) <= 7 ? "medium" : "low",
            }));
        }
        return [];
      });

    const answer = results.length > 0 
      ? `Based on my analysis: ${reasoning}\n\n${results.map(r => r.reasoning).join("\n")}`
      : "I couldn't find relevant information for your request.";

    return {
      answer,
      evidence: allEvidence,
      recommendedActions: allActions,
      approvalRequired,
      risks: allRisks,
      deadlines,
    };
  }
}

export const createToolRouter = (tenantId: string, userId: string) => new ToolRouterService(tenantId, userId);
