// Phase 2 — POST /api/bid-jackets/:id/auto-fill
//
// Wires the autoFillJacket orchestrator (jacket-auto-fill.service.ts) up to
// an Express router. The route:
//   - requires auth (same middleware as the rest of /api/bid-jackets)
//   - validates :id
//   - resolves the jacket → bidProjectId
//   - calls autoFillJacket() with concrete deps that hit existing services
//   - returns the AutoFillResult JSON
//
// INTEGRATION NOTES (for the maintainer wiring this into server/routes.ts):
//   - The Deps below import from existing services. If a function name
//     differs in your codebase, just adjust the wrapper — the orchestrator
//     interface (JacketAutoFillDeps) is stable.
//   - Mount this router under the same auth chain as bid-jacket-filing
//     routes (e.g. requireAuth, requireTenantAccess).
//   - Consider rate-limiting since each call can fan out to many storage
//     copies + 2 PDF renders.

import { Router, type Request, type Response } from "express";
import {
  autoFillJacket,
  type AutoFillResult,
  type CanonicalFolderKind,
  type JacketAutoFillDeps,
} from "./services/jacket-auto-fill.service";

// ─── Imports from existing services (adjust paths if names differ) ─────────
//
// The integrator should replace these stub imports with the real function
// references in your codebase. Each one is a thin adapter into the
// JacketAutoFillDeps interface.
//
//   getTakeoffSnapshot     ← takeoff-cost.service / takeoff-items-routes
//   getScopeExtraction     ← herbie-scope-extractor.service
//   listBlueprints         ← blueprints DAO (shared/schema.ts blueprints table)
//   listSubcontractorDocs  ← vendor-docs DAO (W-9 / COI / lien_waivers tables)
//   getJacket              ← bid-jacket-filing.service / bid_jackets DAO
//   renderTakeoffPdf       ← deliverable-generator-routes pdf renderer
//   renderScopePdf         ← deliverable-generator-routes pdf renderer
//   fileBufferIntoJacket   ← bid-jacket-filing.service.fileBuffer
//   copyStorageFileIntoJacket ← bid-jacket-filing.service.copyExisting
//   canonicalFolder        ← taxonomy.service.canonicalFolder
//   logger                 ← whatever pino/winston instance the rest of server/ uses

// We `require` rather than `import` for these because the exact module
// paths depend on the maintainer's wiring. Replace with proper imports
// once the names are confirmed.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const takeoffService = require("./services/takeoff-cost.service");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const scopeExtractor = require("./services/herbie-scope-extractor.service");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const blueprintsDao = require("./services/blueprints.dao");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const vendorDocsDao = require("./services/vendor-docs.dao");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jacketFiling = require("./services/bid-jacket-filing.service");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const deliverableGen = require("./deliverable-generator-routes");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const taxonomyService = require("./services/taxonomy.service");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const log = require("./logger").default ?? require("./logger");

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildDepsForRequest(): JacketAutoFillDeps {
  return {
    getTakeoffSnapshot: (bidProjectId) =>
      takeoffService.getTakeoffSnapshot(bidProjectId),

    getScopeExtraction: (bidProjectId) =>
      scopeExtractor.getLatestExtraction(bidProjectId),

    listBlueprints: (bidProjectId) =>
      blueprintsDao.listForProject(bidProjectId),

    listSubcontractorDocs: (bidProjectId) =>
      vendorDocsDao.listForProject(bidProjectId),

    getJacket: (jacketId) => jacketFiling.getJacket(jacketId),

    renderTakeoffPdf: (snapshot) =>
      deliverableGen.renderTakeoffPdf(snapshot),

    renderScopePdf: (scope) => deliverableGen.renderScopePdf(scope),

    fileBufferIntoJacket: (args) => jacketFiling.fileBuffer(args),

    copyStorageFileIntoJacket: (args) => jacketFiling.copyExisting(args),

    canonicalFolder: (kind: CanonicalFolderKind) =>
      taxonomyService.canonicalFolder(kind),

    log: (level, msg, ctx) => {
      if (typeof log?.[level] === "function") {
        log[level](ctx ?? {}, msg);
      } else if (typeof log === "function") {
        log({ level, msg, ctx });
      }
    },
  };
}

function isUuidish(s: string): boolean {
  return /^[a-zA-Z0-9_-]{6,64}$/.test(s);
}

// ─── Router ─────────────────────────────────────────────────────────────────

export function createBidJacketAutoFillRouter(opts?: {
  /** Optional injected deps (used by tests). */
  depsFactory?: () => JacketAutoFillDeps;
  /** Optional auth middleware. Mount the same one as bid-jacket-filing routes. */
  requireAuth?: (req: Request, res: Response, next: () => void) => void;
}): Router {
  const router = Router();
  const depsFactory = opts?.depsFactory ?? buildDepsForRequest;

  if (opts?.requireAuth) {
    router.use(opts.requireAuth);
  }

  /**
   * POST /api/bid-jackets/:id/auto-fill
   *
   * Body: optional { bidProjectId?: string }  (defaults to the jacket's project)
   *
   * Returns: AutoFillResult JSON
   */
  router.post("/api/bid-jackets/:id/auto-fill", async (req: Request, res: Response) => {
    const jacketId = String(req.params.id || "");
    if (!isUuidish(jacketId)) {
      res.status(400).json({ ok: false, error: "invalid_jacket_id" });
      return;
    }

    let deps: JacketAutoFillDeps;
    try {
      deps = depsFactory();
    } catch (err: any) {
      res.status(500).json({ ok: false, error: "deps_init_failed", detail: err?.message });
      return;
    }

    // Resolve bidProjectId — either from request body or the jacket record
    let bidProjectId: string | undefined =
      typeof req.body?.bidProjectId === "string" ? req.body.bidProjectId : undefined;

    if (!bidProjectId) {
      const jacket = await deps.getJacket(jacketId);
      if (!jacket) {
        res.status(404).json({ ok: false, error: "jacket_not_found" });
        return;
      }
      bidProjectId = jacket.bidProjectId;
    }

    let result: AutoFillResult;
    try {
      result = await autoFillJacket({ jacketId, bidProjectId, deps });
    } catch (err: any) {
      deps.log("error", "auto-fill: unhandled error", {
        jacketId,
        bidProjectId,
        err: err?.message,
      });
      res.status(500).json({
        ok: false,
        error: "auto_fill_unhandled",
        detail: err?.message ?? String(err),
      });
      return;
    }

    res.status(result.success ? 200 : 207).json({
      ok: result.success,
      result,
    });
  });

  return router;
}

/**
 * In server/routes.ts (or wherever sub-routers are mounted), add:
 *
 *   import { createBidJacketAutoFillRouter } from "./bid-jacket-auto-fill-routes";
 *   app.use(createBidJacketAutoFillRouter({ requireAuth }));
 *
 * That's it — the auth middleware in opts.requireAuth gates the endpoint.
 */
