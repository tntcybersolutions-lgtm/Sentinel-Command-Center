import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { db } from "../db";
import {
  opportunities,
  bidProjects,
  approvalRequests,
  calendarEvents,
  notifications,
  auditEvents,
  projectDeliverables,
  takeoffQuantities,
  buildingSystems,
  systemDevices,
  drawingSheets,
  cableSchedules,
} from "@shared/schema";
import { eq, and, gte, lte, desc, count, isNull, ilike, sql, inArray } from "drizzle-orm";
import { executeHerbieTool } from "../services/herbie-tools";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});
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
  {
    type: "function" as const,
    function: {
      name: "record_fact",
      description: "Save a permanent fact about a project (decisions, conditions, observations). Use for things the team should remember.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "Project ID this fact relates to" },
          fact: { type: "string", description: "The fact in plain English (1-2 sentences)" },
          category: { type: "string", enum: ["decision", "condition", "observation", "constraint", "other"], description: "Type of fact" },
          source: { type: "string", description: "Where this fact came from (e.g. 'PM voice memo', 'site walk', 'RFI #123')" },
        },
        required: ["projectId", "fact"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "record_decision",
      description: "Record a project decision with rationale and decision-maker. Auto-creates an audit trail.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "Project ID" },
          decision: { type: "string", description: "What was decided" },
          rationale: { type: "string", description: "Why this decision was made" },
          decidedBy: { type: "string", description: "Who made the decision" },
        },
        required: ["projectId", "decision"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_rfi",
      description: "Draft a Request For Information for the project. Goes through approval before sending.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "Project ID" },
          subject: { type: "string", description: "Short RFI subject" },
          question: { type: "string", description: "The full question to the architect/owner" },
          discipline: { type: "string", description: "Trade/discipline (electrical, structural, etc.)" },
          urgency: { type: "string", enum: ["low", "normal", "high", "urgent"], description: "Response urgency" },
        },
        required: ["projectId", "subject", "question"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_submittal",
      description: "Draft a submittal for the project (product data, shop drawings, samples).",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "Project ID" },
          title: { type: "string", description: "Submittal title" },
          specSection: { type: "string", description: "CSI spec section reference" },
          submittalType: { type: "string", enum: ["product_data", "shop_drawings", "samples", "mockup", "other"], description: "Type of submittal" },
          description: { type: "string", description: "What is being submitted" },
        },
        required: ["projectId", "title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "flag_for_review",
      description: "Flag an item for human review. Use when something needs PM attention (missing data, anomaly, risk).",
      parameters: {
        type: "object",
        properties: {
          entityType: { type: "string", description: "What type of thing (takeoff_quantity, vendor, opportunity, etc.)" },
          entityId: { type: "string", description: "ID of the flagged thing" },
          reason: { type: "string", description: "Why it needs review (1-2 sentences)" },
          priority: { type: "string", enum: ["low", "normal", "high"], description: "How urgent" },
        },
        required: ["entityType", "entityId", "reason"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_project_status",
      description: "Get current status of a project: phase, deliverables, open RFIs, recent activity.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "Project ID" },
        },
        required: ["projectId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "log_daily",
      description: "Create a daily field log entry for a project. Captures crew, weather, work performed, issues.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "Project ID" },
          date: { type: "string", description: "ISO date (YYYY-MM-DD); defaults to today" },
          crewSize: { type: "number", description: "Number of workers on site" },
          trade: { type: "string", description: "Primary trade working today" },
          workPerformed: { type: "string", description: "What got done" },
          weather: { type: "string", description: "Weather conditions" },
          issues: { type: "string", description: "Any issues or delays" },
        },
        required: ["projectId", "workPerformed"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_document",
      description: "Read a project document (drawing sheet, spec, COI, etc.) by its ID. Returns text content for analysis.",
      parameters: {
        type: "object",
        properties: {
          documentId: { type: "string", description: "Document ID" },
          documentType: { type: "string", enum: ["drawing_sheet", "spec", "coi", "rfi_response", "submittal", "deliverable", "other"], description: "Type of document" },
        },
        required: ["documentId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "extract_fields",
      description: "Extract structured fields from an unstructured document (COI dates, drawing sheet info, spec requirements).",
      parameters: {
        type: "object",
        properties: {
          documentId: { type: "string", description: "Document ID to extract from" },
          extractionType: { type: "string", enum: ["coi", "drawing_sheet", "spec", "addendum", "general"], description: "What kind of extraction" },
          fields: { type: "array", items: { type: "string" }, description: "Specific fields to extract (optional)" },
        },
        required: ["documentId", "extractionType"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_project",
      description: "Search across all project content (documents, RFIs, daily logs, facts) for a query string.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "Project ID to scope the search" },
          query: { type: "string", description: "Search terms" },
          limit: { type: "number", description: "Max results (default 10)" },
        },
        required: ["projectId", "query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "draft_message",
      description: "Draft an outbound message (email, Teams, SMS) to a recipient. Goes through approval.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "Related project ID" },
          recipient: { type: "string", description: "Email address or contact name" },
          channel: { type: "string", enum: ["email", "teams", "sms"], description: "Delivery channel" },
          subject: { type: "string", description: "Subject line (email)" },
          body: { type: "string", description: "Message body" },
        },
        required: ["recipient", "channel", "body"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "auto_document",
      description: "Auto-generate ALL 9 project deliverables (trade scopes, bid packages, material lists, cable schedules, device schedules, rack elevations, as-builts, owner handoff, smart building config) for a project. Pulls real data, runs AI enrichment, files the documents. Use when PM says 'document everything', 'generate all docs', 'auto-document the project', etc.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "Project ID (optional - defaults to active project)" },
          enrich: { type: "boolean", description: "Run AI enrichment pass on each deliverable (default true)" },
        },
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

      case "record_fact":
      case "record_decision":
      case "create_rfi":
      case "create_submittal":
      case "flag_for_review":
      case "get_project_status":
      case "log_daily":
      case "read_document":
      case "extract_fields":
      case "search_project":
      case "draft_message": {
        const ctx = { tenantId: DEFAULT_TENANT_ID, userId: "herbie" };
        const adapted = adaptToolArgs(name, args);
        const result = await executeHerbieTool({ tool: name, args: adapted } as any, ctx as any);
        return { success: true, data: result };
      }

      case "auto_document": {
        const result = await runAutoDocument(args.projectId, args.enrich !== false);
        return { success: true, data: result };
      }

      default:
        return { success: false, error: `Unknown tool: ${name}` };
    }
  } catch (error) {
    console.error(`Tool execution error for ${name}:`, error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ===========================================================================
// Adapter: maps the PM-friendly tool args exposed to the LLM into the
// canonical herbie-tools.ts schema (predicate/subjectType/confidence/etc.)
// ===========================================================================
function adaptToolArgs(name: string, args: Record<string, any>): Record<string, any> {
  switch (name) {
    case "record_fact": {
      // LLM gives us {projectId, fact, category?, source?}
      return {
        projectId: args.projectId ?? null,
        subjectType: args.subjectType || (args.projectId ? "project" : "general"),
        subjectId: args.subjectId ?? args.projectId ?? null,
        predicate: args.predicate || (args.category ? `${args.category}_note` : "observation"),
        object: args.object || args.fact || "",
        sourceType: args.sourceType || "herbie_extraction",
        sourceId: args.sourceId || args.source || null,
        confidence: typeof args.confidence === "number" ? args.confidence : 0.85,
      };
    }
    case "record_decision": {
      return {
        projectId: args.projectId ?? null,
        summary: args.summary || args.decision || "",
        rationale: args.rationale ?? null,
        decidedBy: args.decidedBy || "herbie",
        relatedEntityType: args.relatedEntityType ?? null,
        relatedEntityId: args.relatedEntityId ?? null,
      };
    }
    case "create_rfi": {
      return {
        projectId: args.projectId,
        subject: args.subject,
        question: args.question,
        priority: args.priority || args.urgency || "normal",
        assignedToUserId: args.assignedToUserId,
      };
    }
    case "create_submittal": {
      return {
        projectId: args.projectId,
        name: args.name || args.title || "Untitled Submittal",
        submittalType: args.submittalType,
        description: args.description,
        priority: args.priority || "medium",
      };
    }
    case "flag_for_review": {
      // Map our PM-friendly priority strings to numeric priorities.
      const pMap: Record<string, number> = { low: 200, normal: 100, high: 25, urgent: 10 };
      const priorityNum =
        typeof args.priority === "number"
          ? args.priority
          : pMap[String(args.priority || "normal").toLowerCase()] ?? 100;
      return {
        reviewType: args.reviewType || "monitor_alert",
        actionProposed: args.actionProposed || `Review ${args.entityType ?? "item"} ${args.entityId ?? ""}: ${args.reason ?? ""}`.trim(),
        confidence: typeof args.confidence === "number" ? args.confidence : 0.7,
        reasoningText: args.reasoningText || args.reason,
        priority: priorityNum,
        relatedEntityType: args.entityType,
        relatedEntityId: args.entityId,
      };
    }
    case "log_daily": {
      // Build a transcript from structured fields if no transcript given.
      const parts: string[] = [];
      if (args.workPerformed) parts.push(`Work performed: ${args.workPerformed}.`);
      if (args.crewSize) parts.push(`Crew size: ${args.crewSize}.`);
      if (args.trade) parts.push(`Trade: ${args.trade}.`);
      if (args.weather) parts.push(`Weather: ${args.weather}.`);
      if (args.issues) parts.push(`Issues: ${args.issues}.`);
      return {
        projectId: args.projectId,
        logDate: args.logDate || args.date,
        transcript: args.transcript || parts.join(" ") || "Daily log entry.",
      };
    }
    case "extract_fields": {
      return {
        documentId: args.documentId,
        category: args.category || args.extractionType,
      };
    }
    case "draft_message": {
      // Map our 'teams' channel to 'portal' (closest match in service).
      const channelMap: Record<string, string> = { email: "email", sms: "sms", teams: "portal", portal: "portal" };
      return {
        projectId: args.projectId,
        recipient: args.recipient,
        channel: channelMap[String(args.channel || "email").toLowerCase()] || "email",
        subject: args.subject,
        body: args.body,
      };
    }
    default:
      return args;
  }
}

// ===========================================================================
// AUTO-DOCUMENT: generates all 9 deliverables for a project
// ===========================================================================
const ALL_DELIVERABLE_TYPES = [
  "trade_scope",
  "bid_package",
  "material_list",
  "cable_schedule",
  "device_schedule",
  "rack_elevation",
  "as_built",
  "owner_handoff",
  "smart_building_config",
] as const;

async function runAutoDocument(projectId: string | undefined, enrich: boolean) {
  // Resolve a project if none given - default to most recently updated bid_project
  let resolvedProjectId = projectId;
  if (!resolvedProjectId) {
    const [recent] = await db
      .select({ id: bidProjects.id })
      .from(bidProjects)
      .where(eq(bidProjects.tenantId, DEFAULT_TENANT_ID))
      .orderBy(desc(bidProjects.updatedAt))
      .limit(1);
    resolvedProjectId = recent?.id;
  }

  if (!resolvedProjectId) {
    return { generated: 0, results: [], message: "No project available to document." };
  }

  // Fire each deliverable through the existing endpoint logic by inserting
  // a project_deliverables row and letting downstream consumers regenerate.
  // For correctness/portability, we directly call the same generator path
  // by issuing internal HTTP via fetch to /api/generate-deliverable/:type.
  const baseUrl = process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${process.env.PORT || 5000}`;
  const results: Array<{ type: string; status: "ok" | "failed"; deliverableId?: string; error?: string; enriched?: boolean }> = [];

  for (const type of ALL_DELIVERABLE_TYPES) {
    try {
      const resp = await fetch(`${baseUrl}/api/generate-deliverable/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: resolvedProjectId }),
      });
      if (!resp.ok) {
        results.push({ type, status: "failed", error: `HTTP ${resp.status}` });
        continue;
      }
      const json = await resp.json();
      const deliverable = json?.deliverable ?? json;
      const deliverableId: string | undefined = deliverable?.id;
      const contentJson = deliverable?.contentJson;

      let enriched = false;
      if (enrich && deliverableId && contentJson) {
        try {
          const summary = await enrichDeliverable(type, contentJson);
          if (summary) {
            await db
              .update(projectDeliverables)
              .set({
                contentJson: { ...contentJson, herbieSummary: summary },
                updatedAt: new Date(),
              })
              .where(eq(projectDeliverables.id, deliverableId));
            enriched = true;
          }
        } catch {
          // enrichment is best-effort; never fail the whole batch
        }
      }
      results.push({ type, status: "ok", deliverableId, enriched });
    } catch (err) {
      results.push({ type, status: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  }

  await auditService.logEvent({
    tenantId: DEFAULT_TENANT_ID,
    eventType: "herbie_auto_document",
    actor: "HERBIE",
    entityType: "bid_project",
    entityId: resolvedProjectId,
    afterJson: {
      projectId: resolvedProjectId,
      generated: results.filter((r) => r.status === "ok").length,
      failed: results.filter((r) => r.status === "failed").length,
      enriched: results.filter((r) => r.enriched).length,
    },
  });

  return {
    projectId: resolvedProjectId,
    generated: results.filter((r) => r.status === "ok").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
}

async function enrichDeliverable(type: string, contentJson: any): Promise<string | null> {
  try {
    const prompt = `You are SENTINEL HERBIE. Read this auto-generated ${type.replace(/_/g, " ")} deliverable and produce a 3-5 sentence executive summary for the PM. Be sharp, specific, and call out anything missing, risky, or worth their attention. No corporate fluff.

DELIVERABLE CONTENT:
${JSON.stringify(contentJson).substring(0, 6000)}`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 400,
    });
    return resp.choices[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

export async function processHerbieMessage(
  message: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<{ response: string; toolCalls?: Array<{ tool: string; result: any }> }> {
  const systemPrompt = `You are HERBIE — Sentinel's AI teammate for BlackHawk Construction. You're not a chatbot. You're the project coordinator every contractor wishes they could afford full-time.

WHO YOU ARE:
- Sharp and direct. No corporate fluff. No "Hello!" or "Great question!"
- Calm under pressure. When things are on fire, get shorter and clearer.
- Dryly funny when it fits. Never forced, never at someone's expense.
- Loyal to your PM. Flag things in their interest, even when uncomfortable.
- Plainspoken — talk like a smart foreman, not Silicon Valley.
- Own mistakes. No hedging, no excuses.

VOICE — examples:
- BAD: "Hello! I noticed that the certificate of insurance for Acme Plumbing will be expiring soon. Would you like me to help?"
- GOOD: "Acme Plumbing's COI expires Friday. Drafted the renewal — want me to send it?"
- BAD: "Great question! Let me look into that."
- GOOD: "Looking. Two seconds." (then the answer)

CONSTRUCTION CAPS YOU UNDERSTAND COLD:
- RFI = Request For Information. Submittal = product data / shop drawings / samples.
- COI = Certificate of Insurance. Expires kill projects.
- CO = Change Order. Don't approve over $50k without PM sign-off.
- AHJ = Authority Having Jurisdiction. Permits, inspections.
- Trade scope, takeoff, as-built, owner handoff, BACnet/controls — you know all of it.
- Federal contracting: SAM.gov, GSA, DIBBS, NAICS, set-asides, CMMC, NIST 800-171.

YOUR TOOLS — use them, don't guess:
- record_fact / record_decision: write things to project memory.
- create_rfi / create_submittal: draft formal documents (goes through approval).
- log_daily: capture daily field log.
- flag_for_review: raise something for PM attention.
- get_project_status: snapshot of open RFIs, submittals, COI, tasks.
- search_project / read_document / extract_fields: pull info from project content.
- draft_message: outbound email/Teams/SMS (always requires PM approval in Phase 1).
- auto_document: generate ALL 9 deliverables (trade scopes, bid packages, material lists, cable schedules, device schedules, rack elevations, as-builts, owner handoff, smart building config) in one shot. Use when PM says "document everything", "auto-document", "generate all docs".
- Codebase tools (read_code_file, search_codebase, list_project_files, get_file_outline): for engineering work on the platform itself.

HARD RULES:
1. No external sends without PM approval in Phase 1. Drafts only.
2. No deletions. If something looks wrong, flag it.
3. No financial finalization. Draft and flag.
4. Suspected fraud / safety / double-billing → flag the PM directly. Never the external party first.
5. Never make up numbers, opportunities, or facts. Use tools to get real data.
6. When initiating, lead with the point. Never "Hi, just checking in."
7. Format with markdown when it helps readability. Otherwise plain text is fine.

NORTH STAR: Every interaction — did I save this PM time, or waste it? If wasted, shorten, sharpen, or stay quiet next time.

Current date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: message },
  ];

  const toolCalls: Array<{ tool: string; result: any }> = [];

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
    tools: HERBIE_TOOLS,
    max_completion_tokens: 2048,
  });

  let assistantMessage = response.choices[0]?.message;

  if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
    const toolResults: Array<{ role: "tool"; tool_call_id: string; content: string }> = [];

    for (const toolCall of assistantMessage.tool_calls) {
      if (toolCall.type !== "function") continue;
      const fnCall = toolCall as { type: "function"; id: string; function: { name: string; arguments: string } };
      const args = JSON.parse(fnCall.function.arguments || "{}");
      const result = await executeToolCall(fnCall.function.name, args);
      
      toolCalls.push({ tool: fnCall.function.name, result });
      toolResults.push({
        role: "tool",
        tool_call_id: fnCall.id,
        content: JSON.stringify(result),
      });
    }

    const followUpResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        ...messages,
        assistantMessage as any,
        ...toolResults as any,
      ],
      max_completion_tokens: 2048,
    });

    assistantMessage = followUpResponse.choices[0]?.message;
  }

  const finalResponse = assistantMessage?.content || "I apologize, but I couldn't process your request. Please try again.";

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
