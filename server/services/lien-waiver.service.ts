// Lien Waiver service.
//
// Manages the lifecycle of construction lien waivers:
//   draft → sent → signed → received   (and any state → voided)
//
// All transitions log to `lien_waiver_events` for audit. State transitions
// are guarded — re-firing a transition that has already happened returns
// the row unchanged (idempotent for the demo flow). Invalid transitions
// throw so the API surface returns a 409.
//
// The "document" generator returns a deterministic plain-text body that
// renders the four canonical US lien-waiver templates. It is sufficient
// for demo/testing — production would hand this to a PDF renderer.

import { db } from "../db";
import {
  lienWaivers,
  lienWaiverEvents,
  vendors,
  projects,
  type LienWaiver,
  type InsertLienWaiver,
} from "@shared/schema";
import { and, desc, eq, sql } from "drizzle-orm";

export const WAIVER_TYPES = [
  "conditional_partial",
  "unconditional_partial",
  "conditional_final",
  "unconditional_final",
] as const;
export type WaiverType = (typeof WAIVER_TYPES)[number];

export const WAIVER_STATUSES = [
  "draft",
  "sent",
  "signed",
  "received",
  "voided",
] as const;
export type WaiverStatus = (typeof WAIVER_STATUSES)[number];

export interface WaiverException {
  description: string;
  amount: number;
}

interface CreateInput {
  tenantId: string;
  projectId: string;
  vendorId: string;
  subcontractId?: string | null;
  payAppId?: string | null;
  waiverType: WaiverType;
  throughDate: Date;
  paymentAmount: string | number;
  exceptions?: WaiverException[];
  signerName?: string | null;
  signerTitle?: string | null;
  signerEmail?: string | null;
  expiresAt?: Date | null;
  notesText?: string | null;
  createdByUserId?: string | null;
}

function assertWaiverType(t: string): asserts t is WaiverType {
  if (!WAIVER_TYPES.includes(t as WaiverType)) {
    throw new Error(`invalid waiver_type: ${t}`);
  }
}

async function nextWaiverNumber(tenantId: string): Promise<string> {
  // Format: LW-YYYY-#### (per-tenant monotonic). For demo we just count
  // existing rows for the tenant + 1 — collision-safe enough.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(lienWaivers)
    .where(eq(lienWaivers.tenantId, tenantId));
  const year = new Date().getUTCFullYear();
  const seq = String((count ?? 0) + 1).padStart(4, "0");
  return `LW-${year}-${seq}`;
}

async function logEvent(
  tenantId: string,
  waiverId: string,
  eventType: string,
  actorUserId: string | null | undefined,
  actorName: string | null | undefined,
  payload: Record<string, unknown> | null = null,
): Promise<void> {
  await db.insert(lienWaiverEvents).values({
    tenantId,
    waiverId,
    eventType,
    actorUserId: actorUserId ?? null,
    actorName: actorName ?? null,
    payloadJson: payload as never,
  } as never);
}

export async function createWaiver(input: CreateInput): Promise<LienWaiver> {
  assertWaiverType(input.waiverType);
  const waiverNumber = await nextWaiverNumber(input.tenantId);
  const insert: InsertLienWaiver = {
    tenantId: input.tenantId,
    projectId: input.projectId,
    vendorId: input.vendorId,
    subcontractId: input.subcontractId ?? null,
    payAppId: input.payAppId ?? null,
    waiverNumber,
    waiverType: input.waiverType,
    status: "draft",
    throughDate: input.throughDate,
    paymentAmount: String(input.paymentAmount),
    exceptionsJson: (input.exceptions ?? null) as never,
    signerName: input.signerName ?? null,
    signerTitle: input.signerTitle ?? null,
    signerEmail: input.signerEmail ?? null,
    expiresAt: input.expiresAt ?? null,
    notesText: input.notesText ?? null,
    createdByUserId: input.createdByUserId ?? null,
  };
  const [row] = await db.insert(lienWaivers).values(insert).returning();
  await logEvent(input.tenantId, row.id, "created", input.createdByUserId ?? null, null, {
    waiverType: input.waiverType,
    paymentAmount: insert.paymentAmount,
  });
  return row;
}

export async function updateWaiver(
  tenantId: string,
  waiverId: string,
  patch: Partial<{
    waiverType: WaiverType;
    throughDate: Date;
    paymentAmount: string | number;
    exceptions: WaiverException[];
    signerName: string | null;
    signerTitle: string | null;
    signerEmail: string | null;
    expiresAt: Date | null;
    notesText: string | null;
    payAppId: string | null;
    subcontractId: string | null;
  }>,
  actorUserId: string | null = null,
  actorName: string | null = null,
): Promise<LienWaiver> {
  const existing = await getWaiver(tenantId, waiverId);
  if (!existing) throw new Error("waiver not found");
  if (existing.status !== "draft") {
    throw Object.assign(new Error("only draft waivers can be edited"), {
      statusCode: 409,
    });
  }
  if (patch.waiverType) assertWaiverType(patch.waiverType);
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.waiverType !== undefined) updates.waiverType = patch.waiverType;
  if (patch.throughDate !== undefined) updates.throughDate = patch.throughDate;
  if (patch.paymentAmount !== undefined)
    updates.paymentAmount = String(patch.paymentAmount);
  if (patch.exceptions !== undefined) updates.exceptionsJson = patch.exceptions;
  if (patch.signerName !== undefined) updates.signerName = patch.signerName;
  if (patch.signerTitle !== undefined) updates.signerTitle = patch.signerTitle;
  if (patch.signerEmail !== undefined) updates.signerEmail = patch.signerEmail;
  if (patch.expiresAt !== undefined) updates.expiresAt = patch.expiresAt;
  if (patch.notesText !== undefined) updates.notesText = patch.notesText;
  if (patch.payAppId !== undefined) updates.payAppId = patch.payAppId;
  if (patch.subcontractId !== undefined)
    updates.subcontractId = patch.subcontractId;

  const [row] = await db
    .update(lienWaivers)
    .set(updates as never)
    .where(and(eq(lienWaivers.tenantId, tenantId), eq(lienWaivers.id, waiverId)))
    .returning();
  await logEvent(tenantId, waiverId, "updated", actorUserId, actorName, updates);
  return row;
}

async function transition(
  tenantId: string,
  waiverId: string,
  expectFrom: WaiverStatus[],
  to: WaiverStatus,
  ts: Date,
  tsField: keyof typeof lienWaivers.$inferSelect,
  actorUserId: string | null,
  actorName: string | null,
  payload: Record<string, unknown> | null = null,
): Promise<LienWaiver> {
  const existing = await getWaiver(tenantId, waiverId);
  if (!existing) throw new Error("waiver not found");
  if (existing.status === to) {
    // idempotent — already in target state.
    return existing;
  }
  if (!expectFrom.includes(existing.status as WaiverStatus)) {
    throw Object.assign(
      new Error(
        `cannot transition from ${existing.status} → ${to} (expected ${expectFrom.join("|")})`,
      ),
      { statusCode: 409 },
    );
  }
  const updates: Record<string, unknown> = {
    status: to,
    updatedAt: new Date(),
    [tsField]: ts,
  };
  const [row] = await db
    .update(lienWaivers)
    .set(updates as never)
    .where(and(eq(lienWaivers.tenantId, tenantId), eq(lienWaivers.id, waiverId)))
    .returning();
  await logEvent(tenantId, waiverId, to, actorUserId, actorName, payload);
  return row;
}

export function sendWaiver(
  tenantId: string,
  waiverId: string,
  actorUserId: string | null = null,
  actorName: string | null = null,
): Promise<LienWaiver> {
  return transition(
    tenantId,
    waiverId,
    ["draft"],
    "sent",
    new Date(),
    "sentAt",
    actorUserId,
    actorName,
  );
}

export function signWaiver(
  tenantId: string,
  waiverId: string,
  actorUserId: string | null = null,
  actorName: string | null = null,
  signedBy?: { name?: string; title?: string; email?: string } | null,
): Promise<LienWaiver> {
  return transition(
    tenantId,
    waiverId,
    ["sent"],
    "signed",
    new Date(),
    "signedAt",
    actorUserId,
    actorName,
    signedBy ?? null,
  );
}

export function receiveWaiver(
  tenantId: string,
  waiverId: string,
  actorUserId: string | null = null,
  actorName: string | null = null,
): Promise<LienWaiver> {
  return transition(
    tenantId,
    waiverId,
    ["signed"],
    "received",
    new Date(),
    "receivedAt",
    actorUserId,
    actorName,
  );
}

export function voidWaiver(
  tenantId: string,
  waiverId: string,
  reason: string,
  actorUserId: string | null = null,
  actorName: string | null = null,
): Promise<LienWaiver> {
  return transition(
    tenantId,
    waiverId,
    ["draft", "sent", "signed"],
    "voided",
    new Date(),
    "voidedAt",
    actorUserId,
    actorName,
    { reason },
  );
}

export async function getWaiver(
  tenantId: string,
  waiverId: string,
): Promise<LienWaiver | null> {
  const [row] = await db
    .select()
    .from(lienWaivers)
    .where(and(eq(lienWaivers.tenantId, tenantId), eq(lienWaivers.id, waiverId)))
    .limit(1);
  return row ?? null;
}

export interface WaiverFilters {
  projectId?: string;
  vendorId?: string;
  payAppId?: string;
  status?: WaiverStatus;
  waiverType?: WaiverType;
}

export async function listWaivers(
  tenantId: string,
  filters: WaiverFilters = {},
): Promise<LienWaiver[]> {
  const conds = [eq(lienWaivers.tenantId, tenantId)];
  if (filters.projectId) conds.push(eq(lienWaivers.projectId, filters.projectId));
  if (filters.vendorId) conds.push(eq(lienWaivers.vendorId, filters.vendorId));
  if (filters.payAppId) conds.push(eq(lienWaivers.payAppId, filters.payAppId));
  if (filters.status) conds.push(eq(lienWaivers.status, filters.status));
  if (filters.waiverType) conds.push(eq(lienWaivers.waiverType, filters.waiverType));
  return db
    .select()
    .from(lienWaivers)
    .where(and(...conds))
    .orderBy(desc(lienWaivers.createdAt))
    .limit(500);
}

export interface WaiverStats {
  total: number;
  draft: number;
  sent: number;
  signed: number;
  received: number;
  voided: number;
  outstandingAmount: number;
}

export async function getStats(
  tenantId: string,
  projectId?: string,
): Promise<WaiverStats> {
  const conds = [eq(lienWaivers.tenantId, tenantId)];
  if (projectId) conds.push(eq(lienWaivers.projectId, projectId));
  const rows = await db
    .select({
      status: lienWaivers.status,
      paymentAmount: lienWaivers.paymentAmount,
    })
    .from(lienWaivers)
    .where(and(...conds));
  const stats: WaiverStats = {
    total: rows.length,
    draft: 0,
    sent: 0,
    signed: 0,
    received: 0,
    voided: 0,
    outstandingAmount: 0,
  };
  for (const r of rows) {
    const k = r.status as WaiverStatus;
    if (k in stats && k !== "voided") {
      (stats as unknown as Record<string, number>)[k]++;
    } else if (k === "voided") {
      stats.voided++;
    }
    if (k === "sent" || k === "draft") {
      stats.outstandingAmount += parseFloat(r.paymentAmount as unknown as string) || 0;
    }
  }
  return stats;
}

export async function listEvents(
  tenantId: string,
  waiverId: string,
): Promise<Array<typeof lienWaiverEvents.$inferSelect>> {
  return db
    .select()
    .from(lienWaiverEvents)
    .where(
      and(
        eq(lienWaiverEvents.tenantId, tenantId),
        eq(lienWaiverEvents.waiverId, waiverId),
      ),
    )
    .orderBy(desc(lienWaiverEvents.createdAt))
    .limit(200);
}

const TYPE_TITLES: Record<WaiverType, string> = {
  conditional_partial:
    "CONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT",
  unconditional_partial:
    "UNCONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT",
  conditional_final: "CONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT",
  unconditional_final: "UNCONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT",
};

export async function generateDocumentText(
  tenantId: string,
  waiverId: string,
): Promise<string> {
  const waiver = await getWaiver(tenantId, waiverId);
  if (!waiver) throw new Error("waiver not found");
  const [vendor] = await db
    .select({ companyName: vendors.companyName, contactName: vendors.contactName })
    .from(vendors)
    .where(eq(vendors.id, waiver.vendorId))
    .limit(1);
  const [project] = await db
    .select({ name: projects.name, projectNumber: projects.projectNumber })
    .from(projects)
    .where(eq(projects.id, waiver.projectId))
    .limit(1);

  const conditional =
    waiver.waiverType === "conditional_partial" ||
    waiver.waiverType === "conditional_final";
  const isFinal =
    waiver.waiverType === "conditional_final" ||
    waiver.waiverType === "unconditional_final";

  const exceptionLines = (
    (waiver.exceptionsJson as WaiverException[] | null) ?? []
  )
    .map((e, i) => `  ${i + 1}. ${e.description} — $${Number(e.amount).toFixed(2)}`)
    .join("\n");

  const conditionalParagraph = conditional
    ? `\nThis waiver and release does not become effective until the claimant has actually received payment of $${parseFloat(waiver.paymentAmount).toFixed(2)} in the payment instrument referenced above.\n`
    : `\nThe claimant has been paid in full.\n`;

  const finalParagraph = isFinal
    ? `\nThis is a FINAL waiver. The claimant releases all lien rights for labor, services, equipment, and material furnished to the property through completion of the contract.\n`
    : `\nThis is a PARTIAL (progress) waiver. Lien rights are released only for amounts paid through the date noted above; rights are reserved for retention, pending change orders, and unbilled work.\n`;

  return [
    TYPE_TITLES[waiver.waiverType as WaiverType],
    "",
    `Waiver No.: ${waiver.waiverNumber}`,
    `Project: ${project?.name ?? "—"} (${project?.projectNumber ?? "—"})`,
    `Claimant: ${vendor?.companyName ?? "—"}`,
    `Through Date: ${waiver.throughDate.toISOString().slice(0, 10)}`,
    `Payment Amount: $${parseFloat(waiver.paymentAmount).toFixed(2)}`,
    "",
    "EXCEPTIONS (disputed/unpaid items reserved):",
    exceptionLines || "  None",
    conditionalParagraph,
    finalParagraph,
    "Signed:",
    `  ${waiver.signerName ?? "_____________________________"}`,
    `  ${waiver.signerTitle ?? "Title"}`,
    `  ${waiver.signerEmail ?? ""}`,
    waiver.signedAt
      ? `  Signed on: ${waiver.signedAt.toISOString().slice(0, 10)}`
      : "",
  ].join("\n");
}
