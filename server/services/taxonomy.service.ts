// Phase 1 Batch 7: single source of truth for jacket folder taxonomy.
//
// Before this batch we had three places defining what folders a bid /
// company / project jacket should contain:
//   1. shared/schema.ts — BID_JACKET_FOLDERS / COMPANY_JACKET_FOLDERS /
//      PROJECT_JACKET_FOLDERS (the canonical constants)
//   2. server/services/folder-taxonomy.service.ts (path-formatting layer
//      that already imports the constants — fine)
//   3. POST /api/seed/folder-sections in server/routes.ts — a hand-typed
//      list that disagreed with the constants (8 bid sections vs 18 in
//      the constant; different names).
//
// This service makes the constants the only source of truth. The DB
// `folder_sections` table becomes a derived/cached projection of the
// constants, seeded by `seedFolderSectionsFromConstants(tenantId)`.

import { db } from "../db";
import { folderSections } from "@shared/schema";
import {
  COMPANY_JACKET_FOLDERS,
  BID_JACKET_FOLDERS,
  PROJECT_JACKET_FOLDERS,
} from "@shared/schema";
import { and, eq } from "drizzle-orm";

export type JacketType = "company" | "bid" | "project";

export interface CanonicalSection {
  jacketType: JacketType;
  code: string;
  name: string;
  displayName: string;
  sortOrder: number;
  isSystem: boolean;
}

export function getCanonicalSections(jacketType: JacketType): CanonicalSection[] {
  switch (jacketType) {
    case "company":
      return COMPANY_JACKET_FOLDERS.map((f, i) => ({
        jacketType,
        code: f.code,
        name: normalizeName(f.name),
        displayName: f.name,
        sortOrder: i + 1,
        isSystem: true,
      }));
    case "bid":
      return BID_JACKET_FOLDERS.map((f, i) => ({
        jacketType,
        code: f.code,
        name: normalizeName(f.name),
        displayName: f.name,
        sortOrder: i + 1,
        isSystem: f.isSystemFolder,
      }));
    case "project":
      return PROJECT_JACKET_FOLDERS.map((f, i) => ({
        jacketType,
        code: f.code,
        name: normalizeName(f.name),
        displayName: f.name,
        sortOrder: i + 1,
        isSystem: true,
      }));
  }
}

export function getAllCanonicalSections(): CanonicalSection[] {
  return [
    ...getCanonicalSections("company"),
    ...getCanonicalSections("bid"),
    ...getCanonicalSections("project"),
  ];
}

export function normalizeName(displayName: string): string {
  return displayName
    .replace(/&/g, "and")
    .replace(/[^a-zA-Z0-9\s_-]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

export interface SeedResult {
  inserted: number;
  skipped: number;
  byType: Record<JacketType, { inserted: number; skipped: number }>;
}

/**
 * Idempotently seed folder_sections from the canonical constants.
 * Skips rows that already exist (matched on tenantId + jacketType + code).
 * Safe to call repeatedly; never overwrites existing rows.
 */
export async function seedFolderSectionsFromConstants(
  tenantId: string,
): Promise<SeedResult> {
  const result: SeedResult = {
    inserted: 0,
    skipped: 0,
    byType: {
      company: { inserted: 0, skipped: 0 },
      bid: { inserted: 0, skipped: 0 },
      project: { inserted: 0, skipped: 0 },
    },
  };

  const existing = await db
    .select({ jacketType: folderSections.jacketType, code: folderSections.code })
    .from(folderSections)
    .where(eq(folderSections.tenantId, tenantId));
  const existingKeys = new Set(existing.map((r) => `${r.jacketType}:${r.code}`));

  for (const section of getAllCanonicalSections()) {
    const key = `${section.jacketType}:${section.code}`;
    if (existingKeys.has(key)) {
      result.skipped++;
      result.byType[section.jacketType].skipped++;
      continue;
    }
    await db.insert(folderSections).values({
      tenantId,
      jacketType: section.jacketType,
      sortOrder: section.sortOrder,
      code: section.code,
      name: section.name,
      displayName: section.displayName,
    });
    result.inserted++;
    result.byType[section.jacketType].inserted++;
  }

  return result;
}

/**
 * Verify that the DB folder_sections rows match the canonical constants
 * for a given tenant. Returns lists of missing / extra / mismatched
 * sections so callers can render a drift report or trigger a reseed.
 */
export async function diffFolderSectionsAgainstConstants(
  tenantId: string,
): Promise<{
  missing: CanonicalSection[];
  extraInDb: Array<{ jacketType: string; code: string }>;
  nameMismatches: Array<{ jacketType: string; code: string; dbName: string; canonicalName: string }>;
}> {
  const dbRows = await db
    .select()
    .from(folderSections)
    .where(eq(folderSections.tenantId, tenantId));

  const canonical = getAllCanonicalSections();
  const canonicalIndex = new Map<string, CanonicalSection>(
    canonical.map((s) => [`${s.jacketType}:${s.code}`, s]),
  );
  const dbIndex = new Map<string, (typeof dbRows)[number]>(
    dbRows.map((r) => [`${r.jacketType}:${r.code}`, r]),
  );

  const missing = canonical.filter((s) => !dbIndex.has(`${s.jacketType}:${s.code}`));

  const extraInDb = dbRows
    .filter((r) => !canonicalIndex.has(`${r.jacketType}:${r.code}`))
    .map((r) => ({ jacketType: r.jacketType, code: r.code }));

  const nameMismatches: Array<{ jacketType: string; code: string; dbName: string; canonicalName: string }> = [];
  for (const r of dbRows) {
    const c = canonicalIndex.get(`${r.jacketType}:${r.code}`);
    if (!c) continue;
    if (r.displayName !== c.displayName || r.name !== c.name) {
      nameMismatches.push({
        jacketType: r.jacketType,
        code: r.code,
        dbName: `${r.name} / ${r.displayName}`,
        canonicalName: `${c.name} / ${c.displayName}`,
      });
    }
  }

  return { missing, extraInDb, nameMismatches };
}
