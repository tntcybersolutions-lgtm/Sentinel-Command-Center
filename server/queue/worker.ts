import { queueService, JobPayload } from "./queue.service";
import { createSamGovIngestionService } from "../integrations/samgov/samgov.client";
import { scoringService } from "../services/scoring.service";
import { digestService } from "../services/digest.service";
import { commsService } from "../services/comms.service";
import { db } from "../db";
import { fitProfiles, scoringModels, opportunities, sequenceEnrollments } from "@shared/schema";
import { eq, and, lte } from "drizzle-orm";

type JobHandler = (payload: JobPayload) => Promise<void>;

const JOB_HANDLERS: Record<string, JobHandler> = {
  samgov_ingest: async (payload) => {
    const tenantId = payload.tenantId as string;
    const service = await createSamGovIngestionService(tenantId);
    
    if (!service) {
      console.log("SAM.gov API key not configured, skipping ingestion");
      return;
    }

    const stats = await service.runIngestion();
    console.log(`SAM.gov ingestion complete: ${stats.created} created, ${stats.updated} updated, ${stats.errors} errors`);
  },

  herbie_autonomous: async (payload) => {
    const tenantId = payload.tenantId as string;
    const { getHerbieAutonomousAgent } = await import("../agents/herbie.autonomous");
    const herbie = getHerbieAutonomousAgent(tenantId);
    
    const stats = await herbie.runAutonomousCycle();
    console.log(`[HERBIE] Autonomous cycle complete: ${stats.evaluated} evaluated, ${stats.approvalRequests} approval requests, ${stats.projectsCreated} projects created`);
  },

  opportunity_score: async (payload) => {
    const { tenantId, opportunityId } = payload as { tenantId: string; opportunityId: string };
    
    const [activeProfile] = await db.select()
      .from(fitProfiles)
      .where(and(eq(fitProfiles.tenantId, tenantId), eq(fitProfiles.enabled, true)))
      .limit(1);

    const [activeModel] = await db.select()
      .from(scoringModels)
      .where(and(eq(scoringModels.tenantId, tenantId), eq(scoringModels.active, true)))
      .limit(1);

    if (!activeProfile || !activeModel) {
      console.log(`No active fit profile or scoring model for tenant ${tenantId}`);
      return;
    }

    const result = await scoringService.scoreOpportunity(
      tenantId,
      opportunityId,
      activeProfile.id,
      activeModel.id
    );

    console.log(`Scored opportunity ${opportunityId}: ${result.score} - ${result.recommendedAction}`);
  },

  daily_digest: async (payload) => {
    const tenantId = payload.tenantId as string;
    const digest = await digestService.generateExecutiveDigest(tenantId);
    
    console.log(`Generated daily digest for tenant ${tenantId}:`);
    console.log(`  - Pipeline value: $${digest.summary.pipelineValue.toLocaleString()}`);
    console.log(`  - Active opportunities: ${digest.summary.activeOpportunities}`);
    console.log(`  - Pending approvals: ${digest.summary.pendingApprovals}`);
    console.log(`  - Exceptions: ${digest.exceptions.length}`);
  },

  deadline_monitor: async (payload) => {
    const tenantId = payload.tenantId as string;
    await digestService.monitorDeadlines(tenantId);
    console.log(`Deadline monitoring complete for tenant ${tenantId}`);
  },

  send_email: async (payload) => {
    const { messageId, senderUserId } = payload as { messageId: string; senderUserId: string };
    console.log(`Sending email ${messageId} from user ${senderUserId}`);
  },

  create_calendar_event: async (payload) => {
    const { eventId } = payload as { eventId: string };
    console.log(`Creating calendar event ${eventId} in Outlook`);
  },

  generate_bid_draft: async (payload) => {
    const { tenantId, bidProjectId, artifactType } = payload as { 
      tenantId: string; 
      bidProjectId: string; 
      artifactType: string;
    };
    console.log(`Generating ${artifactType} for bid project ${bidProjectId}`);
  },

  followup_sequence: async (payload) => {
    const tenantId = payload.tenantId as string;
    
    const dueEnrollments = await db.select()
      .from(sequenceEnrollments)
      .where(and(
        eq(sequenceEnrollments.tenantId, tenantId),
        eq(sequenceEnrollments.status, "active"),
        lte(sequenceEnrollments.nextStepAt, new Date())
      ));

    for (const enrollment of dueEnrollments) {
      try {
        await commsService.processSequenceStep(enrollment.id);
        console.log(`Processed sequence step for enrollment ${enrollment.id}`);
      } catch (error) {
        console.error(`Failed to process sequence step for enrollment ${enrollment.id}:`, error);
      }
    }
  },

  sync_documents: async (payload) => {
    const { tenantId, workspaceId } = payload as { tenantId: string; workspaceId: string };
    console.log(`Syncing documents for workspace ${workspaceId}`);
  },

  document_ingestion: async (payload) => {
    const { tenantId, bidProjectId, projectId } = payload as { tenantId: string; bidProjectId: string; projectId?: string };
    const { runFullIngestion } = await import("../services/ingestion-pipeline.service");
    const result = await runFullIngestion(tenantId, bidProjectId, projectId);
    console.log(`[document_ingestion] Run complete for bid project ${bidProjectId}: discovered=${result.discovered}, downloaded=${result.downloaded}, filed=${result.filed}, failed=${result.failed}`);
  },

  document_ingestion_retry: async (payload) => {
    const { tenantId, artifactId } = payload as { tenantId: string; artifactId: string };
    const { retryArtifact } = await import("../services/ingestion-pipeline.service");
    const result = await retryArtifact(tenantId, artifactId);
    console.log(`[document_ingestion_retry] Artifact ${artifactId}: ${result.success ? 'success' : 'failed'} ${result.error ?? ''}`);
  },

  document_ingestion_cycle: async (payload) => {
    const tenantId = (payload.tenantId as string) || "blackhawk-default";
    const { runDocumentIngestionCycle } = await import("../workers/documentIngestion.worker");
    const result = await runDocumentIngestionCycle({ tenantId });
    if ((result as any).skipped) {
      console.log(`[document_ingestion_cycle] Skipped: lock held by another instance`);
    } else {
      console.log(`[document_ingestion_cycle] Cycle complete: processed=${(result as any).processed ?? 0}, ok=${(result as any).okCount ?? 0}, failed=${(result as any).failCount ?? 0}`);
    }
  },

  ciobot_analysis: async (payload) => {
    const tenantId = payload.tenantId as string;
    const { CioBotAgent } = await import("../agents/cio-bot.agent");
    const cioBot = new CioBotAgent(tenantId);
    
    // Get opportunities that have been scored by HERBIE but not analyzed by CIO-Bot
    const { opportunityScores, pwinAnalyses, opportunities: oppsTable } = await import("@shared/schema");
    const { db: database } = await import("../db");
    const { eq, and, sql } = await import("drizzle-orm");
    
    const scoredOpps = await database.select({ opportunityId: opportunityScores.opportunityId })
      .from(opportunityScores)
      .where(eq(opportunityScores.tenantId, tenantId));
    
    const analyzedOpps = await database.select({ opportunityId: pwinAnalyses.opportunityId })
      .from(pwinAnalyses)
      .where(eq(pwinAnalyses.tenantId, tenantId));
    
    const analyzedIds = new Set(analyzedOpps.map(a => a.opportunityId));
    const needsAnalysis = scoredOpps.filter(s => !analyzedIds.has(s.opportunityId));
    
    let analyzed = 0;
    for (const opp of needsAnalysis.slice(0, 10)) { // Limit to 10 per cycle
      try {
        await cioBot.analyzeOpportunity(opp.opportunityId);
        analyzed++;
      } catch (error) {
        console.error(`CIO-Bot analysis failed for ${opp.opportunityId}:`, error);
      }
    }
    
    console.log(`[CIO-Bot] Analysis cycle complete: ${analyzed} opportunities analyzed`);
  },

  legalops_compliance: async (payload) => {
    const tenantId = payload.tenantId as string;
    const { LegalOpsAgent } = await import("../agents/legalops.agent");
    const legalOps = new LegalOpsAgent(tenantId);
    
    // Check compliance for opportunities in bid_in_progress status
    const { opportunities: oppsTable, complianceRequirements } = await import("@shared/schema");
    const { db: database } = await import("../db");
    const { eq, and, sql } = await import("drizzle-orm");
    
    const bidsInProgress = await database.select({ id: oppsTable.id })
      .from(oppsTable)
      .where(and(
        eq(oppsTable.tenantId, tenantId),
        eq(oppsTable.status, "bid_in_progress")
      ));
    
    const checkedOpps = await database.select({ opportunityId: complianceRequirements.opportunityId })
      .from(complianceRequirements)
      .where(eq(complianceRequirements.tenantId, tenantId));
    
    const checkedIds = new Set(checkedOpps.map(c => c.opportunityId));
    const needsCheck = bidsInProgress.filter(b => !checkedIds.has(b.id));
    
    let checked = 0;
    for (const opp of needsCheck.slice(0, 5)) { // Limit to 5 per cycle
      try {
        await legalOps.analyzeOpportunityCompliance(opp.id);
        checked++;
      } catch (error) {
        console.error(`LegalOps compliance check failed for ${opp.id}:`, error);
      }
    }
    
    console.log(`[LegalOps] Compliance cycle complete: ${checked} opportunities checked`);
  },

  foreman_monitor: async (payload) => {
    const tenantId = payload.tenantId as string;
    const { ForemanBotAgent } = await import("../agents/foreman-bot.agent");
    const foremanBot = new ForemanBotAgent(tenantId);
    
    // Check for awards on submitted bids
    const awardResults = await foremanBot.checkForAwards();
    const awardsFound = awardResults.filter(r => r.awardFound).length;
    const ourAwards = awardResults.filter(r => r.isOurAward).length;
    
    // Check for amendments on active opportunities
    const amendmentResults = await foremanBot.checkForAmendments();
    
    console.log(`[Foreman-Bot] Monitor cycle complete: ${awardsFound} awards found (${ourAwards} ours), ${amendmentResults.length} amendments detected`);
  },

  doc_ai_process: async (payload) => {
    const tenantId = payload.tenantId as string;
    const { createDocumentIntelligenceService, getBatchProcessingState } = await import("../services/document-intelligence.service");
    
    // Skip if batch processing is already running
    const batchState = getBatchProcessingState();
    if (batchState.isProcessing) {
      console.log(`[DocAI] Batch processing already in progress, skipping scheduled job`);
      return;
    }
    
    const service = createDocumentIntelligenceService(tenantId);
    
    // Queue and process a small batch of documents
    const queued = await service.queueDocumentsForProcessing(20);
    if (queued === 0) {
      console.log(`[DocAI] No documents pending AI processing`);
      return;
    }
    
    const results = await service.processQueue(10);
    console.log(`[DocAI] Scheduled processing complete: ${results.processed} processed, ${results.failed} failed, ${queued} queued`);
  },

  compliance_expiry_check: async (payload) => {
    const tenantId = payload.tenantId as string;
    const { alertsService } = await import("../services/alerts.service");
    
    const result = await alertsService.checkComplianceExpiry(tenantId);
    console.log(`[Alerts] Compliance expiry check complete: ${result.checked} documents checked, ${result.alertsCreated} alerts created`);
  },

  duplicate_detection: async (payload) => {
    const tenantId = payload.tenantId as string;
    const documentId = payload.documentId as string;
    const contentHash = payload.contentHash as string;
    
    if (!documentId || !contentHash) {
      console.log(`[Alerts] Duplicate detection skipped: missing documentId or contentHash`);
      return;
    }
    
    const { alertsService } = await import("../services/alerts.service");
    
    const result = await alertsService.detectDuplicates(tenantId, documentId, contentHash);
    console.log(`[Alerts] Duplicate detection complete: ${result.duplicatesFound} duplicates found`);
  },

  egnyte_delta_sync: async (payload) => {
    const { egnyteSyncService } = await import("../services/egnyte-sync.service");
    const { getDocumentStorage } = await import("../connectors/document-storage.connector");
    
    // Check if Egnyte is connected
    const provider = getDocumentStorage();
    if (!await provider.isConnected()) {
      console.log(`[EgnyteSync] Delta sync skipped: Egnyte not connected`);
      return;
    }
    
    // Run delta sync to capture changes
    const result = await egnyteSyncService.triggerDeltaSync();
    
    if (result.triggered) {
      console.log(`[EgnyteSync] Delta sync triggered successfully (ID: ${result.syncId})`);
    } else {
      console.log(`[EgnyteSync] Delta sync failed: ${result.error}`);
    }
  },

  jacket_integrity_sweep: async (payload) => {
    const tenantId = payload.tenantId as string;
    const { jacketService } = await import("../services/jacket.service");
    const { bidProjects } = await import("@shared/schema");
    const { db: database } = await import("../db");
    const { gte } = await import("drizzle-orm");

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { or } = await import("drizzle-orm");
    const recentBids = await database
      .select({ id: bidProjects.id })
      .from(bidProjects)
      .where(or(
        gte(bidProjects.updatedAt, thirtyDaysAgo),
        gte(bidProjects.createdAt, thirtyDaysAgo)
      ));

    let healed = 0;
    let healthy = 0;
    let failed = 0;

    for (const bid of recentBids) {
      try {
        const result = await jacketService.ensureCanonicalBidJacket(tenantId, bid.id);
        if (result.createdFolders > 0 || result.renamedFolders > 0) {
          healed++;
        } else {
          healthy++;
        }
      } catch (e: any) {
        failed++;
        console.error(`[jacket-sweep] Failed to heal bid ${bid.id}: ${e.message}`);
      }
    }

    console.log(`[jacket-sweep] tenant=${tenantId} scanned=${recentBids.length} healthy=${healthy} healed=${healed} failed=${failed}`);
  },

  storage_orphan_sweep: async (payload) => {
    const tenantId = payload.tenantId as string;
    const { jacketDocuments } = await import("@shared/schema");
    const { db: database } = await import("../db");
    const drizzleOps = await import("drizzle-orm");

    const docs = await database
      .select({ id: jacketDocuments.id, storageKey: jacketDocuments.storageKey, storageMissing: jacketDocuments.storageMissing })
      .from(jacketDocuments)
      .where(drizzleOps.and(
        drizzleOps.eq(jacketDocuments.tenantId, tenantId),
        drizzleOps.or(
          drizzleOps.eq(jacketDocuments.storageMissing, false),
          drizzleOps.isNull(jacketDocuments.storageMissing)
        )
      ));

    let checked = 0;
    let markedMissing = 0;
    let errors = 0;

    const { ObjectStorageService } = await import("../replit_integrations/object_storage");
    const storageService = new ObjectStorageService();

    for (const doc of docs) {
      checked++;
      try {
        await storageService.getObjectEntityFile(doc.storageKey);
      } catch (objErr: any) {
        if (objErr?.name === "ObjectNotFoundError") {
          markedMissing++;
          await database
            .update(jacketDocuments)
            .set({ storageMissing: true, storageCheckedAt: new Date() })
            .where(drizzleOps.eq(jacketDocuments.id, doc.id));
          console.log(`[orphan-sweep] marked missing docId=${doc.id} storageKey=${doc.storageKey}`);
        } else {
          errors++;
        }
      }
    }

    console.log(`[orphan-sweep] tenant=${tenantId} checked=${checked} markedMissing=${markedMissing} errors=${errors}`);
  },
};

class Worker {
  private running = false;
  private workerId: string;
  private pollInterval = 1000;

  constructor() {
    this.workerId = `worker-${process.pid}-${Date.now()}`;
  }

  async start(): Promise<void> {
    if (this.running) {
      console.log("Worker already running");
      return;
    }

    this.running = true;
    console.log(`Worker ${this.workerId} started`);

    this.poll();
  }

  async stop(): Promise<void> {
    this.running = false;
    console.log(`Worker ${this.workerId} stopping...`);
  }

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        const job = await queueService.dequeue(this.workerId);

        if (job) {
          await this.processJob(job);
        } else {
          await this.sleep(this.pollInterval);
        }
      } catch (error) {
        console.error("Worker poll error:", error);
        await this.sleep(this.pollInterval * 2);
      }
    }
  }

  private async processJob(job: { id: string; jobType: string; payload: JobPayload }): Promise<void> {
    const handler = JOB_HANDLERS[job.jobType];

    if (!handler) {
      console.error(`No handler for job type: ${job.jobType}`);
      await queueService.fail(job.id, this.workerId, new Error(`Unknown job type: ${job.jobType}`));
      return;
    }

    try {
      console.log(`Processing job ${job.id} (${job.jobType})`);
      await handler(job.payload);
      await queueService.complete(job.id, this.workerId);
    } catch (error) {
      console.error(`Job ${job.id} failed:`, error);
      await queueService.fail(job.id, this.workerId, error as Error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const worker = new Worker();
