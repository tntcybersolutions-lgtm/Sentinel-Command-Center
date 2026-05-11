import { db } from "../db";
import { 
  opportunities, 
  opportunityAmendments,
  bidProjects,
  samIngestRuns,
  companySynonyms,
  unmatchedBuyers,
  companies,
  buyers
} from "@shared/schema";
import { eq, and, gte, sql, desc, like, ilike } from "drizzle-orm";
import { createFolderTaxonomyService } from "./folder-taxonomy.service";
import { randomUUID } from "crypto";
import { eventStreamService } from "./event-stream.service";
import type { SamGovAttachment, SamGovOpportunityDetail } from "../integrations/samgov/samgov.client";

const SAM_API_BASE = "https://api.sam.gov/prod/opportunities/v2";

interface SAMOpportunity {
  noticeId: string;
  title: string;
  solicitationNumber?: string;
  fullParentPathName?: string;
  fullParentPathCode?: string;
  postedDate: string;
  type: string;
  baseType: string;
  archiveType?: string;
  archiveDate?: string;
  setAside?: string;
  setAsideDescription?: string;
  responseDeadLine?: string;
  naicsCode?: string;
  classificationCode?: string;
  active: string;
  description?: string;
  organizationType?: string;
  additionalInfoLink?: string;
  uiLink?: string;
  office?: {
    name?: string;
    code?: string;
  };
  officeAddress?: {
    city?: string;
    state?: string;
    zipcode?: string;
    countryCode?: string;
  };
  placeOfPerformance?: {
    city?: {
      code?: string;
      name?: string;
    };
    state?: {
      code?: string;
      name?: string;
    };
    country?: {
      code?: string;
      name?: string;
    };
  };
  pointOfContact?: Array<{
    type: string;
    fullName?: string;
    title?: string;
    email?: string;
    phone?: string;
    fax?: string;
  }>;
  links?: Array<{
    rel: string;
    href: string;
  }>;
  resourceLinks?: string[];
}

interface SAMSearchResponse {
  totalRecords: number;
  limit: number;
  offset: number;
  opportunitiesData?: SAMOpportunity[];
}

export class SamIngestService {
  private tenantId: string;
  private apiKey: string | null;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
    this.apiKey = process.env.SAM_GOV_API_KEY || null;
  }

  private normalizeAgencyName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  async matchCompanyByName(agencyName: string): Promise<{ companyId: string; confidence: number } | null> {
    const normalized = this.normalizeAgencyName(agencyName);

    const exactMatch = await db.select()
      .from(companies)
      .where(and(
        eq(companies.tenantId, this.tenantId),
        ilike(companies.name, agencyName)
      ))
      .limit(1);

    if (exactMatch.length > 0) {
      return { companyId: exactMatch[0].id, confidence: 1.0 };
    }

    const synonymMatch = await db.select()
      .from(companySynonyms)
      .innerJoin(companies, eq(companySynonyms.companyId, companies.id))
      .where(and(
        eq(companySynonyms.tenantId, this.tenantId),
        eq(companySynonyms.normalizedKey, normalized)
      ))
      .limit(1);

    if (synonymMatch.length > 0) {
      const confidence = parseFloat(synonymMatch[0].company_synonyms.confidence?.toString() || "0.9");
      return { companyId: synonymMatch[0].companies.id, confidence };
    }

    const fuzzyMatch = await db.select()
      .from(companies)
      .where(and(
        eq(companies.tenantId, this.tenantId),
        sql`similarity(lower(${companies.name}), ${normalized}) > 0.6`
      ))
      .limit(1);

    if (fuzzyMatch.length > 0) {
      return { companyId: fuzzyMatch[0].id, confidence: 0.7 };
    }

    return null;
  }

  async getOrCreateCompanyForAgency(agencyName: string, officeCode?: string): Promise<string> {
    const match = await this.matchCompanyByName(agencyName);

    if (match && match.confidence >= 0.75) {
      return match.companyId;
    }

    const normalizedKey = this.normalizeAgencyName(agencyName);

    const existingUnmatched = await db.select()
      .from(unmatchedBuyers)
      .where(and(
        eq(unmatchedBuyers.tenantId, this.tenantId),
        eq(unmatchedBuyers.normalizedKey, normalizedKey)
      ))
      .limit(1);

    if (existingUnmatched.length > 0) {
      if (existingUnmatched[0].status === "matched" && existingUnmatched[0].suggestedCompanyId) {
        return existingUnmatched[0].suggestedCompanyId;
      }

      await db.update(unmatchedBuyers)
        .set({ 
          opportunityCount: sql`${unmatchedBuyers.opportunityCount} + 1`,
          ...(match ? { 
            suggestedCompanyId: match.companyId, 
            matchConfidence: match.confidence.toString() 
          } : {})
        })
        .where(eq(unmatchedBuyers.id, existingUnmatched[0].id));
    } else {
      await db.insert(unmatchedBuyers).values({
        tenantId: this.tenantId,
        buyerName: agencyName,
        normalizedKey,
        samOfficeCode: officeCode,
        suggestedCompanyId: match?.companyId,
        matchConfidence: match?.confidence.toString(),
        status: "pending",
      });
    }

    const newCompanyId = randomUUID();
    await db.insert(companies).values({
      id: newCompanyId,
      tenantId: this.tenantId,
      name: agencyName,
      type: "agency",
      status: "active",
    });

    const folderService = createFolderTaxonomyService(this.tenantId);
    await folderService.createCompanyJacketFolders(newCompanyId, agencyName);

    return newCompanyId;
  }

  private formatSamDate(d: Date): string {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  async fetchOpportunities(params: {
    modifiedSince?: Date;
    postedFrom?: Date;
    postedTo?: Date;
    keyword?: string;
    naicsCode?: string;
    setAside?: string;
    agency?: string;
    limit?: number;
    offset?: number;
  }): Promise<SAMSearchResponse> {
    if (!this.apiKey) {
      console.log("SAM.gov API key not configured, returning empty results");
      return { totalRecords: 0, limit: 10, offset: 0, opportunitiesData: [] };
    }

    const queryParams = new URLSearchParams();
    queryParams.append("api_key", this.apiKey);
    queryParams.append("limit", (params.limit || 100).toString());
    queryParams.append("offset", (params.offset || 0).toString());
    queryParams.append("ptype", "o,k,p");

    if (params.modifiedSince) {
      queryParams.append("modifiedDateFrom", this.formatSamDate(params.modifiedSince));
    }
    if (params.postedFrom) {
      queryParams.append("postedFrom", this.formatSamDate(params.postedFrom));
    }
    if (params.postedTo) {
      queryParams.append("postedTo", this.formatSamDate(params.postedTo));
    }
    if (params.keyword) {
      queryParams.append("title", params.keyword);
    }
    if (params.naicsCode) {
      queryParams.append("ncode", params.naicsCode);
    }
    if (params.setAside) {
      queryParams.append("typeOfSetAside", params.setAside);
    }
    if (params.agency) {
      queryParams.append("deptname", params.agency);
    }

    try {
      const response = await fetch(`${SAM_API_BASE}/search?${queryParams.toString()}`, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`SAM.gov API error: ${response.status} ${response.statusText} ${errText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching SAM.gov opportunities:", error);
      return { totalRecords: 0, limit: 10, offset: 0, opportunitiesData: [] };
    }
  }

  async processOpportunity(samOpp: SAMOpportunity): Promise<{ opportunityId: string; isNew: boolean }> {
    const existing = await db.select()
      .from(opportunities)
      .where(and(
        eq(opportunities.tenantId, this.tenantId),
        eq(opportunities.externalId, samOpp.noticeId)
      ))
      .limit(1);

    const agencyName = samOpp.fullParentPathName?.split(".").pop()?.trim() || 
                       samOpp.office?.name || 
                       "Unknown Agency";

    let buyerId = await db.select({ id: buyers.id })
      .from(buyers)
      .where(and(
        eq(buyers.tenantId, this.tenantId),
        eq(buyers.name, agencyName)
      ))
      .limit(1)
      .then(rows => rows[0]?.id);

    if (!buyerId) {
      const newBuyerId = randomUUID();
      await db.insert(buyers).values({
        id: newBuyerId,
        tenantId: this.tenantId,
        name: agencyName,
        type: "government",
        normalizedKey: this.normalizeAgencyName(agencyName),
      });
      buyerId = newBuyerId;
    }

    const opportunityData = {
      tenantId: this.tenantId,
      externalId: samOpp.noticeId,
      buyerId,
      title: samOpp.title,
      synopsis: samOpp.description?.substring(0, 1000),
      description: samOpp.description,
      url: samOpp.uiLink || samOpp.additionalInfoLink,
      status: samOpp.active === "Yes" ? "open" : "closed",
      naicsCodes: samOpp.naicsCode ? [samOpp.naicsCode] : [],
      setAside: samOpp.setAsideDescription || samOpp.setAside,
      postedAt: samOpp.postedDate ? new Date(samOpp.postedDate) : null,
      dueAt: samOpp.responseDeadLine ? new Date(samOpp.responseDeadLine) : null,
      lastSeenAt: new Date(),
      locationJson: samOpp.placeOfPerformance ? {
        city: samOpp.placeOfPerformance.city?.name,
        state: samOpp.placeOfPerformance.state?.code,
        country: samOpp.placeOfPerformance.country?.code,
      } : null,
    };

    if (existing.length > 0) {
      await db.update(opportunities)
        .set({ ...opportunityData, updatedAt: new Date() })
        .where(eq(opportunities.id, existing[0].id));
      return { opportunityId: existing[0].id, isNew: false };
    }

    const newOppId = randomUUID();
    await db.insert(opportunities).values({
      id: newOppId,
      ...opportunityData,
    });

    return { opportunityId: newOppId, isNew: true };
  }

  async fetchOpportunityDetail(noticeId: string): Promise<{
    allResourceLinks: string[];
    descriptionUrl?: string;
    attachments: SamGovAttachment[];
    relatedNotices: string[];
  } | null> {
    if (!this.apiKey) {
      console.log("[sam-ingest] No API key configured, skipping detail fetch");
      return null;
    }

    try {
      const queryParams = new URLSearchParams();
      queryParams.append("api_key", this.apiKey);
      queryParams.append("noticeId", noticeId);

      const response = await fetch(
        `${SAM_API_BASE}/search?${queryParams.toString()}`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(30000),
        }
      );

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.error(`[sam-ingest] Detail fetch failed for ${noticeId}: ${response.status} ${errText}`);
        return null;
      }

      const data = await response.json();
      const opp = data.opportunitiesData?.[0];
      if (!opp) {
        console.warn(`[sam-ingest] No detail data found for noticeId ${noticeId}`);
        return null;
      }

      const allResourceLinks: string[] = [];
      const attachments: SamGovAttachment[] = [];
      const seenUrls = new Set<string>();

      if (opp.resourceLinks && Array.isArray(opp.resourceLinks)) {
        for (const link of opp.resourceLinks) {
          if (!seenUrls.has(link)) {
            seenUrls.add(link);
            allResourceLinks.push(link);
            const filename = link.split("/").pop() || link;
            attachments.push({
              url: link,
              name: decodeURIComponent(filename),
              source: "resourceLinks",
            });
          }
        }
      }

      if (opp.links && Array.isArray(opp.links)) {
        for (const link of opp.links) {
          if (link.href && link.rel !== "self" && !seenUrls.has(link.href)) {
            seenUrls.add(link.href);
            allResourceLinks.push(link.href);
            attachments.push({
              url: link.href,
              name: link.rel || link.href.split("/").pop() || "linked-document",
              source: "links",
            });
          }
        }
      }

      if (opp.additionalInfoLink && !seenUrls.has(opp.additionalInfoLink)) {
        seenUrls.add(opp.additionalInfoLink);
        attachments.push({
          url: opp.additionalInfoLink,
          name: "Additional Information",
          source: "additionalInfoLink",
        });
      }

      const relatedNotices: string[] = [];
      if (opp.relatedNotice) {
        if (typeof opp.relatedNotice === "string") {
          relatedNotices.push(opp.relatedNotice);
        } else if (Array.isArray(opp.relatedNotice)) {
          relatedNotices.push(...opp.relatedNotice);
        }
      }

      console.log(
        `[sam-ingest] Detail fetch for ${noticeId}: ${allResourceLinks.length} resource links, ${attachments.length} total attachments, ${relatedNotices.length} related notices`
      );

      return {
        allResourceLinks,
        descriptionUrl: opp.additionalInfoLink || opp.uiLink,
        attachments,
        relatedNotices,
      };
    } catch (error) {
      console.error(`[sam-ingest] Error fetching detail for ${noticeId}:`, error);
      return null;
    }
  }

  async createBidProjectFromOpportunity(opportunityId: string, resourceLinks?: string[], descriptionUrl?: string): Promise<string> {
    const opp = await db.select()
      .from(opportunities)
      .innerJoin(buyers, eq(opportunities.buyerId, buyers.id))
      .where(eq(opportunities.id, opportunityId))
      .limit(1);

    if (opp.length === 0) {
      throw new Error(`Opportunity ${opportunityId} not found`);
    }

    const opportunity = opp[0].opportunities;
    const buyer = opp[0].buyers;

    const companyId = await this.getOrCreateCompanyForAgency(buyer.name, buyer.normalizedKey || undefined);

    const company = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
    if (company.length === 0) {
      throw new Error(`Company ${companyId} not found`);
    }

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
      opportunity.externalId || bidProjectId,
      opportunity.title,
      opportunity.dueAt
    );

    try {
      const { seedArtifactsForBidProject, seedChecklistForBidProject, ingestSamAttachments } = await import("./bid-jacket-artifacts.service");
      await seedArtifactsForBidProject(this.tenantId, bidProjectId);
      await seedChecklistForBidProject(this.tenantId, bidProjectId);
      if (resourceLinks && resourceLinks.length > 0) {
        await ingestSamAttachments(this.tenantId, bidProjectId, resourceLinks, descriptionUrl);
      }
    } catch (e) {
      console.error("[sam-ingest] Failed to seed bid jacket artifacts:", e);
    }

    return bidProjectId;
  }

  async runDeltaIngest(): Promise<{ 
    runId: string; 
    fetched: number; 
    new: number; 
    updated: number; 
  }> {
    const runId = randomUUID();
    await db.insert(samIngestRuns).values({
      id: runId,
      tenantId: this.tenantId,
      runType: "delta",
      status: "running",
    });

    try {
      const lastRun = await db.select()
        .from(samIngestRuns)
        .where(and(
          eq(samIngestRuns.tenantId, this.tenantId),
          eq(samIngestRuns.status, "completed")
        ))
        .orderBy(desc(samIngestRuns.completedAt))
        .limit(1);

      const modifiedSince = lastRun.length > 0 && lastRun[0].completedAt
        ? new Date(lastRun[0].completedAt)
        : new Date(Date.now() - 24 * 60 * 60 * 1000);

      const response = await this.fetchOpportunities({ modifiedSince });
      
      let newCount = 0;
      let updatedCount = 0;

      for (const samOpp of response.opportunitiesData || []) {
        const result = await this.processOpportunity(samOpp);
        if (result.isNew) {
          newCount++;

          let expandedResourceLinks = samOpp.resourceLinks || [];
          let expandedDescriptionUrl = samOpp.additionalInfoLink || samOpp.uiLink;

          const detail = await this.fetchOpportunityDetail(samOpp.noticeId);
          if (detail) {
            const searchLinkSet = new Set(expandedResourceLinks);
            const mergedLinks = [...expandedResourceLinks];
            for (const link of detail.allResourceLinks) {
              if (!searchLinkSet.has(link)) {
                mergedLinks.push(link);
              }
            }
            expandedResourceLinks = mergedLinks;
            expandedDescriptionUrl = detail.descriptionUrl || expandedDescriptionUrl;

            if (mergedLinks.length > (samOpp.resourceLinks || []).length) {
              console.log(
                `[sam-ingest] Detail fetch discovered ${mergedLinks.length - (samOpp.resourceLinks || []).length} additional attachments for ${samOpp.noticeId}`
              );
            }
          }

          await this.createBidProjectFromOpportunity(
            result.opportunityId,
            expandedResourceLinks,
            expandedDescriptionUrl
          );
          eventStreamService.emit("SAM_INGEST_NEW", this.tenantId, {
            opportunityId: result.opportunityId,
            title: samOpp.title,
            naicsCode: samOpp.naicsCode,
            setAside: samOpp.setAsideDescription || samOpp.setAside,
          });
        } else {
          updatedCount++;
          eventStreamService.emit("SAM_INGEST_UPDATE", this.tenantId, {
            opportunityId: result.opportunityId,
            title: samOpp.title,
          });
        }
      }

      await db.update(samIngestRuns)
        .set({
          status: "completed",
          modifiedSinceCursor: modifiedSince,
          opportunitiesFetched: response.totalRecords,
          opportunitiesNew: newCount,
          opportunitiesUpdated: updatedCount,
          completedAt: new Date(),
        })
        .where(eq(samIngestRuns.id, runId));

      if (newCount > 0) {
        try {
          const { createHerbieAutonomousService } = await import("./herbie-autonomous.service");
          const herbieService = createHerbieAutonomousService(this.tenantId);
          const scoringResult = await herbieService.runAutoScoring(this.tenantId);
          console.log(`[sam-ingest] Auto-scoring complete: scored=${scoringResult.scored}, high=${scoringResult.highScorers}, approvals=${scoringResult.approvalRequests.length}`);
        } catch (scoringErr) {
          console.error("[sam-ingest] Auto-scoring failed (non-fatal):", scoringErr);
        }
      }

      return { runId, fetched: response.totalRecords, new: newCount, updated: updatedCount };
    } catch (error) {
      await db.update(samIngestRuns)
        .set({
          status: "failed",
          errorsJson: { error: (error as Error).message },
          completedAt: new Date(),
        })
        .where(eq(samIngestRuns.id, runId));

      throw error;
    }
  }

  async runDailyFullIngest(): Promise<{
    runId: string;
    fetched: number;
    new: number;
    updated: number;
  }> {
    const runId = randomUUID();
    await db.insert(samIngestRuns).values({
      id: runId,
      tenantId: this.tenantId,
      runType: "daily_full",
      status: "running",
    });

    try {
      const today = new Date();
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      let allOpportunities: SAMOpportunity[] = [];
      let offset = 0;
      const limit = 100;
      let totalRecords = 0;

      do {
        const response = await this.fetchOpportunities({
          postedFrom: thirtyDaysAgo,
          postedTo: today,
          limit,
          offset,
        });

        totalRecords = response.totalRecords;
        allOpportunities = allOpportunities.concat(response.opportunitiesData || []);
        offset += limit;
      } while (offset < totalRecords && offset < 1000);

      let newCount = 0;
      let updatedCount = 0;

      for (const samOpp of allOpportunities) {
        const result = await this.processOpportunity(samOpp);
        if (result.isNew) {
          newCount++;

          let expandedResourceLinks = samOpp.resourceLinks || [];
          let expandedDescriptionUrl = samOpp.additionalInfoLink || samOpp.uiLink;

          const detail = await this.fetchOpportunityDetail(samOpp.noticeId);
          if (detail) {
            const searchLinkSet = new Set(expandedResourceLinks);
            const mergedLinks = [...expandedResourceLinks];
            for (const link of detail.allResourceLinks) {
              if (!searchLinkSet.has(link)) {
                mergedLinks.push(link);
              }
            }
            expandedResourceLinks = mergedLinks;
            expandedDescriptionUrl = detail.descriptionUrl || expandedDescriptionUrl;
          }

          await this.createBidProjectFromOpportunity(
            result.opportunityId,
            expandedResourceLinks,
            expandedDescriptionUrl
          );
        } else {
          updatedCount++;
        }
      }

      await db.update(samIngestRuns)
        .set({
          status: "completed",
          opportunitiesFetched: allOpportunities.length,
          opportunitiesNew: newCount,
          opportunitiesUpdated: updatedCount,
          completedAt: new Date(),
        })
        .where(eq(samIngestRuns.id, runId));

      return { runId, fetched: allOpportunities.length, new: newCount, updated: updatedCount };
    } catch (error) {
      await db.update(samIngestRuns)
        .set({
          status: "failed",
          errorsJson: { error: (error as Error).message },
          completedAt: new Date(),
        })
        .where(eq(samIngestRuns.id, runId));

      throw error;
    }
  }
}

export function createSamIngestService(tenantId: string): SamIngestService {
  return new SamIngestService(tenantId);
}
