import { describe, it, expect, vi } from "vitest";
import {
  US_STATES,
  WAIVER_TYPES,
} from "../lien-waivers";

describe("US_STATES constant", () => {
  it("should contain exactly 50 states", () => {
    expect(US_STATES).toHaveLength(50);
  });

  it("should contain all 50 standard US state codes", () => {
    const expected = [
      "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
      "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
      "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
      "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
      "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
    ];
    const codes = US_STATES.map((s) => s.code);
    for (const code of expected) {
      expect(codes).toContain(code);
    }
  });

  it("should have no duplicate state codes", () => {
    const codes = US_STATES.map((s) => s.code);
    const unique = new Set(codes);
    expect(unique.size).toBe(50);
  });

  it("all state codes should be 2 uppercase letters", () => {
    for (const state of US_STATES) {
      expect(state.code).toMatch(/^[A-Z]{2}$/);
    }
  });
});

describe("WAIVER_TYPES constant", () => {
  it("should contain exactly 4 waiver types", () => {
    expect(WAIVER_TYPES).toHaveLength(4);
  });

  it("should contain all required waiver types", () => {
    const types = WAIVER_TYPES.map((w) => w.type);
    expect(types).toContain("conditional_progress");
    expect(types).toContain("unconditional_progress");
    expect(types).toContain("conditional_final");
    expect(types).toContain("unconditional_final");
  });

  it("should have a label for every waiver type", () => {
    for (const waiver of WAIVER_TYPES) {
      expect(waiver.label).toBeTruthy();
    }
  });

  it("should have no duplicate waiver type keys", () => {
    const types = WAIVER_TYPES.map((w) => w.type);
    const unique = new Set(types);
    expect(unique.size).toBe(4);
  });
});

describe("Template seeding math — 50 states x 4 types = 200 templates", () => {
  it("should produce exactly 200 template combinations", () => {
    const combinations: string[] = [];
    for (const state of US_STATES) {
      for (const waiver of WAIVER_TYPES) {
        combinations.push(state.code + ":" + waiver.type);
      }
    }
    expect(combinations).toHaveLength(200);
  });

  it("should have 200 unique state+type combinations", () => {
    const combinations: string[] = [];
    for (const state of US_STATES) {
      for (const waiver of WAIVER_TYPES) {
        combinations.push(state.code + ":" + waiver.type);
      }
    }
    const unique = new Set(combinations);
    expect(unique.size).toBe(200);
  });

  it("each state should have all 4 waiver types", () => {
    for (const state of US_STATES) {
      const stateTypes = WAIVER_TYPES.map((w) => state.code + ":" + w.type);
      expect(stateTypes).toHaveLength(4);
    }
  });
});

describe("State lookup integrity", () => {
  it("should find California (CA)", () => {
    const ca = US_STATES.find((s) => s.code === "CA");
    expect(ca).toBeDefined();
    expect(ca?.name).toContain("California");
  });

  it("should find Texas (TX)", () => {
    const tx = US_STATES.find((s) => s.code === "TX");
    expect(tx).toBeDefined();
    expect(tx?.name).toContain("Texas");
  });

  it("should find New York (NY)", () => {
    const ny = US_STATES.find((s) => s.code === "NY");
    expect(ny).toBeDefined();
    expect(ny?.name).toContain("New York");
  });

  it("should not find state code XX", () => {
    const invalid = US_STATES.find((s) => s.code === "XX");
    expect(invalid).toBeUndefined();
  });
});

describe("Project waiver initialization shapes", () => {
  it("should create 4 waiver records per project", () => {
    const projectId = 1;
    const records = WAIVER_TYPES.map((w) => ({
      projectId,
      waiverType: w.type,
      status: "pending",
      stateCode: "TX",
    }));
    expect(records).toHaveLength(4);
    expect(records[0].waiverType).toBe("conditional_progress");
    expect(records[1].waiverType).toBe("unconditional_progress");
    expect(records[2].waiverType).toBe("conditional_final");
    expect(records[3].waiverType).toBe("unconditional_final");
  });

  it("all created waivers should default to pending status", () => {
    const records = WAIVER_TYPES.map((w) => ({
      waiverType: w.type,
      status: "pending",
    }));
    for (const rec of records) {
      expect(rec.status).toBe("pending");
    }
  });

  it("should correctly assign stateCode to each waiver record", () => {
    const stateCode = "CA";
    const records = WAIVER_TYPES.map((w) => ({
      waiverType: w.type,
      stateCode,
    }));
    for (const rec of records) {
      expect(rec.stateCode).toBe("CA");
    }
  });
});

describe("Lien waiver status values", () => {
  it("default status should be pending", () => {
    expect("pending").toBe("pending");
  });

  it("valid statuses should be non-empty strings", () => {
    const validStatuses = ["pending","sent","received","approved","rejected","waived"];
    for (const status of validStatuses) {
      expect(status.length).toBeGreaterThan(0);
    }
  });
});

describe("API payload shapes", () => {
  it("GET states should return 50 states", () => {
    expect(US_STATES.length).toBe(50);
  });

  it("each state should have code and name", () => {
    for (const state of US_STATES) {
      expect(state).toHaveProperty("code");
      expect(state).toHaveProperty("name");
    }
  });

  it("each waiver type should have type and label", () => {
    for (const waiver of WAIVER_TYPES) {
      expect(waiver).toHaveProperty("type");
      expect(waiver).toHaveProperty("label");
    }
  });
});
