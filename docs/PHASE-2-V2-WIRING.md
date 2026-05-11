# Phase 2 v2 — wiring instructions

The v1 files in this PR were placeholders that didn't match the real codebase.
The v2 files (this commit batch) are written against actual signatures from
`feature/phase-1-herbie`.

## What changed v1 → v2

| Concern | v1 (placeholder) | v2 (real) |
|---|---|---|
| Jacket addressing | `getJacket(jacketId)` | Direct `(tenantId, bidProjectId)` — bid jackets are 1:1 with bidProjects |
| Folder taxonomy | `canonicalFolder("takeoff")` (didn't exist) | Canonical codes `00`–`18` from `BID_JACKET_FOLDERS` + `folderResolver()` |
| Filing primitives | Generic placeholders | `objectStorageWriter` + `jacketDocuments` table (existing) |
| Auto-trigger | `triggerJacketAutoFillBestEffort()` helper | Event handler on `TakeoffUpdated` via `eventBus` |
| Output format | "PDF" (no renderer existed) | Markdown (`text/markdown`) — matches deliverable-generator |
| Idempotency tag | `autoFillKey` on file | `tagsJson.autoFillKey` on `jacketDocuments` row |

## Files in this v2 batch (commits to feature/phase-2-takeoff-jacket)

| File | Path |
|---|---|
| Orchestrator (rewritten) | `server/services/jacket-auto-fill.service.v2.ts` |
| Production deps factory | `server/services/jacket-auto-fill.deps.ts` |
| Event handler | `server/services/jacket-auto-fill.handler.ts` |
| Express router | `server/bid-jacket-auto-fill-routes.v2.ts` |
| Tests | `server/services/__tests__/jacket-auto-fill.service.v2.test.ts` |

The v1 files (`jacket-auto-fill.service.ts`, `bid-jacket-auto-fill-routes.ts`,
`unified-workflows-auto-fill-patch.ts`) stay in the PR but are SUPERSEDED by
v2 — they should be deleted before merge OR left as historical reference and
not imported anywhere.

## Two manual edits required to make v2 live

### 1. Mount the router in `server/routes.ts`

Add this near where other sub-routers are mounted (e.g. after the
`deliverable-generator-routes` mount):

```ts
import { bidJacketAutoFillRouter } from "./bid-jacket-auto-fill-routes.v2";
app.use(bidJacketAutoFillRouter);
```

### 2. Register the event handler in `server/services/unified-workflows.service.ts`

In the `registerWorkflowHandlers` function, add one line:

```ts
import { registerJacketAutoFillHandler } from "./jacket-auto-fill.handler";

export function registerWorkflowHandlers(): void {
  eventBus.register("OpportunityWon", handleOpportunityWon);
  eventBus.register("SolicitationParsed", handleSolicitationParsed);
  eventBus.register("TakeoffUpdated", handleTakeoffUpdated);
  eventBus.register("TakeoffDelta", handleTakeoffDelta);
  registerJacketAutoFillHandler();   // <-- ADD THIS LINE
}
```

That's it — those are the only existing-file edits.

## Production behaviour

- The auto-trigger is gated by `AUTO_FILL_JACKETS=1`.  Default OFF.  Set the
  env var to enable the post-takeoff-finalize trigger.
- The endpoint `POST /api/bid-projects/:bidProjectId/auto-fill-jacket` is
  ALWAYS live (not gated) — call it manually from the UI button.
- Jacket folders must be seeded for the bid project before this works.
  The existing `seedFolderSectionsFromConstants` covers this (already used
  during bid project create).  If folders are missing, the response shows
  `skipped: [{ reason: "no_folders" }]` per section.

## Endpoint contract

```
POST /api/bid-projects/:bidProjectId/auto-fill-jacket
Auth: same as rest of /api (existing middleware)
Body (optional): { "tenantId"?: "string" }

Response 200 (full success):  { "ok": true, "result": { ... "success": true } }
Response 207 (partial):       { "ok": true, "result": { ... "success": true, "skipped": [...] } }
Response 400 (bad id):        { "ok": false, "error": "invalid_bid_project_id" }
Response 404 (no project):    { "ok": false, "error": "bid_project_not_found" }
Response 500 (unhandled):     { "ok": false, "error": "auto_fill_unhandled", "detail": "..." }
```

## Tests

```bash
# v2 orchestrator tests (run with vitest)
npm test server/services/__tests__/jacket-auto-fill.service.v2.test.ts
```

40+ assertions covering: happy path, idempotency, missing sources, render
failures, copy failures, expired COI, folder routing, unseeded folders,
helpers.

All deps are stubbed — no DB, no Anthropic, no object storage in tests.

## What v2 does NOT yet ship

- True PDF rendering (still markdown — easy follow-up with markdown-pdf)
- Vision-counter v2 wiring into smart-takeoff.tsx (the v2 module exists in
  the PR; it just needs a route + frontend call)
- Real `vendor_documents` table integration (current code derives subcontractor
  docs from `compliance_items`; swap to a dedicated table if/when one lands)

Those are net-additions on top of the v2 baseline that's now production-correct.
