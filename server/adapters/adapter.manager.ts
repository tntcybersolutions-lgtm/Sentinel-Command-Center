import { db } from "../db";
import { sourceSystems, sourceRuns, sourceItemsRaw } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { SourceAdapter, AdapterConfig, AdapterResult, RawItem, NormalizedOpportunity } from "./adapter.types";

type AdapterConstructor = new () => SourceAdapter;

class AdapterManager {
  private adapters = new Map<string, AdapterConstructor>();

  register(key: string, adapter: AdapterConstructor): void {
    this.adapters.set(key, adapter);
    console.log(`Registered adapter: ${key}`);
  }

  getAdapterKeys(): string[] {
    return Array.from(this.adapters.keys());
  }

  async createAdapterForSource(
    tenantId: string,
    sourceSystemKey: string
  ): Promise<SourceAdapter | null> {
    const [source] = await db.select()
      .from(sourceSystems)
      .where(and(
        eq(sourceSystems.tenantId, tenantId),
        eq(sourceSystems.key, sourceSystemKey),
        eq(sourceSystems.enabled, true)
      ))
      .limit(1);

    if (!source) {
      console.warn(`Source system ${sourceSystemKey} not found or disabled for tenant ${tenantId}`);
      return null;
    }

    const AdapterClass = this.adapters.get(source.type);
    if (!AdapterClass) {
      console.warn(`No adapter registered for type: ${source.type}`);
      return null;
    }

    const adapter = new AdapterClass();
    const config = source.configJson as Record<string, unknown> || {};
    
    adapter.configure({
      sourceSystemId: source.id,
      tenantId,
      parserVersion: "1.0",
      rateLimit: config.rateLimit as { requestsPerMinute: number } | undefined,
      credentials: config.credentials as Record<string, string> | undefined,
    });

    return adapter;
  }

  async runIngestion(
    tenantId: string,
    sourceSystemKey: string
  ): Promise<AdapterResult | null> {
    const adapter = await this.createAdapterForSource(tenantId, sourceSystemKey);
    if (!adapter) {
      return null;
    }

    const [source] = await db.select()
      .from(sourceSystems)
      .where(and(
        eq(sourceSystems.tenantId, tenantId),
        eq(sourceSystems.key, sourceSystemKey)
      ))
      .limit(1);

    if (!source) return null;

    const [run] = await db.insert(sourceRuns).values({
      tenantId,
      sourceSystemId: source.id,
      status: "running",
      countsJson: {},
    }).returning({ id: sourceRuns.id });

    try {
      const result = await adapter.run();

      await db.update(sourceRuns)
        .set({
          status: result.success ? "ok" : "failed",
          endedAt: new Date(),
          countsJson: {
            retrieved: result.itemsRetrieved,
            created: result.itemsCreated,
            updated: result.itemsUpdated,
            unchanged: result.itemsUnchanged,
            errors: result.errors.length,
          },
        })
        .where(eq(sourceRuns.id, run.id));

      return result;
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
  }

  async storeRawItem(
    tenantId: string,
    sourceSystemId: string,
    item: RawItem,
    runId: string,
    parserVersion: string
  ): Promise<{ status: 'created' | 'updated' | 'unchanged'; id: string }> {
    const existing = await db.select()
      .from(sourceItemsRaw)
      .where(and(
        eq(sourceItemsRaw.tenantId, tenantId),
        eq(sourceItemsRaw.sourceSystemId, sourceSystemId),
        eq(sourceItemsRaw.externalId, item.externalId),
        eq(sourceItemsRaw.contentHash, item.contentHash)
      ))
      .limit(1);

    if (existing.length > 0) {
      return { status: 'unchanged', id: existing[0].id };
    }

    const [record] = await db.insert(sourceItemsRaw).values({
      tenantId,
      sourceSystemId,
      externalId: item.externalId,
      contentHash: item.contentHash,
      rawJson: item.rawData,
      parserVersion,
      runId,
    }).returning({ id: sourceItemsRaw.id });

    return { status: 'created', id: record.id };
  }
}

export const adapterManager = new AdapterManager();
