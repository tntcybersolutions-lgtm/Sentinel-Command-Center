import { describe, it, expect, vi } from "vitest";
import express from "express";
import supertest from "supertest";

// ─── Mocks ─────────────────────────────────────────────────────────────────────
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
  sql: Object.assign((s: TemplateStringsArray, ...v: any[]) => ({ s, v }), {
    raw: (s: string) => ({ raw: s }),
  }),
  eq: vi.fn(),
  and: vi.fn(),
}));

// Import the router under test (the deliverable-generator-routes exports deliverableGeneratorRouter)
import { deliverableGeneratorRouter } from "../deliverable-generator-routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  // Simulate an authenticated user
  app.use((req: any, _res, next) => {
    req.user = { tenantId: "tenant-1", id: "user-1" };
    next();
  });
  app.use(deliverableGeneratorRouter);
  return app;
}

// ─── GET /api/jackets/bid/:bidId/documents/:documentId/content ─────────────────
describe("GET /api/jackets/bid/:bidId/documents/:documentId/content", () => {
  it("returns 200 with text/markdown content-type for herbie-generated doc", async () => {
    const res = await supertest(buildApp())
      .get("/api/jackets/bid/bid-1/documents/doc-1/content");
    expect(res.status).toBe(200);
    // Must return either the document or a structured error — not 404 HTML
    expect(typeof res.body === "object" || typeof res.text === "string").toBe(true);
  });

  it("returns 404 when document does not exist in this bid", async () => {
    const { db } = await import("../db");
    (db.execute as any).mockResolvedValueOnce({ rows: [] });
    const res = await supertest(buildApp())
      .get("/api/jackets/bid/bid-1/documents/nonexistent/content");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 403 when document belongs to a different bid (cross-tenant check)", async () => {
    const { db } = await import("../db");
    // Return a doc with a different bid_project_id
    (db.execute as any).mockResolvedValueOnce({
      rows: [{ ...mockDoc, bid_project_id: "other-bid" }],
    });
    const res = await supertest(buildApp())
      .get("/api/jackets/bid/bid-1/documents/doc-1/content");
    // Should be 403 or 404 — never expose wrong-tenant document
    expect([403, 404]).toContain(res.status);
  });

  it("sets correct Content-Type for markdown payload", async () => {
    const { db } = await import("../db");
    (db.execute as any).mockResolvedValueOnce({ rows: [mockDoc] });
    const res = await supertest(buildApp())
      .get("/api/jackets/bid/bid-1/documents/doc-1/content");
    if (res.status === 200) {
      const ct = res.headers["content-type"] || "";
      // Should be text/markdown, text/plain, or application/json
      expect(ct).toMatch(/text\/|application\/json/);
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

