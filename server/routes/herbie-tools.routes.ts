import { Router, Request, Response } from "express";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const router = Router();

const ALLOW_PATHS = ["client/src", "server", "shared", "db", "scripts"];
const DENY_PATTERNS = [".env", "node_modules", "dist", ".git", ".key", ".pem", ".secret", "package-lock", "pnpm-lock"];
const ALLOWED_COMMANDS = [
  "npx tsc --noEmit",
  "npx eslint .",
  "npm test",
  "npm run build",
];
const MAX_FILE_SIZE = 2 * 1024 * 1024;
const LARGE_FILE_THRESHOLD = 200 * 1024;
const MAX_OUTPUT = 50 * 1024;
const CMD_TIMEOUT = 60_000;

function isAllowedPath(p: string): boolean {
  const normalized = path.normalize(p).replace(/\\/g, "/");
  if (normalized.includes("..")) return false;
  for (const deny of DENY_PATTERNS) {
    if (normalized.includes(deny)) return false;
  }
  return ALLOW_PATHS.some((a) => normalized.startsWith(a) || normalized === a);
}

function adminGuard(req: Request, res: Response, next: () => void) {
  const role = (req as any)?.user?.role;
  if (role && role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

router.use(adminGuard);

router.get("/tree", async (req: Request, res: Response) => {
  try {
    const dirPath = (req.query.path as string) || "client/src";
    if (!isAllowedPath(dirPath)) return res.status(403).json({ error: "Path not allowed" });

    const fullPath = path.resolve(process.cwd(), dirPath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "Path not found" });

    const entries: Array<{ name: string; type: string; size?: number }> = [];
    const items = fs.readdirSync(fullPath, { withFileTypes: true });
    for (const item of items) {
      if (DENY_PATTERNS.some((d) => item.name.includes(d))) continue;
      if (item.isDirectory()) {
        entries.push({ name: item.name, type: "dir" });
      } else {
        const stat = fs.statSync(path.join(fullPath, item.name));
        entries.push({ name: item.name, type: "file", size: stat.size });
      }
    }

    res.json({ path: dirPath, entries });
  } catch (error) {
    console.error("Herbie tools/tree error:", error);
    res.status(500).json({ error: "Failed to read directory" });
  }
});

router.get("/file", async (req: Request, res: Response) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).json({ error: "path required" });
    if (!isAllowedPath(filePath)) return res.status(403).json({ error: "Path not allowed" });

    const fullPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "File not found" });

    const stat = fs.statSync(fullPath);
    if (stat.size > MAX_FILE_SIZE) return res.status(413).json({ error: `File exceeds 2MB limit (${stat.size} bytes).` });

    const startLine = parseInt(req.query.startLine as string) || 0;
    const maxLines = Math.min(500, parseInt(req.query.maxLines as string) || 0);
    const isLargeFile = stat.size > LARGE_FILE_THRESHOLD;
    const wantsChunk = startLine > 0 || maxLines > 0;

    const raw = fs.readFileSync(fullPath, "utf-8");
    const allLines = raw.split("\n");

    if (wantsChunk) {
      const start = Math.max(1, startLine || 1);
      const count = maxLines || 150;
      const slice = allLines.slice(start - 1, start - 1 + count);
      res.json({ path: filePath, content: slice.join("\n"), size: stat.size, lines: allLines.length, startLine: start, endLine: Math.min(start - 1 + count, allLines.length) });
    } else if (isLargeFile) {
      const count = 150;
      const slice = allLines.slice(0, count);
      const outlineLines: string[] = [];
      for (let i = 0; i < allLines.length; i++) {
        const trimmed = allLines[i].trimStart();
        if (trimmed.match(/^export\s+(const\s+\w+\s*=\s*pgTable|type\s+|interface\s+|enum\s+|(?:async\s+)?function\s+|const\s+\w+\s*=\s*(?:createInsertSchema|createSelectSchema|z\.object|z\.enum))/)) {
          outlineLines.push(`L${i + 1}: ${allLines[i].trimStart().slice(0, 120)}`);
        }
      }
      res.json({ path: filePath, content: slice.join("\n"), size: stat.size, lines: allLines.length, startLine: 1, endLine: count, outline: outlineLines, hint: `Large file (${allLines.length} lines). Use startLine and maxLines query params to navigate.` });
    } else {
      res.json({ path: filePath, content: raw, size: stat.size, lines: allLines.length });
    }
  } catch (error) {
    console.error("Herbie tools/file error:", error);
    res.status(500).json({ error: "Failed to read file" });
  }
});

const SearchSchema = z.object({
  query: z.string().min(1).max(500),
  paths: z.array(z.string()).max(10).optional(),
  maxResults: z.number().int().min(1).max(100).default(50),
});

router.post("/search", async (req: Request, res: Response) => {
  try {
    const parsed = SearchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });

    const { query, paths, maxResults } = parsed.data;
    const searchPaths = (paths || ALLOW_PATHS).filter(isAllowedPath);
    if (searchPaths.length === 0) return res.status(403).json({ error: "No allowed paths" });

    const escapedQuery = query.replace(/'/g, "'\\''");
    const cmd = `rg --json -m ${maxResults} '${escapedQuery}' ${searchPaths.join(" ")} 2>/dev/null || true`;

    let output: string;
    try {
      output = execSync(cmd, { timeout: 10000, maxBuffer: MAX_OUTPUT, cwd: process.cwd() }).toString();
    } catch {
      output = "";
    }

    const matches: Array<{ file: string; line: number; content: string }> = [];
    for (const line of output.split("\n")) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === "match" && parsed.data) {
          matches.push({
            file: parsed.data.path?.text || "",
            line: parsed.data.line_number || 0,
            content: parsed.data.lines?.text?.trim() || "",
          });
        }
      } catch {}
    }

    res.json({ query, matches: matches.slice(0, maxResults), total: matches.length });
  } catch (error) {
    console.error("Herbie tools/search error:", error);
    res.status(500).json({ error: "Failed to search" });
  }
});

const PatchSchema = z.object({
  filePath: z.string().min(1).max(500),
  oldContent: z.string().max(50000),
  newContent: z.string().max(50000),
  dryRun: z.boolean().default(true),
});

router.post("/patch", async (req: Request, res: Response) => {
  try {
    const parsed = PatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });

    const { filePath, oldContent, newContent, dryRun } = parsed.data;
    if (!isAllowedPath(filePath)) return res.status(403).json({ error: "Path not allowed" });

    const fullPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "File not found" });

    const currentContent = fs.readFileSync(fullPath, "utf-8");
    if (!currentContent.includes(oldContent)) {
      return res.status(400).json({ error: "Old content not found in file" });
    }

    const patched = currentContent.replace(oldContent, newContent);

    if (dryRun) {
      return res.json({
        dryRun: true,
        wouldChange: [filePath],
        preview: { before: oldContent.slice(0, 500), after: newContent.slice(0, 500) },
      });
    }

    const backupPath = `${fullPath}.bak.${Date.now()}`;
    fs.writeFileSync(backupPath, currentContent);
    fs.writeFileSync(fullPath, patched);

    res.json({
      dryRun: false,
      changed: [filePath],
      backup: backupPath,
      stats: { linesAdded: newContent.split("\n").length, linesRemoved: oldContent.split("\n").length },
    });
  } catch (error) {
    console.error("Herbie tools/patch error:", error);
    res.status(500).json({ error: "Failed to apply patch" });
  }
});

const RunSchema = z.object({
  command: z.string().min(1).max(200),
});

router.post("/run", async (req: Request, res: Response) => {
  try {
    const parsed = RunSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });

    const { command } = parsed.data;
    const isAllowed = ALLOWED_COMMANDS.some((ac) => command.startsWith(ac));
    if (!isAllowed) {
      return res.status(403).json({ error: "Command not allowed", allowed: ALLOWED_COMMANDS });
    }

    const start = Date.now();
    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    try {
      stdout = execSync(command, {
        timeout: CMD_TIMEOUT,
        maxBuffer: MAX_OUTPUT,
        cwd: process.cwd(),
        encoding: "utf-8",
      });
    } catch (err: any) {
      exitCode = err.status || 1;
      stdout = err.stdout?.toString() || "";
      stderr = err.stderr?.toString() || "";
    }

    res.json({
      command,
      exitCode,
      stdout: stdout.slice(0, MAX_OUTPUT),
      stderr: stderr.slice(0, MAX_OUTPUT),
      durationMs: Date.now() - start,
    });
  } catch (error) {
    console.error("Herbie tools/run error:", error);
    res.status(500).json({ error: "Failed to run command" });
  }
});

import { listChangeSets, getChangeSet, rollbackChangeSet } from "../services/herbie-changeset.service";
import { runAgent } from "../services/herbie-agent.service";

router.get("/changesets", async (_req: Request, res: Response) => {
  try {
    res.json(listChangeSets());
  } catch (error) {
    res.status(500).json({ error: "Failed to list change sets" });
  }
});

router.get("/changesets/:id", async (req: Request, res: Response) => {
  try {
    const cs = getChangeSet(req.params.id);
    if (!cs) return res.status(404).json({ error: "Change set not found" });
    res.json(cs);
  } catch (error) {
    res.status(500).json({ error: "Failed to get change set" });
  }
});

router.post("/changesets/:id/rollback", async (req: Request, res: Response) => {
  try {
    const result = rollbackChangeSet(req.params.id);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to rollback" });
  }
});

const AgentRunSchema = z.object({
  goal: z.string().min(1).max(2000),
  constraints: z.array(z.string()).max(10).default([]),
  maxIterations: z.number().int().min(1).max(10).default(5),
  safeMode: z.boolean().default(true),
  focusPaths: z.array(z.string()).max(20).optional(),
});

router.post("/agent/run", async (req: Request, res: Response) => {
  try {
    const parsed = AgentRunSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });

    const tenantId = (req as any)?.user?.tenantId || "blackhawk-default";
    const userId = (req as any)?.user?.id || "system";

    const result = await runAgent({
      ...parsed.data,
      tenantId,
      userId,
    });

    res.json(result);
  } catch (error) {
    console.error("Herbie agent/run error:", error);
    res.status(500).json({ error: "Failed to run agent" });
  }
});

export const herbieToolsRouter = router;
