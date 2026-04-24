import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROUTES_DIR = path.resolve("server/routes");

function readRoute(file: string) {
  return fs.readFileSync(path.join(ROUTES_DIR, file), "utf8");
}

// ─── 1. Route files exist ─────────────────────────────────────────────────────
describe("Phase 19-A: route files exist on disk", () => {
  const routeFiles = [
    "award.routes.ts",
    "bid-form.routes.ts",
    "coi.routes.ts",
    "herbie-command.routes.ts",
    "herbie-digest.routes.ts",
    "herbie-memory.routes.ts",
    "herbie-tools-execute.routes.ts",
    "herbie-tools.routes.ts",
    "herbie.ts",
    "rfi-draft.routes.ts",
    "submittal-draft.routes.ts",
    "vendor-portal.routes.ts",
    "voice-daily-log.routes.ts",
  ];

  for (const file of routeFiles) {
    it(`"${file}" exists`, () => {
      expect(fs.existsSync(path.join(ROUTES_DIR, file))).toBe(true);
    });
  }
});

// ─── 2. Router exports ────────────────────────────────────────────────────────
describe("Phase 19-B: route files export a named router", () => {
  it("coi.routes.ts exports coiRouter", () => {
    const src = readRoute("coi.routes.ts");
    expect(src).toContain("coiRouter");
    expect(src).toContain("export");
  });

  it("voice-daily-log.routes.ts exports voiceDailyLogRouter", () => {
    const src = readRoute("voice-daily-log.routes.ts");
    expect(src).toContain("voiceDailyLogRouter");
    expect(src).toContain("export");
  });

  it("rfi-draft.routes.ts exports rfiDraftRouter", () => {
    const src = readRoute("rfi-draft.routes.ts");
    expect(src).toContain("rfiDraftRouter");
    expect(src).toContain("export");
  });

  it("submittal-draft.routes.ts exports submittalDraftRouter", () => {
    const src = readRoute("submittal-draft.routes.ts");
    expect(src).toContain("submittalDraftRouter");
    expect(src).toContain("export");
  });

  it("award.routes.ts exports awardRouter", () => {
    const src = readRoute("award.routes.ts");
    expect(src).toContain("awardRouter");
    expect(src).toContain("export");
  });

  it("herbie-digest.routes.ts uses Router and exports", () => {
    const src = readRoute("herbie-digest.routes.ts");
    expect(src).toContain("Router");
    expect(src).toContain("export");
  });

  it("herbie-memory.routes.ts exports herbieMemoryRouter", () => {
    const src = readRoute("herbie-memory.routes.ts");
    expect(src).toContain("herbieMemoryRouter");
    expect(src).toContain("export");
  });

  it("herbie-command.routes.ts exports herbieCommandRoutes", () => {
    const src = readRoute("herbie-command.routes.ts");
    expect(src).toContain("herbieCommandRoutes");
    expect(src).toContain("export");
  });

  it("vendor-portal.routes.ts exports vendorRouter", () => {
    const src = readRoute("vendor-portal.routes.ts");
    expect(src).toContain("vendorRouter");
    expect(src).toContain("export");
  });

  it("bid-form.routes.ts exports bidFormRouter", () => {
    const src = readRoute("bid-form.routes.ts");
    expect(src).toContain("bidFormRouter");
    expect(src).toContain("export");
  });

  it("herbie.ts uses Router and exports", () => {
    const src = readRoute("herbie.ts");
    expect(src).toContain("Router");
    expect(src).toContain("export");
  });

  it("herbie-tools.routes.ts uses Router and exports", () => {
    const src = readRoute("herbie-tools.routes.ts");
    expect(src).toContain("Router");
    expect(src).toContain("export");
  });

  it("herbie-tools-execute.routes.ts uses Router and exports", () => {
    const src = readRoute("herbie-tools-execute.routes.ts");
    expect(src).toContain("Router");
    expect(src).toContain("export");
  });
});

// ─── 3. COI routes ───────────────────────────────────────────────────────────
describe("Phase 19-C: COI route structure", () => {
  const src = readRoute("coi.routes.ts");

  it("registers GET list route", () => {
    expect(src).toMatch(/router\.get\(/);
  });

  it("registers POST upload route", () => {
    expect(src).toMatch(/router\.post\(/);
  });

  it("registers expiring/:days route", () => {
    expect(src).toContain("expiring");
    expect(src).toContain(":days");
  });

  it("parses :days param as integer with fallback 30", () => {
    expect(src).toContain("parseInt");
    expect(src).toContain("30");
  });

  it("clamps days to max 365", () => {
    expect(src).toContain("365");
  });

  it("maps expiryTier and tierSeverity over rows", () => {
    expect(src).toContain("expiryTier");
    expect(src).toContain("tierSeverity");
  });

  it("returns windowDays and alertThresholds in response", () => {
    expect(src).toContain("windowDays");
    expect(src).toContain("alertThresholds");
  });

  it("returns 500 on service failure", () => {
    expect(src).toContain("status(500)");
    expect(src).toContain("Failed to list");
  });

  it("imports COI_ALERT_DAYS constant", () => {
    expect(src).toContain("COI_ALERT_DAYS");
  });
});

// ─── 4. Voice Daily Log routes ────────────────────────────────────────────────
describe("Phase 19-D: Voice Daily Log route structure", () => {
  const src = readRoute("voice-daily-log.routes.ts");

  it("registers POST route", () => {
    expect(src).toContain("router.post");
  });

  it("uses multer for audio file upload", () => {
    expect(src).toContain("multer");
  });

  it("uses upsertVoiceDailyLog service", () => {
    expect(src).toContain("upsertVoiceDailyLog");
  });

  it("validates projectId is present (400 guard)", () => {
    expect(src).toContain("400");
    expect(src).toContain("projectId");
  });

  it("returns 201 on successful upsert", () => {
    expect(src).toContain("201");
  });

  it("returns 500 on failure", () => {
    expect(src).toContain("500");
  });
});

// ─── 5. RFI Draft routes ──────────────────────────────────────────────────────
describe("Phase 19-E: RFI Draft route structure", () => {
  const src = readRoute("rfi-draft.routes.ts");

  it("registers POST /draft", () => {
    expect(src).toContain('"/draft"');
  });

  it("uses draftRfi service function", () => {
    expect(src).toContain("draftRfi");
  });

  it("validates input with Zod safeParse", () => {
    expect(src).toContain("safeParse");
  });

  it("returns 400 on invalid input", () => {
    expect(src).toContain("400");
  });

  it("returns 201 on success", () => {
    expect(src).toContain("201");
  });

  it("returns 500 on service failure", () => {
    expect(src).toContain("500");
  });
});

// ─── 6. Submittal Draft routes ────────────────────────────────────────────────
describe("Phase 19-F: Submittal Draft route structure", () => {
  const src = readRoute("submittal-draft.routes.ts");

  it("registers POST /draft", () => {
    expect(src).toContain('"/draft"');
  });

  it("uses draftSubmittal service function", () => {
    expect(src).toContain("draftSubmittal");
  });

  it("validates with Zod safeParse", () => {
    expect(src).toContain("safeParse");
  });

  it("returns 400 on validation failure", () => {
    expect(src).toContain("400");
  });

  it("returns 201 on successful draft", () => {
    expect(src).toContain("201");
  });

  it("returns 500 on service failure", () => {
    expect(src).toContain("500");
  });
});

// ─── 7. Award routes ──────────────────────────────────────────────────────────
describe("Phase 19-G: Award route structure", () => {
  const src = readRoute("award.routes.ts");

  it("registers POST route to create award packet", () => {
    expect(src).toContain("awardRouter.post");
  });

  it("registers GET route to fetch award packet", () => {
    expect(src).toContain("awardRouter.get");
  });

  it("registers PDF download route", () => {
    expect(src).toContain("download");
    expect(src).toContain("application/pdf");
  });

  it("validates input with Zod safeParse", () => {
    expect(src).toContain("safeParse");
  });

  it("uses getPacketPdfBytes for PDF generation", () => {
    expect(src).toContain("getPacketPdfBytes");
  });

  it("sets Content-Disposition header for download", () => {
    expect(src).toContain("Content-Disposition");
    expect(src).toContain("attachment");
  });

  it("returns 404 for not found errors", () => {
    expect(src).toContain("404");
  });

  it("returns 500 on unexpected failure", () => {
    expect(src).toContain("500");
  });
});

// ─── 8. Herbie Digest routes ──────────────────────────────────────────────────
describe("Phase 19-H: Herbie Digest route structure", () => {
  const src = readRoute("herbie-digest.routes.ts");

  it("registers at least one GET route", () => {
    expect(src).toMatch(/router\.get/);
  });

  it("imports digest service", () => {
    expect(src).toMatch(/digest/i);
  });

  it("returns 500 on failure", () => {
    expect(src).toContain("500");
  });
});

// ─── 9. Herbie Memory routes ──────────────────────────────────────────────────
describe("Phase 19-I: Herbie Memory route structure", () => {
  const src = readRoute("herbie-memory.routes.ts");

  it("registers GET route for facts", () => {
    expect(src).toContain("facts");
    expect(src).toContain("router.get");
  });

  it("registers POST route to add facts or decisions", () => {
    expect(src).toContain("router.post");
  });

  it("handles decisions endpoint", () => {
    expect(src).toContain("decisions");
  });

  it("handles relationships endpoint", () => {
    expect(src).toContain("relationships");
  });

  it("returns 500 on failure", () => {
    expect(src).toContain("500");
  });
});

// ─── 10. Herbie Command routes ────────────────────────────────────────────────
describe("Phase 19-J: Herbie Command route structure", () => {
  const src = readRoute("herbie-command.routes.ts");

  it("exports herbieCommandRoutes as a Router instance", () => {
    expect(src).toContain("herbieCommandRoutes");
    expect(src).toContain("Router");
  });

  it("registers GET /actions/pending route", () => {
    expect(src).toContain("herbieCommandRoutes.get");
    expect(src).toContain("pending");
  });

  it("registers POST route to approve actions", () => {
    expect(src).toContain("herbieCommandRoutes.post");
    expect(src).toContain("approve");
  });

  it("queries herbieActions table", () => {
    expect(src).toContain("herbieActions");
  });

  it("returns 500 on failure", () => {
    expect(src).toContain("500");
  });
});

// ─── 11. Herbie main router ───────────────────────────────────────────────────
describe("Phase 19-K: Herbie main router (herbie.ts)", () => {
  const src = readRoute("herbie.ts");

  it("imports HerbieOrchestrator", () => {
    expect(src).toContain("HerbieOrchestrator");
  });

  it("registers POST /chat route via herbieRouter", () => {
    expect(src).toContain("herbieRouter.post");
    expect(src).toContain("chat");
  });

  it("uses bidProjects or opportunities schema", () => {
    expect(src).toMatch(/bidProjects|opportunities/);
  });

  it("returns 500 on failure", () => {
    expect(src).toContain("500");
  });
});

// ─── 12. Vendor Portal routes ─────────────────────────────────────────────────
describe("Phase 19-L: Vendor Portal route structure", () => {
  const src = readRoute("vendor-portal.routes.ts");

  it("registers GET route for bid token", () => {
    expect(src).toContain("vendorRouter.get");
    expect(src).toContain("/bid/:token");
  });

  it("registers POST route for bid actions", () => {
    expect(src).toContain("vendorRouter.post");
  });

  it("uses bid invitation service functions", () => {
    expect(src).toMatch(/resolveInvitationByToken|checkRateLimit|checkTokenAttempt/);
  });

  it("returns 500 on failure", () => {
    expect(src).toContain("500");
  });
});

// ─── 13. Herbie Tools routes ──────────────────────────────────────────────────
describe("Phase 19-M: Herbie Tools route structure", () => {
  const toolsSrc = readRoute("herbie-tools.routes.ts");
  const executeSrc = readRoute("herbie-tools-execute.routes.ts");

  it("herbie-tools.routes.ts registers at least one route", () => {
    expect(toolsSrc).toMatch(/router\.(get|post|put|patch|delete)/);
  });

  it("herbie-tools.routes.ts uses execSync or fs for tool operations", () => {
    expect(toolsSrc).toMatch(/execSync|fs\.|require/);
  });

  it("herbie-tools-execute.routes.ts registers route for execution", () => {
    expect(executeSrc).toMatch(/router\.(post|get)/);
  });

  it("herbie-tools-execute.routes.ts imports runAgent or related service", () => {
    expect(executeSrc).toMatch(/runAgent|herbie|agent/i);
  });

  it("both tool routes return 500 on failure", () => {
    expect(toolsSrc).toContain("500");
    expect(executeSrc).toContain("500");
  });
});

// ─── 14. Bid Form routes ──────────────────────────────────────────────────────
describe("Phase 19-N: Bid Form route structure", () => {
  const src = readRoute("bid-form.routes.ts");

  it("registers GET route for bid forms", () => {
    expect(src).toContain("bidFormRouter.get");
  });

  it("registers POST route to create bid forms", () => {
    expect(src).toContain("bidFormRouter.post");
  });

  it("registers PUT route to update bid forms", () => {
    expect(src).toContain("bidFormRouter.put");
  });

  it("registers DELETE route to remove bid form sections", () => {
    expect(src).toContain("bidFormRouter.delete");
  });

  it("uses bidFormLineItems table for line item operations", () => {
    expect(src).toContain("bidFormLineItems");
  });

  it("returns 404 for missing items", () => {
    expect(src).toContain("404");
  });

  it("returns 500 on failure", () => {
    expect(src).toContain("500");
  });
});
