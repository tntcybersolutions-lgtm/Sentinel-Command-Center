import { db } from "../db";
import {
  autofillRules, autofillRuns,
  type AutofillRule, type InsertAutofillRun,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export type FieldMapping = {
  sourceField: string;
  targetField: string;
  transform?: string;
};

export type AutofillSuggestion = {
  ruleId: string;
  ruleName: string;
  ruleType: string;
  targetField: string;
  suggestedValue: any;
  confidence: number;
  requiresConfirmation: boolean;
};

export async function getApplicableRules(
  tenantId: string,
  sourceEntityType: string,
  targetEntityType: string
): Promise<AutofillRule[]> {
  return db.select().from(autofillRules)
    .where(and(
      eq(autofillRules.tenantId, tenantId),
      eq(autofillRules.sourceEntityType, sourceEntityType),
      eq(autofillRules.targetEntityType, targetEntityType),
      eq(autofillRules.isActive, true),
    ))
    .orderBy(autofillRules.priority);
}

export function applyDeterministicMapping(
  sourceData: Record<string, any>,
  mappings: FieldMapping[]
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const mapping of mappings) {
    const value = sourceData[mapping.sourceField];
    if (value === undefined || value === null) continue;

    let transformed = value;
    if (mapping.transform === "uppercase") transformed = String(value).toUpperCase();
    else if (mapping.transform === "lowercase") transformed = String(value).toLowerCase();
    else if (mapping.transform === "trim") transformed = String(value).trim();
    else if (mapping.transform === "parseNumber") transformed = parseFloat(value) || 0;
    else if (mapping.transform === "toString") transformed = String(value);

    result[mapping.targetField] = transformed;
  }
  return result;
}

export async function computeSuggestions(
  tenantId: string,
  sourceEntityType: string,
  sourceData: Record<string, any>,
  targetEntityType: string
): Promise<AutofillSuggestion[]> {
  const rules = await getApplicableRules(tenantId, sourceEntityType, targetEntityType);
  const suggestions: AutofillSuggestion[] = [];

  for (const rule of rules) {
    const mappings = (rule.fieldMappings as FieldMapping[]) || [];
    const filled = applyDeterministicMapping(sourceData, mappings);

    for (const [field, value] of Object.entries(filled)) {
      suggestions.push({
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        targetField: field,
        suggestedValue: value,
        confidence: rule.ruleType === "deterministic" ? 1.0 : rule.ruleType === "rule_based" ? 0.8 : 0.6,
        requiresConfirmation: rule.requiresConfirmation || rule.ruleType === "ai_suggested",
      });
    }
  }

  return suggestions;
}

export async function executeAutofill(
  tenantId: string,
  ruleId: string,
  eventId: string | null,
  sourceEntityType: string,
  sourceEntityId: string,
  sourceData: Record<string, any>,
  targetEntityType: string,
  targetEntityId: string
): Promise<Record<string, any>> {
  const [rule] = await db.select().from(autofillRules).where(eq(autofillRules.id, ruleId));
  if (!rule) throw new Error(`Autofill rule ${ruleId} not found`);

  const mappings = (rule.fieldMappings as FieldMapping[]) || [];
  const filled = applyDeterministicMapping(sourceData, mappings);

  await db.insert(autofillRuns).values({
    tenantId,
    ruleId,
    eventId,
    sourceEntityType,
    sourceEntityId,
    targetEntityType,
    targetEntityId,
    fieldsApplied: filled,
    status: rule.requiresConfirmation ? "pending_confirmation" : "applied",
  });

  return filled;
}

export async function getAutofillHistory(
  tenantId: string,
  entityType: string,
  entityId: string,
  limit = 20
) {
  return db.select().from(autofillRuns)
    .where(and(
      eq(autofillRuns.tenantId, tenantId),
      eq(autofillRuns.targetEntityType, entityType),
      eq(autofillRuns.targetEntityId, entityId),
    ))
    .orderBy(desc(autofillRuns.createdAt))
    .limit(limit);
}

export async function confirmAutofillRun(runId: string, confirmedBy: string) {
  return db.update(autofillRuns)
    .set({ status: "confirmed", confirmedBy, confirmedAt: new Date() })
    .where(eq(autofillRuns.id, runId));
}

export async function rejectAutofillRun(runId: string) {
  return db.update(autofillRuns)
    .set({ status: "rejected" })
    .where(eq(autofillRuns.id, runId));
}

export const autofillEngine = {
  getApplicableRules,
  computeSuggestions,
  executeAutofill,
  getAutofillHistory,
  confirmAutofillRun,
  rejectAutofillRun,
  applyDeterministicMapping,
};
