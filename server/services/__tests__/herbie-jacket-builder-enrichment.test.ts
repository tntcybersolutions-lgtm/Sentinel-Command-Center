import { describe, it, expect, vi } from "vitest";
import {
  enrichScopeExtractWithLLM,
  type GeneratedDocument,
  type OpportunityData,
  type ScopeEnrichmentDeps,
} from "../herbie-jacket-builder.service";
import type { ScopeExtraction, ScopeExtractionInput } from "../herbie-scope-extractor.service";

function opp(overrides: Partial<OpportunityData> = {}): OpportunityData {
  return {
    id: "opp-1",
    title: "Renovation",
    sourceSystemId: "SOL-12345",
    naicsCodes: ["236220"],
    setAside: null,
    dueAt: null,
    description: "Demolish wing C and rebuild.",
    synopsis: "Hospital reno",
    contractValue: 4_000_000,
    status: "active",
    ...overrides,
  };
}

function scopeDoc(): GeneratedDocument {
  return {
    folderCode: "05",
    title: "Scope Extract + Risk Flags",
    fileName: "Scope_Extract_Risk_Flags_SOL-12345.txt",
    documentType: "scope",
    generatedType: "ScopeExtractRiskFlags",
    mimeType: "text/plain",
    content: "ORIGINAL TEMPLATE CONTENT",
  };
}

function unrelatedDoc(): GeneratedDocument {
  return {
    folderCode: "00",
    title: "Opportunity Summary",
    fileName: "Opp.txt",
    documentType: "opportunity",
    generatedType: "OpportunitySummary",
    mimeType: "text/plain",
    content: "summary",
  };
}

function makeDeps(extract: ScopeExtraction): ScopeEnrichmentDeps {
  return {
    extract: vi.fn(async (_input: ScopeExtractionInput) => extract),
    render: vi.fn(() => "# Markdown\n\n(LLM rendered)"),
  };
}

describe("enrichScopeExtractWithLLM", () => {
  it("is a no-op when no ScopeExtractRiskFlags doc is present", async () => {
    const docs: GeneratedDocument[] = [unrelatedDoc()];
    const deps = makeDeps({
      summary: "x",
      scopeItems: [],
      riskFlags: [],
      complianceItems: [],
      confidence: 1,
      notes: "",
      source: "llm",
    });
    await enrichScopeExtractWithLLM(docs, opp(), "job-1", deps);
    expect(docs[0].content).toBe("summary"); // unchanged
    expect(deps.extract).not.toHaveBeenCalled();
  });

  it("replaces the doc content with rendered markdown when extraction succeeds", async () => {
    const target = scopeDoc();
    const docs: GeneratedDocument[] = [unrelatedDoc(), target];
    const deps = makeDeps({
      summary: "Renovation summary",
      scopeItems: [{ category: "Demolition", description: "demo wing C" }],
      riskFlags: [],
      complianceItems: [],
      confidence: 0.9,
      notes: "",
      source: "llm",
    });

    await enrichScopeExtractWithLLM(docs, opp(), "job-2", deps);

    expect(target.content).toContain("# Markdown");
    expect(target.fileName).toBe("Scope_Extract_Risk_Flags_SOL-12345.md");
    expect(target.mimeType).toBe("text/markdown");
    expect(deps.extract).toHaveBeenCalledTimes(1);
  });

  it("passes solicitation/setAside/contract metadata to the extractor", async () => {
    const target = scopeDoc();
    const docs: GeneratedDocument[] = [target];
    const deps = makeDeps({
      summary: "",
      scopeItems: [],
      riskFlags: [],
      complianceItems: [],
      confidence: 0.5,
      notes: "",
      source: "llm",
    });
    await enrichScopeExtractWithLLM(
      docs,
      opp({ setAside: "SDVOSB", contractValue: 1_500_000 }),
      "job-3",
      deps,
    );
    const arg = (deps.extract as any).mock.calls[0][0] as ScopeExtractionInput;
    expect(arg.solicitationNumber).toBe("SOL-12345");
    expect(arg.setAside).toBe("SDVOSB");
    expect(arg.contractValue).toBe(1_500_000);
    expect(arg.naics).toEqual(["236220"]);
    expect(arg.solicitationText).toContain("Demolish wing C");
    expect(arg.solicitationText).toContain("Hospital reno");
  });

  it("preserves the static template when the extractor throws", async () => {
    const target = scopeDoc();
    const docs: GeneratedDocument[] = [target];
    const deps: ScopeEnrichmentDeps = {
      extract: vi.fn(async () => {
        throw new Error("rate limited");
      }),
      render: vi.fn(),
    };
    await enrichScopeExtractWithLLM(docs, opp(), "job-4", deps);
    expect(target.content).toBe("ORIGINAL TEMPLATE CONTENT");
    expect(target.fileName).toBe("Scope_Extract_Risk_Flags_SOL-12345.txt");
    expect(target.mimeType).toBe("text/plain");
    expect(deps.render).not.toHaveBeenCalled();
  });

  it("preserves the static template when the renderer throws", async () => {
    const target = scopeDoc();
    const docs: GeneratedDocument[] = [target];
    const deps: ScopeEnrichmentDeps = {
      extract: vi.fn(async () => ({
        summary: "",
        scopeItems: [],
        riskFlags: [],
        complianceItems: [],
        confidence: 0,
        notes: "",
        source: "fallback",
      })),
      render: vi.fn(() => {
        throw new Error("template borked");
      }),
    };
    await enrichScopeExtractWithLLM(docs, opp(), "job-5", deps);
    expect(target.content).toBe("ORIGINAL TEMPLATE CONTENT");
  });
});
