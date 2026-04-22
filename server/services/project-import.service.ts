import { db } from "../db";
import { projects, projectImportLogs, projectImportLogRows } from "@shared/schema";
import { eq, and, sql, ilike } from "drizzle-orm";
import XLSX from "xlsx";
import crypto from "crypto";

interface ExcelRow {
  ID?: string;
  Name?: string;
  Client?: string;
  "Project type"?: string;
  "Start Date"?: string;
  "End Date"?: string;
  "Project status"?: string;
  "Revised Contract Inc. Tax"?: number | string;
  "Actual Costs Inc. Tax"?: number | string;
  "Paid Invoices Inc. Tax"?: number | string;
  "Gross Profit Inc. Tax (Actual)"?: number | string;
}

interface ImportResult {
  importLogId: string;
  totalRows: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  errors: string[];
}

const STATUS_MAP: Record<string, string> = {
  "course of construction": "active",
  "in progress": "active",
  "active": "active",
  "completed": "completed",
  "closed": "completed",
  "on hold": "on_hold",
  "planning": "planning",
  "bidding": "bidding",
  "awarded": "awarded",
  "cancelled": "cancelled",
};

function normalizeStatus(raw: string | undefined): string {
  if (!raw) return "active";
  const lower = raw.trim().toLowerCase();
  return STATUS_MAP[lower] || lower.replace(/\s+/g, "_");
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseNumeric(val: number | string | undefined): string | null {
  if (val === undefined || val === null || val === "") return null;
  if (typeof val === "number") return val.toFixed(2);
  const cleaned = String(val).replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num.toFixed(2);
}

function parseDate(val: string | undefined): Date | null {
  if (!val || typeof val !== "string") return null;
  const trimmed = val.trim();
  const parts = trimmed.split("/");
  if (parts.length === 3) {
    const [month, day, year] = parts;
    const d = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00Z`);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

export async function importProjectsFromExcel(
  filePath: string,
  tenantId: string,
  fileName: string
): Promise<ImportResult> {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: ExcelRow[] = XLSX.utils.sheet_to_json(ws);

  const result: ImportResult = {
    importLogId: "",
    totalRows: rows.length,
    insertedCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    errors: [],
  };

  const [logEntry] = await db.insert(projectImportLogs).values({
    tenantId,
    fileName,
    totalRows: rows.length,
  }).returning();

  result.importLogId = logEntry.id;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2;

    try {
      if (!row.Name || !row.Name.trim()) {
        result.skippedCount++;
        await db.insert(projectImportLogRows).values({
          importLogId: logEntry.id,
          rowNumber,
          projectKey: row.ID || `row-${rowNumber}`,
          action: "skip",
          error: "Missing project name",
        });
        continue;
      }

      const projectNumber = row.ID?.trim() || "";
      const name = row.Name.trim();
      const normalizedNameVal = normalizeName(name);
      const projectKey = projectNumber || normalizedNameVal;

      let existingProject: (typeof projects.$inferSelect) | null = null;

      if (projectNumber) {
        const [byNumber] = await db.select().from(projects)
          .where(and(
            eq(projects.tenantId, tenantId),
            eq(projects.projectNumber, projectNumber)
          ))
          .limit(1);
        existingProject = byNumber || null;
      }

      if (!existingProject) {
        const [byName] = await db.select().from(projects)
          .where(and(
            eq(projects.tenantId, tenantId),
            ilike(projects.normalizedName, normalizedNameVal)
          ))
          .limit(1);
        existingProject = byName || null;
      }

      if (!existingProject && !projectNumber) {
        const [byExactName] = await db.select().from(projects)
          .where(and(
            eq(projects.tenantId, tenantId),
            ilike(projects.name, name)
          ))
          .limit(1);
        existingProject = byExactName || null;
      }

      const updateData = {
        name,
        normalizedName: normalizedNameVal,
        projectNumber: projectNumber || existingProject?.projectNumber || `IMP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        status: normalizeStatus(row["Project status"]),
        client: row.Client?.trim() || existingProject?.client || null,
        projectType: row["Project type"]?.trim() || existingProject?.type || null,
        contractValue: parseNumeric(row["Revised Contract Inc. Tax"]),
        actualCosts: parseNumeric(row["Actual Costs Inc. Tax"]),
        paidInvoices: parseNumeric(row["Paid Invoices Inc. Tax"]),
        grossProfit: parseNumeric(row["Gross Profit Inc. Tax (Actual)"]),
        startDate: parseDate(row["Start Date"]),
        expectedEndDate: parseDate(row["End Date"]),
        updatedAt: new Date(),
      };

      if (existingProject) {
        await db.update(projects)
          .set(updateData)
          .where(eq(projects.id, existingProject.id));
        result.updatedCount++;
        await db.insert(projectImportLogRows).values({
          importLogId: logEntry.id,
          rowNumber,
          projectKey,
          action: "update",
        });
      } else {
        await db.insert(projects).values({
          tenantId,
          ...updateData,
        });
        result.insertedCount++;
        await db.insert(projectImportLogRows).values({
          importLogId: logEntry.id,
          rowNumber,
          projectKey,
          action: "insert",
        });
      }
    } catch (err: any) {
      result.failedCount++;
      const errorMsg = `Row ${rowNumber}: ${err.message}`;
      result.errors.push(errorMsg);
      await db.insert(projectImportLogRows).values({
        importLogId: logEntry.id,
        rowNumber,
        projectKey: row.ID || row.Name || `row-${rowNumber}`,
        action: "fail",
        error: err.message,
      }).catch(() => {});
    }
  }

  await db.update(projectImportLogs)
    .set({
      insertedCount: result.insertedCount,
      updatedCount: result.updatedCount,
      skippedCount: result.skippedCount,
      failedCount: result.failedCount,
      errorSummary: result.errors.length > 0 ? result.errors.join("\n") : null,
    })
    .where(eq(projectImportLogs.id, logEntry.id));

  return result;
}

export async function backfillNormalizedNames(tenantId: string): Promise<number> {
  const allProjects = await db.select({ id: projects.id, name: projects.name, normalizedName: projects.normalizedName })
    .from(projects)
    .where(eq(projects.tenantId, tenantId));

  let updated = 0;
  for (const p of allProjects) {
    const nn = normalizeName(p.name);
    if (p.normalizedName !== nn) {
      await db.update(projects).set({ normalizedName: nn, updatedAt: new Date() }).where(eq(projects.id, p.id));
      updated++;
    }
  }
  return updated;
}
