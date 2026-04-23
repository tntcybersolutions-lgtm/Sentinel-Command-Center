#!/usr/bin/env node
// Scans tracked files (via `git ls-files`) for common secret shapes.
// Fails the build when any are found. Narrow by design — high-signal
// patterns only, with a per-line opt-out marker for legitimate
// fixtures/examples/docs.
//
// Opt out a specific line with:   // no-secret-gate: allow-line
// (Works in any comment style; detection is substring-based.)

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");

// Files that never get scanned regardless of contents.
const SKIP_PATHS = [
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "server-files-export.tar.gz",
  "source-only.tar.gz",
];

// Only scan these extensions (plus a few explicit filenames below).
const SCANNED_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs",
  ".json", ".yaml", ".yml", ".toml", ".env",
  ".md", ".sh", ".bash",
]);

// Files without a recognized extension but worth scanning.
const SCANNED_EXPLICIT_FILENAMES = new Set([
  ".replit",
  ".env",
  "Dockerfile",
]);

// Patterns that define "this looks like a real secret." Each entry:
//   { regex, label }
// Keep high-signal — avoid generic hex strings that hit UUIDs or hashes.
const SECRET_PATTERNS = [
  // Generic *_SECRET assignments with a 20+ char high-entropy value.
  { regex: /\b[A-Z][A-Z0-9_]*_SECRET\s*[=:]\s*["']([A-Za-z0-9+/=_-]{20,})["']/, label: "*_SECRET assignment" },
  // Generic *_TOKEN / *_KEY assignments with a 24+ char value.
  { regex: /\b[A-Z][A-Z0-9_]*_(TOKEN|API_KEY|ACCESS_KEY)\s*[=:]\s*["']([A-Za-z0-9+/=_-]{24,})["']/, label: "*_TOKEN/*_API_KEY assignment" },
  // Private keys (PEM).
  { regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/, label: "PEM private key" },
  // AWS access key id.
  { regex: /\bAKIA[0-9A-Z]{16}\b/, label: "AWS access key id" },
  // Stripe live secret.
  { regex: /\bsk_live_[A-Za-z0-9]{24,}\b/, label: "Stripe live secret" },
  // Google API key.
  { regex: /\bAIza[0-9A-Za-z_-]{35}\b/, label: "Google API key" },
  // OpenAI keys (classic + project-scoped).
  { regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/, label: "OpenAI API key" },
  // Slack tokens.
  { regex: /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/, label: "Slack token" },
  // GitHub personal access tokens.
  { regex: /\bghp_[A-Za-z0-9]{36,}\b/, label: "GitHub PAT" },
];

// Opt-out markers: if any of these appear on the same line as a match,
// skip the violation. Keep this list narrow and explicit.
const OPT_OUT_MARKERS = [
  "no-secret-gate: allow-line",
];

// Comment-style context words that indicate a non-secret (docs, examples).
// Only applied when no uppercase *_SECRET / *_TOKEN token is on the line —
// we never let "example" comments excuse a real assignment.
const SAFE_CONTEXT_WORDS = [
  "example", "dummy", "placeholder", "fixture", "fake-for-docs",
];

function listTrackedFiles() {
  const out = execSync("git ls-files", { cwd: REPO_ROOT, encoding: "utf-8" });
  return out.split("\n").filter(Boolean);
}

function shouldScan(relPath) {
  const basename = path.basename(relPath);
  if (SKIP_PATHS.includes(relPath) || SKIP_PATHS.includes(basename)) return false;
  if (SCANNED_EXPLICIT_FILENAMES.has(basename)) return true;
  const ext = path.extname(basename).toLowerCase();
  return SCANNED_EXTENSIONS.has(ext);
}

function hasOptOut(line) {
  for (const marker of OPT_OUT_MARKERS) {
    if (line.includes(marker)) return true;
  }
  return false;
}

function looksLikeSafeContext(line, label) {
  // Never allow "example" to excuse a real *_SECRET / *_TOKEN assignment.
  if (label.includes("assignment")) return false;
  const lower = line.toLowerCase();
  return SAFE_CONTEXT_WORDS.some((w) => lower.includes(w));
}

function scanFile(relPath) {
  const violations = [];
  const fullPath = path.join(REPO_ROOT, relPath);
  let content;
  try {
    content = fs.readFileSync(fullPath, "utf-8");
  } catch {
    return violations;
  }
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (hasOptOut(line)) continue;
    for (const { regex, label } of SECRET_PATTERNS) {
      if (regex.test(line)) {
        if (looksLikeSafeContext(line, label)) continue;
        violations.push({
          file: relPath,
          line: i + 1,
          label,
          text: line.trim().substring(0, 160),
        });
      }
    }
  }
  return violations;
}

const files = listTrackedFiles().filter(shouldScan);
const violations = [];
for (const f of files) {
  violations.push(...scanFile(f));
}

if (violations.length > 0) {
  console.error("\n[SECRET-SCAN GATE] FAILED\n");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} [${v.label}]`);
    console.error(`    ${v.text}\n`);
  }
  console.error(`Total violations: ${violations.length}`);
  console.error("Remove the secret, rotate it at the provider, and move the value to Replit Secrets (or a gitignored .env).");
  console.error("For legitimate non-secret matches, append the per-line marker: // no-secret-gate: allow-line\n");
  process.exit(1);
} else {
  console.log(`[SECRET-SCAN GATE] PASSED (${files.length} files scanned)`);
}
