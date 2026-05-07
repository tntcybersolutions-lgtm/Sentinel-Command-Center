import { describe, it, expect, vi } from "vitest";
import { runAutoCreate, type AutoCreateDeps } from "../samgov-auto-create.service";
import type { opportunities } from "@shared/schema";

function opp(overrides: Partial<typeof opportunities.$inferSelect> = {}): typeof opportunities.$inferSelect {
  return {
    id: "opp-1",
    tenantId: "tenant-1",
    title: "VA Hospital Wing Reno",
    sourceSystemId: "SOL-12345",
    sourceSystem: "samgov",
    naicsCodes: ["236220"],
    setAside: "SDVOSB",
    contractValue: "2500000",
    dueAt: new Date(Date.now() + 14 * 86400000),
    postedAt: new Date(Date.now() - 1 * 86400000),
    rawJson: { fullParentPathName: "Department of Veterans Affairs" } as any,
    ...overrides,
  } as typeof opportunities.$inferSelect;
}

function makeDeps(overrides: Partial<AutoCreateDeps> = {}): AutoCreateDeps {
  return {
    loadCandidates: vi.fn(async () => []),
    loadWinHistory: vi.fn(async () => []),
    bidProjectExistsForOpp: vi.fn(async () => false),
    createJacketForOpp: vi.fn(async () => ({ bidProjectId: "bid-uuid" })),
    fileArtifacts: vi.fn(async () => ({ filed: 3, failed: 0 })),
    ...overrides,
  };
}

const VA_WIN_HISTORY = [
  { naicsCode: "236220", setAsideCode: "SDVOSB", agencyName: "Department of Veterans Affairs", contractValue: 2_000_000 },
  { naicsCode: "236220", setAsideCode: "SDVOSB", agencyName: "Department of Veterans Affairs", contractValue: 3_500_000 },
  { naicsCode: "236220", setAsideCode: "SDVOSB", agencyName: "Department of Veterans Affairs", contractValue: 4_000_000 },
];

describe("runAutoCreate", () => {
  it("creates a jacket + files artifacts for a high-fit opportunity", async () => {
    const deps = makeDeps({
      loadWinHistory: vi.fn(async () => VA_WIN_HISTORY),
      loadCandidates: vi.fn(async () => [opp()]),
    });

    const result = await runAutoCreate("tenant-1", deps);

    expect(result.evaluated).toBe(1);
    expect(result.created).toBe(1);
    expect(result.results[0]).toMatchObject({
      outcome: "created",
      bidProjectId: "bid-uuid",
      artifactsFiled: 3,
    });
    expect(result.results[0].fitScore).toBeGreaterThanOrEqual(60);
    expect(deps.createJacketForOpp).toHaveBeenCalledWith("tenant-1", "opp-1");
    expect(deps.fileArtifacts).toHaveBeenCalledWith("tenant-1", "bid-uuid");
  });

  it("skips opportunities below the fit threshold", async () => {
    const deps = makeDeps({
      loadWinHistory: vi.fn(async () => VA_WIN_HISTORY),
      loadCandidates: vi.fn(async () => [
        opp({ id: "opp-low", naicsCodes: ["541512"], setAside: "8(a)", contractValue: "50000000", rawJson: { fullParentPathName: "FAA" } as any }),
      ]),
    });

    const result = await runAutoCreate("tenant-1", deps);
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.results[0].outcome).toBe("skipped_low_fit");
    expect(deps.createJacketForOpp).not.toHaveBeenCalled();
  });

  it("skips opportunities that already have a bid_project", async () => {
    const deps = makeDeps({
      loadWinHistory: vi.fn(async () => VA_WIN_HISTORY),
      loadCandidates: vi.fn(async () => [opp()]),
      bidProjectExistsForOpp: vi.fn(async () => true),
    });
    const result = await runAutoCreate("tenant-1", deps);
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.results[0].outcome).toBe("skipped_existing");
    expect(deps.createJacketForOpp).not.toHaveBeenCalled();
  });

  it("captures errors per opportunity without aborting the run", async () => {
    const deps = makeDeps({
      loadWinHistory: vi.fn(async () => VA_WIN_HISTORY),
      loadCandidates: vi.fn(async () => [
        opp({ id: "opp-1" }),
        opp({ id: "opp-2", title: "Another VA reno", sourceSystemId: "SOL-2" }),
      ]),
      createJacketForOpp: vi.fn()
        .mockRejectedValueOnce(new Error("DB locked"))
        .mockResolvedValueOnce({ bidProjectId: "bid-2" }),
    });

    const result = await runAutoCreate("tenant-1", deps);
    expect(result.evaluated).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.created).toBe(1);
    expect(result.results.find((r) => r.opportunityId === "opp-1")?.outcome).toBe("failed");
    expect(result.results.find((r) => r.opportunityId === "opp-2")?.outcome).toBe("created");
  });

  it("respects maxPerRun cap and stops early", async () => {
    const deps = makeDeps({
      loadWinHistory: vi.fn(async () => VA_WIN_HISTORY),
      loadCandidates: vi.fn(async () =>
        Array.from({ length: 10 }, (_, i) => opp({ id: `opp-${i}`, sourceSystemId: `SOL-${i}` })),
      ),
    });

    const result = await runAutoCreate("tenant-1", deps, { maxPerRun: 3 });
    expect(result.created).toBe(3);
    expect(deps.createJacketForOpp).toHaveBeenCalledTimes(3);
  });

  it("uses the configured minFitScore override", async () => {
    const deps = makeDeps({
      loadWinHistory: vi.fn(async () => VA_WIN_HISTORY),
      loadCandidates: vi.fn(async () => [
        // Mid-fit (NAICS match only, no agency/value match)
        opp({ id: "mid", naicsCodes: ["236220"], setAside: null, agencyName: null as any, contractValue: null, rawJson: null as any }),
      ]),
    });

    const strict = await runAutoCreate("tenant-1", deps, { minFitScore: 80 });
    expect(strict.created).toBe(0);
    expect(strict.results[0].outcome).toBe("skipped_low_fit");

    deps.createJacketForOpp = vi.fn(async () => ({ bidProjectId: "bid-x" }));
    const lenient = await runAutoCreate("tenant-1", deps, { minFitScore: 30 });
    expect(lenient.created).toBe(1);
  });

  it("works with an empty win history (neutral 50 score)", async () => {
    const deps = makeDeps({
      loadWinHistory: vi.fn(async () => []),
      loadCandidates: vi.fn(async () => [opp()]),
    });
    // Default threshold is 60; neutral 50 should be skipped.
    const result = await runAutoCreate("tenant-1", deps);
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.results[0].outcome).toBe("skipped_low_fit");
    expect(result.results[0].fitScore).toBe(50);
  });

  it("propagates fit reasons in the result for transparency", async () => {
    const deps = makeDeps({
      loadWinHistory: vi.fn(async () => VA_WIN_HISTORY),
      loadCandidates: vi.fn(async () => [opp()]),
    });
    const result = await runAutoCreate("tenant-1", deps);
    expect(result.results[0].fitReasons).toBeDefined();
    expect(result.results[0].fitReasons!.length).toBeGreaterThan(0);
  });
});
