import { db } from "../db";
import {
  retroScanClusters,
  egnyteItems,
  documentAiMetadata,
  companies,
  bidProjects,
  jacketFolders,
  jacketDocuments,
  approvalRequests,
  opportunities,
} from "@shared/schema";
import { eq, and, sql, ilike, or, desc, asc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createFolderTaxonomyService } from "./folder-taxonomy.service";
import { createBidBinderService } from "./bid-binder.service";
import { createBidReadinessService } from "./bid-readiness.service";

async function emitSSE(type: string, tenantId: string, payload: Record<string, unknown>) {
  try {
    const { eventStreamService } = await import("./event-stream.service");
    eventStreamService.emit(type as any, tenantId, payload);
  } catch {}
}

interface ClassificationRule {
  patterns: RegExp[];
  folderName: string;
}

const CLASSIFICATION_RULES: ClassificationRule[] = [
  { patterns: [/solicitation/i, /\bSOW\b/, /\bPWS\b/], folderName: "01-Solicitation" },
  { patterns: [/amendment/i, /\bmod\b/i], folderName: "02-Amendments" },
  { patterns: [/\bRFI\b/i, /question/i], folderName: "04-RFIs & QA" },
  { patterns: [/estimate/i, /takeoff/i, /quantity/i], folderName: "05-Estimating" },
  { patterns: [/\bsub\b/i, /quote/i, /bid\s*tab/i], folderName: "06-Subcontractor Quotes" },
  { patterns: [/insurance/i, /\bCOI\b/, /bond/i], folderName: "07-Insurance & Bonding" },
  { patterns: [/\bSF\b/, /\bform\b/i, /\bcert\b/i], folderName: "08-Forms & Certifications" },
  { patterns: [/past\s*performance/i, /\bCPARS\b/i], folderName: "09-Past Performance" },
  { patterns: [/technical/i, /proposal/i, /approach/i], folderName: "10-Technical Proposal" },
  { patterns: [/price/i, /\bcost\b/i, /\bCLIN\b/, /schedule\s*B/i], folderName: "11-Pricing" },
  { patterns: [/submission/i, /\bfinal\b/i], folderName: "12-Submission" },
];

interface ScanSuggestion {
  documentId: string;
  documentName: string;
  currentFolderId: string;
  currentFolderName: string;
  suggestedFolderId: string;
  suggestedFolderName: string;
  confidence: number;
  reason: string;
}

interface ScanResult {
  bidProjectId: string;
  scannedCount: number;
  misplacedCount: number;
  suggestions: ScanSuggestion[];
}

interface DocumentCluster {
  solicitationNumber?: string;
  agency?: string;
  title?: string;
  dueDate?: Date;
  documents: {
    egnyteItemId: string;
    path: string;
    name: string;
    aiCategory?: string;
  }[];
  confidence: number;
}

function classifyDocument(fileName: string, documentType: string | null): { folderName: string; confidence: number; reason: string } | null {
  const combined = `${fileName} ${documentType || ""}`;
  for (const rule of CLASSIFICATION_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(combined)) {
        return {
          folderName: rule.folderName,
          confidence: pattern.test(fileName) ? 0.85 : 0.7,
          reason: `Name/type matches pattern for ${rule.folderName}`,
        };
      }
    }
  }
  return null;
}

export class RetroOrganizerService {
  private tenantId: string;

  constructor(tenantId?: string) {
    this.tenantId = tenantId || "blackhawk-default";
  }

  async scanBidPackage(tenantId: string, bidProjectId: string): Promise<ScanResult> {
    const folders = await db
      .select()
      .from(jacketFolders)
      .where(
        and(
          eq(jacketFolders.tenantId, tenantId),
          eq(jacketFolders.jacketType, "bid"),
          eq(jacketFolders.jacketId, bidProjectId)
        )
      )
      .orderBy(asc(jacketFolders.sortOrder));

    if (folders.length === 0) {
      return { bidProjectId, scannedCount: 0, misplacedCount: 0, suggestions: [] };
    }

    const folderMap = new Map(folders.map((f) => [f.id, f]));
    const folderByName = new Map(folders.map((f) => [f.name, f]));

    const suggestions: ScanSuggestion[] = [];
    let scannedCount = 0;

    for (const folder of folders) {
      const docs = await db
        .select()
        .from(jacketDocuments)
        .where(
          and(
            eq(jacketDocuments.tenantId, tenantId),
            eq(jacketDocuments.folderId, folder.id)
          )
        );

      for (const doc of docs) {
        scannedCount++;
        const classification = classifyDocument(doc.fileName, doc.documentType);
        if (!classification) continue;

        const suggestedFolder = folderByName.get(classification.folderName);
        if (!suggestedFolder) continue;

        if (suggestedFolder.id !== folder.id) {
          suggestions.push({
            documentId: doc.id,
            documentName: doc.fileName,
            currentFolderId: folder.id,
            currentFolderName: folder.name,
            suggestedFolderId: suggestedFolder.id,
            suggestedFolderName: suggestedFolder.name,
            confidence: classification.confidence,
            reason: classification.reason,
          });
        }
      }
    }

    const result: ScanResult = {
      bidProjectId,
      scannedCount,
      misplacedCount: suggestions.length,
      suggestions,
    };

    await emitSSE("RETRO_SCAN_FOUND", tenantId, {
      bidProjectId,
      scannedCount,
      misplacedCount: suggestions.length,
    });

    return result;
  }

  async proposeReorganization(tenantId: string, bidProjectId: string): Promise<{
    approvalId: string | null;
    misplacedCount: number;
    suggestions: ScanSuggestion[];
  }> {
    const scan = await this.scanBidPackage(tenantId, bidProjectId);

    if (scan.misplacedCount === 0) {
      return { approvalId: null, misplacedCount: 0, suggestions: [] };
    }

    const approvalId = randomUUID();
    await db.insert(approvalRequests).values({
      id: approvalId,
      tenantId,
      entityType: "bid_project",
      entityId: bidProjectId,
      actionType: "retro_reorganize",
      status: "pending",
      priority: "normal",
      contextJson: { suggestions: scan.suggestions },
    });

    await emitSSE("APPROVAL_REQUIRED", tenantId, {
      approvalId,
      actionType: "retro_reorganize",
      bidProjectId,
      misplacedCount: scan.misplacedCount,
    });

    return {
      approvalId,
      misplacedCount: scan.misplacedCount,
      suggestions: scan.suggestions,
    };
  }

  async executeReorganization(tenantId: string, approvalId: string): Promise<{
    moved: number;
    errors: string[];
  }> {
    const approval = await db
      .select()
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.id, approvalId),
          eq(approvalRequests.tenantId, tenantId)
        )
      )
      .limit(1);

    if (approval.length === 0) {
      return { moved: 0, errors: ["Approval request not found"] };
    }

    const context = approval[0].contextJson as { suggestions?: ScanSuggestion[] } | null;
    const suggestions = context?.suggestions || [];

    if (suggestions.length === 0) {
      return { moved: 0, errors: ["No suggestions found in approval payload"] };
    }

    let moved = 0;
    const errors: string[] = [];

    for (const suggestion of suggestions) {
      try {
        await db
          .update(jacketDocuments)
          .set({ folderId: suggestion.suggestedFolderId, updatedAt: new Date() })
          .where(
            and(
              eq(jacketDocuments.id, suggestion.documentId),
              eq(jacketDocuments.tenantId, tenantId)
            )
          );

        await db
          .update(jacketFolders)
          .set({ documentCount: sql`GREATEST(COALESCE(${jacketFolders.documentCount}, 0) - 1, 0)` })
          .where(eq(jacketFolders.id, suggestion.currentFolderId));

        await db
          .update(jacketFolders)
          .set({ documentCount: sql`COALESCE(${jacketFolders.documentCount}, 0) + 1` })
          .where(eq(jacketFolders.id, suggestion.suggestedFolderId));

        moved++;
      } catch (err: any) {
        errors.push(`Failed to move document ${suggestion.documentId}: ${err.message}`);
      }
    }

    await db
      .update(approvalRequests)
      .set({ status: "approved" })
      .where(eq(approvalRequests.id, approvalId));

    await emitSSE("RETRO_REBUILD_DONE", tenantId, {
      approvalId,
      moved,
      errors: errors.length,
    });

    return { moved, errors };
  }

  async generateBidIndex(tenantId: string, bidProjectId: string): Promise<{
    bidProjectId: string;
    generatedAt: string;
    folders: { section: string; documents: { id: string; fileName: string; type: string | null; pages: number | null }[] }[];
    stats: { totalDocuments: number; totalFolders: number; completeness: number };
  }> {
    const folders = await db
      .select()
      .from(jacketFolders)
      .where(
        and(
          eq(jacketFolders.tenantId, tenantId),
          eq(jacketFolders.jacketType, "bid"),
          eq(jacketFolders.jacketId, bidProjectId)
        )
      )
      .orderBy(asc(jacketFolders.sortOrder));

    const folderResults: { section: string; documents: { id: string; fileName: string; type: string | null; pages: number | null }[] }[] = [];
    let totalDocuments = 0;
    let foldersWithDocs = 0;

    for (const folder of folders) {
      const docs = await db
        .select()
        .from(jacketDocuments)
        .where(
          and(
            eq(jacketDocuments.tenantId, tenantId),
            eq(jacketDocuments.folderId, folder.id),
            eq(jacketDocuments.status, "active")
          )
        );

      if (docs.length > 0) {
        foldersWithDocs++;
      }

      totalDocuments += docs.length;

      folderResults.push({
        section: folder.name,
        documents: docs.map((d) => ({
          id: d.id,
          fileName: d.fileName,
          type: d.documentType,
          pages: null,
        })),
      });
    }

    const completeness = folders.length > 0 ? Math.round((foldersWithDocs / folders.length) * 100) : 0;

    return {
      bidProjectId,
      generatedAt: new Date().toISOString(),
      folders: folderResults,
      stats: {
        totalDocuments,
        totalFolders: folders.length,
        completeness,
      },
    };
  }

  private extractSolicitationNumber(text: string): string | null {
    const patterns = [
      /solicitation\s*(?:no|number|#)?[:\s]*([A-Z0-9-]+)/i,
      /(?:RFP|RFQ|IFB)[:\s#-]*([A-Z0-9-]+)/i,
      /contract\s*(?:no|number|#)?[:\s]*([A-Z0-9-]+)/i,
      /W[0-9]{3,}[A-Z0-9-]+/i,
      /FA[0-9]{4}-[0-9]{2}-[A-Z]-[0-9]+/i,
      /[A-Z]{2,4}[0-9]{2,4}-[0-9]{2,4}-[A-Z]-[0-9]+/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }
    return null;
  }

  private extractAgency(text: string): string | null {
    const patterns = [
      /(?:department|dept)\s*(?:of)?\s*([A-Za-z\s]+?)(?:\n|,|$)/i,
      /(?:agency|office)[:\s]+([A-Za-z\s]+?)(?:\n|,|$)/i,
      /U\.?S\.?\s*([A-Za-z\s]+?)(?:\n|,|$)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    return null;
  }

  private extractTitle(text: string): string | null {
    const patterns = [
      /(?:project|title|subject)[:\s]+([^\n]{10,100})/i,
      /(?:for|regarding)[:\s]+([^\n]{10,100})/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    return null;
  }

  private isBidRelatedPath(path: string): boolean {
    const bidKeywords = [
      "rfp", "rfq", "ifb", "solicitation", "bid", "proposal",
      "amendment", "addendum", "pricing", "cost", "quote",
      "insurance", "bonding", "compliance", "submittal",
    ];

    const lowerPath = path.toLowerCase();
    return bidKeywords.some((kw) => lowerPath.includes(kw));
  }

  async scanCompanyFolder(companyId: string): Promise<DocumentCluster[]> {
    const company = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (company.length === 0) {
      throw new Error(`Company ${companyId} not found`);
    }

    const allDocs = await db
      .select({
        id: egnyteItems.id,
        path: egnyteItems.egnytePath,
        name: egnyteItems.name,
        categoryId: documentAiMetadata.categoryId,
        subcategory: documentAiMetadata.subcategory,
        summary: documentAiMetadata.summary,
      })
      .from(egnyteItems)
      .leftJoin(documentAiMetadata, eq(egnyteItems.id, documentAiMetadata.egnyteItemId))
      .where(
        and(
          eq(egnyteItems.tenantId, this.tenantId),
          ilike(egnyteItems.egnytePath, `%${company[0].name}%`),
          eq(egnyteItems.isFolder, false)
        )
      )
      .limit(1000);

    const bidRelatedDocs = allDocs.filter(
      (doc) =>
        this.isBidRelatedPath(doc.path) ||
        ["solicitation", "proposal", "amendment", "rfp", "rfq", "bid"].includes(doc.subcategory?.toLowerCase() || "")
    );

    const clusters: Map<string, DocumentCluster> = new Map();

    for (const doc of bidRelatedDocs) {
      const textContent = doc.summary || doc.name;

      const solicitationNumber = this.extractSolicitationNumber(textContent);
      const agency = this.extractAgency(textContent);
      const title = this.extractTitle(textContent);

      const clusterKey = solicitationNumber || `unmatched-${doc.path.split("/").slice(0, -1).join("/")}`;

      if (!clusters.has(clusterKey)) {
        clusters.set(clusterKey, {
          solicitationNumber: solicitationNumber || undefined,
          agency: agency || undefined,
          title: title || undefined,
          documents: [],
          confidence: solicitationNumber ? 0.85 : 0.5,
        });
      }

      const cluster = clusters.get(clusterKey)!;
      cluster.documents.push({
        egnyteItemId: doc.id,
        path: doc.path,
        name: doc.name,
        aiCategory: doc.subcategory || undefined,
      });

      if (!cluster.agency && agency) cluster.agency = agency;
      if (!cluster.title && title) cluster.title = title;
    }

    return Array.from(clusters.values()).filter((c) => c.documents.length >= 2);
  }

  async discoverUnorganizedBids(): Promise<number> {
    const allCompanies = await db
      .select()
      .from(companies)
      .where(eq(companies.tenantId, this.tenantId));

    let totalClustersFound = 0;

    for (const company of allCompanies) {
      const clusters = await this.scanCompanyFolder(company.id);

      for (const cluster of clusters) {
        const existing = await db
          .select()
          .from(retroScanClusters)
          .where(
            and(
              eq(retroScanClusters.tenantId, this.tenantId),
              eq(retroScanClusters.sourceCompanyId, company.id),
              cluster.solicitationNumber
                ? eq(retroScanClusters.detectedSolicitationNumber, cluster.solicitationNumber)
                : sql`1=1`
            )
          )
          .limit(1);

        if (existing.length === 0) {
          await db.insert(retroScanClusters).values({
            tenantId: this.tenantId,
            detectedSolicitationNumber: cluster.solicitationNumber,
            detectedAgency: cluster.agency,
            detectedTitle: cluster.title,
            detectedDueDate: cluster.dueDate,
            sourceCompanyId: company.id,
            sourceFolderPath: cluster.documents[0]?.path.split("/").slice(0, -1).join("/"),
            documentCount: cluster.documents.length,
            documentIdsJson: cluster.documents.map((d) => d.egnyteItemId),
            clusterConfidence: cluster.confidence.toString(),
            clusteringMethodJson: { method: "path_and_keyword" },
            status: "discovered",
          });
          totalClustersFound++;
        }
      }
    }

    return totalClustersFound;
  }

  async getPendingClusters(): Promise<
    {
      id: string;
      solicitationNumber?: string;
      agency?: string;
      title?: string;
      documentCount: number;
      confidence: number;
      companyName?: string;
    }[]
  > {
    const clusters = await db
      .select({
        id: retroScanClusters.id,
        solicitationNumber: retroScanClusters.detectedSolicitationNumber,
        agency: retroScanClusters.detectedAgency,
        title: retroScanClusters.detectedTitle,
        documentCount: retroScanClusters.documentCount,
        confidence: retroScanClusters.clusterConfidence,
        companyName: companies.name,
      })
      .from(retroScanClusters)
      .leftJoin(companies, eq(retroScanClusters.sourceCompanyId, companies.id))
      .where(and(eq(retroScanClusters.tenantId, this.tenantId), eq(retroScanClusters.status, "discovered")))
      .orderBy(desc(retroScanClusters.clusterConfidence));

    return clusters.map((c) => ({
      id: c.id,
      solicitationNumber: c.solicitationNumber || undefined,
      agency: c.agency || undefined,
      title: c.title || undefined,
      documentCount: c.documentCount || 0,
      confidence: parseFloat(c.confidence?.toString() || "0"),
      companyName: c.companyName || undefined,
    }));
  }

  async applyCluster(
    clusterId: string,
    userId: string
  ): Promise<{
    bidProjectId: string;
    documentsOrganized: number;
  }> {
    const cluster = await db.select().from(retroScanClusters).where(eq(retroScanClusters.id, clusterId)).limit(1);

    if (cluster.length === 0) {
      throw new Error(`Cluster ${clusterId} not found`);
    }

    const c = cluster[0];

    if (!c.sourceCompanyId) {
      throw new Error("Cluster has no associated company");
    }

    const company = await db.select().from(companies).where(eq(companies.id, c.sourceCompanyId)).limit(1);

    if (company.length === 0) {
      throw new Error("Company not found");
    }

    const opportunityId = randomUUID();
    await db.insert(opportunities).values({
      id: opportunityId,
      tenantId: this.tenantId,
      title: c.detectedTitle || `Retro Bid - ${c.detectedSolicitationNumber || clusterId}`,
      externalId: c.detectedSolicitationNumber,
      status: "closed",
      dueAt: c.detectedDueDate,
    });

    const bidProjectId = randomUUID();
    await db.insert(bidProjects).values({
      id: bidProjectId,
      tenantId: this.tenantId,
      opportunityId,
      status: "initiated",
    });

    const folderService = createFolderTaxonomyService(this.tenantId);
    await folderService.createBidJacketFolders(
      bidProjectId,
      company[0].name,
      c.detectedSolicitationNumber || bidProjectId,
      c.detectedTitle || "Reconstructed Bid",
      c.detectedDueDate
    );

    await db
      .update(retroScanClusters)
      .set({
        status: "applied",
        targetBidProjectId: bidProjectId,
        appliedAt: new Date(),
        appliedBy: userId,
      })
      .where(eq(retroScanClusters.id, clusterId));

    const binderService = createBidBinderService(this.tenantId);
    await binderService.generateBinder(bidProjectId, "initial", "Retro-organized from existing documents");

    const readinessService = createBidReadinessService(this.tenantId);
    await readinessService.updateReadinessScore(bidProjectId);

    return {
      bidProjectId,
      documentsOrganized: c.documentCount || 0,
    };
  }

  async ignoreCluster(clusterId: string): Promise<void> {
    await db.update(retroScanClusters).set({ status: "ignored" }).where(eq(retroScanClusters.id, clusterId));
  }
}

export const retroOrganizerService = new RetroOrganizerService();

export function createRetroOrganizerService(tenantId: string): RetroOrganizerService {
  return new RetroOrganizerService(tenantId);
}
