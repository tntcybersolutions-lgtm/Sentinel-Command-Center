import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { createChangeSet, addDiff } from "./herbie-changeset.service";
import type { HerbieAgentIteration, HerbieAgentResult } from "@shared/schema";

const ALLOW_PATHS = ["client/src", "server", "shared", "db", "scripts"];
const DENY_PATTERNS = [".env", "node_modules", "dist", ".git", ".key", ".pem"];
const MAX_FILE_SIZE = 200 * 1024;
const activeTenantRuns = new Set<string>();

function isAllowedPath(p: string): boolean {
  const normalized = path.normalize(p).replace(/\\/g, "/");
  if (normalized.includes("..")) return false;
  for (const deny of DENY_PATTERNS) {
    if (normalized.includes(deny)) return false;
  }
  return ALLOW_PATHS.some((a) => normalized.startsWith(a) || normalized === a);
}

function readTree(dirPath: string, depth = 0, maxDepth = 2): string[] {
  if (depth > maxDepth) return [];
  const fullPath = path.resolve(process.cwd(), dirPath);
  if (!fs.existsSync(fullPath)) return [];
  const entries: string[] = [];
  try {
    const items = fs.readdirSync(fullPath, { withFileTypes: true });
    for (const item of items) {
      if (DENY_PATTERNS.some((d) => item.name.includes(d))) continue;
      const rel = `${dirPath}/${item.name}`;
      if (item.isDirectory()) {
        entries.push(`${rel}/`);
        entries.push(...readTree(rel, depth + 1, maxDepth));
      } else {
        entries.push(rel);
      }
    }
  } catch {}
  return entries;
}

function readFileContent(filePath: string): string | null {
  if (!isAllowedPath(filePath)) return null;
  const fullPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) return null;
  const stat = fs.statSync(fullPath);
  if (stat.size > MAX_FILE_SIZE) return `[File too large: ${stat.size} bytes]`;
  return fs.readFileSync(fullPath, "utf-8");
}

function runTypecheck(): { exitCode: number; output: string } {
  try {
    const output = execSync("npx tsc --noEmit 2>&1", {
      timeout: 60000,
      maxBuffer: 50 * 1024,
      cwd: process.cwd(),
      encoding: "utf-8",
    });
    return { exitCode: 0, output: output.slice(0, 10000) };
  } catch (err: any) {
    return {
      exitCode: err.status || 1,
      output: (err.stdout?.toString() || err.stderr?.toString() || "").slice(0, 10000),
    };
  }
}

function applyPatch(filePath: string, oldContent: string, newContent: string): boolean {
  if (!isAllowedPath(filePath)) return false;
  const fullPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) return false;
  const current = fs.readFileSync(fullPath, "utf-8");
  if (!current.includes(oldContent)) return false;
  const backupPath = `${fullPath}.bak.${Date.now()}`;
  fs.writeFileSync(backupPath, current);
  fs.writeFileSync(fullPath, current.replace(oldContent, newContent));
  return true;
}

export async function runAgent(args: {
  goal: string;
  constraints: string[];
  maxIterations: number;
  safeMode: boolean;
  focusPaths?: string[];
  tenantId: string;
  userId: string;
}): Promise<HerbieAgentResult> {
  const { goal, constraints, maxIterations, safeMode, focusPaths, tenantId, userId } = args;

  if (activeTenantRuns.has(tenantId)) {
    return { plan: "Another agent run is already active for this tenant.", iterations: [], done: false };
  }

  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const relevantFiles = (focusPaths || ALLOW_PATHS).filter(isAllowedPath);
    const tree = relevantFiles.flatMap((p) => readTree(p, 0, 1)).slice(0, 50);
    return {
      plan: `Manual implementation required for: ${goal}\n\nRelevant files:\n${tree.join("\n")}`,
      iterations: [],
      done: false,
    };
  }

  activeTenantRuns.add(tenantId);

  try {
    const openai = new OpenAI({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    const relevantPaths = (focusPaths || ALLOW_PATHS).filter(isAllowedPath);
    const tree = relevantPaths.flatMap((p) => readTree(p, 0, 1)).slice(0, 100);

    const fileContents: Record<string, string> = {};
    const keyFiles = tree.filter((f) => !f.endsWith("/")).slice(0, 10);
    for (const f of keyFiles) {
      const content = readFileContent(f);
      if (content && content.length < 5000) {
        fileContents[f] = content;
      }
    }

    const planPrompt =
      `You are an autonomous code agent. Given a goal, generate a step-by-step plan.\n` +
      `Goal: ${goal}\n` +
      `Constraints: ${constraints.join(", ") || "none"}\n` +
      `Available files:\n${tree.join("\n")}\n` +
      `Key file contents:\n${Object.entries(fileContents).map(([k, v]) => `--- ${k} ---\n${v.slice(0, 2000)}`).join("\n")}\n` +
      `Return ONLY strict JSON: { "plan": "string describing overall plan", "steps": [{ "description": "what to do", "filePath": "path to modify", "oldContent": "exact text to find", "newContent": "replacement text" }] }.\n` +
      `Max ${maxIterations} steps. Only modify files in: ${ALLOW_PATHS.join(", ")}.\n`;

    const planResp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: planPrompt }],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const planContent = planResp.choices[0]?.message?.content ?? "{}";
    let planJson: any;
    try { planJson = JSON.parse(planContent); } catch { planJson = { plan: "Failed to parse plan", steps: [] }; }

    const plan = typeof planJson.plan === "string" ? planJson.plan : "No plan generated";
    const steps = Array.isArray(planJson.steps) ? planJson.steps.slice(0, maxIterations) : [];

    if (steps.length === 0) {
      return { plan, iterations: [], done: false };
    }

    const changeSetId = createChangeSet(goal, plan, userId);
    const iterations: HerbieAgentIteration[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const filePath = step.filePath || "";
      const oldContent = step.oldContent || "";
      const newContent = step.newContent || "";

      const diffStr = `--- ${filePath}\n-${oldContent.slice(0, 200)}\n+${newContent.slice(0, 200)}`;

      if (safeMode) {
        iterations.push({
          step: i + 1,
          diff: diffStr,
          applied: false,
          typecheck: { exitCode: -1, output: "Safe mode: patch not applied" },
          notes: `${step.description || "Step"} (safe mode - awaiting approval)`,
        });
        continue;
      }

      const applied = applyPatch(filePath, oldContent, newContent);
      if (applied) {
        addDiff(changeSetId, filePath, oldContent, newContent);
      }

      const typecheck = applied ? runTypecheck() : { exitCode: -1, output: "Patch not applied" };

      iterations.push({
        step: i + 1,
        diff: diffStr,
        applied,
        typecheck,
        notes: applied
          ? typecheck.exitCode === 0
            ? "Applied and passes typecheck"
            : `Applied but typecheck failed: ${typecheck.output.slice(0, 500)}`
          : "Failed to apply patch (content not found)",
      });

      if (applied && typecheck.exitCode !== 0 && i < steps.length - 1) {
        iterations[iterations.length - 1].notes += " — will attempt fix in next iteration";
      }
    }

    const allApplied = iterations.every((it) => it.applied || safeMode);
    const allTypecheckPass = iterations.filter((it) => it.applied).every((it) => it.typecheck.exitCode === 0);

    return {
      plan,
      iterations,
      done: !safeMode && allApplied && allTypecheckPass,
      changeSetId,
    };
  } finally {
    activeTenantRuns.delete(tenantId);
  }
}
