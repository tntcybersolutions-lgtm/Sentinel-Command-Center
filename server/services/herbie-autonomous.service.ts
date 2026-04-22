import { db } from "../db";
import { 
  jacketDocuments, 
  jacketFolders,
  bidProjects, 
  opportunities,
  bidChecklists,
  bidChecklistItems,
  herbieReviewQueue,
  companies,
  approvalRequests,
  subcontractors,
  opportunityScores,
  buyers,
} from "@shared/schema";
import { eq, and, desc, ne, like, isNotNull, isNull, inArray, sql, lt } from "drizzle-orm";
import { randomUUID } from "crypto";
import { CONFIDENCE_THRESHOLDS } from "@shared/schema";
import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";

interface ConstructionKB {
  documentTypes: Record<string, {
    name: string;
    folder: string;
    priority: string;
    extractFields: string[];
    keywords: string[];
    confidenceBoost: number;
    requiredForBid: boolean;
  }>;
  bidJacketFolders: Record<string, {
    displayName: string;
    description: string;
    requiredDocuments: { type: string; name: string; priority: string; description: string }[];
    keywords: string[];
  }>;
  missingDocumentRules: {
    criticalMissing: { rules: { documentType: string; folder: string; severity: string; message: string; suggestFromPastBids: boolean }[] };
    highPriority: { rules: { documentType: string; folder: string; severity: string; message: string; suggestFromPastBids: boolean }[] };
    mediumPriority: { rules: { documentType: string; folder: string; severity: string; message: string; suggestFromPastBids: boolean }[] };
  };
  proactiveAlerts: {
    templates: Record<string, { title: string; template: string; priority: string; actionable: boolean }>;
  };
}

let constructionKB: ConstructionKB | null = null;

function loadConstructionKB(): ConstructionKB {
  if (constructionKB) return constructionKB;
  
  try {
    const kbPath = path.join(process.cwd(), "server/data/construction-kb.json");
    const data = fs.readFileSync(kbPath, "utf-8");
    constructionKB = JSON.parse(data);
    console.log("HERBIE: Construction Knowledge Base loaded successfully");
    return constructionKB!;
  } catch (e) {
    console.error("HERBIE: Failed to load construction KB, using fallback", e);
    return {
      documentTypes: {},
      bidJacketFolders: {},
      missingDocumentRules: { criticalMissing: { rules: [] }, highPriority: { rules: [] }, mediumPriority: { rules: [] } },
      proactiveAlerts: { templates: {} }
    };
  }
}

interface DocumentSuggestion {
  documentId: string;
  documentName: string;
  sourceType: "company_jacket" | "past_bid" | "template";
  sourceName: string;
  matchReason: string;
  confidence: number;
  category: string;
}

interface MissingItem {
  checklistItemId: string;
  itemName: string;
  category: string;
  severity: "critical" | "warning" | "info";
  suggestions: DocumentSuggestion[];
}

interface AutoScanResult {
  documentId: string;
  category: string;
  subCategory?: string;
  extractedFields: Record<string, any>;
  suggestedBidId?: string;
  suggestedFolder?: string;
  confidence: number;
  autoFiled: boolean;
  requiresReview: boolean;
}

const DOCUMENT_CATEGORIES = {
  solicitation: ["RFP", "RFQ", "IFB", "solicitation", "request for proposal", "invitation for bid"],
  insurance: ["certificate of insurance", "COI", "insurance certificate", "liability insurance", "workers comp"],
  bonding: ["bid bond", "performance bond", "payment bond", "surety bond", "bonding capacity"],
  pricing: ["price proposal", "cost proposal", "pricing schedule", "bill of quantities", "estimate"],
  technical: ["technical proposal", "technical volume", "approach", "methodology", "work plan"],
  forms: ["SF-330", "SF-1442", "representations", "certifications", "reps and certs"],
  pastPerformance: ["past performance", "project experience", "reference", "cpars"],
  subQuotes: ["subcontractor quote", "sub bid", "vendor quote", "material quote"],
  plans: ["drawings", "blueprints", "plans", "specs", "specifications"],
  addendum: ["addendum", "amendment", "modification"],
  contract: ["contract", "agreement", "task order", "delivery order"],
  correspondence: ["email", "letter", "transmittal", "memo"],
};

export class HerbieAutonomousService {
  private tenantId: string;
  private openai: OpenAI | null;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
    this.openai = process.env.OPENAI_API_KEY 
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null;
  }

  async autoScanDocument(documentId: string): Promise<AutoScanResult> {
    const doc = await db.select()
      .from(jacketDocuments)
      .where(eq(jacketDocuments.id, documentId))
      .limit(1);

    if (doc.length === 0) {
      throw new Error(`Document ${documentId} not found`);
    }

    const document = doc[0];
    const fileName = document.fileName.toLowerCase();
    const title = (document.title || "").toLowerCase();
    
    let category = "other";
    let confidence = 0.5;
    let subCategory: string | undefined;

    for (const [cat, keywords] of Object.entries(DOCUMENT_CATEGORIES)) {
      for (const keyword of keywords) {
        if (fileName.includes(keyword.toLowerCase()) || title.includes(keyword.toLowerCase())) {
          category = cat;
          confidence = 0.85;
          break;
        }
      }
      if (category !== "other") break;
    }

    const mimeType = document.mimeType || "";
    if (mimeType.includes("pdf")) {
      confidence += 0.05;
    }

    if (this.openai && confidence < CONFIDENCE_THRESHOLDS.HIGH) {
      try {
        const aiResult = await this.classifyWithAI(document.fileName, document.title || "", category);
        if (aiResult.confidence > confidence) {
          category = aiResult.category;
          confidence = aiResult.confidence;
          subCategory = aiResult.subCategory;
        }
      } catch (e) {
        console.error("AI classification failed:", e);
      }
    }

    const extractedFields = await this.extractFieldsFromDocument(document);
    const suggestedBid = await this.findMatchingBid(extractedFields);
    const suggestedFolder = this.mapCategoryToFolder(category);

    const autoFiled = confidence >= CONFIDENCE_THRESHOLDS.HIGH;
    const requiresReview = confidence < CONFIDENCE_THRESHOLDS.MEDIUM_LOW;

    if (autoFiled && suggestedBid && suggestedFolder) {
      await this.autoFileDocument(documentId, suggestedBid, suggestedFolder, category);
    }

    if (requiresReview) {
      await this.queueForReview(documentId, category, confidence, "Low confidence classification");
    }

    await db.update(jacketDocuments)
      .set({
        documentType: category,
      })
      .where(eq(jacketDocuments.id, documentId));

    return {
      documentId,
      category,
      subCategory,
      extractedFields,
      suggestedBidId: suggestedBid,
      suggestedFolder,
      confidence,
      autoFiled,
      requiresReview,
    };
  }

  private classifyWithKnowledgeBase(fileName: string, title: string): {
    category: string;
    subCategory?: string;
    confidence: number;
    folder?: string;
  } {
    const kb = loadConstructionKB();
    const searchText = `${fileName} ${title}`.toLowerCase();
    
    let bestMatch = { category: "other", confidence: 0.5, folder: "01_Bid_Request" };
    
    for (const [docType, docInfo] of Object.entries(kb.documentTypes)) {
      for (const keyword of docInfo.keywords) {
        if (searchText.includes(keyword.toLowerCase())) {
          const confidence = 0.75 + docInfo.confidenceBoost;
          if (confidence > bestMatch.confidence) {
            bestMatch = {
              category: docType,
              confidence: Math.min(confidence, 0.92),
              folder: docInfo.folder
            };
          }
        }
      }
    }
    
    for (const [folderKey, folderInfo] of Object.entries(kb.bidJacketFolders)) {
      for (const keyword of folderInfo.keywords) {
        if (searchText.includes(keyword.toLowerCase())) {
          if (bestMatch.confidence < 0.7) {
            bestMatch.folder = folderKey;
            bestMatch.confidence = 0.7;
          }
        }
      }
    }
    
    return bestMatch;
  }

  private async classifyWithAI(fileName: string, title: string, currentCategory: string): Promise<{
    category: string;
    subCategory?: string;
    confidence: number;
  }> {
    const kbResult = this.classifyWithKnowledgeBase(fileName, title);
    
    if (!this.openai) {
      console.log(`HERBIE: Using KB fallback for classification (no OpenAI) - ${kbResult.category} @ ${kbResult.confidence.toFixed(2)}`);
      return kbResult;
    }

    try {
      const categories = Object.keys(DOCUMENT_CATEGORIES);
      
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a construction document classifier. Classify the document into one of these categories: ${categories.join(", ")}. Respond with JSON: {"category": "string", "subCategory": "string or null", "confidence": 0.0-1.0}`
          },
          {
            role: "user",
            content: `Classify this document:\nFilename: ${fileName}\nTitle: ${title}`
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 100,
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      return {
        category: result.category || currentCategory,
        subCategory: result.subCategory,
        confidence: Math.min(result.confidence || 0.5, 0.95),
      };
    } catch (e) {
      console.log(`HERBIE: AI classification failed, using KB fallback - ${kbResult.category} @ ${kbResult.confidence.toFixed(2)}`);
      return kbResult;
    }
  }

  private async extractFieldsFromDocument(document: typeof jacketDocuments.$inferSelect): Promise<Record<string, any>> {
    const fields: Record<string, any> = {};
    
    const fileName = document.fileName;
    const dateMatch = fileName.match(/(\d{4}[-_]\d{2}[-_]\d{2})|(\d{2}[-_]\d{2}[-_]\d{4})/);
    if (dateMatch) {
      fields.documentDate = dateMatch[0].replace(/_/g, "-");
    }

    const solMatch = fileName.match(/([A-Z0-9]{2,}-\d{2,}-[A-Z0-9]{2,})/i);
    if (solMatch) {
      fields.solicitationNumber = solMatch[1];
    }

    const amountMatch = fileName.match(/\$?([\d,]+(?:\.\d{2})?)/);
    if (amountMatch) {
      const amount = parseFloat(amountMatch[1].replace(/,/g, ""));
      if (amount > 1000) {
        fields.amount = amount;
      }
    }

    return fields;
  }

  private async findMatchingBid(
    extractedFields: Record<string, any>
  ): Promise<string | undefined> {
    if (extractedFields.solicitationNumber) {
      const matchingOpp = await db.select()
        .from(opportunities)
        .where(like(opportunities.externalId, `%${extractedFields.solicitationNumber}%`))
        .limit(1);

      if (matchingOpp.length > 0) {
        const bid = await db.select()
          .from(bidProjects)
          .where(eq(bidProjects.opportunityId, matchingOpp[0].id))
          .limit(1);
        
        if (bid.length > 0) {
          return bid[0].id;
        }
      }
    }

    const recentBids = await db.select()
      .from(bidProjects)
      .where(eq(bidProjects.tenantId, this.tenantId))
      .orderBy(desc(bidProjects.createdAt))
      .limit(5);

    if (recentBids.length === 1) {
      return recentBids[0].id;
    }

    return undefined;
  }

  private mapCategoryToFolder(category: string): string {
    const mapping: Record<string, string> = {
      solicitation: "01_Bid_Request",
      plans: "02_Plans_and_Specs",
      addendum: "04_Addenda",
      pricing: "05_Takeoff_and_Estimating",
      subQuotes: "06_Subcontractor_Quotes",
      forms: "07_Final_Bid_Submission",
      technical: "07_Final_Bid_Submission",
      insurance: "07_Final_Bid_Submission",
      bonding: "07_Final_Bid_Submission",
      pastPerformance: "07_Final_Bid_Submission",
      correspondence: "08_Bid_Communications",
    };
    return mapping[category] || "01_Bid_Request";
  }

  private async autoFileDocument(
    documentId: string, 
    bidProjectId: string, 
    folderName: string,
    category: string
  ): Promise<void> {
    const folder = await db.select()
      .from(jacketFolders)
      .where(and(
        eq(jacketFolders.jacketId, bidProjectId),
        eq(jacketFolders.jacketType, "bid"),
        like(jacketFolders.name, `%${folderName}%`)
      ))
      .limit(1);

    if (folder.length > 0) {
      await db.update(jacketDocuments)
        .set({
          folderId: folder[0].id,
          documentType: category,
        })
        .where(eq(jacketDocuments.id, documentId));
    }
  }

  private async queueForReview(
    documentId: string,
    category: string,
    confidence: number,
    reason: string
  ): Promise<void> {
    await db.insert(herbieReviewQueue).values({
      id: randomUUID(),
      tenantId: this.tenantId,
      documentId,
      reviewType: "classification",
      actionProposed: `Classify as ${category}`,
      confidence: confidence.toFixed(2),
      reasoningText: reason,
      status: "pending",
    });
  }

  async findMissingDocuments(bidProjectId: string): Promise<MissingItem[]> {
    const checklist = await db.select()
      .from(bidChecklists)
      .where(eq(bidChecklists.bidProjectId, bidProjectId))
      .limit(1);

    if (checklist.length === 0) {
      return [];
    }

    const items = await db.select()
      .from(bidChecklistItems)
      .where(and(
        eq(bidChecklistItems.checklistId, checklist[0].id),
        eq(bidChecklistItems.isCompleted, false)
      ));

    const missingItems: MissingItem[] = [];

    for (const item of items) {
      const suggestions = await this.findSuggestionsForItem(item.itemText, bidProjectId);
      const category = this.inferCategoryFromItemText(item.itemText);
      
      missingItems.push({
        checklistItemId: item.id,
        itemName: item.itemText,
        category,
        severity: item.isRequired ? "critical" : "warning",
        suggestions,
      });
    }

    return missingItems;
  }

  private inferCategoryFromItemText(itemText: string): string {
    const text = itemText.toLowerCase();
    if (text.includes("insurance") || text.includes("certificate")) return "insurance";
    if (text.includes("bond")) return "bonding";
    if (text.includes("past performance") || text.includes("reference")) return "pastPerformance";
    if (text.includes("price") || text.includes("cost")) return "pricing";
    if (text.includes("technical")) return "technical";
    if (text.includes("form") || text.includes("sf-")) return "forms";
    return "other";
  }

  private async findSuggestionsForItem(
    itemText: string,
    bidProjectId: string
  ): Promise<DocumentSuggestion[]> {
    const suggestions: DocumentSuggestion[] = [];
    const itemName = itemText.toLowerCase();

    const companyFolders = await db.select()
      .from(jacketFolders)
      .where(eq(jacketFolders.jacketType, "company"))
      .limit(10);

    for (const folder of companyFolders) {
      const docs = await db.select()
        .from(jacketDocuments)
        .where(and(
          eq(jacketDocuments.folderId, folder.id),
          eq(jacketDocuments.status, "active")
        ))
        .limit(5);

      for (const doc of docs) {
        const docName = doc.fileName.toLowerCase();
        const docType = (doc.documentType || "").toLowerCase();
        
        let matchScore = 0;
        if (itemName.includes("insurance") && (docName.includes("insurance") || docType === "insurance")) {
          matchScore = 0.9;
        } else if (itemName.includes("bond") && (docName.includes("bond") || docType === "bonding")) {
          matchScore = 0.9;
        } else if (itemName.includes("past performance") && docType === "pastperformance") {
          matchScore = 0.85;
        }

        if (matchScore > 0.7) {
          suggestions.push({
            documentId: doc.id,
            documentName: doc.fileName,
            sourceType: "company_jacket",
            sourceName: folder.name,
            matchReason: `Found in company ${folder.name}`,
            confidence: matchScore,
            category: doc.documentType || "other",
          });
        }
      }
    }

    const similarBids = await db.select()
      .from(bidProjects)
      .innerJoin(opportunities, eq(bidProjects.opportunityId, opportunities.id))
      .where(and(
        eq(bidProjects.tenantId, this.tenantId),
        ne(bidProjects.id, bidProjectId),
        eq(bidProjects.status, "submitted")
      ))
      .orderBy(desc(bidProjects.createdAt))
      .limit(3);

    for (const pastBid of similarBids) {
      const bidFolders = await db.select()
        .from(jacketFolders)
        .where(and(
          eq(jacketFolders.jacketType, "bid"),
          eq(jacketFolders.jacketId, pastBid.bid_projects.id)
        ));

      for (const folder of bidFolders) {
        const docs = await db.select()
          .from(jacketDocuments)
          .where(and(
            eq(jacketDocuments.folderId, folder.id),
            eq(jacketDocuments.status, "active")
          ))
          .limit(3);

        for (const doc of docs) {
          const docName = doc.fileName.toLowerCase();
          
          if (this.itemMatchesDocument(itemName, docName, doc.documentType)) {
            suggestions.push({
              documentId: doc.id,
              documentName: doc.fileName,
              sourceType: "past_bid",
              sourceName: pastBid.opportunities.title,
              matchReason: `Used in past bid: ${pastBid.opportunities.title}`,
              confidence: 0.75,
              category: doc.documentType || "other",
            });
          }
        }
      }
    }

    return suggestions.slice(0, 5);
  }

  private itemMatchesDocument(itemName: string, docName: string, docType: string | null): boolean {
    const typeMatches: Record<string, string[]> = {
      insurance: ["insurance", "certificate", "coi", "liability"],
      bonding: ["bond", "surety", "bonding"],
      pastperformance: ["past performance", "experience", "reference", "cpars"],
      forms: ["sf-330", "sf-1442", "form", "reps", "certs"],
      pricing: ["price", "cost", "estimate", "pricing"],
      technical: ["technical", "approach", "methodology"],
    };

    for (const [type, keywords] of Object.entries(typeMatches)) {
      if (keywords.some(k => itemName.includes(k))) {
        if (docType === type || keywords.some(k => docName.includes(k))) {
          return true;
        }
      }
    }

    return false;
  }

  async detectMissingFromKB(bidProjectId: string): Promise<{
    documentType: string;
    name: string;
    folder: string;
    severity: "critical" | "high" | "medium";
    message: string;
    suggestFromPastBids: boolean;
  }[]> {
    const kb = loadConstructionKB();
    const missingDocs: {
      documentType: string;
      name: string;
      folder: string;
      severity: "critical" | "high" | "medium";
      message: string;
      suggestFromPastBids: boolean;
    }[] = [];

    const folders = await db.select()
      .from(jacketFolders)
      .where(and(
        eq(jacketFolders.jacketId, bidProjectId),
        eq(jacketFolders.jacketType, "bid")
      ));

    const folderIds = folders.map(f => f.id);
    
    const existingDocs = folderIds.length > 0 
      ? await db.select()
          .from(jacketDocuments)
          .where(and(
            eq(jacketDocuments.status, "active"),
            eq(jacketDocuments.latestVersion, true)
          ))
      : [];
    
    const existingTypes = new Set(existingDocs.map(d => d.documentType?.toLowerCase()));
    const existingNames = existingDocs.map(d => d.fileName.toLowerCase()).join(" ");

    for (const rule of kb.missingDocumentRules.criticalMissing.rules) {
      const docType = rule.documentType.toLowerCase();
      const hasDoc = existingTypes.has(docType) || 
        (kb.documentTypes[rule.documentType]?.keywords || []).some(k => 
          existingNames.includes(k.toLowerCase())
        );
      
      if (!hasDoc) {
        missingDocs.push({
          documentType: rule.documentType,
          name: kb.documentTypes[rule.documentType]?.name || rule.documentType,
          folder: rule.folder,
          severity: "critical",
          message: rule.message,
          suggestFromPastBids: rule.suggestFromPastBids
        });
      }
    }

    for (const rule of kb.missingDocumentRules.highPriority.rules) {
      const docType = rule.documentType.toLowerCase();
      const hasDoc = existingTypes.has(docType);
      
      if (!hasDoc) {
        missingDocs.push({
          documentType: rule.documentType,
          name: kb.documentTypes[rule.documentType]?.name || rule.documentType,
          folder: rule.folder,
          severity: "high",
          message: rule.message,
          suggestFromPastBids: rule.suggestFromPastBids
        });
      }
    }

    return missingDocs.slice(0, 10);
  }

  async getProactiveSuggestions(bidProjectId: string): Promise<{
    category: string;
    message: string;
    action: string;
    priority: "high" | "medium" | "low";
    suggestions: DocumentSuggestion[];
  }[]> {
    const result: {
      category: string;
      message: string;
      action: string;
      priority: "high" | "medium" | "low";
      suggestions: DocumentSuggestion[];
    }[] = [];

    const missing = await this.findMissingDocuments(bidProjectId);
    
    const criticalMissing = missing.filter(m => m.severity === "critical" && m.suggestions.length > 0);
    for (const item of criticalMissing) {
      result.push({
        category: item.category,
        message: `Missing ${item.itemName} - I found ${item.suggestions.length} matching document(s)`,
        action: "attach_suggestion",
        priority: "high",
        suggestions: item.suggestions,
      });
    }

    if (result.length === 0) {
      const kbMissing = await this.detectMissingFromKB(bidProjectId);
      
      for (const item of kbMissing.filter(m => m.severity === "critical")) {
        const suggestions: DocumentSuggestion[] = [];
        
        if (item.suggestFromPastBids) {
          const pastDocs = await this.findSuggestionsForItem(item.name, bidProjectId);
          suggestions.push(...pastDocs);
        }
        
        result.push({
          category: item.documentType,
          message: item.message + (suggestions.length > 0 ? ` Found ${suggestions.length} reusable document(s).` : ""),
          action: suggestions.length > 0 ? "attach_suggestion" : "upload_required",
          priority: "high",
          suggestions,
        });
      }

      for (const item of kbMissing.filter(m => m.severity === "high").slice(0, 3)) {
        result.push({
          category: item.documentType,
          message: item.message,
          action: "upload_recommended",
          priority: "medium",
          suggestions: [],
        });
      }
    }

    const bid = await db.select()
      .from(bidProjects)
      .innerJoin(opportunities, eq(bidProjects.opportunityId, opportunities.id))
      .where(eq(bidProjects.id, bidProjectId))
      .limit(1);

    if (bid.length > 0) {
      const deadline = bid[0].opportunities.dueAt;
      if (deadline) {
        const daysUntilDue = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysUntilDue <= 3 && daysUntilDue > 0) {
          result.push({
            category: "deadline",
            message: `Bid due in ${daysUntilDue} day(s) - review all documents before submission`,
            action: "review_checklist",
            priority: "high",
            suggestions: [],
          });
        } else if (daysUntilDue <= 7 && daysUntilDue > 3) {
          result.push({
            category: "deadline",
            message: `Bid due in ${daysUntilDue} days - ensure all critical documents are ready`,
            action: "review_checklist",
            priority: "medium",
            suggestions: [],
          });
        }
      }
    }

    return result;
  }

  async processNewUpload(documentId: string): Promise<AutoScanResult> {
    const scanResult = await this.autoScanDocument(documentId);
    
    if (scanResult.suggestedBidId) {
      const suggestions = await this.getProactiveSuggestions(scanResult.suggestedBidId);
      console.log(`HERBIE: Document ${documentId} processed. ${suggestions.length} proactive suggestions generated.`);
    }

    return scanResult;
  }

  async autoDraftProposal(bidProjectId: string): Promise<{
    success: boolean;
    sections: ProposalSection[];
    reviewRequestId?: string;
  }> {
    const bid = await db.select()
      .from(bidProjects)
      .innerJoin(opportunities, eq(bidProjects.opportunityId, opportunities.id))
      .where(eq(bidProjects.id, bidProjectId))
      .limit(1);

    if (bid.length === 0) {
      return { success: false, sections: [] };
    }

    const opportunity = bid[0].opportunities;
    const sections: ProposalSection[] = [];

    const technicalApproach = this.generateTechnicalApproach(opportunity);
    sections.push(technicalApproach);

    const pastPerformance = this.generatePastPerformance(opportunity);
    sections.push(pastPerformance);

    const keyPersonnel = this.generateKeyPersonnel();
    sections.push(keyPersonnel);

    const reviewId = randomUUID();
    await db.insert(approvalRequests).values({
      id: reviewId,
      tenantId: this.tenantId,
      entityType: "proposal",
      entityId: bidProjectId,
      actionType: "proposal_draft",
      status: "pending",
      priority: "normal",
      contextJson: {
        title: `Draft proposal for ${opportunity.title}`,
        description: `Generated Technical Approach, Past Performance, and Key Personnel sections based on opportunity requirements.`,
        bidProjectId,
        confidence: 0.85,
        sections: sections.map(s => ({ title: s.title, content: s.content, wordCount: s.content.split(/\s+/).length })),
        undoAction: "delete_proposal_draft"
      }
    });

    console.log(`[HERBIE] Drafted proposal for bid ${bidProjectId} - queued for approval (ID: ${reviewId})`);

    return { success: true, sections, reviewRequestId: reviewId };
  }

  private generateTechnicalApproach(opportunity: typeof opportunities.$inferSelect): ProposalSection {
    const title = opportunity.title || "Construction Project";
    const naicsCode = (opportunity.naicsCodes || [])[0] || "";
    
    let approach = `**Technical Approach for ${title}**\n\n`;
    approach += `**1. Understanding of Requirements**\n\n`;
    approach += `BlackHawk Construction fully understands the scope and requirements of this solicitation. `;
    
    if (naicsCode.startsWith("236")) {
      approach += `As an experienced general contractor specializing in building construction, we have successfully completed numerous similar projects for federal agencies. `;
    } else if (naicsCode.startsWith("237")) {
      approach += `Our extensive experience in heavy civil construction positions us uniquely to deliver this project on time and within budget. `;
    } else if (naicsCode.startsWith("238")) {
      approach += `Our specialty trade capabilities ensure expert execution of all project requirements. `;
    }

    approach += `\n\n**2. Management Approach**\n\n`;
    approach += `Our proven project management methodology ensures clear communication, quality control, and schedule adherence. `;
    approach += `Bradley Hueser (President) provides executive oversight, while Nolan Kosmicki (COO) manages day-to-day operations. `;
    approach += `Dave Hueser (VP) ensures field operations align with client expectations.\n\n`;

    approach += `**3. Quality Control Plan**\n\n`;
    approach += `BlackHawk implements a comprehensive QC program with documented inspections at each phase, `;
    approach += `material certifications, and third-party testing as required. All work is performed to exceed contract specifications.\n\n`;

    approach += `**4. Safety Program**\n\n`;
    approach += `Safety is paramount at BlackHawk Construction. Our OSHA-compliant safety program includes daily toolbox talks, `;
    approach += `site-specific safety plans, and continuous monitoring. Our EMR demonstrates our commitment to workplace safety.\n`;

    return {
      title: "Technical Approach",
      content: approach,
      sectionType: "technical",
      status: "draft"
    };
  }

  private generatePastPerformance(opportunity: typeof opportunities.$inferSelect): ProposalSection {
    const naicsCode = (opportunity.naicsCodes || [])[0] || "236";
    
    let pastPerf = `**Past Performance**\n\n`;
    pastPerf += `BlackHawk Construction has a proven track record of successfully completing federal and commercial projects `;
    pastPerf += `similar in size, scope, and complexity to this requirement.\n\n`;

    pastPerf += `**Relevant Experience:**\n\n`;
    
    if (naicsCode.startsWith("236")) {
      pastPerf += `- **Federal Building Renovation** - $2.4M renovation of federal office facility completed on schedule with zero safety incidents\n`;
      pastPerf += `- **Military Barracks Construction** - $5.1M new construction project delivered 15 days ahead of schedule\n`;
      pastPerf += `- **VA Medical Facility Upgrade** - $1.8M healthcare facility modernization with 100% CPARS rating\n`;
    } else {
      pastPerf += `- **Infrastructure Improvement Project** - $3.2M civil works project completed on budget\n`;
      pastPerf += `- **Site Preparation and Utilities** - $1.5M site development with environmental compliance\n`;
      pastPerf += `- **Federal Complex Maintenance** - $800K annual IDIQ task order performance\n`;
    }

    pastPerf += `\n**Performance Ratings:**\n`;
    pastPerf += `- Average CPARS Rating: Satisfactory to Exceptional\n`;
    pastPerf += `- On-Time Delivery Rate: 95%+\n`;
    pastPerf += `- Change Order Rate: Below industry average\n`;

    return {
      title: "Past Performance",
      content: pastPerf,
      sectionType: "past_performance",
      status: "draft"
    };
  }

  private generateKeyPersonnel(): ProposalSection {
    let personnel = `**Key Personnel**\n\n`;
    
    personnel += `**Bradley Hueser - President / Program Manager**\n`;
    personnel += `- 25+ years construction industry experience\n`;
    personnel += `- Responsible for overall program direction and client relations\n`;
    personnel += `- Direct oversight of major contract performance\n\n`;

    personnel += `**Dave Hueser - Vice President / Quality Control Manager**\n`;
    personnel += `- 20+ years field operations experience\n`;
    personnel += `- Manages quality assurance and field supervision\n`;
    personnel += `- Ensures compliance with contract specifications\n\n`;

    personnel += `**Nolan Kosmicki - Chief Operating Officer / Project Manager**\n`;
    personnel += `- 15+ years project management experience\n`;
    personnel += `- Day-to-day project coordination and scheduling\n`;
    personnel += `- Subcontractor and resource management\n\n`;

    personnel += `**Kathy Hueser - Office Manager / Contract Administrator**\n`;
    personnel += `- 15+ years administrative and contract management\n`;
    personnel += `- Handles invoicing, compliance documentation, and reporting\n`;
    personnel += `- Primary point of contact for contractual matters\n`;

    return {
      title: "Key Personnel",
      content: personnel,
      sectionType: "key_personnel",
      status: "draft"
    };
  }

  async autoFindSubcontractors(bidProjectId: string, trades: string[]): Promise<{
    success: boolean;
    matches: SubcontractorMatch[];
    reviewRequestId?: string;
  }> {
    const matches: SubcontractorMatch[] = [];

    const vendors = await db.select()
      .from(subcontractors)
      .where(eq(subcontractors.tenantId, this.tenantId));

    for (const trade of trades) {
      const tradeLower = trade.toLowerCase();
      const matched = vendors.filter(v => 
        v.trade?.toLowerCase().includes(tradeLower) ||
        v.companyName.toLowerCase().includes(tradeLower)
      );

      for (const vendor of matched.slice(0, 3)) {
        matches.push({
          subcontractorId: vendor.id,
          name: vendor.companyName,
          trade,
          email: vendor.contactEmail || undefined,
          phone: vendor.contactPhone || undefined,
          matchReason: `Specialty matches required trade: ${trade}`,
          qualificationStatus: (vendor as any).isQualified ? "qualified" : "pending"
        });
      }
    }

    if (matches.length > 0) {
      const emailDrafts = matches.map(m => ({
        to: m.email || "unknown@company.com",
        subject: `Invitation to Bid - ${m.trade} Trade`,
        body: `Dear ${m.name},\n\nBlackHawk Construction is soliciting quotes for ${m.trade} work on an upcoming federal project.\n\nPlease contact us at your earliest convenience to discuss scope and pricing.\n\nBest regards,\nNolan Kosmicki\nChief Operating Officer\nBlackHawk Construction`
      }));

      const reviewId = randomUUID();
      await db.insert(approvalRequests).values({
        id: reviewId,
        tenantId: this.tenantId,
        entityType: "subcontractor_outreach",
        entityId: bidProjectId,
        actionType: "send_bid_invitations",
        status: "pending",
        priority: "normal",
        contextJson: {
          title: `Send bid invitations to ${matches.length} subcontractors`,
          description: `Found ${matches.length} matching subcontractors for ${trades.join(", ")} trades. Email drafts ready for review.`,
          bidProjectId,
          trades,
          confidence: 0.80,
          recipients: matches.map(m => ({ name: m.name, email: m.email, trade: m.trade })),
          emailDrafts,
          undoAction: "cancel_outreach"
        }
      });

      return { success: true, matches, reviewRequestId: reviewId };
    }

    return { success: true, matches: [] };
  }

  async autoRequestBidBond(bidProjectId: string, contractValue: number): Promise<{
    success: boolean;
    letterContent?: string;
    reviewRequestId?: string;
  }> {
    const threshold = 100000;
    if (contractValue < threshold) {
      return { success: true, letterContent: undefined };
    }

    const bid = await db.select()
      .from(bidProjects)
      .innerJoin(opportunities, eq(bidProjects.opportunityId, opportunities.id))
      .where(eq(bidProjects.id, bidProjectId))
      .limit(1);

    if (bid.length === 0) {
      return { success: false };
    }

    const opportunity = bid[0].opportunities;
    const bondAmount = Math.min(contractValue * 0.10, contractValue);

    const letter = `
BLACKHAWK CONSTRUCTION
Bid Bond Request

Date: ${new Date().toLocaleDateString()}

To: [Bonding Company Name]

RE: Bid Bond Request for ${opportunity.title}
    Solicitation: ${(opportunity as any).noticeId || opportunity.externalId || "N/A"}
    Contract Value: $${contractValue.toLocaleString()}

Dear Surety Representative,

BlackHawk Construction is requesting a bid bond in the amount of $${bondAmount.toLocaleString()} (${((bondAmount/contractValue)*100).toFixed(0)}% of contract value) for the above-referenced federal solicitation.

Project Details:
- Agency: ${(opportunity as any).agency || opportunity.buyerId || "Federal Government"}
- Location: ${(opportunity as any).placeOfPerformance || "TBD"}
- Bid Due Date: ${opportunity.dueAt?.toLocaleDateString() || "TBD"}

Please issue the bid bond at your earliest convenience. Contact Kathy Hueser at BlackHawk Construction for any additional information required.

Sincerely,

Bradley Hueser
President, BlackHawk Construction
`;

    const reviewId = randomUUID();
    await db.insert(approvalRequests).values({
      id: reviewId,
      tenantId: this.tenantId,
      entityType: "bid_bond",
      entityId: bidProjectId,
      actionType: "request_bid_bond",
      status: "pending",
      priority: "high",
      contextJson: {
        title: `Request bid bond of $${bondAmount.toLocaleString()}`,
        description: `Contract value of $${contractValue.toLocaleString()} exceeds $${threshold.toLocaleString()} threshold, requiring bid bond.`,
        bidProjectId,
        contractValue,
        bondAmount,
        confidence: 0.90,
        letterContent: letter,
        recipientType: "bonding_company",
        undoAction: "cancel_bond_request"
      }
    });

    return { success: true, letterContent: letter, reviewRequestId: reviewId };
  }

  async scoreOpportunity(tenantId: string, opportunityId: string): Promise<{ score: number; breakdown: Record<string, number> }> {
    const oppRows = await db.select()
      .from(opportunities)
      .where(and(eq(opportunities.id, opportunityId), eq(opportunities.tenantId, tenantId)))
      .limit(1);

    if (oppRows.length === 0) {
      throw new Error(`Opportunity ${opportunityId} not found`);
    }

    const opp = oppRows[0];
    const breakdown: Record<string, number> = {};
    let totalScore = 0;

    const naicsCodes = opp.naicsCodes || [];
    const hasConstructionNaics = naicsCodes.some(code =>
      code?.startsWith("236") || code?.startsWith("237") || code?.startsWith("238")
    );
    if (hasConstructionNaics) {
      breakdown.naicsMatch = 20;
      totalScore += 20;
    }

    const setAside = (opp.setAside || "").toLowerCase();
    const setAsideMatches = ["small business", "8(a)", "8a", "hubzone", "sdvosb", "service-disabled", "sba"];
    if (setAsideMatches.some(sa => setAside.includes(sa))) {
      breakdown.setAsideMatch = 15;
      totalScore += 15;
    }

    let agencyName = "";
    if (opp.buyerId) {
      const buyerRows = await db.select().from(buyers).where(eq(buyers.id, opp.buyerId)).limit(1);
      if (buyerRows.length > 0) {
        agencyName = (buyerRows[0].name || "").toLowerCase();
      }
    }
    const titleLower = (opp.title || "").toLowerCase();
    const preferredAgencies = ["dod", "department of defense", "army corps", "usace", "gsa", "general services", "va", "veterans affairs", "dept of the army", "dept of the navy", "dept of the air force"];
    if (preferredAgencies.some(a => agencyName.includes(a) || titleLower.includes(a))) {
      breakdown.agencyPreference = 10;
      totalScore += 10;
    }

    const contractValue = parseFloat(String(opp.contractValue || "0"));
    if (contractValue >= 100000 && contractValue <= 10000000) {
      breakdown.contractValueRange = 15;
      totalScore += 15;
    } else if (contractValue > 0 && contractValue < 100000) {
      breakdown.contractValueRange = 5;
      totalScore += 5;
    }

    if (opp.dueAt) {
      const daysUntilDue = Math.ceil((opp.dueAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysUntilDue > 21) {
        breakdown.responseDeadline = 20;
        totalScore += 20;
      } else if (daysUntilDue > 14) {
        breakdown.responseDeadline = 15;
        totalScore += 15;
      } else if (daysUntilDue > 7) {
        breakdown.responseDeadline = 10;
        totalScore += 10;
      }
    }

    const locationJson = opp.locationJson as { state?: string; city?: string } | null;
    const knownLocations = ["nebraska", "ne", "iowa", "ia", "texas", "tx", "omaha", "council bluffs", "lincoln"];
    if (locationJson) {
      const locStr = JSON.stringify(locationJson).toLowerCase();
      if (knownLocations.some(loc => locStr.includes(loc))) {
        breakdown.geographicProximity = 10;
        totalScore += 10;
      }
    }

    if (hasConstructionNaics) {
      const pastWins = await db.select()
        .from(bidProjects)
        .where(and(
          eq(bidProjects.tenantId, tenantId),
          eq(bidProjects.status, "awarded")
        ))
        .limit(5);

      if (pastWins.length > 0) {
        breakdown.pastPerformance = 10;
        totalScore += 10;
      }
    }

    totalScore = Math.min(totalScore, 100);

    const existingScore = await db.select()
      .from(opportunityScores)
      .where(and(
        eq(opportunityScores.tenantId, tenantId),
        eq(opportunityScores.opportunityId, opportunityId)
      ))
      .limit(1);

    const recommendedAction = totalScore >= 70 ? "bid" : totalScore >= 50 ? "review" : "pass";

    if (existingScore.length > 0) {
      await db.update(opportunityScores)
        .set({
          score: totalScore,
          recommendedAction,
          createdAt: new Date(),
        })
        .where(eq(opportunityScores.id, existingScore[0].id));
    } else {
      await db.insert(opportunityScores).values({
        id: randomUUID(),
        tenantId,
        opportunityId,
        score: totalScore,
        recommendedAction,
      });
    }

    return { score: totalScore, breakdown };
  }

  async runAutoScoring(tenantId: string): Promise<{ scored: number; highScorers: number; approvalRequests: string[] }> {
    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const allOpps = await db.select({ id: opportunities.id })
      .from(opportunities)
      .where(eq(opportunities.tenantId, tenantId));

    const scoredRecently = await db.select({ opportunityId: opportunityScores.opportunityId })
      .from(opportunityScores)
      .where(and(
        eq(opportunityScores.tenantId, tenantId),
        sql`${opportunityScores.createdAt} > ${staleThreshold}`
      ));

    const recentlyScored = new Set(scoredRecently.map(s => s.opportunityId));
    const toScore = allOpps.filter(o => !recentlyScored.has(o.id));

    let scored = 0;
    let highScorers = 0;
    const approvalIds: string[] = [];

    const { eventStreamService } = await import("./event-stream.service");

    for (const opp of toScore) {
      try {
        const result = await this.scoreOpportunity(tenantId, opp.id);
        scored++;

        try {
          eventStreamService.emit("SAM_INGEST_UPDATE", tenantId, {
            opportunityId: opp.id,
            score: result.score,
            action: "scored",
          });
        } catch (e) {
          console.error("SSE emit error (SAM_INGEST_UPDATE):", e);
        }

        if (result.score >= 70) {
          highScorers++;

          const oppData = await db.select()
            .from(opportunities)
            .where(eq(opportunities.id, opp.id))
            .limit(1);

          if (oppData.length > 0) {
            const approvalId = randomUUID();
            await db.insert(approvalRequests).values({
              id: approvalId,
              tenantId,
              entityType: "opportunity",
              entityId: opp.id,
              actionType: "bid_project_create",
              status: "pending",
              priority: result.score >= 85 ? "high" : "normal",
              contextJson: {
                title: `Auto-bid recommendation: ${oppData[0].title}`,
                description: `Opportunity scored ${result.score}/100. Recommended for bid.`,
                opportunityId: opp.id,
                opportunityTitle: oppData[0].title,
                score: result.score,
                breakdown: result.breakdown,
                confidence: result.score / 100,
                undoAction: "cancel_bid_project_create",
              },
            });
            approvalIds.push(approvalId);

            try {
              eventStreamService.emit("APPROVAL_REQUIRED", tenantId, {
                approvalId,
                opportunityId: opp.id,
                title: oppData[0].title,
                score: result.score,
              });
            } catch (e) {
              console.error("SSE emit error (APPROVAL_REQUIRED):", e);
            }
          }
        }
      } catch (e) {
        console.error(`Error scoring opportunity ${opp.id}:`, e);
      }
    }

    return { scored, highScorers, approvalRequests: approvalIds };
  }

  async onApprovalApproved(tenantId: string, approvalId: string): Promise<any> {
    const approvalRows = await db.select()
      .from(approvalRequests)
      .where(and(
        eq(approvalRequests.id, approvalId),
        eq(approvalRequests.tenantId, tenantId)
      ))
      .limit(1);

    if (approvalRows.length === 0) {
      throw new Error(`Approval ${approvalId} not found`);
    }

    const approval = approvalRows[0];

    if (approval.actionType !== "bid_project_create") {
      throw new Error(`Approval ${approvalId} is not a bid_project_create action (found: ${approval.actionType})`);
    }

    const context = approval.contextJson as {
      opportunityId?: string;
      opportunityTitle?: string;
      score?: number;
    } | null;

    const opportunityId = context?.opportunityId || approval.entityId;

    const oppRows = await db.select()
      .from(opportunities)
      .where(eq(opportunities.id, opportunityId))
      .limit(1);

    if (oppRows.length === 0) {
      throw new Error(`Opportunity ${opportunityId} not found`);
    }

    const opp = oppRows[0];

    const bidProjectId = randomUUID();
    const [bidProject] = await db.insert(bidProjects).values({
      id: bidProjectId,
      tenantId,
      opportunityId: opp.id,
      status: "initiated",
    }).returning();

    const { jacketService } = await import("./jacket.service");
    const shortTitle = (opp.title || "Untitled").substring(0, 60);
    const dueDate = opp.dueAt ? opp.dueAt.toISOString().split("T")[0] : "TBD";
    const noticeId = opp.externalId || opp.id.substring(0, 12);

    await jacketService.createBidJacket(tenantId, bidProjectId, noticeId, shortTitle, dueDate);

    await db.update(approvalRequests)
      .set({ status: "approved" })
      .where(eq(approvalRequests.id, approvalId));

    try {
      const { eventStreamService } = await import("./event-stream.service");
      eventStreamService.emit("APPROVAL_APPROVED", tenantId, {
        approvalId,
        bidProjectId,
        opportunityId: opp.id,
        title: opp.title,
      });
    } catch (e) {
      console.error("SSE emit error (APPROVAL_APPROVED):", e);
    }

    return bidProject;
  }

  async getBidReadiness(tenantId: string, bidProjectId: string): Promise<{
    overallScore: number;
    status: "critical" | "in_progress" | "ready";
    categoryScores: Record<string, number>;
    missingItems: string[];
  }> {
    const folders = await db.select()
      .from(jacketFolders)
      .where(and(
        eq(jacketFolders.jacketId, bidProjectId),
        eq(jacketFolders.jacketType, "bid"),
        eq(jacketFolders.tenantId, tenantId)
      ));

    if (folders.length === 0) {
      return {
        overallScore: 0,
        status: "critical",
        categoryScores: {},
        missingItems: ["No bid jacket found - create jacket first"],
      };
    }

    const folderIds = folders.map(f => f.id);
    const documents = folderIds.length > 0
      ? await db.select()
          .from(jacketDocuments)
          .where(and(
            inArray(jacketDocuments.folderId, folderIds),
            eq(jacketDocuments.status, "active")
          ))
      : [];

    const docsByFolder = new Map<string, typeof documents>();
    for (const doc of documents) {
      const existing = docsByFolder.get(doc.folderId!) || [];
      existing.push(doc);
      docsByFolder.set(doc.folderId!, existing);
    }

    const categoryScores: Record<string, number> = {};
    let foldersWithDocs = 0;

    for (const folder of folders) {
      const folderDocs = docsByFolder.get(folder.id) || [];
      const hasDoc = folderDocs.length > 0;
      if (hasDoc) foldersWithDocs++;
      categoryScores[folder.name] = hasDoc ? 100 : 0;
    }

    const folderCompleteness = folders.length > 0
      ? Math.round((foldersWithDocs / folders.length) * 100)
      : 0;

    const requiredDocTypes = [
      { type: "solicitation", label: "Solicitation document", keywords: ["solicitation", "rfp", "rfq", "ifb"] },
      { type: "pricing", label: "Pricing / cost proposal", keywords: ["pricing", "cost", "price", "estimate"] },
      { type: "technical", label: "Technical proposal", keywords: ["technical", "approach", "methodology"] },
      { type: "insurance", label: "Certificate of Insurance", keywords: ["insurance", "coi", "certificate"] },
      { type: "bonding", label: "Bid bond / surety", keywords: ["bond", "surety", "bonding"] },
    ];

    const allDocNames = documents.map(d => d.fileName.toLowerCase()).join(" ");
    const allDocTypes = new Set(documents.map(d => (d.documentType || "").toLowerCase()));

    const missingItems: string[] = [];
    let requiredPresent = 0;

    for (const req of requiredDocTypes) {
      const found = allDocTypes.has(req.type) ||
        req.keywords.some(kw => allDocNames.includes(kw));
      if (found) {
        requiredPresent++;
      } else {
        missingItems.push(req.label);
      }
    }

    const requiredCompleteness = requiredDocTypes.length > 0
      ? Math.round((requiredPresent / requiredDocTypes.length) * 100)
      : 0;

    const overallScore = Math.round((folderCompleteness * 0.4) + (requiredCompleteness * 0.6));

    let status: "critical" | "in_progress" | "ready";
    if (overallScore >= 80) {
      status = "ready";
    } else if (overallScore >= 40) {
      status = "in_progress";
    } else {
      status = "critical";
    }

    return { overallScore, status, categoryScores, missingItems };
  }

  async autoCheckCompliance(bidProjectId: string): Promise<{
    readinessScore: number;
    missingItems: ComplianceItem[];
    presentItems: ComplianceItem[];
  }> {
    const requiredForms = [
      { name: "SF-1442 (Solicitation/Contract Form)", category: "solicitation" },
      { name: "SF-30 (Amendment)", category: "amendments" },
      { name: "Bid Bond", category: "bonding" },
      { name: "Certificate of Insurance", category: "insurance" },
      { name: "Past Performance Questionnaires", category: "past_performance" },
      { name: "Technical Proposal", category: "technical" },
      { name: "Price Schedule", category: "pricing" },
      { name: "Representations & Certifications", category: "forms" },
      { name: "Small Business Subcontracting Plan", category: "compliance" },
      { name: "Safety Plan", category: "technical" },
    ];

    const folders = await db.select()
      .from(jacketFolders)
      .where(and(
        eq(jacketFolders.jacketId, bidProjectId),
        eq(jacketFolders.jacketType, "bid")
      ));

    const folderIds = folders.map(f => f.id);
    
    const documents = folderIds.length > 0 
      ? await db.select()
          .from(jacketDocuments)
          .where(and(
            inArray(jacketDocuments.folderId, folderIds),
            eq(jacketDocuments.status, "active")
          ))
      : [];

    const docNames = documents.map(d => d.fileName.toLowerCase()).join(" ");
    const docTypes = new Set(documents.map(d => d.documentType?.toLowerCase()));

    const missingItems: ComplianceItem[] = [];
    const presentItems: ComplianceItem[] = [];

    for (const form of requiredForms) {
      const nameLower = form.name.toLowerCase();
      const found = docNames.includes(nameLower.split(" ")[0]) || 
                    docTypes.has(form.category);

      if (found) {
        presentItems.push({ name: form.name, category: form.category, status: "present" });
      } else {
        missingItems.push({ name: form.name, category: form.category, status: "missing" });
      }
    }

    const readinessScore = Math.round((presentItems.length / requiredForms.length) * 100);

    return { readinessScore, missingItems, presentItems };
  }
}

interface ProposalSection {
  title: string;
  content: string;
  sectionType: string;
  status: "draft" | "reviewed" | "approved";
}

interface SubcontractorMatch {
  subcontractorId: string;
  name: string;
  trade: string;
  email?: string;
  phone?: string;
  matchReason: string;
  qualificationStatus: "qualified" | "pending" | "expired";
}

interface ComplianceItem {
  name: string;
  category: string;
  status: "present" | "missing";
}

export function createHerbieAutonomousService(tenantId: string): HerbieAutonomousService {
  return new HerbieAutonomousService(tenantId);
}

export const herbieAutonomousService = new HerbieAutonomousService("blackhawk-default");
