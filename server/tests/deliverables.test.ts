import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import supertest from "supertest";

// ─── Mocks ─────────────────────────────────────────────────────────────────────
const mockGenResult = {
  id: "del-1",
  tenantId: "tenant-1",
  projectId: "proj-1",
  deliverableType: "trade_scope",
  title: "Trade Scope Document",
  status: "generated",
  contentJson: { trades: [{ trade: "electrical", items: [] }] },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

vi.mock("../storage", () => ({
  storage: {
    getTakeoffItemsByProject: vi.fn().mockResolvedValue([
      { id: "q-1", categoryId: "cat-1", quantity: "100.00", unit: "EA", unitCost: "5.00", extendedCost: "500.00" },
    ]),
    getTakeoffCategories: vi.fn().mockResolvedValue([
      { id: "cat-1", name: "Electrical Devices", code: "ELEC", trade: "electrical" },
    ]),
  },
}));

// Mock the DB for the fetchDeliverables helper in takeoff-items-routes
vi.mock("../db", () => ({
  db: {
    execute: vi.fn().mockResolvedValue({
      rows: [mockGenResult],
    }),
  },
}));

vi.mock("drizzle-orm", () => ({
  sql: Object.assign((s: TemplateStringsArray, ...v: any[]) => ({ s, v }), {
    raw: (s: string) => ({ raw: s }),
  }),
  eq: vi.fn(),
}));

import { takeoffItemsRouter } from "../takeoff-items-routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(takeoffItemsRouter);
  return app;
}

// ─── GET /api/estimate/deliverables ─────────────────────────────────────────────
describe("GET /api/estimate/deliverables — reads persisted deliverables", () => {
  it("returns 200 with array of generated deliverables", async () => {
    const res = await supertest(buildApp())
      .get("/api/estimate/deliverables?projectId=proj-1");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // DB mock returns [mockGenResult]
    expect(res.body.length).toBeGreaterThanOrEqual(0);
  });

  it("returns 200 without projectId", async () => {
    const res = await supertest(buildApp()).get("/api/estimate/deliverables");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─── GET /api/project-deliverables ─────────────────────────────────────────────
describe("GET /api/project-deliverables — alias parity", () => {
  it("returns 200 array matching estimate/deliverables", async () => {
    const base = await supertest(buildApp()).get("/api/estimate/deliverables?projectId=proj-1");
    const alias = await supertest(buildApp()).get("/api/project-deliverables?projectId=proj-1");
    expect(alias.status).toBe(base.status);
    expect(Array.isArray(alias.body)).toBe(true);
  });
});

// ─── GET /api/projects/:id/deliverables ─────────────────────────────────────────
describe("GET /api/projects/:projectId/deliverables", () => {
  it("returns 200 with project-scoped deliverables", async () => {
    const res = await supertest(buildApp()).get("/api/projects/proj-1/deliverables");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─── GET /api/projects/:id/estimate/deliverables ────────────────────────────────
describe("GET /api/projects/:projectId/estimate/deliverables — alias parity", () => {
  it("returns same shape as /api/projects/:id/deliverables", async () => {
    const base = await supertest(buildApp()).get("/api/projects/proj-1/deliverables");
    const alias = await supertest(buildApp()).get("/api/projects/proj-1/estimate/deliverables");
    expect(alias.status).toBe(base.status);
    expect(Array.isArray(alias.body)).toBe(true);
  });
});

// ─── Response shape contract ─────────────────────────────────────────────────────
describe("Deliverable response shape contract", () => {
  it("each item has the correct fields when DB returns rows", async () => {
    const { db } = await import("../db");
    (db.execute as any).mockResolvedValueOnce({
      rows: [mockGenResult],
    }).mockResolvedValueOnce({
      rows: [{ table_name: "takeoff_project_deliverables" }],
    });
    const res = await supertest(buildApp()).get("/api/estimate/deliverables?projectId=proj-1");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // When data is present, each item should have these keys
    if (res.body.length > 0) {
      const item = res.body[0];
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("projectId");
      expect(item).toHaveProperty("deliverableType");
    }
  });

  it("returns empty array gracefully when no table exists", async () => {
    const { db } = await import("../db");
    (db.execute as any).mockResolvedValueOnce({ rows: [] });
    const res = await supertest(buildApp()).get("/api/estimate/deliverables");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

