import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock backing services so we test the tool dispatch seam, not the
// services themselves (those have their own tests).
const buildBidJacketMock = vi.fn();
const ensureCanonicalMock = vi.fn();
const fileArtifactsMock = vi.fn();
const routeDocumentMock = vi.fn();

vi.mock("../herbie-jacket-builder.service", () => ({
  buildBidJacket: (...a: any[]) => buildBidJacketMock(...a),
}));
vi.mock("../jacket.service", () => ({
  jacketService: {
    ensureCanonicalBidJacket: (...a: any[]) => ensureCanonicalMock(...a),
    routeDocumentToFolder: (...a: any[]) => routeDocumentMock(...a),
  },
}));
vi.mock("../bid-jacket-filing.service", () => ({
  fileUnfiledArtifactsForBid: (...a: any[]) => fileArtifactsMock(...a),
  productionFilingDeps: { __mocked: true },
}));

// Other tools' dependencies — minimal stubs so the module loads cleanly.
vi.mock("../herbie-facts.service", () => ({
  recordFact: vi.fn(),
  recordDecision: vi.fn(),
}));
vi.mock("../rfi-draft.service", () => ({ draftRfi: vi.fn() }));
vi.mock("../submittal-draft.service", () => ({ draftSubmittal: vi.fn() }));
vi.mock("../voice-daily-log.service", () => ({ upsertVoiceDailyLog: vi.fn() }));
vi.mock("../coi.service", () => ({
  listForProject: vi.fn(async () => []),
  partitionByTier: vi.fn(() => ({})),
  coisExpiringWithin: vi.fn(async () => []),
}));
vi.mock("../outbound-message-draft.service", () => ({ draftMessage: vi.fn() }));
vi.mock("../rag.service", () => ({
  createRAGService: () => ({ search: vi.fn(async () => []) }),
}));
vi.mock("../../db", () => ({
  pool: {},
  db: {
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([{ id: "x" }]) }) }),
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
  },
}));
vi.mock("../extractors/coi-extractor", () => ({
  extractCoiFields: vi.fn(),
  inferCategoryFromFile: vi.fn(),
}));

import { executeHerbieTool, WRITE_CAPABLE_TOOLS } from "../herbie-tools";

const ctx = { tenantId: "tenant-1", userId: "u-1", projectId: "proj-1" };

beforeEach(() => {
  buildBidJacketMock.mockReset();
  ensureCanonicalMock.mockReset();
  fileArtifactsMock.mockReset();
  routeDocumentMock.mockReset();
  delete process.env.HERBIE_PREVIEW_MODE;
});

describe("herbie-tools jacket tools — registration", () => {
  it("registers all four jacket tools as write/read appropriately", () => {
    expect(WRITE_CAPABLE_TOOLS.has("build_bid_jacket")).toBe(true);
    expect(WRITE_CAPABLE_TOOLS.has("ensure_bid_jacket_canonical")).toBe(true);
    expect(WRITE_CAPABLE_TOOLS.has("file_bid_jacket_artifacts")).toBe(true);
    expect(WRITE_CAPABLE_TOOLS.has("route_document_to_jacket")).toBe(false);
  });
});

describe("build_bid_jacket", () => {
  it("returns BAD_ARGS when bidProjectId is missing", async () => {
    const r = await executeHerbieTool({ tool: "build_bid_jacket", args: {} }, ctx);
    expect(r).toMatchObject({ success: false, code: "BAD_ARGS" });
    expect(buildBidJacketMock).not.toHaveBeenCalled();
  });

  it("dispatches to buildBidJacket and surfaces the result on success", async () => {
    buildBidJacketMock.mockResolvedValue({
      success: true,
      documentsCreated: 5,
      documentsSkipped: 1,
      documentsFailed: 0,
      foldersPopulated: 4,
      skipped: false,
      jobId: "job-1",
      artifacts: [],
    });
    const r = await executeHerbieTool(
      { tool: "build_bid_jacket", args: { bidProjectId: "bid-99", mode: "build" } },
      ctx,
    );
    expect(buildBidJacketMock).toHaveBeenCalledWith("bid-99", "build");
    expect(r).toMatchObject({ success: true, data: { documentsCreated: 5, jobId: "job-1" } });
  });

  it("returns BUILD_FAILED when buildBidJacket reports success=false", async () => {
    buildBidJacketMock.mockResolvedValue({
      success: false,
      documentsCreated: 0,
      documentsSkipped: 0,
      documentsFailed: 0,
      foldersPopulated: 0,
      skipped: false,
      jobId: "job-2",
      error: "Bid project not found",
      artifacts: [],
    });
    const r = await executeHerbieTool(
      { tool: "build_bid_jacket", args: { bidProjectId: "bid-missing" } },
      ctx,
    );
    expect(r).toMatchObject({
      success: false,
      code: "BUILD_FAILED",
      error: "Bid project not found",
    });
  });

  it("defaults mode to 'build' when an unknown mode is passed", async () => {
    buildBidJacketMock.mockResolvedValue({
      success: true,
      documentsCreated: 0,
      documentsSkipped: 0,
      documentsFailed: 0,
      foldersPopulated: 0,
      skipped: false,
      jobId: "job-3",
      artifacts: [],
    });
    await executeHerbieTool(
      { tool: "build_bid_jacket", args: { bidProjectId: "bid-9", mode: "delete-everything" } },
      ctx,
    );
    expect(buildBidJacketMock).toHaveBeenCalledWith("bid-9", "build");
  });

  it("short-circuits to preview in HERBIE_PREVIEW_MODE", async () => {
    process.env.HERBIE_PREVIEW_MODE = "true";
    const r = await executeHerbieTool(
      { tool: "build_bid_jacket", args: { bidProjectId: "bid-1" } },
      ctx,
    );
    expect(r).toMatchObject({ success: true, preview: true });
    expect(buildBidJacketMock).not.toHaveBeenCalled();
  });
});

describe("ensure_bid_jacket_canonical", () => {
  it("returns BAD_ARGS when bidProjectId is missing", async () => {
    const r = await executeHerbieTool(
      { tool: "ensure_bid_jacket_canonical", args: {} },
      ctx,
    );
    expect(r).toMatchObject({ success: false, code: "BAD_ARGS" });
  });

  it("dispatches to jacketService.ensureCanonicalBidJacket with tenant + bid id", async () => {
    ensureCanonicalMock.mockResolvedValue({ created: [], renamed: [], isHealthy: true });
    const r = await executeHerbieTool(
      { tool: "ensure_bid_jacket_canonical", args: { bidProjectId: "bid-7" } },
      ctx,
    );
    expect(ensureCanonicalMock).toHaveBeenCalledWith("tenant-1", "bid-7");
    expect(r).toMatchObject({ success: true, data: { isHealthy: true } });
  });
});

describe("file_bid_jacket_artifacts", () => {
  it("returns BAD_ARGS when bidProjectId is missing", async () => {
    const r = await executeHerbieTool(
      { tool: "file_bid_jacket_artifacts", args: {} },
      ctx,
    );
    expect(r).toMatchObject({ success: false, code: "BAD_ARGS" });
  });

  it("dispatches to fileUnfiledArtifactsForBid with productionFilingDeps", async () => {
    fileArtifactsMock.mockResolvedValue({ filed: 2, skipped: 1, failed: 0, results: [] });
    const r = await executeHerbieTool(
      { tool: "file_bid_jacket_artifacts", args: { bidProjectId: "bid-3" } },
      ctx,
    );
    expect(fileArtifactsMock).toHaveBeenCalledWith(
      "tenant-1",
      "bid-3",
      expect.objectContaining({ __mocked: true }),
    );
    expect(r).toMatchObject({ success: true, data: { filed: 2 } });
  });
});

describe("route_document_to_jacket", () => {
  it("returns BAD_ARGS when docType or jacketType missing/invalid", async () => {
    expect(
      await executeHerbieTool({ tool: "route_document_to_jacket", args: {} }, ctx),
    ).toMatchObject({ success: false, code: "BAD_ARGS" });
    expect(
      await executeHerbieTool(
        { tool: "route_document_to_jacket", args: { docType: "x", jacketType: "purple" } },
        ctx,
      ),
    ).toMatchObject({ success: false, code: "BAD_ARGS" });
  });

  it("delegates to jacketService.routeDocumentToFolder", async () => {
    routeDocumentMock.mockReturnValue({ folderId: "01", folderName: "01 - Solicitation" });
    const r = await executeHerbieTool(
      {
        tool: "route_document_to_jacket",
        args: { docType: "solicitation", jacketType: "bid" },
      },
      ctx,
    );
    expect(routeDocumentMock).toHaveBeenCalledWith("solicitation", "bid");
    expect(r).toMatchObject({ success: true, data: { folderId: "01" } });
  });
});
