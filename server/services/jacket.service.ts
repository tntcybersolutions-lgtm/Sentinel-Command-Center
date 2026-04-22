import { db } from "../db";
import {
  jacketFolders, jacketDocuments,
  COMPANY_JACKET_FOLDERS, BID_JACKET_FOLDERS, BID_DOC_ROUTING,
  bidJacketFolderDisplayName, bidJacketFolderPath,
  type EnsureCanonicalResult,
} from "@shared/schema";
import { eq, and, asc } from "drizzle-orm";
import crypto from "crypto";

const COMPANY_DOC_ROUTING: Record<string, string> = {
  insurance: "04",
  invoice: "05",
  pay_app: "05",
  plan: "06",
  spec: "06",
  drawing: "06",
  photo: "07",
  correspondence: "08",
  email: "08",
};

async function createCompanyJacket(tenantId: string, companyId: string, companyName: string) {
  const existing = await db
    .select()
    .from(jacketFolders)
    .where(
      and(
        eq(jacketFolders.tenantId, tenantId),
        eq(jacketFolders.jacketType, "company"),
        eq(jacketFolders.jacketId, companyId)
      )
    );

  if (existing.length > 0) {
    return { created: false, folders: existing, message: "Company jacket already exists" };
  }

  const basePath = `/Company Jackets/${companyName}`;
  const folders = COMPANY_JACKET_FOLDERS.map((folder, idx) => ({
    id: crypto.randomUUID(),
    tenantId,
    jacketType: "company" as const,
    jacketId: companyId,
    name: `${folder.code} - ${folder.name}`,
    path: `${basePath}/${folder.code}_${folder.name.replace(/\s+/g, "_").replace(/&/g, "and")}`,
    sortOrder: parseInt(folder.code) || idx,
    documentCount: 0,
    totalSizeBytes: 0,
    isSystemFolder: true,
  }));

  const inserted = await db.insert(jacketFolders).values(folders).returning();
  return { created: true, folders: inserted, message: `Created ${inserted.length}-folder company jacket` };
}

async function createBidJacket(
  tenantId: string,
  bidProjectId: string,
  noticeId: string,
  shortTitle: string,
  dueDate: string
) {
  const existing = await db
    .select()
    .from(jacketFolders)
    .where(
      and(
        eq(jacketFolders.tenantId, tenantId),
        eq(jacketFolders.jacketType, "bid"),
        eq(jacketFolders.jacketId, bidProjectId)
      )
    )
    .orderBy(asc(jacketFolders.sortOrder));

  if (existing.length > 0) {
    return { created: false, folders: existing, message: "Bid jacket already exists" };
  }

  const jacketName = `${noticeId} - ${shortTitle} (${dueDate})`;
  const basePath = `/Bids/${jacketName}`;
  const folders = BID_JACKET_FOLDERS.map((folder) => ({
    id: crypto.randomUUID(),
    tenantId,
    jacketType: "bid" as const,
    jacketId: bidProjectId,
    name: `${folder.code} - ${folder.name}`,
    path: `${basePath}/${bidJacketFolderPath(folder.code)}`,
    sortOrder: parseInt(folder.code),
    documentCount: 0,
    totalSizeBytes: 0,
    isSystemFolder: true,
  }));

  await db.insert(jacketFolders).values(folders).onConflictDoNothing({
    target: [jacketFolders.tenantId, jacketFolders.jacketType, jacketFolders.jacketId, jacketFolders.sortOrder],
  });

  const inserted = await db
    .select()
    .from(jacketFolders)
    .where(
      and(
        eq(jacketFolders.tenantId, tenantId),
        eq(jacketFolders.jacketType, "bid"),
        eq(jacketFolders.jacketId, bidProjectId)
      )
    )
    .orderBy(asc(jacketFolders.sortOrder));

  return { created: true, folders: inserted, message: `Created ${inserted.length}-folder bid jacket` };
}

async function getCompanyJacketFolders(tenantId: string, companyId: string) {
  return db
    .select()
    .from(jacketFolders)
    .where(
      and(
        eq(jacketFolders.tenantId, tenantId),
        eq(jacketFolders.jacketType, "company"),
        eq(jacketFolders.jacketId, companyId)
      )
    )
    .orderBy(asc(jacketFolders.sortOrder));
}

async function getBidJacketFolders(tenantId: string, bidProjectId: string) {
  return db
    .select()
    .from(jacketFolders)
    .where(
      and(
        eq(jacketFolders.tenantId, tenantId),
        eq(jacketFolders.jacketType, "bid"),
        eq(jacketFolders.jacketId, bidProjectId)
      )
    )
    .orderBy(asc(jacketFolders.sortOrder));
}

async function getJacketDocuments(tenantId: string, folderId: string) {
  return db
    .select()
    .from(jacketDocuments)
    .where(
      and(
        eq(jacketDocuments.tenantId, tenantId),
        eq(jacketDocuments.folderId, folderId)
      )
    );
}

function routeDocumentToFolder(
  docType: string,
  jacketType: "bid" | "company"
): { folderId: string; folderName: string } {
  const normalizedType = docType.toLowerCase().trim();

  if (jacketType === "bid") {
    const code = BID_DOC_ROUTING[normalizedType] || "00";
    return { folderId: code, folderName: bidJacketFolderDisplayName(code) };
  }

  const code = COMPANY_DOC_ROUTING[normalizedType] || "00";
  const folder = COMPANY_JACKET_FOLDERS.find((f) => f.code === code) || COMPANY_JACKET_FOLDERS[0];
  return { folderId: code, folderName: `${folder.code} - ${folder.name}` };
}

function jacketPath(jacketId: string, folderName: string): string {
  return `/Bids/${jacketId}/${folderName}`;
}

async function ensureCanonicalBidJacket(
  tenantId: string,
  bidProjectId: string
): Promise<EnsureCanonicalResult> {
  const canonicalSortOrders = BID_JACKET_FOLDERS.map(f => parseInt(f.code));

  const existing = await db
    .select()
    .from(jacketFolders)
    .where(
      and(
        eq(jacketFolders.tenantId, tenantId),
        eq(jacketFolders.jacketType, "bid"),
        eq(jacketFolders.jacketId, bidProjectId)
      )
    )
    .orderBy(asc(jacketFolders.sortOrder));

  const existingSortOrders = new Set(existing.map(f => f.sortOrder));
  const missingSorts = canonicalSortOrders.filter(so => !existingSortOrders.has(so));

  const created: string[] = [];
  if (missingSorts.length > 0) {
    const newFolders = missingSorts.map(sortOrder => {
      const canonical = BID_JACKET_FOLDERS.find(f => parseInt(f.code) === sortOrder)!;
      const canonicalName = `${canonical.code} - ${canonical.name}`;
      const canonicalPathStr = jacketPath(bidProjectId, bidJacketFolderPath(canonical.code));
      return {
        id: crypto.randomUUID(),
        tenantId,
        jacketType: "bid" as const,
        jacketId: bidProjectId,
        name: canonicalName,
        path: canonicalPathStr,
        sortOrder,
        documentCount: 0,
        totalSizeBytes: 0,
        isSystemFolder: true,
      };
    });

    for (const folder of newFolders) {
      try {
        await db.insert(jacketFolders).values(folder).onConflictDoNothing({
          target: [jacketFolders.tenantId, jacketFolders.jacketType, jacketFolders.jacketId, jacketFolders.sortOrder],
        });
        created.push(folder.name);
      } catch (e) {
        // unique constraint on name may fire — try with suffixed name
        try {
          const suffixed = { ...folder, name: `${folder.name} (canonical)`, id: crypto.randomUUID() };
          await db.insert(jacketFolders).values(suffixed).onConflictDoNothing({
            target: [jacketFolders.tenantId, jacketFolders.jacketType, jacketFolders.jacketId, jacketFolders.sortOrder],
          });
          created.push(suffixed.name);
        } catch {
          // already exists by sort_order — skip
        }
      }
    }
  }

  const renamed: { from: string; to: string; sortOrder: number }[] = [];
  for (const folder of existing) {
    const canonical = BID_JACKET_FOLDERS.find(f => parseInt(f.code) === folder.sortOrder);
    if (!canonical) continue;
    const expectedName = `${canonical.code} - ${canonical.name}`;
    if (folder.name !== expectedName) {
      const expectedPath = jacketPath(bidProjectId, bidJacketFolderPath(canonical.code));
      try {
        await db.update(jacketFolders)
          .set({ name: expectedName, path: expectedPath, isSystemFolder: true })
          .where(eq(jacketFolders.id, folder.id));
        renamed.push({ from: folder.name, to: expectedName, sortOrder: folder.sortOrder });
      } catch {
        // name unique constraint conflict — another folder already has this name
      }
    }
  }

  const finalFolders = await db
    .select()
    .from(jacketFolders)
    .where(
      and(
        eq(jacketFolders.tenantId, tenantId),
        eq(jacketFolders.jacketType, "bid"),
        eq(jacketFolders.jacketId, bidProjectId)
      )
    )
    .orderBy(asc(jacketFolders.sortOrder));

  const finalSortOrders = new Set(finalFolders.map(f => f.sortOrder));
  const stillMissing = canonicalSortOrders.filter(so => !finalSortOrders.has(so));

  const sortOrderCounts: Record<number, number> = {};
  for (const f of finalFolders) {
    sortOrderCounts[f.sortOrder] = (sortOrderCounts[f.sortOrder] || 0) + 1;
  }
  const hasDuplicates = Object.values(sortOrderCounts).some(c => c > 1);

  const allNamesCanonical = finalFolders.every(f => {
    const canonical = BID_JACKET_FOLDERS.find(bf => parseInt(bf.code) === f.sortOrder);
    if (!canonical) return true;
    return f.name === `${canonical.code} - ${canonical.name}`;
  });

  return {
    bidProjectId,
    expectedFolders: BID_JACKET_FOLDERS.length,
    totalFolders: finalFolders.length,
    createdFolders: created.length,
    renamedFolders: renamed.length,
    missingSortOrders: stillMissing,
    isHealthy: stillMissing.length === 0 && !hasDuplicates && allNamesCanonical,
    details: { created, renamed },
  };
}

export const jacketService = {
  createCompanyJacket,
  createBidJacket,
  getCompanyJacketFolders,
  getBidJacketFolders,
  getJacketDocuments,
  routeDocumentToFolder,
  jacketPath,
  ensureCanonicalBidJacket,
  COMPANY_JACKET_FOLDERS,
  BID_JACKET_FOLDERS,
};
