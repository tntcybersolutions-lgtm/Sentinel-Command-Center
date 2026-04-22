import { db } from "../db";
import {
  egnyteItems,
  documentCategories,
  documentAiMetadata,
  documentAiEmbeddings,
  bidProjects,
  opportunities,
  bidDocumentStatus,
  documentRequirements,
} from "@shared/schema";
import { eq, and, desc, sql, ilike, or, gt, lt, isNull, inArray } from "drizzle-orm";
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

interface ParsedQuery {
  intent: "search_documents" | "find_missing" | "check_expiring" | "project_status" | "general_search";
  searchTerms: string[];
  filters: {
    category?: string;
    projectName?: string;
    bidNumber?: string;
    minValue?: number;
    maxValue?: number;
    dateRange?: { start?: string; end?: string };
    year?: number;
    documentType?: string;
  };
  originalQuery: string;
}

interface SearchResult {
  id: string;
  name: string;
  path: string;
  category?: string;
  categoryColor?: string;
  summary?: string;
  projectName?: string;
  contractValue?: number;
  relevanceScore: number;
  matchReason: string;
  actions: {
    open: string;
    download: string;
    share: string;
  };
  metadata?: {
    documentDate?: Date | null;
    expirationDate?: Date | null;
    parties?: any[];
  };
}

interface QueryResponse {
  success: boolean;
  query: ParsedQuery;
  results: SearchResult[];
  totalResults: number;
  suggestions: {
    type: "missing_docs" | "expiring_certs" | "related_search" | "action_needed";
    title: string;
    description: string;
    actionUrl?: string;
  }[];
  processingTime: number;
}

export class HerbieQueryService {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  async processNaturalLanguageQuery(
    query: string,
    filters?: Record<string, any>
  ): Promise<QueryResponse> {
    const startTime = Date.now();

    try {
      const parsedQuery = await this.parseQueryWithAI(query);
      
      if (filters) {
        Object.assign(parsedQuery.filters, filters);
      }

      let results: SearchResult[] = [];
      let suggestions: QueryResponse["suggestions"] = [];

      switch (parsedQuery.intent) {
        case "find_missing":
          const missingResults = await this.findMissingDocuments(parsedQuery);
          results = missingResults.results;
          suggestions = missingResults.suggestions;
          break;
        case "check_expiring":
          const expiringResults = await this.findExpiringDocuments(parsedQuery);
          results = expiringResults.results;
          suggestions = expiringResults.suggestions;
          break;
        case "project_status":
          const projectResults = await this.getProjectDocumentStatus(parsedQuery);
          results = projectResults.results;
          suggestions = projectResults.suggestions;
          break;
        default:
          const searchResults = await this.performSemanticSearch(parsedQuery);
          results = searchResults.results;
          suggestions = searchResults.suggestions;
      }

      const additionalSuggestions = await this.generateContextualSuggestions(parsedQuery, results);
      suggestions = [...suggestions, ...additionalSuggestions];

      return {
        success: true,
        query: parsedQuery,
        results,
        totalResults: results.length,
        suggestions,
        processingTime: Date.now() - startTime,
      };
    } catch (error: any) {
      console.error("[HerbieQuery] Error processing query:", error);
      return {
        success: false,
        query: {
          intent: "general_search",
          searchTerms: [query],
          filters: {},
          originalQuery: query,
        },
        results: [],
        totalResults: 0,
        suggestions: [],
        processingTime: Date.now() - startTime,
      };
    }
  }

  private async parseQueryWithAI(query: string): Promise<ParsedQuery> {
    const prompt = `You are an AI assistant for a construction document management system called HERBIE. 
Parse the following natural language query and extract structured search parameters.

Query: "${query}"

Determine the intent:
- "search_documents": General document search (contracts, invoices, site plans, etc.)
- "find_missing": User wants to find missing required documents for a project/bid
- "check_expiring": User wants to find documents that are expiring soon (insurance, permits, certs)
- "project_status": User wants overall document status for a project
- "general_search": Generic search

Extract any filters mentioned:
- category: contract, invoice, insurance, permit, drawing, rfi, submittal, change_order, proposal, etc.
- projectName: Any project name mentioned
- bidNumber: Any bid or RFQ number mentioned (e.g., "#12847")
- minValue: Minimum contract/value amount (e.g., "$500K" = 500000)
- maxValue: Maximum contract/value amount
- dateRange: Any date ranges mentioned
- year: Specific year mentioned
- documentType: Specific document type (site plan, W9, COI, etc.)

Respond in JSON format:
{
  "intent": "search_documents|find_missing|check_expiring|project_status|general_search",
  "searchTerms": ["array", "of", "key", "search", "terms"],
  "filters": {
    "category": "optional category",
    "projectName": "optional project name",
    "bidNumber": "optional bid number",
    "minValue": optional_number,
    "maxValue": optional_number,
    "dateRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
    "year": optional_number,
    "documentType": "optional document type"
  }
}`;

    try {
      const response = await getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 500,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from AI");
      }

      const parsed = JSON.parse(content);
      return {
        intent: parsed.intent || "general_search",
        searchTerms: parsed.searchTerms || [query],
        filters: parsed.filters || {},
        originalQuery: query,
      };
    } catch (error) {
      console.error("[HerbieQuery] Parse error:", error);
      return {
        intent: "general_search",
        searchTerms: query.split(/\s+/).filter(t => t.length > 2),
        filters: {},
        originalQuery: query,
      };
    }
  }

  private async performSemanticSearch(
    parsedQuery: ParsedQuery
  ): Promise<{ results: SearchResult[]; suggestions: QueryResponse["suggestions"] }> {
    const searchText = [
      ...parsedQuery.searchTerms,
      parsedQuery.filters.projectName,
      parsedQuery.filters.documentType,
      parsedQuery.filters.category,
    ].filter(Boolean).join(" ");

    const queryResponse = await getOpenAI().embeddings.create({
      model: "text-embedding-ada-002",
      input: searchText.slice(0, 8000),
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
    
    let topResults = scored.filter(s => s.similarity > 0.5).slice(0, 20);
    
    if (topResults.length === 0) {
      topResults = scored.slice(0, 10);
    }

    const results: SearchResult[] = [];
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

      if (parsedQuery.filters.category && metadata?.subcategory) {
        const catMatch = metadata.subcategory.toLowerCase().includes(parsedQuery.filters.category.toLowerCase());
        if (!catMatch) continue;
      }

      if (parsedQuery.filters.minValue && metadata?.contractValue) {
        if (parseFloat(metadata.contractValue) < parsedQuery.filters.minValue) continue;
      }

      if (parsedQuery.filters.year && metadata?.documentDate) {
        const docYear = new Date(metadata.documentDate).getFullYear();
        if (docYear !== parsedQuery.filters.year) continue;
      }

      let categoryName: string | undefined;
      let categoryColor: string | undefined;
      if (metadata?.categoryId) {
        const [cat] = await db
          .select()
          .from(documentCategories)
          .where(eq(documentCategories.id, metadata.categoryId));
        categoryName = cat?.displayName;
        categoryColor = cat?.color || undefined;
      }

      const matchReason = this.generateMatchReason(parsedQuery, item, metadata, result.similarity);

      results.push({
        id: item.id,
        name: item.name,
        path: item.egnytePath,
        category: categoryName,
        categoryColor,
        summary: metadata?.summary || undefined,
        projectName: metadata?.projectName || undefined,
        contractValue: metadata?.contractValue ? parseFloat(metadata.contractValue) : undefined,
        relevanceScore: result.similarity,
        matchReason,
        actions: {
          open: `/documents/${item.id}`,
          download: `/api/documents/${item.id}/download`,
          share: `/api/documents/${item.id}/share`,
        },
        metadata: {
          documentDate: metadata?.documentDate,
          expirationDate: metadata?.expirationDate,
          parties: metadata?.parties as any[],
        },
      });
    }

    return {
      results,
      suggestions: [],
    };
  }

  private async findMissingDocuments(
    parsedQuery: ParsedQuery
  ): Promise<{ results: SearchResult[]; suggestions: QueryResponse["suggestions"] }> {
    const bidNumber = parsedQuery.filters.bidNumber;
    let bidId: string | null = null;

    if (bidNumber) {
      const cleanBidNumber = bidNumber.replace(/[#]/g, "").trim();
      const bids = await db
        .select()
        .from(bidProjects)
        .where(and(
          eq(bidProjects.tenantId, this.tenantId),
          ilike(bidProjects.id, `%${cleanBidNumber}%`)
        ))
        .limit(1);
      
      if (bids.length > 0) {
        bidId = bids[0].id;
      }
    }

    const missingDocs = await db
      .select({
        id: bidDocumentStatus.id,
        bidId: bidDocumentStatus.bidId,
        requirementId: bidDocumentStatus.requirementId,
        status: bidDocumentStatus.status,
        dueDate: bidDocumentStatus.dueDate,
      })
      .from(bidDocumentStatus)
      .where(and(
        eq(bidDocumentStatus.tenantId, this.tenantId),
        eq(bidDocumentStatus.status, "missing"),
        bidId ? eq(bidDocumentStatus.bidId, bidId) : sql`1=1`
      ))
      .limit(20);

    const results: SearchResult[] = [];
    const suggestions: QueryResponse["suggestions"] = [];

    for (const doc of missingDocs) {
      const [req] = await db
        .select()
        .from(documentRequirements)
        .where(eq(documentRequirements.id, doc.requirementId));

      if (req) {
        results.push({
          id: doc.id,
          name: req.name,
          path: "",
          category: "Missing",
          categoryColor: "#EF4444",
          summary: req.description || undefined,
          relevanceScore: 1,
          matchReason: `Required document missing for bid ${doc.bidId}`,
          actions: {
            open: `/bids/${doc.bidId}/documents`,
            download: "",
            share: "",
          },
        });
      }
    }

    if (missingDocs.length > 0) {
      suggestions.push({
        type: "action_needed",
        title: `${missingDocs.length} Missing Documents`,
        description: "Upload required documents to complete bid submissions.",
        actionUrl: "/bids/documents",
      });
    }

    return { results, suggestions };
  }

  private async findExpiringDocuments(
    parsedQuery: ParsedQuery
  ): Promise<{ results: SearchResult[]; suggestions: QueryResponse["suggestions"] }> {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringDocs = await db
      .select({
        id: documentAiMetadata.id,
        itemId: documentAiMetadata.egnyteItemId,
        expirationDate: documentAiMetadata.expirationDate,
        projectName: documentAiMetadata.projectName,
        summary: documentAiMetadata.summary,
        categoryId: documentAiMetadata.categoryId,
        policyNumber: documentAiMetadata.policyNumber,
        permitNumber: documentAiMetadata.permitNumber,
      })
      .from(documentAiMetadata)
      .where(and(
        eq(documentAiMetadata.tenantId, this.tenantId),
        lt(documentAiMetadata.expirationDate, thirtyDaysFromNow),
        gt(documentAiMetadata.expirationDate, new Date())
      ))
      .orderBy(documentAiMetadata.expirationDate)
      .limit(20);

    const results: SearchResult[] = [];

    for (const doc of expiringDocs) {
      if (!doc.itemId) continue;

      const [item] = await db
        .select()
        .from(egnyteItems)
        .where(eq(egnyteItems.id, doc.itemId));

      if (!item) continue;

      let categoryName: string | undefined;
      let categoryColor: string | undefined;
      if (doc.categoryId) {
        const [cat] = await db
          .select()
          .from(documentCategories)
          .where(eq(documentCategories.id, doc.categoryId));
        categoryName = cat?.displayName;
        categoryColor = cat?.color || undefined;
      }

      const daysUntilExpiry = doc.expirationDate 
        ? Math.ceil((new Date(doc.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : 0;

      results.push({
        id: item.id,
        name: item.name,
        path: item.egnytePath,
        category: categoryName,
        categoryColor,
        summary: doc.summary || undefined,
        projectName: doc.projectName || undefined,
        relevanceScore: 1 - (daysUntilExpiry / 30),
        matchReason: `Expires in ${daysUntilExpiry} days`,
        actions: {
          open: `/documents/${item.id}`,
          download: `/api/documents/${item.id}/download`,
          share: `/api/documents/${item.id}/share`,
        },
        metadata: {
          expirationDate: doc.expirationDate,
        },
      });
    }

    const suggestions: QueryResponse["suggestions"] = [];
    if (results.length > 0) {
      const urgentCount = results.filter(r => r.relevanceScore > 0.8).length;
      if (urgentCount > 0) {
        suggestions.push({
          type: "expiring_certs",
          title: `${urgentCount} Documents Expiring Soon`,
          description: "These documents expire within the next 7 days and need immediate attention.",
          actionUrl: "/documents?filter=expiring",
        });
      }
    }

    return { results, suggestions };
  }

  private async getProjectDocumentStatus(
    parsedQuery: ParsedQuery
  ): Promise<{ results: SearchResult[]; suggestions: QueryResponse["suggestions"] }> {
    const projectName = parsedQuery.filters.projectName || parsedQuery.searchTerms.join(" ");
    
    const docs = await db
      .select({
        id: documentAiMetadata.id,
        itemId: documentAiMetadata.egnyteItemId,
        summary: documentAiMetadata.summary,
        projectName: documentAiMetadata.projectName,
        categoryId: documentAiMetadata.categoryId,
        processingStatus: documentAiMetadata.processingStatus,
      })
      .from(documentAiMetadata)
      .where(and(
        eq(documentAiMetadata.tenantId, this.tenantId),
        ilike(documentAiMetadata.projectName, `%${projectName}%`)
      ))
      .limit(50);

    const results: SearchResult[] = [];

    for (const doc of docs) {
      if (!doc.itemId) continue;

      const [item] = await db
        .select()
        .from(egnyteItems)
        .where(eq(egnyteItems.id, doc.itemId));

      if (!item) continue;

      let categoryName: string | undefined;
      let categoryColor: string | undefined;
      if (doc.categoryId) {
        const [cat] = await db
          .select()
          .from(documentCategories)
          .where(eq(documentCategories.id, doc.categoryId));
        categoryName = cat?.displayName;
        categoryColor = cat?.color || undefined;
      }

      results.push({
        id: item.id,
        name: item.name,
        path: item.egnytePath,
        category: categoryName,
        categoryColor,
        summary: doc.summary || undefined,
        projectName: doc.projectName || undefined,
        relevanceScore: 0.9,
        matchReason: `Project: ${doc.projectName}`,
        actions: {
          open: `/documents/${item.id}`,
          download: `/api/documents/${item.id}/download`,
          share: `/api/documents/${item.id}/share`,
        },
      });
    }

    return {
      results,
      suggestions: [],
    };
  }

  private async generateContextualSuggestions(
    parsedQuery: ParsedQuery,
    results: SearchResult[]
  ): Promise<QueryResponse["suggestions"]> {
    const suggestions: QueryResponse["suggestions"] = [];

    if (results.length === 0) {
      suggestions.push({
        type: "related_search",
        title: "No Documents Found",
        description: "Try broadening your search or checking if documents have been uploaded.",
      });
    }

    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const expiringCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(documentAiMetadata)
      .where(and(
        eq(documentAiMetadata.tenantId, this.tenantId),
        lt(documentAiMetadata.expirationDate, thirtyDaysFromNow),
        gt(documentAiMetadata.expirationDate, new Date())
      ));

    if (Number(expiringCount[0]?.count || 0) > 0) {
      suggestions.push({
        type: "expiring_certs",
        title: `${expiringCount[0].count} Expiring Documents`,
        description: "Some documents in your system are expiring within 30 days.",
        actionUrl: "/documents?filter=expiring",
      });
    }

    const missingCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(bidDocumentStatus)
      .where(and(
        eq(bidDocumentStatus.tenantId, this.tenantId),
        eq(bidDocumentStatus.status, "missing")
      ));

    if (Number(missingCount[0]?.count || 0) > 0) {
      suggestions.push({
        type: "missing_docs",
        title: `${missingCount[0].count} Missing Documents`,
        description: "Some bids are missing required documentation.",
        actionUrl: "/bids?filter=missing-docs",
      });
    }

    return suggestions;
  }

  private generateMatchReason(
    parsedQuery: ParsedQuery,
    item: any,
    metadata: any,
    similarity: number
  ): string {
    const reasons: string[] = [];

    for (const term of parsedQuery.searchTerms) {
      if (item.name.toLowerCase().includes(term.toLowerCase())) {
        reasons.push(`Filename contains "${term}"`);
      }
      if (metadata?.projectName?.toLowerCase().includes(term.toLowerCase())) {
        reasons.push(`Project matches "${term}"`);
      }
      if (metadata?.summary?.toLowerCase().includes(term.toLowerCase())) {
        reasons.push(`Content mentions "${term}"`);
      }
    }

    if (reasons.length === 0) {
      if (similarity > 0.85) {
        reasons.push("High semantic similarity to your query");
      } else if (similarity > 0.7) {
        reasons.push("Related to your search terms");
      } else {
        reasons.push("Possible match based on content analysis");
      }
    }

    return reasons.slice(0, 2).join("; ");
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
}

export function createHerbieQueryService(tenantId: string): HerbieQueryService {
  return new HerbieQueryService(tenantId);
}
