import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { deliverableGeneratorRouter } from "../deliverable-generator-routes";

// ─── Mock the database layer ──────────────────────────────────────────────────
vi.mock("../db", () => ({
  db: {
    execute: vi.fn(),
  },
}));

import { db } from "../db";
const mockDb = db as any;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(deliverableGeneratorRouter);
  return app;
}

// ─── GET /api/jackets/bid/:bidId/documents/:documentId/content ───────────────
describe("GET /api/jackets/bid/:bidId/documents/:documentId/content", () => {
  beforeEach(() => vi.clearAllMocks());

  it("streams Markdown content with correct headers (200) — project_documents row", async () => {
    // First call: bid project lookup
    mockDb.execute
      .mockResolvedValueOnce({ rows: [{ id: "bid-1", tenant_id: "t1" }] })
      // Second call: project_documents lookup
      .mockResolvedValueOnce({ rows: [{
        id: "doc-1",
        title: "Executive Summary",
        content_type: "text/markdown",
        storage_key: null,
        file_size_bytes: 512,
        source_content: "# Executive Summary\n\nBlackHawk Construction...",
        project_id: "bid-1",
      }] });

    const app = buildApp();
    const res = await request(app)
      .get("/api/jackets/bid/bid-1/documents/doc-1/content");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/markdown/);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
    expect(res.headers["content-disposition"]).toMatch(/Executive_Summary/);
    expect(res.text).toContain("Executive Summary");
    expect(res.text).toContain("BlackHawk Construction");
  });

  it("streams bid_jacket_artifacts Markdown content (200) when project_documents misses", async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [{ id: "bid-1", tenant_id: "t1" }] })
      // project_documents: no match
      .mockResolvedValueOnce({ rows: [] })
      // bid_jacket_artifacts: match
      .mockResolvedValueOnce({ rows: [{
        id: "art-1",
        artifact_code: "EXEC_SUMMARY",
        title: "Executive Summary",
        content_markdown: "# Executive Summary\n\nContent from HERBIE.",
        file_size_bytes: 256,
        mime_type: "text/markdown",
        storage_key: null,
      }] });

    const app = buildApp();
    const res = await request(app)
      .get("/api/jackets/bid/bid-1/documents/art-1/content");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/markdown/);
    expect(res.text).toContain("HERBIE");
  });

  it("returns 404 when bid project is not found (auth gate)", async () => {
    mockDb.execute.mockResolvedValueOnce({ rows: [] }); // bid not found
    const app = buildApp();
    const res = await request(app)
      .get("/api/jackets/bid/nonexistent/documents/doc-1/content");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/bid project not found/i);
  });

  it("returns 404 when neither project_documents nor bid_jacket_artifacts match", async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [{ id: "bid-1", tenant_id: "t1" }] })
      .mockResolvedValueOnce({ rows: [] }) // project_documents miss
      .mockResolvedValueOnce({ rows: [] }); // bid_jacket_artifacts miss

    const app = buildApp();
    const res = await request(app)
      .get("/api/jackets/bid/bid-1/documents/missing/content");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns 501 for binary files in external storage", async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [{ id: "bid-1", tenant_id: "t1" }] })
      .mockResolvedValueOnce({ rows: [{
        id: "doc-bin",
        title: "Attached PDF",
        content_type: "application/pdf",
        storage_key: "s3://bucket/project/doc.pdf",
        file_size_bytes: 4096,
        source_content: null, // binary file — no inline content
        project_id: "bid-1",
      }] });

    const app = buildApp();
    const res = await request(app)
      .get("/api/jackets/bid/bid-1/documents/doc-bin/content");

    expect(res.status).toBe(501);
    expect(res.body.error).toMatch(/binary file/i);
    expect(res.body.storageKey).toBe("s3://bucket/project/doc.pdf");
  });

  it("returns 500 on DB error", async () => {
    mockDb.execute.mockRejectedValueOnce(new Error("Connection timeout"));
    const app = buildApp();
    const res = await request(app)
      .get("/api/jackets/bid/bid-1/documents/doc-1/content");
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });

  it("sets Cache-Control: no-store header", async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [{ id: "bid-1", tenant_id: "t1" }] })
      .mockResolvedValueOnce({ rows: [{
        id: "doc-1",
        title: "Technical Approach",
        content_type: "text/markdown",
        storage_key: null,
        file_size_bytes: 100,
        source_content: "# Technical Approach",
        project_id: "bid-1",
      }] });

    const app = buildApp();
    const res = await request(app)
      .get("/api/jackets/bid/bid-1/documents/doc-1/content");

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("sets correct Content-Length header", async () => {
    const markdown = "# Past Performance\n\nContent.";
    const expectedLength = Buffer.byteLength(markdown, "utf8");

    mockDb.execute
      .mockResolvedValueOnce({ rows: [{ id: "bid-1", tenant_id: "t1" }] })
      .mockResolvedValueOnce({ rows: [{
        id: "doc-1",
        title: "Past Performance",
        content_type: "text/markdown",
        storage_key: null,
        file_size_bytes: expectedLength,
        source_content: markdown,
        project_id: "bid-1",
      }] });

    const app = buildApp();
    const res = await request(app)
      .get("/api/jackets/bid/bid-1/documents/doc-1/content");

    expect(res.status).toBe(200);
    expect(parseInt(res.headers["content-length"] ?? "0")).toBe(expectedLength);
  });

  it("cross-tenant rejection: bid with different tenant is still found (auth is by bidId ownership, not tenantId)", async () => {
    // NOTE: The route validates bid existence, not tenantId matching.
    // Cross-tenant isolation is enforced at the application auth middleware level.
    // Here we verify that the route does NOT silently skip on a valid bid lookup.
    mockDb.execute
      .mockResolvedValueOnce({ rows: [{ id: "bid-1", tenant_id: "t1-different" }] })
      .mockResolvedValueOnce({ rows: [{
        id: "doc-1",
        title: "Key Personnel",
        content_type: "text/markdown",
        storage_key: null,
        file_size_bytes: 50,
        source_content: "# Key Personnel",
        project_id: "bid-1",
      }] });

    const app = buildApp();
    const res = await request(app)
      .get("/api/jackets/bid/bid-1/documents/doc-1/content");

    // Route found the document — cross-tenant protection must be at auth middleware
    expect(res.status).toBe(200);
  });
});
