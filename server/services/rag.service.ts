import { db } from "../db";
import { documentEmbeddings, knowledgeDocuments, opportunities, bidProjects, approvalRequests, auditEvents } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import OpenAI from "openai";

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI();
  }
  return openaiClient;
}

interface EmbeddingResult {
  entityType: string;
  entityId: string;
  chunkText: string;
  similarity: number;
}

interface SearchResult {
  answer: string;
  sources: Array<{
    type: string;
    id: string;
    title: string;
    excerpt: string;
    link: string;
  }>;
}

export class RAGService {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await getOpenAI().embeddings.create({
        model: "text-embedding-ada-002",
        input: text.slice(0, 8000),
      });
      return response.data[0].embedding;
    } catch (error) {
      console.error("Error generating embedding:", error);
      return [];
    }
  }

  async indexDocument(documentId: string, content: string, entityType: string = "knowledge_document"): Promise<void> {
    const chunks = this.chunkText(content, 1000, 200);
    
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await this.generateEmbedding(chunks[i]);
      
      await db.insert(documentEmbeddings).values({
        tenantId: this.tenantId,
        documentId: entityType === "knowledge_document" ? documentId : null,
        entityType,
        entityId: documentId,
        chunkIndex: i,
        chunkText: chunks[i],
        embeddingJson: embedding,
      });
    }
  }

  async indexOpportunity(opportunityId: string): Promise<void> {
    const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId));
    if (!opp) return;

    const content = `
      Title: ${opp.title}
      Synopsis: ${opp.synopsis || ""}
      NAICS: ${opp.naicsCodes?.join(", ") || ""}
      Set-Aside: ${opp.setAside || ""}
      Description: ${opp.description || ""}
      Posted: ${opp.postedAt}
      Due Date: ${opp.dueAt}
      Contract Value: ${opp.contractValue}
    `;

    await this.indexDocument(opportunityId, content, "opportunity");
  }

  async indexBidProject(bidProjectId: string): Promise<void> {
    const [bid] = await db.select().from(bidProjects).where(eq(bidProjects.id, bidProjectId));
    if (!bid) return;

    const [opp] = bid.opportunityId 
      ? await db.select().from(opportunities).where(eq(opportunities.id, bid.opportunityId))
      : [null];

    const content = `
      Bid Project ID: ${bid.id}
      Opportunity: ${opp?.title || "Unknown"}
      Status: ${bid.status}
    `;

    await this.indexDocument(bidProjectId, content, "bid_project");
  }

  private chunkText(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    let start = 0;
    
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.slice(start, end));
      start = end - overlap;
      if (start >= text.length - overlap) break;
    }
    
    return chunks;
  }

  async search(query: string, limit: number = 5): Promise<EmbeddingResult[]> {
    const queryEmbedding = await this.generateEmbedding(query);
    if (queryEmbedding.length === 0) return [];

    const results = await db
      .select({
        entityType: documentEmbeddings.entityType,
        entityId: documentEmbeddings.entityId,
        chunkText: documentEmbeddings.chunkText,
        embeddingJson: documentEmbeddings.embeddingJson,
      })
      .from(documentEmbeddings)
      .where(eq(documentEmbeddings.tenantId, this.tenantId))
      .limit(100);

    const scoredResults = results
      .map(r => ({
        entityType: r.entityType,
        entityId: r.entityId,
        chunkText: r.chunkText,
        similarity: this.cosineSimilarity(queryEmbedding, r.embeddingJson as number[] || []),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return scoredResults;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    
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

  async searchWithSources(query: string): Promise<SearchResult> {
    const results = await this.search(query, 5);
    
    const sources = await Promise.all(
      results.map(async (r) => {
        let title = "";
        let link = "";
        
        switch (r.entityType) {
          case "knowledge_document":
            const [doc] = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, r.entityId));
            title = doc?.title || "Document";
            link = `/knowledge-vault/${r.entityId}`;
            break;
          case "opportunity":
            const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, r.entityId));
            title = opp?.title || "Opportunity";
            link = `/opportunities/${r.entityId}`;
            break;
          case "bid_project":
            const [bid] = await db.select().from(bidProjects).where(eq(bidProjects.id, r.entityId));
            title = `Bid Project (${bid?.status || "Unknown"})`;
            link = `/bids/${r.entityId}`;
            break;
          default:
            title = `${r.entityType} Record`;
            link = `/${r.entityType}/${r.entityId}`;
        }
        
        return {
          type: r.entityType,
          id: r.entityId,
          title,
          excerpt: r.chunkText.slice(0, 200) + "...",
          link,
        };
      })
    );

    const context = results.map(r => r.chunkText).join("\n\n");
    
    let answer = "";
    try {
      const completion = await getOpenAI().chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are HERBIE, BlackHawk Construction's AI assistant. Answer questions based on the provided context. Always cite your sources by referencing the document titles. Be concise but thorough.`,
          },
          {
            role: "user",
            content: `Context:\n${context}\n\nQuestion: ${query}\n\nProvide a clear, actionable answer based on the context above.`,
          },
        ],
        max_tokens: 1000,
      });
      answer = completion.choices[0]?.message?.content || "I couldn't find relevant information to answer your question.";
    } catch (error) {
      answer = "I encountered an error while processing your question. Please try again.";
    }

    return { answer, sources };
  }

  async getRecentKnowledgeDocuments(limit: number = 10) {
    return db
      .select()
      .from(knowledgeDocuments)
      .where(and(
        eq(knowledgeDocuments.tenantId, this.tenantId),
        eq(knowledgeDocuments.status, "active")
      ))
      .orderBy(desc(knowledgeDocuments.createdAt))
      .limit(limit);
  }

  async createKnowledgeDocument(data: {
    title: string;
    content: string;
    documentType: string;
    sourceUrl?: string;
    sourceSystem?: string;
    metadata?: Record<string, unknown>;
    createdBy?: string;
  }) {
    const [doc] = await db
      .insert(knowledgeDocuments)
      .values({
        tenantId: this.tenantId,
        ...data,
      })
      .returning();

    await this.indexDocument(doc.id, data.content, "knowledge_document");
    return doc;
  }
}

export const createRAGService = (tenantId: string) => new RAGService(tenantId);
