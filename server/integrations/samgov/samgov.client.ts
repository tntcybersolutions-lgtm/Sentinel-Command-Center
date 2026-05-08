import { db } from "../../db";
import { sourceSystems, sourceRuns, sourceItemsRaw, opportunities, opportunityAmendments, buyers } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { recordSourceRunTouch, getImpactedBidProjectIdsForRun, enqueueArtifactIngestionJob } from "../../services/ingestion/ingestion.helpers";

export interface SamGovOpportunity {
  noticeId: string;
  title: string;
  solicitationNumber?: string;
  fullParentPathName?: string;
  fullParentPathCode?: string;
  postedDate?: string;
  type?: string;
  baseType?: string;
  archiveType?: string;
  archiveDate?: string;
  typeOfSetAsideDescription?: string;
  typeOfSetAside?: string;
  responseDeadLine?: string;
  naicsCode?: string;
  naicsCodes?: string[];
  classificationCode?: string;
  active?: string;
  organizationType?: string;
  resourceLinks?: string[];
  uiLink?: string;
  office?: {
    name?: string;
    code?: string;
  };
  pointOfContact?: Array<{
    type?: string;
    name?: string;
    email?: string;
    phone?: string;
  }>;
  placeOfPerformance?: {
    city?: {
      name?: string;
      code?: string;
    };
    state?: {
      name?: string;
      code?: string;
    };
    country?: {
      name?: string;
      code?: string;
    };
  };
  description?: string;
}

export interface SamGovSearchParams {
  postedFrom?: string;
  postedTo?: string;
  ptype?: string;
  naics?: string;
  limit?: number;
  offset?: number;
}

export class SamGovClient {
  private baseUrl = "https://api.sam.gov/opportunities/v2/search";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchOpportunities(params: SamGovSearchParams): Promise<SamGovOpportunity[]> {
    const queryParams = new URLSearchParams();
    
    if (params.postedFrom) queryParams.set("postedFrom", params.postedFrom);
    if (params.postedTo) queryParams.set("postedTo", params.postedTo);
    if (params.ptype) queryParams.set("ptype", params.ptype);
    if (params.naics) queryParams.set("ncode", params.naics);
    queryParams.set("limit", (params.limit || 100).toString());
    queryParams.set("offset", (params.offset || 0).toString());
    queryParams.set("api_key", this.apiKey);

    try {
      const response = await fetch(`${this.baseUrl}?${queryParams.toString()}`);
      
      if (!response.ok) {
        throw new Error(`SAM.gov API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.opportunitiesData || [];
    } catch (error) {
      console.error("SAM.gov API request failed:", error);
      throw error;
    }
  }

  async getOpportunityById(noticeId: string): Promise<SamGovOpportunity | null> {
    try {
      const response = await fetch(
        `https://api.sam.gov/opportunities/v2/search?noticeId=${noticeId}&api_key=${this.apiKey}`
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.opportunitiesData?.[0] || null;
    } catch (error) {
      console.error(`Failed to fetch opportunity ${noticeId}:`, error);
      return null;
    }
  }

  async getOpportunityDetail(noticeId: string): Promise<SamGovOpportunityDetail | null> {
    try {
      const queryParams = new URLSearchParams();
      queryParams.set("api_key", this.apiKey);
      queryParams.set("noticeId", noticeId);

      const response = await fetch(
        `https://api.sam.gov/opportunities/v2/search?${queryParams.toString()}`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(30000),
        }
      );

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.error(`[samgov-client] Detail fetch failed for ${noticeId}: ${response.status} ${errText}`);
        return null;
      }

      const data = await response.json();
      const opp = data.opportunitiesData?.[0];
      if (!opp) return null;

      const attachments: SamGovAttachment[] = [];

      if (opp.resourceLinks && Array.isArray(opp.resourceLinks)) {
        for (const link of opp.resourceLinks) {
          const filename = link.split("/").pop() || link;
          attachments.push({
            url: link,
            name: decodeURIComponent(filename),
            source: "resourceLinks",
          });
        }
      }

      if (opp.links && Array.isArray(opp.links)) {
        for (const link of opp.links) {
          if (link.href && link.rel !== "self") {
            attachments.push({
              url: link.href,
              name: link.rel || link.href.split("/").pop() || "linked-document",
              source: "links",
            });
          }
        }
      }

      if (opp.additionalInfoLink) {
        attachments.push({
          url: opp.additionalInfoLink,
          name: "Additional Information",
          source: "additionalInfoLink",
        });
      }

      if (opp.award?.awardee?.ueiSAM) {
        // no attachment but useful metadata
      }

      const relatedNotices: string[] = [];
      if (opp.relatedNotice) {
        if (typeof opp.relatedNotice === "string") {
          relatedNotices.push(opp.relatedNotice);
        } else if (Array.isArray(opp.relatedNotice)) {
          relatedNotices.push(...opp.relatedNotice);
        }
      }

      return {
        noticeId: opp.noticeId,
        title: opp.title,
        solicitationNumber: opp.solicitationNumber,
        description: opp.description,
        additionalInfoLink: opp.additionalInfoLink,
        uiLink: opp.uiLink,
        attachments,
        relatedNotices,
        resourceLinks: opp.resourceLinks || [],
        pointOfContact: opp.pointOfContact,
        postedDate: opp.postedDate,
        responseDeadLine: opp.responseDeadLine,
        archiveDate: opp.archiveDate,
        type: opp.type,
        active: opp.active,
      };
    } catch (error) {
      console.error(`[samgov-client] Failed to fetch detail for ${noticeId}:`, error);
      return null;
    }
  }
}

export interface SamGovAttachment {
  url: string;
  name: string;
  source: "resourceLinks" | "links" | "additionalInfoLink" | "relatedNotice";
}

export interface SamGovOpportunityDetail {
  noticeId: string;
  title: string;
  solicitationNumber?: string;
  description?: string;
  additionalInfoLink?: string;
  uiLink?: string;
  attachments: SamGovAttachment[];
  relatedNotices: string[];
  resourceLinks: string[];
  pointOfContact?: Array<{
    type?: string;
    name?: string;
    email?: string;
    phone?: string;
  }>;
  postedDate?: string;
  responseDeadLine?: string;
  archiveDate?: string;
  type?: string;
  active?: string;
}

export class SamGovIngestionService {
  private client: SamGovClient;
  private tenantId: string;
  private sourceSystemId: string;

  constructor(apiKey: string, tenantId: string, sourceSystemId: string) {
    this.client = new SamGovClient(apiKey);
    this.tenantId = tenantId;
    this.sourceSystemId = sourceSystemId;
  }

  async runIngestion(): Promise<{ created: number; updated: number; errors: number }> {
    const [run] = await db.insert(sourceRuns).values({
      tenantId: this.tenantId,
      sourceSystemId: this.sourceSystemId,
      status: "running",
      countsJson: {},
    }).returning({ id: sourceRuns.id });

    const stats = { created: 0, updated: 0, errors: 0 };

    try {
      const today = new Date();
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const params: SamGovSearchParams = {
        postedFrom: thirtyDaysAgo.toISOString().split('T')[0],
        postedTo: today.toISOString().split('T')[0],
        ptype: "o,k", 
        limit: 100,
      };

      const opportunities_data = await this.client.searchOpportunities(params);

      for (const opp of opportunities_data) {
        try {
          const result = await this.processOpportunity(opp, run.id);
          if (result.outcome === "created") stats.created++;
          else if (result.outcome === "updated") stats.updated++;

          if (result.outcome === "created" || result.outcome === "updated") {
            await recordSourceRunTouch({
              tenantId: this.tenantId,
              sourceRunId: run.id,
              sourceSystemId: this.sourceSystemId,
              entityType: "opportunity",
              entityId: result.opportunityId,
              action: result.outcome,
            });
          }
        } catch (error) {
          console.error(`Error processing opportunity ${opp.noticeId}:`, error);
          stats.errors++;
        }
      }

      const impactedBidProjectIds = await getImpactedBidProjectIdsForRun({
        tenantId: this.tenantId,
        sourceRunId: run.id,
      });

      for (const bidProjectId of impactedBidProjectIds) {
        await enqueueArtifactIngestionJob({
          tenantId: this.tenantId,
          bidProjectId,
          sourceType: "samgov",
        });
      }

      await db.update(sourceRuns)
        .set({
          status: "ok",
          endedAt: new Date(),
          countsJson: stats,
        })
        .where(eq(sourceRuns.id, run.id));

    } catch (error) {
      await db.update(sourceRuns)
        .set({
          status: "failed",
          endedAt: new Date(),
          errorJson: { message: (error as Error).message },
        })
        .where(eq(sourceRuns.id, run.id));
      throw error;
    }

    return stats;
  }

  private async processOpportunity(
    opp: SamGovOpportunity,
    runId: string
  ): Promise<{ outcome: "created" | "updated" | "unchanged"; opportunityId: string }> {
    const rawJson = opp as unknown as Record<string, unknown>;
    const contentHash = await this.hashContent(JSON.stringify(rawJson));

    const existingRaw = await db.select()
      .from(sourceItemsRaw)
      .where(and(
        eq(sourceItemsRaw.tenantId, this.tenantId),
        eq(sourceItemsRaw.sourceSystemId, this.sourceSystemId),
        eq(sourceItemsRaw.externalId, opp.noticeId),
        eq(sourceItemsRaw.contentHash, contentHash)
      ))
      .limit(1);

    if (existingRaw.length > 0) {
      const existingOppForUnchanged = await db.select({ id: opportunities.id })
        .from(opportunities)
        .where(and(
          eq(opportunities.tenantId, this.tenantId),
          eq(opportunities.sourceSystemId, this.sourceSystemId),
          eq(opportunities.externalId, opp.noticeId)
        ))
        .limit(1);
      return { outcome: "unchanged", opportunityId: existingOppForUnchanged[0]?.id ?? "" };
    }

    await db.insert(sourceItemsRaw).values({
      tenantId: this.tenantId,
      sourceSystemId: this.sourceSystemId,
      externalId: opp.noticeId,
      contentHash,
      rawJson,
      parserVersion: "1.0",
      runId,
    });

    const existingOpp = await db.select()
      .from(opportunities)
      .where(and(
        eq(opportunities.tenantId, this.tenantId),
        eq(opportunities.sourceSystemId, this.sourceSystemId),
        eq(opportunities.externalId, opp.noticeId)
      ))
      .limit(1);

    let buyerId: string | null = null;
    if (opp.fullParentPathName) {
      const [buyer] = await db.insert(buyers).values({
        tenantId: this.tenantId,
        name: opp.fullParentPathName,
        type: opp.organizationType || "agency",
        normalizedKey: opp.fullParentPathCode || opp.fullParentPathName.toLowerCase().replace(/\s+/g, '_'),
      }).onConflictDoNothing().returning({ id: buyers.id });
      
      if (buyer) {
        buyerId = buyer.id;
      } else {
        const existingBuyer = await db.select()
          .from(buyers)
          .where(eq(buyers.normalizedKey, opp.fullParentPathCode || opp.fullParentPathName.toLowerCase().replace(/\s+/g, '_')))
          .limit(1);
        buyerId = existingBuyer[0]?.id || null;
      }
    }

    const normalizedData = {
      tenantId: this.tenantId,
      sourceSystemId: this.sourceSystemId,
      externalId: opp.noticeId,
      buyerId,
      title: opp.title,
      synopsis: opp.description || null,
      url: opp.uiLink || null,
      solicitationNumber: opp.solicitationNumber || null,
      noticeType: opp.type || null,
      status: "open",
      postedAt: opp.postedDate ? new Date(opp.postedDate) : null,
      responseDueAt: opp.responseDeadLine ? new Date(opp.responseDeadLine) : null,
      archiveDate: opp.archiveDate ? new Date(opp.archiveDate) : null,
      setAsideCode: opp.typeOfSetAside || null,
      setAsideDescription: opp.typeOfSetAsideDescription || null,
      naicsCodes: opp.naicsCodes || (opp.naicsCode ? [opp.naicsCode] : []),
      classificationCode: opp.classificationCode || null,
      locationCity: opp.placeOfPerformance?.city?.name || null,
      locationState: opp.placeOfPerformance?.state?.code || null,
      locationCountry: opp.placeOfPerformance?.country?.code || "USA",
      agencyName: opp.fullParentPathName || null,
      officeName: opp.office?.name || null,
      primaryContactName: opp.pointOfContact?.[0]?.name || null,
      primaryContactEmail: opp.pointOfContact?.[0]?.email || null,
      primaryContactPhone: opp.pointOfContact?.[0]?.phone || null,
      lastSeenAt: new Date(),
    };

    if (existingOpp.length > 0) {
      await db.update(opportunities)
        .set({
          ...normalizedData,
          updatedAt: new Date(),
        })
        .where(eq(opportunities.id, existingOpp[0].id));

      await db.insert(opportunityAmendments).values({
        tenantId: this.tenantId,
        opportunityId: existingOpp[0].id,
        amendmentNo: 1,
        changeSummary: "Updated from SAM.gov sync",
        rawRefId: null,
      });

      return { outcome: "updated", opportunityId: existingOpp[0].id };
    } else {
      const [newOpp] = await db.insert(opportunities).values(normalizedData).returning({ id: opportunities.id });
      return { outcome: "created", opportunityId: newOpp.id };
    }
  }

  private async hashContent(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }
}

export async function createSamGovIngestionService(tenantId: string): Promise<SamGovIngestionService | null> {
  const apiKey = process.env.SAM_GOV_API_KEY;
  if (!apiKey) {
    console.warn("SAM_GOV_API_KEY not configured");
    return null;
  }

  const [sourceSystem] = await db.select()
    .from(sourceSystems)
    .where(and(
      eq(sourceSystems.tenantId, tenantId),
      eq(sourceSystems.key, "samgov")
    ))
    .limit(1);

  if (!sourceSystem) {
    const [newSource] = await db.insert(sourceSystems).values({
      tenantId,
      key: "samgov",
      name: "SAM.gov",
      type: "api",
      enabled: true,
      configJson: { pollMinutes: 10 },
    }).returning({ id: sourceSystems.id });
    
    return new SamGovIngestionService(apiKey, tenantId, newSource.id);
  }

  return new SamGovIngestionService(apiKey, tenantId, sourceSystem.id);
}
