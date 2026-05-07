// Phase 2 v2 — event handler that auto-fills the bid jacket whenever a
// takeoff is updated.  Listens to the existing TakeoffUpdated event via
// the eventBus.
//
// Wiring (in server/services/unified-workflows.service.ts):
//
//   import { registerJacketAutoFillHandler } from "./jacket-auto-fill.handler";
//   ...
//   export function registerWorkflowHandlers(): void {
//     eventBus.register("OpportunityWon", handleOpportunityWon);
//     eventBus.register("SolicitationParsed", handleSolicitationParsed);
//     eventBus.register("TakeoffUpdated", handleTakeoffUpdated);
//     eventBus.register("TakeoffDelta", handleTakeoffDelta);
//     registerJacketAutoFillHandler();   // <-- add this line
//   }
//
// Behaviour:
//   - Best-effort: if auto-fill fails, the takeoff finalize still succeeds.
//   - Gated by the AUTO_FILL_JACKETS env var so you can dark-launch.
//   - Looks up bidProjectId from the event's payload OR via project→bidProject.

import { eventBus } from "./event-bus.service";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { projects, bidProjects, type OpsEvent } from "@shared/schema";
import { autoFillJacket } from "./jacket-auto-fill.service.v2";
import { buildProductionAutoFillDeps } from "./jacket-auto-fill.deps";

const FLAG_ENV_VAR = "AUTO_FILL_JACKETS";

async function handleTakeoffUpdatedAutoFill(event: OpsEvent): Promise<void> {
  // Honor the kill switch — default OFF until explicitly enabled.
  if (process.env[FLAG_ENV_VAR] !== "1") return;

  const tenantId = event.tenantId;
  const payload = (event.payload as Record<string, any>) || {};

  // The TakeoffUpdated event carries projectId; we need the bidProjectId.
  // Two paths to resolve:
  //   1. payload.bidProjectId is set directly (preferred future)
  //   2. payload.projectId → projects.bidProjectId
  let bidProjectId: string | null =
    typeof payload.bidProjectId === "string" ? payload.bidProjectId : null;

  if (!bidProjectId && typeof payload.projectId === "string") {
    const [proj] = await db
      .select({ bidProjectId: projects.bidProjectId })
      .from(projects)
      .where(eq(projects.id, payload.projectId));
    bidProjectId = proj?.bidProjectId ?? null;
  }

  if (!bidProjectId) {
    console.log("[jacket-auto-fill.handler] no bidProjectId resolvable; skipping", {
      tenantId,
      eventId: event.id,
    });
    return;
  }

  // Confirm the bidProject exists and belongs to the right tenant.
  const [bp] = await db
    .select({ id: bidProjects.id, tenantId: bidProjects.tenantId })
    .from(bidProjects)
    .where(eq(bidProjects.id, bidProjectId));
  if (!bp) {
    console.warn("[jacket-auto-fill.handler] bidProject not found; skipping", { bidProjectId });
    return;
  }
  if (bp.tenantId !== tenantId) {
    console.warn("[jacket-auto-fill.handler] tenant mismatch; skipping", {
      bidProjectId,
      eventTenant: tenantId,
      bpTenant: bp.tenantId,
    });
    return;
  }

  try {
    const deps = buildProductionAutoFillDeps();
    const result = await autoFillJacket({ tenantId, bidProjectId, deps });
    console.log("[jacket-auto-fill.handler] auto-fill triggered", {
      tenantId,
      bidProjectId,
      filed: result.totalFiled,
      replaced: result.totalReplaced,
      success: result.success,
    });
  } catch (err: any) {
    console.error("[jacket-auto-fill.handler] auto-fill failed (non-fatal)", {
      tenantId,
      bidProjectId,
      err: err?.message,
    });
  }
}
handleTakeoffUpdatedAutoFill.handlerName = "handleTakeoffUpdatedAutoFill";

/**
 * Register this handler with the event bus.  Idempotent: safe to call
 * multiple times.
 */
let registered = false;
export function registerJacketAutoFillHandler(): void {
  if (registered) return;
  eventBus.register("TakeoffUpdated", handleTakeoffUpdatedAutoFill);
  registered = true;
  console.log("[jacket-auto-fill.handler] registered for TakeoffUpdated");
}

// Exported for tests
export { handleTakeoffUpdatedAutoFill };
