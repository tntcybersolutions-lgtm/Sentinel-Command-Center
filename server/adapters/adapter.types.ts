export interface AdapterConfig {
  sourceSystemId: string;
  tenantId: string;
  rateLimit?: {
    requestsPerMinute: number;
    burstLimit?: number;
  };
  credentials?: Record<string, string>;
  parserVersion: string;
}

export interface RawItem {
  externalId: string;
  rawData: Record<string, unknown>;
  contentHash: string;
  retrievedAt: Date;
}

export interface NormalizedOpportunity {
  externalId: string;
  title: string;
  synopsis?: string;
  description?: string;
  url?: string;
  solicitationNumber?: string;
  noticeType?: string;
  status: string;
  postedAt?: Date;
  dueAt?: Date;
  archiveDate?: Date;
  setAsideCode?: string;
  setAsideDescription?: string;
  naicsCodes?: string[];
  classificationCode?: string;
  locationCity?: string;
  locationState?: string;
  locationCountry?: string;
  agencyName?: string;
  officeName?: string;
  contractValue?: number;
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
}

export interface AdapterResult {
  success: boolean;
  itemsRetrieved: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsUnchanged: number;
  errors: Array<{ externalId: string; error: string }>;
  runDuration: number;
}

export interface SourceAdapter {
  readonly type: 'api' | 'rss' | 'html' | 'email';
  readonly name: string;
  readonly parserVersion: string;
  
  configure(config: AdapterConfig): void;
  testConnection(): Promise<boolean>;
  fetchRawItems(params?: Record<string, unknown>): Promise<RawItem[]>;
  normalizeItem(raw: RawItem): NormalizedOpportunity;
  run(): Promise<AdapterResult>;
}

export abstract class BaseAdapter implements SourceAdapter {
  abstract readonly type: 'api' | 'rss' | 'html' | 'email';
  abstract readonly name: string;
  abstract readonly parserVersion: string;
  
  protected config!: AdapterConfig;
  private lastRequestTime = 0;
  private requestCount = 0;
  private requestWindowStart = 0;

  configure(config: AdapterConfig): void {
    this.config = config;
  }

  abstract testConnection(): Promise<boolean>;
  abstract fetchRawItems(params?: Record<string, unknown>): Promise<RawItem[]>;
  abstract normalizeItem(raw: RawItem): NormalizedOpportunity;

  protected async rateLimit(): Promise<void> {
    if (!this.config.rateLimit) return;

    const now = Date.now();
    const windowDuration = 60000;
    
    if (now - this.requestWindowStart > windowDuration) {
      this.requestWindowStart = now;
      this.requestCount = 0;
    }

    if (this.requestCount >= this.config.rateLimit.requestsPerMinute) {
      const waitTime = windowDuration - (now - this.requestWindowStart);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.requestWindowStart = Date.now();
        this.requestCount = 0;
      }
    }

    this.requestCount++;
    this.lastRequestTime = Date.now();
  }

  async run(): Promise<AdapterResult> {
    const startTime = Date.now();
    const errors: Array<{ externalId: string; error: string }> = [];
    let itemsCreated = 0;
    let itemsUpdated = 0;
    let itemsUnchanged = 0;

    try {
      const rawItems = await this.fetchRawItems();

      for (const raw of rawItems) {
        try {
          const normalized = this.normalizeItem(raw);
          console.log(`Normalized item: ${normalized.externalId} - ${normalized.title}`);
          itemsCreated++;
        } catch (error) {
          errors.push({
            externalId: raw.externalId,
            error: (error as Error).message,
          });
        }
      }

      return {
        success: true,
        itemsRetrieved: rawItems.length,
        itemsCreated,
        itemsUpdated,
        itemsUnchanged,
        errors,
        runDuration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        itemsRetrieved: 0,
        itemsCreated: 0,
        itemsUpdated: 0,
        itemsUnchanged: 0,
        errors: [{ externalId: 'system', error: (error as Error).message }],
        runDuration: Date.now() - startTime,
      };
    }
  }

  protected async hashContent(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }
}
