// Roadmap Feature 6 — HERBIE.md identity loader.
//
// HERBIE.md is the immutable "identity memory" layer Herbie loads
// into the system prompt on every LLM call. Centralizing the load
// here means every Herbie surface (orchestrator, brief, chat,
// drafting, etc.) sees the same voice and rules without copy-paste
// drift.
//
// The file is small (~8KB) and changes rarely. We read it once on
// first access and cache it in-process. A second call returns from
// cache unless the underlying file mtime has changed — useful in
// dev (HMR won't rebuild this) and harmless in prod.

import * as fs from "fs";
import * as path from "path";

const HERBIE_MD_PATH = path.resolve(
  process.cwd(),
  "..",
  "..",
  "HERBIE.md",
);

interface CacheEntry {
  text: string;
  mtimeMs: number;
  bytes: number;
}
let cache: CacheEntry | null = null;

/**
 * Returns the verbatim contents of HERBIE.md as a string, suitable
 * for prepending to the system prompt of any Herbie LLM call.
 * Throws if the file is missing — callers should not swallow this;
 * HERBIE.md is load-bearing for Herbie's voice and refusal rules.
 */
export function getHerbieIdentityPrompt(): string {
  const stat = fs.statSync(HERBIE_MD_PATH);
  if (cache && cache.mtimeMs === stat.mtimeMs && cache.bytes === stat.size) {
    return cache.text;
  }
  const text = fs.readFileSync(HERBIE_MD_PATH, "utf-8");
  cache = { text, mtimeMs: stat.mtimeMs, bytes: stat.size };
  return text;
}

/**
 * Assembles a complete Herbie system prompt from the identity layer
 * plus optional project memory / conversational context per
 * HERBIE.md's "System-prompt assembly" rules.
 *
 * Callers that have project facts, decisions, or relationships
 * available should pass them in — they become the "project memory
 * block" slot below the identity text.
 */
export function buildHerbieSystemPrompt(opts: {
  projectMemoryBlock?: string;
  userPreferencesBlock?: string;
  extraNotes?: string;
} = {}): string {
  const identity = getHerbieIdentityPrompt();
  const parts: string[] = [identity];
  if (opts.projectMemoryBlock && opts.projectMemoryBlock.trim().length > 0) {
    parts.push("\n\n---\n\n[Project Memory]\n" + opts.projectMemoryBlock);
  }
  if (opts.userPreferencesBlock && opts.userPreferencesBlock.trim().length > 0) {
    parts.push("\n\n---\n\n[User Preferences]\n" + opts.userPreferencesBlock);
  }
  if (opts.extraNotes && opts.extraNotes.trim().length > 0) {
    parts.push("\n\n---\n\n" + opts.extraNotes);
  }
  return parts.join("");
}

/**
 * Test-only helper: reset the in-memory cache. Not for production use.
 */
export function __resetHerbieIdentityCache(): void {
  cache = null;
}
