// Phase 2 v2 — bid jacket auto-fill orchestrator (rewritten to fit the real
// codebase architecture).
//
// Differences from v1 placeholder:
//   - Keys are (tenantId, bidProjectId) — not arbitrary jacketIds. Bid jackets
//     are 1:1 with bidProjects in this codebase.
//   - Folders are addressed by canonical CODE ("00".."18") from
//     shared/schema.ts BID_JACKET_FOLDERS, resolved via folderResolver
//     from bid-jacket-filing.service.
//   - Filing flow uses the existing storage primitives: objectStorageWriter
//     to put a buffer/markdown to object storage, then jacketDocuments insert.
//   - Idempotency tag is stored on jacketDocuments.tagsJson.autoFillKey.
//     Re-running the orchestrator finds a prior row by that key and overwrites
//     the storage object + updates the row, never duplicates.
//   - Outputs are markdown (.md) — matches what deliverable-generator-routes
//     emits today. PDF rendering is a follow-up.
//
// The orchestrator is dependency-injected so tests can stub every external
// call. Concrete production wiring lives in jacket-auto-fill.deps.ts.

// ─── External shapes (the real DB rows; tests build minimal versions) ────────

export interface TakeoffSnapshot {
  bidProjectId: string;
  totalCost: number;
  itemCount: number;
  items: Array<{
    division: string;
    description: string;
    quantity: number;
    unit: string;
    unitCost: number;
    extendedCost: number;
  }>;
  /** Last update timestamp; used as a key so we replace stale takeoff docs. */
  updatedAt: string;
  projectName: string;
}

export interface ScopeExtractionSummary {
  bidProjectId: string;
  scopeItems: string[];
  divisions: string[];
  exclusions: string[];
  assumptions: string[];
  /** Source solicitation hash so we can detect when re-extraction is needed. */
  sourceHash: string;
}

export interface BlueprintRef {
  blueprintId: string;
  filename: string;
  storagePath: string;
  pageCount: number;
}

export interface SubcontractorDocRef {
  docId: string;
  vendorId: string;
  vendorName: string;
  kind: SubcontractorDocKind;
  filename: string;
  storagePath: string;
  expiresAt: string | null;
}

export type SubcontractorDocKind = "w9" | "coi" | "lien_waiver";

/** Maps each doc class to a BID_JACKET_FOLDERS code from shared/schema.ts. */
export const FOLDER_CODE_BY_KIND: Record<DocKind, string> = {
  takeoff: "11",                     // 11 — Pricing & Cost
  blueprints: "01",                  // 01 — Solicitation & Drawings
  scope: "10",                       // 10 — Bid Forms & Narrative
  subcontractors_w9: "06",           // 06 — Subcontractor Quotes & Compliance
  subcontractors_coi: "07",          // 07 — Insurance & Bonds
  subcontractors_lien_waivers: "06", // 06 — Subcontractor section
};

export type DocKind =
  | "takeoff"
  | "blueprints"
  | "scope"
  | "subcontractors_w9"
  | "subcontractors_coi"
  | "subcontractors_lien_waivers";

// ─── Dependency interface ────────────────────────────────────────────────────

/** What the orchestrator needs from the rest of the system. */
export interface JacketAutoFillDeps {
  /** Get the latest finalized takeoff for a bidProject, or null if none. */
  getTakeoffSnapshot(tenantId: string, bidProjectId: string): Promise<TakeoffSnapshot | null>;

  /** Get the latest scope extraction for a bidProject. */
  getScopeExtraction(tenantId: string, bidProjectId: string): Promise<ScopeExtractionSummary | null>;

  /** List blueprint files attached to the bidProject. */
  listBlueprints(tenantId: string, bidProjectId: string): Promise<BlueprintRef[]>;

  /** List W-9 / COI / lien_waiver docs from the project's vendor records. */
  listSubcontractorDocs(tenantId: string, bidProjectId: string): Promise<SubcontractorDocRef[]>;

  /**
   * Resolve a jacket folder ID by canonical code. Wraps folderResolver from
   * bid-jacket-filing.service.ts. Returns null if folders haven't been seeded.
   */
  resolveFolderId(tenantId: string, bidProjectId: string, folderCode: string): Promise<string | null>;

  /**
   * Render a takeoff snapshot to a markdown buffer. Reuses the deliverable-
   * generator's bid-package generator pattern (or trade-scope, configurable).
   */
  renderTakeoffMarkdown(snapshot: TakeoffSnapshot): Promise<Buffer>;

  /** Render a scope extraction summary to markdown. */
  renderScopeMarkdown(scope: ScopeExtractionSummary): Promise<Buffer>;

  /**
   * File a buffer (we have the bytes already) into a jacket folder.
   * Implementation: store via objectStorageWriter, then upsert jacketDocuments
   * matching by tagsJson.autoFillKey. Returns the document id and whether
   * an existing row was replaced.
   */
  fileBufferIntoJacket(args: {
    tenantId: string;
    bidProjectId: string;
    folderId: string;
    fileName: string;
    contentType: string;
    buffer: Buffer;
    documentType: string;
    autoFillKey: string;
  }): Promise<{ documentId: string; replaced: boolean }>;

  /**
   * Copy an existing storage path into a jacket folder. Implementation:
   * fetch the source bytes from object storage, write to a new key under
   * the jacket prefix, upsert jacketDocuments by autoFillKey.
   */
  copyStorageFileIntoJacket(args: {
    tenantId: string;
    bidProjectId: string;
    folderId: string;
    sourceStoragePath: string;
    fileName: string;
    documentType: string;
    autoFillKey: string;
  }): Promise<{ documentId: string; replaced: boolean }>;

  /**
   * Resolve the canonical folder display name. Used for human-readable
   * filed.folderName output. Wraps bidJacketFolderDisplayName from schema.
   */
  folderDisplayName(folderCode: string): string;

  log: (level: "info" | "warn" | "error", msg: string, ctx?: Record<string, unknown>) => void;
}

// ─── Public result types ─────────────────────────────────────────────────────

export interface AutoFillResult {
  tenantId: string;
  bidProjectId: string;
  filed: AutoFillFiledEntry[];
  skipped: AutoFillSkippedEntry[];
  warnings: string[];
  totalFiled: number;
  totalReplaced: number;
  /** True when no critical failures (render_failed, copy_failed, no_folders). */
  success: boolean;
}

export interface AutoFillFiledEntry {
  kind: DocKind;
  fileName: string;
  folderCode: string;
  folderName: string;
  documentId: string;
  replaced: boolean;
  autoFillKey: string;
}

export interface AutoFillSkippedEntry {
  kind: DocKind;
  reason:
    | "no_takeoff"
    | "no_scope"
    | "no_blueprints"
    | "no_subcontractor_docs"
    | "render_failed"
    | "copy_failed"
    | "no_folders";
  detail?: string;
}

// ─── autoFillKey formatting (idempotency contract) ──────────────────────────

/**
 * Per-doc dedupe key. Embed enough that we can find the prior copy on re-run.
 *
 * Examples:
 *   auto-fill::takeoff::v=2026-05-07T20:30:00Z
 *   auto-fill::blueprints::bp=blueprint-123
 *   auto-fill::scope::v=sha-abc
 *   auto-fill::subcontractors_coi::vendor=v-77
 */
export function formatAutoFillKey(parts: { kind: DocKind; suffix: string }): string {
  return `auto-fill::${parts.kind}::${parts.suffix}`;
}

// ─── Main entry point ───────────────────────────────────────────────────────

export async function autoFillJacket(args: {
  tenantId: string;
  bidProjectId: string;
  deps: JacketAutoFillDeps;
}): Promise<AutoFillResult> {
  const { tenantId, bidProjectId, deps } = args;

  const filed: AutoFillFiledEntry[] = [];
  const skipped: AutoFillSkippedEntry[] = [];
  const warnings: string[] = [];

  await fileTakeoff({ tenantId, bidProjectId, deps, filed, skipped, warnings });
  await fileBlueprints({ tenantId, bidProjectId, deps, filed, skipped, warnings });
  await fileScope({ tenantId, bidProjectId, deps, filed, skipped, warnings });
  await fileSubcontractorDocs({ tenantId, bidProjectId, deps, filed, skipped, warnings });

  const totalFiled = filed.length;
  const totalReplaced = filed.filter((f) => f.replaced).length;

  const success = !skipped.some(
    (s) => s.reason === "render_failed" || s.reason === "copy_failed" || s.reason === "no_folders",
  );

  deps.log("info", "auto-fill: completed", {
    tenantId,
    bidProjectId,
    totalFiled,
    totalReplaced,
    skippedCount: skipped.length,
    success,
  });

  return { tenantId, bidProjectId, filed, skipped, warnings, totalFiled, totalReplaced, success };
}

// ─── Section helpers ────────────────────────────────────────────────────────

interface SectionArgs {
  tenantId: string;
  bidProjectId: string;
  deps: JacketAutoFillDeps;
  filed: AutoFillFiledEntry[];
  skipped: AutoFillSkippedEntry[];
  warnings: string[];
}

async function fileTakeoff(args: SectionArgs): Promise<void> {
  const snapshot = await args.deps.getTakeoffSnapshot(args.tenantId, args.bidProjectId);
  if (!snapshot) { args.skipped.push({ kind: "takeoff", reason: "no_takeoff" }); return; }

  const folderCode = FOLDER_CODE_BY_KIND.takeoff;
  const folderId = await args.deps.resolveFolderId(args.tenantId, args.bidProjectId, folderCode);
  if (!folderId) {
    args.skipped.push({ kind: "takeoff", reason: "no_folders", detail: `code=${folderCode}` });
    args.warnings.push(`folder_not_found: code=${folderCode} — run seedFolderSectionsFromConstants first`);
    return;
  }

  let buffer: Buffer;
  try {
    buffer = await args.deps.renderTakeoffMarkdown(snapshot);
  } catch (err: any) {
    args.skipped.push({ kind: "takeoff", reason: "render_failed", detail: err?.message ?? String(err) });
    args.deps.log("warn", "auto-fill: takeoff render failed", { bidProjectId: args.bidProjectId, err: err?.message });
    return;
  }

  const fileName = `takeoff-summary-${slugDate(snapshot.updatedAt)}.md`;
  const autoFillKey = formatAutoFillKey({ kind: "takeoff", suffix: `v=${snapshot.updatedAt}` });
  const result = await args.deps.fileBufferIntoJacket({
    tenantId: args.tenantId,
    bidProjectId: args.bidProjectId,
    folderId,
    fileName,
    contentType: "text/markdown",
    buffer,
    documentType: "takeoff_summary",
    autoFillKey,
  });
  args.filed.push({
    kind: "takeoff",
    fileName,
    folderCode,
    folderName: args.deps.folderDisplayName(folderCode),
    documentId: result.documentId,
    replaced: result.replaced,
    autoFillKey,
  });
}

async function fileBlueprints(args: SectionArgs): Promise<void> {
  const blueprints = await args.deps.listBlueprints(args.tenantId, args.bidProjectId);
  if (!blueprints || blueprints.length === 0) { args.skipped.push({ kind: "blueprints", reason: "no_blueprints" }); return; }

  const folderCode = FOLDER_CODE_BY_KIND.blueprints;
  const folderId = await args.deps.resolveFolderId(args.tenantId, args.bidProjectId, folderCode);
  if (!folderId) {
    args.skipped.push({ kind: "blueprints", reason: "no_folders", detail: `code=${folderCode}` });
    args.warnings.push(`folder_not_found: code=${folderCode} — run seedFolderSectionsFromConstants first`);
    return;
  }

  for (const bp of blueprints) {
    const fileName = bp.filename || `blueprint-${bp.blueprintId}.pdf`;
    const autoFillKey = formatAutoFillKey({ kind: "blueprints", suffix: `bp=${bp.blueprintId}` });
    try {
      const result = await args.deps.copyStorageFileIntoJacket({
        tenantId: args.tenantId,
        bidProjectId: args.bidProjectId,
        folderId,
        sourceStoragePath: bp.storagePath,
        fileName,
        documentType: "blueprint",
        autoFillKey,
      });
      args.filed.push({
        kind: "blueprints",
        fileName,
        folderCode,
        folderName: args.deps.folderDisplayName(folderCode),
        documentId: result.documentId,
        replaced: result.replaced,
        autoFillKey,
      });
    } catch (err: any) {
      args.warnings.push(`blueprint_copy_failed: ${bp.blueprintId} — ${err?.message ?? String(err)}`);
      args.skipped.push({ kind: "blueprints", reason: "copy_failed", detail: `${bp.blueprintId}: ${err?.message ?? String(err)}` });
    }
  }
}

async function fileScope(args: SectionArgs): Promise<void> {
  const scope = await args.deps.getScopeExtraction(args.tenantId, args.bidProjectId);
  if (!scope) { args.skipped.push({ kind: "scope", reason: "no_scope" }); return; }

  const folderCode = FOLDER_CODE_BY_KIND.scope;
  const folderId = await args.deps.resolveFolderId(args.tenantId, args.bidProjectId, folderCode);
  if (!folderId) {
    args.skipped.push({ kind: "scope", reason: "no_folders", detail: `code=${folderCode}` });
    return;
  }

  let buffer: Buffer;
  try {
    buffer = await args.deps.renderScopeMarkdown(scope);
  } catch (err: any) {
    args.skipped.push({ kind: "scope", reason: "render_failed", detail: err?.message ?? String(err) });
    return;
  }

  const fileName = `scope-summary-${shortHash(scope.sourceHash)}.md`;
  const autoFillKey = formatAutoFillKey({ kind: "scope", suffix: `v=${scope.sourceHash}` });
  const result = await args.deps.fileBufferIntoJacket({
    tenantId: args.tenantId,
    bidProjectId: args.bidProjectId,
    folderId,
    fileName,
    contentType: "text/markdown",
    buffer,
    documentType: "scope_summary",
    autoFillKey,
  });
  args.filed.push({
    kind: "scope",
    fileName,
    folderCode,
    folderName: args.deps.folderDisplayName(folderCode),
    documentId: result.documentId,
    replaced: result.replaced,
    autoFillKey,
  });
}

async function fileSubcontractorDocs(args: SectionArgs): Promise<void> {
  const docs = await args.deps.listSubcontractorDocs(args.tenantId, args.bidProjectId);
  if (!docs || docs.length === 0) {
    args.skipped.push({ kind: "subcontractors_w9", reason: "no_subcontractor_docs" });
    args.skipped.push({ kind: "subcontractors_coi", reason: "no_subcontractor_docs" });
    args.skipped.push({ kind: "subcontractors_lien_waivers", reason: "no_subcontractor_docs" });
    return;
  }

  for (const doc of docs) {
    if (doc.kind === "coi" && doc.expiresAt) {
      const exp = Date.parse(doc.expiresAt);
      if (Number.isFinite(exp) && exp < Date.now()) {
        args.warnings.push(`coi_expired: vendor=${doc.vendorName} (${doc.vendorId}) expiresAt=${doc.expiresAt}`);
      }
    }
    const kindOut = subcontractorDocKindToFolder(doc.kind);
    const folderCode = FOLDER_CODE_BY_KIND[kindOut];
    const folderId = await args.deps.resolveFolderId(args.tenantId, args.bidProjectId, folderCode);
    if (!folderId) {
      args.skipped.push({ kind: kindOut, reason: "no_folders", detail: `code=${folderCode}` });
      continue;
    }

    const fileName = doc.filename || defaultSubcontractorFilename(doc);
    const autoFillKey = formatAutoFillKey({ kind: kindOut, suffix: `vendor=${doc.vendorId}` });
    try {
      const result = await args.deps.copyStorageFileIntoJacket({
        tenantId: args.tenantId,
        bidProjectId: args.bidProjectId,
        folderId,
        sourceStoragePath: doc.storagePath,
        fileName,
        documentType: doc.kind,
        autoFillKey,
      });
      args.filed.push({
        kind: kindOut,
        fileName,
        folderCode,
        folderName: args.deps.folderDisplayName(folderCode),
        documentId: result.documentId,
        replaced: result.replaced,
        autoFillKey,
      });
    } catch (err: any) {
      args.warnings.push(`subcontractor_doc_copy_failed: vendor=${doc.vendorId} kind=${doc.kind} — ${err?.message ?? String(err)}`);
      args.skipped.push({ kind: kindOut, reason: "copy_failed", detail: `${doc.docId}: ${err?.message ?? String(err)}` });
    }
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

export function subcontractorDocKindToFolder(kind: SubcontractorDocKind): DocKind {
  switch (kind) {
    case "w9": return "subcontractors_w9";
    case "coi": return "subcontractors_coi";
    case "lien_waiver": return "subcontractors_lien_waivers";
  }
}

export function defaultSubcontractorFilename(doc: SubcontractorDocRef): string {
  const safeName = doc.vendorName.replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 40);
  switch (doc.kind) {
    case "w9": return `${safeName}_W9.pdf`;
    case "coi": return `${safeName}_COI.pdf`;
    case "lien_waiver": return `${safeName}_LienWaiver.pdf`;
  }
}

export function slugDate(iso: string): string {
  return iso.replace(/[:T]/g, "").replace(/\..*$/, "").replace(/Z$/, "");
}

export function shortHash(s: string): string {
  return (s || "").slice(0, 12);
}
