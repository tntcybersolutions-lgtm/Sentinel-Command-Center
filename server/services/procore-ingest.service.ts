import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { db } from "../db";
import {
  projects,
  invoices,
  changeOrders,
  purchaseOrders,
  rfis,
  dailyLogs,
  submittals,
  projectTasks,
  vendors,
  auditEvents,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { emitEvent } from "./event-bus.service";
import { entityLinkService } from "./entity-link.service";
import crypto from "crypto";
const AdmZip = require("adm-zip");

const DEFAULT_TENANT_ID = "blackhawk-default";

function generateId(): string {
  return crypto.randomUUID();
}

function parseExcelDate(val: any): Date | null {
  if (!val) return null;
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return new Date(d.y, d.m - 1, d.d, d.H || 0, d.M || 0, d.S || 0);
  }
  if (typeof val === "string") {
    const parts = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (parts) return new Date(parseInt(parts[3]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const iso = new Date(val);
    if (!isNaN(iso.getTime())) return iso;
  }
  return null;
}

function normalizeProjectName(name: string): string {
  return name.replace(/\s*\|\s*\d+$/, "").trim();
}

function normalizeStatus(status: string): string {
  if (!status) return "draft";
  const s = status.toLowerCase().trim();
  if (s === "paid") return "paid";
  if (s === "approved" || s === "closed") return "approved";
  if (s === "pending" || s === "submitted") return "pending";
  if (s === "draft" || s === "not started") return "draft";
  if (s === "in progress" || s === "in_progress") return "in_progress";
  if (s === "complete" || s === "completed" || s === "done") return "completed";
  if (s === "voided" || s === "cancelled" || s === "rejected") return "voided";
  return s;
}

function extractProjectCodeFromFilename(filename: string): string | null {
  const match = filename.match(/^([A-Z0-9][A-Za-z0-9\-]+?)-(PO|SC|RFI)-/);
  return match ? match[1] : null;
}

async function ensureProjectExists(
  projectName: string,
  projectMap: Map<string, string>
): Promise<string> {
  const normalized = normalizeProjectName(projectName);
  if (projectMap.has(normalized)) return projectMap.get(normalized)!;

  const existing = await db
    .select()
    .from(projects)
    .where(and(eq(projects.tenantId, DEFAULT_TENANT_ID), eq(projects.name, normalized)))
    .limit(1);

  if (existing.length > 0) {
    projectMap.set(normalized, existing[0].id);
    return existing[0].id;
  }

  const id = generateId();
  const projectNumber = `PRO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

  await db.insert(projects).values({
    id,
    tenantId: DEFAULT_TENANT_ID,
    projectNumber,
    name: normalized,
    status: "active",
    type: "construction",
    contractType: "federal",
    customFieldsJson: { source: "procore-import" },
  });

  projectMap.set(normalized, id);
  return id;
}

async function ensureVendorExists(
  vendorName: string,
  vendorMap: Map<string, string>
): Promise<string> {
  if (!vendorName || vendorName.trim() === "") return "unknown-vendor";
  const name = vendorName.replace(/^\*/, "").trim();
  if (vendorMap.has(name)) return vendorMap.get(name)!;

  const existing = await db
    .select()
    .from(vendors)
    .where(and(eq(vendors.tenantId, DEFAULT_TENANT_ID), eq(vendors.companyName, name)))
    .limit(1);

  if (existing.length > 0) {
    vendorMap.set(name, existing[0].id);
    return existing[0].id;
  }

  const id = generateId();
  const vendorNumber = `V-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 4).toUpperCase()}`;

  await db.insert(vendors).values({
    id,
    tenantId: DEFAULT_TENANT_ID,
    vendorNumber,
    companyName: name,
    vendorType: "subcontractor",
    status: "active",
  });

  vendorMap.set(name, id);
  return id;
}

export interface IngestResult {
  projects: number;
  bills: number;
  clientInvoices: number;
  changeOrders: number;
  submittals: number;
  todos: number;
  purchaseOrders: number;
  rfis: number;
  dailyLogs: number;
  vendors: number;
  errors: string[];
}

export async function runProcoreIngest(): Promise<IngestResult> {
  const result: IngestResult = {
    projects: 0,
    bills: 0,
    clientInvoices: 0,
    changeOrders: 0,
    submittals: 0,
    todos: 0,
    purchaseOrders: 0,
    rfis: 0,
    dailyLogs: 0,
    vendors: 0,
    errors: [],
  };

  const projectMap = new Map<string, string>();
  const vendorMap = new Map<string, string>();

  const existingProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.tenantId, DEFAULT_TENANT_ID));
  for (const p of existingProjects) {
    projectMap.set(p.name, p.id);
  }

  const existingVendors = await db
    .select()
    .from(vendors)
    .where(eq(vendors.tenantId, DEFAULT_TENANT_ID));
  for (const v of existingVendors) {
    vendorMap.set(v.companyName, v.id);
  }

  const initialProjectCount = projectMap.size;
  const initialVendorCount = vendorMap.size;

  try {
    await ingestBills(projectMap, vendorMap, result);
  } catch (e: any) {
    result.errors.push(`Bills: ${e.message}`);
  }

  try {
    await ingestClientInvoices(projectMap, result);
  } catch (e: any) {
    result.errors.push(`Client Invoices: ${e.message}`);
  }

  try {
    await ingestChangeOrders(projectMap, result);
  } catch (e: any) {
    result.errors.push(`Change Orders: ${e.message}`);
  }

  try {
    await ingestSubmittals(projectMap, vendorMap, result);
  } catch (e: any) {
    result.errors.push(`Submittals: ${e.message}`);
  }

  try {
    await ingestTodos(projectMap, result);
  } catch (e: any) {
    result.errors.push(`To-Dos: ${e.message}`);
  }

  try {
    await ingestPurchaseOrders(projectMap, vendorMap, result);
  } catch (e: any) {
    result.errors.push(`Purchase Orders: ${e.message}`);
  }

  try {
    await ingestRFIs(projectMap, result);
  } catch (e: any) {
    result.errors.push(`RFIs: ${e.message}`);
  }

  result.projects = projectMap.size - initialProjectCount;
  result.vendors = vendorMap.size - initialVendorCount;

  try {
    await emitEvent({
      tenantId: DEFAULT_TENANT_ID,
      eventType: "ProcoreDataIngested",
      entityType: "system",
      entityId: "procore-import",
      payload: {
        ...result,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (e: any) {
    result.errors.push(`Event emission: ${e.message}`);
  }

  try {
    await db.insert(auditEvents).values({
      tenantId: DEFAULT_TENANT_ID,
      eventType: "procore_ingest",
      actor: "system",
      actorType: "system",
      action: "procore_data_ingested",
      entityType: "system",
      entityId: "procore-import",
      metaJson: result,
    });
  } catch (e: any) {
    result.errors.push(`Audit log: ${e.message}`);
  }

  return result;
}

async function ingestBills(
  projectMap: Map<string, string>,
  vendorMap: Map<string, string>,
  result: IngestResult
) {
  const filePath = path.resolve("attached_assets/All_items_-_Bills_1771364729324.xlsx");
  if (!fs.existsSync(filePath)) return;

  const wb = XLSX.readFile(filePath);
  const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

  for (const row of rows) {
    try {
      if (!row.Project || !row.Id) continue;
      const projectId = await ensureProjectExists(row.Project, projectMap);
      const vendorId = row["Pay to"]
        ? await ensureVendorExists(row["Pay to"], vendorMap)
        : null;

      await db
        .insert(invoices)
        .values({
          id: generateId(),
          tenantId: DEFAULT_TENANT_ID,
          invoiceNumber: row.Id,
          invoiceType: "payable",
          projectId,
          vendorId,
          status: normalizeStatus(row.Status || ""),
          totalAmount: String(row.Total || 0),
          paidAmount: String(row.Paid || 0),
          invoiceDate: parseExcelDate(row.Date),
          dueDate: parseExcelDate(row["Due Date"]),
          notesJson: {
            name: row.Name || "",
            reference: row.Reference || "",
            relatedPO: row["Related PO"] || "",
            attachmentUrl: row.Attachments || "",
            source: "procore-import",
          },
        })
        .onConflictDoNothing();

      result.bills++;
    } catch (e: any) {
      result.errors.push(`Bill ${row.Id}: ${e.message}`);
    }
  }
}

async function ingestClientInvoices(
  projectMap: Map<string, string>,
  result: IngestResult
) {
  const filePath = path.resolve("attached_assets/All_items_-_Client_Invoices_1771364729325.xlsx");
  if (!fs.existsSync(filePath)) return;

  const wb = XLSX.readFile(filePath);
  const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

  for (const row of rows) {
    try {
      if (!row.Project || !row.Id) continue;
      const projectId = await ensureProjectExists(row.Project, projectMap);

      await db
        .insert(invoices)
        .values({
          id: generateId(),
          tenantId: DEFAULT_TENANT_ID,
          invoiceNumber: row.Id,
          invoiceType: "receivable",
          projectId,
          status: normalizeStatus(row.Status || ""),
          totalAmount: String(row.Total || 0),
          paidAmount: String(row.Paid || 0),
          invoiceDate: parseExcelDate(row["Creation date"]),
          dueDate: parseExcelDate(row["Due date"]),
          notesJson: {
            name: row.Name || "",
            attachmentUrl: row.Attachments || "",
            source: "procore-import",
          },
        })
        .onConflictDoNothing();

      result.clientInvoices++;
    } catch (e: any) {
      result.errors.push(`Client Invoice ${row.Id}: ${e.message}`);
    }
  }
}

async function ingestChangeOrders(
  projectMap: Map<string, string>,
  result: IngestResult
) {
  const filePath = path.resolve("attached_assets/All_items_-_Change_Orders_1771364729325.xlsx");
  if (!fs.existsSync(filePath)) return;

  const wb = XLSX.readFile(filePath);
  const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

  for (const row of rows) {
    try {
      if (!row.Project || !row.ID) continue;
      const projectId = await ensureProjectExists(row.Project, projectMap);

      await db
        .insert(changeOrders)
        .values({
          id: generateId(),
          tenantId: DEFAULT_TENANT_ID,
          projectId,
          coNumber: row.ID,
          title: row.Name || row.ID,
          changeType: "owner",
          status: normalizeStatus(row.Status || ""),
          amount: String(row.Total || 0),
          description: `Paid: $${row.Paid || 0} | Balance: $${row["Balance due"] || 0}`,
        })
        .onConflictDoNothing();

      result.changeOrders++;
    } catch (e: any) {
      result.errors.push(`Change Order ${row.ID}: ${e.message}`);
    }
  }
}

async function ingestSubmittals(
  projectMap: Map<string, string>,
  vendorMap: Map<string, string>,
  result: IngestResult
) {
  const filePath = path.resolve("attached_assets/All_items_-_Submittals_1771364729326.xlsx");
  if (!fs.existsSync(filePath)) return;

  const wb = XLSX.readFile(filePath);
  const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

  for (const row of rows) {
    try {
      if (!row.Project || !row.ID) continue;
      const projectId = await ensureProjectExists(row.Project, projectMap);

      await db
        .insert(submittals)
        .values({
          id: generateId(),
          tenantId: DEFAULT_TENANT_ID,
          projectId,
          submittalNumber: row.ID,
          name: row.Name || row.ID,
          revision: row.Revision || 0,
          status: normalizeStatus(row.Status || ""),
          priority: (row.Priority || "medium").toLowerCase(),
          submittalType: row["Submittal Type"] || null,
          description: row.Description || null,
          managerName: row.Manager || null,
          contractorName: row.Contractor ? row.Contractor.replace(/^\*/, "").trim() : null,
          approvers: row.Approvers || null,
          reference: row.Reference || null,
          labels: row.Labels || null,
        })
        .onConflictDoNothing();

      result.submittals++;
    } catch (e: any) {
      result.errors.push(`Submittal ${row.ID}: ${e.message}`);
    }
  }
}

async function ingestTodos(
  projectMap: Map<string, string>,
  result: IngestResult
) {
  const filePath = path.resolve("attached_assets/All_items_-_To-Dos_1771364729326.xlsx");
  if (!fs.existsSync(filePath)) return;

  const wb = XLSX.readFile(filePath);
  const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

  for (const row of rows) {
    try {
      if (!row.Project || !row.Name) continue;
      const projectId = await ensureProjectExists(row.Project, projectMap);

      const statusMap: Record<string, string> = {
        "Not Started": "not_started",
        "In Progress": "in_progress",
        "Complete": "completed",
        "Closed": "completed",
      };

      await db
        .insert(projectTasks)
        .values({
          id: generateId(),
          tenantId: DEFAULT_TENANT_ID,
          projectId,
          name: row.Name,
          description: row.Description || null,
          assignees: row.Assignees || null,
          status: statusMap[row.Status] || "not_started",
          priority: (row.Priority || "medium").toLowerCase(),
          labels: row.Labels || null,
          dueDate: parseExcelDate(row["Due date"]),
          source: "procore-import",
          attachmentsJson: row.Attachments ? { url: row.Attachments } : null,
        });

      result.todos++;
    } catch (e: any) {
      result.errors.push(`To-Do "${row.Name}": ${e.message}`);
    }
  }
}

async function ingestPurchaseOrders(
  projectMap: Map<string, string>,
  vendorMap: Map<string, string>,
  result: IngestResult
) {
  const zipPath = path.resolve("attached_assets/all-items-purchase-order-files-20260217T162603Z_1771364729326.zip");
  if (!fs.existsSync(zipPath)) return;

  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  const projectCodeMap = new Map<string, string>();
  Array.from(projectMap.entries()).forEach(([name, id]) => {
    const codeMatch = name.match(/^([A-Z0-9][A-Za-z0-9\-]+)/);
    if (codeMatch) projectCodeMap.set(codeMatch[1], id);
  });

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const filename = path.basename(entry.entryName);
    if (!filename.endsWith(".pdf")) continue;

    try {
      const match = filename.match(/^(.+?)(?:-(PO|SC)-(\d+))?\s+(.+?)\s*-\s*\d{2}_\d{2}_\d{4}\.pdf$/);
      if (!match) {
        result.errors.push(`PO file parse failed: ${filename}`);
        continue;
      }

      const projectCode = match[1];
      const docType = match[2] || "PO";
      const docNum = match[3] || "001";
      const vendorName = match[4]?.trim();

      let projectId: string | null = null;
      const entries2 = Array.from(projectMap.entries());
      for (let i = 0; i < entries2.length; i++) {
        const [pName, pId] = entries2[i];
        if (pName.includes(projectCode) || projectCode.includes(pName.split(" ")[0])) {
          projectId = pId;
          break;
        }
      }

      const vendorId = vendorName
        ? await ensureVendorExists(vendorName, vendorMap)
        : "unknown-vendor";

      const poNumber = `${projectCode}-${docType}-${docNum}`;

      await db
        .insert(purchaseOrders)
        .values({
          id: generateId(),
          tenantId: DEFAULT_TENANT_ID,
          poNumber,
          vendorId,
          projectId,
          status: "issued",
          totalAmount: "0",
          notesJson: {
            filename,
            docType: docType === "SC" ? "subcontract" : "purchase_order",
            source: "procore-import",
          },
        })
        .onConflictDoNothing();

      result.purchaseOrders++;
    } catch (e: any) {
      result.errors.push(`PO file ${filename}: ${e.message}`);
    }
  }
}

async function ingestRFIs(
  projectMap: Map<string, string>,
  result: IngestResult
) {
  const zipPath = path.resolve("attached_assets/all-items-request-for-information-files-20260217T162837Z_1771364729327.zip");
  if (!fs.existsSync(zipPath)) return;

  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const filename = path.basename(entry.entryName);
    if (!filename.endsWith(".pdf")) continue;

    try {
      const match = filename.match(/^(.+?)-RFI-(\d+)\s+(.+?)\s*-\s*\d{2}_\d{2}_\d{4}\.pdf$/);
      if (!match) {
        result.errors.push(`RFI file parse failed: ${filename}`);
        continue;
      }

      const projectCode = match[1];
      const rfiNum = match[2];
      const subject = match[3]?.trim();

      let projectId: string | null = null;
      const rfiEntries = Array.from(projectMap.entries());
      for (let i = 0; i < rfiEntries.length; i++) {
        const [pName, pId] = rfiEntries[i];
        if (pName.includes(projectCode) || projectCode.includes(pName.split(" ")[0])) {
          projectId = pId;
          break;
        }
      }

      if (!projectId) {
        projectId = await ensureProjectExists(projectCode, projectMap);
      }

      const rfiNumber = `RFI-${rfiNum}`;

      await db
        .insert(rfis)
        .values({
          id: generateId(),
          tenantId: DEFAULT_TENANT_ID,
          projectId,
          rfiNumber,
          subject: subject || `RFI ${rfiNum}`,
          question: `Imported from Procore: ${filename}`,
          status: "submitted",
          priority: "normal",
          attachmentsJson: {
            filename,
            source: "procore-import",
          },
        })
        .onConflictDoNothing();

      result.rfis++;
    } catch (e: any) {
      result.errors.push(`RFI file ${filename}: ${e.message}`);
    }
  }
}
