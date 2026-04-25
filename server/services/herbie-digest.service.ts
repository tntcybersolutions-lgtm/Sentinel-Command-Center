// Phase 1 Feature 9 polish — Herbie's proactive digest.
//
// Assembles "here's what Herbie would open with" for a given tenant
// (optionally scoped to a project). Pulls from coi.service,
// contractor-monitors, approval_requests, and rfis. Returns a
// structured summary the UI or a Herbie chat turn can surface.
//
// Voice rules come from HERBIE.md: open with the point, no greeting
// filler, terse and specific. The descriptions here are templated
// but keep that tone.

import { db } from "../db";
import {
  approvalRequests,
  projects,
  herbieDigestDismissals,
  rfis,
} from "@shared/schema";
import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import {
  coisExpiringWithin,
  expiryTier,
  tierSeverity,
  type CoiExpiryTier,
} from "./coi.service";

export interface DigestItem {
  severity: "critical" | "high" | "medium" | "low";
  category: "coi" | "approval" | "rfi" | "submittal";
  headline: string;
  detail?: string;
  entity?: { type: string; id: string };
  suggestedAction?: string;
  // Phase D additions — surfaced on the Herbie Digest page.
  projectId?: string;
  projectName?: string;
  actionType: string;
  createdAt: string;
}

export interface HerbieDigest {
  tenantId: string;
  projectId?: string;
  generatedAt: string;
  totals: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  items: DigestItem[];
}

export interface BuildDigestInput {
  tenantId: string;
  projectId?: string;
  lookaheadDays?: number;
  now?: Date;
}

export async function buildHerbieDigest(
  input: BuildDigestInput,
): Promise<HerbieDigest> {
  const now = input.now ?? new Date();
  const lookahead = input.lookaheadDays ?? 30;

  const [coiItems, approvalItems, rfiItems, dismissedKeys] = await Promise.all([
    gatherCoiItems(input.tenantId, input.projectId, lookahead, now),
    gatherApprovalItems(input.tenantId),
    gatherStalledRfiItems(input.tenantId, input.projectId, now),
    gatherActiveDismissals(input.tenantId, now),
  ]);

  const all = [...coiItems, ...approvalItems, ...rfiItems];
  const items = all
    .filter((it) => {
      if (!it.entity) return true;
      return !dismissedKeys.has(`${it.entity.type}:${it.entity.id}`);
    })
    .sort(severityCompare);

  const totals = {
    critical: items.filter((i) => i.severity === "critical").length,
    high: items.filter((i) => i.severity === "high").length,
    medium: items.filter((i) => i.severity === "medium").length,
    low: items.filter((i) => i.severity === "low").length,
  };

  return {
    tenantId: input.tenantId,
    projectId: input.projectId,
    generatedAt: now.toISOString(),
    totals,
    items,
  };
}

async function gatherCoiItems(
  tenantId: string,
  projectId: string | undefined,
  lookaheadDays: number,
  now: Date,
): Promise<DigestItem[]> {
  const cois = await coisExpiringWithin(tenantId, lookaheadDays, now);
  const scoped = projectId
    ? cois.filter((c) => !c.projectId || c.projectId === projectId)
    : cois;

  const projectIds = Array.from(
    new Set(scoped.map((c) => c.projectId).filter((id): id is string => !!id)),
  );
  const projectNameMap = await loadProjectNameMap(tenantId, projectIds);

  return scoped.map<DigestItem>((coi) => {
    const tier: CoiExpiryTier = expiryTier(coi, now);
    const policy = coi.policyType.toUpperCase();
    const carrier = coi.carrier ? ` (${coi.carrier})` : "";
    return {
      severity: tierSeverity(tier),
      category: "coi",
      headline:
        tier === "expired"
          ? `${policy}${carrier} EXPIRED.`
          : `${policy}${carrier} expires ${friendlyDate(coi.expiryDate, now)}.`,
      detail: coi.policyNumber ? `Policy ${coi.policyNumber}` : undefined,
      entity: { type: "coi_certificate", id: coi.id },
      suggestedAction:
        tier === "expired"
          ? "Stop any at-risk work; renew immediately."
          : "Draft the renewal and send for signature.",
      projectId: coi.projectId ?? undefined,
      projectName: coi.projectId ? projectNameMap.get(coi.projectId) : undefined,
      actionType: "renew_coi",
      createdAt: (coi.createdAt ?? now).toISOString(),
    };
  });
}

async function gatherApprovalItems(tenantId: string): Promise<DigestItem[]> {
  const rows = await db
    .select({
      id: approvalRequests.id,
      actionType: approvalRequests.actionType,
      priority: approvalRequests.priority,
      entityType: approvalRequests.entityType,
      entityId: approvalRequests.entityId,
      createdAt: approvalRequests.createdAt,
    })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.tenantId, tenantId),
        eq(approvalRequests.status, "pending"),
      ),
    );

  // Best-effort project resolution: when the approval directly targets a
  // bid_project, look up its name. Other entity types are left blank.
  const bidProjectIds = Array.from(
    new Set(
      rows
        .filter((r) => r.entityType === "bid_project")
        .map((r) => r.entityId),
    ),
  );
  const projectNameMap = await loadProjectNameMap(tenantId, bidProjectIds);

  return rows.map<DigestItem>((r) => {
    const severity =
      r.priority === "urgent" ? "critical" :
      r.priority === "high" ? "high" :
      r.priority === "low" ? "low" :
      "medium";
    const drafty = (r.actionType || "").startsWith("draft_");
    const projectId =
      r.entityType === "bid_project" ? r.entityId : undefined;
    return {
      severity,
      category: "approval",
      headline: drafty
        ? `Herbie drafted ${humanizeActionType(r.actionType)} — ready for your review.`
        : `${humanizeActionType(r.actionType)} waiting on your approval.`,
      entity: { type: "approval_request", id: r.id },
      suggestedAction: drafty
        ? "Review the draft and approve to send, or deny with notes."
        : "Open the approval queue to decide.",
      projectId,
      projectName: projectId ? projectNameMap.get(projectId) : undefined,
      actionType: r.actionType ?? "review_approval",
      createdAt: r.createdAt.toISOString(),
    };
  });
}

async function gatherStalledRfiItems(
  tenantId: string,
  projectId: string | undefined,
  now: Date,
): Promise<DigestItem[]> {
  // An RFI is "stalled" when it's submitted/open and the response
  // deadline passed, or when it's been sitting in submitted for more
  // than 10 days with no answer.
  const cutoff = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: rfis.id,
      rfiNumber: rfis.rfiNumber,
      subject: rfis.subject,
      status: rfis.status,
      dueDate: rfis.dueDate,
      projectId: rfis.projectId,
      createdAt: rfis.createdAt,
    })
    .from(rfis)
    .where(
      and(
        eq(rfis.tenantId, tenantId),
        sql`${rfis.status} NOT IN ('answered','closed','void')`,
        lt(rfis.createdAt, cutoff),
      ),
    );

  const scoped = projectId ? rows.filter((r) => r.projectId === projectId) : rows;

  const projectIds = Array.from(
    new Set(scoped.map((r) => r.projectId).filter((id): id is string => !!id)),
  );
  const projectNameMap = await loadProjectNameMap(tenantId, projectIds);

  return scoped.map<DigestItem>((r) => {
    const overdue = r.dueDate && new Date(r.dueDate).getTime() < now.getTime();
    const severity = overdue ? "high" : "medium";
    const prefix = overdue ? "Overdue RFI" : "Stale RFI";
    return {
      severity,
      category: "rfi",
      headline: `${prefix} ${r.rfiNumber}: ${r.subject}`,
      entity: { type: "rfi", id: r.id },
      suggestedAction: overdue
        ? "Nudge the recipient or escalate to the architect."
        : "Follow up — 10+ days with no response.",
      projectId: r.projectId ?? undefined,
      projectName: r.projectId ? projectNameMap.get(r.projectId) : undefined,
      actionType: "respond_rfi",
      createdAt: r.createdAt.toISOString(),
    };
  });
}

async function loadProjectNameMap(
  tenantId: string,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.tenantId, tenantId), inArray(projects.id, ids)));
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function gatherActiveDismissals(
  tenantId: string,
  now: Date,
): Promise<Set<string>> {
  const rows = await db
    .select({
      entityType: herbieDigestDismissals.entityType,
      entityId: herbieDigestDismissals.entityId,
    })
    .from(herbieDigestDismissals)
    .where(
      and(
        eq(herbieDigestDismissals.tenantId, tenantId),
        gt(herbieDigestDismissals.dismissedUntil, now),
      ),
    );
  return new Set(rows.map((r) => `${r.entityType}:${r.entityId}`));
}

function friendlyDate(d: Date | string, now: Date): string {
  const ts = typeof d === "string" ? new Date(d) : d;
  const days = Math.ceil(
    (ts.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 7) return `in ${days} days`;
  return ts.toISOString().slice(0, 10);
}

function humanizeActionType(type: string | null): string {
  if (!type) return "an item";
  return type
    .replace(/_/g, " ")
    .replace(/^draft /, "")
    .toLowerCase();
}

function severityRank(s: DigestItem["severity"]): number {
  return s === "critical" ? 0 : s === "high" ? 1 : s === "medium" ? 2 : 3;
}
function severityCompare(a: DigestItem, b: DigestItem): number {
  return severityRank(a.severity) - severityRank(b.severity);
}
