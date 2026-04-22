import { db } from "../db";
import { aiArtifacts } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  summarizeOpportunity,
  scoreOpportunity,
  generateCapturePlan,
  generateOutreachDraft,
} from "./capture-copilot.service";

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const MODEL_VERSION = "gpt-4o-mini";
const PROMPT_VERSION = "v1.0";

export async function persistArtifact(opts: {
  tenantId: string;
  entityType: string;
  entityId: string;
  artifactType: string;
  payload: any;
  evidence?: any;
  confidence?: number;
}) {
  const inserted = await db.insert(aiArtifacts).values({
    tenantId: opts.tenantId,
    entityType: opts.entityType,
    entityId: opts.entityId,
    artifactType: opts.artifactType,
    payloadJson: opts.payload,
    evidenceJson: opts.evidence || null,
    confidence: opts.confidence || null,
    modelVersion: MODEL_VERSION,
    promptVersion: PROMPT_VERSION,
  }).returning();
  return inserted[0];
}

export async function getArtifacts(entityType: string, entityId: string, tenantId: string = DEFAULT_TENANT_ID) {
  return db
    .select()
    .from(aiArtifacts)
    .where(
      and(
        eq(aiArtifacts.tenantId, tenantId),
        eq(aiArtifacts.entityType, entityType),
        eq(aiArtifacts.entityId, entityId)
      )
    )
    .orderBy(desc(aiArtifacts.createdAt));
}

export async function getArtifactsByType(entityType: string, entityId: string, artifactType: string, tenantId: string = DEFAULT_TENANT_ID) {
  return db
    .select()
    .from(aiArtifacts)
    .where(
      and(
        eq(aiArtifacts.tenantId, tenantId),
        eq(aiArtifacts.entityType, entityType),
        eq(aiArtifacts.entityId, entityId),
        eq(aiArtifacts.artifactType, artifactType)
      )
    )
    .orderBy(desc(aiArtifacts.createdAt))
    .limit(1);
}

export async function runAiModule(module: string, entityType: string, entityId: string, options: any = {}, tenantId: string = DEFAULT_TENANT_ID) {
  let result: any;
  let artifactType: string;
  let confidence: number = 70;

  switch (module) {
    case "summarize": {
      result = await summarizeOpportunity(entityId, tenantId);
      artifactType = "summary";
      confidence = 80;
      break;
    }
    case "score": {
      result = await scoreOpportunity(entityId, tenantId);
      artifactType = "score";
      confidence = result.overall || 70;
      break;
    }
    case "capture_plan": {
      result = await generateCapturePlan(entityId, tenantId);
      artifactType = "capture_plan";
      confidence = 75;
      break;
    }
    case "outreach": {
      const recipientType = options.recipientType || "teaming_partner";
      result = await generateOutreachDraft(entityId, recipientType, tenantId);
      artifactType = "outreach_draft";
      confidence = 72;
      break;
    }
    default:
      throw new Error(`Unknown AI module: ${module}`);
  }

  const artifact = await persistArtifact({
    tenantId,
    entityType,
    entityId,
    artifactType,
    payload: result,
    evidence: { module, options, generatedAt: new Date().toISOString() },
    confidence,
  });

  return { result, artifact };
}
