import {
  users,
  tenants,
  opportunities,
  bidProjects,
  bidSubmissions,
  bidDecisions,
  approvalRequests,
  approvalActions,
  notifications,
  auditEvents,
  jobs,
  sourceSystems,
  sourceRuns,
  opportunityScores,
  bidTasks,
  bidArtifacts,
  calendarEvents,
  integrationHealth,
  conversations,
  messages,
  knowledgeDocuments,
  companyProfile,
  subcontractors,
  laborRates,
  winPatterns,
  learningWeights,
  companies,
  vendors,
  folderSections,
  jacketFolders,
  jacketDocuments,
  jacketTimeline,
  documentAuditLog,
  bidRfis,
  bidAddenda,
  bidChecklists,
  bidChecklistItems,
  blueprints,
  takeoffItems,
  blueprintAnnotations,
  projects,
  type User,
  type InsertUser,
  type Tenant,
  type InsertTenant,
  type Opportunity,
  type InsertOpportunity,
  type BidProject,
  type InsertBidProject,
  type BidSubmission,
  type InsertBidSubmission,
  type ApprovalRequest,
  type InsertApprovalRequest,
  type Notification,
  type InsertNotification,
  type AuditEvent,
  type InsertAuditEvent,
  type Job,
  type InsertJob,
  type Conversation,
  type Message,
  type InsertConversation,
  type InsertMessage,
  type KnowledgeDocument,
  type InsertKnowledgeDocument,
  type CompanyProfileData,
  type InsertCompanyProfile,
  type Subcontractor,
  type InsertSubcontractor,
  type LaborRate,
  type InsertLaborRate,
  type WinPattern,
  type InsertWinPattern,
  type LearningWeight,
  type InsertLearningWeight,
  type Company,
  type InsertCompany,
  type Vendor,
  type FolderSection,
  type InsertFolderSection,
  type JacketFolder,
  type InsertJacketFolder,
  type JacketDocument,
  type InsertJacketDocument,
  type JacketTimelineEntry,
  type InsertJacketTimeline,
  type BidRfi,
  type InsertBidRfi,
  type BidAddendum,
  type InsertBidAddendum,
  type BidChecklist,
  type InsertBidChecklist,
  type BidChecklistItem,
  type InsertBidChecklistItem,
  type Blueprint,
  type InsertBlueprint,
  type TakeoffItem,
  type InsertTakeoffItem,
  type BlueprintAnnotation,
  type InsertBlueprintAnnotation,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lte, lt, sql, count, ilike, inArray, sum } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Tenants
  getTenant(id: string): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  
  // Opportunities
  getOpportunities(tenantId: string, status?: string): Promise<Opportunity[]>;
  getOpportunity(id: string): Promise<Opportunity | undefined>;
  createOpportunity(opportunity: InsertOpportunity): Promise<Opportunity>;
  updateOpportunity(id: string, updates: Partial<Opportunity>): Promise<Opportunity | undefined>;
  
  // Bid Projects
  getBidProjects(tenantId: string): Promise<BidProject[]>;
  getBidProject(id: string): Promise<BidProject | undefined>;
  createBidProject(project: InsertBidProject): Promise<BidProject>;
  updateBidProject(id: string, updates: Partial<BidProject>): Promise<BidProject | undefined>;
  createBidDecision(decision: { tenantId: string; bidProjectId: string; decision: string; decidedBy?: string; rationaleJson?: any }): Promise<any>;
  createBidSubmission(submission: InsertBidSubmission): Promise<BidSubmission>;
  getLatestBidSubmissionForBidProject(bidProjectId: string): Promise<BidSubmission | undefined>;
  createProject(project: { tenantId: string; name: string; status?: string; description?: string; startDate?: Date; estimatedValue?: number; sourceBidId?: string; sourceOpportunityId?: string; metadataJson?: any }): Promise<any>;
  
  // Approval Requests
  getApprovalRequests(tenantId: string, status?: string): Promise<ApprovalRequest[]>;
  getApprovalRequest(id: string): Promise<ApprovalRequest | undefined>;
  createApprovalRequest(request: InsertApprovalRequest): Promise<ApprovalRequest>;
  updateApprovalRequest(id: string, updates: Partial<ApprovalRequest>): Promise<ApprovalRequest | undefined>;
  
  // Notifications
  getNotifications(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string): Promise<void>;
  
  // Audit Events
  createAuditEvent(event: InsertAuditEvent): Promise<AuditEvent>;
  getAuditEvents(entityType: string, entityId: string): Promise<AuditEvent[]>;
  
  // Jobs
  createJob(job: InsertJob): Promise<Job>;
  getNextPendingJob(): Promise<Job | undefined>;
  updateJobStatus(id: string, status: string): Promise<void>;
  
  // Conversations
  getConversation(id: number): Promise<Conversation | undefined>;
  getAllConversations(): Promise<Conversation[]>;
  createConversation(title: string): Promise<Conversation>;
  deleteConversation(id: number): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<Message[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<Message>;
  
  // Dashboard Stats
  getDashboardStats(tenantId: string): Promise<any>;
  
  // Knowledge Documents
  getKnowledgeDocuments(tenantId: string): Promise<KnowledgeDocument[]>;
  getKnowledgeDocumentById(id: string): Promise<KnowledgeDocument | undefined>;
  searchKnowledgeDocuments(tenantId: string, query: string, options?: { category?: string; limit?: number }): Promise<KnowledgeDocument[]>;
  createKnowledgeDocument(doc: InsertKnowledgeDocument): Promise<KnowledgeDocument>;
  
  // Company Profile
  getCompanyProfile(tenantId: string): Promise<CompanyProfileData | undefined>;
  createCompanyProfile(profile: InsertCompanyProfile): Promise<CompanyProfileData>;
  
  // Vendors
  getVendors(tenantId: string): Promise<Vendor[]>;

  // Subcontractors
  getSubcontractors(tenantId: string): Promise<Subcontractor[]>;
  createSubcontractor(sub: InsertSubcontractor): Promise<Subcontractor>;
  
  // Labor Rates
  getLaborRates(tenantId: string): Promise<LaborRate[]>;
  createLaborRate(rate: InsertLaborRate): Promise<LaborRate>;
  
  // Win Patterns
  getWinPatterns(tenantId: string): Promise<WinPattern[]>;
  createWinPattern(pattern: InsertWinPattern): Promise<WinPattern>;
  
  // Learning Weights
  getLearningWeights(tenantId: string): Promise<LearningWeight[]>;
  createLearningWeight(weight: InsertLearningWeight): Promise<LearningWeight>;
  
  // Companies (Jacket System)
  getCompanies(tenantId: string): Promise<Company[]>;
  getCompany(id: string): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: string, updates: Partial<Company>): Promise<Company | undefined>;
  deleteCompany(id: string): Promise<void>;
  
  // Folder Sections
  getFolderSections(tenantId: string, jacketType?: string): Promise<FolderSection[]>;
  createFolderSection(section: InsertFolderSection): Promise<FolderSection>;
  
  // Jacket Folders
  getJacketFolders(tenantId: string, jacketType: string, jacketId: string): Promise<JacketFolder[]>;
  getJacketFolder(id: string): Promise<JacketFolder | undefined>;
  createJacketFolder(folder: InsertJacketFolder): Promise<JacketFolder>;
  
  // Jacket Documents
  getJacketDocuments(tenantId: string, folderId: string): Promise<JacketDocument[]>;
  getJacketDocument(id: string): Promise<JacketDocument | undefined>;
  createJacketDocument(doc: InsertJacketDocument): Promise<JacketDocument>;
  updateJacketDocument(id: string, updates: Partial<JacketDocument>): Promise<JacketDocument | undefined>;
  deleteJacketDocument(id: string): Promise<void>;
  getDocumentsByFolder(folderId: string): Promise<JacketDocument[]>;
  getDocumentsByJacket(jacketType: string, jacketId: string): Promise<JacketDocument[]>;
  getDocumentVersions(documentId: string): Promise<any[]>;
  createDocumentVersion(version: any): Promise<any>;
  searchDocuments(params: { query: string; jacketType?: string; jacketId?: string; documentType?: string }): Promise<JacketDocument[]>;
  
  // Audit Log
  createAuditLogEntry(entry: any): Promise<any>;
  getAuditLogByEntity(entityType: string, entityId: string): Promise<any[]>;
  getAuditLog(params: { entityType?: string; entityId?: string; action?: string; limit?: number; offset?: number }): Promise<any[]>;
  
  // Jacket Timeline
  getJacketTimeline(tenantId: string, jacketType: string, jacketId: string): Promise<JacketTimelineEntry[]>;
  createJacketTimelineEntry(entry: InsertJacketTimeline): Promise<JacketTimelineEntry>;
  
  // Bid RFIs
  getBidRfis(tenantId: string, bidProjectId: string): Promise<BidRfi[]>;
  getBidRfi(id: string): Promise<BidRfi | undefined>;
  getNextBidRfiNumber(tenantId: string, bidProjectId: string): Promise<number>;
  createBidRfi(rfi: InsertBidRfi): Promise<BidRfi>;
  updateBidRfi(id: string, updates: Partial<BidRfi>): Promise<BidRfi | undefined>;
  deleteBidRfi(id: string): Promise<void>;
  
  // Bid Addenda
  getBidAddenda(tenantId: string, bidProjectId: string): Promise<BidAddendum[]>;
  getBidAddendum(id: string): Promise<BidAddendum | undefined>;
  getNextBidAddendumNumber(tenantId: string, bidProjectId: string): Promise<number>;
  createBidAddendum(addendum: InsertBidAddendum): Promise<BidAddendum>;
  updateBidAddendum(id: string, updates: Partial<BidAddendum>): Promise<BidAddendum | undefined>;
  acknowledgeBidAddendum(id: string, acknowledgedBy: string): Promise<BidAddendum | undefined>;
  
  // Bid Checklists
  getBidChecklists(tenantId: string, bidProjectId: string): Promise<BidChecklist[]>;
  getBidChecklist(id: string): Promise<BidChecklist | undefined>;
  createBidChecklist(checklist: InsertBidChecklist): Promise<BidChecklist>;
  getBidChecklistItems(checklistId: string): Promise<BidChecklistItem[]>;
  getBidChecklistItem(id: string): Promise<BidChecklistItem | undefined>;
  createBidChecklistItem(item: InsertBidChecklistItem): Promise<BidChecklistItem>;
  updateBidChecklistItem(id: string, updates: Partial<BidChecklistItem>): Promise<BidChecklistItem | undefined>;

  // Blueprints & Takeoffs
  getBlueprints(tenantId: string): Promise<Blueprint[]>;
  getBlueprint(id: string): Promise<Blueprint | undefined>;
  createBlueprint(blueprint: InsertBlueprint): Promise<Blueprint>;
  deleteBlueprint(id: string): Promise<void>;
  getTakeoffItems(blueprintId: string): Promise<TakeoffItem[]>;
  getTakeoffItemsByProject(bidProjectId: string): Promise<TakeoffItem[]>;
  createTakeoffItem(item: InsertTakeoffItem): Promise<TakeoffItem>;
  updateTakeoffItem(id: string, updates: Partial<TakeoffItem>): Promise<TakeoffItem | undefined>;
  deleteTakeoffItem(id: string): Promise<void>;
  getBlueprintAnnotations(blueprintId: string, pageNumber?: number): Promise<BlueprintAnnotation[]>;
  createBlueprintAnnotation(annotation: InsertBlueprintAnnotation): Promise<BlueprintAnnotation>;
  deleteBlueprintAnnotation(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  // Tenants
  async getTenant(id: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant;
  }

  async createTenant(tenant: InsertTenant): Promise<Tenant> {
    const [created] = await db.insert(tenants).values(tenant).returning();
    return created;
  }

  // Opportunities
  async getOpportunities(tenantId: string, status?: string): Promise<Opportunity[]> {
    if (status) {
      return db.select().from(opportunities)
        .where(and(eq(opportunities.tenantId, tenantId), eq(opportunities.status, status)))
        .orderBy(desc(opportunities.createdAt));
    }
    return db.select().from(opportunities)
      .where(eq(opportunities.tenantId, tenantId))
      .orderBy(desc(opportunities.createdAt));
  }

  async getOpportunity(id: string): Promise<Opportunity | undefined> {
    const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, id));
    return opp;
  }

  async createOpportunity(opportunity: InsertOpportunity): Promise<Opportunity> {
    const [created] = await db.insert(opportunities).values(opportunity).returning();
    return created;
  }

  async updateOpportunity(id: string, updates: Partial<Opportunity>): Promise<Opportunity | undefined> {
    const [updated] = await db.update(opportunities)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(opportunities.id, id))
      .returning();
    return updated;
  }

  // Bid Projects
  async getBidProjects(tenantId: string): Promise<BidProject[]> {
    return db.select().from(bidProjects)
      .where(eq(bidProjects.tenantId, tenantId))
      .orderBy(desc(bidProjects.createdAt));
  }

  async getBidProject(id: string): Promise<BidProject | undefined> {
    const [project] = await db.select().from(bidProjects).where(eq(bidProjects.id, id));
    return project;
  }

  async createBidProject(project: InsertBidProject): Promise<BidProject> {
    const [created] = await db.insert(bidProjects).values(project).returning();
    return created;
  }

  async updateBidProject(id: string, updates: Partial<BidProject>): Promise<BidProject | undefined> {
    const [updated] = await db.update(bidProjects)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(bidProjects.id, id))
      .returning();
    return updated;
  }

  async createBidSubmission(submission: InsertBidSubmission): Promise<BidSubmission> {
    const [created] = await db.insert(bidSubmissions).values({
      ...submission,
      submittedAt: new Date(),
    }).returning();
    return created;
  }

  async getLatestBidSubmissionForBidProject(bidProjectId: string): Promise<BidSubmission | undefined> {
    const [latest] = await db
      .select()
      .from(bidSubmissions)
      .where(eq(bidSubmissions.bidProjectId, bidProjectId))
      .orderBy(desc(bidSubmissions.submittedAt))
      .limit(1);
    return latest;
  }

  // Bid Decisions
  async createBidDecision(decision: {
    tenantId: string;
    bidProjectId: string;
    decision: string;
    decidedBy?: string;
    rationaleJson?: any;
  }): Promise<any> {
    const [created] = await db.insert(bidDecisions).values({
      id: crypto.randomUUID(),
      tenantId: decision.tenantId,
      bidProjectId: decision.bidProjectId,
      decision: decision.decision,
      decidedBy: decision.decidedBy || null,
      rationaleJson: decision.rationaleJson,
    }).returning();
    return created;
  }

  // Projects
  async createProject(project: {
    tenantId: string;
    name: string;
    status?: string;
    description?: string;
    startDate?: Date;
    estimatedValue?: number;
    sourceBidId?: string;
    sourceOpportunityId?: string;
    metadataJson?: any;
  }): Promise<any> {
    const [created] = await db.insert(projects).values({
      id: crypto.randomUUID(),
      tenantId: project.tenantId,
      name: project.name,
      status: project.status || "active",
      description: project.description || null,
      startDate: project.startDate || null,
      estimatedValue: project.estimatedValue || null,
      metadataJson: project.metadataJson,
    } as any).returning();
    return created;
  }

  // Approval Requests
  async getApprovalRequests(tenantId: string, status?: string): Promise<ApprovalRequest[]> {
    if (status) {
      return db.select().from(approvalRequests)
        .where(and(eq(approvalRequests.tenantId, tenantId), eq(approvalRequests.status, status)))
        .orderBy(desc(approvalRequests.createdAt));
    }
    return db.select().from(approvalRequests)
      .where(eq(approvalRequests.tenantId, tenantId))
      .orderBy(desc(approvalRequests.createdAt));
  }

  async getApprovalRequest(id: string): Promise<ApprovalRequest | undefined> {
    const [request] = await db.select().from(approvalRequests).where(eq(approvalRequests.id, id));
    return request;
  }

  async createApprovalRequest(request: InsertApprovalRequest): Promise<ApprovalRequest> {
    const [created] = await db.insert(approvalRequests).values(request).returning();
    return created;
  }

  async updateApprovalRequest(id: string, updates: Partial<ApprovalRequest>): Promise<ApprovalRequest | undefined> {
    const [updated] = await db.update(approvalRequests)
      .set(updates)
      .where(eq(approvalRequests.id, id))
      .returning();
    return updated;
  }

  // Notifications
  async getNotifications(userId: string): Promise<Notification[]> {
    return db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [created] = await db.insert(notifications).values(notification).returning();
    return created;
  }

  async markNotificationRead(id: string): Promise<void> {
    await db.update(notifications)
      .set({ read: true })
      .where(eq(notifications.id, id));
  }

  // Audit Events
  async createAuditEvent(event: InsertAuditEvent): Promise<AuditEvent> {
    const [created] = await db.insert(auditEvents).values(event).returning();
    return created;
  }

  async getAuditEvents(entityType: string, entityId: string): Promise<AuditEvent[]> {
    return db.select().from(auditEvents)
      .where(and(eq(auditEvents.entityType, entityType), eq(auditEvents.entityId, entityId)))
      .orderBy(desc(auditEvents.createdAt));
  }

  // Jobs
  async createJob(job: InsertJob): Promise<Job> {
    const [created] = await db.insert(jobs).values(job).returning();
    return created;
  }

  async getNextPendingJob(): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs)
      .where(eq(jobs.status, "pending"))
      .orderBy(jobs.priority, jobs.createdAt)
      .limit(1);
    return job;
  }

  async updateJobStatus(id: string, status: string): Promise<void> {
    await db.update(jobs)
      .set({ status, startedAt: status === "running" ? new Date() : undefined })
      .where(eq(jobs.id, id));
  }

  // Conversations
  async getConversation(id: number): Promise<Conversation | undefined> {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conversation;
  }

  async getAllConversations(): Promise<Conversation[]> {
    return db.select().from(conversations).orderBy(desc(conversations.createdAt));
  }

  async createConversation(title: string): Promise<Conversation> {
    const [conversation] = await db.insert(conversations).values({ title }).returning();
    return conversation;
  }

  async deleteConversation(id: number): Promise<void> {
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  async getMessagesByConversation(conversationId: number): Promise<Message[]> {
    return db.select().from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
  }

  async createMessage(conversationId: number, role: string, content: string): Promise<Message> {
    const [message] = await db.insert(messages)
      .values({ conversationId, role, content })
      .returning();
    return message;
  }

  // Dashboard Stats
  async getDashboardStats(tenantId: string): Promise<any> {
    const WINNABLE_STATUSES = ['prospecting', 'qualified', 'estimating', 'submitted', 'negotiation', 'forecast', 'on_hold'];
    const ACTIVE_BID_STATUSES = ['initiated', 'capture', 'estimating', 'submitted', 'shortlisted'];
    const DEFAULT_PROBABILITY: Record<string, number> = {
      prospecting: 10, qualified: 30, estimating: 45, submitted: 55,
      negotiation: 70, forecast: 80, on_hold: 20, awarded: 100, lost: 0, dead: 0,
    };

    const [activeOppCount] = await db.select({ count: count() }).from(opportunities)
      .where(and(eq(opportunities.tenantId, tenantId), inArray(opportunities.statusNormalized, WINNABLE_STATUSES)));

    const [totalOppCount] = await db.select({ count: count() }).from(opportunities)
      .where(eq(opportunities.tenantId, tenantId));

    const [activeBidCount] = await db.select({ count: count() }).from(bidProjects)
      .where(and(eq(bidProjects.tenantId, tenantId), inArray(bidProjects.statusNormalized, ACTIVE_BID_STATUSES)));

    const [totalBidCount] = await db.select({ count: count() }).from(bidProjects)
      .where(eq(bidProjects.tenantId, tenantId));

    const [submittedBids] = await db.select({ count: count() }).from(bidProjects)
      .where(and(eq(bidProjects.tenantId, tenantId), eq(bidProjects.statusNormalized, "submitted")));

    const [wonBids] = await db.select({ count: count() }).from(bidProjects)
      .where(and(eq(bidProjects.tenantId, tenantId), eq(bidProjects.statusNormalized, "awarded")));

    const [approvalCount] = await db.select({ count: count() }).from(approvalRequests)
      .where(and(eq(approvalRequests.tenantId, tenantId), eq(approvalRequests.status, "pending")));

    const [urgentCount] = await db.select({ count: count() }).from(approvalRequests)
      .where(and(
        eq(approvalRequests.tenantId, tenantId),
        eq(approvalRequests.status, "pending"),
        eq(approvalRequests.priority, "high")
      ));

    const winnableOpps = await db.select({
      contractValue: opportunities.contractValue,
      statusNormalized: opportunities.statusNormalized,
      probability: opportunities.probability,
    }).from(opportunities)
      .where(and(eq(opportunities.tenantId, tenantId), inArray(opportunities.statusNormalized, WINNABLE_STATUSES)));

    const pipelineValue = winnableOpps.reduce((s, opp) => s + (Number(opp.contractValue) || 0), 0);
    const weightedPipelineValue = winnableOpps.reduce((s, opp) => {
      const val = Number(opp.contractValue) || 0;
      const prob = opp.probability ?? DEFAULT_PROBABILITY[opp.statusNormalized] ?? 10;
      return s + (val * prob / 100);
    }, 0);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [awardedThisMonth] = await db.select({ count: count() }).from(opportunities)
      .where(and(
        eq(opportunities.tenantId, tenantId),
        eq(opportunities.statusNormalized, "awarded"),
        gte(opportunities.awardedDate, monthStart)
      ));

    const now = new Date();
    const [atRiskCount] = await db.select({ count: count() }).from(opportunities)
      .where(and(
        eq(opportunities.tenantId, tenantId),
        inArray(opportunities.statusNormalized, WINNABLE_STATUSES),
        lt(opportunities.dueAt, now)
      ));

    const submittedCount = Number(submittedBids?.count || 0);
    const wonCount = Number(wonBids?.count || 0);
    const winRate = submittedCount > 0 ? Math.round((wonCount / submittedCount) * 100) : 0;

    const { getSnapshotDeltas } = await import("./services/metric-snapshot.service");
    const deltas = await getSnapshotDeltas(tenantId);

    const oppDelta = deltas.active_opportunities_count?.wow;
    const pipeDelta = deltas.pipeline_value?.qoq;

    return {
      opportunities: {
        active: Number(activeOppCount?.count || 0),
        total: Number(totalOppCount?.count || 0),
        trending: (oppDelta?.direction === "down") ? "down" : "up",
        change: oppDelta?.deltaPercent ?? 0,
        deltaLabel: oppDelta?.deltaLabel ?? null,
      },
      approvals: { pending: Number(approvalCount?.count || 0), urgent: Number(urgentCount?.count || 0) },
      bids: {
        active: Number(activeBidCount?.count || 0),
        total: Number(totalBidCount?.count || 0),
        submitted: submittedCount,
        winRate,
      },
      pipeline: {
        value: pipelineValue,
        weighted: weightedPipelineValue,
        change: pipeDelta?.deltaPercent ?? 0,
        deltaLabel: pipeDelta?.deltaLabel ?? null,
      },
      awardedThisMonth: Number(awardedThisMonth?.count || 0),
      atRisk: Number(atRiskCount?.count || 0),
      _definitions: {
        activeOpportunities: WINNABLE_STATUSES,
        activeBids: ACTIVE_BID_STATUSES,
        closedOpportunities: ['awarded', 'lost', 'dead'],
      },
    };
  }

  // Knowledge Documents
  async getKnowledgeDocuments(tenantId: string): Promise<KnowledgeDocument[]> {
    return db.select().from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.tenantId, tenantId))
      .orderBy(desc(knowledgeDocuments.createdAt));
  }

  async getKnowledgeDocumentById(id: string): Promise<KnowledgeDocument | undefined> {
    const [doc] = await db.select().from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.id, id));
    return doc;
  }

  async searchKnowledgeDocuments(tenantId: string, query: string, options?: { category?: string; limit?: number }): Promise<KnowledgeDocument[]> {
    const conditions = [
      eq(knowledgeDocuments.tenantId, tenantId),
      eq(knowledgeDocuments.status, "active"),
    ];
    
    if (options?.category) {
      conditions.push(eq(knowledgeDocuments.documentType, options.category));
    }
    
    const results = await db.select().from(knowledgeDocuments)
      .where(and(...conditions))
      .orderBy(desc(knowledgeDocuments.createdAt))
      .limit(options?.limit || 50);
    
    return results.filter((doc: KnowledgeDocument) => 
      doc.title?.toLowerCase().includes(query.toLowerCase()) ||
      doc.content?.toLowerCase().includes(query.toLowerCase()) ||
      doc.documentType?.toLowerCase().includes(query.toLowerCase())
    );
  }

  async createKnowledgeDocument(doc: InsertKnowledgeDocument): Promise<KnowledgeDocument> {
    const [created] = await db.insert(knowledgeDocuments).values(doc).returning();
    return created;
  }

  // Company Profile
  async getCompanyProfile(tenantId: string): Promise<CompanyProfileData | undefined> {
    const [profile] = await db.select().from(companyProfile)
      .where(eq(companyProfile.tenantId, tenantId));
    return profile;
  }

  async createCompanyProfile(profile: InsertCompanyProfile): Promise<CompanyProfileData> {
    const [created] = await db.insert(companyProfile).values(profile).returning();
    return created;
  }

  // Vendors
  async getVendors(tenantId: string): Promise<Vendor[]> {
    return db.select().from(vendors)
      .where(eq(vendors.tenantId, tenantId))
      .orderBy(vendors.companyName);
  }

  // Subcontractors
  async getSubcontractors(tenantId: string): Promise<Subcontractor[]> {
    return db.select().from(subcontractors)
      .where(eq(subcontractors.tenantId, tenantId))
      .orderBy(subcontractors.companyName);
  }

  async createSubcontractor(sub: InsertSubcontractor): Promise<Subcontractor> {
    const [created] = await db.insert(subcontractors).values(sub).returning();
    return created;
  }

  // Labor Rates
  async getLaborRates(tenantId: string): Promise<LaborRate[]> {
    return db.select().from(laborRates)
      .where(eq(laborRates.tenantId, tenantId))
      .orderBy(laborRates.laborCategory);
  }

  async createLaborRate(rate: InsertLaborRate): Promise<LaborRate> {
    const [created] = await db.insert(laborRates).values(rate).returning();
    return created;
  }

  // Win Patterns
  async getWinPatterns(tenantId: string): Promise<WinPattern[]> {
    return db.select().from(winPatterns)
      .where(eq(winPatterns.tenantId, tenantId))
      .orderBy(desc(winPatterns.confidence));
  }

  async createWinPattern(pattern: InsertWinPattern): Promise<WinPattern> {
    const [created] = await db.insert(winPatterns).values(pattern).returning();
    return created;
  }

  // Learning Weights
  async getLearningWeights(tenantId: string): Promise<LearningWeight[]> {
    return db.select().from(learningWeights)
      .where(eq(learningWeights.tenantId, tenantId))
      .orderBy(desc(learningWeights.weight));
  }

  async createLearningWeight(weight: InsertLearningWeight): Promise<LearningWeight> {
    const [created] = await db.insert(learningWeights).values(weight).returning();
    return created;
  }

  // Companies (Jacket System)
  async getCompanies(tenantId: string): Promise<Company[]> {
    return db.select().from(companies)
      .where(eq(companies.tenantId, tenantId))
      .orderBy(companies.name);
  }

  async getCompany(id: string): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company;
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    const [created] = await db.insert(companies).values(company).returning();
    return created;
  }

  async updateCompany(id: string, updates: Partial<Company>): Promise<Company | undefined> {
    const [updated] = await db.update(companies)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(companies.id, id))
      .returning();
    return updated;
  }

  async deleteCompany(id: string): Promise<void> {
    await db.delete(companies).where(eq(companies.id, id));
  }

  // Folder Sections
  async getFolderSections(tenantId: string, jacketType?: string): Promise<FolderSection[]> {
    if (jacketType) {
      return db.select().from(folderSections)
        .where(and(eq(folderSections.tenantId, tenantId), eq(folderSections.jacketType, jacketType)))
        .orderBy(folderSections.sortOrder);
    }
    return db.select().from(folderSections)
      .where(eq(folderSections.tenantId, tenantId))
      .orderBy(folderSections.sortOrder);
  }

  async createFolderSection(section: InsertFolderSection): Promise<FolderSection> {
    const [created] = await db.insert(folderSections).values(section).returning();
    return created;
  }

  // Jacket Folders
  async getJacketFolders(tenantId: string, jacketType: string, jacketId: string): Promise<JacketFolder[]> {
    return db.select().from(jacketFolders)
      .where(and(
        eq(jacketFolders.tenantId, tenantId),
        eq(jacketFolders.jacketType, jacketType),
        eq(jacketFolders.jacketId, jacketId)
      ))
      .orderBy(jacketFolders.sortOrder);
  }

  async getJacketFolder(id: string): Promise<JacketFolder | undefined> {
    const [folder] = await db.select().from(jacketFolders)
      .where(eq(jacketFolders.id, id));
    return folder;
  }

  async createJacketFolder(folder: InsertJacketFolder): Promise<JacketFolder> {
    const [created] = await db.insert(jacketFolders).values(folder).returning();
    return created;
  }

  // Jacket Documents
  async getJacketDocuments(tenantId: string, folderId: string): Promise<JacketDocument[]> {
    return db.select().from(jacketDocuments)
      .where(and(eq(jacketDocuments.tenantId, tenantId), eq(jacketDocuments.folderId, folderId)))
      .orderBy(desc(jacketDocuments.uploadedAt));
  }

  async getJacketDocument(id: string): Promise<JacketDocument | undefined> {
    const [doc] = await db.select().from(jacketDocuments).where(eq(jacketDocuments.id, id));
    return doc;
  }

  async createJacketDocument(doc: InsertJacketDocument): Promise<JacketDocument> {
    const [created] = await db.insert(jacketDocuments).values(doc).returning();
    return created;
  }

  async updateJacketDocument(id: string, updates: Partial<JacketDocument>): Promise<JacketDocument | undefined> {
    const [updated] = await db.update(jacketDocuments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(jacketDocuments.id, id))
      .returning();
    return updated;
  }

  async deleteJacketDocument(id: string): Promise<void> {
    await db.delete(jacketDocuments).where(eq(jacketDocuments.id, id));
  }

  async getDocumentsByFolder(folderId: string): Promise<JacketDocument[]> {
    return db.select().from(jacketDocuments)
      .where(eq(jacketDocuments.folderId, folderId))
      .orderBy(desc(jacketDocuments.uploadedAt));
  }

  async getDocumentsByJacket(jacketType: string, jacketId: string): Promise<JacketDocument[]> {
    // Documents are linked via folders, so we need to get folders first
    const folders = await this.getJacketFolders("blackhawk-default", jacketType, jacketId);
    if (folders.length === 0) return [];
    
    const folderIds = folders.map(f => f.id);
    const allDocs: JacketDocument[] = [];
    for (const fId of folderIds) {
      const docs = await this.getDocumentsByFolder(fId);
      allDocs.push(...docs);
    }
    return allDocs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }

  async getDocumentVersions(documentId: string): Promise<any[]> {
    // Get the document to start from
    const doc = await this.getJacketDocument(documentId);
    if (!doc) return [];
    
    const versions: any[] = [];
    const visited = new Set<string>();
    
    // Find the latest version first by following forward from this document
    let current: JacketDocument | null = doc;
    let latestDoc: JacketDocument = doc;
    
    // Find if there's a newer version pointing to this one
    while (true) {
      const newerVersions = await db.select().from(jacketDocuments)
        .where(eq(jacketDocuments.previousVersionId, latestDoc.id))
        .limit(1);
      if (newerVersions.length === 0) break;
      latestDoc = newerVersions[0];
    }
    
    // Now traverse backwards from latest using previousVersionId chain
    current = latestDoc;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      versions.push({
        id: current.id,
        version: current.version,
        uploadedAt: current.uploadedAt,
        uploadedBy: current.uploadedBy,
        storageKey: current.storageKey,
        fileSizeBytes: current.fileSizeBytes,
        latestVersion: current.latestVersion,
      });
      
      // Get previous version
      if (current.previousVersionId) {
        const prevDoc = await this.getJacketDocument(current.previousVersionId);
        current = prevDoc || null;
      } else {
        current = null;
      }
    }
    
    return versions;
  }

  async createDocumentVersion(newVersion: {
    documentId: string;
    storageKey: string;
    fileSizeBytes: number;
    changeNotes?: string;
    uploadedBy?: string;
  }): Promise<JacketDocument> {
    // Get original document
    const originalDoc = await this.getJacketDocument(newVersion.documentId);
    if (!originalDoc) {
      throw new Error("Original document not found");
    }
    
    // Mark original document as not-latest
    await db.update(jacketDocuments)
      .set({ latestVersion: false, updatedAt: new Date() })
      .where(eq(jacketDocuments.id, originalDoc.id));
    
    // Create new version document record
    const newDocId = crypto.randomUUID();
    const [newDoc] = await db.insert(jacketDocuments).values({
      id: newDocId,
      tenantId: originalDoc.tenantId,
      folderId: originalDoc.folderId,
      title: originalDoc.title,
      fileName: originalDoc.fileName,
      fileType: originalDoc.fileType,
      mimeType: originalDoc.mimeType,
      fileSizeBytes: newVersion.fileSizeBytes,
      storageKey: newVersion.storageKey,
      version: originalDoc.version + 1,
      latestVersion: true,
      previousVersionId: originalDoc.id,
      documentType: originalDoc.documentType,
      effectiveDate: originalDoc.effectiveDate,
      expirationDate: originalDoc.expirationDate,
      tagsJson: originalDoc.tagsJson,
      keywords: originalDoc.keywords,
      visibility: originalDoc.visibility,
      source: "manual",
      uploadedBy: newVersion.uploadedBy || null,
      status: "active",
    }).returning();
    
    return newDoc;
  }

  async searchDocuments(params: { query: string; jacketType?: string; jacketId?: string; documentType?: string }): Promise<JacketDocument[]> {
    const conditions = [];
    if (params.documentType) {
      conditions.push(eq(jacketDocuments.documentType, params.documentType));
    }
    if (params.query) {
      conditions.push(ilike(jacketDocuments.title, `%${params.query}%`));
    }
    
    if (conditions.length === 0) {
      return db.select().from(jacketDocuments).limit(100);
    }
    
    return db.select().from(jacketDocuments)
      .where(and(...conditions))
      .orderBy(desc(jacketDocuments.uploadedAt))
      .limit(100);
  }

  // Audit Log
  async createAuditLogEntry(entry: any): Promise<any> {
    const [created] = await db.insert(documentAuditLog).values({
      id: crypto.randomUUID(),
      tenantId: entry.tenantId || "blackhawk-default",
      documentId: entry.entityId || entry.documentId,
      action: entry.action,
      actorId: entry.actorId || null,
      actorName: entry.actorName || null,
      actorType: entry.actorType || "user",
      detailsJson: entry.details || entry.detailsJson,
    }).returning();
    return created;
  }

  async getAuditLogByEntity(entityType: string, entityId: string): Promise<any[]> {
    return db.select().from(documentAuditLog)
      .where(eq(documentAuditLog.documentId, entityId))
      .orderBy(desc(documentAuditLog.createdAt));
  }

  async getAuditLog(params: { entityType?: string; entityId?: string; action?: string; limit?: number; offset?: number }): Promise<any[]> {
    const conditions = [];
    if (params.entityId) {
      conditions.push(eq(documentAuditLog.documentId, params.entityId));
    }
    if (params.action) {
      conditions.push(eq(documentAuditLog.action, params.action));
    }
    
    let query = db.select().from(documentAuditLog);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return query
      .orderBy(desc(documentAuditLog.createdAt))
      .limit(params.limit || 50)
      .offset(params.offset || 0);
  }

  // Jacket Timeline
  async getJacketTimeline(tenantId: string, jacketType: string, jacketId: string): Promise<JacketTimelineEntry[]> {
    return db.select().from(jacketTimeline)
      .where(and(
        eq(jacketTimeline.tenantId, tenantId),
        eq(jacketTimeline.jacketType, jacketType),
        eq(jacketTimeline.jacketId, jacketId)
      ))
      .orderBy(desc(jacketTimeline.createdAt));
  }

  async createJacketTimelineEntry(entry: InsertJacketTimeline): Promise<JacketTimelineEntry> {
    const [created] = await db.insert(jacketTimeline).values(entry).returning();
    return created;
  }

  // Bid RFIs
  async getBidRfis(tenantId: string, bidProjectId: string): Promise<BidRfi[]> {
    return db.select().from(bidRfis)
      .where(and(eq(bidRfis.tenantId, tenantId), eq(bidRfis.bidProjectId, bidProjectId)))
      .orderBy(bidRfis.rfiNumber);
  }

  async getBidRfi(id: string): Promise<BidRfi | undefined> {
    const [rfi] = await db.select().from(bidRfis).where(eq(bidRfis.id, id));
    return rfi;
  }

  async getNextBidRfiNumber(tenantId: string, bidProjectId: string): Promise<number> {
    const result = await db.select({ maxNumber: sql<number>`COALESCE(MAX(${bidRfis.rfiNumber}), 0)` })
      .from(bidRfis)
      .where(and(eq(bidRfis.tenantId, tenantId), eq(bidRfis.bidProjectId, bidProjectId)));
    return (result[0]?.maxNumber || 0) + 1;
  }

  async createBidRfi(rfi: InsertBidRfi): Promise<BidRfi> {
    const [created] = await db.insert(bidRfis).values(rfi).returning();
    return created;
  }

  async updateBidRfi(id: string, updates: Partial<BidRfi>): Promise<BidRfi | undefined> {
    const [updated] = await db.update(bidRfis)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(bidRfis.id, id))
      .returning();
    return updated;
  }

  async deleteBidRfi(id: string): Promise<void> {
    await db.delete(bidRfis).where(eq(bidRfis.id, id));
  }

  // Bid Addenda
  async getBidAddenda(tenantId: string, bidProjectId: string): Promise<BidAddendum[]> {
    return db.select().from(bidAddenda)
      .where(and(eq(bidAddenda.tenantId, tenantId), eq(bidAddenda.bidProjectId, bidProjectId)))
      .orderBy(bidAddenda.addendumNumber);
  }

  async getBidAddendum(id: string): Promise<BidAddendum | undefined> {
    const [addendum] = await db.select().from(bidAddenda).where(eq(bidAddenda.id, id));
    return addendum;
  }

  async getNextBidAddendumNumber(tenantId: string, bidProjectId: string): Promise<number> {
    const result = await db.select({ maxNumber: sql<number>`COALESCE(MAX(${bidAddenda.addendumNumber}), 0)` })
      .from(bidAddenda)
      .where(and(eq(bidAddenda.tenantId, tenantId), eq(bidAddenda.bidProjectId, bidProjectId)));
    return (result[0]?.maxNumber || 0) + 1;
  }

  async createBidAddendum(addendum: InsertBidAddendum): Promise<BidAddendum> {
    const [created] = await db.insert(bidAddenda).values(addendum).returning();
    return created;
  }

  async updateBidAddendum(id: string, updates: Partial<BidAddendum>): Promise<BidAddendum | undefined> {
    const [updated] = await db.update(bidAddenda)
      .set(updates)
      .where(eq(bidAddenda.id, id))
      .returning();
    return updated;
  }

  async acknowledgeBidAddendum(id: string, acknowledgedBy: string): Promise<BidAddendum | undefined> {
    const [updated] = await db.update(bidAddenda)
      .set({ 
        acknowledged: true, 
        acknowledgedAt: new Date(),
        acknowledgedBy 
      })
      .where(eq(bidAddenda.id, id))
      .returning();
    return updated;
  }

  // Bid Checklists
  async getBidChecklists(tenantId: string, bidProjectId: string): Promise<BidChecklist[]> {
    return db.select().from(bidChecklists)
      .where(and(eq(bidChecklists.tenantId, tenantId), eq(bidChecklists.bidProjectId, bidProjectId)))
      .orderBy(bidChecklists.sortOrder);
  }

  async getBidChecklist(id: string): Promise<BidChecklist | undefined> {
    const [checklist] = await db.select().from(bidChecklists).where(eq(bidChecklists.id, id));
    return checklist;
  }

  async createBidChecklist(checklist: InsertBidChecklist): Promise<BidChecklist> {
    const [created] = await db.insert(bidChecklists).values(checklist).returning();
    return created;
  }

  async getBidChecklistItems(checklistId: string): Promise<BidChecklistItem[]> {
    return db.select().from(bidChecklistItems)
      .where(eq(bidChecklistItems.checklistId, checklistId))
      .orderBy(bidChecklistItems.sortOrder);
  }

  async getBidChecklistItem(id: string): Promise<BidChecklistItem | undefined> {
    const [item] = await db.select().from(bidChecklistItems).where(eq(bidChecklistItems.id, id));
    return item;
  }

  async createBidChecklistItem(item: InsertBidChecklistItem): Promise<BidChecklistItem> {
    const [created] = await db.insert(bidChecklistItems).values(item).returning();
    return created;
  }

  async updateBidChecklistItem(id: string, updates: Partial<BidChecklistItem>): Promise<BidChecklistItem | undefined> {
    const [updated] = await db.update(bidChecklistItems)
      .set(updates)
      .where(eq(bidChecklistItems.id, id))
      .returning();
    return updated;
  }

  // Blueprints & Takeoffs
  async getBlueprints(tenantId: string): Promise<Blueprint[]> {
    return db.select().from(blueprints)
      .where(eq(blueprints.tenantId, tenantId))
      .orderBy(desc(blueprints.uploadedAt));
  }

  async getBlueprint(id: string): Promise<Blueprint | undefined> {
    const [bp] = await db.select().from(blueprints).where(eq(blueprints.id, id));
    return bp;
  }

  async createBlueprint(blueprint: InsertBlueprint): Promise<Blueprint> {
    const [created] = await db.insert(blueprints).values(blueprint).returning();
    return created;
  }

  async deleteBlueprint(id: string): Promise<void> {
    await db.delete(blueprints).where(eq(blueprints.id, id));
  }

  async getTakeoffItems(blueprintId: string): Promise<TakeoffItem[]> {
    return db.select().from(takeoffItems)
      .where(eq(takeoffItems.blueprintId, blueprintId))
      .orderBy(takeoffItems.createdAt);
  }

  async getTakeoffItemsByProject(bidProjectId: string): Promise<TakeoffItem[]> {
    return db.select().from(takeoffItems)
      .where(eq(takeoffItems.bidProjectId, bidProjectId))
      .orderBy(takeoffItems.createdAt);
  }

  async createTakeoffItem(item: InsertTakeoffItem): Promise<TakeoffItem> {
    const [created] = await db.insert(takeoffItems).values(item).returning();
    return created;
  }

  async updateTakeoffItem(id: string, updates: Partial<TakeoffItem>): Promise<TakeoffItem | undefined> {
    const [updated] = await db.update(takeoffItems)
      .set(updates)
      .where(eq(takeoffItems.id, id))
      .returning();
    return updated;
  }

  async deleteTakeoffItem(id: string): Promise<void> {
    await db.delete(takeoffItems).where(eq(takeoffItems.id, id));
  }

  async getBlueprintAnnotations(blueprintId: string, pageNumber?: number): Promise<BlueprintAnnotation[]> {
    const conditions = [eq(blueprintAnnotations.blueprintId, blueprintId)];
    if (pageNumber !== undefined) {
      conditions.push(eq(blueprintAnnotations.pageNumber, pageNumber));
    }
    return db.select().from(blueprintAnnotations)
      .where(and(...conditions))
      .orderBy(blueprintAnnotations.createdAt);
  }

  async createBlueprintAnnotation(annotation: InsertBlueprintAnnotation): Promise<BlueprintAnnotation> {
    const [created] = await db.insert(blueprintAnnotations).values(annotation).returning();
    return created;
  }

  async deleteBlueprintAnnotation(id: string): Promise<void> {
    await db.delete(blueprintAnnotations).where(eq(blueprintAnnotations.id, id));
  }
}

export const storage = new DatabaseStorage();
