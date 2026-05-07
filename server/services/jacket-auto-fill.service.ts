// Phase 2 — bid jacket auto-fill orchestrator.
//
// When a bid jacket is built (or on demand via POST /api/bid-jackets/:id/auto-fill),
// this service pulls the four document classes Chad needs into the jacket folders
// in one idempotent pass:
//
//   1) Takeoff results + cost summary  → generated PDF via deliverable-generator
//   2) Source blueprints / drawings    → attached from storage/binders
//   3) Scope extraction summary        → generated PDF from herbie-scope-extractor
//   4) Subcontractor docs (W-9, COI, lien waivers) → pulled from project records
//
// Idempotency contract:
//   - Each doc class is keyed by (jacketId, docKind, sourceRef). Re-running
//     the orchestrator REPLACES same-keyed docs in place, never duplicates.
//   - If a class is missing source data we record a `skipped` reason and
//     keep going — partial fill is better than a hard failure.
//
// Wiring:
//   - Used by POST /api/bid-jackets/:id/auto-fill
//   - Auto-triggered by unified-workflows.handleTakeoffFinalized when a
//     jacket exists for the project.

// ─── External service shapes (test seams; real impls injected at call time) ─

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
  /** Last finalize timestamp; used as a key so we replace stale takeoff PDFs. */
  finalizedAt: string;
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
  /** "w9" | "coi" | "lien_waiver" — narrowed below. */
  kind: SubcontractorDocKind;
  filename: string;
  storagePath: string;
  /** ISO date when the doc expires (COIs especially); null = no expiry. */
  expiresAt: string | null;
}

export type SubcontractorDocKind = "w9" | "coi" | "lien_waiver";

export interface JacketRecord {
  jacketId: string;
  bidProjectId: string;
  rootFolderPath: string;
  /** Existing files in the jacket; used for idempotency. */
  existingFiles: Array<{
    fileId: string;
    folderPath: string;
    filename: string;
    /** Tag we set when WE filed this doc. Lets us identify replacements. */
    autoFillKey: string | null;
  }>;
}

// ─── Dependencies (interface-only — concrete impls passed in from caller) ───

export interface JacketAutoFillDeps {
  getTakeoffSnapshot(bidProjectId: string): Promise<TakeoffSnapshot | null>;
  getScopeExtraction(bidProjectId: string): Promise<ScopeExtractionSummary | null>;
  listBlueprints(bidProjectId: string): Promise<BlueprintRef[]>;
  listSubcontractorDocs(bidProjectId: string): Promise<SubcontractorDocRef[]>;
  getJacket(jacketId: string): Promise<JacketRecord | null>;

  /** Generate a PDF from a takeoff snapshot. Wraps deliverable-generator. */
  renderTakeoffPdf(snapshot: TakeoffSnapshot): Promise<Buffer>;
  /** Generate a PDF from the scope summary. */
  renderScopePdf(scope: ScopeExtractionSummary): Promise<Buffer>;

  /** File a buffer into the jacket. Replaces any existing file with same autoFillKey. */
  fileBufferIntoJacket(args: {
    jacketId: string;
    folderPath: string;
    filename: string;
    contentType: string;
    buffer: Buffer;
    autoFillKey: string;
  }): Promise<{ fileId: string; replaced: boolean }>;

  /** Copy an existing storage file into a jacket folder. Replaces by autoFillKey. */
  copyStorageFileIntoJacket(args: {
    jacketId: string;
    folderPath: string;
    sourceStoragePath: string;
    filename: string;
    autoFillKey: string;
  }): Promise<{ fileId: string; replaced: boolean }>;

  /** Resolve canonical folder names from the existing taxonomy.service. */
  canonicalFolder(kind: CanonicalFolderKind): string;

  /** Logger sink — matches the rest of the codebase. */
  log: (level: "info" | "warn" | "error", msg: string, ctx?: Record<string, unknown>) => void;
}

export type CanonicalFolderKind =
  | "takeoff"
  | "blueprints"
  | "scope"
  | "subcontractors_w9"
  | "subcontractors_coi"
  | "subcontractors_lien_waivers";

// ─── Public types ───────────────────────────────────────────────────────────

export interface AutoFillResult {
  jacketId: string;
  bidProjectId: string;
  filed: AutoFillFiledEntry[];
  skipped: AutoFillSkippedEntry[];
  warnings: string[];
  /** Total docs filed in this run (new + replaced). */
  totalFiled: number;
  /** Total docs replaced (so the user knows when re-running. */
  totalReplaced: number;
  /** True when nothing failed (skipped due to missing data is OK). */
  success: boolean;
}

export interface AutoFillFiledEntry {
  kind: CanonicalFolderKind;
  filename: string;
  folderPath: string;
  fileId: string;
  replaced: boolean;
  autoFillKey: string;
}

export interface AutoFillSkippedEntry {
  kind: CanonicalFolderKind;
  reason:
    | "no_takeoff"
    | "no_scope"
    | "no_blueprints"
    | "no_subcontractor_docs"
    | "render_failed"
    | "copy_failed"
    | "missing_jacket";
  detail?: string;
}

// ─── Auto-fill key formatting ───────────────────────────────────────────────

/**
 * Per-doc dedupe key. We embed all the "what makes this doc unique inside
 * the jacket" attributes so re-runs find the prior copy and replace it.
 *
 * Examples:
 *   takeoff/v=2026-04-27T22:58:10Z
 *   blueprints/bp=blueprint-123
 *   scope/v=sha-abc
 *   subcontractor/coi/vendor=v-77
 */
export function formatAutoFillKey(parts: { kind: CanonicalFolderKind; suffix: string }): string {
  return `auto-fill::${parts.kind}::${parts.suffix}`;
}

// ─── Main entry point ───────────────────────────────────────────────────────

export async function autoFillJacket(args: {
  jacketId: string;
  bidProjectId: string;
  deps: JacketAutoFillDeps;
}): Promise<AutoFillResult> {
  const { jacketId, bidProjectId, deps } = args;

  const filed: AutoFillFiledEntry[] = [];
  const skipped: AutoFillSkippedEntry[] = [];
  const warnings: string[] = [];

  const jacket = await deps.getJacket(jacketId);
  if (!jacket) {
    deps.log("error", "auto-fill: jacket not found", { jacketId });
    return {
      jacketId,
      bidProjectId,
      filed: [],
      skipped: [{ kind: "takeoff", reason: "missing_jacket" }],
      warnings: [`jacket_not_found: ${jacketId}`],
      totalFiled: 0,
      totalReplaced: 0,
      success: false,
    };
  }
  if (jacket.bidProjectId !== bidProjectId) {
    warnings.push(
      `jacket_project_mismatch: jacket=${jacket.bidProjectId} requested=${bidProjectId}`,
    );
  }

  // 1) Takeoff PDF
  await fileTakeoff({ jacketId, bidProjectId, deps, filed, skipped, warnings });

  // 2) Source blueprints
  await fileBlueprints({ jacketId, bidProjectId, deps, filed, skipped, warnings });

  // 3) Scope summary PDF
  await fileScope({ jacketId, bidProjectId, deps, filed, skipped, warnings });

  // 4) Subcontractor docs
  await fileSubcontractorDocs({ jacketId, bidProjectId, deps, filed, skipped, warnings });

  const totalFiled = filed.length;
  const totalReplaced = filed.filter((f) => f.replaced).length;

  // success = no critical failures (render_failed / copy_failed)
  const success = !skipped.some(
    (s) => s.reason === "render_failed" || s.reason === "copy_failed" || s.reason === "missing_jacket",
  );

  deps.log("info", "auto-fill: completed", {
    jacketId,
    bidProjectId,
    totalFiled,
    totalReplaced,
    skippedCount: skipped.length,
    success,
  });

  return {
    jacketId,
    bidProjectId,
    filed,
    skipped,
    warnings,
    totalFiled,
    totalReplaced,
    success,
  };
}

// ─── Section: takeoff ───────────────────────────────────────────────────────

interface SectionArgs {
  jacketId: string;
  bidProjectId: string;
  deps: JacketAutoFillDeps;
  filed: AutoFillFiledEntry[];
  skipped: AutoFillSkippedEntry[];
  warnings: string[];
}

async function fileTakeoff(args: SectionArgs): Promise<void> {
  const snapshot = await args.deps.getTakeoffSnapshot(args.bidProjectId);
  if (!snapshot) {
    args.skipped.push({ kind: "takeoff", reason: "no_takeoff" });
    return;
  }
  let buffer: Buffer;
  try {
    buffer = await args.deps.renderTakeoffPdf(snapshot);
  } catch (err: any) {
    args.skipped.push({
      kind: "takeoff",
      reason: "render_failed",
      detail: err?.message ?? String(err),
    });
    args.deps.log("warn", "auto-fill: takeoff render failed", {
      bidProjectId: args.bidProjectId,
      err: err?.message,
    });
    return;
  }
  const folderPath = args.deps.canonicalFolder("takeoff");
  const filename = `takeoff-summary-${slugDate(snapshot.finalizedAt)}.pdf`;
  const autoFillKey = formatAutoFillKey({
    kind: "takeoff",
    suffix: `v=${snapshot.finalizedAt}`,
  });
  const result = await args.deps.fileBufferIntoJacket({
    jacketId: args.jacketId,
    folderPath,
    filename,
    contentType: "application/pdf",
    buffer,
    autoFillKey,
  });
  args.filed.push({
    kind: "takeoff",
    filename,
    folderPath,
    fileId: result.fileId,
    replaced: result.replaced,
    autoFillKey,
  });
}

// ─── Section: blueprints ────────────────────────────────────────────────────

async function fileBlueprints(args: SectionArgs): Promise<void> {
  const blueprints = await args.deps.listBlueprints(args.bidProjectId);
  if (!blueprints || blueprints.length === 0) {
    args.skipped.push({ kind: "blueprints", reason: "no_blueprints" });
    return;
  }
  const folderPath = args.deps.canonicalFolder("blueprints");

  for (const bp of blueprints) {
    const filename = bp.filename || `blueprint-${bp.blueprintId}.pdf`;
    const autoFillKey = formatAutoFillKey({
      kind: "blueprints",
      suffix: `bp=${bp.blueprintId}`,
    });
    try {
      const result = await args.deps.copyStorageFileIntoJacket({
        jacketId: args.jacketId,
        folderPath,
        sourceStoragePath: bp.storagePath,
        filename,
        autoFillKey,
      });
      args.filed.push({
        kind: "blueprints",
        filename,
        folderPath,
        fileId: result.fileId,
        replaced: result.replaced,
        autoFillKey,
      });
    } catch (err: any) {
      args.warnings.push(
        `blueprint_copy_failed: ${bp.blueprintId} — ${err?.message ?? String(err)}`,
      );
      args.skipped.push({
        kind: "blueprints",
        reason: "copy_failed",
        detail: `${bp.blueprintId}: ${err?.message ?? String(err)}`,
      });
    }
  }
}

// ─── Section: scope ─────────────────────────────────────────────────────────

async function fileScope(args: SectionArgs): Promise<void> {
  const scope = await args.deps.getScopeExtraction(args.bidProjectId);
  if (!scope) {
    args.skipped.push({ kind: "scope", reason: "no_scope" });
    return;
  }
  let buffer: Buffer;
  try {
    buffer = await args.deps.renderScopePdf(scope);
  } catch (err: any) {
    args.skipped.push({
      kind: "scope",
      reason: "render_failed",
      detail: err?.message ?? String(err),
    });
    return;
  }
  const folderPath = args.deps.canonicalFolder("scope");
  const filename = `scope-summary-${shortHash(scope.sourceHash)}.pdf`;
  const autoFillKey = formatAutoFillKey({
    kind: "scope",
    suffix: `v=${scope.sourceHash}`,
  });
  const result = await args.deps.fileBufferIntoJacket({
    jacketId: args.jacketId,
    folderPath,
    filename,
    contentType: "application/pdf",
    buffer,
    autoFillKey,
  });
  args.filed.push({
    kind: "scope",
    filename,
    folderPath,
    fileId: result.fileId,
    replaced: result.replaced,
    autoFillKey,
  });
}

// ─── Section: subcontractor docs ────────────────────────────────────────────

async function fileSubcontractorDocs(args: SectionArgs): Promise<void> {
  const docs = await args.deps.listSubcontractorDocs(args.bidProjectId);
  if (!docs || docs.length === 0) {
    args.skipped.push({ kind: "subcontractors_w9", reason: "no_subcontractor_docs" });
    args.skipped.push({ kind: "subcontractors_coi", reason: "no_subcontractor_docs" });
    args.skipped.push({ kind: "subcontractors_lien_waivers", reason: "no_subcontractor_docs" });
    return;
  }
  // Filter expired COIs — we still file them but warn
  for (const doc of docs) {
    if (doc.kind === "coi" && doc.expiresAt) {
      const exp = Date.parse(doc.expiresAt);
      if (Number.isFinite(exp) && exp < Date.now()) {
        args.warnings.push(
          `coi_expired: vendor=${doc.vendorName} (${doc.vendorId}) expiresAt=${doc.expiresAt}`,
        );
      }
    }
    const folderKind = subcontractorFolderKindFor(doc.kind);
    const folderPath = args.deps.canonicalFolder(folderKind);
    const filename = doc.filename || defaultSubcontractorFilename(doc);
    const autoFillKey = formatAutoFillKey({
      kind: folderKind,
      suffix: `vendor=${doc.vendorId}`,
    });
    try {
      const result = await args.deps.copyStorageFileIntoJacket({
        jacketId: args.jacketId,
        folderPath,
        sourceStoragePath: doc.storagePath,
        filename,
        autoFillKey,
      });
      args.filed.push({
        kind: folderKind,
        filename,
        folderPath,
        fileId: result.fileId,
        replaced: result.replaced,
        autoFillKey,
      });
    } catch (err: any) {
      args.warnings.push(
        `subcontractor_doc_copy_failed: vendor=${doc.vendorId} kind=${doc.kind} — ${err?.message ?? String(err)}`,
      );
      args.skipped.push({
        kind: folderKind,
        reason: "copy_failed",
        detail: `${doc.docId}: ${err?.message ?? String(err)}`,
      });
    }
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

export function subcontractorFolderKindFor(kind: SubcontractorDocKind): CanonicalFolderKind {
  switch (kind) {
    case "w9":
      return "subcontractors_w9";
    case "coi":
      return "subcontractors_coi";
    case "lien_waiver":
      return "subcontractors_lien_waivers";
  }
}

export function defaultSubcontractorFilename(doc: SubcontractorDocRef): string {
  const safeName = doc.vendorName.replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 40);
  switch (doc.kind) {
    case "w9":
      return `${safeName}_W9.pdf`;
    case "coi":
      return `${safeName}_COI.pdf`;
    case "lien_waiver":
      return `${safeName}_LienWaiver.pdf`;
  }
}

export function slugDate(iso: string): string {
  // 2026-04-27T22:58:10Z → 2026-04-27_225810
  return iso.replace(/[:T]/g, "").replace(/\..*$/, "").replace(/Z$/, "");
}

export function shortHash(s: string): string {
  return (s || "").slice(0, 12);
}
