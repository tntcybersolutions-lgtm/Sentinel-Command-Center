import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * Phase H regression: every route declared in navConfig.ts must be
 * covered by at least one <Route path=...> pattern in App.tsx, otherwise
 * clicking that nav item in the sidebar will fall through to the 404
 * NotFound component.
 *
 * This test reads both files as text and does a pattern-aware match
 * (wouter :param segments are treated as wildcards). It does NOT
 * import App.tsx (which would pull in the entire client tree under
 * vitest's node environment).
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const NAV_CONFIG = path.join(REPO_ROOT, "client", "src", "nav", "navConfig.ts");
const APP_TSX = path.join(REPO_ROOT, "client", "src", "App.tsx");

function extractNavRoutes(): string[] {
  const src = readFileSync(NAV_CONFIG, "utf8");
  const routes = [...src.matchAll(/route:\s*"([^"]+)"/g)].map((m) => m[1]);
  return [...new Set(routes)];
}

function extractAppRoutePatterns(): string[] {
  const src = readFileSync(APP_TSX, "utf8");
  const patterns = [
    ...src.matchAll(/<Route\s+path=["`']([^"`']+)["`']/g),
  ].map((m) => m[1]);
  return [...new Set(patterns)];
}

function patternToRegex(pattern: string): RegExp {
  // Wouter :param → one path segment. Escape slashes.
  const re = pattern
    .replace(/:[^/]+/g, "[^/]+")
    .replace(/\//g, "\\/");
  return new RegExp("^" + re + "$");
}

function matches(navRoute: string, appPattern: string): boolean {
  if (navRoute === appPattern) return true;
  return patternToRegex(appPattern).test(navRoute);
}

describe("navConfig → App.tsx route coverage", () => {
  const navRoutes = extractNavRoutes();
  const appPatterns = extractAppRoutePatterns();

  it("extracts a non-empty set of nav routes", () => {
    expect(navRoutes.length).toBeGreaterThan(0);
  });

  it("extracts a non-empty set of App.tsx route patterns", () => {
    expect(appPatterns.length).toBeGreaterThan(0);
  });

  it("matches every nav route to at least one App.tsx <Route> pattern (no 404s)", () => {
    const missing = navRoutes.filter(
      (r) => !appPatterns.some((p) => matches(r, p)),
    );
    expect(
      missing,
      `These nav routes have no matching <Route> in App.tsx (would 404): ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("covers all 44 known navConfig routes", () => {
    // Snapshot the count so adding/removing nav items is a deliberate change.
    expect(navRoutes.length).toBe(44);
  });
});
