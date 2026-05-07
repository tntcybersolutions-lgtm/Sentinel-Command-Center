import { describe, it, expect, vi } from "vitest";
import {
  fileArtifactRow,
  folderCodeForArtifact,
  ARTIFACT_CODE_TO_FOLDER,
  type FilingDeps,
  type ArtifactBlob,
} from "../bid-jacket-filing.service";
import type { BidJacketArtifact } from "@shared/schema";

function artifact(overrides: Partial<BidJacketArtifact> = {}): BidJacketArtifact {
  return {
    id: "art-1",
    tenantId: "tenant-1",
    bidProjectId: "bid-1",
    templateCode: "SAM_SOLICITATION",
    title: "Solicitation",
    sourceType: "samgov",
    sourceUrl: "https://sam.gov/file.pdf",
    storageKey: null,
    status: "missing",
    ownerUserId: null,
    dueAt: null,
    metadataJson: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDeps(overrides: Partial<FilingDeps> = {}): FilingDeps {
  return {
    download: vi.fn(async (): Promise<ArtifactBlob> => ({
      buffer: Buffer.from("pdf-bytes"),
      contentType: "application/pdf",
      fileName: "solicitation.pdf",
    })),
    storeObject: vi.fn(async (key: string, blob: ArtifactBlob) => ({
      storageKey: `/objects/${key}`,
      size: blob.buffer.length,
    })),
    resolveFolderId: vi.fn(async () => "folder-uuid"),
    insertJacketDocument: vi.fn(async () => ({ id: "doc-uuid" })),
    markArtifactFiled: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("folderCodeForArtifact", () => {
  it("maps known template codes per ARTIFACT_CODE_TO_FOLDER", () => {
    expect(folderCodeForArtifact("SAM_SOLICITATION")).toBe("01");
    expect(folderCodeForArtifact("PRICING_SHEET")).toBe("11");
    expect(folderCodeForArtifact("INSURANCE_CERTS")).toBe("07");
    expect(folderCodeForArtifact("SUB_QUOTES_COMPILATION")).toBe("06");
  });

  it("falls back to '00' Intake for unknown codes", () => {
    expect(folderCodeForArtifact("WHATEVER_NEW_CODE")).toBe("00");
    expect(folderCodeForArtifact(null)).toBe("00");
    expect(folderCodeForArtifact(undefined)).toBe("00");
  });

  it("covers all expected SAM/HigherGov inputs", () => {
    expect(Object.keys(ARTIFACT_CODE_TO_FOLDER).length).toBeGreaterThanOrEqual(20);
  });
});

describe("fileArtifactRow", () => {
  it("skips artifacts that already have a storageKey (idempotent)", async () => {
    const deps = makeDeps();
    const result = await fileArtifactRow(
      artifact({ storageKey: "/objects/already-there" }),
      deps,
    );
    expect(result).toEqual({ artifactId: "art-1", status: "skipped", reason: "already_filed" });
    expect(deps.download).not.toHaveBeenCalled();
  });

  it("skips artifacts with no sourceUrl", async () => {
    const deps = makeDeps();
    const result = await fileArtifactRow(artifact({ sourceUrl: null }), deps);
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("no_source_url");
    expect(deps.download).not.toHaveBeenCalled();
  });

  it("returns failed when download throws", async () => {
    const deps = makeDeps({
      download: vi.fn(async () => {
        throw new Error("404 Not Found");
      }),
    });
    const result = await fileArtifactRow(artifact(), deps);
    expect(result.status).toBe("failed");
    expect(result.reason).toContain("download_failed");
    expect(result.reason).toContain("404");
    expect(deps.insertJacketDocument).not.toHaveBeenCalled();
  });

  it("returns failed when target folder is missing", async () => {
    const deps = makeDeps({ resolveFolderId: vi.fn(async () => null) });
    const result = await fileArtifactRow(artifact(), deps);
    expect(result.status).toBe("failed");
    expect(result.reason).toContain("folder_not_found");
    expect(deps.storeObject).not.toHaveBeenCalled();
  });

  it("returns failed when storage write throws", async () => {
    const deps = makeDeps({
      storeObject: vi.fn(async () => {
        throw new Error("S3 down");
      }),
    });
    const result = await fileArtifactRow(artifact(), deps);
    expect(result.status).toBe("failed");
    expect(result.reason).toContain("storage_failed");
    expect(deps.insertJacketDocument).not.toHaveBeenCalled();
    expect(deps.markArtifactFiled).not.toHaveBeenCalled();
  });

  it("happy path: downloads, stores, inserts document, marks artifact filed", async () => {
    const deps = makeDeps();
    const result = await fileArtifactRow(artifact(), deps);
    expect(result).toEqual({
      artifactId: "art-1",
      status: "filed",
      documentId: "doc-uuid",
    });
    expect(deps.download).toHaveBeenCalledWith("https://sam.gov/file.pdf");
    expect(deps.resolveFolderId).toHaveBeenCalledWith("tenant-1", "bid-1", "01");
    const storeCall = (deps.storeObject as any).mock.calls[0];
    expect(storeCall[0]).toMatch(/^jackets\/bid\/bid-1\/art-1-solicitation\.pdf$/);
    const insertArg = (deps.insertJacketDocument as any).mock.calls[0][0];
    expect(insertArg).toMatchObject({
      tenantId: "tenant-1",
      folderId: "folder-uuid",
      fileName: "solicitation.pdf",
      mimeType: "application/pdf",
      documentType: "SAM_SOLICITATION",
      source: "samgov",
    });
    expect(deps.markArtifactFiled).toHaveBeenCalledWith(
      "art-1",
      expect.stringContaining("/objects/jackets/bid/bid-1/"),
      false,
    );
  });

  it("preserves approved status when artifact was already approved", async () => {
    const deps = makeDeps();
    await fileArtifactRow(artifact({ status: "approved" }), deps);
    expect(deps.markArtifactFiled).toHaveBeenCalledWith("art-1", expect.any(String), true);
  });

  it("sanitizes filenames into the object key", async () => {
    const deps = makeDeps({
      download: vi.fn(async () => ({
        buffer: Buffer.from("x"),
        contentType: "application/pdf",
        fileName: "my weird/name?.pdf",
      })),
    });
    await fileArtifactRow(artifact(), deps);
    const objectKey = (deps.storeObject as any).mock.calls[0][0];
    expect(objectKey).toMatch(/^jackets\/bid\/bid-1\/art-1-my_weird_name_\.pdf$/);
  });
});
