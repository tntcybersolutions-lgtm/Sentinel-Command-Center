import { db } from "../db";
import { 
  herbieExtractionEvidence, 
  herbieReviewQueue,
  bidProjects, 
  opportunities,
  egnyteItems,
  documentAiMetadata,
  jacketDocuments
} from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { CONFIDENCE_THRESHOLDS, HIGH_RISK_ACTIONS } from "@shared/schema";
import OpenAI from "openai";

interface ExtractedField {
  category: string;
  fieldName: string;
  value: string | object;
  confidence: number;
  method: "deterministic" | "ai" | "ocr";
  pageNumber?: number;
  snippetText?: string;
}

interface InsuranceFields {
  glRequired: boolean;
  glLimit?: string;
  autoRequired: boolean;
  autoLimit?: string;
  wcRequired: boolean;
  umbrellaRequired: boolean;
  umbrellaLimit?: string;
  additionalInsuredRequired: boolean;
}

interface BondingFields {
  bidBondRequired: boolean;
  bidBondPercentage?: string;
  performanceBondRequired: boolean;
  performanceBondPercentage?: string;
  paymentBondRequired: boolean;
  paymentBondPercentage?: string;
}

interface SubmissionRules {
  volumes?: string[];
  pageLimits?: string;
  requiredForms?: string[];
  fileFormat?: string;
  namingConvention?: string;
  deliveryMethod?: string;
  deliveryAddress?: string;
}

interface WageDetermination {
  wageDecisionNumber?: string;
  modificationNumber?: string;
  county?: string;
  state?: string;
  constructionType?: string;
  classifications?: string[];
}

interface ScopeDetails {
  projectType?: string;
  squareFootage?: string;
  buildingType?: string;
  primaryTrades?: string[];
  specialSystems?: string[];
  siteworkIncluded?: boolean;
  demolitionIncluded?: boolean;
  duration?: string;
}

export class HerbieExtractionService {
  private tenantId: string;
  private openai: OpenAI | null;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
    this.openai = process.env.OPENAI_API_KEY 
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null;
  }

  private normalizeText(text: string): string {
    return text.replace(/\s+/g, " ").trim().toLowerCase();
  }

  private extractDates(text: string): { fieldName: string; value: string }[] {
    const results: { fieldName: string; value: string }[] = [];
    
    const patterns = [
      { pattern: /(?:response|submission|bid)\s*(?:due|deadline)[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4}(?:\s+\d{1,2}:\d{2}(?:\s*[AP]M)?)?)/gi, field: "submission_due_date" },
      { pattern: /(?:questions?|Q&A)\s*(?:due|deadline)[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/gi, field: "qa_due_date" },
      { pattern: /(?:posted|issue)[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/gi, field: "posted_date" },
      { pattern: /(?:start|begin|commence)[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/gi, field: "start_date" },
      { pattern: /(?:completion|end)[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/gi, field: "completion_date" },
    ];

    for (const { pattern, field } of patterns) {
      const matches = Array.from(text.matchAll(pattern));
      for (const match of matches) {
        results.push({ fieldName: field, value: match[1] });
      }
    }

    return results;
  }

  private extractInsuranceRequirements(text: string): InsuranceFields | null {
    const normalized = this.normalizeText(text);
    
    if (!normalized.includes("insurance") && !normalized.includes("liability")) {
      return null;
    }

    const result: InsuranceFields = {
      glRequired: /general\s*liability/i.test(text) || /commercial\s*general\s*liability/i.test(text),
      autoRequired: /auto(?:mobile)?\s*(?:liability|insurance)/i.test(text),
      wcRequired: /worker['']?s?\s*comp(?:ensation)?/i.test(text),
      umbrellaRequired: /umbrella|excess\s*liability/i.test(text),
      additionalInsuredRequired: /additional\s*insured/i.test(text),
    };

    const glMatch = text.match(/general\s*liability[^$]*\$?([\d,]+(?:\.\d{2})?)\s*(?:per\s*occurrence)?/i);
    if (glMatch) result.glLimit = glMatch[1].replace(/,/g, "");

    const umbrellaMatch = text.match(/umbrella[^$]*\$?([\d,]+(?:\.\d{2})?)/i);
    if (umbrellaMatch) result.umbrellaLimit = umbrellaMatch[1].replace(/,/g, "");

    return result;
  }

  private extractBondingRequirements(text: string): BondingFields | null {
    const normalized = this.normalizeText(text);
    
    if (!normalized.includes("bond") && !normalized.includes("surety")) {
      return null;
    }

    const result: BondingFields = {
      bidBondRequired: /bid\s*bond/i.test(text),
      performanceBondRequired: /performance\s*bond/i.test(text),
      paymentBondRequired: /payment\s*bond/i.test(text),
    };

    const bidBondMatch = text.match(/bid\s*bond[^%]*(\d+(?:\.\d+)?)\s*%/i);
    if (bidBondMatch) result.bidBondPercentage = bidBondMatch[1];

    const perfBondMatch = text.match(/performance\s*bond[^%]*(\d+(?:\.\d+)?)\s*%/i);
    if (perfBondMatch) result.performanceBondPercentage = perfBondMatch[1];

    const payBondMatch = text.match(/payment\s*bond[^%]*(\d+(?:\.\d+)?)\s*%/i);
    if (payBondMatch) result.paymentBondPercentage = payBondMatch[1];

    return result;
  }

  private extractSubmissionRules(text: string): SubmissionRules | null {
    const result: SubmissionRules = {};

    const volumeMatch = text.match(/volume\s*(?:i|1|one)[:\s]+([^.]+)/gi);
    if (volumeMatch) {
      result.volumes = volumeMatch.map(v => v.replace(/volume\s*(?:i|1|one)[:\s]+/i, "").trim());
    }

    const pageLimitMatch = text.match(/(?:page|pg)\s*limit[:\s]+(\d+)/i);
    if (pageLimitMatch) result.pageLimits = pageLimitMatch[1];

    const formatMatch = text.match(/(?:file|document)\s*format[:\s]+(pdf|word|excel|\.docx?|\.xlsx?)/gi);
    if (formatMatch) result.fileFormat = formatMatch[0].replace(/(?:file|document)\s*format[:\s]+/i, "");

    const emailMatch = text.match(/submit\s*(?:to|via)?[:\s]+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    const portalMatch = text.match(/submit\s*(?:through|via)[:\s]+(sam\.gov|beta\.sam\.gov|eBuy|GSA\s*Advantage)/i);
    
    if (emailMatch) {
      result.deliveryMethod = "email";
      result.deliveryAddress = emailMatch[1];
    } else if (portalMatch) {
      result.deliveryMethod = "portal";
      result.deliveryAddress = portalMatch[1];
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  private extractWageDetermination(text: string): WageDetermination | null {
    const normalized = this.normalizeText(text);
    
    if (!normalized.includes("wage determination") && !normalized.includes("davis-bacon") && !normalized.includes("wdol")) {
      return null;
    }

    const result: WageDetermination = {};

    const wageDecMatch = text.match(/(?:WD|Wage\s*Determination)[\s#:-]+(\d{4}-\d{4,6})/i);
    if (wageDecMatch) result.wageDecisionNumber = wageDecMatch[1];

    const modMatch = text.match(/(?:Mod|Modification)[\s#:-]+(\d+)/i);
    if (modMatch) result.modificationNumber = modMatch[1];

    const stateMatch = text.match(/(?:State|ST)[:\s]+([A-Z]{2})/);
    if (stateMatch) result.state = stateMatch[1];

    const countyMatch = text.match(/County[:\s]+([A-Za-z\s]+?)(?:,|\s+\w{2}|\s+State)/i);
    if (countyMatch) result.county = countyMatch[1].trim();

    if (/building\s*construction/i.test(text)) result.constructionType = "Building";
    else if (/heavy\s*construction/i.test(text)) result.constructionType = "Heavy";
    else if (/highway\s*construction/i.test(text)) result.constructionType = "Highway";
    else if (/residential\s*construction/i.test(text)) result.constructionType = "Residential";

    const classPatterns = [
      /electrician/i, /plumber/i, /carpenter/i, /laborer/i, /ironworker/i,
      /cement\s*mason/i, /operating\s*engineer/i, /pipefitter/i, /sheet\s*metal/i,
      /roofer/i, /painter/i, /hvac/i
    ];
    
    const classifications: string[] = [];
    for (const pattern of classPatterns) {
      if (pattern.test(text)) {
        classifications.push(pattern.source.replace(/\\s\*/g, " ").replace(/\\/g, ""));
      }
    }
    if (classifications.length > 0) result.classifications = classifications;

    return Object.keys(result).length > 0 ? result : null;
  }

  private extractScopeDetails(text: string): ScopeDetails | null {
    const result: ScopeDetails = {};

    if (/renovation|remodel|modernization/i.test(text)) result.projectType = "Renovation";
    else if (/new\s*construction/i.test(text)) result.projectType = "New Construction";
    else if (/repair|maintenance/i.test(text)) result.projectType = "Repair/Maintenance";
    else if (/addition|expansion/i.test(text)) result.projectType = "Addition";

    const sqftMatch = text.match(/(\d{1,3}(?:,\d{3})*)\s*(?:SF|sq\.?\s*ft\.?|square\s*feet)/i);
    if (sqftMatch) result.squareFootage = sqftMatch[1].replace(/,/g, "");

    if (/office\s*building/i.test(text)) result.buildingType = "Office";
    else if (/medical|hospital|clinic/i.test(text)) result.buildingType = "Medical";
    else if (/school|education/i.test(text)) result.buildingType = "Educational";
    else if (/warehouse|industrial/i.test(text)) result.buildingType = "Industrial";
    else if (/barracks|housing/i.test(text)) result.buildingType = "Residential";
    else if (/hangar|aviation/i.test(text)) result.buildingType = "Aviation";

    const trades: string[] = [];
    const tradePatterns = [
      { pattern: /electrical|electrician/i, trade: "Electrical" },
      { pattern: /plumb|pipefitting/i, trade: "Plumbing" },
      { pattern: /hvac|mechanical|air\s*conditioning/i, trade: "HVAC/Mechanical" },
      { pattern: /concrete|masonry/i, trade: "Concrete/Masonry" },
      { pattern: /structural\s*steel|ironwork/i, trade: "Structural Steel" },
      { pattern: /roofing/i, trade: "Roofing" },
      { pattern: /drywall|framing/i, trade: "Drywall/Framing" },
      { pattern: /painting|coating/i, trade: "Painting" },
      { pattern: /flooring|carpet|tile/i, trade: "Flooring" },
      { pattern: /fire\s*protection|sprinkler/i, trade: "Fire Protection" },
    ];
    
    for (const { pattern, trade } of tradePatterns) {
      if (pattern.test(text)) trades.push(trade);
    }
    if (trades.length > 0) result.primaryTrades = trades;

    const systems: string[] = [];
    if (/generator|emergency\s*power/i.test(text)) systems.push("Emergency Power");
    if (/fire\s*alarm|fire\s*suppression/i.test(text)) systems.push("Fire Alarm/Suppression");
    if (/access\s*control|security\s*system/i.test(text)) systems.push("Security/Access Control");
    if (/elevator|lift/i.test(text)) systems.push("Elevators");
    if (/solar|photovoltaic/i.test(text)) systems.push("Solar/Photovoltaic");
    if (systems.length > 0) result.specialSystems = systems;

    result.siteworkIncluded = /site\s*work|grading|paving|utilities/i.test(text);
    result.demolitionIncluded = /demolition|abatement|removal/i.test(text);

    const durationMatch = text.match(/(\d+)\s*(?:calendar\s*)?(?:days|months|years)/i);
    if (durationMatch) {
      const unit = /month/i.test(durationMatch[0]) ? "months" : /year/i.test(durationMatch[0]) ? "years" : "days";
      result.duration = `${durationMatch[1]} ${unit}`;
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  async extractFieldsFromDocument(
    documentId: string,
    documentText: string,
    pageNumber?: number
  ): Promise<ExtractedField[]> {
    const fields: ExtractedField[] = [];

    const dates = this.extractDates(documentText);
    for (const date of dates) {
      fields.push({
        category: "header",
        fieldName: date.fieldName,
        value: date.value,
        confidence: 0.95,
        method: "deterministic",
        pageNumber,
        snippetText: documentText.substring(0, 200),
      });
    }

    const insurance = this.extractInsuranceRequirements(documentText);
    if (insurance) {
      for (const [key, value] of Object.entries(insurance)) {
        if (value !== undefined && value !== false) {
          fields.push({
            category: "insurance",
            fieldName: key,
            value: String(value),
            confidence: 0.88,
            method: "deterministic",
            pageNumber,
          });
        }
      }
    }

    const bonding = this.extractBondingRequirements(documentText);
    if (bonding) {
      for (const [key, value] of Object.entries(bonding)) {
        if (value !== undefined && value !== false) {
          fields.push({
            category: "bonding",
            fieldName: key,
            value: String(value),
            confidence: 0.88,
            method: "deterministic",
            pageNumber,
          });
        }
      }
    }

    const submission = this.extractSubmissionRules(documentText);
    if (submission) {
      for (const [key, value] of Object.entries(submission)) {
        if (value !== undefined) {
          fields.push({
            category: "submission_rules",
            fieldName: key,
            value: typeof value === "object" ? JSON.stringify(value) : String(value),
            confidence: 0.85,
            method: "deterministic",
            pageNumber,
          });
        }
      }
    }

    const wage = this.extractWageDetermination(documentText);
    if (wage) {
      for (const [key, value] of Object.entries(wage)) {
        if (value !== undefined) {
          fields.push({
            category: "wage_determination",
            fieldName: key,
            value: typeof value === "object" ? JSON.stringify(value) : String(value),
            confidence: 0.90,
            method: "deterministic",
            pageNumber,
          });
        }
      }
    }

    const scope = this.extractScopeDetails(documentText);
    if (scope) {
      for (const [key, value] of Object.entries(scope)) {
        if (value !== undefined) {
          fields.push({
            category: "scope",
            fieldName: key,
            value: typeof value === "object" ? JSON.stringify(value) : String(value),
            confidence: 0.82,
            method: "deterministic",
            pageNumber,
          });
        }
      }
    }

    return fields;
  }

  async extractWithAI(documentText: string, category: string): Promise<ExtractedField[]> {
    if (!this.openai) return [];

    const prompts: Record<string, string> = {
      insurance: `Extract all insurance requirements from this document. Return JSON with fields: glRequired, glLimit, autoRequired, autoLimit, wcRequired, umbrellaRequired, umbrellaLimit, additionalInsuredRequired, endorsements. Include confidence score 0-1 for each.`,
      bonding: `Extract all bonding/surety requirements. Return JSON with fields: bidBondRequired, bidBondAmount, bidBondPercentage, performanceBondRequired, performanceBondAmount, paymentBondRequired. Include confidence score 0-1 for each.`,
      materials: `Extract all materials and specifications requirements. Return JSON with fields: specSections, planSheets, requiredSubmittals, scheduleConstraints, safetyRequirements, wageDetRefs. Include confidence score 0-1 for each.`,
    };

    const prompt = prompts[category];
    if (!prompt) return [];

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an expert at extracting structured information from government solicitation documents. Return only valid JSON." },
          { role: "user", content: `${prompt}\n\nDocument text:\n${documentText.substring(0, 8000)}` },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return [];

      const parsed = JSON.parse(content);
      const fields: ExtractedField[] = [];

      for (const [key, data] of Object.entries(parsed)) {
        if (data && typeof data === "object" && "value" in (data as any)) {
          const item = data as { value: any; confidence?: number };
          fields.push({
            category,
            fieldName: key,
            value: item.value,
            confidence: item.confidence || 0.75,
            method: "ai",
          });
        } else if (data !== null && data !== undefined) {
          fields.push({
            category,
            fieldName: key,
            value: data as string | object,
            confidence: 0.75,
            method: "ai",
          });
        }
      }

      return fields;
    } catch (error) {
      console.error("AI extraction error:", error);
      return [];
    }
  }

  async processAndStoreEvidence(
    bidProjectId: string,
    opportunityId: string | null,
    documentId: string,
    egnyteItemId: string | null,
    documentText: string
  ): Promise<number> {
    const deterministicFields = await this.extractFieldsFromDocument(documentId, documentText);
    
    const aiFields = await this.extractWithAI(documentText, "insurance");
    aiFields.push(...await this.extractWithAI(documentText, "bonding"));
    aiFields.push(...await this.extractWithAI(documentText, "materials"));

    const allFields = [...deterministicFields, ...aiFields];
    let storedCount = 0;

    for (const field of allFields) {
      if (field.confidence >= CONFIDENCE_THRESHOLDS.HIGH) {
        await db.insert(herbieExtractionEvidence).values({
          tenantId: this.tenantId,
          bidProjectId,
          opportunityId,
          fieldCategory: field.category,
          fieldName: field.fieldName,
          extractedValue: typeof field.value === "string" ? field.value : null,
          extractedValueJson: typeof field.value === "object" ? field.value : null,
          sourceDocumentId: documentId,
          egnyteItemId,
          pageNumber: field.pageNumber,
          snippetText: field.snippetText,
          confidence: field.confidence.toString(),
          extractionMethod: field.method,
          verified: false,
        });
        storedCount++;
      } else if (field.confidence >= CONFIDENCE_THRESHOLDS.MEDIUM_LOW) {
        await db.insert(herbieReviewQueue).values({
          tenantId: this.tenantId,
          bidProjectId,
          opportunityId,
          documentId,
          reviewType: "extraction",
          actionProposed: `Extract ${field.fieldName}: ${typeof field.value === "string" ? field.value : JSON.stringify(field.value)}`,
          confidence: field.confidence.toString(),
          reasoningText: `${field.method} extraction with ${Math.round(field.confidence * 100)}% confidence`,
          status: "pending",
          priority: field.category === "insurance" || field.category === "bonding" ? 50 : 100,
        });
      }
    }

    return storedCount;
  }

  async getEvidenceForBid(bidProjectId: string): Promise<{
    categories: Record<string, { fieldName: string; value: string; confidence: number; verified: boolean }[]>;
    totalCount: number;
    verifiedCount: number;
  }> {
    const evidence = await db.select()
      .from(herbieExtractionEvidence)
      .where(eq(herbieExtractionEvidence.bidProjectId, bidProjectId))
      .orderBy(desc(herbieExtractionEvidence.createdAt));

    const categories: Record<string, { fieldName: string; value: string; confidence: number; verified: boolean }[]> = {};
    let verifiedCount = 0;

    for (const e of evidence) {
      if (!categories[e.fieldCategory]) {
        categories[e.fieldCategory] = [];
      }
      
      const value = e.extractedValue || JSON.stringify(e.extractedValueJson);
      categories[e.fieldCategory].push({
        fieldName: e.fieldName,
        value,
        confidence: parseFloat(e.confidence.toString()),
        verified: e.verified || false,
      });

      if (e.verified) verifiedCount++;
    }

    return {
      categories,
      totalCount: evidence.length,
      verifiedCount,
    };
  }

  async verifyEvidence(evidenceId: string, userId: string): Promise<void> {
    await db.update(herbieExtractionEvidence)
      .set({
        verified: true,
        verifiedAt: new Date(),
        verifiedBy: userId,
      })
      .where(eq(herbieExtractionEvidence.id, evidenceId));
  }

  isHighRiskAction(actionType: string): boolean {
    return HIGH_RISK_ACTIONS.includes(actionType as any);
  }
}

export function createHerbieExtractionService(tenantId: string): HerbieExtractionService {
  return new HerbieExtractionService(tenantId);
}
