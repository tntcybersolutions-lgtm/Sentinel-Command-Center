/**
 * Auto-Filing Service
 * Handles automatic document filing based on configurable rules
 * Features: Rule matching, smart rename, conflict detection, undo capability
 */

import { db } from "../db";
import {
  autoFilingRules,
  documentAuditLog,
  egnyteItems,
  jacketDocuments,
  jacketFolders,
  companies,
  bidProjects,
  vendors,
  type AutoFilingRule,
  type InsertAutoFilingRule,
  type EgnyteItem,
  type DocumentAuditLog,
} from "@shared/schema";
import { eq, and, desc, asc, like, or, sql, isNull } from "drizzle-orm";

interface DocumentContext {
  id: string;
  name: string;
  path: string;
  fileType?: string | null;
  mimeType?: string | null;
  isFolder: boolean;
  fileSizeBytes?: number | null;
  metadata?: Record<string, any>;
  contentText?: string;
  senderEmail?: string;
  projectName?: string;
  vendorName?: string;
  documentDate?: Date;
}

interface RuleMatchResult {
  ruleId: string;
  ruleName: string;
  confidence: number;
  matchedPatterns: string[];
  targetJacketType: string;
  targetFolderPath: string;
  suggestedName?: string;
  autoTags?: string[];
  requiresReview: boolean;
}

interface AutoFileAction {
  actionId: string;
  documentId: string;
  originalPath: string;
  originalName: string;
  newPath: string;
  newName: string;
  ruleId: string;
  ruleName: string;
  appliedAt: Date;
  confidence: number;
  canUndo: boolean;
}

interface AutoFileResult {
  success: boolean;
  action?: AutoFileAction;
  skipped?: boolean;
  skipReason?: string;
  error?: string;
}

const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

export class AutoFilingService {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  // ============================================================================
  // CRUD Operations for Rules
  // ============================================================================

  async getRules(): Promise<AutoFilingRule[]> {
    return db
      .select()
      .from(autoFilingRules)
      .where(eq(autoFilingRules.tenantId, this.tenantId))
      .orderBy(asc(autoFilingRules.priority), asc(autoFilingRules.name));
  }

  async getRuleById(id: string): Promise<AutoFilingRule | null> {
    const [rule] = await db
      .select()
      .from(autoFilingRules)
      .where(and(eq(autoFilingRules.id, id), eq(autoFilingRules.tenantId, this.tenantId)));
    return rule || null;
  }

  async createRule(data: InsertAutoFilingRule): Promise<AutoFilingRule> {
    const [rule] = await db
      .insert(autoFilingRules)
      .values({
        ...data,
        tenantId: this.tenantId,
      })
      .returning();

    await this.logAuditEvent(null, "rule_created", {
      ruleId: rule.id,
      ruleName: rule.name,
      details: data,
    });

    return rule;
  }

  async updateRule(id: string, data: Partial<InsertAutoFilingRule>): Promise<AutoFilingRule | null> {
    const existing = await this.getRuleById(id);
    if (!existing) return null;

    const [updated] = await db
      .update(autoFilingRules)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(autoFilingRules.id, id), eq(autoFilingRules.tenantId, this.tenantId)))
      .returning();

    await this.logAuditEvent(null, "rule_updated", {
      ruleId: id,
      changes: data,
      previousValues: existing,
    });

    return updated;
  }

  async deleteRule(id: string): Promise<boolean> {
    const existing = await this.getRuleById(id);
    if (!existing) return false;

    await db
      .delete(autoFilingRules)
      .where(and(eq(autoFilingRules.id, id), eq(autoFilingRules.tenantId, this.tenantId)));

    await this.logAuditEvent(null, "rule_deleted", {
      ruleId: id,
      ruleName: existing.name,
      ruleConfig: existing,
    });

    return true;
  }

  async toggleRule(id: string, enabled: boolean): Promise<AutoFilingRule | null> {
    return this.updateRule(id, { enabled });
  }

  // ============================================================================
  // Rule Matching & Application
  // ============================================================================

  async matchRules(document: DocumentContext): Promise<RuleMatchResult[]> {
    const rules = await db
      .select()
      .from(autoFilingRules)
      .where(and(eq(autoFilingRules.tenantId, this.tenantId), eq(autoFilingRules.enabled, true)))
      .orderBy(asc(autoFilingRules.priority));

    const matches: RuleMatchResult[] = [];

    for (const rule of rules) {
      const matchResult = this.evaluateRule(rule, document);
      if (matchResult.confidence > 0) {
        matches.push({
          ruleId: rule.id,
          ruleName: rule.name,
          confidence: matchResult.confidence,
          matchedPatterns: matchResult.matchedPatterns,
          targetJacketType: rule.targetJacketType,
          targetFolderPath: rule.targetFolderPath,
          suggestedName: rule.autoRename ? this.generateSmartName(document, rule) : undefined,
          autoTags: rule.autoTag || [],
          requiresReview: rule.requiresReview ?? false,
        });
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  private evaluateRule(
    rule: AutoFilingRule,
    document: DocumentContext
  ): { confidence: number; matchedPatterns: string[] } {
    const matchedPatterns: string[] = [];
    let totalScore = 0;
    let matchCount = 0;
    let patternCount = 0;

    // Check filename pattern
    if (rule.fileNamePattern) {
      patternCount++;
      try {
        const regex = new RegExp(rule.fileNamePattern, "i");
        if (regex.test(document.name)) {
          matchedPatterns.push(`filename:${rule.fileNamePattern}`);
          totalScore += 1;
          matchCount++;
        }
      } catch (e) {
        console.error(`[AutoFiling] Invalid filename pattern: ${rule.fileNamePattern}`);
      }
    }

    // Check file type pattern
    if (rule.fileTypePattern) {
      patternCount++;
      const allowedTypes = rule.fileTypePattern.split(",").map((t) => t.trim().toLowerCase());
      const docType = (document.fileType || document.name.split(".").pop() || "").toLowerCase();
      if (allowedTypes.includes(docType)) {
        matchedPatterns.push(`filetype:${docType}`);
        totalScore += 1;
        matchCount++;
      }
    }

    // Check content keywords
    if (rule.contentKeywords && rule.contentKeywords.length > 0 && document.contentText) {
      patternCount++;
      const contentLower = document.contentText.toLowerCase();
      const matchedKeywords = rule.contentKeywords.filter((kw) =>
        contentLower.includes(kw.toLowerCase())
      );
      if (matchedKeywords.length > 0) {
        const keywordScore = matchedKeywords.length / rule.contentKeywords.length;
        matchedPatterns.push(`keywords:${matchedKeywords.join(",")}`);
        totalScore += keywordScore;
        matchCount++;
      }
    }

    // Check sender pattern (for email attachments)
    if (rule.senderPattern && document.senderEmail) {
      patternCount++;
      try {
        const regex = new RegExp(rule.senderPattern, "i");
        if (regex.test(document.senderEmail)) {
          matchedPatterns.push(`sender:${rule.senderPattern}`);
          totalScore += 1;
          matchCount++;
        }
      } catch (e) {
        console.error(`[AutoFiling] Invalid sender pattern: ${rule.senderPattern}`);
      }
    }

    // Check path context (implicit pattern from folder path)
    const pathLower = document.path.toLowerCase();
    const targetFolderLower = rule.targetFolderPath.toLowerCase();
    if (pathLower.includes(targetFolderLower) || 
        targetFolderLower.split("/").some(part => pathLower.includes(part))) {
      matchedPatterns.push(`path_hint:${rule.targetFolderPath}`);
      totalScore += 0.5;
      matchCount += 0.5;
    }

    // Calculate confidence
    const confidence = patternCount > 0 ? totalScore / patternCount : 0;

    return { confidence, matchedPatterns };
  }

  async applyAutoFilingRules(
    document: DocumentContext,
    confidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD,
    dryRun = false
  ): Promise<AutoFileResult> {
    try {
      const matches = await this.matchRules(document);

      if (matches.length === 0) {
        return {
          success: true,
          skipped: true,
          skipReason: "No matching rules found",
        };
      }

      const bestMatch = matches[0];

      if (bestMatch.confidence < confidenceThreshold) {
        return {
          success: true,
          skipped: true,
          skipReason: `Best match confidence (${(bestMatch.confidence * 100).toFixed(1)}%) below threshold (${(confidenceThreshold * 100).toFixed(1)}%)`,
        };
      }

      if (bestMatch.requiresReview) {
        await this.logAuditEvent(document.id, "auto_file_pending_review", {
          ruleId: bestMatch.ruleId,
          ruleName: bestMatch.ruleName,
          confidence: bestMatch.confidence,
          suggestedPath: bestMatch.targetFolderPath,
          suggestedName: bestMatch.suggestedName,
        });

        return {
          success: true,
          skipped: true,
          skipReason: "Rule requires manual review",
        };
      }

      // Generate new name if auto-rename is enabled
      const newName = bestMatch.suggestedName || document.name;
      const finalName = await this.resolveNameConflict(
        bestMatch.targetFolderPath,
        newName,
        document.id
      );

      const newPath = `${bestMatch.targetFolderPath}/${finalName}`;

      if (dryRun) {
        return {
          success: true,
          action: {
            actionId: `preview-${Date.now()}`,
            documentId: document.id,
            originalPath: document.path,
            originalName: document.name,
            newPath,
            newName: finalName,
            ruleId: bestMatch.ruleId,
            ruleName: bestMatch.ruleName,
            appliedAt: new Date(),
            confidence: bestMatch.confidence,
            canUndo: false,
          },
        };
      }

      // Log the action for undo capability
      const actionId = await this.logAutoFileAction(document, bestMatch, finalName, newPath);

      // Apply tags if specified
      if (bestMatch.autoTags && bestMatch.autoTags.length > 0) {
        await this.applyTags(document.id, bestMatch.autoTags);
      }

      // Log audit event
      await this.logAuditEvent(document.id, "auto_filed", {
        actionId,
        ruleId: bestMatch.ruleId,
        ruleName: bestMatch.ruleName,
        originalPath: document.path,
        originalName: document.name,
        newPath,
        newName: finalName,
        confidence: bestMatch.confidence,
        matchedPatterns: bestMatch.matchedPatterns,
      });

      return {
        success: true,
        action: {
          actionId,
          documentId: document.id,
          originalPath: document.path,
          originalName: document.name,
          newPath,
          newName: finalName,
          ruleId: bestMatch.ruleId,
          ruleName: bestMatch.ruleName,
          appliedAt: new Date(),
          confidence: bestMatch.confidence,
          canUndo: true,
        },
      };
    } catch (error: any) {
      console.error("[AutoFiling] Error applying rules:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async testRule(ruleId: string, document: DocumentContext): Promise<RuleMatchResult | null> {
    const rule = await this.getRuleById(ruleId);
    if (!rule) return null;

    const matchResult = this.evaluateRule(rule, document);

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      confidence: matchResult.confidence,
      matchedPatterns: matchResult.matchedPatterns,
      targetJacketType: rule.targetJacketType,
      targetFolderPath: rule.targetFolderPath,
      suggestedName: rule.autoRename ? this.generateSmartName(document, rule) : undefined,
      autoTags: rule.autoTag || [],
      requiresReview: rule.requiresReview ?? false,
    };
  }

  // ============================================================================
  // Smart Rename
  // ============================================================================

  generateSmartName(document: DocumentContext, rule?: AutoFilingRule): string {
    // Template: [Project]_[DocType]_[Vendor]_[YYYY-MM-DD]_[Version]
    const parts: string[] = [];

    // Project name
    if (document.projectName) {
      parts.push(this.sanitizeNamePart(document.projectName));
    }

    // Document type (inferred from rule or file type)
    const docType = this.inferDocumentType(document, rule);
    if (docType) {
      parts.push(docType);
    }

    // Vendor name
    if (document.vendorName) {
      parts.push(this.sanitizeNamePart(document.vendorName));
    }

    // Date
    const date = document.documentDate || new Date();
    const dateStr = this.formatDate(date);
    parts.push(dateStr);

    // Get file extension
    const ext = this.getFileExtension(document.name);

    // Combine parts
    if (parts.length === 0) {
      return document.name;
    }

    return `${parts.join("_")}${ext}`;
  }

  private sanitizeNamePart(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .substring(0, 50);
  }

  private formatDate(date: Date): string {
    return date.toISOString().split("T")[0];
  }

  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf(".");
    return lastDot >= 0 ? filename.substring(lastDot) : "";
  }

  private inferDocumentType(document: DocumentContext, rule?: AutoFilingRule): string {
    // Check rule target folder for hints
    if (rule?.targetFolderPath) {
      const pathLower = rule.targetFolderPath.toLowerCase();
      if (pathLower.includes("invoice")) return "INV";
      if (pathLower.includes("contract")) return "CONTRACT";
      if (pathLower.includes("insurance") || pathLower.includes("coi")) return "COI";
      if (pathLower.includes("w9") || pathLower.includes("w-9")) return "W9";
      if (pathLower.includes("proposal") || pathLower.includes("bid")) return "BID";
      if (pathLower.includes("permit")) return "PERMIT";
      if (pathLower.includes("change") && pathLower.includes("order")) return "CO";
      if (pathLower.includes("rfi")) return "RFI";
      if (pathLower.includes("submittal")) return "SUBM";
      if (pathLower.includes("drawing") || pathLower.includes("plan")) return "DWG";
    }

    // Check filename for hints
    const nameLower = document.name.toLowerCase();
    if (nameLower.includes("invoice") || nameLower.includes("inv-")) return "INV";
    if (nameLower.includes("contract")) return "CONTRACT";
    if (nameLower.includes("coi") || nameLower.includes("certificate")) return "COI";
    if (nameLower.includes("w9") || nameLower.includes("w-9")) return "W9";
    if (nameLower.includes("proposal") || nameLower.includes("bid")) return "BID";
    if (nameLower.includes("permit")) return "PERMIT";

    return "DOC";
  }

  // ============================================================================
  // Conflict Detection & Resolution
  // ============================================================================

  async resolveNameConflict(
    targetPath: string,
    proposedName: string,
    excludeDocId?: string
  ): Promise<string> {
    const baseName = proposedName.replace(/\.[^.]+$/, "");
    const ext = this.getFileExtension(proposedName);

    let candidateName = proposedName;
    let version = 1;
    const maxVersions = 100;

    while (version <= maxVersions) {
      // Check if name exists in target path
      const existingQuery = db
        .select()
        .from(egnyteItems)
        .where(
          and(
            eq(egnyteItems.tenantId, this.tenantId),
            eq(egnyteItems.name, candidateName),
            like(egnyteItems.egnytePath, `${targetPath}%`),
            eq(egnyteItems.isFolder, false)
          )
        );

      const existing = await existingQuery;

      // Filter out the document we're moving (if applicable)
      const conflicts = excludeDocId
        ? existing.filter((e) => e.id !== excludeDocId)
        : existing;

      if (conflicts.length === 0) {
        return candidateName;
      }

      // Append version suffix
      version++;
      candidateName = `${baseName}_v${version.toString().padStart(2, "0")}${ext}`;
    }

    // Fallback: use timestamp
    const timestamp = Date.now();
    return `${baseName}_${timestamp}${ext}`;
  }

  // ============================================================================
  // Undo Capability
  // ============================================================================

  private async logAutoFileAction(
    document: DocumentContext,
    match: RuleMatchResult,
    newName: string,
    newPath: string
  ): Promise<string> {
    const [auditEntry] = await db
      .insert(documentAuditLog)
      .values({
        tenantId: this.tenantId,
        documentId: document.id,
        action: "auto_filed",
        actorType: "herbie",
        actorName: "HERBIE Auto-Filing",
        detailsJson: {
          type: "auto_file_action",
          canUndo: true,
          originalPath: document.path,
          originalName: document.name,
          newPath,
          newName,
          ruleId: match.ruleId,
          ruleName: match.ruleName,
          confidence: match.confidence,
          matchedPatterns: match.matchedPatterns,
          appliedAt: new Date().toISOString(),
        },
      })
      .returning();

    return auditEntry.id;
  }

  async getUndoableActions(): Promise<AutoFileAction[]> {
    const actions = await db
      .select()
      .from(documentAuditLog)
      .where(
        and(
          eq(documentAuditLog.tenantId, this.tenantId),
          eq(documentAuditLog.action, "auto_filed"),
          eq(documentAuditLog.actorType, "herbie")
        )
      )
      .orderBy(desc(documentAuditLog.createdAt))
      .limit(50);

    return actions
      .filter((a) => {
        const details = a.detailsJson as any;
        return details?.canUndo === true;
      })
      .map((a) => {
        const details = a.detailsJson as any;
        return {
          actionId: a.id,
          documentId: a.documentId || "",
          originalPath: details.originalPath,
          originalName: details.originalName,
          newPath: details.newPath,
          newName: details.newName,
          ruleId: details.ruleId,
          ruleName: details.ruleName,
          appliedAt: new Date(details.appliedAt || a.createdAt),
          confidence: details.confidence,
          canUndo: details.canUndo,
        };
      });
  }

  async undoAutoFileAction(actionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const [action] = await db
        .select()
        .from(documentAuditLog)
        .where(
          and(
            eq(documentAuditLog.id, actionId),
            eq(documentAuditLog.tenantId, this.tenantId),
            eq(documentAuditLog.action, "auto_filed")
          )
        );

      if (!action) {
        return { success: false, error: "Action not found" };
      }

      const details = action.detailsJson as any;
      if (!details?.canUndo) {
        return { success: false, error: "This action cannot be undone" };
      }

      // Mark the original action as undone
      await db
        .update(documentAuditLog)
        .set({
          detailsJson: {
            ...details,
            canUndo: false,
            undoneAt: new Date().toISOString(),
          },
        })
        .where(eq(documentAuditLog.id, actionId));

      // Log the undo action
      await this.logAuditEvent(action.documentId, "auto_file_undone", {
        originalActionId: actionId,
        restoredPath: details.originalPath,
        restoredName: details.originalName,
        previousPath: details.newPath,
        previousName: details.newName,
      });

      return { success: true };
    } catch (error: any) {
      console.error("[AutoFiling] Undo error:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // Integration Helpers
  // ============================================================================

  async processNewDocument(egnyteItem: EgnyteItem): Promise<AutoFileResult> {
    const documentContext: DocumentContext = {
      id: egnyteItem.id,
      name: egnyteItem.name,
      path: egnyteItem.egnytePath,
      fileType: egnyteItem.fileType,
      mimeType: egnyteItem.mimeType,
      isFolder: egnyteItem.isFolder,
      fileSizeBytes: egnyteItem.fileSizeBytes,
    };

    return this.applyAutoFilingRules(documentContext);
  }

  async processNewDocuments(items: EgnyteItem[]): Promise<Map<string, AutoFileResult>> {
    const results = new Map<string, AutoFileResult>();

    for (const item of items) {
      if (!item.isFolder) {
        const result = await this.processNewDocument(item);
        results.set(item.id, result);
      }
    }

    return results;
  }

  // ============================================================================
  // Audit & Tags
  // ============================================================================

  private async logAuditEvent(
    documentId: string | null,
    action: string,
    details: Record<string, any>
  ): Promise<void> {
    await db.insert(documentAuditLog).values({
      tenantId: this.tenantId,
      documentId,
      action,
      actorType: "herbie",
      actorName: "HERBIE Auto-Filing",
      detailsJson: details,
    });
  }

  private async applyTags(documentId: string, tags: string[]): Promise<void> {
    // Update jacket document tags if it exists
    await db
      .update(jacketDocuments)
      .set({
        tags,
        updatedAt: new Date(),
      } as any)
      .where(eq(jacketDocuments.id, documentId));
  }

  // ============================================================================
  // Statistics & Reporting
  // ============================================================================

  async getFilingStats(): Promise<{
    totalRules: number;
    activeRules: number;
    actionsToday: number;
    actionsThisWeek: number;
    undoableActions: number;
  }> {
    const allRules = await this.getRules();
    const activeRules = allRules.filter((r) => r.enabled);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const recentActions = await db
      .select()
      .from(documentAuditLog)
      .where(
        and(
          eq(documentAuditLog.tenantId, this.tenantId),
          eq(documentAuditLog.action, "auto_filed"),
          eq(documentAuditLog.actorType, "herbie")
        )
      )
      .orderBy(desc(documentAuditLog.createdAt))
      .limit(500);

    const actionsToday = recentActions.filter(
      (a) => a.createdAt && new Date(a.createdAt) >= today
    ).length;

    const actionsThisWeek = recentActions.filter(
      (a) => a.createdAt && new Date(a.createdAt) >= weekAgo
    ).length;

    const undoableActions = recentActions.filter((a) => {
      const details = a.detailsJson as any;
      return details?.canUndo === true;
    }).length;

    return {
      totalRules: allRules.length,
      activeRules: activeRules.length,
      actionsToday,
      actionsThisWeek,
      undoableActions,
    };
  }
}

export function createAutoFilingService(tenantId: string): AutoFilingService {
  return new AutoFilingService(tenantId);
}
