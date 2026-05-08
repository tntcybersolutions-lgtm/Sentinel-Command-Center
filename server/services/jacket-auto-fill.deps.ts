// Phase 2 v2.2 — concrete production deps for jacket-auto-fill.service.v2.
//
// Schema-correct version. Earlier v2.1 had assumed column names that
// don't match the real schema. This version queries:
//   - projects (not bidProjects) for the project name + projectId mapping
//   - takeoffQuantities.projectId (not bidProjectId)
//   - blueprints.fileName (not filename)
//   - falls back gracefully when there's no post-award project yet

import { db } from "../db";
import { and, eq } from "drizzle-orm";
import {
  takeoffQuantities,
  blueprints,
  complianceItems,
  jacketDocuments,
  bidProjects,
  projects,
  opportunities,
  bidJacketFolderDisplayName,
} from "@shared/schema";
import {
  folderResolver,
  objectStorageWriter,
} from "./bid-jacket-filing.service";
import { objectStorageClient } from "../replit_integrations/object_storage/objectStorage";
import type {
  JacketAutoFillDeps,
  TakeoffSnapshot,
  ScopeExtractionSummary,
  BlueprintRef,
  SubcontractorDocRef,
} from "./jacket-auto-fill.service.v2";
import {
  renderTakeoffPdf as renderTakeoffPdfImpl,
  renderScopePdf as renderScopePdfImpl,
} from "./jacket-pdf-renderer";

// ─── DB adapters ─────────────────────────────────────────────────────────────

/**
 * Resolve the post-award project + name for a bidProjectId.
 * Returns null if no project has been created yet (pre-award bid projects
 * won't have takeoff data).
 */
async function resolveProjectForBidProject(
  tenantId: string,
  bidProjectId: string,
): Promise<{ projectId: string; projectName: string } | null> {
  const [proj] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(
      eq(projects.tenantId, tenantId),
      eq(projects.bidProjectId, bidProjectId),
    ));

  if (proj) {
    return { projectId: proj.id, projectName: proj.name || "Bid Project" };
  }

  // No post-award project yet — try to derive a friendly name from the
  // linked opportunity so PDFs aren't completely anonymous.
  const [bp] = await db
    .select({ opportunityId: bidProjects.opportunityId })
    .from(bidProjects)
    .where(eq(bidProjects.id, bidProjectId));
  if (!bp?.opportunityId) return null;

  const [opp] = await db
    .select({ title: opportunities.title })
    .from(opportunities)
    .where(eq(opportunities.id, bp.opportunityId));
  if (!opp) return null;

  // No project yet, but we have an opportunity. We can't pull takeoff
  // (which is keyed on projectId), so signal "no takeoff" by returning
  // null. The orchestrator will skip the takeoff section gracefully.
  return null;
}

async function getTakeoffSnapshot(
  tenantId: string,
  bidProjectId: string,
): Promise<TakeoffSnapshot | null> {
  const projInfo = await resolveProjectForBidProject(tenantId, bidProjectId);
  if (!projInfo) return null;

  const rows = await db
    .select()
    .from(takeoffQuantities)
    .where(and(
      eq(takeoffQuantities.tenantId, tenantId),
      eq(takeoffQuantities.projectId, projInfo.projectId),
    ));
  if (rows.length === 0) return null;

  const items = rows.map((r) => {
    const quantity = parseFloat(String(r.quantity ?? "0")) || 0;
    const unitCost = parseFloat(String(r.unitCost ?? "0")) || 0;
    const extendedCost = parseFloat(String(r.extendedCost ?? "0")) || 0;
    const locationParts = [r.room, r.floor, r.zone].filter(Boolean) as string[];
    const description =
      (r.notes && r.notes.trim()) ||
      (locationParts.length > 0 ? locationParts.join(" / ") : "Takeoff line");
    const division = r.categoryId ? `Cat ${String(r.categoryId).slice(0, 8)}` : "General";
    return {
      division,
      description,
      quantity,
      unit: r.unit || "ea",
      unitCost,
      extendedCost,
    };
  });

  const totalCost = items.reduce((sum, it) => sum + (it.extendedCost || 0), 0);
  const updatedAtMs = rows.reduce((max, r) => {
    const t = r.updatedAt ? new Date(r.updatedAt as any).getTime() : 0;
    return Math.max(max, t);
  }, 0);
  const updatedAt = updatedAtMs > 0 ? new Date(updatedAtMs).toISOString() : new Date().toISOString();

  return {
    bidProjectId,
    totalCost,
    itemCount: items.length,
    items,
    updatedAt,
    projectName: projInfo.projectName,
  };
}

async function getScopeExtraction(
  tenantId: string,
  bidProjectId: string,
): Promise<ScopeExtractionSummary | null> {
  const rows = await db
    .select()
    .from(complianceItems)
    .where(and(
      eq(complianceItems.tenantId, tenantId),
      eq(complianceItems.bidProjectId, bidProjectId),
    ));
  if (rows.length === 0) return null;

  const scopeItems = rows.map((r) => `${r.clauseRef ?? ""}: ${r.title}`.trim());
  const divisionsSet = new Set<string>(
    rows
      .map((r) => (r.clauseRef || "").split(" ")[0] || "")
      .filter(Boolean),
  );
  const sourceHash = simpleHash(scopeItems.join("|"));

  return {
    bidProjectId,
    scopeItems,
    divisions: Array.from(divisionsSet),
    exclusions: [],
    assumptions: [],
    sourceHash,
  };
}

async function listBlueprints(
  tenantId: string,
  bidProjectId: string,
): Promise<BlueprintRef[]> {
  const rows = await db
    .select()
    .from(blueprints)
    .where(and(
      eq(blueprints.tenantId, tenantId),
      eq(blueprints.bidProjectId, bidProjectId),
    ));
  return rows
    .filter((r) => !!r.storageKey)
    .map((r) => ({
      blueprintId: r.id,
      filename: r.fileName || r.title || `blueprint-${r.id}.pdf`,
      storagePath: r.storageKey,
      pageCount: r.pageCount ?? 0,
    }));
}

/**
 * Subcontractor docs: returns [] until a dedicated vendor_documents table
 * lands. The orchestrator will skip the W-9/COI/lien sections cleanly with
 * reason "no_subcontractor_docs", keeping the rest of auto-fill working.
 */
async function listSubcontractorDocs(
  _tenantId: string,
  _bidProjectId: string,
): Promise<SubcontractorDocRef[]> {
  return [];
}

// ─── Filing primitives ───────────────────────────────────────────────────────

async function fileBufferIntoJacket(args: {
  tenantId: string;
  bidProjectId: string;
  folderId: string;
  fileName: string;
  contentType: string;
  buffer: Buffer;
  documentType: string;
  autoFillKey: string;
}): Promise<{ documentId: string; replaced: boolean }> {
  const safeName = args.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectKey = `jackets/bid/${args.bidProjectId}/auto-fill/${shortHash(args.autoFillKey)}-${safeName}`;

  const stored = await objectStorageWriter(objectKey, {
    buffer: args.buffer,
    contentType: args.contentType,
    fileName: safeName,
  });

  const allInFolder = await db
    .select()
    .from(jacketDocuments)
    .where(and(
      eq(jacketDocuments.tenantId, args.tenantId),
      eq(jacketDocuments.folderId, args.folderId),
    ));
  const prior = allInFolder.find((r) => {
    const tags = (r as any).tagsJson || {};
    return tags && typeof tags === "object" && tags.autoFillKey === args.autoFillKey;
  });

  if (prior) {
    await db.update(jacketDocuments)
      .set({
        title: args.fileName,
        fileName: safeName,
        fileType: inferFileType(safeName, args.contentType),
        mimeType: args.contentType,
        fileSizeBytes: stored.size,
        storageKey: stored.storageKey,
        documentType: args.documentType,
        updatedAt: new Date(),
      })
      .where(eq(jacketDocuments.id, prior.id));
    return { documentId: prior.id, replaced: true };
  }

  const [doc] = await db.insert(jacketDocuments).values({
    tenantId: args.tenantId,
    folderId: args.folderId,
    title: args.fileName,
    fileName: safeName,
    fileType: inferFileType(safeName, args.contentType),
    mimeType: args.contentType,
    fileSizeBytes: stored.size,
    storageKey: stored.storageKey,
    documentType: args.documentType,
    visibility: "internal",
    source: "auto-fill",
    sourceReference: null,
    generatedBy: "ingestion",
    generatedType: args.documentType,
    tagsJson: { autoFillKey: args.autoFillKey, bidProjectId: args.bidProjectId },
  }).returning();

  return { documentId: doc.id, replaced: false };
}

async function copyStorageFileIntoJacket(args: {
  tenantId: string;
  bidProjectId: string;
  folderId: string;
  sourceStoragePath: string;
  fileName: string;
  documentType: string;
  autoFillKey: string;
}): Promise<{ documentId: string; replaced: boolean }> {
  const entityId = args.sourceStoragePath.replace(/^\/objects\//, "");
  const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
  const fullPath = `${privateDir}/${entityId}`.replace(/\/+/g, "/");
  const parts = fullPath.startsWith("/") ? fullPath.slice(1).split("/") : fullPath.split("/");
  const bucketName = parts[0];
  const objectName = parts.slice(1).join("/");

  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  const [exists] = await file.exists();
  if (!exists) {
    throw new Error(`source object not found: ${args.sourceStoragePath}`);
  }
  const [buffer] = await file.download();
  const [meta] = await file.getMetadata();
  const contentType = (meta as any).contentType || "application/octet-stream";

  return fileBufferIntoJacket({
    tenantId: args.tenantId,
    bidProjectId: args.bidProjectId,
    folderId: args.folderId,
    fileName: args.fileName,
    contentType,
    buffer,
    documentType: args.documentType,
    autoFillKey: args.autoFillKey,
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function inferFileType(fileName: string, mimeType: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext) return ext;
  if (mimeType.includes("pdf")) return "pdf";
  if (mimeType.includes("markdown") || mimeType.includes("plain")) return "md";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "xlsx";
  if (mimeType.includes("word")) return "docx";
  return "bin";
}

function shortHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return `sha-${Math.abs(h).toString(16)}`;
}

// ─── Public factory ─────────────────────────────────────────────────────────

export function buildProductionAutoFillDeps(): JacketAutoFillDeps {
  return {
    getTakeoffSnapshot,
    getScopeExtraction,
    listBlueprints,
    listSubcontractorDocs,

    resolveFolderId: (tenantId, bidProjectId, code) =>
      folderResolver(tenantId, bidProjectId, code),

    renderTakeoffPdf: async (snapshot) => renderTakeoffPdfImpl(snapshot),
    renderScopePdf: async (scope) => renderScopePdfImpl(scope),

    fileBufferIntoJacket,
    copyStorageFileIntoJacket,

    folderDisplayName: (code) => bidJacketFolderDisplayName(code),

    log: (level, msg, ctx) => {
      const tag = `[jacket-auto-fill]`;
      if (level === "error") console.error(tag, msg, ctx ?? {});
      else if (level === "warn") console.warn(tag, msg, ctx ?? {});
      else console.log(tag, msg, ctx ?? {});
    },
  };
}
