import { db } from "../../db";
import { federalAwards } from "@shared/schema";
import { eq, and, ilike, gte, lte, sql, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

const BASE_URL = "https://api.usaspending.gov/api/v2";

const CONTRACT_TYPE_CODES = ["A", "B", "C", "D"];
const IDV_TYPE_CODES = ["IDV_A", "IDV_B", "IDV_B_A", "IDV_B_B", "IDV_B_C", "IDV_C", "IDV_D", "IDV_E"];

export interface USASpendingSearchParams {
  keyword?: string;
  naicsCodes?: string[];
  pscCodes?: string[];
  agencyName?: string;
  recipientName?: string;
  awardAmountMin?: number;
  awardAmountMax?: number;
  startDateFrom?: string;
  startDateTo?: string;
  stateCode?: string;
  setAsideType?: string[];
  limit?: number;
  page?: number;
  sortField?: string;
  sortOrder?: "asc" | "desc";
  includeIdvs?: boolean;
}

export interface USASpendingAward {
  "Award ID": string;
  "Recipient Name": string;
  "Start Date": string;
  "End Date": string;
  "Award Amount": number;
  "Total Outlays": number;
  "Awarding Agency": string;
  "Awarding Sub Agency": string;
  "Award Type": string;
  "Funding Agency": string;
  "Funding Sub Agency": string;
  Description: string;
  "Contract Award Type"?: string;
  "recipient_id"?: string;
  "internal_id"?: string;
  "generated_internal_id"?: string;
  "NAICS Code"?: string;
  "NAICS Description"?: string;
  "PSC Code"?: string;
  "Place of Performance State Code"?: string;
  "Place of Performance City Name"?: string;
  "Place of Performance Country Name"?: string;
  "Set Aside Type"?: string;
  "Extent Competed"?: string;
  "Solicitation Number"?: string;
}

interface USASpendingSearchResponse {
  limit: number;
  page_metadata: {
    page: number;
    hasNext: boolean;
    last: number;
    count: number;
  };
  results: USASpendingAward[];
  messages?: string[];
}

export class USASpendingClient {
  private rateLimitDelay = 200;
  private lastRequestTime = 0;

  private async throttledFetch(url: string, options: RequestInit): Promise<Response> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.rateLimitDelay) {
      await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - elapsed));
    }
    this.lastRequestTime = Date.now();

    const response = await fetch(url, options);
    if (response.status === 429) {
      console.warn("USAspending rate limited, waiting 2s...");
      await new Promise(resolve => setTimeout(resolve, 2000));
      return fetch(url, options);
    }
    return response;
  }

  async searchAwards(params: USASpendingSearchParams): Promise<USASpendingSearchResponse> {
    const filters: Record<string, any> = {};

    const typeCodes = [...CONTRACT_TYPE_CODES];
    if (params.includeIdvs) typeCodes.push(...IDV_TYPE_CODES);
    filters.award_type_codes = typeCodes;

    if (params.keyword) {
      filters.keywords = [params.keyword];
    }

    if (params.naicsCodes?.length) {
      filters.naics_codes = { require: params.naicsCodes };
    }

    if (params.pscCodes?.length) {
      filters.psc_codes = { require: params.pscCodes };
    }

    if (params.startDateFrom || params.startDateTo) {
      filters.time_period = [{
        start_date: params.startDateFrom || "2020-01-01",
        end_date: params.startDateTo || new Date().toISOString().split("T")[0],
      }];
    }

    if (params.awardAmountMin !== undefined || params.awardAmountMax !== undefined) {
      filters.award_amounts = [{
        lower_bound: params.awardAmountMin || 0,
        upper_bound: params.awardAmountMax || 500000000,
      }];
    }

    if (params.stateCode) {
      filters.place_of_performance_locations = [{
        country: "USA",
        state: params.stateCode,
      }];
    }

    if (params.setAsideType?.length) {
      filters.set_aside_type = params.setAsideType;
    }

    const fields = [
      "Award ID",
      "Recipient Name",
      "Start Date",
      "End Date",
      "Award Amount",
      "Total Outlays",
      "Awarding Agency",
      "Awarding Sub Agency",
      "Award Type",
      "Funding Agency",
      "Funding Sub Agency",
      "Description",
      "Contract Award Type",
      "NAICS Code",
      "NAICS Description",
      "PSC Code",
      "Place of Performance State Code",
      "Place of Performance City Name",
      "Place of Performance Country Name",
      "Set Aside Type",
      "Extent Competed",
      "Solicitation Number",
    ];

    const payload = {
      filters,
      fields,
      limit: params.limit || 25,
      page: params.page || 1,
      sort: params.sortField || "Award Amount",
      order: params.sortOrder || "desc",
      subawards: false,
    };

    try {
      const response = await this.throttledFetch(`${BASE_URL}/search/spending_by_award/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`USAspending API error ${response.status}: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("USAspending search failed:", error);
      throw error;
    }
  }

  async searchByAgency(agencyName: string, params?: Partial<USASpendingSearchParams>): Promise<USASpendingSearchResponse> {
    return this.searchAwards({
      ...params,
      keyword: agencyName,
    });
  }

  async searchByNAICS(naicsCode: string, params?: Partial<USASpendingSearchParams>): Promise<USASpendingSearchResponse> {
    return this.searchAwards({
      ...params,
      naicsCodes: [naicsCode],
    });
  }

  async searchByRecipient(recipientName: string, params?: Partial<USASpendingSearchParams>): Promise<USASpendingSearchResponse> {
    return this.searchAwards({
      ...params,
      keyword: recipientName,
    });
  }

  async getSpendingByNAICS(naicsCodes: string[]): Promise<any> {
    const payload = {
      filters: {
        time_period: [{
          start_date: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          end_date: new Date().toISOString().split("T")[0],
        }],
        award_type_codes: CONTRACT_TYPE_CODES,
        naics_codes: { require: naicsCodes },
      },
      category: "naics",
      limit: 20,
      page: 1,
    };

    try {
      const response = await this.throttledFetch(`${BASE_URL}/search/spending_by_category/naics/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`USAspending NAICS spending error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error("USAspending NAICS spending lookup failed:", error);
      throw error;
    }
  }

  async getAgencySpending(agencyCode?: string): Promise<any> {
    try {
      const url = agencyCode
        ? `${BASE_URL}/agency/${agencyCode}/awards/`
        : `${BASE_URL}/agency/awards/`;
      const response = await this.throttledFetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) throw new Error(`USAspending agency error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error("USAspending agency lookup failed:", error);
      throw error;
    }
  }
}

export class USASpendingIngestService {
  private client: USASpendingClient;
  private tenantId: string;

  constructor(tenantId: string) {
    this.client = new USASpendingClient();
    this.tenantId = tenantId;
  }

  async ingestAwardsByNAICS(naicsCodes: string[], maxPages: number = 5): Promise<{ ingested: number; errors: number }> {
    let ingested = 0;
    let errors = 0;

    for (const naicsCode of naicsCodes) {
      for (let page = 1; page <= maxPages; page++) {
        try {
          const response = await this.client.searchAwards({
            naicsCodes: [naicsCode],
            page,
            limit: 100,
            startDateFrom: new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          });

          if (!response.results?.length) break;

          for (const award of response.results) {
            try {
              await this.upsertAward(award);
              ingested++;
            } catch (e) {
              errors++;
              console.error(`Error upserting award ${award["Award ID"]}:`, e);
            }
          }

          if (!response.page_metadata?.hasNext) break;
        } catch (e) {
          errors++;
          console.error(`Error fetching NAICS ${naicsCode} page ${page}:`, e);
          break;
        }
      }
    }

    return { ingested, errors };
  }

  async ingestAwardsByKeyword(keyword: string, maxPages: number = 3): Promise<{ ingested: number; errors: number }> {
    let ingested = 0;
    let errors = 0;

    for (let page = 1; page <= maxPages; page++) {
      try {
        const response = await this.client.searchAwards({
          keyword,
          page,
          limit: 100,
          startDateFrom: new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        });

        if (!response.results?.length) break;

        for (const award of response.results) {
          try {
            await this.upsertAward(award);
            ingested++;
          } catch (e) {
            errors++;
          }
        }

        if (!response.page_metadata?.hasNext) break;
      } catch (e) {
        errors++;
        break;
      }
    }

    return { ingested, errors };
  }

  private async upsertAward(award: USASpendingAward): Promise<void> {
    const awardId = award["Award ID"];
    if (!awardId) return;

    const existing = await db.select({ id: federalAwards.id })
      .from(federalAwards)
      .where(and(
        eq(federalAwards.tenantId, this.tenantId),
        eq(federalAwards.usaspendingAwardId, awardId)
      ))
      .limit(1);

    const data = {
      tenantId: this.tenantId,
      usaspendingAwardId: awardId,
      piid: awardId,
      awardType: award["Award Type"] || award["Contract Award Type"] || null,
      awardDescription: award.Description || null,
      totalObligatedAmount: award["Award Amount"]?.toString() || null,
      totalOutlayAmount: award["Total Outlays"]?.toString() || null,
      awardingAgencyName: award["Awarding Agency"] || null,
      awardingSubAgencyName: award["Awarding Sub Agency"] || null,
      fundingAgencyName: award["Funding Agency"] || null,
      recipientName: award["Recipient Name"] || null,
      naicsCode: award["NAICS Code"] || null,
      naicsDescription: award["NAICS Description"] || null,
      pscCode: award["PSC Code"] || null,
      setAsideType: award["Set Aside Type"] || null,
      extentCompeted: award["Extent Competed"] || null,
      solicitationNumber: award["Solicitation Number"] || null,
      startDate: award["Start Date"] ? new Date(award["Start Date"]) : null,
      endDate: award["End Date"] ? new Date(award["End Date"]) : null,
      placeOfPerformanceCity: award["Place of Performance City Name"] || null,
      placeOfPerformanceState: award["Place of Performance State Code"] || null,
      placeOfPerformanceCountry: award["Place of Performance Country Name"] || "USA",
      rawJson: award as any,
    };

    if (existing.length > 0) {
      await db.update(federalAwards)
        .set({ ...data, fetchedAt: new Date() })
        .where(eq(federalAwards.id, existing[0].id));
    } else {
      await db.insert(federalAwards).values({
        id: randomUUID(),
        ...data,
      });
    }
  }

  async searchLocalAwards(params: {
    keyword?: string;
    naicsCode?: string;
    agencyName?: string;
    state?: string;
    minAmount?: number;
    maxAmount?: number;
    limit?: number;
    offset?: number;
  }): Promise<{ awards: any[]; total: number }> {
    const conditions = [eq(federalAwards.tenantId, this.tenantId)];

    if (params.keyword) {
      conditions.push(
        sql`(${federalAwards.awardDescription} ILIKE ${'%' + params.keyword + '%'} OR ${federalAwards.recipientName} ILIKE ${'%' + params.keyword + '%'})`
      );
    }
    if (params.naicsCode) {
      conditions.push(eq(federalAwards.naicsCode, params.naicsCode));
    }
    if (params.agencyName) {
      conditions.push(ilike(federalAwards.awardingAgencyName, `%${params.agencyName}%`));
    }
    if (params.state) {
      conditions.push(eq(federalAwards.placeOfPerformanceState, params.state));
    }
    if (params.minAmount !== undefined) {
      conditions.push(gte(federalAwards.totalObligatedAmount, params.minAmount.toString()));
    }
    if (params.maxAmount !== undefined) {
      conditions.push(lte(federalAwards.totalObligatedAmount, params.maxAmount.toString()));
    }

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(federalAwards)
      .where(and(...conditions));

    const awards = await db.select()
      .from(federalAwards)
      .where(and(...conditions))
      .orderBy(desc(federalAwards.totalObligatedAmount))
      .limit(params.limit || 25)
      .offset(params.offset || 0);

    return { awards, total: Number(countResult?.count || 0) };
  }
}

export function createUSASpendingClient(): USASpendingClient {
  return new USASpendingClient();
}

export function createUSASpendingIngestService(tenantId: string): USASpendingIngestService {
  return new USASpendingIngestService(tenantId);
}
