import { db } from "../db";
import {
  binderJobs,
  bidProjects,
  jacketFolders,
  jacketDocuments,
  opportunities,
  bidBinderVersions,
  bidAddenda,
  BID_JACKET_FOLDERS,
} from "@shared/schema";
import { eq, and, sql, desc, asc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { PDFDocument, StandardFonts, rgb, PageSizes } from "pdf-lib";
import archiver from "archiver";
import { PassThrough } from "stream";
import { objectStorageClient } from "../replit_integrations/object_storage/objectStorage";

interface FolderManifest {
  folderId: string;
  folderName: string;
  sortOrder: number;
  documents: DocManifest[];
}

interface DocManifest {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  mimeType: string | null;
  fileSizeBytes: number;
  storageKey: string;
  createdAt: Date;
}

interface TOCEntry {
  title: string;
  page: number;
  level: number;
  children?: TOCEntry[];
}

interface SectionPageMap {
  sectionCode: string;
  sectionName: string;
  documents: { fileName: string; docId: string; version: number; startPage: number; endPage: number }[];
  startPage: number;
  endPage: number;
}

interface BinderGenerationResult {
  binderId: string;
  version: number;
  pageCount: number;
  storageKey: string;
  pageMapJson: { sections: SectionPageMap[] };
  tocJson: TOCEntry[];
}

function parseObjectPath(p: string): { bucketName: string; objectName: string } {
  if (!p.startsWith("/")) p = `/${p}`;
  const parts = p.split("/");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

async function getObjectFile(storageKey: string): Promise<any> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
  let objectPath: string;
  if (storageKey.startsWith("/objects/")) {
    objectPath = `${privateDir}/${storageKey.slice("/objects/".length)}`;
  } else {
    objectPath = storageKey;
  }
  const { bucketName, objectName } = parseObjectPath(objectPath);
  const bucket = objectStorageClient.bucket(bucketName);
  return bucket.file(objectName);
}

export class BidBinderService {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  async createBinderJob(
    bidProjectId: string,
    options: {
      includeMergedPdf?: boolean;
      includeZip?: boolean;
      watermark?: boolean;
      includeLegacyFolders?: boolean;
      createdBy?: string;
    } = {}
  ): Promise<{ jobId: string; status: string }> {
    const [bid] = await db
      .select()
      .from(bidProjects)
      .where(and(eq(bidProjects.id, bidProjectId), eq(bidProjects.tenantId, this.tenantId)))
      .limit(1);

    if (!bid) {
      throw new Error(`Bid project ${bidProjectId} not found`);
    }

    const jobId = randomUUID();
    await db.insert(binderJobs).values({
      id: jobId,
      tenantId: this.tenantId,
      bidProjectId,
      status: "queued",
      progress: 0,
      includeMergedPdf: options.includeMergedPdf !== false,
      includeZip: options.includeZip !== false,
      watermark: options.watermark || false,
      includeLegacyFolders: options.includeLegacyFolders !== false,
      createdBy: options.createdBy || null,
    });

    setTimeout(() => {
      this.processBinderJob(jobId).catch((err) => {
        console.error(`[BINDER] Fatal error in job ${jobId}:`, err);
      });
    }, 0);

    return { jobId, status: "queued" };
  }

  async getJobStatus(jobId: string): Promise<{
    status: string;
    progress: number;
    outputs: { zipDocumentId: string | null; pdfDocumentId: string | null };
    error: string | null;
  }> {
    const [job] = await db
      .select()
      .from(binderJobs)
      .where(and(eq(binderJobs.id, jobId), eq(binderJobs.tenantId, this.tenantId)))
      .limit(1);

    if (!job) {
      throw new Error(`Binder job ${jobId} not found`);
    }

    return {
      status: job.status,
      progress: job.progress,
      outputs: {
        zipDocumentId: job.zipDocumentId,
        pdfDocumentId: job.pdfDocumentId,
      },
      error: job.error,
    };
  }

  private async updateProgress(jobId: string, progress: number): Promise<void> {
    await db
      .update(binderJobs)
      .set({ progress })
      .where(eq(binderJobs.id, jobId));
  }

  private async processBinderJob(jobId: string): Promise<void> {
    try {
      await db
        .update(binderJobs)
        .set({ status: "running", startedAt: new Date(), progress: 5 })
        .where(eq(binderJobs.id, jobId));

      const [job] = await db
        .select()
        .from(binderJobs)
        .where(eq(binderJobs.id, jobId))
        .limit(1);

      if (!job) throw new Error("Job not found");

      const bidProjectId = job.bidProjectId;

      const bidResult = await db
        .select()
        .from(bidProjects)
        .innerJoin(opportunities, eq(bidProjects.opportunityId, opportunities.id))
        .where(eq(bidProjects.id, bidProjectId))
        .limit(1);

      if (bidResult.length === 0) throw new Error("Bid project not found");

      const opportunity = bidResult[0].opportunities;

      const folders = await db
        .select()
        .from(jacketFolders)
        .where(
          and(
            eq(jacketFolders.tenantId, this.tenantId),
            eq(jacketFolders.jacketType, "bid"),
            eq(jacketFolders.jacketId, bidProjectId)
          )
        )
        .orderBy(asc(jacketFolders.sortOrder));

      const manifest: FolderManifest[] = [];
      let totalDocCount = 0;

      for (const folder of folders) {
        const docs = await db
          .select({
            id: jacketDocuments.id,
            title: jacketDocuments.title,
            fileName: jacketDocuments.fileName,
            fileType: jacketDocuments.fileType,
            mimeType: jacketDocuments.mimeType,
            fileSizeBytes: jacketDocuments.fileSizeBytes,
            storageKey: jacketDocuments.storageKey,
            createdAt: jacketDocuments.createdAt,
          })
          .from(jacketDocuments)
          .where(
            and(
              eq(jacketDocuments.folderId, folder.id),
              eq(jacketDocuments.latestVersion, true),
              eq(jacketDocuments.status, "active")
            )
          )
          .orderBy(asc(jacketDocuments.createdAt));

        manifest.push({
          folderId: folder.id,
          folderName: folder.name,
          sortOrder: folder.sortOrder,
          documents: docs,
        });
        totalDocCount += docs.length;
      }

      const allDocs: { doc: DocManifest; folderName: string; sortOrder: number }[] = [];
      for (const fm of manifest) {
        for (const doc of fm.documents) {
          allDocs.push({ doc, folderName: fm.folderName, sortOrder: fm.sortOrder });
        }
      }

      const downloadedBuffers = new Map<string, Buffer>();
      for (let i = 0; i < allDocs.length; i++) {
        const { doc } = allDocs[i];
        try {
          const buf = await this.downloadDocBuffer(doc.storageKey);
          if (buf) {
            downloadedBuffers.set(doc.id, buf);
          }
        } catch (err) {
          console.warn(`[BINDER] Failed to download doc ${doc.id} (${doc.fileName}):`, err);
        }
        const dlProgress = 10 + Math.floor((i / Math.max(allDocs.length, 1)) * 30);
        await this.updateProgress(jobId, dlProgress);
      }

      let pdfBuffer: Buffer | null = null;
      let pdfStorageKey: string | null = null;

      if (job.includeMergedPdf) {
        pdfBuffer = await this.generateMergedPdf(
          jobId,
          opportunity,
          manifest,
          downloadedBuffers,
          bidProjectId
        );
        await this.updateProgress(jobId, 80);
      }

      let zipBuffer: Buffer | null = null;
      let zipStorageKey: string | null = null;

      if (job.includeZip) {
        zipBuffer = await this.generateZipPackage(
          manifest,
          downloadedBuffers,
          opportunity,
          bidProjectId
        );
        await this.updateProgress(jobId, 90);
      }

      if (pdfBuffer) {
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        pdfStorageKey = await this.uploadToStorage(
          pdfBuffer,
          `Bid_Binder_${ts}.pdf`,
          "application/pdf",
          bidProjectId
        );
      }

      if (zipBuffer) {
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        zipStorageKey = await this.uploadToStorage(
          zipBuffer,
          `Bid_Binder_${ts}.zip`,
          "application/zip",
          bidProjectId
        );
      }

      await this.updateProgress(jobId, 95);

      const submissionFolder = await this.getOrCreateSubmissionFolder(bidProjectId);

      let pdfDocumentId: string | null = null;
      let zipDocumentId: string | null = null;

      if (pdfStorageKey && pdfBuffer && submissionFolder) {
        const docId = randomUUID();
        await db.insert(jacketDocuments).values({
          id: docId,
          tenantId: this.tenantId,
          folderId: submissionFolder.id,
          title: "Bid Binder (Merged PDF)",
          fileName: `Bid_Binder.pdf`,
          fileType: "pdf",
          mimeType: "application/pdf",
          fileSizeBytes: pdfBuffer.length,
          storageKey: pdfStorageKey,
          version: 1,
          latestVersion: true,
          documentType: "binder",
          source: "binder",
          generatedBy: "binder-service",
          generatedType: "bid_binder_pdf",
          isGenerated: true,
          binderJobId: jobId,
          status: "active",
          uploadedBy: job.createdBy || "binder-service",
        });
        pdfDocumentId = docId;
      }

      if (zipStorageKey && zipBuffer && submissionFolder) {
        const docId = randomUUID();
        await db.insert(jacketDocuments).values({
          id: docId,
          tenantId: this.tenantId,
          folderId: submissionFolder.id,
          title: "Bid Binder (ZIP Package)",
          fileName: `Bid_Binder.zip`,
          fileType: "zip",
          mimeType: "application/zip",
          fileSizeBytes: zipBuffer.length,
          storageKey: zipStorageKey,
          version: 1,
          latestVersion: true,
          documentType: "binder",
          source: "binder",
          generatedBy: "binder-service",
          generatedType: "bid_binder_zip",
          isGenerated: true,
          binderJobId: jobId,
          status: "active",
          uploadedBy: job.createdBy || "binder-service",
        });
        zipDocumentId = docId;
      }

      await db
        .update(binderJobs)
        .set({
          status: "complete",
          progress: 100,
          zipDocumentId,
          pdfDocumentId,
          zipStorageKey,
          pdfStorageKey,
          completedAt: new Date(),
        })
        .where(eq(binderJobs.id, jobId));

      console.log(
        `[BINDER] Job ${jobId} complete. ` +
          `BID_BINDER_GENERATED | bidProjectId=${bidProjectId} | ` +
          `docCount=${totalDocCount} | folderCount=${manifest.length} | ` +
          `pdfDocumentId=${pdfDocumentId} | zipDocumentId=${zipDocumentId}`
      );
    } catch (error: any) {
      console.error(`[BINDER] Job ${jobId} failed:`, error);
      await db
        .update(binderJobs)
        .set({
          status: "failed",
          error: error?.message || "Unknown error",
          completedAt: new Date(),
        })
        .where(eq(binderJobs.id, jobId));
    }
  }

  private async generateMergedPdf(
    jobId: string,
    opportunity: any,
    manifest: FolderManifest[],
    downloadedBuffers: Map<string, Buffer>,
    bidProjectId: string
  ): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const noticeId = opportunity.externalId || "N/A";

    await this.createCoverPage(pdfDoc, opportunity.title, noticeId, new Date());

    const tocPlaceholderPageIndex = pdfDoc.getPageCount();
    const tempTocPage = pdfDoc.addPage(PageSizes.Letter);

    let currentPage = 3;
    const sections: { folderName: string; sortOrder: number; docCount: number; totalSize: number }[] = [];
    const sectionPages: { folderName: string; startPage: number }[] = [];

    for (const fm of manifest) {
      if (fm.documents.length === 0) continue;

      const totalSize = fm.documents.reduce((s, d) => s + d.fileSizeBytes, 0);
      sections.push({
        folderName: fm.folderName,
        sortOrder: fm.sortOrder,
        docCount: fm.documents.length,
        totalSize,
      });
      sectionPages.push({ folderName: fm.folderName, startPage: currentPage });

      await this.createSectionDivider(pdfDoc, fm.folderName, fm.documents.length, currentPage);
      currentPage++;

      const progressBase = 40;
      const progressRange = 40;

      for (let di = 0; di < fm.documents.length; di++) {
        const doc = fm.documents[di];
        const isPdf =
          doc.fileType?.toLowerCase() === "pdf" ||
          doc.mimeType?.includes("pdf") ||
          doc.fileName.toLowerCase().endsWith(".pdf");

        if (isPdf) {
          const buf = downloadedBuffers.get(doc.id);
          if (buf) {
            try {
              const srcDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
              const pageIndices = srcDoc.getPageIndices();
              const copiedPages = await pdfDoc.copyPages(srcDoc, pageIndices);
              for (const page of copiedPages) {
                pdfDoc.addPage(page);
                currentPage++;
              }
            } catch (err) {
              console.warn(`[BINDER] PDF merge failed for ${doc.fileName}, using placeholder:`, err);
              await this.createPlaceholderPage(pdfDoc, doc.fileName, "PDF merge failed - see ZIP package", currentPage);
              currentPage++;
            }
          } else {
            await this.createPlaceholderPage(pdfDoc, doc.fileName, "Document not available - see ZIP package", currentPage);
            currentPage++;
          }
        } else {
          await this.createPlaceholderPage(pdfDoc, doc.fileName, "Non-PDF document - see ZIP package", currentPage);
          currentPage++;
        }

        const totalDocs = manifest.reduce((s, m) => s + m.documents.length, 0);
        const overallIdx = manifest.slice(0, manifest.indexOf(fm)).reduce((s, m) => s + m.documents.length, 0) + di;
        const pdfProgress = progressBase + Math.floor((overallIdx / Math.max(totalDocs, 1)) * progressRange);
        await this.updateProgress(jobId, pdfProgress);
      }
    }

    pdfDoc.removePage(tocPlaceholderPageIndex);
    const tocPages = this.buildTOCPages(sections, sectionPages);
    for (let i = tocPages.length - 1; i >= 0; i--) {
      const tocPage = pdfDoc.insertPage(tocPlaceholderPageIndex, PageSizes.Letter);
      await this.drawTOCOnPage(tocPage, tocPages[i], i + 1, tocPages.length);
    }

    const totalPages = pdfDoc.getPageCount();
    const fontEmbed = await pdfDoc.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < totalPages; i++) {
      const page = pdfDoc.getPage(i);
      const { width } = page.getSize();
      page.drawText(`Page ${i + 1} of ${totalPages}`, {
        x: width - 120,
        y: 15,
        size: 8,
        font: fontEmbed,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  private buildTOCPages(
    sections: { folderName: string; sortOrder: number; docCount: number; totalSize: number }[],
    sectionPages: { folderName: string; startPage: number }[]
  ): { entries: { folderName: string; sortOrder: number; docCount: number; totalSize: number; startPage: number }[] }[] {
    const entriesPerPage = 25;
    const allEntries = sections.map((s) => {
      const sp = sectionPages.find((p) => p.folderName === s.folderName);
      return { ...s, startPage: sp?.startPage || 0 };
    });

    const pages: { entries: typeof allEntries }[] = [];
    for (let i = 0; i < allEntries.length; i += entriesPerPage) {
      pages.push({ entries: allEntries.slice(i, i + entriesPerPage) });
    }
    if (pages.length === 0) {
      pages.push({ entries: [] });
    }
    return pages;
  }

  private async drawTOCOnPage(
    page: any,
    tocPage: { entries: { folderName: string; sortOrder: number; docCount: number; totalSize: number; startPage: number }[] },
    pageNum: number,
    totalTocPages: number
  ): Promise<void> {
    const pdfDoc = page.doc;
    const fontEmbed = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFontEmbed = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const { width, height } = page.getSize();
    const darkGray = rgb(0.2, 0.2, 0.2);
    const blackhawkGold = rgb(0.75, 0.55, 0.12);

    page.drawText("TABLE OF CONTENTS", {
      x: 72,
      y: height - 72,
      size: 22,
      font: boldFontEmbed,
      color: darkGray,
    });

    page.drawLine({
      start: { x: 72, y: height - 85 },
      end: { x: width - 72, y: height - 85 },
      thickness: 1,
      color: blackhawkGold,
    });

    page.drawText("Section", { x: 72, y: height - 110, size: 10, font: boldFontEmbed, color: darkGray });
    page.drawText("Docs", { x: 350, y: height - 110, size: 10, font: boldFontEmbed, color: darkGray });
    page.drawText("Size", { x: 400, y: height - 110, size: 10, font: boldFontEmbed, color: darkGray });
    page.drawText("Page", { x: width - 100, y: height - 110, size: 10, font: boldFontEmbed, color: darkGray });

    let yPos = height - 135;
    for (const entry of tocPage.entries) {
      if (yPos < 72) break;
      const sizeStr = this.formatFileSize(entry.totalSize);
      page.drawText(entry.folderName, { x: 72, y: yPos, size: 10, font: fontEmbed, color: darkGray, maxWidth: 270 });
      page.drawText(`${entry.docCount}`, { x: 358, y: yPos, size: 10, font: fontEmbed, color: darkGray });
      page.drawText(sizeStr, { x: 400, y: yPos, size: 10, font: fontEmbed, color: darkGray });
      page.drawText(`${entry.startPage}`, { x: width - 95, y: yPos, size: 10, font: fontEmbed, color: darkGray });
      yPos -= 22;
    }

    if (totalTocPages > 1) {
      page.drawText(`TOC Page ${pageNum} of ${totalTocPages}`, {
        x: width / 2 - 40,
        y: 40,
        size: 8,
        font: fontEmbed,
        color: darkGray,
      });
    }
  }

  private async generateZipPackage(
    manifest: FolderManifest[],
    downloadedBuffers: Map<string, Buffer>,
    opportunity: any,
    bidProjectId: string
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const passThrough = new PassThrough();
      const chunks: Buffer[] = [];

      passThrough.on("data", (chunk: Buffer) => chunks.push(chunk));
      passThrough.on("end", () => resolve(Buffer.concat(chunks)));
      passThrough.on("error", reject);

      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.on("error", reject);
      archive.pipe(passThrough);

      const metadata = {
        projectTitle: opportunity.title,
        bidProjectId,
        noticeId: opportunity.externalId || "N/A",
        generatedAt: new Date().toISOString(),
        generatedBy: "Sentinel Command Center",
        folderCount: manifest.length,
        documentCount: manifest.reduce((s, m) => s + m.documents.length, 0),
      };

      archive.append(JSON.stringify(metadata, null, 2), { name: "00_Cover/Binder_Metadata.json" });

      const indexEntries: { folder: string; sortOrder: number; fileName: string; fileType: string; mimeType: string | null; fileSizeBytes: number; createdAt: string }[] = [];

      for (const fm of manifest) {
        const paddedSort = String(fm.sortOrder).padStart(2, "0");
        const safeFolderName = this.sanitizeFileName(fm.folderName);
        const folderPath = `${paddedSort}_${safeFolderName}`;

        for (const doc of fm.documents) {
          const dateStr = new Date(doc.createdAt).toISOString().slice(0, 10).replace(/-/g, "");
          const safeName = this.sanitizeFileName(doc.fileName);
          const entryName = `${folderPath}/${dateStr}_${safeName}`;

          const buf = downloadedBuffers.get(doc.id);
          if (buf) {
            archive.append(buf, { name: entryName });
          } else {
            archive.append(`Document not available: ${doc.fileName}`, { name: entryName + ".txt" });
          }

          indexEntries.push({
            folder: fm.folderName,
            sortOrder: fm.sortOrder,
            fileName: doc.fileName,
            fileType: doc.fileType,
            mimeType: doc.mimeType,
            fileSizeBytes: doc.fileSizeBytes,
            createdAt: new Date(doc.createdAt).toISOString(),
          });
        }
      }

      const { csv, json } = this.generateDocumentIndex(indexEntries);
      archive.append(csv, { name: "99_Index/Document_Index.csv" });
      archive.append(JSON.stringify(json, null, 2), { name: "99_Index/Document_Index.json" });

      archive.finalize();
    });
  }

  private generateDocumentIndex(entries: any[]): { csv: string; json: object } {
    const csvHeader = "Folder,Sort Order,File Name,File Type,MIME Type,Size (bytes),Created At\n";
    const csvRows = entries
      .map(
        (e: any) =>
          `"${e.folder}",${e.sortOrder},"${e.fileName}","${e.fileType}","${e.mimeType || ""}",${e.fileSizeBytes},"${e.createdAt}"`
      )
      .join("\n");
    return {
      csv: csvHeader + csvRows,
      json: {
        generatedAt: new Date().toISOString(),
        totalDocuments: entries.length,
        documents: entries,
      },
    };
  }

  private async createCoverPage(
    pdfDoc: PDFDocument,
    projectTitle: string,
    noticeId: string,
    generatedAt: Date
  ): Promise<void> {
    const fontEmbed = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFontEmbed = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage(PageSizes.Letter);
    const { width, height } = page.getSize();

    const blackhawkGold = rgb(0.75, 0.55, 0.12);
    const darkGray = rgb(0.2, 0.2, 0.2);

    page.drawRectangle({ x: 0, y: height - 120, width, height: 120, color: darkGray });

    page.drawText("BLACKHAWK CONSTRUCTION", {
      x: 72,
      y: height - 70,
      size: 28,
      font: boldFontEmbed,
      color: blackhawkGold,
    });

    page.drawText("BID BINDER", {
      x: 72,
      y: height - 100,
      size: 18,
      font: fontEmbed,
      color: rgb(1, 1, 1),
    });

    page.drawText(projectTitle, {
      x: 72,
      y: height - 200,
      size: 20,
      font: boldFontEmbed,
      color: darkGray,
      maxWidth: width - 144,
    });

    page.drawText(`Notice ID: ${noticeId}`, {
      x: 72,
      y: height - 260,
      size: 12,
      font: fontEmbed,
      color: darkGray,
    });

    page.drawText(`Generated: ${generatedAt.toLocaleString()}`, {
      x: 72,
      y: height - 280,
      size: 12,
      font: fontEmbed,
      color: darkGray,
    });

    page.drawText("Generated by Sentinel + Herbie", {
      x: 72,
      y: height - 310,
      size: 11,
      font: fontEmbed,
      color: blackhawkGold,
    });

    page.drawRectangle({ x: 0, y: 0, width, height: 50, color: darkGray });

    page.drawText("CONFIDENTIAL - DO NOT DISTRIBUTE", {
      x: 72,
      y: 20,
      size: 10,
      font: fontEmbed,
      color: blackhawkGold,
    });
  }

  private async createSectionDivider(
    pdfDoc: PDFDocument,
    folderName: string,
    docCount: number,
    pageNumber: number
  ): Promise<void> {
    const fontEmbed = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFontEmbed = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage(PageSizes.Letter);
    const { width, height } = page.getSize();

    const blackhawkGold = rgb(0.75, 0.55, 0.12);
    const darkGray = rgb(0.2, 0.2, 0.2);

    page.drawRectangle({ x: 0, y: height - 100, width, height: 100, color: darkGray });

    const displayName = folderName.toUpperCase();
    page.drawText(displayName, {
      x: 50,
      y: height - 60,
      size: 22,
      font: boldFontEmbed,
      color: blackhawkGold,
      maxWidth: width - 100,
    });

    page.drawText(`Documents in this section: ${docCount}`, {
      x: 50,
      y: height - 85,
      size: 11,
      font: fontEmbed,
      color: rgb(0.8, 0.8, 0.8),
    });

    page.drawRectangle({ x: 0, y: 0, width, height: 40, color: darkGray });

    page.drawText(`${folderName}`, {
      x: 50,
      y: 15,
      size: 9,
      font: fontEmbed,
      color: rgb(0.7, 0.7, 0.7),
    });
  }

  private async createPlaceholderPage(
    pdfDoc: PDFDocument,
    fileName: string,
    reason: string,
    pageNumber: number
  ): Promise<void> {
    const fontEmbed = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFontEmbed = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage(PageSizes.Letter);
    const { width, height } = page.getSize();

    const darkGray = rgb(0.2, 0.2, 0.2);
    const lightGray = rgb(0.93, 0.93, 0.93);
    const blackhawkGold = rgb(0.75, 0.55, 0.12);

    page.drawRectangle({
      x: 72,
      y: 72,
      width: width - 144,
      height: height - 144,
      color: lightGray,
      borderColor: darkGray,
      borderWidth: 1,
    });

    const truncName = fileName.length > 60 ? fileName.substring(0, 57) + "..." : fileName;

    page.drawText(truncName, {
      x: 90,
      y: height / 2 + 20,
      size: 14,
      font: boldFontEmbed,
      color: darkGray,
    });

    page.drawText(reason, {
      x: 90,
      y: height / 2 - 10,
      size: 10,
      font: fontEmbed,
      color: darkGray,
    });

    page.drawRectangle({ x: 0, y: 0, width, height: 40, color: darkGray });

    page.drawText("SENTINEL COMMAND CENTER", {
      x: width / 2 - 50,
      y: 15,
      size: 7,
      font: fontEmbed,
      color: blackhawkGold,
    });
  }

  private async downloadDocBuffer(storageKey: string): Promise<Buffer | null> {
    try {
      const file = await getObjectFile(storageKey);
      const [buffer] = await file.download();
      return buffer;
    } catch (err) {
      console.warn(`[BINDER] Download failed for ${storageKey}:`, err);
      return null;
    }
  }

  private async uploadToStorage(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    bidProjectId: string
  ): Promise<string> {
    const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
    const objectPath = `${privateDir}/binders/${bidProjectId}/${fileName}`;
    const { bucketName, objectName } = parseObjectPath(objectPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    await file.save(buffer, { contentType: mimeType });
    const entityId = objectPath.replace(privateDir + "/", "");
    return `/objects/${entityId}`;
  }

  private async getOrCreateSubmissionFolder(bidProjectId: string): Promise<{ id: string } | null> {
    const existing = await db
      .select({ id: jacketFolders.id })
      .from(jacketFolders)
      .where(
        and(
          eq(jacketFolders.tenantId, this.tenantId),
          eq(jacketFolders.jacketType, "bid"),
          eq(jacketFolders.jacketId, bidProjectId),
          eq(jacketFolders.sortOrder, 12)
        )
      )
      .limit(1);

    if (existing.length > 0) return existing[0];

    try {
      const folderId = randomUUID();
      await db.insert(jacketFolders).values({
        id: folderId,
        tenantId: this.tenantId,
        jacketType: "bid",
        jacketId: bidProjectId,
        name: "12 - Submission",
        path: `/Bids/${bidProjectId}/Submission`,
        sortOrder: 12,
        isSystemFolder: true,
      });
      return { id: folderId };
    } catch (err) {
      console.warn("[BINDER] Could not create submission folder:", err);
      const fallback = await db
        .select({ id: jacketFolders.id })
        .from(jacketFolders)
        .where(
          and(
            eq(jacketFolders.tenantId, this.tenantId),
            eq(jacketFolders.jacketType, "bid"),
            eq(jacketFolders.jacketId, bidProjectId)
          )
        )
        .orderBy(desc(jacketFolders.sortOrder))
        .limit(1);
      return fallback.length > 0 ? fallback[0] : null;
    }
  }

  private sanitizeFileName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9._\-\s]/g, "")
      .replace(/\s+/g, "_")
      .substring(0, 200);
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private wrapText(text: string, maxChars: number): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      if ((currentLine + " " + word).trim().length <= maxChars) {
        currentLine = (currentLine + " " + word).trim();
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  private getSectionDescription(sectionCode: string): string {
    const descriptions: Record<string, string> = {
      "00": "Project overview, summary sheets, and executive briefing materials.",
      "01": "Standard form documents required for federal contract submissions (SF-33, SF-1442).",
      "02": "Completed proposal forms, pricing schedules, and offer documentation.",
      "03": "Representations, certifications, and required acknowledgment forms per FAR/DFARS.",
      "04": "Technical drawings, plan sheets, specifications, and referenced exhibits.",
      "05": "Bill of Materials, equipment lists, and quantity schedules for procurement.",
      "06": "Certificate of Insurance, performance bonds, payment bonds, and bid bonds.",
      "07": "Past performance references, CPAR ratings, and relevant experience documentation.",
      "08": "Organizational qualifications, team resumes, and capability statements.",
      "09": "Project schedule, milestone charts, and phasing plans.",
      "10": "Health and safety plans, environmental compliance documentation.",
      "11": "Quality control plans, inspection procedures, and assurance documentation.",
      "12": "Original solicitation documents, amendments, and Q&A responses.",
      "98": "HERBIE AI analysis results, requirement extractions, and evidence citations.",
      "99": "Archived items, superseded documents, and duplicate file references.",
    };
    return descriptions[sectionCode] || `Section ${sectionCode} documents and materials.`;
  }

  private getSectionRequiredDocs(sectionCode: string): string[] {
    const required: Record<string, string[]> = {
      "01": ["SF-33", "SF-1442", "SF-30"],
      "02": ["Pricing Schedule", "Cost Proposal"],
      "03": ["Reps & Certs", "SAM Registration"],
      "06": ["Certificate of Insurance", "Bid Bond"],
      "07": ["Past Performance"],
      "08": ["Capability Statement"],
      "09": ["Project Schedule"],
    };
    return required[sectionCode] || [];
  }

  async triggerBinderRegeneration(bidProjectId: string, reason: string): Promise<BinderGenerationResult> {
    return this.generateBinder(bidProjectId, "attachment_update", reason);
  }

  async getLatestBinder(bidProjectId: string): Promise<{
    id: string;
    version: number;
    status: string;
    storageKey: string | null;
    pageCount: number | null;
    pageMapJson: { sections: SectionPageMap[] } | null;
    tocJson: TOCEntry[] | null;
    generatedAt: Date | null;
  } | null> {
    const binder = await db
      .select()
      .from(bidBinderVersions)
      .where(and(eq(bidBinderVersions.bidProjectId, bidProjectId), eq(bidBinderVersions.status, "ready")))
      .orderBy(desc(bidBinderVersions.version))
      .limit(1);

    if (binder.length === 0) return null;

    const b = binder[0];
    return {
      id: b.id,
      version: b.version,
      status: b.status,
      storageKey: b.storageKey,
      pageCount: b.pageCount,
      pageMapJson: b.pageMapJson as { sections: SectionPageMap[] } | null,
      tocJson: b.tocJson as TOCEntry[] | null,
      generatedAt: b.generatedAt,
    };
  }

  async getBinderVersions(bidProjectId: string): Promise<
    {
      id: string;
      version: number;
      status: string;
      triggerType: string;
      pageCount: number | null;
      pageMapJson: { sections: SectionPageMap[] } | null;
      generatedAt: Date | null;
    }[]
  > {
    const versions = await db
      .select({
        id: bidBinderVersions.id,
        version: bidBinderVersions.version,
        status: bidBinderVersions.status,
        triggerType: bidBinderVersions.triggerType,
        pageCount: bidBinderVersions.pageCount,
        pageMapJson: bidBinderVersions.pageMapJson,
        generatedAt: bidBinderVersions.generatedAt,
      })
      .from(bidBinderVersions)
      .where(eq(bidBinderVersions.bidProjectId, bidProjectId))
      .orderBy(desc(bidBinderVersions.version));

    return versions.map((v) => ({
      ...v,
      pageMapJson: v.pageMapJson as { sections: SectionPageMap[] } | null,
    }));
  }

  async onAmendmentReceived(bidProjectId: string, addendumId: string): Promise<void> {
    const addendum = await db.select().from(bidAddenda).where(eq(bidAddenda.id, addendumId)).limit(1);

    if (addendum.length > 0) {
      await this.generateBinder(
        bidProjectId,
        "amendment",
        `Amendment #${addendum[0].addendumNumber}: ${addendum[0].title}`
      );
    }
  }

  async downloadBinder(
    bidProjectId: string,
    version?: number
  ): Promise<{ buffer: Buffer; filename: string } | null> {
    let binder;

    if (version) {
      const result = await db
        .select()
        .from(bidBinderVersions)
        .where(and(eq(bidBinderVersions.bidProjectId, bidProjectId), eq(bidBinderVersions.version, version)))
        .limit(1);
      binder = result[0];
    } else {
      binder = await this.getLatestBinder(bidProjectId);
    }

    if (!binder || !binder.storageKey) return null;

    try {
      const file = await getObjectFile(binder.storageKey);
      const [buffer] = await file.download();
      return {
        buffer,
        filename: `bid-binder-v${binder.version}.pdf`,
      };
    } catch {
      return null;
    }
  }

  private async getNextVersion(bidProjectId: string): Promise<number> {
    const latest = await db
      .select({ version: bidBinderVersions.version })
      .from(bidBinderVersions)
      .where(eq(bidBinderVersions.bidProjectId, bidProjectId))
      .orderBy(desc(bidBinderVersions.version))
      .limit(1);

    return (latest[0]?.version || 0) + 1;
  }

  async generateBinder(
    bidProjectId: string,
    triggerType: "initial" | "amendment" | "attachment_update" | "manual",
    triggerDetails?: string
  ): Promise<BinderGenerationResult> {
    const bid = await db
      .select()
      .from(bidProjects)
      .innerJoin(opportunities, eq(bidProjects.opportunityId, opportunities.id))
      .where(eq(bidProjects.id, bidProjectId))
      .limit(1);

    if (bid.length === 0) {
      throw new Error(`Bid project ${bidProjectId} not found`);
    }

    const opportunity = bid[0].opportunities;
    const version = await this.getNextVersion(bidProjectId);
    const binderId = randomUUID();

    await db
      .update(bidBinderVersions)
      .set({ status: "superseded" })
      .where(and(eq(bidBinderVersions.bidProjectId, bidProjectId), eq(bidBinderVersions.status, "ready")));

    await db.insert(bidBinderVersions).values({
      id: binderId,
      tenantId: this.tenantId,
      bidProjectId,
      version,
      status: "generating",
      triggerType,
      triggerDetails,
    });

    try {
      const pdfDoc = await PDFDocument.create();

      await this.createCoverPage(pdfDoc, opportunity.title, opportunity.externalId || "", new Date());

      const folders = await db
        .select({
          id: jacketFolders.id,
          name: jacketFolders.name,
          sortOrder: jacketFolders.sortOrder,
        })
        .from(jacketFolders)
        .where(
          and(
            eq(jacketFolders.tenantId, this.tenantId),
            eq(jacketFolders.jacketType, "bid"),
            eq(jacketFolders.jacketId, bidProjectId)
          )
        )
        .orderBy(asc(jacketFolders.sortOrder));

      const parsedFolders = folders.map((f) => {
        const match = f.name.match(/^(\d{2})\s*-\s*(.+)$/);
        return {
          id: f.id,
          code: match?.[1] || "00",
          name: match?.[2] || f.name,
          sortOrder: f.sortOrder,
        };
      });

      const sections: SectionPageMap[] = [];
      let currentPage = 3;
      const noticeId = opportunity.externalId || "N/A";

      for (const folder of parsedFolders) {
        if (folder.code === "98" || folder.code === "99") continue;

        const docs = await db
          .select({
            id: jacketDocuments.id,
            title: jacketDocuments.title,
            fileName: jacketDocuments.fileName,
            version: jacketDocuments.version,
            fileSizeBytes: jacketDocuments.fileSizeBytes,
            storageKey: jacketDocuments.storageKey,
          })
          .from(jacketDocuments)
          .where(and(eq(jacketDocuments.folderId, folder.id), eq(jacketDocuments.latestVersion, true)))
          .orderBy(asc(jacketDocuments.fileName));

        const docsWithPages = docs.map((d) => ({
          ...d,
          pageCount: Math.max(1, Math.ceil(d.fileSizeBytes / 50000)),
        }));

        if (docsWithPages.length === 0) {
          await this.createSectionDivider(pdfDoc, `${folder.code} - ${folder.name}`, 0, currentPage);
          currentPage++;
          sections.push({
            sectionCode: folder.code,
            sectionName: folder.name,
            documents: [],
            startPage: currentPage - 1,
            endPage: currentPage - 1,
          });
          continue;
        }

        await this.createSectionDivider(
          pdfDoc,
          `${folder.code} - ${folder.name}`,
          docsWithPages.length,
          currentPage
        );

        const sectionStartPage = currentPage;
        currentPage++;

        const sectionDocuments: SectionPageMap["documents"] = [];

        for (const doc of docsWithPages) {
          const startPage = currentPage;

          for (let p = 0; p < doc.pageCount; p++) {
            await this.createPlaceholderPage(pdfDoc, doc.fileName, "See ZIP package", currentPage);
            currentPage++;
          }

          sectionDocuments.push({
            fileName: doc.fileName,
            docId: doc.id,
            version: doc.version,
            startPage,
            endPage: currentPage - 1,
          });
        }

        sections.push({
          sectionCode: folder.code,
          sectionName: folder.name,
          documents: sectionDocuments,
          startPage: sectionStartPage,
          endPage: currentPage - 1,
        });
      }

      const totalPages = currentPage - 1;
      const tocJson = this.generateLegacyTOC(sections);

      const tocPage = pdfDoc.insertPage(1, PageSizes.Letter);
      const tocFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const tocBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const { width: tw, height: th } = tocPage.getSize();
      const dg = rgb(0.2, 0.2, 0.2);

      tocPage.drawText("TABLE OF CONTENTS", { x: 72, y: th - 72, size: 24, font: tocBoldFont, color: dg });
      tocPage.drawLine({ start: { x: 72, y: th - 85 }, end: { x: tw - 72, y: th - 85 }, thickness: 1, color: dg });

      let yp = th - 120;
      for (const entry of tocJson) {
        if (yp < 72) break;
        const indent = entry.level === 0 ? 0 : 20;
        const fontSize = entry.level === 0 ? 12 : 10;
        const fontToUse = entry.level === 0 ? tocBoldFont : tocFont;
        tocPage.drawText(entry.title, { x: 72 + indent, y: yp, size: fontSize, font: fontToUse, color: dg });
        tocPage.drawText(`${entry.page}`, { x: tw - 100, y: yp, size: fontSize, font: tocFont, color: dg });
        yp -= 20;

        if (entry.children) {
          for (const child of entry.children) {
            if (yp < 72) break;
            tocPage.drawText(child.title, { x: 92, y: yp, size: 10, font: tocFont, color: dg });
            tocPage.drawText(`${child.page}`, { x: tw - 100, y: yp, size: 10, font: tocFont, color: dg });
            yp -= 16;
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      const storageKey = `binders/${bidProjectId}/v${version}/binder.pdf`;

      const pageMapJson = { sections };

      await db
        .update(bidBinderVersions)
        .set({
          status: "ready",
          storageKey,
          pageCount: pdfDoc.getPageCount(),
          pageMapJson,
          tocJson,
          generatedAt: new Date(),
        })
        .where(eq(bidBinderVersions.id, binderId));

      return {
        binderId,
        version,
        pageCount: pdfDoc.getPageCount(),
        storageKey,
        pageMapJson,
        tocJson,
      };
    } catch (error) {
      await db
        .update(bidBinderVersions)
        .set({
          status: "failed",
          generatedAt: new Date(),
        })
        .where(eq(bidBinderVersions.id, binderId));

      throw error;
    }
  }

  private generateLegacyTOC(sections: SectionPageMap[]): TOCEntry[] {
    const toc: TOCEntry[] = [
      { title: "Cover Page", page: 1, level: 0 },
      { title: "Table of Contents", page: 2, level: 0 },
    ];

    for (const section of sections) {
      if (section.documents.length === 0) continue;

      toc.push({
        title: `${section.sectionCode} - ${section.sectionName}`,
        page: section.startPage,
        level: 0,
        children: section.documents.map((doc) => ({
          title: doc.fileName,
          page: doc.startPage,
          level: 1,
        })),
      });
    }

    return toc;
  }
}

export function createBidBinderService(tenantId: string): BidBinderService {
  return new BidBinderService(tenantId);
}
