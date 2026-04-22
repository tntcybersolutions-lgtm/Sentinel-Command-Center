import { db } from "../db";
import {
  egnyteItems,
  documentCategories,
  documentAiMetadata,
  documentAiEmbeddings,
  documentAlerts,
  documentProcessingQueue,
  bidProjects,
  opportunities,
  bidDocumentStatus,
  documentRequirements,
  type EgnyteItem,
  type DocumentCategory,
  type DocumentAiMetadata,
} from "@shared/schema";
import { eq, and, desc, asc, isNull, inArray, like, or, sql, lt, gt } from "drizzle-orm";
import OpenAI from "openai";

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
    });
  }
  return openaiClient;
}

interface ExtractedMetadata {
  category: string;
  subcategory?: string;
  categoryConfidence: number;
  documentTitle?: string;
  documentDate?: Date;
  expirationDate?: Date;
  contractValue?: number;
  currency?: string;
  parties?: Array<{ name: string; role: string; contact?: string }>;
  projectName?: string;
  projectNumber?: string;
  keyDates?: Array<{ type: string; date: string; description: string }>;
  drawingNumber?: string;
  revisionNumber?: string;
  rfiNumber?: string;
  submittalNumber?: string;
  changeOrderNumber?: string;
  invoiceNumber?: string;
  permitNumber?: string;
  policyNumber?: string;
  summary?: string;
  keyTerms?: string[];
}

interface DocumentAnalysisResult {
  success: boolean;
  metadata?: ExtractedMetadata;
  error?: string;
}

interface SemanticSearchResult {
  itemId: string;
  name: string;
  path: string;
  category?: string;
  summary?: string;
  similarity: number;
}

const CONSTRUCTION_DOCUMENT_CATEGORIES = [
  { name: "contract", displayName: "Contract", icon: "FileText", color: "#3B82F6", description: "Legal agreements, master contracts, subcontracts" },
  { name: "drawing", displayName: "Drawing/Plan", icon: "Ruler", color: "#8B5CF6", description: "Architectural drawings, blueprints, site plans" },
  { name: "rfi", displayName: "RFI", icon: "HelpCircle", color: "#F59E0B", description: "Request for Information documents" },
  { name: "submittal", displayName: "Submittal", icon: "Send", color: "#10B981", description: "Product submittals, shop drawings, samples" },
  { name: "change_order", displayName: "Change Order", icon: "FileEdit", color: "#EF4444", description: "Contract modifications and change orders" },
  { name: "invoice", displayName: "Invoice", icon: "Receipt", color: "#06B6D4", description: "Invoices, pay applications, billing" },
  { name: "insurance", displayName: "Insurance", icon: "Shield", color: "#84CC16", description: "Insurance certificates, policies, bonds" },
  { name: "permit", displayName: "Permit", icon: "Badge", color: "#F97316", description: "Building permits, licenses, approvals" },
  { name: "specification", displayName: "Specification", icon: "ClipboardList", color: "#6366F1", description: "Technical specifications and requirements" },
  { name: "proposal", displayName: "Proposal/Bid", icon: "FileStack", color: "#EC4899", description: "Project proposals and bid documents" },
  { name: "photo", displayName: "Photo", icon: "Camera", color: "#14B8A6", description: "Site photos, progress documentation" },
  { name: "email", displayName: "Email/Correspondence", icon: "Mail", color: "#64748B", description: "Email chains, letters, memos" },
  { name: "schedule", displayName: "Schedule", icon: "Calendar", color: "#A855F7", description: "Project schedules, timelines, Gantt charts" },
  { name: "report", displayName: "Report", icon: "FileBarChart", color: "#0EA5E9", description: "Inspection reports, daily logs, progress reports" },
  { name: "safety", displayName: "Safety Document", icon: "AlertTriangle", color: "#DC2626", description: "Safety plans, OSHA documents, incident reports" },
  { name: "closeout", displayName: "Closeout", icon: "CheckCircle", color: "#22C55E", description: "Final documentation, warranties, as-builts" },
  { name: "other", displayName: "Other", icon: "File", color: "#9CA3AF", description: "Miscellaneous documents" },
];

export class DocumentIntelligenceService {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  async initializeCategories(): Promise<void> {
    const existing = await db
      .select()
      .from(documentCategories)
      .where(eq(documentCategories.tenantId, this.tenantId));

    if (existing.length === 0) {
      for (const cat of CONSTRUCTION_DOCUMENT_CATEGORIES) {
        await db.insert(documentCategories).values({
          tenantId: this.tenantId,
          name: cat.name,
          displayName: cat.displayName,
          description: cat.description,
          icon: cat.icon,
          color: cat.color,
          isSystem: true,
        });
      }
      console.log(`[DocIntelligence] Initialized ${CONSTRUCTION_DOCUMENT_CATEGORIES.length} document categories`);
    }
  }

  async getCategories(): Promise<DocumentCategory[]> {
    return db
      .select()
      .from(documentCategories)
      .where(eq(documentCategories.tenantId, this.tenantId));
  }

  async getCategoryByName(name: string): Promise<DocumentCategory | null> {
    const [category] = await db
      .select()
      .from(documentCategories)
      .where(and(eq(documentCategories.tenantId, this.tenantId), eq(documentCategories.name, name)));
    return category || null;
  }

  async analyzeDocument(item: EgnyteItem): Promise<DocumentAnalysisResult> {
    try {
      const fileName = item.name;
      const filePath = item.egnytePath;
      const fileType = item.fileType || "";
      const mimeType = item.mimeType || "";

      const pathParts = filePath.split("/").filter(Boolean);
      const folderContext = pathParts.slice(-4, -1).join(" > ");

      const prompt = `You are an expert construction document classifier. Analyze this document and extract metadata.

Document Information:
- File Name: ${fileName}
- File Path: ${filePath}
- Folder Context: ${folderContext}
- File Type: ${fileType}
- MIME Type: ${mimeType}

Based on the file name and path, classify this document and extract any metadata you can infer.

Categories (choose one):
- contract: Legal agreements, master contracts, subcontracts
- drawing: Architectural drawings, blueprints, site plans, CAD files
- rfi: Request for Information documents
- submittal: Product submittals, shop drawings, samples
- change_order: Contract modifications and change orders
- invoice: Invoices, pay applications, billing documents
- insurance: Insurance certificates, policies, bonds
- permit: Building permits, licenses, approvals
- specification: Technical specifications and requirements
- proposal: Project proposals and bid documents
- photo: Site photos, progress documentation (jpg, png, etc.)
- email: Email chains, letters, memos
- schedule: Project schedules, timelines, Gantt charts
- report: Inspection reports, daily logs, progress reports
- safety: Safety plans, OSHA documents, incident reports
- closeout: Final documentation, warranties, as-builts
- other: Miscellaneous documents

Respond in JSON format:
{
  "category": "category_name",
  "subcategory": "more specific type if applicable",
  "categoryConfidence": 0.0-1.0,
  "documentTitle": "extracted or inferred title",
  "documentDate": "YYYY-MM-DD if found in filename",
  "projectName": "project name if identifiable",
  "projectNumber": "project number if found",
  "drawingNumber": "if applicable",
  "revisionNumber": "if applicable",
  "rfiNumber": "if applicable",
  "submittalNumber": "if applicable",
  "changeOrderNumber": "if applicable",
  "invoiceNumber": "if applicable",
  "permitNumber": "if applicable",
  "policyNumber": "if applicable",
  "summary": "brief 1-2 sentence description of the document",
  "keyTerms": ["relevant", "keywords", "for", "search"]
}`;

      const response = await getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return { success: false, error: "No response from AI" };
      }

      const metadata = JSON.parse(content) as ExtractedMetadata;
      return { success: true, metadata };
    } catch (error: any) {
      console.error("[DocIntelligence] Analysis error:", error);
      return { success: false, error: error.message };
    }
  }

  async processDocument(itemId: string): Promise<DocumentAiMetadata | null> {
    try {
      const [item] = await db
        .select()
        .from(egnyteItems)
        .where(eq(egnyteItems.id, itemId));

      if (!item || item.isFolder) {
        return null;
      }

      const existingMetadata = await db
        .select()
        .from(documentAiMetadata)
        .where(eq(documentAiMetadata.egnyteItemId, itemId));

      if (existingMetadata.length > 0) {
        return existingMetadata[0];
      }

      const analysis = await this.analyzeDocument(item);
      if (!analysis.success || !analysis.metadata) {
        await db.insert(documentAiMetadata).values({
          tenantId: this.tenantId,
          egnyteItemId: itemId,
          processingStatus: "failed",
          processingError: analysis.error,
        });
        return null;
      }

      const category = await this.getCategoryByName(analysis.metadata.category);
      const linkedProject = await this.findMatchingProject(item, analysis.metadata);

      const [metadata] = await db
        .insert(documentAiMetadata)
        .values({
          tenantId: this.tenantId,
          egnyteItemId: itemId,
          categoryId: category?.id,
          categoryConfidence: analysis.metadata.categoryConfidence?.toString(),
          subcategory: analysis.metadata.subcategory,
          documentTitle: analysis.metadata.documentTitle,
          documentDate: analysis.metadata.documentDate ? new Date(analysis.metadata.documentDate) : null,
          expirationDate: analysis.metadata.expirationDate ? new Date(analysis.metadata.expirationDate) : null,
          contractValue: analysis.metadata.contractValue?.toString(),
          currency: analysis.metadata.currency,
          parties: analysis.metadata.parties,
          projectName: analysis.metadata.projectName,
          projectNumber: analysis.metadata.projectNumber,
          keyDates: analysis.metadata.keyDates,
          drawingNumber: analysis.metadata.drawingNumber,
          revisionNumber: analysis.metadata.revisionNumber,
          rfiNumber: analysis.metadata.rfiNumber,
          submittalNumber: analysis.metadata.submittalNumber,
          changeOrderNumber: analysis.metadata.changeOrderNumber,
          invoiceNumber: analysis.metadata.invoiceNumber,
          permitNumber: analysis.metadata.permitNumber,
          policyNumber: analysis.metadata.policyNumber,
          summary: analysis.metadata.summary,
          keyTerms: analysis.metadata.keyTerms,
          linkedBidId: linkedProject?.bidId,
          linkedOpportunityId: linkedProject?.opportunityId,
          linkConfidence: linkedProject?.confidence?.toString(),
          linkMethod: linkedProject?.method,
          processingStatus: "completed",
          processedAt: new Date(),
        })
        .returning();

      await this.generateDocumentEmbedding(itemId, metadata.id, item, analysis.metadata);

      return metadata;
    } catch (error: any) {
      console.error("[DocIntelligence] Process error:", error);
      return null;
    }
  }

  private async findMatchingProject(item: EgnyteItem, metadata: ExtractedMetadata): Promise<{ bidId?: string; opportunityId?: string; confidence: number; method: string } | null> {
    try {
      const projectName = metadata.projectName;
      const projectNumber = metadata.projectNumber;
      const pathParts = item.egnytePath.split("/");

      if (projectName || projectNumber) {
        const conditions = [];
        if (projectName) {
          conditions.push(sql`LOWER(${opportunities.title}) LIKE LOWER(${'%' + projectName + '%'})`);
        }

        const matchingOpps = await db
          .select()
          .from(opportunities)
          .where(and(eq(opportunities.tenantId, this.tenantId), or(...conditions)))
          .limit(1);

        if (matchingOpps.length > 0) {
          const [linkedBid] = await db
            .select()
            .from(bidProjects)
            .where(eq(bidProjects.opportunityId, matchingOpps[0].id))
            .limit(1);

          return {
            opportunityId: matchingOpps[0].id,
            bidId: linkedBid?.id,
            confidence: 0.75,
            method: "content_match",
          };
        }
      }

      for (let i = pathParts.length - 2; i >= 0; i--) {
        const folderName = pathParts[i];
        if (folderName && folderName.length > 3) {
          const matchingOpps = await db
            .select()
            .from(opportunities)
            .where(and(
              eq(opportunities.tenantId, this.tenantId),
              sql`LOWER(${opportunities.title}) LIKE LOWER(${'%' + folderName + '%'})`
            ))
            .limit(1);

          if (matchingOpps.length > 0) {
            const [linkedBid] = await db
              .select()
              .from(bidProjects)
              .where(eq(bidProjects.opportunityId, matchingOpps[0].id))
              .limit(1);

            return {
              opportunityId: matchingOpps[0].id,
              bidId: linkedBid?.id,
              confidence: 0.5,
              method: "folder_structure",
            };
          }
        }
      }

      return null;
    } catch (error) {
      console.error("[DocIntelligence] Find matching project error:", error);
      return null;
    }
  }

  private async generateDocumentEmbedding(itemId: string, metadataId: string, item: EgnyteItem, metadata: ExtractedMetadata): Promise<void> {
    try {
      const textToEmbed = [
        item.name,
        metadata.documentTitle,
        metadata.summary,
        metadata.projectName,
        metadata.projectNumber,
        item.egnytePath,
        ...(metadata.keyTerms || []),
      ].filter(Boolean).join(" | ");

      if (!textToEmbed || textToEmbed.length < 10) {
        return;
      }

      const response = await getOpenAI().embeddings.create({
        model: "text-embedding-ada-002",
        input: textToEmbed.slice(0, 8000),
      });

      const embedding = response.data[0].embedding;

      await db.insert(documentAiEmbeddings).values({
        tenantId: this.tenantId,
        egnyteItemId: itemId,
        metadataId,
        chunkIndex: 0,
        chunkText: textToEmbed.slice(0, 2000),
        embeddingVector: embedding,
        embeddingModel: "text-embedding-ada-002",
      });
    } catch (error) {
      console.error("[DocIntelligence] Embedding generation error:", error);
    }
  }

  async semanticSearch(query: string, limit: number = 10): Promise<SemanticSearchResult[]> {
    try {
      const queryResponse = await getOpenAI().embeddings.create({
        model: "text-embedding-ada-002",
        input: query.slice(0, 8000),
      });
      const queryEmbedding = queryResponse.data[0].embedding;

      const embeddings = await db
        .select({
          id: documentAiEmbeddings.id,
          itemId: documentAiEmbeddings.egnyteItemId,
          chunkText: documentAiEmbeddings.chunkText,
          embeddingVector: documentAiEmbeddings.embeddingVector,
        })
        .from(documentAiEmbeddings)
        .where(eq(documentAiEmbeddings.tenantId, this.tenantId))
        .limit(500);

      const scored = embeddings.map((emb) => {
        const vector = emb.embeddingVector as number[];
        const similarity = this.cosineSimilarity(queryEmbedding, vector);
        return { ...emb, similarity };
      });

      scored.sort((a, b) => b.similarity - a.similarity);
      const topResults = scored.slice(0, limit);

      const results: SemanticSearchResult[] = [];
      for (const result of topResults) {
        const [item] = await db
          .select()
          .from(egnyteItems)
          .where(eq(egnyteItems.id, result.itemId));

        if (!item) continue;

        const [metadata] = await db
          .select()
          .from(documentAiMetadata)
          .where(eq(documentAiMetadata.egnyteItemId, result.itemId));

        let categoryName: string | undefined;
        if (metadata?.categoryId) {
          const [cat] = await db
            .select()
            .from(documentCategories)
            .where(eq(documentCategories.id, metadata.categoryId));
          categoryName = cat?.displayName;
        }

        results.push({
          itemId: item.id,
          name: item.name,
          path: item.egnytePath,
          category: categoryName,
          summary: metadata?.summary || undefined,
          similarity: result.similarity,
        });
      }

      return results;
    } catch (error) {
      console.error("[DocIntelligence] Semantic search error:", error);
      return [];
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length || a.length === 0) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async queueDocumentsForProcessing(batchSize: number = 50): Promise<number> {
    const unprocessedFiles = await db
      .select({ id: egnyteItems.id })
      .from(egnyteItems)
      .leftJoin(documentAiMetadata, eq(egnyteItems.id, documentAiMetadata.egnyteItemId))
      .where(and(
        eq(egnyteItems.tenantId, this.tenantId),
        eq(egnyteItems.isFolder, false),
        isNull(documentAiMetadata.id)
      ))
      .limit(batchSize);

    for (const file of unprocessedFiles) {
      await db.insert(documentProcessingQueue).values({
        tenantId: this.tenantId,
        egnyteItemId: file.id,
        processingType: "full_analysis",
        priority: 100,
        status: "pending",
      }).onConflictDoNothing();
    }

    return unprocessedFiles.length;
  }

  async processQueue(maxItems: number = 10): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;

    const pendingItems = await db
      .select()
      .from(documentProcessingQueue)
      .where(and(
        eq(documentProcessingQueue.tenantId, this.tenantId),
        eq(documentProcessingQueue.status, "pending")
      ))
      .orderBy(asc(documentProcessingQueue.priority), asc(documentProcessingQueue.createdAt))
      .limit(maxItems);

    for (const queueItem of pendingItems) {
      await db
        .update(documentProcessingQueue)
        .set({ status: "processing", startedAt: new Date(), attempts: (queueItem.attempts || 0) + 1 })
        .where(eq(documentProcessingQueue.id, queueItem.id));

      try {
        const metadata = await this.processDocument(queueItem.egnyteItemId);
        if (metadata) {
          await db
            .update(documentProcessingQueue)
            .set({ status: "completed", completedAt: new Date(), result: { metadataId: metadata.id } })
            .where(eq(documentProcessingQueue.id, queueItem.id));
          processed++;
        } else {
          throw new Error("Processing returned null");
        }
      } catch (error: any) {
        const attempts = (queueItem.attempts || 0) + 1;
        const maxAttempts = queueItem.maxAttempts || 3;
        const newStatus = attempts >= maxAttempts ? "failed" : "pending";
        
        await db
          .update(documentProcessingQueue)
          .set({ status: newStatus, error: error.message })
          .where(eq(documentProcessingQueue.id, queueItem.id));
        
        if (newStatus === "failed") {
          failed++;
        }
      }
    }

    return { processed, failed };
  }

  async createAlert(params: {
    alertType: string;
    severity: string;
    title: string;
    message: string;
    egnyteItemId?: string;
    bidId?: string;
    opportunityId?: string;
    actionUrl?: string;
    actionLabel?: string;
    expiresAt?: Date;
  }): Promise<void> {
    await db.insert(documentAlerts).values({
      tenantId: this.tenantId,
      ...params,
    });
  }

  async getActiveAlerts(limit: number = 20): Promise<any[]> {
    return db
      .select()
      .from(documentAlerts)
      .where(and(
        eq(documentAlerts.tenantId, this.tenantId),
        eq(documentAlerts.status, "active")
      ))
      .orderBy(desc(documentAlerts.createdAt))
      .limit(limit);
  }

  async getDocumentStats(): Promise<{
    totalDocuments: number;
    processedDocuments: number;
    pendingDocuments: number;
    categoryBreakdown: Array<{ category: string; count: number; color: string }>;
    recentUploads: number;
    alertsCount: number;
  }> {
    const totalDocs = await db
      .select({ count: sql<number>`count(*)` })
      .from(egnyteItems)
      .where(and(eq(egnyteItems.tenantId, this.tenantId), eq(egnyteItems.isFolder, false)));

    const processedDocs = await db
      .select({ count: sql<number>`count(*)` })
      .from(documentAiMetadata)
      .where(and(
        eq(documentAiMetadata.tenantId, this.tenantId),
        eq(documentAiMetadata.processingStatus, "completed")
      ));

    const categoryStats = await db
      .select({
        categoryId: documentAiMetadata.categoryId,
        count: sql<number>`count(*)`,
      })
      .from(documentAiMetadata)
      .where(eq(documentAiMetadata.tenantId, this.tenantId))
      .groupBy(documentAiMetadata.categoryId);

    const categoryBreakdown = await Promise.all(
      categoryStats.map(async (stat) => {
        if (!stat.categoryId) {
          return { category: "Uncategorized", count: Number(stat.count), color: "#9CA3AF" };
        }
        const [cat] = await db
          .select()
          .from(documentCategories)
          .where(eq(documentCategories.id, stat.categoryId));
        return {
          category: cat?.displayName || "Unknown",
          count: Number(stat.count),
          color: cat?.color || "#9CA3AF",
        };
      })
    );

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentUploads = await db
      .select({ count: sql<number>`count(*)` })
      .from(egnyteItems)
      .where(and(
        eq(egnyteItems.tenantId, this.tenantId),
        eq(egnyteItems.isFolder, false),
        gt(egnyteItems.createdAt, oneDayAgo)
      ));

    const alertsCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(documentAlerts)
      .where(and(
        eq(documentAlerts.tenantId, this.tenantId),
        eq(documentAlerts.status, "active")
      ));

    return {
      totalDocuments: Number(totalDocs[0]?.count || 0),
      processedDocuments: Number(processedDocs[0]?.count || 0),
      pendingDocuments: Number(totalDocs[0]?.count || 0) - Number(processedDocs[0]?.count || 0),
      categoryBreakdown,
      recentUploads: Number(recentUploads[0]?.count || 0),
      alertsCount: Number(alertsCount[0]?.count || 0),
    };
  }

  async getRecentDocuments(limit: number = 10): Promise<any[]> {
    // First, get AI-processed documents with metadata
    const processedItems = await db
      .select({
        id: egnyteItems.id,
        name: egnyteItems.name,
        path: egnyteItems.egnytePath,
        fileType: egnyteItems.fileType,
        fileSizeBytes: egnyteItems.fileSizeBytes,
        egnyteLastModified: egnyteItems.egnyteLastModified,
        createdAt: egnyteItems.createdAt,
        summary: documentAiMetadata.summary,
        projectName: documentAiMetadata.projectName,
        processingStatus: documentAiMetadata.processingStatus,
        categoryId: documentAiMetadata.categoryId,
        processedAt: documentAiMetadata.processedAt,
      })
      .from(egnyteItems)
      .innerJoin(documentAiMetadata, eq(egnyteItems.id, documentAiMetadata.egnyteItemId))
      .where(and(
        eq(egnyteItems.tenantId, this.tenantId), 
        eq(egnyteItems.isFolder, false),
        eq(documentAiMetadata.processingStatus, "completed")
      ))
      .orderBy(desc(documentAiMetadata.processedAt))
      .limit(limit);

    if (processedItems.length >= limit) {
      // Enrich with category names
      const enrichedItems = await Promise.all(
        processedItems.map(async (item) => {
          let category: DocumentCategory | null = null;
          if (item.categoryId) {
            const [cat] = await db
              .select()
              .from(documentCategories)
              .where(eq(documentCategories.id, item.categoryId));
            category = cat;
          }
          return {
            id: item.id,
            name: item.name,
            path: item.path,
            fileType: item.fileType,
            fileSizeBytes: item.fileSizeBytes,
            egnyteLastModified: item.egnyteLastModified,
            createdAt: item.createdAt,
            category: category?.displayName,
            categoryIcon: category?.icon,
            categoryColor: category?.color,
            summary: item.summary,
            projectName: item.projectName,
            processingStatus: item.processingStatus,
          };
        })
      );
      return enrichedItems;
    }

    // Fallback: get recent items if not enough processed
    const items = await db
      .select({
        id: egnyteItems.id,
        name: egnyteItems.name,
        path: egnyteItems.egnytePath,
        fileType: egnyteItems.fileType,
        fileSizeBytes: egnyteItems.fileSizeBytes,
        egnyteLastModified: egnyteItems.egnyteLastModified,
        createdAt: egnyteItems.createdAt,
      })
      .from(egnyteItems)
      .where(and(eq(egnyteItems.tenantId, this.tenantId), eq(egnyteItems.isFolder, false)))
      .orderBy(desc(egnyteItems.createdAt))
      .limit(limit);

    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const [metadata] = await db
          .select()
          .from(documentAiMetadata)
          .where(eq(documentAiMetadata.egnyteItemId, item.id));

        let category: DocumentCategory | null = null;
        if (metadata?.categoryId) {
          const [cat] = await db
            .select()
            .from(documentCategories)
            .where(eq(documentCategories.id, metadata.categoryId));
          category = cat;
        }

        return {
          ...item,
          category: category?.displayName,
          categoryIcon: category?.icon,
          categoryColor: category?.color,
          summary: metadata?.summary,
          projectName: metadata?.projectName,
          processingStatus: metadata?.processingStatus || "pending",
        };
      })
    );

    return enrichedItems;
  }
}

// Global processing state for tracking batch progress
let batchProcessingState: {
  isProcessing: boolean;
  totalToProcess: number;
  processed: number;
  failed: number;
  startedAt: Date | null;
  estimatedCompletion: Date | null;
  currentBatch: number;
  totalBatches: number;
  lastError: string | null;
} = {
  isProcessing: false,
  totalToProcess: 0,
  processed: 0,
  failed: 0,
  startedAt: null,
  estimatedCompletion: null,
  currentBatch: 0,
  totalBatches: 0,
  lastError: null,
};

export function getBatchProcessingState() {
  return { ...batchProcessingState };
}

export function createDocumentIntelligenceService(tenantId: string): DocumentIntelligenceService {
  return new DocumentIntelligenceService(tenantId);
}

export async function processBatchDocuments(
  tenantId: string,
  batchSize: number = 10,
  delayMs: number = 500
): Promise<void> {
  if (batchProcessingState.isProcessing) {
    console.log("[DocIntelligence] Batch processing already in progress");
    return;
  }

  const service = new DocumentIntelligenceService(tenantId);
  
  // Get count of unprocessed documents
  const unprocessedCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(egnyteItems)
    .leftJoin(documentAiMetadata, eq(egnyteItems.id, documentAiMetadata.egnyteItemId))
    .where(and(
      eq(egnyteItems.tenantId, tenantId),
      eq(egnyteItems.isFolder, false),
      isNull(documentAiMetadata.id)
    ));

  const totalToProcess = Number(unprocessedCount[0]?.count || 0);
  
  if (totalToProcess === 0) {
    console.log("[DocIntelligence] No documents to process");
    return;
  }

  // Initialize processing state
  batchProcessingState = {
    isProcessing: true,
    totalToProcess,
    processed: 0,
    failed: 0,
    startedAt: new Date(),
    estimatedCompletion: null,
    currentBatch: 0,
    totalBatches: Math.ceil(totalToProcess / batchSize),
    lastError: null,
  };

  console.log(`[DocIntelligence] Starting batch processing of ${totalToProcess} documents`);

  try {
    let hasMore = true;
    
    while (hasMore && batchProcessingState.isProcessing) {
      batchProcessingState.currentBatch++;
      
      // Get next batch of unprocessed documents
      const unprocessedFiles = await db
        .select()
        .from(egnyteItems)
        .leftJoin(documentAiMetadata, eq(egnyteItems.id, documentAiMetadata.egnyteItemId))
        .where(and(
          eq(egnyteItems.tenantId, tenantId),
          eq(egnyteItems.isFolder, false),
          isNull(documentAiMetadata.id)
        ))
        .limit(batchSize);

      if (unprocessedFiles.length === 0) {
        hasMore = false;
        break;
      }

      // Process each document in the batch
      for (const file of unprocessedFiles) {
        try {
          const metadata = await service.processDocument(file.egnyte_items.id);
          if (metadata) {
            batchProcessingState.processed++;
          } else {
            batchProcessingState.failed++;
          }
        } catch (error: any) {
          batchProcessingState.failed++;
          batchProcessingState.lastError = error.message;
          console.error(`[DocIntelligence] Error processing ${file.egnyte_items.name}:`, error.message);
        }

        // Update estimated completion time
        const elapsed = Date.now() - batchProcessingState.startedAt!.getTime();
        const docsProcessed = batchProcessingState.processed + batchProcessingState.failed;
        if (docsProcessed > 0) {
          const avgTimePerDoc = elapsed / docsProcessed;
          const remaining = batchProcessingState.totalToProcess - docsProcessed;
          const estimatedRemainingMs = remaining * avgTimePerDoc;
          batchProcessingState.estimatedCompletion = new Date(Date.now() + estimatedRemainingMs);
        }

        // Rate limiting delay between documents
        if (delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }

      console.log(`[DocIntelligence] Batch ${batchProcessingState.currentBatch}/${batchProcessingState.totalBatches} complete. Progress: ${batchProcessingState.processed}/${batchProcessingState.totalToProcess}`);
    }
  } catch (error: any) {
    batchProcessingState.lastError = error.message;
    console.error("[DocIntelligence] Batch processing error:", error);
  } finally {
    batchProcessingState.isProcessing = false;
    console.log(`[DocIntelligence] Batch processing complete. Processed: ${batchProcessingState.processed}, Failed: ${batchProcessingState.failed}`);
  }
}

export function stopBatchProcessing(): void {
  batchProcessingState.isProcessing = false;
}
