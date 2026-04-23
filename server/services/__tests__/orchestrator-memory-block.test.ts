// Feature 6 main slice — tests for formatProjectMemoryBlock, the
// renderer that turns the three-layer memory into a plain-text
// section of the Herbie system prompt.
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock herbie-facts.service's getProjectMemoryBlock — the renderer's
// only dependency. No DB, no drizzle, no openai — this is pure
// formatting logic under test.
const getProjectMemoryBlockMock = vi.fn();
vi.mock("../herbie-facts.service", () => ({
  getProjectMemoryBlock: (...args: any[]) => getProjectMemoryBlockMock(...args),
}));

// Mock db + drizzle-orm because orchestrator.ts imports them at
// module scope even if we don't exercise them here.
vi.mock("../../db", () => ({ pool: {}, db: {} }));
vi.mock("../../../db/schema/herbie", () => ({
  documentTextChunks: {},
}));

import { formatProjectMemoryBlock } from "../herbie/orchestrator";

function reset() {
  getProjectMemoryBlockMock.mockReset();
}

describe("formatProjectMemoryBlock", () => {
  beforeEach(reset);

  it("returns undefined when there's nothing to show", async () => {
    getProjectMemoryBlockMock.mockResolvedValue({
      facts: [],
      decisions: [],
      relationships: [],
    });
    const block = await formatProjectMemoryBlock("t1", "p1");
    expect(block).toBeUndefined();
  });

  it("renders a Facts section with source and confidence", async () => {
    getProjectMemoryBlockMock.mockResolvedValue({
      facts: [
        {
          subjectType: "vendor",
          subjectId: "v1",
          predicate: "coi_expires_at",
          object: "2026-05-15",
          objectJson: null,
          sourceType: "document",
          sourceId: "doc-1",
          confidence: "0.92",
        },
      ],
      decisions: [],
      relationships: [],
    });
    const block = await formatProjectMemoryBlock("t1", "p1");
    expect(block).toContain("Facts:");
    expect(block).toContain("vendor:v1 coi_expires_at = 2026-05-15");
    expect(block).toContain("source: document");
    expect(block).toContain("confidence: 0.92");
  });

  it("renders a Decisions section with date + decidedBy + rationale", async () => {
    getProjectMemoryBlockMock.mockResolvedValue({
      facts: [],
      decisions: [
        {
          decidedAt: new Date("2026-03-14T15:00:00Z"),
          summary: "approved CO-07 for $4,200",
          decidedBy: "user-1",
          rationale: "Within CO allowance",
        },
      ],
      relationships: [],
    });
    const block = await formatProjectMemoryBlock("t1", "p1");
    expect(block).toContain("Decisions:");
    expect(block).toContain("2026-03-14 — approved CO-07 for $4,200 (by user-1)");
    expect(block).toContain("Within CO allowance");
  });

  it("renders Relationships with target kind + role + status", async () => {
    getProjectMemoryBlockMock.mockResolvedValue({
      facts: [],
      decisions: [],
      relationships: [
        { vendorId: "v1", contactId: null, companyId: null, role: "sub", status: "active" },
        { contactId: "c1", vendorId: null, companyId: null, role: "pm", status: "active" },
      ],
    });
    const block = await formatProjectMemoryBlock("t1", "p1");
    expect(block).toContain("Relationships:");
    expect(block).toContain("vendor:v1 — sub (active)");
    expect(block).toContain("contact:c1 — pm (active)");
  });

  it("swallows errors and returns undefined so chat is never blocked on memory-read failure", async () => {
    getProjectMemoryBlockMock.mockRejectedValue(new Error("db down"));
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    const block = await formatProjectMemoryBlock("t1", "p1");
    expect(block).toBeUndefined();
    expect(consoleErr).toHaveBeenCalled();
    consoleErr.mockRestore();
  });

  it("orders sections Facts → Decisions → Relationships", async () => {
    getProjectMemoryBlockMock.mockResolvedValue({
      facts: [
        {
          subjectType: "project",
          subjectId: "p1",
          predicate: "gc_name",
          object: "Bergman Construction",
          sourceType: "user",
          confidence: "0.95",
        },
      ],
      decisions: [
        {
          decidedAt: new Date("2026-04-02T00:00:00Z"),
          summary: "approved submittal 14",
          decidedBy: "herbie",
        },
      ],
      relationships: [
        { vendorId: "v1", role: "sub", status: "active" },
      ],
    });
    const block = await formatProjectMemoryBlock("t1", "p1");
    expect(block).toBeDefined();
    const s = block!;
    expect(s.indexOf("Facts:")).toBeLessThan(s.indexOf("Decisions:"));
    expect(s.indexOf("Decisions:")).toBeLessThan(s.indexOf("Relationships:"));
  });
});
