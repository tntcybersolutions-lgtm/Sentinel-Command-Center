import { describe, it, expect, beforeEach } from "vitest";
import {
  getHerbieIdentityPrompt,
  buildHerbieSystemPrompt,
  __resetHerbieIdentityCache,
} from "../herbie-identity.service";

beforeEach(() => {
  __resetHerbieIdentityCache();
});

describe("herbie-identity.service — getHerbieIdentityPrompt", () => {
  it("returns HERBIE.md's content, non-empty", () => {
    const text = getHerbieIdentityPrompt();
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(100);
  });

  it("includes load-bearing sections from HERBIE.md", () => {
    const text = getHerbieIdentityPrompt();
    // Anchor tests to section titles that are also part of the
    // user-visible behavior contract — if these disappear we want
    // to hear about it.
    expect(text).toContain("Who Herbie Is");
    expect(text).toContain("Memory Architecture");
    expect(text).toContain("Refusal & Escalation Rules");
    expect(text).toContain("North Star");
  });

  it("caches the read across repeated calls", () => {
    const a = getHerbieIdentityPrompt();
    const b = getHerbieIdentityPrompt();
    // Same string instance from cache.
    expect(a === b).toBe(true);
  });
});

describe("herbie-identity.service — buildHerbieSystemPrompt", () => {
  it("returns just the identity when no extra blocks given", () => {
    const identity = getHerbieIdentityPrompt();
    const prompt = buildHerbieSystemPrompt();
    expect(prompt).toBe(identity);
  });

  it("appends a project-memory block under a separator", () => {
    const prompt = buildHerbieSystemPrompt({
      projectMemoryBlock: "Fact: GC for Maple Street is Bergman Construction.",
    });
    expect(prompt).toContain("[Project Memory]");
    expect(prompt).toContain("Bergman Construction");
    // Identity layer still comes first.
    expect(prompt.indexOf("Who Herbie Is")).toBeLessThan(
      prompt.indexOf("[Project Memory]"),
    );
  });

  it("appends a preferences block when given", () => {
    const prompt = buildHerbieSystemPrompt({
      userPreferencesBlock: "tone=terse, role=pm",
    });
    expect(prompt).toContain("[User Preferences]");
    expect(prompt).toContain("tone=terse");
  });

  it("ignores empty / whitespace-only blocks", () => {
    const prompt = buildHerbieSystemPrompt({
      projectMemoryBlock: "   ",
      userPreferencesBlock: "",
      extraNotes: "\n\n",
    });
    expect(prompt).toBe(getHerbieIdentityPrompt());
  });
});
