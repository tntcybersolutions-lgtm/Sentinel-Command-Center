import { describe, it, expect, beforeAll, afterAll } from "vitest";

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;

async function api(method: string, path: string, body?: any) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

describe("Jacket Guards", () => {
  describe("POST /api/jackets/bid/:id/ensure-canonical", () => {
    it("returns 404 for nonexistent bid project", async () => {
      const fakeBidId = "00000000-0000-0000-0000-000000000000";
      const { status, data } = await api("POST", `/api/jackets/bid/${fakeBidId}/ensure-canonical`);
      expect(status).toBe(404);
      expect(data.error).toContain("not found");
    });

    it("returns 200 with EnsureCanonicalResult shape for valid bid", async () => {
      const { data: packets } = await api("GET", "/api/work-packages?status=pending");
      const jacketPkg = packets.find((p: any) => p.actionType === "jacket_build");
      if (!jacketPkg) {
        console.log("SKIP: No pending jacket_build packages to test against");
        return;
      }
      const bidId = jacketPkg.entityId;
      const { status, data } = await api("POST", `/api/jackets/bid/${bidId}/ensure-canonical`);
      expect(status).toBe(200);
      expect(data).toHaveProperty("bidProjectId", bidId);
      expect(data).toHaveProperty("expectedFolders");
      expect(data).toHaveProperty("totalFolders");
      expect(data).toHaveProperty("createdFolders");
      expect(data).toHaveProperty("renamedFolders");
      expect(data).toHaveProperty("missingSortOrders");
      expect(data).toHaveProperty("isHealthy");
      expect(data).toHaveProperty("details");
      expect(typeof data.expectedFolders).toBe("number");
      expect(typeof data.isHealthy).toBe("boolean");
      expect(Array.isArray(data.missingSortOrders)).toBe(true);
    });
  });

  describe("POST /api/work-packages/:id/approve (guard tests)", () => {
    it("returns 404 for nonexistent approval request", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const { status, data } = await api("POST", `/api/work-packages/${fakeId}/approve`, {});
      expect(status).toBe(404);
      expect(data.error).toContain("not found");
    });
  });

  describe("GET /api/work-packages (actionType field)", () => {
    it("every work package includes actionType, entityType, entityId fields", async () => {
      const { status, data } = await api("GET", "/api/work-packages?status=pending");
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      for (const pkg of data) {
        expect(pkg).toHaveProperty("actionType");
        expect(pkg).toHaveProperty("entityType");
        expect(pkg).toHaveProperty("entityId");
        expect(typeof pkg.actionType).toBe("string");
        expect(pkg.actionType.length).toBeGreaterThan(0);
      }
    });

    it("jacket_build packages have entityType=bid_project", async () => {
      const { data } = await api("GET", "/api/work-packages?status=pending");
      const jacketPkgs = data.filter((p: any) => p.actionType === "jacket_build");
      for (const pkg of jacketPkgs) {
        expect(pkg.entityType).toBe("bid_project");
      }
    });
  });

  describe("GET /api/jackets/bid/:id/integrity", () => {
    it("returns integrity shape for a valid bid", async () => {
      const { data: packets } = await api("GET", "/api/work-packages?status=pending");
      const jacketPkg = packets.find((p: any) => p.actionType === "jacket_build");
      if (!jacketPkg) {
        console.log("SKIP: No pending jacket_build packages");
        return;
      }
      const bidId = jacketPkg.entityId;
      const { status, data } = await api("GET", `/api/jackets/bid/${bidId}/integrity`);
      expect(status).toBe(200);
      expect(data).toHaveProperty("bidProjectId");
      expect(data).toHaveProperty("totalFolders");
      expect(data).toHaveProperty("expectedFolders");
      expect(data).toHaveProperty("isHealthy");
      expect(data).toHaveProperty("missingSortOrders");
    });
  });
});
