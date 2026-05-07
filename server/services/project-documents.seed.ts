import { db } from "../db";
import { projectFolders } from "../../shared/schema";
import { and, eq } from "drizzle-orm";

type SeedFolder = { name: string; sortOrder: number; parentFolderId?: string | null };

export const DEFAULT_PROJECT_FOLDERS: SeedFolder[] = [
  { name: "01_Project Admin", sortOrder: 10 },
  { name: "02_Contract", sortOrder: 20 },
  { name: "03_Submittals", sortOrder: 30 },
  { name: "04_RFIs", sortOrder: 40 },
  { name: "05_Drawings", sortOrder: 50 },
  { name: "06_Specifications", sortOrder: 60 },
  { name: "07_Bid Forms", sortOrder: 70 },
  { name: "08_Addenda", sortOrder: 80 },
  { name: "09_Photos", sortOrder: 90 },
  { name: "10_Closeout", sortOrder: 100 },
  { name: "11_Lien_Waivers", sortOrder: 110 },

  { name: "01_Admin", sortOrder: 1000 },
  { name: "03_Drawings_Specs", sortOrder: 1010 },
  { name: "05_Submittals", sortOrder: 1020 },
  { name: "07_Purchase_Orders", sortOrder: 1030 },
  { name: "08_Invoices", sortOrder: 1040 },
  { name: "09_Daily_Logs", sortOrder: 1050 },
  { name: "06_Change_Orders", sortOrder: 1060 },
];

export async function ensureDefaultProjectFolders(tenantId: string, projectId: string) {
  const existing = await db
    .select({ name: projectFolders.name })
    .from(projectFolders)
    .where(and(eq(projectFolders.tenantId, tenantId), eq(projectFolders.projectId, projectId)));

  const existingNames = new Set(existing.map((f) => f.name));
  const toCreate = DEFAULT_PROJECT_FOLDERS.filter((f) => !existingNames.has(f.name));

  if (toCreate.length === 0) return { created: 0, skipped: true };

  const rows = toCreate.map((f) => ({
    tenantId,
    projectId,
    parentFolderId: f.parentFolderId ?? null,
    name: f.name,
    sortOrder: f.sortOrder,
  }));

  for (const row of rows) {
    try {
      await db.insert(projectFolders).values(row).onConflictDoNothing();
    } catch {}
  }

  return { created: toCreate.length, skipped: false };
}

export async function getProjectFolderMap(tenantId: string, projectId: string) {
  const folders = await db
    .select({
      id: projectFolders.id,
      name: projectFolders.name,
      sortOrder: projectFolders.sortOrder,
    })
    .from(projectFolders)
    .where(and(eq(projectFolders.tenantId, tenantId), eq(projectFolders.projectId, projectId)));

  const byName = new Map<string, string>();
  for (const f of folders) byName.set(f.name, f.id);

  return { folders, byName };
}

export const seedDefaultProjectFolders = ensureDefaultProjectFolders;
