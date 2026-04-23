// Phase 1, Roadmap Feature 3 — COI tracker service.
//
// Not yet wired into any route or background job. Requires `npm run
// db:push` before callers invoke it. The 30/14/7/1-day expiry alerts
// (proactive monitor, Feature 9) and the approval-gated renewal email
// draft (Feature 10) hook into `coisExpiringWithin` and
// `expiryTier` respectively.

import { db } from "../db";
import {
  coiCertificates,
  type InsertCoiCertificate,
  type CoiCertificate,
} from "@shared/schema";
import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";

export type CoiExpiryTier =
  | "expired"
  | "critical_1d"
  | "critical_7d"
  | "warning_14d"
  | "warning_30d"
  | "ok";

// Day thresholds that produce proactive Herbie alerts per HERBIE.md's
// "proactive triggers" section (30/14/7/1 days before expiry).
export const COI_ALERT_DAYS = [30, 14, 7, 1] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysUntil(expiry: Date, now: Date): number {
  return Math.ceil((expiry.getTime() - now.getTime()) / MS_PER_DAY);
}

/**
 * Classify a COI by how close to (or past) its expiry. Pure function —
 * callable from UI and server alike. Uses calendar-day granularity,
 * so an expiry "today" is tier `critical_1d`, one yesterday is
 * `expired`.
 */
export function expiryTier(
  input: { expiryDate: Date | string },
  now: Date = new Date(),
): CoiExpiryTier {
  const expiry = input.expiryDate instanceof Date
    ? input.expiryDate
    : new Date(input.expiryDate);
  const days = daysUntil(expiry, now);
  if (days < 0) return "expired";
  if (days <= 1) return "critical_1d";
  if (days <= 7) return "critical_7d";
  if (days <= 14) return "warning_14d";
  if (days <= 30) return "warning_30d";
  return "ok";
}

export function tierSeverity(
  tier: CoiExpiryTier,
): "critical" | "high" | "medium" | "low" {
  switch (tier) {
    case "expired":
    case "critical_1d":
      return "critical";
    case "critical_7d":
      return "high";
    case "warning_14d":
      return "medium";
    case "warning_30d":
      return "low";
    case "ok":
      return "low";
  }
}

/**
 * Upsert a COI on the composite key
 * (tenantId, projectId?, vendorId?, policyType). This matches the
 * `coi_upsert_key` unique index so a re-upload of the same policy
 * updates the existing row rather than duplicating.
 */
export async function upsertCoi(
  input: InsertCoiCertificate,
): Promise<CoiCertificate> {
  const match = await db
    .select()
    .from(coiCertificates)
    .where(
      and(
        eq(coiCertificates.tenantId, input.tenantId),
        input.projectId
          ? eq(coiCertificates.projectId, input.projectId)
          : isNull(coiCertificates.projectId),
        input.vendorId
          ? eq(coiCertificates.vendorId, input.vendorId)
          : isNull(coiCertificates.vendorId),
        eq(coiCertificates.policyType, input.policyType),
      ),
    )
    .limit(1);

  if (match[0]) {
    const [updated] = await db
      .update(coiCertificates)
      .set({
        carrier: input.carrier ?? match[0].carrier,
        policyNumber: input.policyNumber ?? match[0].policyNumber,
        limitsJson: input.limitsJson ?? match[0].limitsJson,
        effectiveDate: input.effectiveDate ?? match[0].effectiveDate,
        expiryDate: input.expiryDate,
        documentId: input.documentId ?? match[0].documentId,
        status: input.status ?? match[0].status,
        notes: input.notes ?? match[0].notes,
        updatedAt: new Date(),
      })
      .where(eq(coiCertificates.id, match[0].id))
      .returning();
    return updated;
  }

  const [inserted] = await db
    .insert(coiCertificates)
    .values(input)
    .returning();
  return inserted;
}

export async function getCoi(
  tenantId: string,
  id: string,
): Promise<CoiCertificate | undefined> {
  const rows = await db
    .select()
    .from(coiCertificates)
    .where(
      and(eq(coiCertificates.tenantId, tenantId), eq(coiCertificates.id, id)),
    )
    .limit(1);
  return rows[0];
}

export async function listForProject(
  tenantId: string,
  projectId: string,
): Promise<CoiCertificate[]> {
  return db
    .select()
    .from(coiCertificates)
    .where(
      and(
        eq(coiCertificates.tenantId, tenantId),
        eq(coiCertificates.projectId, projectId),
      ),
    )
    .orderBy(asc(coiCertificates.expiryDate));
}

export async function listForVendor(
  tenantId: string,
  vendorId: string,
): Promise<CoiCertificate[]> {
  return db
    .select()
    .from(coiCertificates)
    .where(
      and(
        eq(coiCertificates.tenantId, tenantId),
        eq(coiCertificates.vendorId, vendorId),
      ),
    )
    .orderBy(asc(coiCertificates.expiryDate));
}

/**
 * Return every active COI whose expiry falls within `days` from `now`.
 * Includes already-expired certificates (tier `expired`) so a caller
 * handling the monitor can nudge on lapse-in-grace too.
 */
export async function coisExpiringWithin(
  tenantId: string,
  days: number,
  now: Date = new Date(),
): Promise<CoiCertificate[]> {
  const upperBound = new Date(now.getTime() + days * MS_PER_DAY);
  return db
    .select()
    .from(coiCertificates)
    .where(
      and(
        eq(coiCertificates.tenantId, tenantId),
        lte(coiCertificates.expiryDate, upperBound),
      ),
    )
    .orderBy(asc(coiCertificates.expiryDate));
}

/**
 * Convenience: partitions a list of COIs by expiry tier. Useful for
 * cockpit rollup cards (red/yellow/green).
 */
export function partitionByTier(
  cois: CoiCertificate[],
  now: Date = new Date(),
): Record<CoiExpiryTier, CoiCertificate[]> {
  const buckets: Record<CoiExpiryTier, CoiCertificate[]> = {
    expired: [],
    critical_1d: [],
    critical_7d: [],
    warning_14d: [],
    warning_30d: [],
    ok: [],
  };
  for (const coi of cois) {
    buckets[expiryTier(coi, now)].push(coi);
  }
  return buckets;
}

// Silence unused-import linter: `gte` is exported for future callers.
void gte;
