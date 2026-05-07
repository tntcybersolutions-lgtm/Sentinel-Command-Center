// Phase 2 v2 — concrete production deps for jacket-auto-fill.service.v2.
//
// This file is the "wiring" layer. The orchestrator stays pure (everything
// behind the JacketAutoFillDeps interface). Here we hook each interface
// method to a real db query / storage call.
//
// All the source service functions referenced below already exist in the
// codebase as of feature/phase-1-herbie:
//   - bid-jacket-filing.service: folderResolver, objectStorageWriter,
//     httpArtifactDownloader
//   - shared/schema: takeoffQuantities, blueprints, complianceItems,
//     jacketDocuments, BID_JACKET_FOLDERS, bidJacketFolderDisplayName
//   - replit_integrations/object_storage: objectStorageClient
//
// Folder seeding requirement: jacket folders must exist for the bid project
// (run seedFolderSectionsFromConstants + ensureCanonicalFolders before this
// service runs). If folders aren't seeded, fileX paths return "no_folders"
// in the AutoFillResult.skipped array.

import { db } from "../db";
import { and, eq, desc } from "drizzle-orm";
import {
  takeoffQuantities,
  blueprints,
  complianceItems,
  jacketDocuments,
  bidProjects,
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

// ─── DB adapters ─────────────────────────────────────────────────────────────

/**
 * Build a TakeoffSnapshot from takeoffQuantities rows for the bid project.
 * Returns null if no quantities exist.
 */
async function getTakeoffSnapshot(
  tenantId: string,
  bidProjectId: string,
): Promise<TakeoffSnapshot | null> {
  const rows = await db
    .select()
    .from(takeoffQuantities)
    .where(and(
      eq(takeoffQuantities.tenantId, tenantId),
      eq(takeoffQuantities.bidProjectId, bidProjectId),
    ));
  if (rows.length === 0) return null;

  // Find the project for the name. Best-effort.
  const [project] = await db
    .select({ id: bidProjects.id, title: bidProjects.title })
    .from(bidProjects)
    .where(eq(bidProjects.id, bidProjectId));

  const items = rows.map((r) => {
    const quantity = parseFloat(String(r.quantity ?? "0")) || 0;
    const unitCost = parseFloat(String(r.unitCost ?? "0")) || 0;
    const extendedCost = parseFloat(String(r.extendedCost ?? "0")) || 0;
    return {
      division: (r as any).category || "General",
      description: (r as any).name || (r as any).description || "Item",
      quantity,
      unit: r.unit || "ea",
      unitCost,
      extendedCost,
    };
  });

  const totalCost = items.reduce((sum, it) => sum + (it.extendedCost || 0), 0);
  // Use the most-recent updatedAt across rows so re-finalize replaces the doc.
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
    projectName: project?.title || "Bid Project",
  };
}

/**
 * Build a ScopeExtractionSummary from compliance_items + bid_project rows.
 * Phase 1 doesn't ship a dedicated scope-extraction table; we synthesize one
 * from the compliance matrix that handleSolicitationParsed already populates.
 * If a future PR adds a real scope-extractor output table, swap this out.
 */
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

  const [project] = await db
    .select({ id: bidProjects.id, title: bidProjects.title, description: bidProjects.description })
    .from(bidProjects)
    .where(eq(bidProjects.id, bidProjectId));

  const scopeItems = rows.map((r) => `${r.clauseRef}: ${r.title}`);
  const divisionsSet = new Set<string>(
    rows.map((r) => (r.clauseRef || "").split(" ")[0] || "FAR").filter(Boolean),
  );

  // Hash from solicitation refs so re-runs on the same compliance matrix
  // replace the same scope summary doc.
  const sourceHash = simpleHash(scopeItems.join("|"));

  return {
    bidProjectId,
    scopeItems,
    divisions: Array.from(divisionsSet),
    exclusions: [],   // populated when scope-extractor lands
    assumptions: [],  // populated when scope-extractor lands
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
      filename: r.filename || `blueprint-${r.id}.pdf`,
      storagePath: r.storageKey || "",
      pageCount: (r as any).pageCount ?? 0,
    }));
}

/**
 * Subcontractor docs come from compliance_items rows whose clauseRef tags
 * them as W-9 / COI / lien_waiver. Real wiring depends on whichever table
 * the project uses for vendor docs — this is a safe Phase 2 default.
 *
 * If the codebase has a dedicated `vendor_documents` table, swap the source
 * here. The orchestrator interface is stable.
 */
async function listSubcontractorDocs(
  tenantId: string,
  bidProjectId: string,
): Promise<SubcontractorDocRef[]> {
  // For now: treat any complianceItem with documentRef + matching tag as a
  // subcontractor doc. When a real vendor_documents table lands, replace.
  const rows = await db
    .select()
    .from(complianceItems)
    .where(and(
      eq(complianceItems.tenantId, tenantId),
      eq(complianceItems.bidProjectId, bidProjectId),
    ));

  const docs: SubcontractorDocRef[] = [];
  for (const r of rows) {
    const ref = String((r as any).documentRef || "");
    const storageKey = String((r as any).storageKey || "");
    if (!storageKey) continue;
    const refLower = (r.title || "").toLowerCase() + " " + ref.toLowerCase();
    let kind: SubcontractorDocRef["kind"] | null = null;
    if (refLower.includes("w-9") || refLower.includes("w9")) kind = "w9";
    else if (refLower.includes("coi") || refLower.includes("insurance")) kind = "coi";
    else if (refLower.includes("lien")) kind = "lien_waiver";
    if (!kind) continue;
    docs.push({
      docId: r.id,
      vendorId: (r as any).vendorId || ref || r.id,
      vendorName: (r as any).vendorName || ref || "Vendor",
      kind,
      filename: (r as any).filename || `${ref}.pdf`,
      storagePath: storageKey,
      expiresAt: (r as any).expiresAt ?? null,
    });
  }
  return docs;
}

// ─── Markdown renderers (produce buffers; matches what the existing
// deliverable-generator emits for other types) ──────────────────────────────

function renderTakeoffMarkdown(snapshot: TakeoffSnapshot): Buffer {
  const itemRows = snapshot.items.map((it) =>
    `| ${escapeMd(it.division)} | ${escapeMd(it.description)} | ${it.quantity} ${escapeMd(it.unit)} | $${it.unitCost.toFixed(2)} | $${it.extendedCost.toFixed(2)} |`
  ).join("\n");

  const md = `# Takeoff Summary — ${escapeMd(snapshot.projectName)}

**Bid Project ID:** \`${snapshot.bidProjectId}\`
**Generated:** ${new Date().toISOString()}
**Last Takeoff Update:** ${snapshot.updatedAt}
**Items:** ${snapshot.itemCount}
**Total Cost:** $${snapshot.totalCost.toFixed(2)}

## Line Items

| Division | Description | Quantity | Unit Cost | Extended |
|---|---|---|---|---|
${itemRows || "| — | (no line items) | — | — | — |"}

---
*Auto-generated by jacket-auto-fill. Idempotent: a future re-finalize replaces this in place.*
`;
  return Buffer.from(md, "utf8");
}

function renderScopeMarkdown(scope: ScopeExtractionSummary): Buffer {
  const sectionList = (lst: string[], heading: string) =>
    lst.length === 0 ? `_None._` : lst.map((s) => `- ${escapeMd(s)}`).join("\n");

  const md = `# Scope Summary

**Bid Project ID:** \`${scope.bidProjectId}\`
**Source Hash:** \`${scope.sourceHash}\`
**Generated:** ${new Date().toISOString()}

## Scope Items
${sectionList(scope.scopeItems, "Scope Items")}

## Divisions
${sectionList(scope.divisions, "Divisions")}

## Exclusions
${sectionList(scope.exclusions, "Exclusions")}

## Assumptions
${sectionList(scope.assumptions, "Assumptions")}

---
*Auto-generated by jacket-auto-fill from the compliance matrix. Idempotent.*
`;
  return Buffer.from(md, "utf8");
}

// ─── Filing primitives ───────────────────────────────────────────────────────

/**
 * Upsert a jacketDocuments row by autoFillKey (stored in tagsJson.autoFillKey).
 * If a row exists, update it in place; else insert.
 *
 * Returns { documentId, replaced }.
 */
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

  // Find existing row by autoFillKey within the same folder
  const existing = await db
    .select({ id: jacketDocuments.id })
    .from(jacketDocuments)
    .where(and(
      eq(jacketDocuments.tenantId, args.tenantId),
      eq(jacketDocuments.folderId, args.folderId),
    ));

  // Drizzle doesn't yet have a typed JSON-key match; filter in memory by tag.
  // jacketDocuments rows are scoped per bid project's folder so the set
  // is small.
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

/**
 * Read bytes from object storage at sourceStoragePath, then file via
 * fileBufferIntoJacket. The source bytes stay in their original location;
 * we make a copy in the jacket folder.
 *
 * sourceStoragePath is the storageKey style produced by objectStorageWriter
 * (e.g. "/objects/<entityId>"). We translate that to a bucket+name read.
 */
async function copyStorageFileIntoJacket(args: {
  tenantId: string;
  bidProjectId: string;
  folderId: string;
  sourceStoragePath: string;
  fileName: string;
  documentType: string;
  autoFillKey: string;
}): Promise<{ documentId: string; replaced: boolean }> {
  // Translate "/objects/<entityId>" → bucket + name
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

function escapeMd(s: unknown): string {
  return String(s ?? "").replace(/\|/g, "\\|");
}

function shortHash(s: string): string {
  // Quick non-cryptographic hash for dedupe key in object name
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

/**
 * Build the production deps object.  Used by the route handler and the
 * post-takeoff-update event handler.
 */
export function buildProductionAutoFillDeps(): JacketAutoFillDeps {
  return {
    getTakeoffSnapshot,
    getScopeExtraction,
    listBlueprints,
    listSubcontractorDocs,

    resolveFolderId: (tenantId, bidProjectId, code) =>
      folderResolver(tenantId, bidProjectId, code),

    renderTakeoffMarkdown: async (snapshot) => renderTakeoffMarkdown(snapshot),
    renderScopeMarkdown: async (scope) => renderScopeMarkdown(scope),

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
