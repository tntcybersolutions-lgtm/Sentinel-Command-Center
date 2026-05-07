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
  lienWaiverReminders,
  vendors,
  projects,
  projectFolders,
  jacketFolders,
  type LienWaiver,
  type InsertLienWaiver,
  type LienWaiverReminder,
} from "@shared/schema";
import { and, asc, desc, eq, gt, isNull, lte, sql } from "drizzle-orm";

const LIEN_WAIVER_FOLDER_NAME = "11_Lien_Waivers";
const LIEN_WAIVER_JACKET_FOLDER_NAME = "13 - Lien Waivers";

function isPgUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

async function lookupJacketFolderId(tenantId: string, projectId: string): Promise<string | undefined> {
  const r = await db
    .select({ id: jacketFolders.id })
    .from(jacketFolders)
    .where(and(
      eq(jacketFolders.tenantId, tenantId),
      eq(jacketFolders.jacketType, "project"),
      eq(jacketFolders.jacketId, projectId),
      eq(jacketFolders.name, LIEN_WAIVER_JACKET_FOLDER_NAME),
    ))
    .limit(1);
  return r[0]?.id;
}

export async function ensureLienWaiverFolder(
  tenantId: string,
  projectId: string,
): Promise<{ projectFolderId: string; jacketFolderId: string }> {
  const [proj] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.tenantId, tenantId), eq(projects.id, projectId)))
    .limit(1);
  if (!proj) {
    throw Object.assign(new Error(`project not found: ${projectId}`), { statusCode: 404 });
  }

  // projectFolders: race-safe via unique index (tenantId, projectId, name).
  const inserted = await db.insert(projectFolders).values({
    tenantId,
    projectId,
    name: LIEN_WAIVER_FOLDER_NAME,
    sortOrder: 110,
  }).onConflictDoNothing({ target: [projectFolders.tenantId, projectFolders.projectId, projectFolders.name] })
    .returning({ id: projectFolders.id });
  let projectFolderId = inserted[0]?.id;
  if (!projectFolderId) {
    const existing = await db
      .select({ id: projectFolders.id })
      .from(projectFolders)
      .where(and(
        eq(projectFolders.tenantId, tenantId),
        eq(projectFolders.projectId, projectId),
        eq(projectFolders.name, LIEN_WAIVER_FOLDER_NAME),
      ))
      .limit(1);
    projectFolderId = existing[0]?.id;
  }
  if (!projectFolderId) throw new Error(`failed to ensure project folder for ${projectId}`);

  // jacketFolders: only swallow unique-violation, rethrow everything else.
  let jacketFolderId = await lookupJacketFolderId(tenantId, projectId);
  if (!jacketFolderId) {
    try {
      const [row] = await db.insert(jacketFolders).values({
        tenantId,
        jacketType: "project",
        jacketId: projectId,
        name: LIEN_WAIVER_JACKET_FOLDER_NAME,
        path: `/Projects/${projectId}/${LIEN_WAIVER_JACKET_FOLDER_NAME}`,
        sortOrder: 13,
        isSystemFolder: true,
      }).returning({ id: jacketFolders.id });
      jacketFolderId = row.id;
    } catch (err) {
      if (!isPgUniqueViolation(err)) throw err;
      jacketFolderId = await lookupJacketFolderId(tenantId, projectId);
    }
  }
  if (!jacketFolderId) throw new Error(`failed to ensure jacket folder for ${projectId}`);

  return { projectFolderId, jacketFolderId };
}

export async function backfillLienWaiverFoldersForAllProjects(
  tenantId: string,
): Promise<{ projectsScanned: number; foldersEnsured: number }> {
  const allProjects = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.tenantId, tenantId));
  let foldersEnsured = 0;
  for (const p of allProjects) {
    try {
      await ensureLienWaiverFolder(tenantId, p.id);
      foldersEnsured++;
    } catch (err) {
      console.error(`[lien-waiver] backfill failed for project ${p.id}:`, err);
    }
  }
  return { projectsScanned: allProjects.length, foldersEnsured };
}
import { randomBytes } from "crypto";
import { findTemplate, fillTemplate, type TemplateWaiverType } from "./lien-waiver-templates.seed";

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
  // Guarantee folder BEFORE waiver insert. If folder ensure fails, the
  // waiver is not created — the user gets a real 4xx/5xx and can retry.
  await ensureLienWaiverFolder(input.tenantId, input.projectId);
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

export async function voidWaiver(
  tenantId: string,
  waiverId: string,
  reason: string,
  actorUserId: string | null = null,
  actorName: string | null = null,
): Promise<LienWaiver> {
  const row = await transition(
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
  // Cancel any outstanding reminders so we don't keep nagging a vendor
  // about a waiver that's been voided. Done inside the service so EVERY
  // caller (route, worker, future automation) gets the invariant.
  const cancelled = await cancelPendingReminders(tenantId, waiverId);
  if (cancelled > 0) {
    await logEvent(tenantId, waiverId, "reminders_cancelled", actorUserId, actorName, {
      cancelled,
      reason: "void",
    });
  }
  return row;
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

// ──────────────────────────────────────────────────────────────────────
// E-SIGN TOKEN FLOW
// ──────────────────────────────────────────────────────────────────────
//
// generateSignToken issues an opaque random token bound to one waiver.
// The vendor receives a magic link `/sign/lien-waiver/:token` (no auth
// required) — the public route resolves the waiver, lets the signer
// review the document, capture a signature, and POST back to flip the
// state to 'signed'. Tokens default to a 30-day TTL.

export const SIGN_TOKEN_TTL_DAYS = 30;

export async function generateSignToken(
  tenantId: string,
  waiverId: string,
  ttlDays: number = SIGN_TOKEN_TTL_DAYS,
): Promise<{ token: string; expiresAt: Date }> {
  const existing = await getWaiver(tenantId, waiverId);
  if (!existing) throw new Error("waiver not found");
  if (existing.status === "voided") {
    throw Object.assign(new Error("cannot generate sign token for voided waiver"), {
      statusCode: 409,
    });
  }
  if (existing.status === "received") {
    throw Object.assign(new Error("waiver already received"), { statusCode: 409 });
  }
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  await db
    .update(lienWaivers)
    .set({
      signToken: token,
      signTokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    } as never)
    .where(and(eq(lienWaivers.tenantId, tenantId), eq(lienWaivers.id, waiverId)));
  await logEvent(tenantId, waiverId, "sign_token_generated", null, null, {
    expiresAt: expiresAt.toISOString(),
  });
  return { token, expiresAt };
}

export async function findWaiverBySignToken(token: string): Promise<LienWaiver | null> {
  if (!token || typeof token !== "string") return null;
  const [row] = await db
    .select()
    .from(lienWaivers)
    .where(eq(lienWaivers.signToken, token))
    .limit(1);
  return row ?? null;
}

export async function signByToken(
  token: string,
  signedBy: { name: string; title?: string | null; email?: string | null },
  signatureDataUrl: string,
  ipAddress?: string | null,
): Promise<LienWaiver> {
  // Cheap input validation first (does NOT touch the DB).
  if (!token || typeof token !== "string") {
    throw Object.assign(new Error("invalid sign token"), { statusCode: 404 });
  }
  if (!signedBy.name || !signedBy.name.trim()) {
    throw Object.assign(new Error("signer name required"), { statusCode: 400 });
  }
  if (!signatureDataUrl || !signatureDataUrl.startsWith("data:")) {
    throw Object.assign(new Error("signature data URL required"), { statusCode: 400 });
  }

  // Atomic single-use burn: only one concurrent caller can satisfy the
  // composite predicate (token matches, status='sent', not expired).
  // The first UPDATE wins, clears `sign_token`, and flips status; every
  // subsequent UPDATE returns 0 rows because the token is gone.
  const now = new Date();
  const updated = await db
    .update(lienWaivers)
    .set({
      status: "signed",
      signedAt: now,
      signerName: signedBy.name,
      signerTitle: signedBy.title ?? undefined,
      signerEmail: signedBy.email ?? undefined,
      signatureDataUrl,
      signedIpAddress: ipAddress ?? null,
      // burn the token so it can't be reused
      signToken: null,
      updatedAt: now,
    } as never)
    .where(
      and(
        eq(lienWaivers.signToken, token),
        eq(lienWaivers.status, "sent"),
        gt(lienWaivers.signTokenExpiresAt, now),
      ),
    )
    .returning();

  if (updated.length === 0) {
    // Disambiguate the failure mode for a useful HTTP status: re-read by
    // raw token (no status/expiry guard) so the caller sees the right
    // error. If the row truly doesn't exist anymore the second lookup
    // returns null and we fall through to 404.
    const stale = await findWaiverBySignToken(token);
    if (!stale) {
      throw Object.assign(new Error("invalid sign token"), { statusCode: 404 });
    }
    if (
      stale.signTokenExpiresAt &&
      stale.signTokenExpiresAt.getTime() < Date.now()
    ) {
      throw Object.assign(new Error("sign token expired"), { statusCode: 410 });
    }
    throw Object.assign(
      new Error(
        `waiver is in '${stale.status}' state — only 'sent' waivers can be signed via token`,
      ),
      { statusCode: 409 },
    );
  }

  const row = updated[0];
  await logEvent(row.tenantId, row.id, "signed", null, signedBy.name, {
    signerEmail: signedBy.email,
    via: "public_token",
    ipAddress: ipAddress ?? null,
  });
  return row;
}

// ──────────────────────────────────────────────────────────────────────
// REMINDER SCHEDULING
// ──────────────────────────────────────────────────────────────────────

export const DEFAULT_REMINDER_OFFSETS_DAYS = [3, 7, 14] as const;

export async function scheduleDefaultReminders(
  tenantId: string,
  waiverId: string,
  baseTime: Date = new Date(),
  channel: "email" | "sms" | "teams" = "email",
): Promise<LienWaiverReminder[]> {
  const created: LienWaiverReminder[] = [];
  for (let i = 0; i < DEFAULT_REMINDER_OFFSETS_DAYS.length; i++) {
    const offset = DEFAULT_REMINDER_OFFSETS_DAYS[i];
    const scheduledFor = new Date(baseTime.getTime() + offset * 24 * 60 * 60 * 1000);
    const [row] = await db
      .insert(lienWaiverReminders)
      .values({
        tenantId,
        lienWaiverId: waiverId,
        reminderNumber: i + 1,
        scheduledFor,
        channel,
      })
      .returning();
    created.push(row);
  }
  await logEvent(tenantId, waiverId, "reminders_scheduled", null, null, {
    count: created.length,
    offsetsDays: Array.from(DEFAULT_REMINDER_OFFSETS_DAYS),
  });
  return created;
}

export async function listReminders(
  tenantId: string,
  waiverId: string,
): Promise<LienWaiverReminder[]> {
  return db
    .select()
    .from(lienWaiverReminders)
    .where(
      and(
        eq(lienWaiverReminders.tenantId, tenantId),
        eq(lienWaiverReminders.lienWaiverId, waiverId),
      ),
    )
    .orderBy(asc(lienWaiverReminders.reminderNumber));
}

export async function cancelPendingReminders(
  tenantId: string,
  waiverId: string,
): Promise<number> {
  // soft-cancel by marking sentAt with a sentinel so they're skipped.
  // Using a delete keeps the table tidy; we audit via the parent event.
  const result = await db
    .delete(lienWaiverReminders)
    .where(
      and(
        eq(lienWaiverReminders.tenantId, tenantId),
        eq(lienWaiverReminders.lienWaiverId, waiverId),
        isNull(lienWaiverReminders.sentAt),
      ),
    )
    .returning({ id: lienWaiverReminders.id });
  return result.length;
}

/**
 * Atomically claim a reminder by setting `sent_at` ONLY when it's still
 * null. Returns true if THIS caller burned it (and therefore owns the
 * follow-up side effects), false if another worker / overlapping tick
 * already claimed it. This is the lock-free guard that lets multiple
 * `processDueReminders` invocations run without double-firing.
 */
export async function markReminderSent(reminderId: string): Promise<boolean> {
  const updated = await db
    .update(lienWaiverReminders)
    .set({ sentAt: new Date() })
    .where(
      and(
        eq(lienWaiverReminders.id, reminderId),
        isNull(lienWaiverReminders.sentAt),
      ),
    )
    .returning({ id: lienWaiverReminders.id });
  return updated.length > 0;
}

/**
 * Find every reminder that is due (scheduled_for <= now) and not yet
 * sent. The caller (the monitor worker) is responsible for actually
 * "sending" — for now that means writing an event row + marking sent.
 * Production would hand off to commsService for real email delivery.
 */
export async function processDueReminders(now: Date = new Date()): Promise<{
  processed: number;
  skipped: number;
}> {
  const due = await db
    .select({
      reminder: lienWaiverReminders,
      waiver: lienWaivers,
    })
    .from(lienWaiverReminders)
    .innerJoin(lienWaivers, eq(lienWaivers.id, lienWaiverReminders.lienWaiverId))
    .where(
      and(
        isNull(lienWaiverReminders.sentAt),
        lte(lienWaiverReminders.scheduledFor, now),
      ),
    )
    .limit(100);

  let processed = 0;
  let skipped = 0;
  for (const { reminder, waiver } of due) {
    // Only fire reminders for waivers that are still outstanding (sent
    // but not signed). If the waiver has progressed past 'sent', skip
    // and burn the reminder so it doesn't re-fire forever.
    //
    // `markReminderSent` is an atomic conditional UPDATE — if another
    // overlapping tick already claimed this reminder, claimed === false
    // and we skip without emitting a duplicate event.
    const claimed = await markReminderSent(reminder.id);
    if (!claimed) continue;
    if (waiver.status !== "sent") {
      skipped++;
      continue;
    }
    await logEvent(
      reminder.tenantId,
      waiver.id,
      "reminder_sent",
      null,
      "system",
      {
        reminderNumber: reminder.reminderNumber,
        channel: reminder.channel,
        scheduledFor: reminder.scheduledFor.toISOString(),
        signerEmail: waiver.signerEmail,
      },
    );
    processed++;
  }
  return { processed, skipped };
}

// ──────────────────────────────────────────────────────────────────────
// AUTOFILL — render the seeded statutory template into filledBody
// ──────────────────────────────────────────────────────────────────────

const SERVICE_TYPE_TO_TEMPLATE_KEY: Record<WaiverType, TemplateWaiverType> = {
  conditional_partial: "conditional_progress",
  unconditional_partial: "unconditional_progress",
  conditional_final: "conditional_final",
  unconditional_final: "unconditional_final",
};

export async function autofillWaiver(
  tenantId: string,
  waiverId: string,
): Promise<{ filledBody: string; templateId: string | null; statutory: boolean }> {
  const waiver = await getWaiver(tenantId, waiverId);
  if (!waiver) throw new Error("waiver not found");
  const stateCode = (waiver.state ?? "CA").toUpperCase();
  const templateKey = SERVICE_TYPE_TO_TEMPLATE_KEY[waiver.waiverType as WaiverType];
  const template = await findTemplate(stateCode, templateKey);
  if (!template) {
    throw Object.assign(
      new Error(`no template seeded for state=${stateCode} type=${templateKey}`),
      { statusCode: 404 },
    );
  }

  const [vendor] = waiver.vendorId
    ? await db
        .select({ companyName: vendors.companyName })
        .from(vendors)
        .where(and(eq(vendors.tenantId, tenantId), eq(vendors.id, waiver.vendorId)))
        .limit(1)
    : [];
  const [project] = await db
    .select({ name: projects.name, projectNumber: projects.projectNumber })
    .from(projects)
    .where(and(eq(projects.tenantId, tenantId), eq(projects.id, waiver.projectId)))
    .limit(1);

  const exceptionsText =
    Array.isArray(waiver.exceptionsJson) && waiver.exceptionsJson.length > 0
      ? (waiver.exceptionsJson as WaiverException[])
          .map((e) => `${e.description} ($${Number(e.amount).toFixed(2)})`)
          .join("; ")
      : "None";

  const filledBody = fillTemplate(template.templateBody, {
    claimantName: waiver.claimantName ?? vendor?.companyName ?? "",
    claimantAddress: waiver.claimantAddress ?? "",
    vendorName: waiver.vendorName ?? vendor?.companyName ?? "",
    ownerName: waiver.ownerName ?? "",
    projectDescription: waiver.projectDescription ?? project?.name ?? "",
    propertyDescription: waiver.propertyDescription ?? "",
    throughDate: waiver.throughDate.toISOString().slice(0, 10),
    amount: Number(waiver.paymentAmount).toFixed(2),
    exceptions: exceptionsText,
    signerTitle: waiver.signerTitle ?? "",
    signature: waiver.signerName ?? "",
    signedDate: waiver.signedAt
      ? waiver.signedAt.toISOString().slice(0, 10)
      : "",
  });

  await db
    .update(lienWaivers)
    .set({ filledBody, updatedAt: new Date() } as never)
    .where(and(eq(lienWaivers.tenantId, tenantId), eq(lienWaivers.id, waiverId)));

  await logEvent(tenantId, waiverId, "autofilled", null, "system", {
    templateId: template.id,
    state: stateCode,
    waiverType: templateKey,
  });

  return { filledBody, templateId: template.id, statutory: template.statutory };
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
    .where(and(eq(vendors.tenantId, tenantId), eq(vendors.id, waiver.vendorId)))
    .limit(1);
  const [project] = await db
    .select({ name: projects.name, projectNumber: projects.projectNumber })
    .from(projects)
    .where(and(eq(projects.tenantId, tenantId), eq(projects.id, waiver.projectId)))
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
