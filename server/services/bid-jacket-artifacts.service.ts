import { db } from "../db";
import {
  artifactTemplates,
  bidJacketArtifacts,
  bidJacketChecklistTemplates,
  bidJacketChecklistItems,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

export async function seedArtifactsForBidProject(
  tenantId: string,
  bidProjectId: string
): Promise<number> {
  const templates = await db.select().from(artifactTemplates);
  let created = 0;

  for (const tpl of templates) {
    try {
      await db
        .insert(bidJacketArtifacts)
        .values({
          tenantId,
          bidProjectId,
          templateCode: tpl.code,
          title: tpl.title,
          sourceType: tpl.category === "SAM" ? "samgov" : "upload",
          status: "missing",
        })
        .onConflictDoNothing();
      created++;
    } catch (e) {
    }
  }

  console.log(
    `[bid-jacket-artifacts] Seeded ${created} artifact rows for bid project ${bidProjectId}`
  );
  return created;
}

export async function seedChecklistForBidProject(
  tenantId: string,
  bidProjectId: string
): Promise<number> {
  const templates = await db
    .select()
    .from(bidJacketChecklistTemplates)
    .orderBy(bidJacketChecklistTemplates.sortOrder);
  let created = 0;

  for (const tpl of templates) {
    const existing = await db
      .select({ id: bidJacketChecklistItems.id })
      .from(bidJacketChecklistItems)
      .where(
        and(
          eq(bidJacketChecklistItems.bidProjectId, bidProjectId),
          eq(bidJacketChecklistItems.templateCode, tpl.code)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(bidJacketChecklistItems).values({
        tenantId,
        bidProjectId,
        templateCode: tpl.code,
        title: tpl.title,
        phase: tpl.phase,
        status: "todo",
        priority: tpl.priority,
        requiredArtifactCodes: tpl.requiredArtifactCodes ?? [],
      });
      created++;
    }
  }

  console.log(
    `[bid-jacket-artifacts] Seeded ${created} checklist items for bid project ${bidProjectId}`
  );
  return created;
}

export async function ingestHigherGovAttachments(
  tenantId: string,
  bidProjectId: string,
  attachments: { name: string; url: string; type?: string }[]
): Promise<number> {
  let created = 0;

  const existingUrls = await db
    .select({ sourceUrl: bidJacketArtifacts.sourceUrl })
    .from(bidJacketArtifacts)
    .where(
      and(
        eq(bidJacketArtifacts.tenantId, tenantId),
        eq(bidJacketArtifacts.bidProjectId, bidProjectId)
      )
    );
  const seenUrls = new Set(existingUrls.map((r) => r.sourceUrl).filter(Boolean));

  for (const attachment of attachments) {
    if (seenUrls.has(attachment.url)) continue;

    const filename = attachment.name || attachment.url.split("/").pop() || "unknown";
    const title = decodeURIComponent(filename).replace(/[_-]/g, " ");

    let templateCode: string | null = null;
    const lower = filename.toLowerCase();
    const typeLower = (attachment.type || "").toLowerCase();

    if (lower.includes("solicitation") || lower.includes("notice") || lower.includes("rfp") || lower.includes("ifb") || typeLower === "solicitation")
      templateCode = "SAM_SOLICITATION";
    else if (lower.includes("sow") || lower.includes("pws"))
      templateCode = "SAM_PWS_SOW";
    else if (lower.includes("drawing") || lower.includes("spec") || lower.includes("plan") || typeLower === "drawings" || typeLower === "specifications")
      templateCode = "SAM_DRAWINGS_SPECS";
    else if (lower.includes("wage") || lower.includes("davis"))
      templateCode = "SAM_WAGE_DETERMINATION";
    else if (lower.includes("qa") || lower.includes("qc"))
      templateCode = "SAM_QA_QC";
    else if (lower.includes("site") || lower.includes("visit"))
      templateCode = "SAM_SITE_VISIT";
    else if (lower.includes("amendment") || lower.includes("mod"))
      templateCode = "SAM_AMENDMENTS";
    else if (lower.includes("zip") || lower.includes("package"))
      templateCode = "SAM_ATTACHMENTS_PACKAGE";
    else if (lower.includes("submission") || lower.includes("submit"))
      templateCode = "SAM_SUBMISSION_RULES";
    else if (lower.includes("security") || typeLower === "security")
      templateCode = "SAM_QA_QC";

    try {
      if (templateCode) {
        await db
          .update(bidJacketArtifacts)
          .set({
            sourceUrl: attachment.url,
            status: "ready",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(bidJacketArtifacts.bidProjectId, bidProjectId),
              eq(bidJacketArtifacts.templateCode, templateCode)
            )
          );
      }

      await db
        .insert(bidJacketArtifacts)
        .values({
          tenantId,
          bidProjectId,
          templateCode: null,
          title: title.substring(0, 200),
          sourceType: "highergov",
          sourceUrl: attachment.url,
          status: "ready",
        })
        .onConflictDoNothing();
      created++;
      seenUrls.add(attachment.url);
    } catch (e) {
    }
  }

  console.log(
    `[bid-jacket-artifacts] Ingested ${created} HigherGov attachments for bid project ${bidProjectId}`
  );
  return created;
}

export async function ingestSamAttachments(
  tenantId: string,
  bidProjectId: string,
  resourceLinks: string[],
  descriptionUrl?: string
): Promise<number> {
  let created = 0;

  for (const link of resourceLinks) {
    const filename = link.split("/").pop() || link;
    const title = decodeURIComponent(filename).replace(/[_-]/g, " ");

    let templateCode: string | null = null;
    const lower = filename.toLowerCase();
    if (lower.includes("solicitation") || lower.includes("notice"))
      templateCode = "SAM_SOLICITATION";
    else if (lower.includes("sow") || lower.includes("pws"))
      templateCode = "SAM_PWS_SOW";
    else if (lower.includes("drawing") || lower.includes("spec") || lower.includes("plan"))
      templateCode = "SAM_DRAWINGS_SPECS";
    else if (lower.includes("wage") || lower.includes("davis"))
      templateCode = "SAM_WAGE_DETERMINATION";
    else if (lower.includes("qa") || lower.includes("qc"))
      templateCode = "SAM_QA_QC";
    else if (lower.includes("site") || lower.includes("visit"))
      templateCode = "SAM_SITE_VISIT";
    else if (lower.includes("amendment") || lower.includes("mod"))
      templateCode = "SAM_AMENDMENTS";
    else if (lower.includes("zip") || lower.includes("package"))
      templateCode = "SAM_ATTACHMENTS_PACKAGE";
    else if (lower.includes("submission") || lower.includes("submit"))
      templateCode = "SAM_SUBMISSION_RULES";

    try {
      if (templateCode) {
        await db
          .update(bidJacketArtifacts)
          .set({
            sourceUrl: link,
            status: "ready",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(bidJacketArtifacts.bidProjectId, bidProjectId),
              eq(bidJacketArtifacts.templateCode, templateCode)
            )
          );
      }

      await db
        .insert(bidJacketArtifacts)
        .values({
          tenantId,
          bidProjectId,
          templateCode: null,
          title: title.substring(0, 200),
          sourceType: "samgov",
          sourceUrl: link,
          status: "ready",
        })
        .onConflictDoNothing();
      created++;
    } catch (e) {
    }
  }

  if (descriptionUrl) {
    try {
      await db
        .update(bidJacketArtifacts)
        .set({
          sourceUrl: descriptionUrl,
          status: "ready",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(bidJacketArtifacts.bidProjectId, bidProjectId),
            eq(bidJacketArtifacts.templateCode, "SAM_SOLICITATION")
          )
        );
      created++;
    } catch (e) {
    }
  }

  console.log(
    `[bid-jacket-artifacts] Ingested ${created} SAM attachments for bid project ${bidProjectId}`
  );
  return created;
}
