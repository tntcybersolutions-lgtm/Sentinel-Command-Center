// Patch to apply to server/services/unified-workflows.service.ts
//
// Adds an automatic jacket auto-fill trigger when a takeoff is finalized.
// The trigger is best-effort: failures are logged but never block the
// takeoff finalize itself.
//
// HOW TO APPLY (manual, ~15 lines of change):
//
// 1) Add the import at the top of unified-workflows.service.ts:
//
//      import { autoFillJacket } from "./jacket-auto-fill.service";
//      import { buildAutoFillDeps } from "./jacket-auto-fill.deps"; // see below
//      import { findJacketForProject } from "./bid-jacket-filing.service";
//
// 2) Inside handleTakeoffFinalized (or whichever function fires after a
//    takeoff is finalized), append the snippet from
//    `triggerJacketAutoFillBestEffort` below.
//
//    Important: do NOT await this in a way that blocks the response, OR
//    if you do await it, wrap it in try/catch so a failure doesn't roll
//    back the takeoff.

import type { JacketAutoFillDeps } from "./jacket-auto-fill.service";
import { autoFillJacket } from "./jacket-auto-fill.service";

// ─── Public helper: drop this into unified-workflows.service.ts ─────────────

/**
 * Best-effort jacket auto-fill after a takeoff is finalized.
 *
 * Called from handleTakeoffFinalized like this:
 *
 *   await triggerJacketAutoFillBestEffort({
 *     bidProjectId,
 *     deps: buildAutoFillDeps(), // your factory
 *     findJacket: (pid) => findJacketForProject(pid),
 *     log: logger,
 *   });
 */
export async function triggerJacketAutoFillBestEffort(args: {
  bidProjectId: string;
  deps: JacketAutoFillDeps;
  /** Returns the jacket id for a project, or null if there is no jacket yet. */
  findJacket: (bidProjectId: string) => Promise<{ jacketId: string } | null>;
  log: {
    info: (msg: string, ctx?: Record<string, unknown>) => void;
    warn: (msg: string, ctx?: Record<string, unknown>) => void;
    error: (msg: string, ctx?: Record<string, unknown>) => void;
  };
}): Promise<void> {
  const { bidProjectId, deps, findJacket, log } = args;
  let jacketRef: { jacketId: string } | null = null;
  try {
    jacketRef = await findJacket(bidProjectId);
  } catch (err: any) {
    log.warn("auto-fill: findJacket failed; skipping trigger", {
      bidProjectId,
      err: err?.message,
    });
    return;
  }

  if (!jacketRef) {
    log.info("auto-fill: no jacket for project; skipping", { bidProjectId });
    return;
  }

  try {
    const result = await autoFillJacket({
      jacketId: jacketRef.jacketId,
      bidProjectId,
      deps,
    });
    log.info("auto-fill: triggered after takeoff finalize", {
      bidProjectId,
      jacketId: jacketRef.jacketId,
      filed: result.totalFiled,
      replaced: result.totalReplaced,
      success: result.success,
    });
  } catch (err: any) {
    log.error("auto-fill: trigger failed", {
      bidProjectId,
      jacketId: jacketRef.jacketId,
      err: err?.message,
    });
  }
}

// ─── Notes for the maintainer ───────────────────────────────────────────────
//
// You can keep this helper here in unified-workflows.service.ts, or move
// it into jacket-auto-fill.service.ts. The reason it lives separately is
// so unified-workflows isn't forced to know how to construct deps.
//
// For tests, inject `findJacket` and a stubbed `deps` and assert the call
// pattern.
