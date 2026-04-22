import { db } from "../db";
import { jacketFolders, bidProjects } from "@shared/schema";
import { BID_JACKET_FOLDERS, bidJacketFolderDisplayName, bidJacketFolderPath } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { AuditService } from "./audit.service";
import { jacketService } from "./jacket.service";

const DEFAULT_TENANT = "blackhawk-default";
const auditService = new AuditService();

interface RepairResult {
  bidProjectId: string;
  foldersCreated: string[];
  foldersRenamed: { from: string; to: string }[];
  legacyFoldersMarked: string[];
  alreadyCanonical: number;
}

const LEGACY_NAME_MAP: Record<string, string> = {
  "00-Intake": "00",
  "00_Intake": "00",
  "01-Solicitation": "01",
  "01_Solicitation": "01",
  "01_Bid_Request": "01",
  "02-Amendments": "02",
  "02_Amendments": "02",
  "03-Pre-Bid": "03",
  "03_Pre_Bid": "03",
  "04-RFIs": "04",
  "04_RFIs": "04",
  "04_RFIs_and_QA": "04",
  "05-Estimating": "05",
  "05_Plans_Specs": "05",
  "05_Estimating": "05",
  "06-Sub-Quotes": "06",
  "06_Sub_Quotes": "06",
  "06_Subcontractor_Quotes": "06",
  "07-Insurance-Bonding": "07",
  "07_Insurance_Bonding": "07",
  "07_Insurance_and_Bonding": "07",
  "08-Forms-Certs": "08",
  "08_Forms_Certs": "08",
  "08_Forms_and_Certifications": "08",
  "09-Past-Performance": "09",
  "09_Past_Performance": "09",
  "10-Technical": "10",
  "10_Technical_Proposal": "10",
  "10_Technical": "10",
  "11-Pricing": "11",
  "11_Pricing": "11",
  "12-Submission": "12",
  "12_Final_Submission": "12",
  "12_Submission": "12",
  "13-Debrief": "13",
  "13_Debrief_and_Lessons": "13",
  "13_Debrief": "13",
  "14-Post-Award": "14",
  "14_Post_Award": "14",
  "14-Post Award": "14",
  "15-Photos": "15",
  "15_Photos": "15",
  "98-Herbie-Evidence-Map": "98",
  "98_Herbie_Evidence_Map": "98",
  "99-Archive": "99",
  "99_Archive": "99",
};

function extractCodeFromName(name: string): string | null {
  const dashSpaceMatch = name.match(/^(\d{2})\s*-\s*/);
  if (dashSpaceMatch) return dashSpaceMatch[1];

  const underscoreMatch = name.match(/^(\d{2})_/);
  if (underscoreMatch) return underscoreMatch[1];

  const dashMatch = name.match(/^(\d{2})-/);
  if (dashMatch) return dashMatch[1];

  if (LEGACY_NAME_MAP[name]) return LEGACY_NAME_MAP[name];

  return null;
}

export async function repairBidJacket(bidProjectId: string): Promise<RepairResult> {
  const result: RepairResult = {
    bidProjectId,
    foldersCreated: [],
    foldersRenamed: [],
    legacyFoldersMarked: [],
    alreadyCanonical: 0,
  };

  const existingFolders = await db.select().from(jacketFolders).where(
    and(
      eq(jacketFolders.tenantId, DEFAULT_TENANT),
      eq(jacketFolders.jacketType, "bid"),
      eq(jacketFolders.jacketId, bidProjectId)
    )
  );

  const canonicalCodes = new Set(BID_JACKET_FOLDERS.map(f => f.code as string));
  const existingCodes = new Map<string, typeof existingFolders[0]>();

  for (const folder of existingFolders) {
    const code = extractCodeFromName(folder.name);
    if (code && canonicalCodes.has(code)) {
      const canonicalName = bidJacketFolderDisplayName(code);
      const canonicalPath = jacketService.jacketPath(bidProjectId, bidJacketFolderPath(code));

      if (folder.name === canonicalName) {
        result.alreadyCanonical++;
      } else {
        await db.update(jacketFolders)
          .set({
            name: canonicalName,
            path: canonicalPath,
            sortOrder: parseInt(code),
            isSystemFolder: true,
          })
          .where(eq(jacketFolders.id, folder.id));

        result.foldersRenamed.push({ from: folder.name, to: canonicalName });
      }
      existingCodes.set(code, folder);
    } else {
      result.legacyFoldersMarked.push(folder.name);
    }
  }

  for (const canonical of BID_JACKET_FOLDERS) {
    const code = canonical.code as string;
    if (!existingCodes.has(code)) {
      const canonicalName = bidJacketFolderDisplayName(code);
      const canonicalPath = jacketService.jacketPath(bidProjectId, bidJacketFolderPath(code));
      await db.insert(jacketFolders).values({
        tenantId: DEFAULT_TENANT,
        jacketType: "bid",
        jacketId: bidProjectId,
        name: canonicalName,
        path: canonicalPath,
        sortOrder: parseInt(code),
        isSystemFolder: true,
      }).onConflictDoNothing();
      result.foldersCreated.push(canonicalName);
    }
  }

  await auditService.logEvent({
    tenantId: DEFAULT_TENANT,
    eventType: "jacket_repair",
    actor: "system:jacket-repair",
    entityType: "bid_jacket",
    entityId: bidProjectId,
    afterJson: {
      foldersCreated: result.foldersCreated.length,
      foldersRenamed: result.foldersRenamed.length,
      legacyFoldersMarked: result.legacyFoldersMarked.length,
      alreadyCanonical: result.alreadyCanonical,
    },
  });

  return result;
}

export async function repairAllBidJackets(): Promise<{
  totalBids: number;
  repaired: number;
  alreadyClean: number;
  results: RepairResult[];
}> {
  const allBids = await db.select({ id: bidProjects.id }).from(bidProjects).where(
    eq(bidProjects.tenantId, DEFAULT_TENANT)
  );

  const results: RepairResult[] = [];
  let repaired = 0;
  let alreadyClean = 0;

  for (const bid of allBids) {
    const result = await repairBidJacket(bid.id);
    results.push(result);
    if (result.foldersCreated.length > 0 || result.foldersRenamed.length > 0 || result.legacyFoldersMarked.length > 0) {
      repaired++;
    } else {
      alreadyClean++;
    }
  }

  return { totalBids: allBids.length, repaired, alreadyClean, results };
}
