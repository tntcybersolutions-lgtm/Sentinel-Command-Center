import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { takeoffItemsRouter } from "../takeoff-items-routes";

// ─── Mock the storage layer ───────────────────────────────────────────────────
vi.mock("../storage", () => ({
  storage: {
    getTakeoffItems: vi.fn(),
    getTakeoffItemsByProject: vi.fn(),
    createTakeoffItem: vi.fn(),
    updateTakeoffItem: vi.fn(),
    deleteTakeoffItem: vi.fn(),
    getProjectDeliverables: vi.fn(),
  },
}));

import { storage } from "../storage";
const mockStorage = storage as any;

// Build a minimal Express app with the router under test
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(takeoffItemsRouter);
  return app;
}

// ─── GET /api/takeoff-items ───────────────────────────────────────────────────
describe("GET /api/takeoff-items", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty array when no filters provided (200)", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/takeoff-items");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("filters by blueprintId query param (200)", async () => {
    const items = [{ id: "item-1", name: "Wire", blueprintId: "bp-1" }];
    mockStorage.getTakeoffItems.mockResolvedValueOnce(items);
    const app = buildApp();
    const res = await request(app).get("/api/takeoff-items?blueprintId=bp-1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(items);
    expect(mockStorage.getTakeoffItems).toHaveBeenCalledWith("bp-1");
  });

  it("filters by projectId query param (200)", async () => {
    const items = [{ id: "item-2", name: "Conduit", bidProjectId: "proj-1" }];
    mockStorage.getTakeoffItemsByProject.mockResolvedValueOnce(items);
    const app = buildApp();
    const res = await request(app).get("/api/takeoff-items?projectId=proj-1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(items);
    expect(mockStorage.getTakeoffItemsByProject).toHaveBeenCalledWith("proj-1");
  });

  it("returns 500 on storage error", async () => {
    mockStorage.getTakeoffItems.mockRejectedValueOnce(new Error("DB failure"));
    const app = buildApp();
    const res = await request(app).get("/api/takeoff-items?blueprintId=bp-fail");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("DB failure");
  });
});

// ─── POST /api/takeoff-items ──────────────────────────────────────────────────
describe("POST /api/takeoff-items", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a new item and returns 201 with created row", async () => {
    const created = { id: "new-1", name: "Switch", blueprintId: "bp-1", quantity: 4 };
    mockStorage.createTakeoffItem.mockResolvedValueOnce(created);
    const app = buildApp();
    const res = await request(app)
      .post("/api/takeoff-items")
      .send({ blueprintId: "bp-1", name: "Switch", quantity: 4, unit: "EA", unitCost: 150 });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
  });

  it("returns 400 when blueprintId is missing", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/takeoff-items")
      .send({ name: "Missing BP" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/blueprintId/i);
  });

  it("returns 500 on storage error", async () => {
    mockStorage.createTakeoffItem.mockRejectedValueOnce(new Error("Insert failed"));
    const app = buildApp();
    const res = await request(app)
      .post("/api/takeoff-items")
      .send({ blueprintId: "bp-err" });
    expect(res.status).toBe(500);
  });
});

// ─── PATCH /api/takeoff-items/:id ────────────────────────────────────────────
describe("PATCH /api/takeoff-items/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates and returns the updated row (200)", async () => {
    const updated = { id: "item-5", name: "Switch (updated)", quantity: 8 };
    mockStorage.updateTakeoffItem.mockResolvedValueOnce(updated);
    const app = buildApp();
    const res = await request(app)
      .patch("/api/takeoff-items/item-5")
      .send({ name: "Switch (updated)", quantity: 8 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
  });

  it("returns 404 when storage returns null/undefined", async () => {
    mockStorage.updateTakeoffItem.mockResolvedValueOnce(null);
    const app = buildApp();
    const res = await request(app)
      .patch("/api/takeoff-items/nonexistent")
      .send({ name: "Ghost" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns 500 on storage error", async () => {
    mockStorage.updateTakeoffItem.mockRejectedValueOnce(new Error("Update failed"));
    const app = buildApp();
    const res = await request(app)
      .patch("/api/takeoff-items/err-id")
      .send({ name: "X" });
    expect(res.status).toBe(500);
  });
});

// ─── DELETE /api/takeoff-items/:id ───────────────────────────────────────────
describe("DELETE /api/takeoff-items/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes and returns success (200)", async () => {
    mockStorage.deleteTakeoffItem.mockResolvedValueOnce(undefined);
    const app = buildApp();
    const res = await request(app).delete("/api/takeoff-items/del-1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, deleted: "del-1" });
  });

  it("returns 500 on storage error", async () => {
    mockStorage.deleteTakeoffItem.mockRejectedValueOnce(new Error("Delete failed"));
    const app = buildApp();
    const res = await request(app).delete("/api/takeoff-items/err-id");
    expect(res.status).toBe(500);
  });
});

// ─── Alias parity: all 4 alias GET routes return identical payloads ───────────
describe("Alias route parity", () => {
  beforeEach(() => vi.clearAllMocks());

  const items = [{ id: "a1", name: "Outlet", blueprintId: "bp-1" }];

  it("GET /api/estimate/takeoff/items returns same as /api/takeoff-items with blueprintId", async () => {
    mockStorage.getTakeoffItems.mockResolvedValue(items);
    const app = buildApp();
    const [r1, r2] = await Promise.all([
      request(app).get("/api/takeoff-items?blueprintId=bp-1"),
      request(app).get("/api/estimate/takeoff/items?blueprintId=bp-1"),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.body).toEqual(r2.body);
  });

  it("GET /api/projects/:projectId/takeoff-items returns items", async () => {
    mockStorage.getTakeoffItemsByProject.mockResolvedValueOnce(items);
    const app = buildApp();
    const res = await request(app).get("/api/projects/proj-1/takeoff-items");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(items);
    expect(mockStorage.getTakeoffItemsByProject).toHaveBeenCalledWith("proj-1");
  });

  it("GET /api/projects/:projectId/estimate/takeoff/items returns items", async () => {
    mockStorage.getTakeoffItemsByProject.mockResolvedValueOnce(items);
    const app = buildApp();
    const res = await request(app).get("/api/projects/proj-2/estimate/takeoff/items");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(items);
    expect(mockStorage.getTakeoffItemsByProject).toHaveBeenCalledWith("proj-2");
  });
});

// ─── GET /api/project-deliverables ───────────────────────────────────────────
describe("GET /api/project-deliverables", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty array when storage returns empty (200)", async () => {
    mockStorage.getProjectDeliverables = vi.fn().mockResolvedValueOnce([]);
    const app = buildApp();
    const res = await request(app).get("/api/project-deliverables");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("returns 200 even if getProjectDeliverables is not available on storage", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/project-deliverables");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
