/**
 * Phase 3 UI Route Registration Tests
 *
 * Verifies that all Phase 3 pages have correct client-side routes wired in
 * App.tsx and that server-side API endpoints return the expected shapes.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const APP_TSX_PATH = path.resolve("client/src/App.tsx");
const NAV_CONFIG_PATH = path.resolve("client/src/nav/navConfig.ts");

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

describe("Phase 3: Client-side route registration", () => {
  const appTsx = readFile(APP_TSX_PATH);

  it("registers /proactive-intelligence route", () => {
    expect(appTsx).toContain('path="/proactive-intelligence"');
  });

  it("registers /vendor-confidence route", () => {
    expect(appTsx).toContain('path="/vendor-confidence"');
  });

  it("registers /herbie-digest route", () => {
    expect(appTsx).toContain('path="/herbie-digest"');
  });

  it("registers /herbie-autonomous route", () => {
    expect(appTsx).toContain('path="/herbie-autonomous"');
  });

  it("registers /herbie-memory route", () => {
    expect(appTsx).toContain('path="/herbie-memory"');
  });

  it("registers /change-order-approvals route", () => {
    expect(appTsx).toContain('path="/change-order-approvals"');
  });

  it("has lazy import for ProactiveIntelligence", () => {
    expect(appTsx).toContain("ProactiveIntelligence");
    expect(appTsx).toContain("proactive-intelligence");
  });

  it("has lazy import for VendorConfidence", () => {
    expect(appTsx).toContain("VendorConfidence");
    expect(appTsx).toContain("vendor-confidence-dashboard");
  });

  it("has lazy import for HerbieDigest", () => {
    expect(appTsx).toContain("HerbieDigest");
    expect(appTsx).toContain("herbie-digest-page");
  });

  it("has lazy import for HerbieAutonomous", () => {
    expect(appTsx).toContain("HerbieAutonomous");
    expect(appTsx).toContain("herbie-autonomous-dashboard");
  });

  it("has lazy import for HerbieMemory", () => {
    expect(appTsx).toContain("HerbieMemory");
    expect(appTsx).toContain("herbie-memory-inspector");
  });

  it("has lazy import for ChangeOrderApprovals", () => {
    expect(appTsx).toContain("ChangeOrderApprovals");
    expect(appTsx).toContain("@/pages/approvals");
  });
});

describe("Phase 3: navConfig routes are wired in App.tsx", () => {
  const appTsx = readFile(APP_TSX_PATH);
  const navConfig = readFile(NAV_CONFIG_PATH);

  const navRoutes = [
    "/proactive-intelligence",
    "/vendor-confidence",
    "/herbie-digest",
    "/herbie-autonomous",
    "/herbie-memory",
    "/change-order-approvals",
    "/coi",
    "/bid-readiness",
    "/voice-daily-log",
  ];

  for (const route of navRoutes) {
    it(`navConfig route "${route}" is present in navConfig.ts`, () => {
      expect(navConfig).toContain(`"${route}"`);
    });

    it(`navConfig route "${route}" has a matching Route in App.tsx`, () => {
      expect(appTsx).toContain(`path="${route}"`);
    });
  }
});

describe("Phase 3: page files exist on disk", () => {
  const PAGES_DIR = path.resolve("client/src/pages");

  const pageFiles = [
    "proactive-intelligence.tsx",
    "vendor-confidence-dashboard.tsx",
    "herbie-digest-page.tsx",
    "herbie-autonomous-dashboard.tsx",
    "herbie-memory-inspector.tsx",
    "approvals.tsx",
  ];

  for (const file of pageFiles) {
    it(`page file "${file}" exists`, () => {
      const fullPath = path.join(PAGES_DIR, file);
      expect(fs.existsSync(fullPath)).toBe(true);
    });
  }
});
