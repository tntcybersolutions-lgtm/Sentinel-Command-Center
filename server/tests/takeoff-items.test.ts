import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import supertest from "supertest";

// ─── Mocks ───────────────────────────────────────────────────────────────────
vi.mock("../storage", () => ({
  storage: {
    getTakeoffItems: vi.fn().mockResolvedValue([
      { id: "item-1", blueprintId: "bp-1", name: "Test Item", quantity: 5, unit: "EA" },
    ]),
    getTakeoffItemsByProject: vi.fn().mockResolvedValue([
      { id: "item-2", blueprintId: "bp-1", name: "Project Item", quantity: 10, unit: "LF", bidProjectId: "proj-1" },
    ]),
    createTakeoffItem: vi.fn().mockResolvedValue({
      id: "item-new",
      blueprintId: "bp-1",
      name: "New Item",
      quantity: 0,
      unit: "EA",
    }),
    updateTakeoffItem: vi.fn().mockResolvedValue({
      id: "item-1",
      name: "Updated Item",
      quantity: 7,
    }),
    deleteTakeoffItem: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../db", () => ({
  db: {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

vi.mock("drizzle-orm", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: any[]) => ({ strings, values }),
    { raw: (s: string) => ({ raw: s }) }
  ),
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
}));

// Import after mocks
import { takeoffItemsRouter } from "../takeoff-items-routes";

// Build minimal express app
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(takeoffItemsRouter);
  return app;
}

// ─── GET /api/takeoff-items ──────────────────────────────────────────────────
describe("GET /api/takeoff-items", () => {
  it("returns 200 with items when blueprintId is provided", async () => {
    const res = await supertest(buildApp())
      .get("/api/takeoff-items?blueprintId=bp-1");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("blueprintId", "bp-1");
  });

  it("returns 200 with items when projectId is provided", async () => {
    const res = await supertest(buildApp())
      .get("/api/takeoff-items?projectId=proj-1");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("returns 200 with empty array when no filter", async () => {
    const res = await supertest(buildApp()).get("/api/takeoff-items");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns 500 when storage throws", async () => {
    const { storage } = await import("../storage");
    (storage.getTakeoffItems as any).mockRejectedValueOnce(new Error("DB error"));
    const res = await supertest(buildApp()).get("/api/takeoff-items?blueprintId=bp-bad");
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty("error");
  });
});

// ─── POST /api/takeoff-items ─────────────────────────────────────────────────
describe("POST /api/takeoff-items", () => {
  it("returns 201 with created item", async () => {
    const res = await supertest(buildApp())
      .post("/api/takeoff-items")
      .send({ blueprintId: "bp-1", name: "Cable Run", quantity: 100, unit: "LF" });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
  });

  it("returns 400 when blueprintId is missing", async () => {
    const res = await supertest(buildApp())
      .post("/api/takeoff-items")
      .send({ name: "Missing Blueprint" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toMatch(/blueprintId/i);
  });
});

// ─── PATCH /api/takeoff-items/:id ────────────────────────────────────────────
describe("PATCH /api/takeoff-items/:id", () => {
  it("returns 200 with updated item", async () => {
    const res = await supertest(buildApp())
      .patch("/api/takeoff-items/item-1")
      .send({ name: "Updated Item", quantity: 7 });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("name", "Updated Item");
  });

  it("returns 404 when item not found", async () => {
    const { storage } = await import("../storage");
    (storage.updateTakeoffItem as any).mockResolvedValueOnce(null);
    const res = await supertest(buildApp())
      .patch("/api/takeoff-items/not-found")
      .send({ name: "Ghost" });
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /api/takeoff-items/:id ───────────────────────────────────────────
describe("DELETE /api/takeoff-items/:id", () => {
  it("returns 200 with success", async () => {
    const res = await supertest(buildApp()).delete("/api/takeoff-items/item-1");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);
    expect(res.body).toHaveProperty("deleted", "item-1");
  });
});

// ─── ALIAS: GET /api/estimate/takeoff/items ───────────────────────────────────
describe("GET /api/estimate/takeoff/items (alias parity)", () => {
  it("returns 200 and same shape as /api/takeoff-items", async () => {
    const base = await supertest(buildApp()).get("/api/takeoff-items?blueprintId=bp-1");
    const alias = await supertest(buildApp()).get("/api/estimate/takeoff/items?blueprintId=bp-1");
    expect(alias.status).toBe(200);
    expect(alias.body).toEqual(base.body);
  });
});

// ─── ALIAS: GET /api/projects/:projectId/takeoff-items ───────────────────────
describe("GET /api/projects/:projectId/takeoff-items (alias parity)", () => {
  it("returns 200 array", async () => {
    const res = await supertest(buildApp()).get("/api/projects/proj-1/takeoff-items");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("same payload as projectId query param", async () => {
    const query = await supertest(buildApp()).get("/api/takeoff-items?projectId=proj-1");
    const alias = await supertest(buildApp()).get("/api/projects/proj-1/takeoff-items");
    expect(alias.body).toEqual(query.body);
  });
});

// ─── ALIAS: GET /api/projects/:projectId/estimate/takeoff/items ─────────────
describe("GET /api/projects/:projectId/estimate/takeoff/items (alias parity)", () => {
  it("returns 200 array", async () => {
    const res = await supertest(buildApp()).get("/api/projects/proj-1/estimate/takeoff/items");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("returns same payload as /api/projects/:projectId/takeoff-items", async () => {
    const base = await supertest(buildApp()).get("/api/projects/proj-1/takeoff-items");
    const alias = await supertest(buildApp()).get("/api/projects/proj-1/estimate/takeoff/items");
    expect(alias.status).toBe(200);
    expect(alias.body).toEqual(base.body);
  });
});

// ─── GET /api/estimate/deliverables ──────────────────────────────────────────
describe("GET /api/estimate/deliverables", () => {
  it("returns 200 with array", async () => {
    const res = await supertest(buildApp()).get("/api/estimate/deliverables");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("accepts projectId query param without error", async () => {
    const res = await supertest(buildApp()).get("/api/estimate/deliverables?projectId=proj-1");
    expect(res.status).toBe(200);
  });
});

// ─── GET /api/project-deliverables (alias parity) ────────────────────────────
describe("GET /api/project-deliverables (alias parity)", () => {
  it("returns same shape as /api/estimate/deliverables", async () => {
    const base = await supertest(buildApp()).get("/api/estimate/deliverables");
    const alias = await supertest(buildApp()).get("/api/project-deliverables");
    expect(alias.status).toBe(base.status);
    expect(Array.isArray(alias.body)).toBe(true);
  });
});

// ─── GET /api/projects/:projectId/deliverables ───────────────────────────────
describe("GET /api/projects/:projectId/deliverables", () => {
  it("returns 200 array", async () => {
    const res = await supertest(buildApp()).get("/api/projects/proj-1/deliverables");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("returns same shape as /api/estimate/deliverables with projectId", async () => {
    const base = await supertest(buildApp()).get("/api/estimate/deliverables?projectId=proj-1");
    const alias = await supertest(buildApp()).get("/api/projects/proj-1/deliverables");
    expect(alias.status).toBe(200);
    expect(alias.body).toEqual(base.body);
  });
});

// ─── GET /api/projects/:projectId/estimate/deliverables ─────────────────────
describe("GET /api/projects/:projectId/estimate/deliverables", () => {
  it("returns 200 array", async () => {
    const res = await supertest(buildApp()).get("/api/projects/proj-1/estimate/deliverables");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("returns same payload as /api/projects/:projectId/deliverables", async () => {
    const base = await supertest(buildApp()).get("/api/projects/proj-1/deliverables");
    const alias = await supertest(buildApp()).get("/api/projects/proj-1/estimate/deliverables");
    expect(alias.status).toBe(200);
    expect(alias.body).toEqual(base.body);
  });
});
