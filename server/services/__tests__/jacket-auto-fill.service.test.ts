// Tests for jacket-auto-fill.service — the bid jacket orchestrator.
//
// We inject a dependency object covering every external call so we can
// drive each branch (success, missing data, render failure, copy failure,
// expired COI, idempotency) without touching real storage or Anthropic.

import { describe, it, expect } from "vitest";
import {
  autoFillJacket,
  formatAutoFillKey,
  subcontractorFolderKindFor,
  defaultSubcontractorFilename,
  slugDate,
  shortHash,
  type JacketAutoFillDeps,
  type TakeoffSnapshot,
  type ScopeExtractionSummary,
  type BlueprintRef,
  type SubcontractorDocRef,
  type JacketRecord,
  type CanonicalFolderKind,
} from "../jacket-auto-fill.service";

// ─── Builders ────────────────────────────────────────────────────────────────

function makeJacket(overrides: Partial<JacketRecord> = {}): JacketRecord {
  return {
    jacketId: "jkt-1",
    bidProjectId: "bp-1",
    rootFolderPath: "/jackets/jkt-1",
    existingFiles: [],
    ...overrides,
  };
}

function makeTakeoff(overrides: Partial<TakeoffSnapshot> = {}): TakeoffSnapshot {
  return {
    bidProjectId: "bp-1",
    totalCost: 12345.67,
    itemCount: 3,
    items: [
      { division: "08 - Doors", description: "Hollow metal door", quantity: 12, unit: "ea", unitCost: 350, extendedCost: 4200 },
      { division: "26 - Electrical", description: "Receptacles", quantity: 48, unit: "ea", unitCost: 35, extendedCost: 1680 },
    ],
    finalizedAt: "2026-05-07T20:30:00Z",
    ...overrides,
  };
}

function makeScope(overrides: Partial<ScopeExtractionSummary> = {}): ScopeExtractionSummary {
  return {
    bidProjectId: "bp-1",
    scopeItems: ["Furnish and install all interior doors", "Electrical rough-in"],
    divisions: ["08", "26"],
    exclusions: ["Permits by owner"],
    assumptions: ["Working hours M-F 7am-5pm"],
    sourceHash: "sha256-abcdef0123456789",
    ...overrides,
  };
}

function makeBlueprint(id: string, overrides: Partial<BlueprintRef> = {}): BlueprintRef {
  return {
    blueprintId: id,
    filename: `${id}.pdf`,
    storagePath: `s3://blueprints/${id}.pdf`,
    pageCount: 12,
    ...overrides,
  };
}

function makeSubDoc(
  vendorId: string,
  kind: SubcontractorDocRef["kind"],
  overrides: Partial<SubcontractorDocRef> = {},
): SubcontractorDocRef {
  return {
    docId: `${vendorId}-${kind}`,
    vendorId,
    vendorName: `Vendor ${vendorId}`,
    kind,
    filename: `${vendorId}_${kind}.pdf`,
    storagePath: `s3://vendors/${vendorId}/${kind}.pdf`,
    expiresAt: null,
    ...overrides,
  };
}

interface StubState {
  takeoff: TakeoffSnapshot | null;
  scope: ScopeExtractionSummary | null;
  blueprints: BlueprintRef[];
  subDocs: SubcontractorDocRef[];
  jacket: JacketRecord | null;
  renderTakeoffShouldFail?: boolean;
  renderScopeShouldFail?: boolean;
  copyShouldFailFor?: string; // sourceStoragePath that fails
  /** Map from autoFillKey → existing file id (simulates re-run). */
  existingByKey?: Record<string, string>;
}

function makeDeps(state: StubState): {
  deps: JacketAutoFillDeps;
  bufferCalls: Array<{ folderPath: string; filename: string; autoFillKey: string }>;
  copyCalls: Array<{ folderPath: string; sourceStoragePath: string; filename: string; autoFillKey: string }>;
  logs: Array<{ level: string; msg: string; ctx?: Record<string, unknown> }>;
} {
  const bufferCalls: Array<{ folderPath: string; filename: string; autoFillKey: string }> = [];
  const copyCalls: Array<{ folderPath: string; sourceStoragePath: string; filename: string; autoFillKey: string }> = [];
  const logs: Array<{ level: string; msg: string; ctx?: Record<string, unknown> }> = [];
  let nextId = 1;

  const folderMap: Record<CanonicalFolderKind, string> = {
    takeoff: "/Takeoff",
    blueprints: "/Drawings",
    scope: "/Scope",
    subcontractors_w9: "/Subcontractors/W-9",
    subcontractors_coi: "/Subcontractors/COI",
    subcontractors_lien_waivers: "/Subcontractors/Lien Waivers",
  };

  const deps: JacketAutoFillDeps = {
    async getTakeoffSnapshot() {
      return state.takeoff;
    },
    async getScopeExtraction() {
      return state.scope;
    },
    async listBlueprints() {
      return state.blueprints;
    },
    async listSubcontractorDocs() {
      return state.subDocs;
    },
    async getJacket() {
      return state.jacket;
    },
    async renderTakeoffPdf() {
      if (state.renderTakeoffShouldFail) throw new Error("pdf renderer crashed");
      return Buffer.from("FAKE TAKEOFF PDF");
    },
    async renderScopePdf() {
      if (state.renderScopeShouldFail) throw new Error("scope renderer crashed");
      return Buffer.from("FAKE SCOPE PDF");
    },
    async fileBufferIntoJacket(args) {
      bufferCalls.push({ folderPath: args.folderPath, filename: args.filename, autoFillKey: args.autoFillKey });
      const existed = state.existingByKey?.[args.autoFillKey];
      return { fileId: existed ?? `f-${nextId++}`, replaced: !!existed };
    },
    async copyStorageFileIntoJacket(args) {
      if (state.copyShouldFailFor && state.copyShouldFailFor === args.sourceStoragePath) {
        throw new Error(`copy denied for ${args.sourceStoragePath}`);
      }
      copyCalls.push({
        folderPath: args.folderPath,
        sourceStoragePath: args.sourceStoragePath,
        filename: args.filename,
        autoFillKey: args.autoFillKey,
      });
      const existed = state.existingByKey?.[args.autoFillKey];
      return { fileId: existed ?? `f-${nextId++}`, replaced: !!existed };
    },
    canonicalFolder(kind) {
      return folderMap[kind];
    },
    log(level, msg, ctx) {
      logs.push({ level, msg, ctx });
    },
  };
  return { deps, bufferCalls, copyCalls, logs };
}

// ─── Happy path ─────────────────────────────────────────────────────────────

describe("autoFillJacket — happy path", () => {
  it("files all four classes when every source is present", async () => {
    const { deps, bufferCalls, copyCalls } = makeDeps({
      jacket: makeJacket(),
      takeoff: makeTakeoff(),
      scope: makeScope(),
      blueprints: [makeBlueprint("bp-A"), makeBlueprint("bp-B")],
      subDocs: [
        makeSubDoc("v-1", "w9"),
        makeSubDoc("v-1", "coi"),
        makeSubDoc("v-1", "lien_waiver"),
        makeSubDoc("v-2", "w9"),
      ],
    });

    const result = await autoFillJacket({ jacketId: "jkt-1", bidProjectId: "bp-1", deps });

    expect(result.success).toBe(true);
    // 1 takeoff + 2 blueprints + 1 scope + 4 sub docs = 8
    expect(result.totalFiled).toBe(8);
    expect(result.totalReplaced).toBe(0);
    expect(result.skipped).toEqual([]);
    // Buffer calls: takeoff + scope = 2
    expect(bufferCalls).toHaveLength(2);
    // Copy calls: 2 blueprints + 4 sub docs = 6
    expect(copyCalls).toHaveLength(6);
  });

  it("uses canonical folder paths from taxonomy", async () => {
    const { deps, bufferCalls, copyCalls } = makeDeps({
      jacket: makeJacket(),
      takeoff: makeTakeoff(),
      scope: makeScope(),
      blueprints: [makeBlueprint("bp-A")],
      subDocs: [makeSubDoc("v-1", "coi")],
    });
    await autoFillJacket({ jacketId: "jkt-1", bidProjectId: "bp-1", deps });
    expect(bufferCalls.find((c) => c.folderPath === "/Takeoff")).toBeDefined();
    expect(bufferCalls.find((c) => c.folderPath === "/Scope")).toBeDefined();
    expect(copyCalls.find((c) => c.folderPath === "/Drawings")).toBeDefined();
    expect(copyCalls.find((c) => c.folderPath === "/Subcontractors/COI")).toBeDefined();
  });
});

// ─── Idempotency ────────────────────────────────────────────────────────────

describe("autoFillJacket — idempotency", () => {
  it("re-running with same source data marks docs as replaced=true (no duplicates)", async () => {
    const takeoff = makeTakeoff();
    const scope = makeScope();
    const blueprints = [makeBlueprint("bp-A")];

    const takeoffKey = formatAutoFillKey({ kind: "takeoff", suffix: `v=${takeoff.finalizedAt}` });
    const scopeKey = formatAutoFillKey({ kind: "scope", suffix: `v=${scope.sourceHash}` });
    const bpKey = formatAutoFillKey({ kind: "blueprints", suffix: "bp=bp-A" });

    const { deps } = makeDeps({
      jacket: makeJacket(),
      takeoff,
      scope,
      blueprints,
      subDocs: [],
      existingByKey: {
        [takeoffKey]: "f-existing-takeoff",
        [scopeKey]: "f-existing-scope",
        [bpKey]: "f-existing-bp",
      },
    });

    const result = await autoFillJacket({ jacketId: "jkt-1", bidProjectId: "bp-1", deps });

    expect(result.totalFiled).toBe(3);
    expect(result.totalReplaced).toBe(3);
    expect(result.filed.every((f) => f.replaced)).toBe(true);
  });
});

// ─── Missing source data ────────────────────────────────────────────────────

describe("autoFillJacket — missing source data", () => {
  it("when jacket missing, returns success=false with missing_jacket", async () => {
    const { deps } = makeDeps({
      jacket: null,
      takeoff: makeTakeoff(),
      scope: null,
      blueprints: [],
      subDocs: [],
    });
    const result = await autoFillJacket({ jacketId: "jkt-1", bidProjectId: "bp-1", deps });
    expect(result.success).toBe(false);
    expect(result.skipped[0].reason).toBe("missing_jacket");
  });

  it("missing takeoff → skipped no_takeoff but other sections still process", async () => {
    const { deps } = makeDeps({
      jacket: makeJacket(),
      takeoff: null,
      scope: makeScope(),
      blueprints: [makeBlueprint("bp-A")],
      subDocs: [],
    });
    const result = await autoFillJacket({ jacketId: "jkt-1", bidProjectId: "bp-1", deps });
    expect(result.success).toBe(true);
    expect(result.skipped.find((s) => s.reason === "no_takeoff")).toBeDefined();
    expect(result.filed.find((f) => f.kind === "blueprints")).toBeDefined();
    expect(result.filed.find((f) => f.kind === "scope")).toBeDefined();
  });

  it("missing scope → skipped no_scope", async () => {
    const { deps } = makeDeps({
      jacket: makeJacket(),
      takeoff: makeTakeoff(),
      scope: null,
      blueprints: [],
      subDocs: [],
    });
    const result = await autoFillJacket({ jacketId: "jkt-1", bidProjectId: "bp-1", deps });
    expect(result.skipped.find((s) => s.reason === "no_scope")).toBeDefined();
  });

  it("missing blueprints → skipped no_blueprints", async () => {
    const { deps } = makeDeps({
      jacket: makeJacket(),
      takeoff: makeTakeoff(),
      scope: null,
      blueprints: [],
      subDocs: [],
    });
    const result = await autoFillJacket({ jacketId: "jkt-1", bidProjectId: "bp-1", deps });
    expect(result.skipped.find((s) => s.reason === "no_blueprints")).toBeDefined();
  });

  it("missing subcontractor docs → 3 skipped entries (one per sub kind)", async () => {
    const { deps } = makeDeps({
      jacket: makeJacket(),
      takeoff: null,
      scope: null,
      blueprints: [],
      subDocs: [],
    });
    const result = await autoFillJacket({ jacketId: "jkt-1", bidProjectId: "bp-1", deps });
    const subKinds = result.skipped.filter((s) =>
      s.kind === "subcontractors_w9" || s.kind === "subcontractors_coi" || s.kind === "subcontractors_lien_waivers",
    );
    expect(subKinds).toHaveLength(3);
  });
});

// ─── Render and copy failures ───────────────────────────────────────────────

describe("autoFillJacket — failures", () => {
  it("takeoff render failure → render_failed, success=false, but other sections still run", async () => {
    const { deps } = makeDeps({
      jacket: makeJacket(),
      takeoff: makeTakeoff(),
      scope: makeScope(),
      blueprints: [],
      subDocs: [],
      renderTakeoffShouldFail: true,
    });
    const result = await autoFillJacket({ jacketId: "jkt-1", bidProjectId: "bp-1", deps });
    expect(result.success).toBe(false);
    expect(
      result.skipped.find((s) => s.kind === "takeoff" && s.reason === "render_failed"),
    ).toBeDefined();
    // Scope still filed
    expect(result.filed.find((f) => f.kind === "scope")).toBeDefined();
  });

  it("scope render failure → render_failed, success=false", async () => {
    const { deps } = makeDeps({
      jacket: makeJacket(),
      takeoff: null,
      scope: makeScope(),
      blueprints: [],
      subDocs: [],
      renderScopeShouldFail: true,
    });
    const result = await autoFillJacket({ jacketId: "jkt-1", bidProjectId: "bp-1", deps });
    expect(result.success).toBe(false);
    expect(
      result.skipped.find((s) => s.kind === "scope" && s.reason === "render_failed"),
    ).toBeDefined();
  });

  it("blueprint copy failure on one file does not prevent the other from filing", async () => {
    const { deps } = makeDeps({
      jacket: makeJacket(),
      takeoff: null,
      scope: null,
      blueprints: [makeBlueprint("bp-A"), makeBlueprint("bp-B")],
      subDocs: [],
      copyShouldFailFor: "s3://blueprints/bp-A.pdf",
    });
    const result = await autoFillJacket({ jacketId: "jkt-1", bidProjectId: "bp-1", deps });
    expect(result.filed.find((f) => f.filename === "bp-B.pdf")).toBeDefined();
    expect(
      result.skipped.find((s) => s.reason === "copy_failed" && s.detail?.includes("bp-A")),
    ).toBeDefined();
    expect(result.success).toBe(false);
  });
});

// ─── Expired COI ────────────────────────────────────────────────────────────

describe("autoFillJacket — expired COI handling", () => {
  it("expired COI is still filed but emits a warning", async () => {
    const expired = makeSubDoc("v-77", "coi", { expiresAt: "2020-01-01T00:00:00Z" });
    const { deps } = makeDeps({
      jacket: makeJacket(),
      takeoff: null,
      scope: null,
      blueprints: [],
      subDocs: [expired],
    });
    const result = await autoFillJacket({ jacketId: "jkt-1", bidProjectId: "bp-1", deps });
    expect(result.filed.find((f) => f.kind === "subcontractors_coi")).toBeDefined();
    expect(result.warnings.some((w) => w.startsWith("coi_expired"))).toBe(true);
  });

  it("future-expiry COI does NOT emit the warning", async () => {
    const future = makeSubDoc("v-77", "coi", { expiresAt: "2099-01-01T00:00:00Z" });
    const { deps } = makeDeps({
      jacket: makeJacket(),
      takeoff: null,
      scope: null,
      blueprints: [],
      subDocs: [future],
    });
    const result = await autoFillJacket({ jacketId: "jkt-1", bidProjectId: "bp-1", deps });
    expect(result.warnings.some((w) => w.startsWith("coi_expired"))).toBe(false);
  });
});

// ─── Project mismatch ───────────────────────────────────────────────────────

describe("autoFillJacket — project mismatch", () => {
  it("warns when jacket.bidProjectId does not match the requested bidProjectId", async () => {
    const { deps } = makeDeps({
      jacket: makeJacket({ bidProjectId: "bp-OTHER" }),
      takeoff: null,
      scope: null,
      blueprints: [],
      subDocs: [],
    });
    const result = await autoFillJacket({ jacketId: "jkt-1", bidProjectId: "bp-1", deps });
    expect(result.warnings.some((w) => w.startsWith("jacket_project_mismatch"))).toBe(true);
  });
});

// ─── Pure helpers ───────────────────────────────────────────────────────────

describe("formatAutoFillKey", () => {
  it("formats with namespace and components", () => {
    expect(formatAutoFillKey({ kind: "takeoff", suffix: "v=2026" })).toBe(
      "auto-fill::takeoff::v=2026",
    );
  });
});

describe("subcontractorFolderKindFor", () => {
  it("maps each kind to the right canonical folder", () => {
    expect(subcontractorFolderKindFor("w9")).toBe("subcontractors_w9");
    expect(subcontractorFolderKindFor("coi")).toBe("subcontractors_coi");
    expect(subcontractorFolderKindFor("lien_waiver")).toBe("subcontractors_lien_waivers");
  });
});

describe("defaultSubcontractorFilename", () => {
  it("sanitizes vendor name and appends doc-kind suffix", () => {
    const doc = makeSubDoc("v-1", "w9", { vendorName: "Acme Co. & Sons!", filename: "" });
    expect(defaultSubcontractorFilename(doc)).toBe("Acme_Co_Sons_W9.pdf");
  });
});

describe("slugDate / shortHash", () => {
  it("slugDate strips T, colons, fractional, and Z", () => {
    expect(slugDate("2026-04-27T22:58:10.123Z")).toBe("2026-04-27_225810");
  });
  it("shortHash truncates to 12 chars", () => {
    expect(shortHash("abcdef0123456789")).toBe("abcdef012345");
    expect(shortHash("")).toBe("");
  });
});
