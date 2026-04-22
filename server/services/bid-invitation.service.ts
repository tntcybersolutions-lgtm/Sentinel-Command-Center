import crypto from "crypto";
import { db } from "../db";
import { 
  bidInvitations, bidInvitationEvents, vendorBidSubmissions,
  jacketFolders, jacketDocuments, vendors, bidProjects, opportunities,
  VENDOR_VISIBLE_FOLDER_CODES
} from "@shared/schema";
import { eq, and, desc, sql, count, inArray } from "drizzle-orm";

// ============================================================================
// TOKEN HYGIENE
// ============================================================================

export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function verifyTokenHash(rawToken: string, storedHash: string): boolean {
  const computed = hashToken(rawToken);
  return crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(storedHash, "hex"));
}

// ============================================================================
// FOLDER VISIBILITY (ALLOW-LIST ONLY)
// ============================================================================

export function isVendorVisibleFolder(folderName: string): boolean {
  const code = extractFolderCode(folderName);
  if (!code) return false;
  return (VENDOR_VISIBLE_FOLDER_CODES as readonly string[]).includes(code);
}

function extractFolderCode(folderName: string): string | null {
  if (!folderName) return null;
  const dashMatch = folderName.match(/^(\d{2})\s*-\s*/);
  if (dashMatch) return dashMatch[1];
  const underscoreMatch = folderName.match(/^(\d{2})_/);
  if (underscoreMatch) return underscoreMatch[1];
  const numOnly = folderName.match(/^(\d{2})$/);
  if (numOnly) return numOnly[1];
  return null;
}

export async function getVendorVisibleFolders(tenantId: string, bidProjectId: string) {
  const allFolders = await db.select().from(jacketFolders).where(
    and(
      eq(jacketFolders.tenantId, tenantId),
      eq(jacketFolders.jacketType, "bid"),
      eq(jacketFolders.jacketId, bidProjectId)
    )
  );
  return allFolders.filter(f => isVendorVisibleFolder(f.name));
}

export async function getVendorVisibleDocuments(tenantId: string, bidProjectId: string) {
  const visibleFolders = await getVendorVisibleFolders(tenantId, bidProjectId);
  if (visibleFolders.length === 0) return [];
  const folderIds = visibleFolders.map(f => f.id);
  return db.select().from(jacketDocuments).where(
    and(
      eq(jacketDocuments.tenantId, tenantId),
      eq(jacketDocuments.status, "active"),
      eq(jacketDocuments.latestVersion, true),
      inArray(jacketDocuments.folderId, folderIds)
    )
  );
}

// ============================================================================
// ANTI-IDOR: Verify document belongs to bid and is in visible folder
// ============================================================================

export async function verifyDocumentAccess(
  tenantId: string, bidProjectId: string, documentId: string
): Promise<{ allowed: boolean; document?: any; folder?: any }> {
  const doc = await db.select().from(jacketDocuments).where(
    and(
      eq(jacketDocuments.id, documentId),
      eq(jacketDocuments.tenantId, tenantId),
      eq(jacketDocuments.status, "active")
    )
  ).then(r => r[0]);
  if (!doc) return { allowed: false };

  const folder = await db.select().from(jacketFolders).where(
    and(
      eq(jacketFolders.id, doc.folderId),
      eq(jacketFolders.tenantId, tenantId),
      eq(jacketFolders.jacketType, "bid"),
      eq(jacketFolders.jacketId, bidProjectId)
    )
  ).then(r => r[0]);
  if (!folder) return { allowed: false };

  if (!isVendorVisibleFolder(folder.name)) return { allowed: false };

  return { allowed: true, document: doc, folder };
}

// ============================================================================
// INVITATION MANAGEMENT
// ============================================================================

export async function resolveInvitationByToken(rawToken: string) {
  const hash = hashToken(rawToken);
  const invitation = await db.select().from(bidInvitations).where(
    eq(bidInvitations.tokenHash, hash)
  ).then(r => r[0]);
  return invitation || null;
}

export async function createInvitation(
  tenantId: string, bidProjectId: string, vendorId: string, createdByUserId?: string
): Promise<{ invitation: any; rawToken: string }> {
  const rawToken = generateInviteToken();
  const tHash = hashToken(rawToken);

  const bidProject = await db.select().from(bidProjects).where(
    eq(bidProjects.id, bidProjectId)
  ).then(r => r[0]);
  if (!bidProject) throw new Error("Bid project not found");

  let dueAt: Date | null = null;
  if (bidProject.opportunityId) {
    const opp = await db.select().from(opportunities).where(
      eq(opportunities.id, bidProject.opportunityId)
    ).then(r => r[0]);
    if (opp?.dueAt) dueAt = opp.dueAt;
  }

  const [inv] = await db.insert(bidInvitations).values({
    tenantId,
    bidProjectId,
    vendorId,
    tokenHash: tHash,
    status: "invited",
    dueAt,
    sentAt: new Date(),
    lastActivityAt: new Date(),
    createdByUserId,
  }).returning();

  return { invitation: inv, rawToken };
}

export async function getInvitationsForBid(tenantId: string, bidProjectId: string) {
  const invitations = await db.select({
    invitation: bidInvitations,
    vendor: vendors,
  }).from(bidInvitations)
    .innerJoin(vendors, eq(bidInvitations.vendorId, vendors.id))
    .where(
      and(
        eq(bidInvitations.tenantId, tenantId),
        eq(bidInvitations.bidProjectId, bidProjectId)
      )
    )
    .orderBy(desc(bidInvitations.createdAt));

  const results = [];
  for (const row of invitations) {
    const events = await db.select().from(bidInvitationEvents).where(
      eq(bidInvitationEvents.invitationId, row.invitation.id)
    );
    const downloadCount = events.filter(e => e.eventType === "downloaded_doc").length;
    const submission = await db.select().from(vendorBidSubmissions).where(
      eq(vendorBidSubmissions.invitationId, row.invitation.id)
    ).then(r => r[0]);

    results.push({
      ...row.invitation,
      vendor: row.vendor,
      downloadCount,
      eventCount: events.length,
      submission: submission || null,
    });
  }
  return results;
}

export async function getEngagementMetrics(tenantId: string, bidProjectId: string) {
  const invitations = await db.select().from(bidInvitations).where(
    and(
      eq(bidInvitations.tenantId, tenantId),
      eq(bidInvitations.bidProjectId, bidProjectId)
    )
  );

  const total = invitations.length;
  const opened = invitations.filter(i => i.openedAt !== null).length;
  const intends = invitations.filter(i => i.status === "intends_to_bid").length;
  const declined = invitations.filter(i => i.status === "declined").length;
  const submitted = invitations.filter(i => i.status === "submitted").length;

  let downloaded = 0;
  for (const inv of invitations) {
    const dlEvents = await db.select().from(bidInvitationEvents).where(
      and(
        eq(bidInvitationEvents.invitationId, inv.id),
        eq(bidInvitationEvents.eventType, "downloaded_doc")
      )
    );
    if (dlEvents.length > 0) downloaded++;
  }

  return {
    total,
    opened,
    downloaded,
    intends,
    declined,
    submitted,
    engagementRate: total > 0 ? Math.round((opened / total) * 100) : 0,
    responseRate: total > 0 ? Math.round(((intends + declined + submitted) / total) * 100) : 0,
  };
}

// ============================================================================
// EVENT LOGGING (with de-duplication for "opened")
// ============================================================================

export async function logInvitationEvent(
  invitationId: string,
  eventType: string,
  opts: { documentId?: string; ip?: string; userAgent?: string; detailsJson?: any } = {}
) {
  if (eventType === "opened") {
    const existing = await db.select().from(bidInvitationEvents).where(
      and(
        eq(bidInvitationEvents.invitationId, invitationId),
        eq(bidInvitationEvents.eventType, "opened")
      )
    ).then(r => r[0]);
    if (existing) {
      await db.update(bidInvitations).set({ lastActivityAt: new Date() }).where(
        eq(bidInvitations.id, invitationId)
      );
      return existing;
    }
  }

  const [event] = await db.insert(bidInvitationEvents).values({
    invitationId,
    eventType,
    documentId: opts.documentId || null,
    ip: opts.ip || null,
    userAgent: opts.userAgent || null,
    detailsJson: opts.detailsJson || null,
  }).returning();

  await db.update(bidInvitations).set({ lastActivityAt: new Date() }).where(
    eq(bidInvitations.id, invitationId)
  );

  return event;
}

// ============================================================================
// PORTAL ACTIONS
// ============================================================================

export async function markOpened(invitationId: string, ip: string, userAgent: string) {
  const inv = await db.select().from(bidInvitations).where(
    eq(bidInvitations.id, invitationId)
  ).then(r => r[0]);
  if (!inv) return null;

  if (!inv.openedAt) {
    await db.update(bidInvitations).set({
      openedAt: new Date(),
      status: inv.status === "invited" ? "opened" : inv.status,
      updatedAt: new Date(),
    }).where(eq(bidInvitations.id, invitationId));
  }

  await logInvitationEvent(invitationId, "opened", { ip, userAgent });
  return inv;
}

export async function setIntendsToBid(
  invitationId: string, intends: boolean, ip: string, userAgent: string
) {
  const newStatus = intends ? "intends_to_bid" : "declined";
  await db.update(bidInvitations).set({
    status: newStatus,
    respondedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(bidInvitations.id, invitationId));

  await logInvitationEvent(invitationId, intends ? "intends" : "declined", { ip, userAgent });
}

export async function saveBidDraft(invitationId: string, data: any) {
  const existing = await db.select().from(vendorBidSubmissions).where(
    eq(vendorBidSubmissions.invitationId, invitationId)
  ).then(r => r[0]);

  if (existing) {
    const [updated] = await db.update(vendorBidSubmissions).set({
      baseBidAmount: data.baseBidAmount,
      alternatesJson: data.alternatesJson || null,
      allowancesJson: data.allowancesJson || null,
      exclusionsText: data.exclusionsText || null,
      qualificationsText: data.qualificationsText || null,
      attachmentsJson: data.attachmentsJson || null,
      updatedAt: new Date(),
    }).where(eq(vendorBidSubmissions.id, existing.id)).returning();
    return updated;
  }

  const [created] = await db.insert(vendorBidSubmissions).values({
    invitationId,
    baseBidAmount: data.baseBidAmount,
    alternatesJson: data.alternatesJson || null,
    allowancesJson: data.allowancesJson || null,
    exclusionsText: data.exclusionsText || null,
    qualificationsText: data.qualificationsText || null,
    attachmentsJson: data.attachmentsJson || null,
    status: "draft",
  }).returning();
  return created;
}

export async function submitBid(
  invitationId: string, data: any, ip: string, userAgent: string
) {
  const inv = await db.select().from(bidInvitations).where(
    eq(bidInvitations.id, invitationId)
  ).then(r => r[0]);
  if (!inv) throw new Error("Invitation not found");

  if (inv.dueAt && new Date() > inv.dueAt) {
    throw new Error("Bid submission deadline has passed");
  }

  const submission = await saveBidDraft(invitationId, data);

  await db.update(vendorBidSubmissions).set({
    status: "submitted",
    submittedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(vendorBidSubmissions.id, submission.id));

  await db.update(bidInvitations).set({
    status: "submitted",
    submittedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(bidInvitations.id, invitationId));

  await logInvitationEvent(invitationId, "submitted", { ip, userAgent });

  return submission;
}

// ============================================================================
// REMINDER SYSTEM
// ============================================================================

export async function processReminders() {
  const now = new Date();
  const h48ago = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const h72ago = new Date(now.getTime() - 72 * 60 * 60 * 1000);
  const h72ahead = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  const reminderCooldown = 24 * 60 * 60 * 1000; // 24h cooldown

  const allInvitations = await db.select().from(bidInvitations);
  let sent = 0;

  for (const inv of allInvitations) {
    if (inv.status === "submitted" || inv.status === "declined") continue;

    const lastReminder = await db.select().from(bidInvitationEvents).where(
      and(
        eq(bidInvitationEvents.invitationId, inv.id),
        eq(bidInvitationEvents.eventType, "reminder_sent")
      )
    ).then(r => r.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]);

    if (lastReminder && (now.getTime() - lastReminder.createdAt.getTime()) < reminderCooldown) {
      continue;
    }

    let shouldRemind = false;
    let reason = "";

    if (inv.status === "invited" && inv.sentAt && inv.sentAt < h48ago && !inv.openedAt) {
      shouldRemind = true;
      reason = "not_opened_48h";
    } else if (inv.openedAt && inv.openedAt < h72ago && inv.status === "opened") {
      shouldRemind = true;
      reason = "opened_no_intent_72h";
    } else if (inv.dueAt && inv.dueAt < h72ahead && inv.dueAt > now && inv.status !== "submitted") {
      shouldRemind = true;
      reason = "deadline_approaching_72h";
    }

    if (shouldRemind) {
      await logInvitationEvent(inv.id, "reminder_sent", {
        detailsJson: { reason, reminderAt: now.toISOString() }
      });
      sent++;
    }
  }

  return { processed: allInvitations.length, remindersSent: sent };
}

// ============================================================================
// RATE LIMITING (in-memory, per-IP + per-token)
// ============================================================================

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxRequests = 60, windowMs = 60000): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count++;
  if (entry.count > maxRequests) return false;
  return true;
}

const failedTokenAttempts = new Map<string, { count: number; blockedUntil: number }>();

export function checkTokenAttempt(ip: string): boolean {
  const now = Date.now();
  const entry = failedTokenAttempts.get(ip);
  if (!entry) return true;
  if (now > entry.blockedUntil) {
    failedTokenAttempts.delete(ip);
    return true;
  }
  return false;
}

export function recordFailedTokenAttempt(ip: string) {
  const now = Date.now();
  const entry = failedTokenAttempts.get(ip) || { count: 0, blockedUntil: 0 };
  entry.count++;
  if (entry.count >= 5) {
    entry.blockedUntil = now + 15 * 60 * 1000; // 15 min block
  }
  failedTokenAttempts.set(ip, entry);
}
