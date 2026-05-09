import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { db } from "../db";
import { opportunities, bidProjects, approvalRequests, calendarEvents, notifications, auditEvents } from "@shared/schema";
import { eq, and, gte, lte, desc, count, isNull, ilike, sql } from "drizzle-orm";

import { getLLMProvider } from "../services/llm";
import type { LLMMessage, LLMContentBlock, LLMToolSpec } from "../services/llm";
import { composeDomain } from "../services/herbie-domains/construction";
import { approvalService } from "../services/approval.service";
import { scoringService } from "../services/scoring.service";
import { bidService } from "../services/bid.service";
import { commsService } from "../services/comms.service";
import { digestService } from "../services/digest.service";
import { auditService } from "../services/audit.service";

const DEFAULT_TENANT_ID = "blackhawk-default";

const CODE_ALLOW_PATHS = ["client/src", "server", "shared", "db", "scripts"];
const CODE_DENY_PATTERNS = [".env", "node_modules", "dist", ".git", ".key", ".pem", ".secret", "package-lock", "pnpm-lock"];
const CODE_MAX_FILE_SIZE = 2 * 1024 * 1024;
const CODE_LARGE_FILE_THRESHOLD = 200 * 1024;
const CODE_MAX_OUTPUT = 50 * 1024;

function generateFileOutline(allLines: string[], sizeBytes: number): { tables: Array<{name: string; line: number}>; types: Array<{name: string; kind: string; line: number}>; functions: Array<{name: string; line: number}>; schemas: Array<{name: string; line: number}>; summary: string } {
  const tables: Array<{name: string; line: number}> = [];
  const types: Array<{name: string; kind: string; line: number}> = [];
  const functions: Array<{name: string; line: number}> = [];
  const schemas: Array<{name: string; line: number}> = [];

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const trimmed = line.trimStart();

    const pgTableMatch = trimmed.match(/^export\s+const\s+(\w+)\s*=\s*pgTable\s*\(/);
    if (pgTableMatch) { tables.push({ name: pgTableMatch[1], line: i + 1 }); continue; }

    const typeMatch = trimmed.match(/^export\s+(type|interface|enum)\s+(\w+)/);
    if (typeMatch) { types.push({ name: typeMatch[2], kind: typeMatch[1], line: i + 1 }); continue; }

    const fnMatch = trimmed.match(/^export\s+(?:async\s+)?function\s+(\w+)/);
    if (fnMatch) { functions.push({ name: fnMatch[1], line: i + 1 }); continue; }

    const schemaMatch = trimmed.match(/^export\s+const\s+(\w+)\s*=\s*(?:createInsertSchema|createSelectSchema|z\.object|z\.enum)/);
    if (schemaMatch) { schemas.push({ name: schemaMatch[1], line: i + 1 }); continue; }

    if (!fnMatch) {
      const constFnMatch = trimmed.match(/^export\s+const\s+(\w+)\s*=\s*(?:async\s+)?\(/);
      if (constFnMatch) { functions.push({ name: constFnMatch[1], line: i + 1 }); }
    }
  }

  const parts: string[] = [`File: ${allLines.length} lines, ${Math.round(sizeBytes / 1024)}KB`];
  if (tables.length > 0) parts.push(`\nTABLES (${tables.length}):\n${tables.map(t => `  L${t.line}: ${t.name}`).join("\n")}`);
  if (types.length > 0) parts.push(`\nTYPES/INTERFACES/ENUMS (${types.length}):\n${types.map(t => `  L${t.line}: ${t.kind} ${t.name}`).join("\n")}`);
  if (functions.length > 0) parts.push(`\nFUNCTIONS (${functions.length}):\n${functions.map(f => `  L${f.line}: ${f.name}`).join("\n")}`);
  if (schemas.length > 0) parts.push(`\nSCHEMAS (${schemas.length}):\n${schemas.map(s => `  L${s.line}: ${s.name}`).join("\n")}`);

  return { tables, types, functions, schemas, summary: parts.join("\n") };
}

function isCodePathAllowed(p: string): boolean {
  const normalized = path.normalize(p).replace(/\\/g, "/");
  if (normalized.includes("..")) return false;
  for (const deny of CODE_DENY_PATTERNS) {
    if (normalized.includes(deny)) return false;
  }
  return CODE_ALLOW_PATHS.some((a) => normalized.startsWith(a) || normalized === a);
}

export interface AgentToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

const HERBIE_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "search_opportunities",
      description: "Search federal contracting opportunities from SAM.gov. Use for finding opportunities by keyword, NAICS code, status, or date range.",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Search keyword (title, description)" },
          naicsCode: { type: "string", description: "NAICS code filter" },
          status: { type: "string", enum: ["active", "scored", "tracking", "dismissed"], description: "Opportunity status" },
          limit: { type: "number", description: "Max results to return (default 10)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_opportunity_details",
      description: "Get detailed information about a specific opportunity including scoring, timeline, and related documents.",
      parameters: {
        type: "object",
        properties: {
          opportunityId: { type: "string", description: "The opportunity ID to retrieve" },
        },
        required: ["opportunityId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_bid_pipeline",
      description: "Get current bid projects in the pipeline with their status, deadlines, and tasks.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["draft", "active", "submitted", "won", "lost"], description: "Filter by status" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_pending_approvals",
      description: "Get list of pending approval requests that need manager review.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_upcoming_deadlines",
      description: "Get upcoming deadlines including bid due dates, site visits, and meetings.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Number of days ahead to look (default 7)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_daily_briefing",
      description: "Generate a daily executive briefing with key metrics, alerts, and recommended actions.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "score_opportunity",
      description: "Request AI-powered scoring of an opportunity against BlackHawk's fit profile. Requires opportunity ID.",
      parameters: {
        type: "object",
        properties: {
          opportunityId: { type: "string", description: "The opportunity ID to score" },
        },
        required: ["opportunityId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_bid_project",
      description: "Initiate a new bid project for an opportunity. This starts the bid workflow.",
      parameters: {
        type: "object",
        properties: {
          opportunityId: { type: "string", description: "The opportunity ID to create a bid for" },
          ownerUserId: { type: "string", description: "User ID of the bid owner" },
        },
        required: ["opportunityId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "schedule_meeting",
      description: "Request scheduling a meeting or event. Requires approval for external calendar actions.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Meeting title" },
          startAt: { type: "string", description: "Start time in ISO format" },
          endAt: { type: "string", description: "End time in ISO format" },
          eventType: { type: "string", enum: ["internal", "client", "site_visit", "deadline"], description: "Type of event" },
          description: { type: "string", description: "Meeting description" },
        },
        required: ["title", "startAt", "eventType"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "draft_email",
      description: "Draft an email message. Sending requires approval.",
      parameters: {
        type: "object",
        properties: {
          subject: { type: "string", description: "Email subject" },
          body: { type: "string", description: "Email body in HTML format" },
          entityType: { type: "string", description: "Related entity type (e.g., opportunity, bid_project)" },
          entityId: { type: "string", description: "Related entity ID" },
        },
        required: ["subject", "body"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_exceptions",
      description: "Get current exception report showing items needing attention (overdue tasks, stalled bids, etc.).",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_audit_history",
      description: "Get audit trail for a specific entity showing all actions and changes.",
      parameters: {
        type: "object",
        properties: {
          entityType: { type: "string", description: "Entity type (opportunity, bid_project, approval_request)" },
          entityId: { type: "string", description: "Entity ID" },
        },
        required: ["entityType", "entityId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_code_file",
      description: "Read ANY project source file up to 2MB — never fails on file size. For large files (>200KB like shared/schema.ts), automatically returns a full structural outline (all tables, types, functions, schemas with line numbers) plus the first 150 lines. Use startLine/maxLines to navigate to specific sections after seeing the outline.",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Relative path to the file, e.g. 'client/src/pages/home-assistant.tsx' or 'server/routes.ts' or 'shared/schema.ts'" },
          startLine: { type: "number", description: "Line number to start reading from (1-indexed). Use to jump to a specific section after seeing the outline." },
          maxLines: { type: "number", description: "Number of lines to return (default 150 for large files, 200 for small files, max 500)." },
        },
        required: ["filePath"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_codebase",
      description: "Search for a pattern or string across the project source code using ripgrep. Returns matching file paths, line numbers, and content. Great for finding where something is defined, used, or imported.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search pattern (supports regex). E.g. 'fetchDashboardCommandData', 'TODO', 'import.*openai'" },
          fileGlob: { type: "string", description: "Optional file glob filter. E.g. '*.tsx', '*.ts', '*.css'" },
          maxResults: { type: "number", description: "Max results to return (default 30, max 80)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_project_files",
      description: "List files and directories at a given path in the project. Use to explore project structure, find components, or see what files exist. Allowed directories: client/src, server, shared, db, scripts.",
      parameters: {
        type: "object",
        properties: {
          dirPath: { type: "string", description: "Directory path to list, e.g. 'client/src/pages', 'server/services', 'shared'" },
          recursive: { type: "boolean", description: "If true, list recursively up to 3 levels deep (default false)" },
        },
        required: ["dirPath"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_file_outline",
      description: "Get a complete structural map of ANY source file — every database table, type, interface, enum, function, and schema definition with exact line numbers. Use this FIRST on large files (like shared/schema.ts) to see the full structure, then use read_code_file with startLine to read specific sections. Works on files up to 2MB.",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Relative path to the file, e.g. 'shared/schema.ts' or 'server/routes.ts'" },
        },
        required: ["filePath"],
      },
    },
  },
];

async function executeToolCall(
  name: string,
  args: Record<string, any>
): Promise<AgentToolResult> {
  try {
    switch (name) {
      case "search_opportunities": {
        const conditions = [eq(opportunities.tenantId, DEFAULT_TENANT_ID)];
        
        if (args.keyword) {
          conditions.push(
            sql`(${opportunities.title} ILIKE ${'%' + args.keyword + '%'} OR ${opportunities.description} ILIKE ${'%' + args.keyword + '%'})`
          );
        }
        
        if (args.naicsCode) {
          conditions.push(sql`${args.naicsCode} = ANY(${opportunities.naicsCodes})`);
        }
        
        if (args.status) {
          conditions.push(eq(opportunities.status, args.status));
        }
        
        const results = await db.select()
          .from(opportunities)
          .where(and(...conditions))
          .orderBy(desc(opportunities.createdAt))
          .limit(args.limit || 10);
          
        await auditService.logEvent({
          tenantId: DEFAULT_TENANT_ID,
          eventType: "herbie_search_opportunities",
          actor: "HERBIE",
          entityType: "opportunity",
          entityId: "search",
          afterJson: { filters: args, resultCount: results.length },
        });
        
        return { success: true, data: results };
      }

      case "get_opportunity_details": {
        const [opp] = await db.select().from(opportunities).where(
          and(
            eq(opportunities.id, args.opportunityId),
            eq(opportunities.tenantId, DEFAULT_TENANT_ID)
          )
        );
        if (!opp) {
          return { success: false, error: "Opportunity not found" };
        }
        
        await auditService.logEvent({
          tenantId: DEFAULT_TENANT_ID,
          eventType: "herbie_view_opportunity",
          actor: "HERBIE",
          entityType: "opportunity",
          entityId: args.opportunityId,
        });
        
        return { success: true, data: opp };
      }

      case "get_bid_pipeline": {
        const projects = await bidService.getActiveBidProjects(DEFAULT_TENANT_ID);
        return { success: true, data: projects };
      }

      case "get_pending_approvals": {
        const approvals = await approvalService.getPendingApprovals(DEFAULT_TENANT_ID);
        return { success: true, data: approvals };
      }

      case "get_upcoming_deadlines": {
        const days = args.days || 7;
        const deadlines = await digestService.getDeadlineAlerts(DEFAULT_TENANT_ID, days);
        return { success: true, data: deadlines };
      }

      case "get_daily_briefing": {
        const digest = await digestService.generateExecutiveDigest(DEFAULT_TENANT_ID);
        return { success: true, data: digest };
      }

      case "score_opportunity": {
        const profiles = await scoringService.getActiveProfiles(DEFAULT_TENANT_ID);
        if (!profiles.length) {
          return { success: false, error: "No active scoring profiles configured" };
        }
        const result = await scoringService.scoreOpportunity(
          DEFAULT_TENANT_ID,
          args.opportunityId,
          profiles[0].id,
          profiles[0].id
        );
        return { success: true, data: result };
      }

      case "create_bid_project": {
        const projectId = await bidService.createBidProject({
          tenantId: DEFAULT_TENANT_ID,
          opportunityId: args.opportunityId,
          ownerUserId: args.ownerUserId || "system",
        });
        return { success: true, data: { projectId, message: "Bid project created successfully" } };
      }

      case "schedule_meeting": {
        const endAt = args.endAt 
          ? new Date(args.endAt)
          : new Date(new Date(args.startAt).getTime() + 60 * 60 * 1000);
        
        const result = await commsService.createCalendarEvent({
          tenantId: DEFAULT_TENANT_ID,
          title: args.title,
          description: args.description,
          startAt: new Date(args.startAt),
          endAt,
          eventType: args.eventType,
          createdBy: "HERBIE",
        });
        return { 
          success: true, 
          data: { 
            ...result, 
            message: result.approvalRequired 
              ? "Meeting scheduled - pending approval" 
              : "Meeting scheduled successfully" 
          } 
        };
      }

      case "draft_email": {
        const messageId = await commsService.createEmailDraft({
          tenantId: DEFAULT_TENANT_ID,
          subject: args.subject,
          bodyHtml: args.body,
          entityType: args.entityType,
          entityId: args.entityId,
          createdBy: "HERBIE",
        });
        return { success: true, data: { messageId, message: "Email draft created. Sending requires approval." } };
      }

      case "get_exceptions": {
        const exceptions = await digestService.getExceptionReport(DEFAULT_TENANT_ID);
        return { success: true, data: exceptions };
      }

      case "get_audit_history": {
        const history = await auditService.getEntityHistory(
          DEFAULT_TENANT_ID,
          args.entityType,
          args.entityId
        );
        return { success: true, data: history };
      }

      case "read_code_file": {
        const filePath = args.filePath;
        if (!filePath || !isCodePathAllowed(filePath)) {
          return { success: false, error: "File path not allowed. Allowed directories: client/src, server, shared, db, scripts" };
        }

        const fullPath = path.resolve(process.cwd(), filePath);
        if (!fs.existsSync(fullPath)) {
          return { success: false, error: `File not found: ${filePath}` };
        }

        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          return { success: false, error: `Path is a directory, not a file. Use list_project_files instead.` };
        }

        if (stat.size > CODE_MAX_FILE_SIZE) {
          return { success: false, error: `File exceeds 2MB limit (${Math.round(stat.size / 1024)}KB). This file cannot be read.` };
        }

        const raw = fs.readFileSync(fullPath, "utf-8");
        const allLines = raw.split("\n");
        const isLargeFile = stat.size > CODE_LARGE_FILE_THRESHOLD;
        const startLine = Math.max(1, args.startLine || 1);
        const maxLines = Math.min(500, args.maxLines || (isLargeFile ? 150 : 500));
        const slice = allLines.slice(startLine - 1, startLine - 1 + maxLines);

        let outlineData: ReturnType<typeof generateFileOutline> | undefined;
        if (isLargeFile && !args.startLine) {
          outlineData = generateFileOutline(allLines, stat.size);
        }

        await auditService.logEvent({
          tenantId: DEFAULT_TENANT_ID,
          eventType: "herbie_read_code",
          actor: "HERBIE",
          entityType: "code_file",
          entityId: filePath,
          afterJson: { startLine, maxLines, totalLines: allLines.length },
        });

        return {
          success: true,
          data: {
            path: filePath,
            totalLines: allLines.length,
            sizeKB: Math.round(stat.size / 1024),
            startLine,
            endLine: Math.min(startLine - 1 + maxLines, allLines.length),
            content: slice.map((line, i) => `${startLine + i}: ${line}`).join("\n"),
            ...(outlineData ? { outline: outlineData.summary, structure: { tables: outlineData.tables.length, types: outlineData.types.length, functions: outlineData.functions.length, schemas: outlineData.schemas.length } } : {}),
            ...(isLargeFile ? { hint: `Navigate with startLine/maxLines. Next chunk: startLine=${Math.min(startLine - 1 + maxLines + 1, allLines.length)}, maxLines=150` } : {}),
          },
        };
      }

      case "search_codebase": {
        const query = args.query;
        if (!query || query.length > 500) {
          return { success: false, error: "Query is required and must be under 500 characters" };
        }

        const maxResults = Math.min(80, args.maxResults || 30);
        const escapedQuery = query.replace(/'/g, "'\\''");
        const globFlag = args.fileGlob ? `--glob '${args.fileGlob}'` : "";
        const cmd = `rg --json -m ${maxResults} ${globFlag} '${escapedQuery}' ${CODE_ALLOW_PATHS.join(" ")} 2>/dev/null || true`;

        let output: string;
        try {
          output = execSync(cmd, { timeout: 15000, maxBuffer: CODE_MAX_OUTPUT, cwd: process.cwd() }).toString();
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
                content: (parsed.data.lines?.text || "").trim().slice(0, 200),
              });
            }
          } catch {}
        }

        await auditService.logEvent({
          tenantId: DEFAULT_TENANT_ID,
          eventType: "herbie_search_code",
          actor: "HERBIE",
          entityType: "codebase",
          entityId: "search",
          afterJson: { query, fileGlob: args.fileGlob, resultCount: matches.length },
        });

        return {
          success: true,
          data: {
            query,
            matches: matches.slice(0, maxResults),
            total: matches.length,
          },
        };
      }

      case "list_project_files": {
        const dirPath = args.dirPath;
        if (!dirPath || !isCodePathAllowed(dirPath)) {
          return { success: false, error: "Directory path not allowed. Allowed directories: client/src, server, shared, db, scripts" };
        }

        const fullDirPath = path.resolve(process.cwd(), dirPath);
        if (!fs.existsSync(fullDirPath)) {
          return { success: false, error: `Directory not found: ${dirPath}` };
        }

        const stat = fs.statSync(fullDirPath);
        if (!stat.isDirectory()) {
          return { success: false, error: `Path is a file, not a directory. Use read_code_file instead.` };
        }

        const entries: Array<{ name: string; type: string; size?: number; children?: any[] }> = [];

        function readDir(dir: string, depth: number): Array<{ name: string; type: string; size?: number; children?: any[] }> {
          const maxDepth = args.recursive ? 3 : 1;
          if (depth > maxDepth) return [];

          const result: Array<{ name: string; type: string; size?: number; children?: any[] }> = [];
          try {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
              if (CODE_DENY_PATTERNS.some((d) => item.name.includes(d))) continue;
              if (item.isDirectory()) {
                const entry: any = { name: item.name, type: "dir" };
                if (args.recursive && depth < maxDepth) {
                  entry.children = readDir(path.join(dir, item.name), depth + 1);
                }
                result.push(entry);
              } else {
                const fileStat = fs.statSync(path.join(dir, item.name));
                result.push({ name: item.name, type: "file", size: fileStat.size });
              }
            }
          } catch {}
          return result;
        }

        const listing = readDir(fullDirPath, 1);

        await auditService.logEvent({
          tenantId: DEFAULT_TENANT_ID,
          eventType: "herbie_list_files",
          actor: "HERBIE",
          entityType: "code_directory",
          entityId: dirPath,
          afterJson: { recursive: !!args.recursive, entryCount: listing.length },
        });

        return {
          success: true,
          data: {
            path: dirPath,
            entries: listing,
          },
        };
      }

      case "get_file_outline": {
        const filePath = args.filePath;
        if (!filePath || !isCodePathAllowed(filePath)) {
          return { success: false, error: "File path not allowed. Allowed directories: client/src, server, shared, db, scripts" };
        }

        const fullPath = path.resolve(process.cwd(), filePath);
        if (!fs.existsSync(fullPath)) {
          return { success: false, error: `File not found: ${filePath}` };
        }

        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          return { success: false, error: `Path is a directory. Use list_project_files instead.` };
        }
        if (stat.size > CODE_MAX_FILE_SIZE) {
          return { success: false, error: `File exceeds 2MB limit.` };
        }

        const raw = fs.readFileSync(fullPath, "utf-8");
        const allLines = raw.split("\n");
        const outline = generateFileOutline(allLines, stat.size);

        await auditService.logEvent({
          tenantId: DEFAULT_TENANT_ID,
          eventType: "herbie_file_outline",
          actor: "HERBIE",
          entityType: "code_file",
          entityId: filePath,
          afterJson: { totalLines: allLines.length, tables: outline.tables.length, types: outline.types.length, functions: outline.functions.length, schemas: outline.schemas.length },
        });

        return {
          success: true,
          data: {
            path: filePath,
            totalLines: allLines.length,
            sizeKB: Math.round(stat.size / 1024),
            tables: outline.tables,
            types: outline.types,
            functions: outline.functions,
            schemas: outline.schemas,
            summary: outline.summary,
          },
        };
      }

      default:
        return { success: false, error: `Unknown tool: ${name}` };
    }
  } catch (error) {
    console.error(`Tool execution error for ${name}:`, error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function processHerbieMessage(
  message: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<{ response: string; toolCalls?: Array<{ tool: string; result: any }> }> {
  // Domain composition: load role/trade/sector context for this tenant.
  // Failure here should NOT prevent Herbie from responding â fall back
  // to the base system prompt only.
  let domainPrompt = "";
  try {
    const composed = await composeDomain({
      userRole: null,
      primaryTrade: "trade.general-construction",
      projectSector: "sector.govt-public-works",
    });
    domainPrompt = composed.prompt;
  } catch (err) {
    console.error("[herbie] composeDomain failed; continuing without domain context:", err);
  }

  const baseSystemPrompt = `You are SENTINEL HERBIEâ¢, the AI office assistant for BlackHawk Construction's NOVA platform. You are an expert in federal construction contracting, bid management, construction operations, AND software development for this platform.

Your capabilities include:
- Searching and analyzing federal opportunities from SAM.gov, GSA, and DIBBS
- Scoring opportunities against BlackHawk's fit profile (NAICS codes, set-asides, geography, bonding capacity)
- Managing the bid pipeline and approval workflows
- Scheduling meetings and drafting communications
- Providing daily briefings and exception reports
- Tracking compliance requirements (CMMC, NIST 800-171)
- **Reading and searching the project source code** to help build new features, debug issues, and understand how things work
- **Browsing project file structure** to find components, services, routes, and schemas

CODEBASE TOOLS - When the user asks about code, building features, debugging, or how something works:
- Use get_file_outline FIRST on large files (like shared/schema.ts at 335KB) to see every table, type, function, and schema with line numbers
- Use read_code_file to read any source file - it handles files up to 2MB automatically. For large files, it returns a structural outline + first 150 lines. Use startLine to navigate to specific sections.
- Use search_codebase to find where functions, variables, types, or patterns are defined/used
- Use list_project_files to explore directory structure and find relevant files
- The project is a TypeScript monorepo: React frontend (client/src), Express backend (server), shared types (shared/schema.ts)
- Key directories: client/src/pages (page components), server/routes.ts (API endpoints), server/services (business logic), server/agents (AI agents), shared/schema.ts (DB schema + types)
- NEVER tell the user a file is "too large" to read. You can read ANY file. Use get_file_outline + read_code_file with startLine to read any section of any file.

IMPORTANT RULES:
1. Always use tools to get real data - never make up numbers or opportunities
2. External actions (emails, calendar events, bid submissions) require approval
3. Be concise and action-oriented
4. Format responses with markdown for readability
5. When recommending actions, always note approval requirements
6. Reference specific opportunity IDs, deadlines, and metrics when available
7. When asked about code: READ the actual file first before answering - never guess at implementation details
8. NEVER refuse to read a file due to size - always use your tools to read it in chunks

Current date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;

  // Cacheable system blocks: base prompt + domain context. Both stable
  // per-turn so prompt caching gives large discounts on inputs.
  const systemBlocks: Array<{ type: "text"; text: string; cacheable?: boolean }> = [
    { type: "text", text: baseSystemPrompt, cacheable: true },
  ];
  if (domainPrompt) {
    systemBlocks.push({ type: "text", text: domainPrompt, cacheable: true });
  }

  // Convert OpenAI-shape HERBIE_TOOLS to provider-neutral LLMToolSpec.
  const tools: LLMToolSpec[] = HERBIE_TOOLS.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters as LLMToolSpec["parameters"],
  }));

  const provider = getLLMProvider();
  const toolCalls: Array<{ tool: string; result: any }> = [];

  // Build the conversation in Anthropic-shape messages.
  const messages: LLMMessage[] = [
    ...conversationHistory.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: message },
  ];

  // Tool-use loop. Cap at 6 rounds to bound cost and prevent runaway agents.
  const MAX_ROUNDS = 6;
  let assistantText = "";

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await provider.chat({
      system: systemBlocks,
      messages,
      tools,
      tier: "orchestration",
      maxTokens: 2048,
    });

    assistantText = response.text;

    if (response.toolCalls.length === 0) {
      break;
    }

    // Append assistant turn (text + tool_use blocks) and the tool results.
    const assistantBlocks: LLMContentBlock[] = [];
    if (response.text) {
      assistantBlocks.push({ type: "text", text: response.text });
    }
    for (const tc of response.toolCalls) {
      assistantBlocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
    }
    messages.push({ role: "assistant", content: assistantBlocks });

    const toolResultBlocks: LLMContentBlock[] = [];
    for (const tc of response.toolCalls) {
      const result = await executeToolCall(tc.name, tc.input as Record<string, any>);
      toolCalls.push({ tool: tc.name, result });
      toolResultBlocks.push({
        type: "tool_result",
        tool_use_id: tc.id,
        content: JSON.stringify(result),
        is_error: !result.success,
      });
    }
    messages.push({ role: "user", content: toolResultBlocks });
  }

  const finalResponse = assistantText || "I apologize, but I couldn't process your request. Please try again.";

  await auditService.logEvent({
    tenantId: DEFAULT_TENANT_ID,
    eventType: "herbie_conversation",
    actor: "HERBIE",
    entityType: "conversation",
    entityId: `herbie-${Date.now()}`,
    afterJson: {
      userMessage: message.substring(0, 200),
      toolsUsed: toolCalls.map(t => t.tool),
    },
  });

  return { response: finalResponse, toolCalls };
}

export const herbieAgent = {
  process: processHerbieMessage,
  tools: HERBIE_TOOLS,
};
