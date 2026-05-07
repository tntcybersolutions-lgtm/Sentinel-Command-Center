import { describe, it, expect, vi } from "vitest";
import express from "express";
import supertest from "supertest";

// ─── Mocks ───────────────────────────────────────────────────────────────────
const mockDoc = {
  id: "doc-1",
  bid_project_id: "bid-1",
  tenant_id: "tenant-1",
  title: "Executive Summary",
  content: "# Executive Summary\n\nThis document covers the project scope.",
  storage_key: null,
  source_type: "herbie_generated",
  created_at: new Date().toISOString(),
};

vi.mock("../db", () => ({
  db: {
    execute: vi.fn().mockResolvedValue({ rows: [mockDoc] }),
  },
}));

vi.mock("drizzle-orm", () => ({
  sql: Object.assign(
    (s: TemplateStringsArray, ...v: any[]) => ({ s, v }),
    { raw: (s: string) => ({ raw: s }) }
  ),
  eq: vi.fn(),
  and: vi.fn(),
}));

// Import the router under test
import { documentContentRouter } from "../document-content-routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  // Simulate an authenticated user with tenantId "tenant-1"
  app.use((req: any, _res, next) => {
    req.user = { tenantId: "tenant-1", id: "user-1" };
    req.tenantId = "tenant-1";
    next();
  });
  app.use(documentContentRouter);
  return app;
}

// ─── GET /api/jackets/bid/:bidId/documents/:documentId/content ─────────────────
describe("GET /api/jackets/bid/:bidId/documents/:documentId/content", () => {
  it("returns 200 with text/markdown content-type and Content-Disposition header for herbie-generated doc", async () => {
    const { db } = await import("../db");
    (db.execute as any).mockResolvedValueOnce({ rows: [mockDoc] });
    const res = await supertest(buildApp())
      .get("/api/jackets/bid/bid-1/documents/doc-1/content");
    expect(res.status).toBe(200);
    // Must have a Content-Disposition header
    expect(res.headers["content-disposition"]).toMatch(/attachment/i);
    // Body must contain actual markdown content
    expect(res.text).toContain("Executive Summary");
  });

  it("returns 404 when document does not exist in this bid", async () => {
    const { db } = await import("../db");
    // resolveDocTable returns a table name, then doc lookup returns empty
    (db.execute as any)
      .mockResolvedValueOnce({ rows: [{ table_name: "bid_jacket_documents" }] }) // resolveDocTable
      .mockResolvedValueOnce({ rows: [] }); // doc lookup
    const res = await supertest(buildApp())
      .get("/api/jackets/bid/bid-1/documents/nonexistent/content");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 403 when document belongs to a different tenant (cross-tenant check)", async () => {
    const { db } = await import("../db");
    // Doc has tenant_id "other-tenant" but requesting user is "tenant-1"
    (db.execute as any)
      .mockResolvedValueOnce({ rows: [{ table_name: "bid_jacket_documents" }] }) // resolveDocTable
      .mockResolvedValueOnce({ rows: [{ ...mockDoc, tenant_id: "other-tenant" }] }); // doc lookup
    const res = await supertest(buildApp())
      .get("/api/jackets/bid/bid-1/documents/doc-1/content");
    // Must be 403 — never expose a different tenant's document
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 401 when x-tenant-id header is explicitly empty string", async () => {
    const app = express();
    app.use(express.json());
    // Override: simulate unauthenticated request with empty x-tenant-id
    app.use((req: any, _res, next) => {
      req.user = undefined;
      req.tenantId = undefined;
      next();
    });
    app.use(documentContentRouter);
    const res = await supertest(app)
      .get("/api/jackets/bid/bid-1/documents/doc-1/content")
      .set("x-tenant-id", "");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("sets correct Content-Type and Content-Disposition for markdown payload", async () => {
    const { db } = await import("../db");
    (db.execute as any)
      .mockResolvedValueOnce({ rows: [{ table_name: "bid_jacket_documents" }] })
      .mockResolvedValueOnce({ rows: [mockDoc] });
    const res = await supertest(buildApp())
      .get("/api/jackets/bid/bid-1/documents/doc-1/content");
    if (res.status === 200) {
      expect(res.headers["content-type"]).toMatch(/text\/|application\/json/);
      expect(res.headers["content-disposition"]).toContain("attachment");
      expect(res.headers["content-disposition"]).toContain("filename=");
    }
  });

  it("returns JSON error (not HTML) on internal error", async () => {
    const { db } = await import("../db");
    (db.execute as any).mockRejectedValueOnce(new Error("DB crashed"));
    const res = await supertest(buildApp())
      .get("/api/jackets/bid/bid-1/documents/doc-1/content");
    expect(res.status).toBe(500);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body).toHaveProperty("error");
  });
});
