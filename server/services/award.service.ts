import { db } from "../db";
import {
  awardDecisions, contractPackets,
  bidForms, bidFormSections, bidFormLineItems,
  bidResponses, bidResponseLineItems,
  bidProjects, vendors, costCodes, opportunities,
  bidInvitations, jacketFolders, jacketDocuments,
  bidJacketFolderDisplayName, bidJacketFolderByKey,
} from "@shared/schema";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { AuditService } from "./audit.service";
import { jacketService } from "./jacket.service";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const DEFAULT_TENANT = "blackhawk-default";
const auditService = new AuditService();

interface AwardInput {
  bidProjectId: string;
  winningBidResponseId: string;
  selectedAlternateIds: string[];
  notes?: string;
  adminOverride?: boolean;
}

export async function createAward(input: AwardInput) {
  const { bidProjectId, winningBidResponseId, selectedAlternateIds, notes, adminOverride } = input;

  const existing = await db.select().from(awardDecisions).where(
    and(
      eq(awardDecisions.tenantId, DEFAULT_TENANT),
      eq(awardDecisions.bidProjectId, bidProjectId),
      eq(awardDecisions.status, "awarded")
    )
  ).then(r => r[0]);
  if (existing) {
    throw new Error("This bid project already has an active award. Rescind first to re-award.");
  }

  const response = await db.select().from(bidResponses)
    .where(eq(bidResponses.id, winningBidResponseId))
    .then(r => r[0]);
  if (!response) throw new Error("Bid response not found");
  if (response.status !== "submitted" && !adminOverride) {
    throw new Error("Only submitted responses can be awarded (use adminOverride to bypass)");
  }
  if (response.bidProjectId !== bidProjectId) {
    throw new Error("Bid response does not belong to this project");
  }

  const snapshot = await buildAwardSnapshot(bidProjectId, winningBidResponseId, selectedAlternateIds);

  const award = await db.transaction(async (tx) => {
    const [awardRow] = await tx.insert(awardDecisions).values({
      tenantId: DEFAULT_TENANT,
      bidProjectId,
      winningBidResponseId,
      selectedAlternateIds: selectedAlternateIds as any,
      awardSnapshotJson: snapshot as any,
      status: "awarded",
      notes: notes || null,
      awardedAt: new Date(),
    }).returning();

    await tx.update(bidProjects).set({
      status: "awarded",
      updatedAt: new Date(),
    }).where(eq(bidProjects.id, bidProjectId));

    const form = await tx.select().from(bidForms).where(
      and(eq(bidForms.bidProjectId, bidProjectId), eq(bidForms.tenantId, DEFAULT_TENANT))
    ).then(r => r[0]);
    if (form && form.status === "published") {
      await tx.update(bidForms).set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
        .where(eq(bidForms.id, form.id));
    }

    return awardRow;
  });

  await auditService.logEvent({
    tenantId: DEFAULT_TENANT,
    eventType: "bid_awarded",
    actor: "admin",
    entityType: "award_decision",
    entityId: award.id,
    afterJson: {
      bidProjectId,
      winningBidResponseId,
      vendorName: snapshot.winningVendor?.companyName,
      grandTotal: snapshot.grandTotal,
      selectedAlternateIds,
    },
  });

  const packet = await generateAndStorePacket(award.id, 1);

  return { award, packet };
}

export async function getAward(bidProjectId: string) {
  const awards = await db.select().from(awardDecisions).where(
    and(
      eq(awardDecisions.tenantId, DEFAULT_TENANT),
      eq(awardDecisions.bidProjectId, bidProjectId)
    )
  ).orderBy(desc(awardDecisions.createdAt));

  const activeAward = awards.find(a => a.status === "awarded");
  const packets = activeAward
    ? await db.select().from(contractPackets)
        .where(eq(contractPackets.awardDecisionId, activeAward.id))
        .orderBy(desc(contractPackets.version))
    : [];

  return {
    activeAward,
    packets,
    history: awards,
  };
}

export async function rescindAward(bidProjectId: string, reason: string) {
  const award = await db.select().from(awardDecisions).where(
    and(
      eq(awardDecisions.tenantId, DEFAULT_TENANT),
      eq(awardDecisions.bidProjectId, bidProjectId),
      eq(awardDecisions.status, "awarded")
    )
  ).then(r => r[0]);
  if (!award) throw new Error("No active award to rescind");

  await db.transaction(async (tx) => {
    await tx.update(awardDecisions).set({
      status: "rescinded",
      rescindedAt: new Date(),
      rescindReason: reason,
      updatedAt: new Date(),
    }).where(eq(awardDecisions.id, award.id));

    await tx.update(bidProjects).set({
      status: "published",
      updatedAt: new Date(),
    }).where(eq(bidProjects.id, bidProjectId));

    const form = await tx.select().from(bidForms).where(
      and(eq(bidForms.bidProjectId, bidProjectId), eq(bidForms.tenantId, DEFAULT_TENANT))
    ).then(r => r[0]);
    if (form && form.status === "closed") {
      await tx.update(bidForms).set({ status: "published", updatedAt: new Date() })
        .where(eq(bidForms.id, form.id));
    }
  });

  await auditService.logEvent({
    tenantId: DEFAULT_TENANT,
    eventType: "bid_award_rescinded",
    actor: "admin",
    entityType: "award_decision",
    entityId: award.id,
    beforeJson: { status: "awarded" },
    afterJson: { status: "rescinded", rescindReason: reason },
  });

  return award;
}

export async function regeneratePacket(bidProjectId: string) {
  const award = await db.select().from(awardDecisions).where(
    and(
      eq(awardDecisions.tenantId, DEFAULT_TENANT),
      eq(awardDecisions.bidProjectId, bidProjectId),
      eq(awardDecisions.status, "awarded")
    )
  ).then(r => r[0]);
  if (!award) throw new Error("No active award found");

  const latestPacket = await db.select().from(contractPackets)
    .where(eq(contractPackets.awardDecisionId, award.id))
    .orderBy(desc(contractPackets.version))
    .limit(1)
    .then(r => r[0]);
  const nextVersion = latestPacket ? latestPacket.version + 1 : 1;

  const packet = await generateAndStorePacket(award.id, nextVersion);

  await auditService.logEvent({
    tenantId: DEFAULT_TENANT,
    eventType: "contract_packet_regenerated",
    actor: "admin",
    entityType: "contract_packet",
    entityId: packet.id,
    afterJson: { awardDecisionId: award.id, version: nextVersion },
  });

  return packet;
}

async function buildAwardSnapshot(bidProjectId: string, responseId: string, selectedAlternateIds: string[]) {
  const project = await db.select().from(bidProjects)
    .where(eq(bidProjects.id, bidProjectId)).then(r => r[0]);

  const response = await db.select().from(bidResponses)
    .where(eq(bidResponses.id, responseId)).then(r => r[0]);

  const vendor = response
    ? await db.select().from(vendors).where(eq(vendors.id, response.vendorId)).then(r => r[0])
    : null;

  const form = await db.select().from(bidForms).where(
    and(eq(bidForms.bidProjectId, bidProjectId), eq(bidForms.tenantId, DEFAULT_TENANT))
  ).then(r => r[0]);

  let sections: any[] = [];
  let allItems: any[] = [];
  let responseItems: any[] = [];

  if (form) {
    sections = await db.select().from(bidFormSections)
      .where(eq(bidFormSections.bidFormId, form.id))
      .orderBy(asc(bidFormSections.sortOrder));

    const sectionIds = sections.map(s => s.id);
    if (sectionIds.length > 0) {
      allItems = await db.select().from(bidFormLineItems)
        .where(sql`${bidFormLineItems.bidFormSectionId} IN (${sql.join(sectionIds.map(id => sql`${id}`), sql`, `)})`)
        .orderBy(asc(bidFormLineItems.sortOrder));
    }

    responseItems = await db.select().from(bidResponseLineItems)
      .where(eq(bidResponseLineItems.bidResponseId, responseId));
  }

  const costCodeIdSet: Record<string, boolean> = {};
  allItems.filter(i => i.costCodeId).forEach(i => { costCodeIdSet[i.costCodeId!] = true; });
  const costCodeIds = Object.keys(costCodeIdSet);
  let costCodeMap: Record<string, any> = {};
  if (costCodeIds.length > 0) {
    const codes = await db.select().from(costCodes).where(
      sql`${costCodes.id} IN (${sql.join(costCodeIds.map(id => sql`${id}`), sql`, `)})`
    );
    codes.forEach(c => { costCodeMap[c.id] = c; });
  }

  const responseItemMap: Record<string, any> = {};
  responseItems.forEach(ri => { responseItemMap[ri.bidFormLineItemId] = ri; });

  const baseSections = sections.filter(s => s.sectionType === "base");
  const altSections = sections.filter(s => s.sectionType === "alternate");

  let baseTotal = 0;
  const altTotals: Record<string, number> = {};
  const sectionDetails: any[] = [];

  for (const section of sections) {
    const sectionItems = allItems.filter(i => i.bidFormSectionId === section.id);
    let sectionTotal = 0;
    const itemDetails: any[] = [];

    for (const item of sectionItems) {
      const ri = responseItemMap[item.id];
      const total = ri && ri.included ? Number(ri.totalPrice || 0) : 0;
      sectionTotal += total;
      itemDetails.push({
        id: item.id,
        description: item.description,
        costCode: item.costCodeId ? costCodeMap[item.costCodeId] || null : null,
        uom: item.uom,
        qty: item.qty,
        unitPrice: ri?.unitPrice || null,
        totalPrice: ri?.totalPrice || null,
        included: ri?.included ?? false,
      });
    }

    if (baseSections.some(bs => bs.id === section.id)) {
      baseTotal += sectionTotal;
    }
    if (section.sectionType === "alternate") {
      altTotals[section.id] = sectionTotal;
    }

    sectionDetails.push({
      id: section.id,
      title: section.title,
      sectionType: section.sectionType,
      total: sectionTotal,
      lineItems: itemDetails,
    });
  }

  const selectedAltTotal = altSections
    .filter(s => selectedAlternateIds.includes(s.id))
    .reduce((sum, s) => sum + (altTotals[s.id] || 0), 0);

  const grandTotal = baseTotal + selectedAltTotal;

  const allSubmitted = await db.select().from(bidResponses).where(
    and(eq(bidResponses.bidProjectId, bidProjectId), eq(bidResponses.status, "submitted"))
  );
  const vendorIdSet: Record<string, boolean> = {};
  allSubmitted.forEach(r => { vendorIdSet[r.vendorId] = true; });
  const submittedVendorIds = Object.keys(vendorIdSet);
  let allVendors: any[] = [];
  if (submittedVendorIds.length > 0) {
    allVendors = await db.select().from(vendors).where(
      sql`${vendors.id} IN (${sql.join(submittedVendorIds.map(id => sql`${id}`), sql`, `)})`
    );
  }

  let projectName = `Project ${bidProjectId.substring(0, 8)}`;
  if (project?.opportunityId) {
    const opp = await db.select().from(opportunities)
      .where(eq(opportunities.id, project.opportunityId)).then(r => r[0]);
    if (opp) projectName = opp.title;
  }

  return {
    snapshotCreatedAt: new Date().toISOString(),
    bidProject: project ? {
      id: project.id,
      name: projectName,
      status: project.status,
    } : null,
    winningVendor: vendor ? {
      id: vendor.id,
      companyName: vendor.companyName,
      contactName: vendor.contactName,
      email: vendor.email,
      phone: vendor.phone,
    } : null,
    winningResponseId: responseId,
    form: form ? { id: form.id, instructions: form.instructions } : null,
    sections: sectionDetails,
    selectedAlternateIds,
    baseTotal,
    altTotals,
    grandTotal,
    allBidders: allVendors.map(v => ({
      id: v.id,
      companyName: v.companyName,
    })),
    totalBidders: allSubmitted.length,
  };
}

async function generateAndStorePacket(awardDecisionId: string, version: number) {
  const award = await db.select().from(awardDecisions)
    .where(eq(awardDecisions.id, awardDecisionId)).then(r => r[0]);
  if (!award) throw new Error("Award not found");

  const snapshot: any = award.awardSnapshotJson;
  const pdfBytes = await generateAwardPdf(snapshot, version);

  const postAwardFolder = await findOrCreatePostAwardFolder(award.bidProjectId);

  const docTitle = `Award Packet v${version} - ${snapshot.winningVendor?.companyName || "Unknown"}`;
  const storageKey = `award-packets/${award.bidProjectId}/${awardDecisionId}/v${version}.pdf`;

  if (postAwardFolder) {
    const existingDoc = await db.select().from(jacketDocuments).where(
      and(
        eq(jacketDocuments.tenantId, DEFAULT_TENANT),
        eq(jacketDocuments.folderId, postAwardFolder.id),
        eq(jacketDocuments.title, docTitle)
      )
    ).then(r => r[0]);

    if (!existingDoc) {
      await db.insert(jacketDocuments).values({
        tenantId: DEFAULT_TENANT,
        folderId: postAwardFolder.id,
        title: docTitle,
        fileName: `award-packet-v${version}.pdf`,
        fileType: "pdf",
        mimeType: "application/pdf",
        fileSizeBytes: pdfBytes.length,
        documentType: "award_packet",
        storageKey,
        status: "active",
        source: "herbie",
        generatedBy: "herbie",
        generatedType: "AwardPacket",
      });
    }
  }

  const packetIndex = {
    title: docTitle,
    version,
    generatedAt: new Date().toISOString(),
    vendorName: snapshot.winningVendor?.companyName,
    grandTotal: snapshot.grandTotal,
    baseTotal: snapshot.baseTotal,
    sectionCount: snapshot.sections?.length || 0,
    selectedAlternates: snapshot.selectedAlternateIds?.length || 0,
    totalBidders: snapshot.totalBidders,
  };

  const [packet] = await db.insert(contractPackets).values({
    tenantId: DEFAULT_TENANT,
    awardDecisionId,
    version,
    storageKey,
    packetJson: packetIndex as any,
  }).returning();

  return { ...packet, pdfBytes };
}

async function findOrCreatePostAwardFolder(bidProjectId: string) {
  const canonicalEntry = bidJacketFolderByKey("POST_AWARD");
  const canonicalName = bidJacketFolderDisplayName(canonicalEntry.code);

  let folder = await db.select().from(jacketFolders).where(
    and(
      eq(jacketFolders.tenantId, DEFAULT_TENANT),
      eq(jacketFolders.jacketType, "bid"),
      eq(jacketFolders.jacketId, bidProjectId),
      sql`${jacketFolders.name} ILIKE '%Post-Award%' OR ${jacketFolders.name} ILIKE '%Post Award%' OR ${jacketFolders.name} = ${canonicalName} OR ${jacketFolders.name} ILIKE '14 -%' OR ${jacketFolders.name} ILIKE '14-%'`
    )
  ).then(r => r[0]);

  if (!folder) {
    const [created] = await db.insert(jacketFolders).values({
      tenantId: DEFAULT_TENANT,
      jacketType: "bid",
      jacketId: bidProjectId,
      name: canonicalName,
      path: jacketService.jacketPath(bidProjectId, canonicalName),
      sortOrder: parseInt(canonicalEntry.code),
      isSystemFolder: true,
    }).returning();
    folder = created;
  }

  return folder;
}

async function generateAwardPdf(snapshot: any, version: number): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 50;
  const contentWidth = pageWidth - 2 * margin;

  const black = rgb(0, 0, 0);
  const darkGray = rgb(0.3, 0.3, 0.3);
  const medGray = rgb(0.5, 0.5, 0.5);
  const lightGray = rgb(0.85, 0.85, 0.85);
  const accent = rgb(0.15, 0.25, 0.4);

  let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function addPage() {
    currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
    currentPage.drawText(`BLACKHAWK SENTINEL - Award Packet v${version}`, {
      x: margin, y: y, size: 8, font, color: medGray,
    });
    y -= 20;
    return currentPage;
  }

  function ensureSpace(needed: number) {
    if (y - needed < margin + 20) {
      addPage();
    }
  }

  function drawLine(yPos: number, width?: number) {
    currentPage.drawRectangle({
      x: margin, y: yPos, width: width || contentWidth, height: 0.5,
      color: lightGray,
    });
  }

  function formatCurrency(val: number | string | null): string {
    const num = Number(val || 0);
    return "$" + num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // -- COVER PAGE --
  currentPage.drawRectangle({
    x: 0, y: pageHeight - 120, width: pageWidth, height: 120,
    color: accent,
  });
  currentPage.drawText("BLACKHAWK SENTINEL", {
    x: margin, y: pageHeight - 55, size: 24, font: boldFont, color: rgb(1, 1, 1),
  });
  currentPage.drawText("Award Contract Packet", {
    x: margin, y: pageHeight - 80, size: 14, font, color: rgb(0.8, 0.85, 0.95),
  });
  currentPage.drawText(`Version ${version}`, {
    x: margin, y: pageHeight - 100, size: 10, font, color: rgb(0.7, 0.75, 0.85),
  });

  y = pageHeight - 160;

  const projectName = snapshot.bidProject?.name || "Untitled Project";
  currentPage.drawText("BID PROJECT", {
    x: margin, y, size: 10, font: boldFont, color: medGray,
  });
  y -= 18;
  currentPage.drawText(projectName, {
    x: margin, y, size: 16, font: boldFont, color: black,
  });
  y -= 30;

  drawLine(y);
  y -= 20;

  currentPage.drawText("AWARDED TO", {
    x: margin, y, size: 10, font: boldFont, color: medGray,
  });
  y -= 18;
  const vendorName = snapshot.winningVendor?.companyName || "Unknown Vendor";
  currentPage.drawText(vendorName, {
    x: margin, y, size: 16, font: boldFont, color: black,
  });
  y -= 16;
  if (snapshot.winningVendor?.contactName) {
    currentPage.drawText(`Contact: ${snapshot.winningVendor.contactName}`, {
      x: margin, y, size: 10, font, color: darkGray,
    });
    y -= 14;
  }
  if (snapshot.winningVendor?.email) {
    currentPage.drawText(`Email: ${snapshot.winningVendor.email}`, {
      x: margin, y, size: 10, font, color: darkGray,
    });
    y -= 14;
  }
  if (snapshot.winningVendor?.phone) {
    currentPage.drawText(`Phone: ${snapshot.winningVendor.phone}`, {
      x: margin, y, size: 10, font, color: darkGray,
    });
    y -= 14;
  }

  y -= 20;
  drawLine(y);
  y -= 25;

  currentPage.drawText("AWARD SUMMARY", {
    x: margin, y, size: 10, font: boldFont, color: medGray,
  });
  y -= 20;

  const summaryItems = [
    ["Base Bid Total", formatCurrency(snapshot.baseTotal)],
    ["Selected Alternates", String(snapshot.selectedAlternateIds?.length || 0)],
    ["Grand Total", formatCurrency(snapshot.grandTotal)],
    ["Total Bidders", String(snapshot.totalBidders || 0)],
    ["Date", new Date(snapshot.snapshotCreatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })],
  ];
  for (const [label, value] of summaryItems) {
    currentPage.drawText(label, { x: margin, y, size: 10, font, color: darkGray });
    currentPage.drawText(value, { x: margin + 200, y, size: 10, font: boldFont, color: black });
    y -= 16;
  }

  // -- LINE ITEMS PAGES --
  addPage();
  currentPage.drawText("DETAILED LINE ITEMS", {
    x: margin, y, size: 14, font: boldFont, color: accent,
  });
  y -= 25;

  if (snapshot.sections) {
    for (const section of snapshot.sections) {
      ensureSpace(60);

      const isAlternate = section.sectionType === "alternate";
      const isSelected = isAlternate && snapshot.selectedAlternateIds?.includes(section.id);
      const altLabel = isAlternate ? (isSelected ? " [SELECTED]" : " [NOT SELECTED]") : "";

      currentPage.drawRectangle({
        x: margin, y: y - 2, width: contentWidth, height: 18,
        color: lightGray,
      });
      currentPage.drawText(`${section.title}${altLabel}`, {
        x: margin + 5, y: y + 2, size: 10, font: boldFont, color: black,
      });
      const sectionTotalStr = formatCurrency(section.total);
      const sectionTotalWidth = boldFont.widthOfTextAtSize(sectionTotalStr, 10);
      currentPage.drawText(sectionTotalStr, {
        x: margin + contentWidth - sectionTotalWidth - 5, y: y + 2, size: 10, font: boldFont, color: black,
      });
      y -= 22;

      // column headers
      ensureSpace(30);
      currentPage.drawText("Description", { x: margin + 5, y, size: 8, font: boldFont, color: medGray });
      currentPage.drawText("Cost Code", { x: margin + 230, y, size: 8, font: boldFont, color: medGray });
      currentPage.drawText("UOM", { x: margin + 330, y, size: 8, font: boldFont, color: medGray });
      currentPage.drawText("Qty", { x: margin + 380, y, size: 8, font: boldFont, color: medGray });
      currentPage.drawText("Total", { x: margin + 440, y, size: 8, font: boldFont, color: medGray });
      y -= 14;
      drawLine(y + 4);

      if (section.lineItems) {
        for (const item of section.lineItems) {
          ensureSpace(18);
          const desc = (item.description || "").substring(0, 40);
          currentPage.drawText(desc, { x: margin + 5, y, size: 9, font, color: black });
          if (item.costCode) {
            currentPage.drawText(item.costCode.code || "", { x: margin + 230, y, size: 9, font, color: darkGray });
          }
          currentPage.drawText(item.uom || "", { x: margin + 330, y, size: 9, font, color: darkGray });
          currentPage.drawText(String(item.qty || ""), { x: margin + 380, y, size: 9, font, color: darkGray });
          const totalStr = item.included ? formatCurrency(item.totalPrice) : "Excl.";
          currentPage.drawText(totalStr, { x: margin + 440, y, size: 9, font, color: black });
          y -= 14;
        }
      }
      y -= 10;
    }
  }

  // -- BIDDERS SUMMARY --
  ensureSpace(80);
  y -= 10;
  drawLine(y);
  y -= 20;
  currentPage.drawText("ALL BIDDERS", {
    x: margin, y, size: 12, font: boldFont, color: accent,
  });
  y -= 18;

  if (snapshot.allBidders) {
    for (const bidder of snapshot.allBidders) {
      ensureSpace(16);
      const marker = bidder.id === snapshot.winningVendor?.id ? " (AWARDED)" : "";
      currentPage.drawText(`- ${bidder.companyName}${marker}`, {
        x: margin + 10, y, size: 10, font, color: black,
      });
      y -= 14;
    }
  }

  // -- FOOTER ON LAST PAGE --
  y -= 30;
  ensureSpace(40);
  drawLine(y);
  y -= 15;
  currentPage.drawText("This document was auto-generated by BLACKHAWK SENTINEL.", {
    x: margin, y, size: 8, font, color: medGray,
  });
  y -= 12;
  currentPage.drawText("The award snapshot data is immutable and preserved for audit purposes.", {
    x: margin, y, size: 8, font, color: medGray,
  });

  return pdfDoc.save();
}

export async function getPacketPdfBytes(bidProjectId: string, packetId?: string) {
  let award: any;
  if (packetId) {
    const packet = await db.select().from(contractPackets)
      .where(eq(contractPackets.id, packetId)).then(r => r[0]);
    if (!packet) throw new Error("Packet not found");
    award = await db.select().from(awardDecisions)
      .where(eq(awardDecisions.id, packet.awardDecisionId)).then(r => r[0]);
    if (!award) throw new Error("Award not found");
    const snapshot: any = award.awardSnapshotJson;
    return generateAwardPdf(snapshot, packet.version);
  }

  award = await db.select().from(awardDecisions).where(
    and(
      eq(awardDecisions.tenantId, DEFAULT_TENANT),
      eq(awardDecisions.bidProjectId, bidProjectId),
      eq(awardDecisions.status, "awarded")
    )
  ).then(r => r[0]);
  if (!award) throw new Error("No active award found");

  const latestPacket = await db.select().from(contractPackets)
    .where(eq(contractPackets.awardDecisionId, award.id))
    .orderBy(desc(contractPackets.version))
    .limit(1)
    .then(r => r[0]);

  const version = latestPacket?.version || 1;
  const snapshot: any = award.awardSnapshotJson;
  return generateAwardPdf(snapshot, version);
}

export async function isProjectAwarded(bidProjectId: string): Promise<boolean> {
  const award = await db.select().from(awardDecisions).where(
    and(
      eq(awardDecisions.tenantId, DEFAULT_TENANT),
      eq(awardDecisions.bidProjectId, bidProjectId),
      eq(awardDecisions.status, "awarded")
    )
  ).then(r => r[0]);
  return !!award;
}
