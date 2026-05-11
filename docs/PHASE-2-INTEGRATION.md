# Phase 2 — Better Takeoff + Auto-Filled Bid Jackets

This phase ships two big upgrades:

1. **Better vision/AI counting accuracy** — multi-pass, scale-aware, page-aware sweep with confidence flagging.
2. **Bid jackets auto-filled with all docs** — takeoff PDF + blueprints + scope summary + subcontractor docs (W-9 / COI / lien waivers), idempotent.

Written entirely outside Replit (so you don't burn agent credits on coding errors). Replit's job is just `git pull` + deploy.

---

## Files in this PR

| File | What it does | Goes where in repo |
|---|---|---|
| `vision-counter-v2.service.ts` | Multi-pass scale-aware counter | `server/services/vision-counter-v2.service.ts` |
| `vision-counter-v2.service.test.ts` | Vitest tests for the counter | `server/services/__tests__/vision-counter-v2.service.test.ts` |
| `jacket-auto-fill.service.ts` | Bid jacket auto-fill orchestrator | `server/services/jacket-auto-fill.service.ts` |
| `jacket-auto-fill.service.test.ts` | Vitest tests for the orchestrator | `server/services/__tests__/jacket-auto-fill.service.test.ts` |
| `bid-jacket-auto-fill-routes.ts` | Express router for `POST /api/bid-jackets/:id/auto-fill` | `server/bid-jacket-auto-fill-routes.ts` |
| `unified-workflows-auto-fill-patch.ts` | Helper to trigger auto-fill on takeoff finalize | inline into `server/services/unified-workflows.service.ts` |
| `smart-takeoff-jacket-button.tsx` | "Build Bid Jacket" button + confidence warnings | `client/src/components/smart-takeoff/` |

---

## What `vision-counter-v2` does that v1 didn't

The original `vision-counter.service.ts` is a single LLM call per (image, type). Production-grade takeoffs need:

- **Multi-pass:** first pass for a rough count, then a tighter verification pass when confidence < `verifyThreshold` (default 0.85). On agreement, average. On disagreement, take the lower count and emit a warning.
- **Scale-aware prompting:** if the page has been calibrated (`blueprints.pixelsPerFootByPage`), we tell the model the scale so it can reason about expected sizes (parking stall ≈ 9'×18', door ≈ 3' wide).
- **Per-page sweep with overlap-merge:** for very dense plans (`tileGrid: 2` or `3`), we ask the model to count each region of the drawing, then sum them, then subtract a haircut for overlap to avoid double-counting items spanning crop boundaries.
- **Confidence flagging:** every item type gets an aggregated confidence. Anything below `LOW_CONFIDENCE_THRESHOLD` (0.7) is flagged `needsReview: true` and surfaces in the UI as a warning. Anything where every pass fell back (no API key, parse errors) is flagged `source: "fallback"` so the estimator knows to count manually.
- **Calibration awareness:** if any page is uncalibrated, we emit a `*_uncalibrated` warning so the user can fix calibration and re-run.

Backwards-compat: the existing single-image API in `vision-counter.service.ts` is untouched. v2 is a layer on top.

---

## What `jacket-auto-fill` orchestrator does

Orchestrates four document classes into a bid jacket idempotently:

1. **Takeoff results + cost summary** — pulls the latest takeoff snapshot, renders a PDF via `deliverable-generator-routes.renderTakeoffPdf`, files it into the jacket's `Takeoff/` folder. Keyed by `finalizedAt` so re-finalizing replaces the prior PDF in place.
2. **Blueprints / drawings** — copies every blueprint from project storage into `Drawings/`. Keyed by `blueprintId`. Re-running replaces the same blueprint copy without dupes.
3. **Scope extraction summary** — pulls the latest `herbie-scope-extractor` output, renders a PDF, files into `Scope/`. Keyed by `sourceHash`.
4. **Subcontractor docs (W-9, COI, lien waivers)** — copies each vendor doc into the matching folder. Keyed by `vendorId`. Expired COIs are still filed but emit a warning.

All folder names go through `taxonomy.service.canonicalFolder()` — we do NOT hardcode paths.

Failure handling: each section is independent. If the takeoff render fails, scope/blueprints/subdocs still file. The endpoint returns HTTP 207 (Multi-Status) when some sections succeed and some fail, so the UI can show partial success.

---

## Endpoint contract

```
POST /api/bid-jackets/:id/auto-fill
Auth: same as bid-jacket-filing routes (mount under requireAuth)
Body: { "bidProjectId"?: "string" }   // optional — defaults to jacket.bidProjectId

Response 200 (full success):
{
  "ok": true,
  "result": {
    "jacketId": "jkt-...",
    "bidProjectId": "bp-...",
    "filed": [ { "kind":"takeoff", "filename":"...", "folderPath":"...", "fileId":"...", "replaced":false, "autoFillKey":"..." }, ... ],
    "skipped": [],
    "warnings": [],
    "totalFiled": 8,
    "totalReplaced": 0,
    "success": true
  }
}

Response 207 (partial — some sections skipped/failed):
{ "ok": true,  "result": { ... "success": true,  "skipped": [ ... ] } }

Response 400 (bad jacket id):  { "ok": false, "error": "invalid_jacket_id" }
Response 404 (no jacket):       { "ok": false, "error": "jacket_not_found" }
Response 500 (unhandled):       { "ok": false, "error": "auto_fill_unhandled", "detail": "..." }
```

The `success` flag inside `result` is the source of truth — it's `false` only when a critical failure happened (render_failed, copy_failed, missing_jacket). Missing source data (no_takeoff, no_scope) is treated as "skipped, not failed."

Idempotency: each filed doc has an `autoFillKey` that uniquely identifies it. Re-running the endpoint with the same source data finds the prior copies (matched by key) and replaces them in place — no duplicates.

---

## Where it gets wired

### 1. Mount the router

In `server/routes.ts` (or wherever you mount sub-routers):

```ts
import { createBidJacketAutoFillRouter } from "./bid-jacket-auto-fill-routes";
app.use(createBidJacketAutoFillRouter({ requireAuth }));
```

### 2. Implement deps adapters

The `JacketAutoFillDeps` interface lists every external function the orchestrator calls. The router scaffolding in `bid-jacket-auto-fill-routes.ts` shows the integration points — wire each one to your existing service.

The most important ones to verify:

- `getTakeoffSnapshot(bidProjectId)` — returns the latest finalized takeoff with line items. If this doesn't exist as a function, build it from the takeoff DAO.
- `renderTakeoffPdf(snapshot)` and `renderScopePdf(scope)` — wrap whatever `deliverable-generator` exposes. If those renderers don't exist yet, ship a minimal `pdfkit` wrapper.
- `fileBufferIntoJacket` and `copyStorageFileIntoJacket` — these need to support the `autoFillKey` field for idempotency. If `bid-jacket-filing.service` doesn't already have a "replace by external key" mode, add a small wrapper (~30 lines): on each call, look up files in the target folder, find one whose stored metadata `autoFillKey` matches, delete it, then upload the new one.

### 3. Trigger on takeoff finalize

In `unified-workflows.service.ts`, inside `handleTakeoffFinalized` (or whatever fires after a takeoff is marked done):

```ts
import { triggerJacketAutoFillBestEffort } from "./jacket-auto-fill.deps"; // your factory

await triggerJacketAutoFillBestEffort({
  bidProjectId,
  deps: buildAutoFillDeps(),
  findJacket: (pid) => findJacketForProject(pid),
  log: logger,
});
```

This is a best-effort trigger — failures are logged but don't roll back the takeoff finalize.

### 4. Surface the button + warnings in `smart-takeoff.tsx`

Drop in `BuildBidJacketButton` and `VisionConfidenceWarnings` from `smart-takeoff-jacket-button.tsx`. Render the button near the takeoff toolbar, render the warnings above the items list.

---

## Tests

```bash
# vision-counter v2
npm test server/services/__tests__/vision-counter-v2.service.test.ts

# jacket auto-fill
npm test server/services/__tests__/jacket-auto-fill.service.test.ts
```

Both files are pure unit tests — no real Anthropic API calls, no real storage. They drive every code path with stub deps. Adding integration tests with real services is left for a later PR.

---

## Migration / deploy notes

- **No schema changes.** Phase 2 builds on existing tables — we don't touch `shared/schema.ts`.
- **No env var additions.** Existing `ANTHROPIC_API_KEY` is reused.
- **Feature flag suggestion:** wrap the unified-workflow auto-fill trigger in `process.env.AUTO_FILL_JACKETS === "1"` for the first few days so a bug in the trigger can't slow down takeoff finalize. Endpoint is always live.
- **Cost note:** vision-counter v2 may issue more LLM calls than v1 when verify and tile passes kick in. The default settings (no tiling, verify only on low confidence) keep cost roughly equal to v1 for the common case. `MultiPassRequest.tileGrid: 1` (default) opts out of tiling entirely.

---

## Why this lands cleanly

- Net new files only. Zero touches to existing files except the small wiring patches (router mount + unified-workflow trigger + UI button render).
- Dep injection throughout. Every external call is behind an interface, so tests don't need network/storage and you can swap implementations cleanly.
- Idempotent by design. Re-running the endpoint never duplicates docs, only replaces.
- Best-effort error handling. Single-section failures don't fail the whole run. The `success` flag tells the caller whether the partial result is acceptable.

---

## Open follow-ups (not in this PR)

- True image cropping for tile sweep (currently we use hint text to scope the model; for production-grade dense-plan accuracy we should physically crop tiles server-side and send each as a separate vision call).
- Background job for large auto-fills (some jackets have 50+ blueprints; 50 storage copies in a single request can timeout). Move to a queue if average latency exceeds 30s.
- COI expiration auto-renewal flow (separate from this PR).
