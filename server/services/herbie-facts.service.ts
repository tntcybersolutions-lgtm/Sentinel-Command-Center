// Phase 1, Roadmap Feature 8 — three-layer Herbie memory (facts + decisions +
// relationships). See HERBIE.md for read/write rules. This service is the
// structured "project memory" layer; conversational memory still lives in
// conversation_memory (herbie-memory.service.ts).
//
// Not yet wired into any route. Requires a follow-up `npm run db:push` to
// materialize the new tables in the live database before any caller invokes
// these helpers.

import { db } from "../db";
import {
  herbieFacts,
  herbieDecisions,
  herbieRelationships,
  herbieReviewQueue,
  type InsertHerbieFact,
  type InsertHerbieDecision,
  type InsertHerbieRelationship,
  type HerbieFact,
  type HerbieDecision,
  type HerbieRelationship,
} from "@shared/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

// Low-confidence facts are routed to the human review queue instead of
// being persisted as facts. Threshold per HERBIE.md.
export const FACT_CONFIDENCE_THRESHOLD = 0.7;

export interface RecordFactInput
  extends Omit<InsertHerbieFact, "confidence" | "extractedAt"> {
  confidence: number; // 0..1 — stored as DECIMAL(4,2) in DB
  extractedAt?: Date;
}

export interface RecordFactResult {
  status: "persisted" | "queued_for_review";
  factId?: string;
  reviewQueueId?: string;
  supersededFactId?: string | null;
}

/**
 * Record an atomic fact about an entity.
 *
 * Rules (HERBIE.md):
 *   - Facts below FACT_CONFIDENCE_THRESHOLD go to herbie_review_queue, not
 *     to herbie_facts.
 *   - If a current (non-superseded) fact exists with the same
 *     (tenant, subjectType, subjectId, predicate) AND a different object,
 *     supersede it rather than deleting.
 *   - Writing the same (subject, predicate, object) twice is a no-op on
 *     storage — we return the existing fact rather than creating a
 *     duplicate row.
 */
export async function recordFact(
  input: RecordFactInput,
): Promise<RecordFactResult> {
  const confidence = input.confidence;

  // Low-confidence → review queue.
  if (confidence < FACT_CONFIDENCE_THRESHOLD) {
    const [queued] = await db
      .insert(herbieReviewQueue)
      .values({
        tenantId: input.tenantId,
        reviewType: "fact_extraction",
        actionProposed: `Record fact: ${input.subjectType}:${input.subjectId ?? "-"} ${input.predicate} = ${input.object ?? JSON.stringify(input.objectJson ?? null)}`,
        confidence: confidence.toFixed(2),
        reasoningText: `Below confidence threshold (${FACT_CONFIDENCE_THRESHOLD})`,
        status: "pending",
        priority: 100,
      })
      .returning({ id: herbieReviewQueue.id });

    return {
      status: "queued_for_review",
      reviewQueueId: queued.id,
    };
  }

  // Look for an existing current fact with the same (subject, predicate).
  const existing = await db
    .select()
    .from(herbieFacts)
    .where(
      and(
        eq(herbieFacts.tenantId, input.tenantId),
        eq(herbieFacts.subjectType, input.subjectType),
        eq(herbieFacts.predicate, input.predicate),
        input.subjectId
          ? eq(herbieFacts.subjectId, input.subjectId)
          : isNull(herbieFacts.subjectId),
        isNull(herbieFacts.supersededById),
      ),
    )
    .limit(1);

  const prior = existing[0];

  if (prior && objectEquals(prior, input)) {
    // Idempotent: same fact already on record.
    return { status: "persisted", factId: prior.id };
  }

  // Insert the new fact.
  const [inserted] = await db
    .insert(herbieFacts)
    .values({
      tenantId: input.tenantId,
      projectId: input.projectId ?? null,
      subjectType: input.subjectType,
      subjectId: input.subjectId ?? null,
      predicate: input.predicate,
      object: input.object ?? null,
      objectJson: input.objectJson ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      confidence: confidence.toFixed(2),
      extractedAt: input.extractedAt ?? new Date(),
    })
    .returning({ id: herbieFacts.id });

  // Supersede the prior if values differ.
  let supersededFactId: string | null = null;
  if (prior) {
    await db
      .update(herbieFacts)
      .set({ supersededById: inserted.id, supersededAt: new Date() })
      .where(eq(herbieFacts.id, prior.id));
    supersededFactId = prior.id;
  }

  return {
    status: "persisted",
    factId: inserted.id,
    supersededFactId,
  };
}

function objectEquals(prior: HerbieFact, input: RecordFactInput): boolean {
  const priorScalar = prior.object;
  const inputScalar = input.object ?? null;
  if (priorScalar !== inputScalar) return false;
  const priorJson = JSON.stringify(prior.objectJson ?? null);
  const inputJson = JSON.stringify(input.objectJson ?? null);
  return priorJson === inputJson;
}

/**
 * Read current (non-superseded) facts scoped to a tenant, optionally
 * narrowed by project and/or subject. Results are ordered by
 * most-recently extracted first.
 */
export async function getFacts(opts: {
  tenantId: string;
  projectId?: string | null;
  subjectType?: string;
  subjectId?: string;
  limit?: number;
}): Promise<HerbieFact[]> {
  const clauses = [
    eq(herbieFacts.tenantId, opts.tenantId),
    isNull(herbieFacts.supersededById),
  ];
  if (opts.projectId !== undefined) {
    clauses.push(
      opts.projectId === null
        ? isNull(herbieFacts.projectId)
        : eq(herbieFacts.projectId, opts.projectId),
    );
  }
  if (opts.subjectType) clauses.push(eq(herbieFacts.subjectType, opts.subjectType));
  if (opts.subjectId) clauses.push(eq(herbieFacts.subjectId, opts.subjectId));

  return db
    .select()
    .from(herbieFacts)
    .where(and(...clauses))
    .orderBy(desc(herbieFacts.extractedAt))
    .limit(opts.limit ?? 50);
}

export interface RecordDecisionInput extends InsertHerbieDecision {}

/**
 * Record a project decision (approval, rejection, strategy call, etc.).
 * Decisions are append-only — never edited, never deleted.
 */
export async function recordDecision(
  input: RecordDecisionInput,
): Promise<HerbieDecision> {
  const [row] = await db.insert(herbieDecisions).values(input).returning();
  return row;
}

export async function getDecisions(opts: {
  tenantId: string;
  projectId?: string | null;
  relatedEntityType?: string;
  relatedEntityId?: string;
  limit?: number;
}): Promise<HerbieDecision[]> {
  const clauses = [eq(herbieDecisions.tenantId, opts.tenantId)];
  if (opts.projectId !== undefined) {
    clauses.push(
      opts.projectId === null
        ? isNull(herbieDecisions.projectId)
        : eq(herbieDecisions.projectId, opts.projectId),
    );
  }
  if (opts.relatedEntityType) {
    clauses.push(eq(herbieDecisions.relatedEntityType, opts.relatedEntityType));
  }
  if (opts.relatedEntityId) {
    clauses.push(eq(herbieDecisions.relatedEntityId, opts.relatedEntityId));
  }
  return db
    .select()
    .from(herbieDecisions)
    .where(and(...clauses))
    .orderBy(desc(herbieDecisions.decidedAt))
    .limit(opts.limit ?? 50);
}

export interface RecordRelationshipInput extends InsertHerbieRelationship {}

/**
 * Upsert a relationship on the composite key
 * (tenantId, projectId?, contact/vendor/companyId, role). If one of
 * contactId/vendorId/companyId matches an existing row, we update that
 * row rather than creating a duplicate.
 *
 * Exactly one of contactId / vendorId / companyId must be provided —
 * rejecting any other shape keeps the relationship index meaningful.
 */
export async function recordRelationship(
  input: RecordRelationshipInput,
): Promise<HerbieRelationship> {
  const targetCount = [input.contactId, input.vendorId, input.companyId].filter(
    (v) => v != null,
  ).length;
  if (targetCount !== 1) {
    throw new Error(
      "recordRelationship: exactly one of contactId / vendorId / companyId must be set",
    );
  }

  // Build a precise match clause for the target column.
  const targetClause = input.contactId
    ? eq(herbieRelationships.contactId, input.contactId)
    : input.vendorId
      ? eq(herbieRelationships.vendorId, input.vendorId)
      : eq(herbieRelationships.companyId, input.companyId!);

  const existing = await db
    .select()
    .from(herbieRelationships)
    .where(
      and(
        eq(herbieRelationships.tenantId, input.tenantId),
        input.projectId
          ? eq(herbieRelationships.projectId, input.projectId)
          : isNull(herbieRelationships.projectId),
        eq(herbieRelationships.role, input.role),
        targetClause,
      ),
    )
    .limit(1);

  if (existing[0]) {
    const [updated] = await db
      .update(herbieRelationships)
      .set({
        status: input.status ?? existing[0].status,
        notes: input.notes ?? existing[0].notes,
        updatedAt: new Date(),
      })
      .where(eq(herbieRelationships.id, existing[0].id))
      .returning();
    return updated;
  }

  const [inserted] = await db
    .insert(herbieRelationships)
    .values(input)
    .returning();
  return inserted;
}

export async function getRelationships(opts: {
  tenantId: string;
  projectId?: string | null;
  role?: string;
  limit?: number;
}): Promise<HerbieRelationship[]> {
  const clauses = [eq(herbieRelationships.tenantId, opts.tenantId)];
  if (opts.projectId !== undefined) {
    clauses.push(
      opts.projectId === null
        ? isNull(herbieRelationships.projectId)
        : eq(herbieRelationships.projectId, opts.projectId),
    );
  }
  if (opts.role) clauses.push(eq(herbieRelationships.role, opts.role));
  return db
    .select()
    .from(herbieRelationships)
    .where(and(...clauses))
    .orderBy(desc(herbieRelationships.updatedAt))
    .limit(opts.limit ?? 50);
}

/**
 * Assemble the structured project-memory block for system-prompt
 * injection. Callers concatenate this under the identity layer
 * (HERBIE.md) per HERBIE.md's "System-prompt assembly" rules.
 */
export async function getProjectMemoryBlock(opts: {
  tenantId: string;
  projectId: string;
  maxFacts?: number;
  maxDecisions?: number;
  maxRelationships?: number;
}): Promise<{
  facts: HerbieFact[];
  decisions: HerbieDecision[];
  relationships: HerbieRelationship[];
}> {
  const [facts, decisions, relationships] = await Promise.all([
    getFacts({
      tenantId: opts.tenantId,
      projectId: opts.projectId,
      limit: opts.maxFacts ?? 30,
    }),
    getDecisions({
      tenantId: opts.tenantId,
      projectId: opts.projectId,
      limit: opts.maxDecisions ?? 10,
    }),
    getRelationships({
      tenantId: opts.tenantId,
      projectId: opts.projectId,
      limit: opts.maxRelationships ?? 20,
    }),
  ]);
  return { facts, decisions, relationships };
}

// Re-export the threshold for callers that need to branch on it.
export { FACT_CONFIDENCE_THRESHOLD as HERBIE_FACT_CONFIDENCE_THRESHOLD };

// A small helper that lets tests peek at a "current fact" by
// (subject, predicate) without exposing internals. Kept thin and
// documented — not a general-purpose query API.
export async function __peekCurrentFact(
  tenantId: string,
  subjectType: string,
  subjectId: string | null,
  predicate: string,
): Promise<HerbieFact | undefined> {
  const rows = await db
    .select()
    .from(herbieFacts)
    .where(
      and(
        eq(herbieFacts.tenantId, tenantId),
        eq(herbieFacts.subjectType, subjectType),
        subjectId ? eq(herbieFacts.subjectId, subjectId) : isNull(herbieFacts.subjectId),
        eq(herbieFacts.predicate, predicate),
        isNull(herbieFacts.supersededById),
      ),
    )
    .limit(1);
  return rows[0];
}

// Unused symbols kept to make the service API visible to tooling.
void sql;
