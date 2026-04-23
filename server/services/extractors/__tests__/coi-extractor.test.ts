import { describe, it, expect } from "vitest";
import { extractCoiFields } from "../coi-extractor";

describe("coi-extractor — extractCoiFields", () => {
  it("returns zero confidence when given no input", () => {
    const r = extractCoiFields({});
    expect(r.confidence).toBe(0);
    expect(r.policyType).toBeUndefined();
    expect(r.expiryDate).toBeUndefined();
  });

  it("parses a well-labeled GL COI body", () => {
    const text = `
      ACORD 25 CERTIFICATE OF LIABILITY INSURANCE
      Insurer: Acme Mutual Insurance Company
      Policy Number: GL-2026-001234
      General Liability
      Effective Date: 01/15/2026
      Expiration Date: 01/15/2027
      Each Occurrence: $1,000,000
      General Aggregate: $2,000,000
    `;
    const r = extractCoiFields({ text });
    expect(r.policyType).toBe("gl");
    expect(r.policyNumber).toBe("GL-2026-001234");
    expect(r.carrier).toContain("Acme Mutual");
    expect(r.effectiveDate?.toISOString().slice(0, 10)).toBe("2026-01-15");
    expect(r.expiryDate?.toISOString().slice(0, 10)).toBe("2027-01-15");
    expect(r.limits?.eachOccurrence).toBe(1_000_000);
    expect(r.limits?.generalAggregate).toBe(2_000_000);
    expect(r.confidence).toBeGreaterThan(0.7);
  });

  it("parses a Workers' Comp COI with date-only evidence", () => {
    const text = `
      Workers Compensation
      Policy #: WC-555
      Effective 03/01/2026
      Expires 03/01/2027
    `;
    const r = extractCoiFields({ text });
    expect(r.policyType).toBe("wc");
    expect(r.expiryDate?.toISOString().slice(0, 10)).toBe("2027-03-01");
  });

  it("falls back to chronological date pair when labels are missing", () => {
    const text = `Policy period 2026-04-01 through 2027-04-01`;
    const r = extractCoiFields({ text });
    expect(r.effectiveDate?.toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(r.expiryDate?.toISOString().slice(0, 10)).toBe("2027-04-01");
  });

  it("detects policy type from the filename alone at lower confidence", () => {
    const r = extractCoiFields({ fileName: "acme-general-liability-2026.pdf" });
    expect(r.policyType).toBe("gl");
    // No dates, no carrier, no policy number → confidence capped low.
    expect(r.confidence).toBeLessThan(0.5);
  });

  it("records per-field evidence strings", () => {
    const r = extractCoiFields({
      text: "General Liability policy. Policy Number: POL-1. Expires 05/15/2026.",
    });
    expect(r.evidence.some((e) => e.startsWith("policy_type"))).toBe(true);
    expect(r.evidence.some((e) => e.startsWith("policy_number"))).toBe(true);
    expect(r.evidence.some((e) => e.startsWith("expiry_date"))).toBe(true);
  });

  it("identifies auto liability and umbrella policy types", () => {
    expect(extractCoiFields({ text: "Automobile Liability" }).policyType).toBe("auto");
    expect(extractCoiFields({ text: "Umbrella policy" }).policyType).toBe("umbrella");
    expect(extractCoiFields({ text: "Excess Liability coverage" }).policyType).toBe("umbrella");
  });
});
