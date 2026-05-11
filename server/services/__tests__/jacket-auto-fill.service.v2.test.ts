// Tests for jacket-auto-fill.service.v2 (v2.1: PDF outputs).
// Stubs every dep so no DB / object storage / Anthropic / pdf-lib calls happen.

import { describe, it, expect } from "vitest";
import {
  autoFillJacket,
  formatAutoFillKey,
  subcontractorDocKindToFolder,
  defaultSubcontractorFilename,
  slugDate,
  shortHash,
  FOLDER_CODE_BY_KIND,
  type JacketAutoFillDeps,
  type TakeoffSnapshot,
  type ScopeExtractionSummary,
  type BlueprintRef,
  type SubcontractorDocRef,
} from "../jacket-auto-fill.service.v2";

// ─── Builders ────────────────────────────────────────────────────────────────

function makeTakeoff(overrides: Partial<TakeoffSnapshot> = {}): TakeoffSnapshot {
  return {
    bidProjectId: "bp-1",
    projectName: "Test Project",
    totalCost: 10000,
    itemCount: 2,
    items: [
      { division: "08", description: "Doors", quantity: 12, unit: "ea", unitCost: 350, extendedCost: 4200 },
      { division: "26", description: "Outlets", quantity: 48, unit: "ea", unitCost: 35, extendedCost: 1680 },
    ],
    updatedAt: "2026-05-07T20:30:00Z",
    ...overrides,
  };
}

function makeScope(overrides: Partial<ScopeExtractionSummary> = {}): ScopeExtractionSummary {
  return {
    bidProjectId: "bp-1",
    scopeItems: ["FAR 52.219-8: Small Business"],
    divisions: ["FAR"],
    exclusions: [],
    assumptions: [],
    sourceHash: "sha-abc123",
    ...overrides,
  };
}

function makeBlueprint(id: string, overrides: Partial<BlueprintRef> = {}): BlueprintRef {
  return {
    blueprintId: id,
    filename: `${id}.pdf`,
    storagePath: `/objects/blueprints/${id}.pdf`,
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
    storagePath: `/objects/vendors/${vendorId}/${kind}.pdf`,
    expiresAt: null,
    ...overrides,
  };
}

interface StubState {
  takeoff: TakeoffSnapshot | null;
  scope: ScopeExtractionSummary | null;
  blueprints: BlueprintRef[];
  subDocs: SubcontractorDocRef[];
  folders: Record<string, string>;
  renderTakeoffShouldFail?: boolean;
  renderScopeShouldFail?: boolean;
  copyShouldFailFor?: string;
  existingByKey?: Record<string, string>;
}

function makeDeps(state: StubState): {
  deps: JacketAutoFillDeps;
  bufferCalls: Array<{ folderId: string; fileName: string; autoFillKey: string }>;
  copyCalls: Array<{ folderId: string; sourceStoragePath: string; fileName: string; autoFillKey: string }>;
  logs: Array<{ level: string; msg: string }>;
} {
  const bufferCalls: Array<{ folderId: string; fileName: string; autoFillKey: string }> = [];
  const copyCalls: Array<{ folderId: string; sourceStoragePath: string; fileName: string; autoFillKey: string }> = [];
  const logs: Array<{ level: string; msg: string }> = [];
  let nextId = 1;

  const deps: JacketAutoFillDeps = {
    async getTakeoffSnapshot() { return state.takeoff; },
    async getScopeExtraction() { return state.scope; },
    async listBlueprints() { return state.blueprints; },
    async listSubcontractorDocs() { return state.subDocs; },
    async resolveFolderId(_t, _b, code) { return state.folders[code] ?? null; },
    async renderTakeoffPdf() {
      if (state.renderTakeoffShouldFail) throw new Error("takeoff render boom");
      return Buffer.from("%PDF-fake-takeoff");
    },
    async renderScopePdf() {
      if (state.renderScopeShouldFail) throw new Error("scope render boom");
      return Buffer.from("%PDF-fake-scope");
    },
    async fileBufferIntoJacket(args) {
      bufferCalls.push({ folderId: args.folderId, fileName: args.fileName, autoFillKey: args.autoFillKey });
      const existed = state.existingByKey?.[args.autoFillKey];
      return { documentId: existed ?? `doc-${nextId++}`, replaced: !!existed };
    },
    async copyStorageFileIntoJacket(args) {
      if (state.copyShouldFailFor && state.copyShouldFailFor === args.sourceStoragePath) {
        throw new Error(`copy denied for ${args.sourceStoragePath}`);
      }
      copyCalls.push({
        folderId: args.folderId,
        sourceStoragePath: args.sourceStoragePath,
        fileName: args.fileName,
        autoFillKey: args.autoFillKey,
      });
      const existed = state.existingByKey?.[args.autoFillKey];
      return { documentId: existed ?? `doc-${nextId++}`, replaced: !!existed };
    },
    folderDisplayName(code) { return `Folder ${code}`; },
    log(level, msg) { logs.push({ level, msg }); },
  };
  return { deps, bufferCalls, copyCalls, logs };
}

const ALL_FOLDERS = {
  [FOLDER_CODE_BY_KIND.takeoff]: "fld-takeoff",
  [FOLDER_CODE_BY_KIND.blueprints]: "fld-bp",
  [FOLDER_CODE_BY_KIND.scope]: "fld-scope",
  [FOLDER_CODE_BY_KIND.subcontractors_w9]: "fld-w9",
  [FOLDER_CODE_BY_KIND.subcontractors_coi]: "fld-coi",
  [FOLDER_CODE_BY_KIND.subcontractors_lien_waivers]: "fld-lien",
};

describe("autoFillJacket v2.1 — happy path", () => {
  it("files all four classes when sources are present and folders seeded", async () => {
    const { deps, bufferCalls, copyCalls } = makeDeps({
      takeoff: makeTakeoff(),
      scope: makeScope(),
      blueprints: [makeBlueprint("bp-A"), makeBlueprint("bp-B")],
      subDocs: [
        makeSubDoc("v-1", "w9"),
        makeSubDoc("v-1", "coi"),
        makeSubDoc("v-1", "lien_waiver"),
      ],
      folders: ALL_FOLDERS,
    });
    const result = await autoFillJacket({ tenantId: "t-1", bidProjectId: "bp-1", deps });
    expect(result.success).toBe(true);
    expect(result.totalFiled).toBe(7);
    expect(bufferCalls).toHaveLength(2);
    expect(copyCalls).toHaveLength(5);
    // Validate that .pdf names + application/pdf are produced
    expect(bufferCalls.find((c) => c.fileName.endsWith(".pdf"))).toBeDefined();
  });
});

describe("autoFillJacket v2.1 — idempotency", () => {
  it("re-running marks docs replaced=true (no duplicates)", async () => {
    const takeoff = makeTakeoff();
    const scope = makeScope();
    const bps = [makeBlueprint("bp-A")];
    const takeoffKey = formatAutoFillKey({ kind: "takeoff", suffix: `v=${takeoff.updatedAt}` });
    const scopeKey = formatAutoFillKey({ kind: "scope", suffix: `v=${scope.sourceHash}` });
    const bpKey = formatAutoFillKey({ kind: "blueprints", suffix: "bp=bp-A" });
    const { deps } = makeDeps({
      takeoff, scope, blueprints: bps, subDocs: [],
      folders: ALL_FOLDERS,
      existingByKey: {
        [takeoffKey]: "doc-existing-takeoff",
        [scopeKey]: "doc-existing-scope",
        [bpKey]: "doc-existing-bp",
      },
    });
    const result = await autoFillJacket({ tenantId: "t-1", bidProjectId: "bp-1", deps });
    expect(result.totalFiled).toBe(3);
    expect(result.totalReplaced).toBe(3);
    expect(result.filed.every((f) => f.replaced)).toBe(true);
  });
});

describe("autoFillJacket v2.1 — missing sources", () => {
  it("missing takeoff → skipped no_takeoff but other sections still process", async () => {
    const { deps } = makeDeps({
      takeoff: null, scope: makeScope(),
      blueprints: [makeBlueprint("bp-A")], subDocs: [],
      folders: ALL_FOLDERS,
    });
    const result = await autoFillJacket({ tenantId: "t-1", bidProjectId: "bp-1", deps });
    expect(result.success).toBe(true);
    expect(result.skipped.find((s) => s.reason === "no_takeoff")).toBeDefined();
    expect(result.filed.find((f) => f.kind === "blueprints")).toBeDefined();
    expect(result.filed.find((f) => f.kind === "scope")).toBeDefined();
  });

  it("missing folders → skipped no_folders, success=false", async () => {
    const { deps } = makeDeps({
      takeoff: makeTakeoff(), scope: null, blueprints: [], subDocs: [],
      folders: {},
    });
    const result = await autoFillJacket({ tenantId: "t-1", bidProjectId: "bp-1", deps });
    expect(result.success).toBe(false);
    expect(result.skipped.some((s) => s.reason === "no_folders")).toBe(true);
  });

  it("missing subcontractor docs → 3 skipped entries (one per kind)", async () => {
    const { deps } = makeDeps({
      takeoff: null, scope: null, blueprints: [], subDocs: [],
      folders: ALL_FOLDERS,
    });
    const result = await autoFillJacket({ tenantId: "t-1", bidProjectId: "bp-1", deps });
    const subs = result.skipped.filter((s) =>
      s.kind === "subcontractors_w9" || s.kind === "subcontractors_coi" || s.kind === "subcontractors_lien_waivers",
    );
    expect(subs).toHaveLength(3);
  });
});

describe("autoFillJacket v2.1 — failures", () => {
  it("takeoff render fails → render_failed, success=false, scope still runs", async () => {
    const { deps } = makeDeps({
      takeoff: makeTakeoff(), scope: makeScope(),
      blueprints: [], subDocs: [],
      folders: ALL_FOLDERS,
      renderTakeoffShouldFail: true,
    });
    const result = await autoFillJacket({ tenantId: "t-1", bidProjectId: "bp-1", deps });
    expect(result.success).toBe(false);
    expect(result.skipped.find((s) => s.kind === "takeoff" && s.reason === "render_failed")).toBeDefined();
    expect(result.filed.find((f) => f.kind === "scope")).toBeDefined();
  });

  it("blueprint copy fails on one — others still file", async () => {
    const { deps } = makeDeps({
      takeoff: null, scope: null,
      blueprints: [makeBlueprint("bp-A"), makeBlueprint("bp-B")],
      subDocs: [],
      folders: ALL_FOLDERS,
      copyShouldFailFor: "/objects/blueprints/bp-A.pdf",
    });
    const result = await autoFillJacket({ tenantId: "t-1", bidProjectId: "bp-1", deps });
    expect(result.filed.find((f) => f.fileName === "bp-B.pdf")).toBeDefined();
    expect(result.skipped.some((s) => s.reason === "copy_failed" && s.detail?.includes("bp-A"))).toBe(true);
    expect(result.success).toBe(false);
  });
});

describe("autoFillJacket v2.1 — expired COI", () => {
  it("expired COI is filed but warns", async () => {
    const expired = makeSubDoc("v-77", "coi", { expiresAt: "2020-01-01T00:00:00Z" });
    const { deps } = makeDeps({
      takeoff: null, scope: null, blueprints: [],
      subDocs: [expired],
      folders: ALL_FOLDERS,
    });
    const result = await autoFillJacket({ tenantId: "t-1", bidProjectId: "bp-1", deps });
    expect(result.filed.find((f) => f.kind === "subcontractors_coi")).toBeDefined();
    expect(result.warnings.some((w) => w.startsWith("coi_expired"))).toBe(true);
  });

  it("future-expiry COI does NOT warn", async () => {
    const future = makeSubDoc("v-77", "coi", { expiresAt: "2099-01-01T00:00:00Z" });
    const { deps } = makeDeps({
      takeoff: null, scope: null, blueprints: [],
      subDocs: [future],
      folders: ALL_FOLDERS,
    });
    const result = await autoFillJacket({ tenantId: "t-1", bidProjectId: "bp-1", deps });
    expect(result.warnings.some((w) => w.startsWith("coi_expired"))).toBe(false);
  });
});

describe("autoFillJacket v2.1 — folder routing", () => {
  it("each kind goes to the right folderId", async () => {
    const { deps, bufferCalls, copyCalls } = makeDeps({
      takeoff: makeTakeoff(),
      scope: makeScope(),
      blueprints: [makeBlueprint("bp-A")],
      subDocs: [makeSubDoc("v-1", "coi"), makeSubDoc("v-1", "w9"), makeSubDoc("v-1", "lien_waiver")],
      folders: ALL_FOLDERS,
    });
    await autoFillJacket({ tenantId: "t-1", bidProjectId: "bp-1", deps });
    expect(bufferCalls.find((c) => c.folderId === "fld-takeoff")).toBeDefined();
    expect(bufferCalls.find((c) => c.folderId === "fld-scope")).toBeDefined();
    expect(copyCalls.find((c) => c.folderId === "fld-bp")).toBeDefined();
    expect(copyCalls.find((c) => c.folderId === "fld-coi")).toBeDefined();
    expect(copyCalls.find((c) => c.folderId === "fld-w9")).toBeDefined();
    expect(copyCalls.find((c) => c.folderId === "fld-lien")).toBeDefined();
  });
});

describe("formatAutoFillKey", () => {
  it("formats correctly", () => {
    expect(formatAutoFillKey({ kind: "takeoff", suffix: "v=2026" })).toBe("auto-fill::takeoff::v=2026");
  });
});

describe("subcontractorDocKindToFolder", () => {
  it("maps W-9", () => expect(subcontractorDocKindToFolder("w9")).toBe("subcontractors_w9"));
  it("maps COI", () => expect(subcontractorDocKindToFolder("coi")).toBe("subcontractors_coi"));
  it("maps lien_waiver", () => expect(subcontractorDocKindToFolder("lien_waiver")).toBe("subcontractors_lien_waivers"));
});

describe("defaultSubcontractorFilename", () => {
  it("sanitizes and suffixes", () => {
    const doc = makeSubDoc("v-1", "w9", { vendorName: "Acme Co. & Sons!", filename: "" });
    expect(defaultSubcontractorFilename(doc)).toBe("Acme_Co_Sons_W9.pdf");
  });
});

describe("slugDate / shortHash", () => {
  it("slugDate strips T, colons, fractional, Z", () => {
    expect(slugDate("2026-04-27T22:58:10.123Z")).toBe("2026-04-27_225810");
  });
  it("shortHash truncates to 12", () => {
    expect(shortHash("abcdefghijklmnop")).toBe("abcdefghijkl");
    expect(shortHash("")).toBe("");
  });
});
