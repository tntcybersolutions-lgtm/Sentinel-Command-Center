#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const CLIENT_DIR = path.join(__dirname, "..", "client", "src");

const BANNED_PATTERNS = [
  { regex: /\bPlaceholder\b/, label: "Placeholder" },
  { regex: /\bTBD\b/, label: "TBD" },
  { regex: /\bExample\b/, label: "Example" },
  { regex: /\bmock\b/i, label: "mock" },
  { regex: /\bfake\b/i, label: "fake" },
  { regex: /"\(Copy\)"/, label: "(Copy)" },
  { regex: /\bLorem\b/, label: "Lorem" },
];

const IGNORE_LINE_PATTERNS = [
  /placeholder\s*[=:]/i,
  /placeholder\s*\?/i,
  /<\w+[^>]*placeholder=/i,
  /\.placeholder/i,
  /import.*from/,
  /no-placeholder-gate/,
  /\/\/.*gate/i,
  /mockServiceWorker/i,
  /isMock/i,
  /setMock/i,
  /useMock/i,
  /mockFn/i,
  /\.mock\(/,
  /jest\.mock/,
  /vi\.mock/,
  /example\./i,
  /for example/i,
  /ExampleComponent/i,
  // Opt-out marker for lines that legitimately contain banned words
  // (e.g. a regex literal whose source characters include "placeholder"
  // or a string in a copy test). Keep usage narrow and per-line.
  /no-placeholder-gate:\s*allow-line/i,
];

function scanFile(filePath) {
  const violations = [];
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const shouldSkip = IGNORE_LINE_PATTERNS.some(p => p.test(line));
    if (shouldSkip) continue;

    for (const { regex, label } of BANNED_PATTERNS) {
      if (regex.test(line)) {
        violations.push({
          file: filePath,
          line: i + 1,
          pattern: label,
          text: line.trim().substring(0, 120),
        });
      }
    }
  }
  return violations;
}

function scanDir(dir) {
  const violations = [];
  if (!fs.existsSync(dir)) return violations;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      violations.push(...scanDir(fullPath));
    } else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
      if (fullPath.includes("no-placeholder-gate")) continue;
      if (fullPath.includes(".test.") || fullPath.includes(".spec.")) continue;
      violations.push(...scanFile(fullPath));
    }
  }
  return violations;
}

const violations = scanDir(CLIENT_DIR);

if (violations.length > 0) {
  console.error("\n[NO-PLACEHOLDER GATE] FAILED\n");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} [${v.pattern}]`);
    console.error(`    ${v.text}\n`);
  }
  console.error(`Total violations: ${violations.length}`);
  console.error("Fix all violations before building or deploying.\n");
  process.exit(1);
} else {
  console.log("[NO-PLACEHOLDER GATE] PASSED");
}
