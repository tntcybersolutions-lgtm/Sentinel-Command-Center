import { db } from "../db";
import { conversationMemory, type HerbieFact } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import {
  recordFact,
  recordDecision,
  recordRelationship,
  getFacts as getFactsCanonical,
  getDecisions as getDecisionsCanonical,
  getRelationships as getRelationshipsCanonical,
  type RecordFactResult,
} from "./herbie-facts.service";

// ---------------------------------------------------------------------------
// PART A — Three-Layer Memory ergonomic wrappers (Roadmap Feature 8).
// These thin (ctx, payload) adapters re-export the canonical persistence
// helpers from herbie-facts.service.ts under the "writeX/getX" naming used by
// the tool handlers and the agent. Behavior (idempotency, supersession,
// low-confidence routing to herbie_review_queue) lives in herbie-facts.
// ---------------------------------------------------------------------------

export interface MemoryCtx {
  tenantId: string;
  projectId?: string | null;
}

export async function writeFact(
  ctx: MemoryCtx,
  fact: {
    subjectType: string;
    subjectId?: string | null;
    predicate: string;
    object?: string | null;
    objectJson?: any;
    sourceType: string;
    sourceId?: string | null;
    confidence?: number;
    extractedAt?: Date;
  },
): Promise<RecordFactResult> {
  return recordFact({
    tenantId: ctx.tenantId,
    projectId: ctx.projectId ?? null,
    subjectType: fact.subjectType,
    subjectId: fact.subjectId ?? null,
    predicate: fact.predicate,
    object: fact.object ?? null,
    objectJson: fact.objectJson ?? null,
    sourceType: fact.sourceType,
    sourceId: fact.sourceId ?? null,
    confidence: typeof fact.confidence === "number" ? fact.confidence : 1.0,
    extractedAt: fact.extractedAt,
  });
}

export async function writeDecision(
  ctx: MemoryCtx,
  decision: {
    summary: string;
    rationale?: string | null;
    decidedBy: string;
    relatedEntityType?: string | null;
    relatedEntityId?: string | null;
    metadataJson?: any;
  },
) {
  return recordDecision({
    tenantId: ctx.tenantId,
    projectId: ctx.projectId ?? null,
    summary: decision.summary,
    rationale: decision.rationale ?? null,
    decidedBy: decision.decidedBy,
    relatedEntityType: decision.relatedEntityType ?? null,
    relatedEntityId: decision.relatedEntityId ?? null,
    metadataJson: decision.metadataJson ?? null,
  });
}

export async function writeRelationship(
  ctx: MemoryCtx,
  rel: {
    entityType: "contact" | "vendor" | "company";
    entityId: string;
    role: string;
    status?: string;
    notes?: string | null;
  },
) {
  return recordRelationship({
    tenantId: ctx.tenantId,
    projectId: ctx.projectId ?? null,
    contactId: rel.entityType === "contact" ? rel.entityId : null,
    vendorId: rel.entityType === "vendor" ? rel.entityId : null,
    companyId: rel.entityType === "company" ? rel.entityId : null,
    role: rel.role,
    status: rel.status ?? "active",
    notes: rel.notes ?? null,
  });
}

export async function getProjectFacts(
  ctx: MemoryCtx,
  filter: { subjectType?: string; subjectId?: string; predicate?: string } = {},
): Promise<HerbieFact[]> {
  const rows = await getFactsCanonical({
    tenantId: ctx.tenantId,
    projectId: ctx.projectId ?? undefined,
    subjectType: filter.subjectType,
    subjectId: filter.subjectId,
    limit: 200,
  });
  if (!filter.predicate) return rows;
  return rows.filter((r) => r.predicate === filter.predicate);
}

export async function getProjectDecisions(ctx: MemoryCtx, limit = 20) {
  return getDecisionsCanonical({
    tenantId: ctx.tenantId,
    projectId: ctx.projectId ?? undefined,
    limit,
  });
}

export async function getProjectRelationships(ctx: MemoryCtx, role?: string) {
  return getRelationshipsCanonical({
    tenantId: ctx.tenantId,
    projectId: ctx.projectId ?? undefined,
    role,
  });
}

const fallbackMemory = new Map<string, Array<{ key: string; value: any; createdAt: string }>>();
const MAX_HISTORY = 50;

function memKey(tenantId: string, userId: string): string {
  return `${tenantId}:${userId}`;
}

function fallbackGet(tenantId: string, userId: string, type: string): any[] {
  const key = memKey(tenantId, userId);
  const all = fallbackMemory.get(key) || [];
  return all.filter((e) => e.key.startsWith(type));
}

function fallbackSet(tenantId: string, userId: string, key: string, value: any): void {
  const mk = memKey(tenantId, userId);
  const all = fallbackMemory.get(mk) || [];
  all.push({ key, value, createdAt: new Date().toISOString() });
  if (all.length > MAX_HISTORY) all.splice(0, all.length - MAX_HISTORY);
  fallbackMemory.set(mk, all);
}

export async function storeInteraction(
  tenantId: string,
  userId: string,
  input: any,
  output: any,
  signals: any
): Promise<void> {
  const key = `brief_${Date.now()}`;
  const value = { input, output, signals };
  try {
    await db.insert(conversationMemory).values({
      tenantId,
      userId,
      memoryType: "herbie_interaction",
      memoryKey: key,
      memoryValue: value,
      context: "herbie_brief",
    });
    const countResult = await db.execute(sql`
      SELECT count(*)::int as cnt FROM conversation_memory
      WHERE tenant_id = ${tenantId} AND user_id = ${userId} AND memory_type = 'herbie_interaction'
    `);
    const cnt = (countResult.rows?.[0] as any)?.cnt ?? 0;
    if (cnt > MAX_HISTORY) {
      await db.execute(sql`
        DELETE FROM conversation_memory
        WHERE id IN (
          SELECT id FROM conversation_memory
          WHERE tenant_id = ${tenantId} AND user_id = ${userId} AND memory_type = 'herbie_interaction'
          ORDER BY created_at ASC
          LIMIT ${cnt - MAX_HISTORY}
        )
      `);
    }
  } catch {
    fallbackSet(tenantId, userId, key, value);
  }
}

export async function getPreferences(tenantId: string, userId: string): Promise<any> {
  try {
    const rows = await db
      .select()
      .from(conversationMemory)
      .where(
        and(
          eq(conversationMemory.tenantId, tenantId),
          eq(conversationMemory.userId, userId),
          eq(conversationMemory.memoryType, "herbie_preference"),
          eq(conversationMemory.memoryKey, "profile")
        )
      )
      .limit(1);
    return rows[0]?.memoryValue ?? { tone: "professional", format: "bullets", role: "owner", priorities: ["margin", "compliance", "speed"] };
  } catch {
    const items = fallbackGet(tenantId, userId, "profile");
    return items[0]?.value ?? { tone: "professional", format: "bullets", role: "owner", priorities: ["margin", "compliance", "speed"] };
  }
}

export async function updatePreferences(tenantId: string, userId: string, prefs: any): Promise<void> {
  try {
    const existing = await db
      .select({ id: conversationMemory.id })
      .from(conversationMemory)
      .where(
        and(
          eq(conversationMemory.tenantId, tenantId),
          eq(conversationMemory.userId, userId),
          eq(conversationMemory.memoryType, "herbie_preference"),
          eq(conversationMemory.memoryKey, "profile")
        )
      )
      .limit(1);
    if (existing.length) {
      await db
        .update(conversationMemory)
        .set({ memoryValue: prefs, updatedAt: new Date() })
        .where(eq(conversationMemory.id, existing[0].id));
    } else {
      await db.insert(conversationMemory).values({
        tenantId,
        userId,
        memoryType: "herbie_preference",
        memoryKey: "profile",
        memoryValue: prefs,
        context: "herbie_preferences",
      });
    }
  } catch {
    fallbackSet(tenantId, userId, "profile", prefs);
  }
}

export async function getPatterns(tenantId: string, userId: string): Promise<{
  recurringIssues: string[];
  automationCandidates: string[];
  trainingOpportunities: string[];
}> {
  const empty = { recurringIssues: [], automationCandidates: [], trainingOpportunities: [] };
  try {
    const rows = await db
      .select({ memoryValue: conversationMemory.memoryValue })
      .from(conversationMemory)
      .where(
        and(
          eq(conversationMemory.tenantId, tenantId),
          eq(conversationMemory.userId, userId),
          eq(conversationMemory.memoryType, "herbie_interaction")
        )
      )
      .orderBy(desc(conversationMemory.createdAt))
      .limit(20);

    if (rows.length < 3) return empty;

    const riskCounts = new Map<string, number>();
    const issueCounts = new Map<string, number>();

    for (const row of rows) {
      const val = row.memoryValue as any;
      const signals = val?.signals;
      if (!signals) continue;
      if (Array.isArray(signals.risks)) {
        for (const r of signals.risks) {
          riskCounts.set(r, (riskCounts.get(r) || 0) + 1);
        }
      }
      if (Array.isArray(signals.complianceAlerts)) {
        for (const a of signals.complianceAlerts) {
          const key = typeof a === "string" ? a : a?.issue || "";
          if (key) issueCounts.set(key, (issueCounts.get(key) || 0) + 1);
        }
      }
    }

    const recurringIssues = [...riskCounts.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k]) => k);

    const automationCandidates = [...issueCounts.entries()]
      .filter(([, c]) => c >= 2)
      .slice(0, 3)
      .map(([k]) => `Auto-alert: ${k}`);

    const trainingOpportunities = recurringIssues.length > 0
      ? [`Review recurring issue: ${recurringIssues[0]}`]
      : [];

    return { recurringIssues, automationCandidates, trainingOpportunities };
  } catch {
    return empty;
  }
}

export async function getMemorySummary(tenantId: string, userId: string): Promise<string> {
  const [prefs, patterns] = await Promise.all([
    getPreferences(tenantId, userId),
    getPatterns(tenantId, userId),
  ]);

  const parts: string[] = [];
  if (prefs) {
    parts.push(`Preferences: tone=${prefs.tone || "professional"}, role=${prefs.role || "owner"}, priorities=${(prefs.priorities || []).join(",")}`);
  }
  if (patterns.recurringIssues.length) {
    parts.push(`Known recurring issues: ${patterns.recurringIssues.join("; ")}`);
  }
  if (patterns.automationCandidates.length) {
    parts.push(`Automation candidates: ${patterns.automationCandidates.join("; ")}`);
  }
  return parts.length ? parts.join(". ") + "." : "";
}

const DEFAULT_PLAYBOOK_RULES = [
  { name: "coi_before_ntp", rule: "COI required before NTP", category: "insurance", description: "Certificate of Insurance must be on file before issuing Notice to Proceed." },
  { name: "lien_waiver_final_payment", rule: "Lien waiver required before final payment", category: "billing", description: "Unconditional lien waiver from all subs/vendors required before processing final payment." },
  { name: "rfi_turnaround", rule: "RFI turnaround: 5 business days", category: "rfi", description: "All RFIs must be responded to within 5 business days." },
  { name: "addendum_ack", rule: "Addendum acknowledgement required before bid submission", category: "bidding", description: "All addenda must be acknowledged in writing before bid can be submitted." },
  { name: "w9_new_subs", rule: "W-9 required for all new subcontractors", category: "compliance", description: "W-9 tax form must be collected before first payment to any new subcontractor." },
];

export async function getPlaybookRules(tenantId: string): Promise<Array<{ name: string; rule: string; category: string; description: string }>> {
  try {
    const rows = await db
      .select({ memoryKey: conversationMemory.memoryKey, memoryValue: conversationMemory.memoryValue })
      .from(conversationMemory)
      .where(
        and(
          eq(conversationMemory.tenantId, tenantId),
          eq(conversationMemory.memoryType, "herbie_playbook")
        )
      );

    if (rows.length === 0) {
      for (const rule of DEFAULT_PLAYBOOK_RULES) {
        await db.insert(conversationMemory).values({
          tenantId,
          memoryType: "herbie_playbook",
          memoryKey: rule.name,
          memoryValue: rule,
          context: "herbie_playbook_seed",
        }).onConflictDoNothing();
      }
      return DEFAULT_PLAYBOOK_RULES;
    }

    return rows.map((r) => {
      const v = r.memoryValue as any;
      return {
        name: r.memoryKey,
        rule: v?.rule || r.memoryKey,
        category: v?.category || "general",
        description: v?.description || "",
      };
    });
  } catch {
    return DEFAULT_PLAYBOOK_RULES;
  }
}

export async function upsertPlaybookRule(
  tenantId: string,
  rule: { name: string; rule: string; category: string; description: string }
): Promise<void> {
  try {
    const existing = await db
      .select({ id: conversationMemory.id })
      .from(conversationMemory)
      .where(
        and(
          eq(conversationMemory.tenantId, tenantId),
          eq(conversationMemory.memoryType, "herbie_playbook"),
          eq(conversationMemory.memoryKey, rule.name)
        )
      )
      .limit(1);

    if (existing.length) {
      await db
        .update(conversationMemory)
        .set({ memoryValue: rule, updatedAt: new Date() })
        .where(eq(conversationMemory.id, existing[0].id));
    } else {
      await db.insert(conversationMemory).values({
        tenantId,
        memoryType: "herbie_playbook",
        memoryKey: rule.name,
        memoryValue: rule,
        context: "herbie_playbook",
      });
    }
  } catch {
    // graceful fallback - rule not persisted
  }
}
