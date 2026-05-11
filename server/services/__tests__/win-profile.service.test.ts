import { describe, it, expect } from "vitest";
import {
  buildWinProfileFromRows,
  scoreOpportunityFit,
  type WinProfileInput,
} from "../win-profile.service";

function row(overrides: Partial<WinProfileInput> = {}): WinProfileInput {
  return {
    naicsCode: "236220",
    setAsideCode: "SDVOSB",
    agencyName: "Department of Veterans Affairs",
    contractValue: "2500000",
    ...overrides,
  };
}

describe("buildWinProfileFromRows", () => {
  it("aggregates frequency maps and value stats", () => {
    const profile = buildWinProfileFromRows([
      row({ naicsCode: "236220", contractValue: 1000000, agencyName: "VA" }),
      row({ naicsCode: "236220", contractValue: 2000000, agencyName: "VA" }),
      row({ naicsCode: "238210", contractValue: 4000000, agencyName: "GSA", setAsideCode: "WOSB" }),
    ]);
    expect(profile.totalWins).toBe(3);
    expect(profile.naicsFreq.get("236220")).toBe(2);
    expect(profile.naicsFreq.get("238210")).toBe(1);
    expect(profile.agencyFreq.get("VA")).toBe(2);
    expect(profile.setAsideFreq.get("SDVOSB")).toBe(2);
    expect(profile.setAsideFreq.get("WOSB")).toBe(1);
    expect(profile.valueRange).toEqual({ min: 1000000, max: 4000000 });
    expect(profile.medianValue).toBe(2000000);
  });

  it("survives empty input", () => {
    const profile = buildWinProfileFromRows([]);
    expect(profile.totalWins).toBe(0);
    expect(profile.valueRange).toBeNull();
    expect(profile.medianValue).toBeNull();
  });

  it("ignores null/undefined fields without crashing", () => {
    const profile = buildWinProfileFromRows([
      { naicsCode: null, agencyName: null, setAsideCode: null, contractValue: null },
      row(),
    ]);
    expect(profile.totalWins).toBe(2);
    expect(profile.naicsFreq.size).toBe(1);
  });

  it("parses string contractValue", () => {
    const profile = buildWinProfileFromRows([
      row({ contractValue: "1500000.50" }),
      row({ contractValue: "weird" }),
    ]);
    expect(profile.medianValue).toBe(1500000.5);
  });
});

describe("scoreOpportunityFit", () => {
  const profile = buildWinProfileFromRows([
    row({ naicsCode: "236220", contractValue: 2_000_000, agencyName: "VA", setAsideCode: "SDVOSB" }),
    row({ naicsCode: "236220", contractValue: 3_500_000, agencyName: "VA", setAsideCode: "SDVOSB" }),
    row({ naicsCode: "236220", contractValue: 4_000_000, agencyName: "VA", setAsideCode: "SDVOSB" }),
    row({ naicsCode: "238210", contractValue: 800_000, agencyName: "GSA", setAsideCode: "WOSB" }),
    row({ naicsCode: "237990", contractValue: 5_500_000, agencyName: "USACE", setAsideCode: null }),
  ]);

  it("scores a perfect-fit opportunity at 100", () => {
    const fit = scoreOpportunityFit(
      {
        naicsCodes: ["236220"],
        agency: "VA",
        setAside: "SDVOSB",
        contractValue: 2_500_000,
      },
      profile,
    );
    expect(fit.score).toBe(100);
    expect(fit.breakdown.naics).toBe(40);
    expect(fit.breakdown.agency).toBe(25);
    expect(fit.breakdown.setAside).toBe(15);
    expect(fit.breakdown.value).toBe(20);
    expect(fit.reasons.length).toBeGreaterThanOrEqual(4);
  });

  it("returns 0 when nothing matches", () => {
    const fit = scoreOpportunityFit(
      {
        naicsCodes: ["541512"],
        agency: "Unknown",
        setAside: "8(a)",
        contractValue: 50_000_000,
      },
      profile,
    );
    expect(fit.score).toBe(0);
    expect(fit.breakdown.naics).toBe(0);
    expect(fit.breakdown.agency).toBe(0);
  });

  it("gives credit for non-top-3 NAICS at lower weight (25 instead of 40)", () => {
    // Add many more wins under 236220 so 237990 is not in top-3.
    const profile2 = buildWinProfileFromRows([
      ...Array.from({ length: 5 }, () => row({ naicsCode: "236220" })),
      ...Array.from({ length: 4 }, () => row({ naicsCode: "238210" })),
      ...Array.from({ length: 3 }, () => row({ naicsCode: "237310" })),
      row({ naicsCode: "237990" }),
    ]);
    const fit = scoreOpportunityFit(
      { naicsCodes: ["237990"], agency: null, setAside: null, contractValue: null },
      profile2,
    );
    expect(fit.breakdown.naics).toBe(25);
  });

  it("gives partial agency credit for substring match", () => {
    const fit = scoreOpportunityFit(
      {
        naicsCodes: [],
        agency: "VA Medical Center, Boise",
        setAside: null,
        contractValue: null,
      },
      profile,
    );
    expect(fit.breakdown.agency).toBe(12);
    expect(fit.reasons.some((r) => r.includes("overlaps win history"))).toBe(true);
  });

  it("scores contract value within sweet spot fully", () => {
    const fit = scoreOpportunityFit(
      { naicsCodes: [], agency: null, setAside: null, contractValue: 3_000_000 },
      profile,
    );
    expect(fit.breakdown.value).toBe(20);
  });

  it("scores contract value at extended edges with half credit", () => {
    // median is 3_500_000 (sorted [800k, 2M, 3.5M, 4M, 5.5M]); sweet
    // spot is 0.3..3x median (1.05M..10.5M); extended is 0.5x min..2x
    // max (400k..11M). $500k falls in extended only.
    const fit = scoreOpportunityFit(
      { naicsCodes: [], agency: null, setAside: null, contractValue: 500_000 },
      profile,
    );
    expect(fit.breakdown.value).toBe(10);
  });

  it("scores far-out contract value at 0", () => {
    // $50M is well outside both sweet spot (>10.5M) and extended (>11M).
    const fit = scoreOpportunityFit(
      { naicsCodes: [], agency: null, setAside: null, contractValue: 50_000_000 },
      profile,
    );
    expect(fit.breakdown.value).toBe(0);
  });

  it("returns neutral 50 with all-zero breakdown when there are no wins yet", () => {
    const empty = buildWinProfileFromRows([]);
    const fit = scoreOpportunityFit(
      { naicsCodes: ["236220"], agency: "VA", setAside: "SDVOSB", contractValue: 1_000_000 },
      empty,
    );
    expect(fit.score).toBe(50);
    expect(fit.breakdown).toEqual({ naics: 0, agency: 0, setAside: 0, value: 0 });
  });
});
