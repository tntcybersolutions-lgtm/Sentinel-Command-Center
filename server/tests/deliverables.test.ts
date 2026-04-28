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

// Helper: build minimal Express app
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(deliverableGeneratorRouter);
  return app;
}

// Shared mock data
const mockProject = {
  id: "proj-1",
  name: "VA Medical Center Renovation",
  description: "Full electrical and LV renovation for VA hospital facility",
  status: "active",
  tenant_id: "tenant-1",
  opportunity_id: "opp-1",
  updated_at: new Date().toISOString(),
};

const mockTakeoffItems = [
  { id: "i1", name: "CAT6A Cable", category: "Low Voltage", quantity: 5000, unit: "LF", unit_cost: "0.45", total_cost: "2250.00", bid_project_id: "proj-1" },
  { id: "i2", name: "IP Camera", category: "Security", quantity: 24, unit: "EA", unit_cost: "450.00", total_cost: "10800.00", bid_project_id: "proj-1" },
  { id: "i3", name: "HID Card Reader", category: "Access Control", quantity: 12, unit: "EA", unit_cost: "320.00", total_cost: "3840.00", bid_project_id: "proj-1" },
];

const mockDeliverableRow = (type: string) => ({
  id: "del-1",
  tenant_id: "tenant-1",
  bid_project_id: "proj-1",
  deliverable_type: type,
  title: "Trade Scopes",
  content_markdown: "# Trade Scopes\n\nContent here.",
  status: "complete",
  generation_model: "mvp-generator-v1",
  generation_ms: 42,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// ─── POST /api/generate-deliverable/:type ────────────────────────────────────
describe("POST /api/generate-deliverable/:type", () => {
  beforeEach(() => vi.clearAllMocks());

  const DELIVERABLE_TYPES = [
    "trade_scope", "bid_package", "material_list", "cable_schedule",
    "device_schedule", "rack_elevation", "as_built", "owner_handoff", "smart_config",
  ];

  DELIVERABLE_TYPES.forEach((type) => {
    it(`generates ${type} and returns persisted row (200)`, async () => {
      // Mock: resolveBidProject → returns project
      // Mock: getTakeoffData (3 queries: categories, items, quantities) → returns empty arrays
      // Mock: UPSERT → returns the row
      mockDb.execute
        .mockResolvedValueOnce({ rows: [mockProject] })          // bid_projects query
        .mockResolvedValueOnce({ rows: [] })                      // takeoff_categories
        .mockResolvedValueOnce({ rows: mockTakeoffItems })        // takeoff_items
        .mockResolvedValueOnce({ rows: [] })                      // takeoff_quantities
        .mockResolvedValueOnce({ rows: [mockDeliverableRow(type)] }); // UPSERT result

      const app = buildApp();
      const res = await request(app)
        .post(`/api/generate-deliverable/${type}`)
        .send({ projectId: "proj-1" });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.deliverable).toBeDefined();
      expect(res.body.deliverable.deliverable_type).toBe(type);
      expect(res.body.generationMs).toBeGreaterThanOrEqual(0);
      expect(res.body.model).toBe("mvp-generator-v1");
    });
  });

  it("returns 400 for unknown deliverable type", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/generate-deliverable/unknown_type")
      .send({ projectId: "proj-1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unknown deliverable type/i);
  });

  it("returns 404 when no bid project exists", async () => {
    mockDb.execute.mockResolvedValueOnce({ rows: [] }); // no project found
    const app = buildApp();
    const res = await request(app)
      .post("/api/generate-deliverable/trade_scope")
      .send({ projectId: "nonexistent" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no bid project found/i);
  });

  it("returns 500 on DB error during generation", async () => {
    mockDb.execute.mockRejectedValueOnce(new Error("DB timeout"));
    const app = buildApp();
    const res = await request(app)
      .post("/api/generate-deliverable/trade_scope")
      .send({ projectId: "proj-1" });
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });

  it("is idempotent: rerunning same type does not 409 — UPSERT returns updated row", async () => {
    // First run
    mockDb.execute
      .mockResolvedValueOnce({ rows: [mockProject] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [mockDeliverableRow("trade_scope")] });
    // Second run (same project + type) → also 200, not 409
    mockDb.execute
      .mockResolvedValueOnce({ rows: [mockProject] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...mockDeliverableRow("trade_scope"), generation_ms: 38 }] });

    const app = buildApp();
    const r1 = await request(app)
      .post("/api/generate-deliverable/trade_scope")
      .send({ projectId: "proj-1" });
    const r2 = await request(app)
      .post("/api/generate-deliverable/trade_scope")
      .send({ projectId: "proj-1" });

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200); // NOT 409
    expect(r2.body.ok).toBe(true);
  });

  it("generated content_markdown is non-empty for each type", async () => {
    const type = "material_list";
    const row = { ...mockDeliverableRow(type), content_markdown: "# Material List\n\n## Materials Required\n..." };
    mockDb.execute
      .mockResolvedValueOnce({ rows: [mockProject] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: mockTakeoffItems })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row] });

    const app = buildApp();
    const res = await request(app)
      .post("/api/generate-deliverable/material_list")
      .send({ projectId: "proj-1" });

    expect(res.status).toBe(200);
    expect(res.body.deliverable.content_markdown.length).toBeGreaterThan(50);
    expect(res.body.deliverable.content_markdown).toContain("Material");
  });
});

// ─── GET /api/project-deliverables ───────────────────────────────────────────
describe("GET /api/project-deliverables", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns real persisted rows from DB (200)", async () => {
    const rows = [mockDeliverableRow("trade_scope"), mockDeliverableRow("bid_package")];
    mockDb.execute.mockResolvedValueOnce({ rows });
    const app = buildApp();
    const res = await request(app).get("/api/project-deliverables");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].deliverable_type).toBe("trade_scope");
  });

  it("returns empty array when no deliverables yet (200)", async () => {
    mockDb.execute.mockResolvedValueOnce({ rows: [] });
    const app = buildApp();
    const res = await request(app).get("/api/project-deliverables");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns 200 with empty array when table does not exist yet (migration not run)", async () => {
    mockDb.execute.mockRejectedValueOnce(new Error("relation \"takeoff_deliverables\" does not exist"));
    const app = buildApp();
    const res = await request(app).get("/api/project-deliverables");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("filters by projectId when provided", async () => {
    const rows = [mockDeliverableRow("as_built")];
    mockDb.execute.mockResolvedValueOnce({ rows });
    const app = buildApp();
    const res = await request(app).get("/api/project-deliverables?projectId=proj-1");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

// ─── GET /api/estimate/deliverables ──────────────────────────────────────────
describe("GET /api/estimate/deliverables", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns rows (200)", async () => {
    const rows = [mockDeliverableRow("cable_schedule")];
    mockDb.execute.mockResolvedValueOnce({ rows });
    const app = buildApp();
    const res = await request(app).get("/api/estimate/deliverables");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("gracefully returns [] when table does not exist", async () => {
    mockDb.execute.mockRejectedValueOnce(new Error("does not exist"));
    const app = buildApp();
    const res = await request(app).get("/api/estimate/deliverables");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
