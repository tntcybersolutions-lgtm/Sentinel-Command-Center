import { db } from "../db";
import { companies, jacketFolders, bidProjects, projects } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { 
  COMPANY_JACKET_FOLDERS, 
  BID_JACKET_FOLDERS, 
  PROJECT_JACKET_FOLDERS,
  BID_DOC_ROUTING,
  EGNYTE_ROOT_PATH 
} from "@shared/schema";

export interface FolderStructure {
  code: string;
  name: string;
  path: string;
}

export class FolderTaxonomyService {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  normalizeCompanyName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  formatBidFolderName(noticeId: string, shortTitle: string, dueDate: Date | null): string {
    const title = shortTitle.substring(0, 50).replace(/[^a-zA-Z0-9\s-]/g, "").trim();
    const dueDateStr = dueDate ? dueDate.toISOString().split("T")[0] : "TBD";
    return `BID - ${noticeId} - ${title} - DUE ${dueDateStr}`;
  }

  formatProjectFolderName(projectId: string, shortTitle: string, startDate: Date | null): string {
    const title = shortTitle.substring(0, 50).replace(/[^a-zA-Z0-9\s-]/g, "").trim();
    const startDateStr = startDate ? startDate.toISOString().split("T")[0] : "TBD";
    return `PROJECT - ${projectId} - ${title} - START ${startDateStr}`;
  }

  getCompanyJacketPath(companyName: string): string {
    const normalized = this.normalizeCompanyName(companyName);
    return `${EGNYTE_ROOT_PATH}/${normalized}`;
  }

  getBidJacketPath(companyName: string, bidFolderName: string): string {
    const companyPath = this.getCompanyJacketPath(companyName);
    return `${companyPath}/01 - Active Bids/${bidFolderName}`;
  }

  getProjectJacketPath(companyName: string, projectFolderName: string): string {
    const companyPath = this.getCompanyJacketPath(companyName);
    return `${companyPath}/02 - Active Projects/${projectFolderName}`;
  }

  getCompanyJacketFolders(companyName: string): FolderStructure[] {
    const basePath = this.getCompanyJacketPath(companyName);
    return COMPANY_JACKET_FOLDERS.map(folder => ({
      code: folder.code,
      name: folder.name,
      path: `${basePath}/${folder.code} - ${folder.name}`,
    }));
  }

  getBidJacketFolders(companyName: string, bidFolderName: string): FolderStructure[] {
    const basePath = this.getBidJacketPath(companyName, bidFolderName);
    return BID_JACKET_FOLDERS.map(folder => ({
      code: folder.code,
      name: folder.name,
      path: `${basePath}/${folder.code} - ${folder.name}`,
    }));
  }

  getProjectJacketFolders(companyName: string, projectFolderName: string): FolderStructure[] {
    const basePath = this.getProjectJacketPath(companyName, projectFolderName);
    return PROJECT_JACKET_FOLDERS.map(folder => ({
      code: folder.code,
      name: folder.name,
      path: `${basePath}/${folder.code} - ${folder.name}`,
    }));
  }

  async createCompanyJacketFolders(companyId: string, companyName: string): Promise<void> {
    const folders = this.getCompanyJacketFolders(companyName);
    
    for (const folder of folders) {
      await db.insert(jacketFolders).values({
        tenantId: this.tenantId,
        jacketType: "company",
        jacketId: companyId,
        name: `${folder.code} - ${folder.name}`,
        path: folder.path,
        sortOrder: parseInt(folder.code),
        isSystemFolder: true,
      }).onConflictDoNothing();
    }
  }

  async createBidJacketFolders(
    bidProjectId: string, 
    companyName: string, 
    noticeId: string, 
    title: string, 
    dueDate: Date | null
  ): Promise<string> {
    const bidFolderName = this.formatBidFolderName(noticeId, title, dueDate);
    const folders = this.getBidJacketFolders(companyName, bidFolderName);
    
    for (const folder of folders) {
      await db.insert(jacketFolders).values({
        tenantId: this.tenantId,
        jacketType: "bid",
        jacketId: bidProjectId,
        name: `${folder.code} - ${folder.name}`,
        path: folder.path,
        sortOrder: parseInt(folder.code),
        isSystemFolder: true,
      }).onConflictDoNothing();
    }

    return this.getBidJacketPath(companyName, bidFolderName);
  }

  async createBidJacketFoldersSimple(
    bidProjectId: string,
    opportunityTitle: string | null
  ): Promise<void> {
    const titleToUse = opportunityTitle || "Untitled Bid";
    const safeTitle = titleToUse
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .substring(0, 60)
      .trim() || "Bid";
    
    for (const folder of BID_JACKET_FOLDERS) {
      const basePath = `Bids/${bidProjectId.substring(0, 8)}/${safeTitle}`;
      await db.insert(jacketFolders).values({
        tenantId: this.tenantId,
        jacketType: "bid",
        jacketId: bidProjectId,
        name: `${folder.code} - ${folder.name}`,
        path: `${basePath}/${folder.code} - ${folder.name}`,
        sortOrder: parseInt(folder.code),
        isSystemFolder: true,
      }).onConflictDoNothing();
    }
  }

  async createProjectJacketFolders(
    projectId: string, 
    companyName: string, 
    projectNumber: string, 
    title: string, 
    startDate: Date | null
  ): Promise<string> {
    const projectFolderName = this.formatProjectFolderName(projectNumber, title, startDate);
    const folders = this.getProjectJacketFolders(companyName, projectFolderName);
    
    for (const folder of folders) {
      await db.insert(jacketFolders).values({
        tenantId: this.tenantId,
        jacketType: "project",
        jacketId: projectId,
        name: `${folder.code} - ${folder.name}`,
        path: folder.path,
        sortOrder: parseInt(folder.code),
        isSystemFolder: true,
      }).onConflictDoNothing();
    }

    return this.getProjectJacketPath(companyName, projectFolderName);
  }

  getBidFolderForDocumentType(documentType: string): { code: string; name: string } | null {
    const extendedRouting: Record<string, string> = {
      ...BID_DOC_ROUTING,
      rfp: "01",
      ifb: "01",
      rfq: "01",
      addendum: "02",
      modification: "02",
      scope: "05",
      sow: "05",
      statement_of_work: "05",
      drawing: "05",
      plan: "05",
      blueprint: "05",
      schematic: "05",
      spec: "05",
      specification: "05",
      materials: "05",
      compliance: "08",
      representation: "08",
      cert: "08",
      bond: "07",
      coi: "07",
      submittal: "04",
      qa: "04",
      reference: "09",
      experience: "09",
      subcontractor: "06",
      quote: "06",
    };

    const code = extendedRouting[documentType.toLowerCase()];
    if (!code) return null;

    const folder = BID_JACKET_FOLDERS.find(f => f.code === code);
    return folder ? { code: folder.code, name: folder.name } : null;
  }

  validateFolderPath(path: string): boolean {
    if (!path.startsWith(EGNYTE_ROOT_PATH)) {
      return false;
    }

    const segments = path.replace(EGNYTE_ROOT_PATH + "/", "").split("/");
    if (segments.length < 1) return false;

    for (const segment of segments.slice(1)) {
      const match = segment.match(/^(\d{2})\s*-\s*.+$/);
      if (segment && !match) {
        return false;
      }
    }

    return true;
  }
}

export function createFolderTaxonomyService(tenantId: string): FolderTaxonomyService {
  return new FolderTaxonomyService(tenantId);
}
