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

  // Roadmap Feature 3 — daily COI expiry monitor.
  //   1. Pulls every active COI expiring within 30 days.
  //   2. For each COI whose days_until_expiry lands EXACTLY on
  //      30 / 14 / 7 / 1, drops a notification (type='coi_expiry_alert')
  //      keyed by entity_id=coiId. The notifications table has no
  //      uniqueness on (type,entityId,date), so we add a same-day
  //      idempotency guard against the notifications row to avoid
  //      duplicate alerts when the worker re-runs intra-day.
  //   3. At the 14-day threshold ONLY, also drops a
  //      draft_external_message approval_request whose contextJson
  //      carries a pre-populated renewal email body. The PM approves
  //      the draft and the existing outbound dispatcher handles the
  //      send (Phase 1: still human-gated — no auto-send).
  coi_expiry_monitor: async (payload) => {
    const tenantId = payload.tenantId as string;
    const { getExpiringCOIs, markExpired } = await import("../services/coi.service");
    const { db: workerDb } = await import("../db");
    const { notifications, vendors, approvalRequests, agentActivities, coiCertificates } =
      await import("@shared/schema");
    const { and: andOp, eq: eqOp, gte: gteOp, lt: ltOp } = await import("drizzle-orm");

    // Day window used for idempotency + the markExpired sweep cutoff.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // ── markExpired sweep ─────────────────────────────────────────
    // Any active COI whose expiry_date is already in the past gets
    // flipped to status='expired' so subsequent listings/rollups
    // reflect reality. This runs BEFORE the alert pass so we don't
    // also send a "0 days left" alert on a row we just expired.
    const pastDue = await workerDb
      .select({ id: coiCertificates.id, vendorId: coiCertificates.vendorId })
      .from(coiCertificates)
      .where(andOp(
        eqOp(coiCertificates.tenantId, tenantId),
        eqOp(coiCertificates.status, "active"),
        ltOp(coiCertificates.expiryDate, startOfToday),
      ));
    let expiredCount = 0;
    for (const row of pastDue) {
      const updated = await markExpired(tenantId, row.id);
      if (updated) expiredCount++;
    }
    if (expiredCount > 0) {
      console.log(
        `[CoiMonitor] Marked ${expiredCount} past-due COIs as expired for tenant ${tenantId}`,
      );
    }

    // ── Threshold-alert pass ──────────────────────────────────────
    const cois = await getExpiringCOIs(tenantId, 30);
    if (cois.length === 0) {
      console.log(`[CoiMonitor] No COIs expiring within 30 days for tenant ${tenantId}`);
      return;
    }

    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const ALERT_THRESHOLDS = new Set([30, 14, 7, 1]);
    let notificationsCreated = 0;
    let approvalDraftsCreated = 0;

    for (const coi of cois) {
      if (!coi.expiryDate) continue;
      const daysUntilExpiry = Math.ceil(
        (new Date(coi.expiryDate).getTime() - now) / MS_PER_DAY,
      );
      if (!ALERT_THRESHOLDS.has(daysUntilExpiry)) continue;

      // Idempotency (per spec): check agent_activities for a prior
      // fire of monitor_id='coi-expiry' on this COI today. One log
      // row covers BOTH the notification and the 14-day draft so the
      // entire iteration is short-circuited if we've already run
      // today. Marker lives in inputJson.monitor_id so we can grep
      // historical activity without schema changes.
      const priorFire = await workerDb
        .select({ id: agentActivities.id })
        .from(agentActivities)
        .where(andOp(
          eqOp(agentActivities.tenantId, tenantId),
          eqOp(agentActivities.agentName, "herbie"),
          eqOp(agentActivities.actionType, "monitor"),
          eqOp(agentActivities.entityType, "coi_certificate"),
          eqOp(agentActivities.entityId, coi.id),
          gteOp(agentActivities.createdAt, startOfToday),
        ))
        .limit(1);
      if (priorFire.length > 0) continue;

      // Resolve vendor display name + email (best-effort, tenant-scoped
      // to prevent cross-tenant lookup if vendorId ever collides).
      let vendorName = "Vendor";
      let vendorEmail = "vendor@example.com";
      if (coi.vendorId) {
        const [v] = await workerDb
          .select({ companyName: vendors.companyName, email: vendors.email })
          .from(vendors)
          .where(andOp(eqOp(vendors.tenantId, tenantId), eqOp(vendors.id, coi.vendorId)))
          .limit(1);
        if (v) {
          vendorName = v.companyName ?? vendorName;
          vendorEmail = v.email ?? vendorEmail;
        }
      }

      const message = `${vendorName} COI expires in ${daysUntilExpiry} ${daysUntilExpiry === 1 ? "day" : "days"}`;
      const priority = daysUntilExpiry <= 1 ? "urgent" : daysUntilExpiry <= 7 ? "high" : "normal";
      const draftEnabled = daysUntilExpiry === 14;

      // Build the 14-day renewal draft payload up-front so the
      // transaction body stays linear.
      let approvalValues: typeof approvalRequests.$inferInsert | null = null;
      if (draftEnabled) {
        const expiryHuman = new Date(coi.expiryDate).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });
        const policyTypeLabel = coi.policyType.toUpperCase();
        const renewalBody =
          `Hi ${vendorName} team,\n\n` +
          `Our records show your ${policyTypeLabel} certificate of insurance ` +
          `(policy ${coi.policyNumber ?? "[number]"}) is set to expire on ${expiryHuman}.\n\n` +
          `Please send us a renewed COI naming BlackHawk Construction as additional insured ` +
          `at your earliest convenience so we don't lose access to the jobsite.\n\n` +
          `Reply to this email or upload directly to our vendor portal.\n\n` +
          `Thanks,\nBlackHawk PM`;

        approvalValues = {
          tenantId,
          entityType: "coi_certificate",
          entityId: coi.id,
          actionType: "draft_external_message",
          requestedBy: "herbie",
          status: "pending",
          priority: "high",
          contextJson: {
            recipient: vendorEmail,
            channel: "email",
            subject: `Renewal needed: ${policyTypeLabel} COI expiring ${expiryHuman}`,
            body: renewalBody,
            coiId: coi.id,
            projectId: coi.projectId ?? null,
            vendorId: coi.vendorId ?? null,
            vendorName,
            policyType: coi.policyType,
            expiryDate: coi.expiryDate,
            triggeredBy: "coi_expiry_monitor",
            daysUntilExpiry,
          },
        };
      }

      // Atomic per-COI commit: notification + (optional) approval +
      // ledger row all succeed or all roll back. If the worker is
      // retried mid-iteration, the priorFire check above will only
      // short-circuit once a complete iteration has been persisted —
      // partial writes can no longer create orphan notifications.
      try {
        await workerDb.transaction(async (tx) => {
          await tx.insert(notifications).values({
            tenantId,
            userId: null,
            type: "coi_expiry_alert",
            title: `COI expiring in ${daysUntilExpiry} ${daysUntilExpiry === 1 ? "day" : "days"}`,
            message,
            entityType: "coi_certificate",
            entityId: coi.id,
            priority,
            read: false,
            actionUrl: coi.projectId ? `/projects/${coi.projectId}/cockpit` : `/coi`,
          });

          if (approvalValues) {
            await tx.insert(approvalRequests).values(approvalValues);
          }

          // Mark this (coi, day) window as fired so the next intra-day
          // worker pass short-circuits at the priorFire check above.
          // The monitor_id marker lives in inputJson per spec.
          await tx.insert(agentActivities).values({
            tenantId,
            agentName: "herbie",
            actionType: "monitor",
            entityType: "coi_certificate",
            entityId: coi.id,
            description: `coi-expiry monitor fired at ${daysUntilExpiry}d threshold`,
            inputJson: {
              monitor_id: "coi-expiry",
              window_date: startOfToday.toISOString().slice(0, 10),
              days_until_expiry: daysUntilExpiry,
            },
            outputJson: {
              notification: true,
              draft: draftEnabled,
              vendor_name: vendorName,
            },
            status: "success",
          });
        });
        notificationsCreated++;
        if (draftEnabled) approvalDraftsCreated++;
      } catch (txErr) {
        console.error(
          `[CoiMonitor] tenant=${tenantId} coi=${coi.id} transaction failed; will retry next run:`,
          txErr instanceof Error ? txErr.message : txErr,
        );
        // Don't rethrow — keep iterating other COIs. The job-queue
        // retry semantics + tomorrow's run will pick this one up.
      }
    }

    console.log(
      `[CoiMonitor] tenant=${tenantId} expired=${expiredCount} scanned=${cois.length} notifications=${notificationsCreated} drafts=${approvalDraftsCreated}`,
    );
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

  // ────────────────────────────────────────────────────────────────
  // Roadmap Feature 12 — daily monitor jobs.
  //
  // Each handler walks a small slice of project state, decides which
  // entities cross a threshold today, and drops one notification row
  // per entity per (monitor_id, entity_id, window_date) tuple. The
  // unique index on monitor_events makes the insert the idempotency
  // primitive — we attempt it inside a transaction with the
  // notification, and if the insert fails on conflict we know the
  // notification was already sent and skip cleanly. This keeps a
  // recovery re-run (or a manual scheduler bump) from double-firing.
  // ────────────────────────────────────────────────────────────────
  submittal_overdue_monitor: async (payload) => {
    await runDailyMonitor("submittal_overdue", payload.tenantId as string, async (ctx) => {
      const { submittals } = await import("@shared/schema");
      const { db: workerDb } = await import("../db");
      const { and: andOp, eq: eqOp, lt: ltOp, isNotNull, ne } = await import("drizzle-orm");
      // For Phase 1 we treat any non-approved submittal whose
      // submittedAt is older than 14 days as "overdue". The schema
      // doesn't carry a reviewer dueDate; this is a sane heuristic
      // that matches what the demo wants to surface and can be
      // tightened later without an interface change.
      const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const rows = await workerDb
        .select({
          id: submittals.id,
          name: submittals.name,
          submittalNumber: submittals.submittalNumber,
          projectId: submittals.projectId,
        })
        .from(submittals)
        .where(andOp(
          eqOp(submittals.tenantId, ctx.tenantId),
          ne(submittals.status, "approved"),
          isNotNull(submittals.submittedAt),
          ltOp(submittals.submittedAt, cutoff),
        ));
      for (const r of rows) {
        await ctx.fire({
          entityId: r.id,
          type: "submittal_overdue",
          title: `Submittal ${r.submittalNumber} overdue`,
          message: `${r.name} has been pending review for more than 14 days.`,
          entityType: "submittal",
          actionUrl: `/projects/${r.projectId}/submittals`,
        });
      }
    });
  },

  daily_log_missing_monitor: async (payload) => {
    await runDailyMonitor("daily_log_missing", payload.tenantId as string, async (ctx) => {
      const { projects, dailyLogs } = await import("@shared/schema");
      const { db: workerDb } = await import("../db");
      const { and: andOp, eq: eqOp, gte: gteOp, inArray } = await import("drizzle-orm");
      const startOfYesterday = new Date();
      startOfYesterday.setHours(0, 0, 0, 0);
      startOfYesterday.setDate(startOfYesterday.getDate() - 1);
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const activeProjects = await workerDb
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(andOp(
          eqOp(projects.tenantId, ctx.tenantId),
          inArray(projects.status, ["active", "in_progress", "planning"]),
        ));

      for (const p of activeProjects) {
        const logs = await workerDb
          .select({ id: dailyLogs.id })
          .from(dailyLogs)
          .where(andOp(
            eqOp(dailyLogs.tenantId, ctx.tenantId),
            eqOp(dailyLogs.projectId, p.id),
            gteOp(dailyLogs.logDate, startOfYesterday),
          ))
          .limit(1);
        if (logs.length > 0) continue;
        await ctx.fire({
          entityId: p.id,
          type: "daily_log_missing",
          title: `No daily log for ${p.name}`,
          message: `Yesterday closed without a field daily log entry.`,
          entityType: "project",
          actionUrl: `/projects/${p.id}/daily-log`,
        });
      }
    });
  },

  change_order_stale_monitor: async (payload) => {
    await runDailyMonitor("co_stale", payload.tenantId as string, async (ctx) => {
      const { changeOrders } = await import("@shared/schema");
      const { db: workerDb } = await import("../db");
      const { and: andOp, eq: eqOp, lt: ltOp, inArray } = await import("drizzle-orm");
      // Stale = submitted but neither approved nor rejected for >7d.
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const rows = await workerDb
        .select({
          id: changeOrders.id,
          coNumber: changeOrders.coNumber,
          title: changeOrders.title,
          projectId: changeOrders.projectId,
        })
        .from(changeOrders)
        .where(andOp(
          eqOp(changeOrders.tenantId, ctx.tenantId),
          inArray(changeOrders.status, ["submitted", "pending"]),
          ltOp(changeOrders.updatedAt, cutoff),
        ));
      for (const r of rows) {
        await ctx.fire({
          entityId: r.id,
          type: "co_stale",
          title: `${r.coNumber} stalled awaiting decision`,
          message: `${r.title} has had no movement for >7 days.`,
          entityType: "change_order",
          actionUrl: `/change-order-approvals`,
        });
      }
    });
  },

  invoice_overdue_monitor: async (payload) => {
    await runDailyMonitor("invoice_overdue", payload.tenantId as string, async (ctx) => {
      const { invoices } = await import("@shared/schema");
      const { db: workerDb } = await import("../db");
      const { and: andOp, eq: eqOp, lt: ltOp, isNotNull, inArray } = await import("drizzle-orm");
      const today = new Date();
      const rows = await workerDb
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          totalAmount: invoices.totalAmount,
          dueDate: invoices.dueDate,
          projectId: invoices.projectId,
        })
        .from(invoices)
        .where(andOp(
          eqOp(invoices.tenantId, ctx.tenantId),
          isNotNull(invoices.dueDate),
          ltOp(invoices.dueDate, today),
          inArray(invoices.status, ["sent", "approved", "pending", "draft"]),
        ));
      for (const r of rows) {
        const total = r.totalAmount ?? "0";
        await ctx.fire({
          entityId: r.id,
          type: "invoice_overdue",
          title: `Invoice ${r.invoiceNumber} overdue`,
          message: `Past due (${total}). Follow up with AP.`,
          entityType: "invoice",
          actionUrl: r.projectId ? `/projects/${r.projectId}/financials` : `/invoices`,
        });
      }
    });
  },
};

// ────────────────────────────────────────────────────────────────────
// Shared monitor scaffold.
// ────────────────────────────────────────────────────────────────────
interface MonitorFire {
  entityId: string;
  entityType: string;
  type: string;
  title: string;
  message: string;
  actionUrl: string;
}

interface MonitorCtx {
  tenantId: string;
  windowDate: string; // YYYY-MM-DD
  fire: (input: MonitorFire) => Promise<void>;
}

async function runDailyMonitor(
  monitorId: string,
  tenantId: string,
  body: (ctx: MonitorCtx) => Promise<void>,
): Promise<void> {
  const { db: workerDb } = await import("../db");
  const { notifications, monitorEvents } = await import("@shared/schema");

  const today = new Date();
  const windowDate = today.toISOString().slice(0, 10);

  let fired = 0;
  let skipped = 0;

  const ctx: MonitorCtx = {
    tenantId,
    windowDate,
    async fire(input) {
      try {
        await workerDb.transaction(async (tx) => {
          // Idempotency primitive: insert into monitor_events first.
          // The unique index on (monitor_id, entity_id, window_date)
          // throws on conflict — we catch and skip the notification,
          // guaranteeing one notification per (monitor, entity, day).
          await tx.insert(monitorEvents).values({
            tenantId,
            monitorId,
            entityId: input.entityId,
            windowDate,
            metadata: { type: input.type },
          });
          await tx.insert(notifications).values({
            tenantId,
            userId: null,
            type: input.type,
            title: input.title,
            message: input.message,
            entityType: input.entityType,
            entityId: input.entityId,
            priority: "normal",
            read: false,
            actionUrl: input.actionUrl,
          });
        });
        fired++;
      } catch (err) {
        // Unique-violation = already fired today. Anything else is a
        // genuine failure we log so the next sweep can retry.
        const msg = err instanceof Error ? err.message : String(err);
        if (/duplicate key|unique constraint|monitor_events_uidx/i.test(msg)) {
          skipped++;
        } else {
          console.error(
            `[monitor:${monitorId}] tenant=${tenantId} entity=${input.entityId} fire failed:`,
            msg,
          );
        }
      }
    },
  };

  try {
    await body(ctx);
    console.log(`[monitor:${monitorId}] tenant=${tenantId} window=${windowDate} fired=${fired} skipped=${skipped}`);
  } catch (err) {
    console.error(`[monitor:${monitorId}] tenant=${tenantId} body failed:`, err);
  }
}

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
