import { describe, it, expect } from "vitest";
import {
  getCanonicalSections,
  getAllCanonicalSections,
  normalizeName,
} from "../taxonomy.service";
import {
  BID_JACKET_FOLDERS,
  COMPANY_JACKET_FOLDERS,
  PROJECT_JACKET_FOLDERS,
} from "@shared/schema";

describe("normalizeName", () => {
  it("replaces & with 'and'", () => {
    expect(normalizeName("Insurance & Bonding")).toBe("Insurance_and_Bonding");
    expect(normalizeName("Plans & Specs")).toBe("Plans_and_Specs");
  });

  it("collapses whitespace into single underscores", () => {
    expect(normalizeName("Active     Bids")).toBe("Active_Bids");
  });

  it("strips disallowed punctuation", () => {
    expect(normalizeName("Pre-Bid & Site Visit!")).toBe("Pre-Bid_and_Site_Visit");
  });

  it("trims leading/trailing whitespace", () => {
    expect(normalizeName("   Photos   ")).toBe("Photos");
  });
});

describe("getCanonicalSections", () => {
  it("returns one section per BID_JACKET_FOLDERS entry, in order", () => {
    const sections = getCanonicalSections("bid");
    expect(sections).toHaveLength(BID_JACKET_FOLDERS.length);
    expect(sections.map((s) => s.code)).toEqual(BID_JACKET_FOLDERS.map((f) => f.code));
    expect(sections[0].sortOrder).toBe(1);
    expect(sections[sections.length - 1].sortOrder).toBe(BID_JACKET_FOLDERS.length);
  });

  it("returns one section per COMPANY_JACKET_FOLDERS entry", () => {
    const sections = getCanonicalSections("company");
    expect(sections).toHaveLength(COMPANY_JACKET_FOLDERS.length);
    expect(sections.every((s) => s.jacketType === "company")).toBe(true);
  });

  it("returns one section per PROJECT_JACKET_FOLDERS entry", () => {
    const sections = getCanonicalSections("project");
    expect(sections).toHaveLength(PROJECT_JACKET_FOLDERS.length);
    expect(sections.every((s) => s.jacketType === "project")).toBe(true);
  });

  it("populates name (normalized) and displayName (raw)", () => {
    const sections = getCanonicalSections("bid");
    const insurance = sections.find((s) => s.code === "07")!;
    expect(insurance.displayName).toBe("Insurance & Bonding");
    expect(insurance.name).toBe("Insurance_and_Bonding");
  });

  it("flags isSystem=true for all canonical bid folders", () => {
    const sections = getCanonicalSections("bid");
    expect(sections.every((s) => s.isSystem === true)).toBe(true);
  });
});

describe("getAllCanonicalSections", () => {
  it("returns the union of all three taxonomies", () => {
    const all = getAllCanonicalSections();
    expect(all).toHaveLength(
      COMPANY_JACKET_FOLDERS.length + BID_JACKET_FOLDERS.length + PROJECT_JACKET_FOLDERS.length,
    );
    expect(all.some((s) => s.jacketType === "company")).toBe(true);
    expect(all.some((s) => s.jacketType === "bid")).toBe(true);
    expect(all.some((s) => s.jacketType === "project")).toBe(true);
  });

  it("guarantees uniqueness of (jacketType, code) keys", () => {
    const all = getAllCanonicalSections();
    const keys = new Set<string>();
    for (const s of all) {
      const key = `${s.jacketType}:${s.code}`;
      expect(keys.has(key)).toBe(false);
      keys.add(key);
    }
  });
});
