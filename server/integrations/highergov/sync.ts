import { db } from "../../db";
import { 
  opportunities, highergovRawArchive, captureChangeEvents, pipelineItems 
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { HigherGovAdapter, type HGOpportunity, type HGForecast, type HGTaskOrder, type HGAward } from "./adapter";

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const SOURCE_SYSTEM = "highergov";

interface SyncResult {
  opportunitiesSynced: number;
  awardsSynced: number;
  forecastsSynced: number;
  taskOrdersSynced: number;
  changeEventsCreated: number;
  errors: string[];
  startedAt: string;
  completedAt: string;
}

let lastSyncResult: SyncResult | null = null;
let lastSyncTime: string | null = null;
let syncInProgress = false;

export function getSyncStatus() {
  return {
    lastSyncTime,
    lastSyncResult,
    syncInProgress,
  };
}

export async function runSync(tenantId: string = DEFAULT_TENANT_ID): Promise<SyncResult> {
  if (syncInProgress) {
    throw new Error("Sync already in progress");
  }

  syncInProgress = true;
  const result: SyncResult = {
    opportunitiesSynced: 0,
    awardsSynced: 0,
    forecastsSynced: 0,
    taskOrdersSynced: 0,
    changeEventsCreated: 0,
    errors: [],
    startedAt: new Date().toISOString(),
    completedAt: "",
  };

  try {
    const adapter = new HigherGovAdapter();

    const opps = await adapter.listOpportunities();
    for (const opp of opps) {
      try {
        const changes = await syncOpportunity(tenantId, opp);
        result.opportunitiesSynced++;
        result.changeEventsCreated += changes;
      } catch (err: any) {
        result.errors.push(`Opp ${opp.externalId}: ${err.message}`);
      }
    }

    const forecasts = await adapter.listForecasts();
    for (const fc of forecasts) {
      try {
        const changes = await syncForecast(tenantId, fc);
        result.forecastsSynced++;
        result.changeEventsCreated += changes;
      } catch (err: any) {
        result.errors.push(`Forecast ${fc.externalId}: ${err.message}`);
      }
    }

    const awards = await adapter.listAwards();
    for (const aw of awards) {
      try {
        await syncAward(tenantId, aw);
        result.awardsSynced++;
      } catch (err: any) {
        result.errors.push(`Award ${aw.externalId}: ${err.message}`);
      }
    }

    const taskOrders = await adapter.listTaskOrders();
    for (const to of taskOrders) {
      try {
        const changes = await syncTaskOrder(tenantId, to);
        result.taskOrdersSynced++;
        result.changeEventsCreated += changes;
      } catch (err: any) {
        result.errors.push(`TaskOrder ${to.externalId}: ${err.message}`);
      }
    }

  } catch (err: any) {
    result.errors.push(`Global sync error: ${err.message}`);
  } finally {
    result.completedAt = new Date().toISOString();
    lastSyncResult = result;
    lastSyncTime = result.completedAt;
    syncInProgress = false;
  }

  return result;
}

async function syncOpportunity(tenantId: string, opp: HGOpportunity): Promise<number> {
  const newHash = HigherGovAdapter.computeHash(opp);
  let changeEventsCreated = 0;

  const existingArchive = await db
    .select()
    .from(highergovRawArchive)
    .where(
      and(
        eq(highergovRawArchive.tenantId, tenantId),
        eq(highergovRawArchive.sourceType, "opportunity"),
        eq(highergovRawArchive.externalId, opp.externalId)
      )
    )
    .limit(1);

  const previousHash = existingArchive[0]?.hashSignature || null;

  if (existingArchive.length > 0) {
    await db.update(highergovRawArchive)
      .set({
        hashSignature: newHash,
        rawPayload: opp as any,
        lastSeenAt: new Date(),
      })
      .where(eq(highergovRawArchive.id, existingArchive[0].id));
  } else {
    await db.insert(highergovRawArchive).values({
      tenantId,
      sourceType: "opportunity",
      externalId: opp.externalId,
      hashSignature: newHash,
      rawPayload: opp as any,
      sourceUrl: opp.url,
    });
  }

  const existingOpp = await db
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.tenantId, tenantId),
        eq(opportunities.externalId, opp.externalId)
      )
    )
    .limit(1);

  const oppData = {
    tenantId,
    externalId: opp.externalId,
    title: opp.title,
    synopsis: opp.synopsis,
    description: opp.description,
    url: opp.url,
    status: opp.status === "open" ? "open" : "closed",
    naicsCodes: opp.naicsCodes,
    setAside: opp.setAside,
    contractValue: opp.contractValue?.toString() || null,
    postedAt: new Date(opp.postedDate),
    dueAt: new Date(opp.responseDeadline),
    lastSeenAt: new Date(),
    updatedAt: new Date(),
    locationJson: {
      placeOfPerformance: opp.placeOfPerformance,
      agency: opp.agency,
      subAgency: opp.subAgency,
      solicitationNumber: opp.solicitationNumber,
      contractType: opp.contractType,
      pscCodes: opp.pscCodes,
      attachments: opp.attachments,
    },
  };

  let oppId: string;

  if (existingOpp.length > 0) {
    oppId = existingOpp[0].id;
    await db.update(opportunities)
      .set(oppData)
      .where(eq(opportunities.id, oppId));
  } else {
    const inserted = await db.insert(opportunities)
      .values(oppData)
      .returning({ id: opportunities.id });
    oppId = inserted[0].id;
  }

  const isNew = !previousHash;
  const isChanged = previousHash && previousHash !== newHash;

  if (isNew) {
    await db.insert(captureChangeEvents).values({
      tenantId,
      sourceType: "opportunity",
      externalId: opp.externalId,
      entityId: oppId,
      changeType: "new",
      changeSummary: `New opportunity: ${opp.title} (${opp.agency}) - ${opp.setAside || "Full & Open"} - $${(opp.contractValue || 0).toLocaleString()}`,
      newHash,
    });
    changeEventsCreated++;
  } else if (isChanged) {
    await db.insert(captureChangeEvents).values({
      tenantId,
      sourceType: "opportunity",
      externalId: opp.externalId,
      entityId: oppId,
      changeType: "updated",
      changeSummary: `Updated opportunity: ${opp.title} — data has changed since last sync`,
      previousHash,
      newHash,
    });
    changeEventsCreated++;
  }

  return changeEventsCreated;
}

async function syncForecast(tenantId: string, fc: HGForecast): Promise<number> {
  const newHash = HigherGovAdapter.computeHash(fc);
  let changeEventsCreated = 0;

  const existingArchive = await db
    .select()
    .from(highergovRawArchive)
    .where(
      and(
        eq(highergovRawArchive.tenantId, tenantId),
        eq(highergovRawArchive.sourceType, "forecast"),
        eq(highergovRawArchive.externalId, fc.externalId)
      )
    )
    .limit(1);

  const previousHash = existingArchive[0]?.hashSignature || null;

  if (existingArchive.length > 0) {
    await db.update(highergovRawArchive)
      .set({
        hashSignature: newHash,
        rawPayload: fc as any,
        lastSeenAt: new Date(),
      })
      .where(eq(highergovRawArchive.id, existingArchive[0].id));
  } else {
    await db.insert(highergovRawArchive).values({
      tenantId,
      sourceType: "forecast",
      externalId: fc.externalId,
      hashSignature: newHash,
      rawPayload: fc as any,
      sourceUrl: fc.url,
    });
  }

  const existingOpp = await db
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.tenantId, tenantId),
        eq(opportunities.externalId, fc.externalId)
      )
    )
    .limit(1);

  const oppData = {
    tenantId,
    externalId: fc.externalId,
    title: fc.title,
    synopsis: fc.description,
    description: `${fc.isRecompete ? "RECOMPETE: " : ""}${fc.description}\n\nProgram: ${fc.program}\nExpected RFP: ${new Date(fc.expectedRfpDate).toLocaleDateString()}\nVehicle: ${fc.vehicle || "TBD"}\nIncumbent: ${fc.incumbent || "None identified"}\nConfidence: ${fc.confidence}`,
    url: fc.url,
    status: "forecast" as const,
    naicsCodes: fc.naicsCodes,
    setAside: fc.setAside,
    contractValue: fc.estimatedValue?.toString() || null,
    dueAt: new Date(fc.expectedRfpDate),
    lastSeenAt: new Date(),
    updatedAt: new Date(),
    locationJson: {
      agency: fc.agency,
      program: fc.program,
      vehicle: fc.vehicle,
      incumbent: fc.incumbent,
      confidence: fc.confidence,
      isRecompete: fc.isRecompete,
    },
  };

  let oppId: string;

  if (existingOpp.length > 0) {
    oppId = existingOpp[0].id;
    await db.update(opportunities)
      .set(oppData)
      .where(eq(opportunities.id, oppId));
  } else {
    const inserted = await db.insert(opportunities)
      .values(oppData)
      .returning({ id: opportunities.id });
    oppId = inserted[0].id;
  }

  if (!previousHash) {
    await db.insert(captureChangeEvents).values({
      tenantId,
      sourceType: "forecast",
      externalId: fc.externalId,
      entityId: oppId,
      changeType: fc.isRecompete ? "new" : "new",
      changeSummary: `${fc.isRecompete ? "Recompete" : "Forecast"}: ${fc.title} (${fc.agency}) — Expected RFP ${new Date(fc.expectedRfpDate).toLocaleDateString()} — $${(fc.estimatedValue || 0).toLocaleString()}`,
      newHash,
    });
    changeEventsCreated++;
  } else if (previousHash !== newHash) {
    await db.insert(captureChangeEvents).values({
      tenantId,
      sourceType: "forecast",
      externalId: fc.externalId,
      entityId: oppId,
      changeType: "updated",
      changeSummary: `Forecast updated: ${fc.title} — data has changed since last sync`,
      previousHash,
      newHash,
    });
    changeEventsCreated++;
  }

  return changeEventsCreated;
}

async function syncAward(tenantId: string, aw: HGAward): Promise<void> {
  const newHash = HigherGovAdapter.computeHash(aw);

  const existingArchive = await db
    .select()
    .from(highergovRawArchive)
    .where(
      and(
        eq(highergovRawArchive.tenantId, tenantId),
        eq(highergovRawArchive.sourceType, "award"),
        eq(highergovRawArchive.externalId, aw.externalId)
      )
    )
    .limit(1);

  if (existingArchive.length > 0) {
    await db.update(highergovRawArchive)
      .set({
        hashSignature: newHash,
        rawPayload: aw as any,
        lastSeenAt: new Date(),
      })
      .where(eq(highergovRawArchive.id, existingArchive[0].id));
  } else {
    await db.insert(highergovRawArchive).values({
      tenantId,
      sourceType: "award",
      externalId: aw.externalId,
      hashSignature: newHash,
      rawPayload: aw as any,
      sourceUrl: aw.url,
    });
  }
}

async function syncTaskOrder(tenantId: string, to: HGTaskOrder): Promise<number> {
  const newHash = HigherGovAdapter.computeHash(to);
  let changeEventsCreated = 0;

  const existingArchive = await db
    .select()
    .from(highergovRawArchive)
    .where(
      and(
        eq(highergovRawArchive.tenantId, tenantId),
        eq(highergovRawArchive.sourceType, "task_order"),
        eq(highergovRawArchive.externalId, to.externalId)
      )
    )
    .limit(1);

  const previousHash = existingArchive[0]?.hashSignature || null;

  if (existingArchive.length > 0) {
    await db.update(highergovRawArchive)
      .set({
        hashSignature: newHash,
        rawPayload: to as any,
        lastSeenAt: new Date(),
      })
      .where(eq(highergovRawArchive.id, existingArchive[0].id));
  } else {
    await db.insert(highergovRawArchive).values({
      tenantId,
      sourceType: "task_order",
      externalId: to.externalId,
      hashSignature: newHash,
      rawPayload: to as any,
      sourceUrl: to.url,
    });
  }

  if (!previousHash) {
    await db.insert(captureChangeEvents).values({
      tenantId,
      sourceType: "task_order",
      externalId: to.externalId,
      changeType: "new",
      changeSummary: `New task order: ${to.title} (${to.agency}) - $${to.value.toLocaleString()} on ${to.parentContract}`,
      newHash,
    });
    changeEventsCreated++;
  }

  return changeEventsCreated;
}

export async function getHealthStatus(tenantId: string = DEFAULT_TENANT_ID) {
  const archiveCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(highergovRawArchive)
    .where(eq(highergovRawArchive.tenantId, tenantId));

  const changeCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(captureChangeEvents)
    .where(eq(captureChangeEvents.tenantId, tenantId));

  const pipelineCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pipelineItems)
    .where(eq(pipelineItems.tenantId, tenantId));

  return {
    status: "healthy",
    source: "highergov",
    mode: "mock",
    lastSyncTime,
    syncInProgress,
    counts: {
      rawArchive: archiveCount[0]?.count || 0,
      changeEvents: changeCount[0]?.count || 0,
      pipelineItems: pipelineCount[0]?.count || 0,
    },
    lastResult: lastSyncResult ? {
      opportunitiesSynced: lastSyncResult.opportunitiesSynced,
      forecastsSynced: lastSyncResult.forecastsSynced,
      awardsSynced: lastSyncResult.awardsSynced,
      taskOrdersSynced: lastSyncResult.taskOrdersSynced,
      changeEventsCreated: lastSyncResult.changeEventsCreated,
      errors: lastSyncResult.errors.length,
    } : null,
  };
}
